// vires-passport.jsx — Strategy Passport detail view
const PASSPORTS = window.VIRES_DATA.passports;

// --- small primitives --------------------------------------------------------

function Metric({ label, value, delta, color, small }) {
  return (
    <div style={{ padding: small ? '10px 12px' : '14px 16px', minWidth: 0 }}>
      <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 6, color: 'var(--vr-cream-mute)' }}>{label}</div>
      <div className="t-num" style={{ fontSize: small ? 15 : 22, color: color || 'var(--vr-cream)', fontWeight: 500, lineHeight: 1 }}>{value}</div>
      {delta !== undefined && (
        <div className="t-num" style={{ fontSize: 10, color: 'var(--vr-cream-mute)', marginTop: 6, fontFamily: 'var(--ff-mono)' }}>
          vs bench <span style={{ color: delta.tone || 'var(--vr-cream-dim)' }}>{delta.label}</span>
        </div>
      )}
    </div>
  );
}

function GateRow({ gate }) {
  const toneMap = {
    PASS:    { dot: 'var(--vr-up)',        label: 'PASS',    labelColor: 'var(--vr-up)' },
    PENDING: { dot: 'var(--vr-gold)',      label: 'PENDING', labelColor: 'var(--vr-gold)' },
    WARN:    { dot: 'var(--vr-warn, #c9a96a)', label: 'WARN', labelColor: 'var(--vr-warn, #c9a96a)' },
    FAIL:    { dot: 'var(--vr-down)',      label: 'FAIL',    labelColor: 'var(--vr-down)' },
    BLOCKED: { dot: 'var(--vr-cream-faint)', label: 'BLOCKED', labelColor: 'var(--vr-cream-mute)' },
  };
  const t = toneMap[gate.status] || toneMap.PENDING;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '8px 1fr auto', gap: 12, alignItems: 'start', padding: '12px 16px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.dot, marginTop: 6 }} />
      <div>
        <div className="t-label" style={{ fontSize: 12, color: 'var(--vr-cream)', marginBottom: 3 }}>{gate.label}</div>
        <div className="t-read" style={{ fontSize: 11, color: 'var(--vr-cream-mute)', lineHeight: 1.45 }}>{gate.detail}</div>
      </div>
      <span className="t-eyebrow" style={{ fontSize: 9, color: t.labelColor, fontWeight: 600, whiteSpace: 'nowrap' }}>{t.label}</span>
    </div>
  );
}

// --- verdict strip -----------------------------------------------------------

function VerdictStrip({ p }) {
  const m = p.manifest;
  const stageMap = {
    PROMOTED: {
      eyebrow: 'Verdict',
      line: m.eligibility === 'LIVE' ? 'Promoted · Earning live capital' : 'Promoted · Paper shadow window',
      tone: 'gold',
    },
    STRONG_NOT_PROMOTED: {
      eyebrow: 'Verdict',
      line: 'Strong — governance gate holds',
      tone: 'cream',
    },
    FALLBACK: {
      eyebrow: 'Verdict',
      line: 'Running on fallback manifest',
      tone: 'warn',
    },
  };
  const v = stageMap[m.stage] || stageMap.STRONG_NOT_PROMOTED;
  const accent = v.tone === 'gold' ? 'var(--vr-gold)' : v.tone === 'warn' ? 'var(--vr-warn, #c9a96a)' : 'var(--vr-cream-dim)';
  const provenanceWarn = m.provenance !== 'CHECKED_IN';

  return (
    <div className="vr-card" style={{ borderLeft: `2px solid ${accent}` }}>
      <div style={{ padding: '16px 18px' }}>
        <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 8, color: accent }}>{v.eyebrow}</div>
        <div className="t-h3" style={{ fontSize: 20, fontStyle: 'italic', color: 'var(--vr-cream)', lineHeight: 1.25 }}>
          {v.line}
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--vr-line)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        <div style={{ padding: '12px 18px', borderRight: '1px solid var(--vr-line)' }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 5 }}>Eligibility</div>
          <div className="t-label" style={{ fontSize: 11, color: 'var(--vr-cream)', letterSpacing: '0.04em' }}>
            {m.eligibility === 'LIVE' && <span style={{ color: 'var(--vr-up)' }}>● LIVE</span>}
            {m.eligibility === 'PAPER_SHADOW' && <span style={{ color: 'var(--vr-gold)' }}>◐ PAPER · day {m.shadowDays}/{m.shadowTarget}</span>}
            {m.eligibility === 'BENCH_ONLY' && <span style={{ color: 'var(--vr-cream-mute)' }}>○ BENCH ONLY</span>}
          </div>
        </div>
        <div style={{ padding: '12px 18px' }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 5 }}>Manifest</div>
          <div className="t-ticker" style={{ fontSize: 10, color: provenanceWarn ? 'var(--vr-warn, #c9a96a)' : 'var(--vr-cream-dim)', letterSpacing: '0.06em', textTransform: 'none' }}>
            {provenanceWarn && '⚠ '}{m.provenance.toLowerCase().replace(/_/g, ' ')}
          </div>
        </div>
      </div>
      {provenanceWarn && (
        <div style={{ borderTop: '1px solid var(--vr-line)', padding: '10px 18px', background: 'rgba(201,169,106,0.04)' }}>
          <div className="t-read" style={{ fontSize: 11, color: 'var(--vr-cream-mute)', lineHeight: 1.5 }}>
            This strategy is running against a <span style={{ fontFamily: 'var(--ff-mono)', color: 'var(--vr-warn, #c9a96a)' }}>strategy_bank_fallback</span>, not a checked-in promotion. Evidence below reflects the fallback configuration.
          </div>
        </div>
      )}
    </div>
  );
}

// --- era-split robustness viz ------------------------------------------------

function EraStripe({ eras, minEraSharpe }) {
  const maxSharpe = Math.max(...eras.map(e => e.sharpe), 1);
  const floor = 0.5;
  return (
    <div className="vr-card">
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--vr-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div className="t-eyebrow" style={{ fontSize: 9 }}>Era Robustness</div>
          <div className="t-label" style={{ fontSize: 12, color: 'var(--vr-cream)', marginTop: 4 }}>Sharpe by regime window</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="t-eyebrow" style={{ fontSize: 9 }}>Min era Sharpe</div>
          <div className="t-num" style={{ fontSize: 15, color: minEraSharpe >= floor ? 'var(--vr-cream)' : 'var(--vr-warn, #c9a96a)', marginTop: 4 }}>{minEraSharpe.toFixed(2)}</div>
        </div>
      </div>
      <div style={{ padding: '18px 18px 10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${eras.length}, 1fr)`, gap: 6, alignItems: 'end', height: 92, position: 'relative' }}>
          {/* floor line */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(floor / maxSharpe) * 100}%`, height: 1, background: 'rgba(241,236,224,0.08)', borderTop: '1px dashed rgba(241,236,224,0.1)' }} />
          {eras.map((e) => {
            const h = Math.max(4, (e.sharpe / maxSharpe) * 100);
            const warn = e.sharpe < floor;
            return (
              <div key={e.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                <div className="t-num" style={{ fontSize: 9, color: warn ? 'var(--vr-warn, #c9a96a)' : 'var(--vr-cream-dim)', marginBottom: 4 }}>{e.sharpe.toFixed(2)}</div>
                <div style={{ width: '100%', height: `${h}%`, background: warn ? 'linear-gradient(to top, rgba(201,169,106,0.35), rgba(201,169,106,0.15))' : 'linear-gradient(to top, rgba(200,155,60,0.55), rgba(200,155,60,0.18))', borderTop: `1px solid ${warn ? 'var(--vr-warn, #c9a96a)' : 'var(--vr-gold)'}` }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${eras.length}, 1fr)`, gap: 6, marginTop: 10 }}>
          {eras.map(e => (
            <div key={e.label} className="t-eyebrow" style={{ fontSize: 8, textAlign: 'center', color: 'var(--vr-cream-faint)' }}>{e.label}</div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--vr-line)' }}>
          <div className="t-read" style={{ fontSize: 10, color: 'var(--vr-cream-mute)', fontStyle: 'italic' }}>
            Dashed line: 0.50 era-floor
          </div>
          <div className="t-read" style={{ fontSize: 10, color: 'var(--vr-cream-mute)' }}>
            {eras.filter(e => e.sharpe >= floor).length}/{eras.length} above floor
          </div>
        </div>
      </div>
    </div>
  );
}

// --- assumptions -------------------------------------------------------------

function Assumptions({ a }) {
  const rows = [
    { label: 'Commission',   v: `${a.commissionBps.toFixed(1)} bps` },
    { label: 'Slippage',     v: `${a.slippageBps.toFixed(1)} bps` },
    { label: 'Fee model',    v: a.feeModel },
    { label: 'Data source',  v: a.dataSource },
    { label: 'Entry bar',    v: a.entryBar },
    { label: 'Fill policy',  v: a.fillPolicy },
  ];
  return (
    <div className="vr-card">
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--vr-line)' }}>
        <div className="t-eyebrow" style={{ fontSize: 9 }}>Assumptions</div>
        <div className="t-label" style={{ fontSize: 12, color: 'var(--vr-cream)', marginTop: 4 }}>Costs & execution baked into the run</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{
            padding: '11px 18px',
            borderRight: i % 2 === 0 ? '1px solid var(--vr-line)' : 'none',
            borderBottom: i < rows.length - 2 ? '1px solid var(--vr-line)' : 'none',
          }}>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>{r.label}</div>
            <div className="t-num" style={{ fontSize: 12, color: 'var(--vr-cream)', fontFamily: 'var(--ff-mono)' }}>{r.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- future slot -------------------------------------------------------------

function FutureSlot({ title, note }) {
  return (
    <div className="vr-card" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--vr-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div className="t-eyebrow" style={{ fontSize: 9 }}>{title}</div>
          <div className="t-label" style={{ fontSize: 12, color: 'var(--vr-cream-mute)', marginTop: 4 }}>Awaiting feed</div>
        </div>
        <span className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-cream-faint)', letterSpacing: '0.2em' }}>NOT YET WIRED</span>
      </div>
      <div style={{ padding: '22px 18px', position: 'relative', minHeight: 120 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 6px, rgba(241,236,224,0.015) 6px 7px)',
          pointerEvents: 'none',
        }} />
        <div className="t-read" style={{ fontSize: 11, color: 'var(--vr-cream-mute)', maxWidth: 340, position: 'relative', lineHeight: 1.55 }}>
          {note}
        </div>
      </div>
    </div>
  );
}

// --- main passport -----------------------------------------------------------

function PassportPage({ id, onBack, onOpenLifecycle }) {
  const p = PASSPORTS.find(x => x.id === id) || PASSPORTS[0];
  const m = p.metrics;
  const sleeveMap = { STOCKS: 'stocks', CRYPTO: 'crypto', OPTIONS: 'options' };
  const sl = sleeveMap[p.sleeve] || 'stocks';

  const deltaColor = (v, good = true) => {
    if (v > 0) return good ? 'var(--vr-up)' : 'var(--vr-down)';
    if (v < 0) return good ? 'var(--vr-down)' : 'var(--vr-up)';
    return 'var(--vr-cream-dim)';
  };

  const fmtDelta = (v, suffix = '') => `${v >= 0 ? '+' : ''}${v.toFixed(2)}${suffix}`;

  return (
    <div className="vr-screen" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Back */}
      <button onClick={onBack} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6, color: 'var(--vr-cream-mute)',
        alignSelf: 'flex-start',
      }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M6.5 2L3 5L6.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        <span className="t-eyebrow" style={{ fontSize: 9 }}>Back to Bench</span>
      </button>

      {/* Identity */}
      <div style={{ padding: '4px 2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <SleeveChip sleeve={sl} />
          <span className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-cream-faint)' }}>· Strategy Passport</span>
        </div>
        <div className="t-h1" style={{ fontSize: 30, lineHeight: 1.1, letterSpacing: '-0.01em' }}>
          {p.name}
        </div>
        <div className="t-label" style={{ fontSize: 12, color: 'var(--vr-cream-mute)', marginTop: 6, letterSpacing: '0.06em' }}>{p.variant}</div>
        <div className="t-read" style={{ fontSize: 12, color: 'var(--vr-cream-dim)', marginTop: 10, maxWidth: 420, lineHeight: 1.55 }}>
          {p.summary}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
          <div>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Benchmark</div>
            <div className="t-ticker" style={{ fontSize: 12, color: 'var(--vr-cream)', textTransform: 'none' }}>{p.benchmark}</div>
          </div>
          <div style={{ borderLeft: '1px solid var(--vr-line)', paddingLeft: 16 }}>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Window</div>
            <div className="t-num" style={{ fontSize: 12, color: 'var(--vr-cream)' }}>{m.days} days</div>
          </div>
          <div style={{ borderLeft: '1px solid var(--vr-line)', paddingLeft: 16 }}>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Trades</div>
            <div className="t-num" style={{ fontSize: 12, color: 'var(--vr-cream)' }}>{m.trades}</div>
          </div>
        </div>
      </div>

      {/* Verdict */}
      <VerdictStrip p={p} />

      {/* Lifecycle (compact) */}
      {p.lifecycle && (
        <CompactLifecycle
          lifecycle={p.lifecycle}
          onExpand={onOpenLifecycle ? () => onOpenLifecycle(p.id) : null}
        />
      )}

      {/* Primary metrics — return + risk-adjusted */}
      <SectionHeader eyebrow="Evidence" title="Risk-adjusted performance" />
      <div className="vr-card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div style={{ borderRight: '1px solid var(--vr-line)' }}>
            <Metric
              label="Total Return"
              value={`${m.totalReturn.toFixed(1)}%`}
              color={m.totalReturn >= 0 ? 'var(--vr-up)' : 'var(--vr-down)'}
              delta={{ label: fmtDelta(m.excess, '%'), tone: deltaColor(m.excess) }}
            />
          </div>
          <div style={{ borderRight: '1px solid var(--vr-line)' }}>
            <Metric
              label="Sharpe"
              value={m.sharpe.toFixed(2)}
              color="var(--vr-cream)"
              delta={{ label: fmtDelta(m.sharpeDelta), tone: deltaColor(m.sharpeDelta) }}
            />
          </div>
          <Metric
            label="Calmar"
            value={m.calmar.toFixed(2)}
            color="var(--vr-gold)"
            delta={{ label: fmtDelta(m.calmarDelta), tone: deltaColor(m.calmarDelta) }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid var(--vr-line)' }}>
          <div style={{ borderRight: '1px solid var(--vr-line)' }}>
            <Metric
              small
              label="Max Drawdown"
              value={`${m.maxDD.toFixed(2)}%`}
              color="var(--vr-down)"
              delta={{ label: fmtDelta(m.ddDelta, '%'), tone: deltaColor(m.ddDelta) }}
            />
          </div>
          <div style={{ borderRight: '1px solid var(--vr-line)' }}>
            <Metric small label="Profit Factor" value={m.profitFactor.toFixed(2)} color="var(--vr-cream)" />
          </div>
          <Metric small label="Win Rate" value={`${m.winRate.toFixed(1)}%`} color="var(--vr-cream)" />
        </div>
      </div>

      {/* Era robustness */}
      <EraStripe eras={p.eras} minEraSharpe={p.minEraSharpe} />

      {/* Gates */}
      <SectionHeader eyebrow="Governance" title="Promotion gates" />
      <div className="vr-card">
        <div className="vr-divide">
          {p.gates.map((g, i) => <GateRow key={i} gate={g} />)}
        </div>
      </div>

      {/* Assumptions */}
      <Assumptions a={p.assumptions} />

      {/* Future slot */}
      <SectionHeader eyebrow="Future" title="Sleeve equity history" />
      <FutureSlot
        title="Sleeve Equity History"
        note="Per-sleeve equity curve will render here once sleeve_equity_history is wired. This panel will show this strategy's deployed capital over time, side-by-side with its benchmark, so you can watch paper and live performance diverge from bench expectation."
      />
    </div>
  );
}

Object.assign(window, { PassportPage });
