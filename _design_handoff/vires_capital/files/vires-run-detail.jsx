// vires-run-detail.jsx — Bench Run Detail / Compare View
const RD_DATA = window.VIRES_DATA.bench;

// --- small primitives --------------------------------------------------------

function EraSpark({ eras, floor = 0.5, benchEras, width = 64, height = 14 }) {
  const all = [...eras, ...(benchEras || [])];
  const max = Math.max(...all.map(Math.abs), 1);
  const step = width / eras.length;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* floor line */}
      <line x1="0" x2={width} y1={height - (floor / max) * height} y2={height - (floor / max) * height}
        stroke="rgba(241,236,224,0.12)" strokeDasharray="1 2" strokeWidth="0.5" />
      {eras.map((s, i) => {
        const h = Math.max(1.5, (Math.abs(s) / max) * height);
        const warn = s < floor;
        return (
          <rect
            key={i}
            x={i * step + 1}
            y={height - h}
            width={Math.max(2, step - 2)}
            height={h}
            fill={warn ? 'var(--vr-warn)' : 'var(--vr-gold)'}
            opacity={warn ? 0.55 : 0.75}
          />
        );
      })}
    </svg>
  );
}

function MiniDelta({ v, suffix = '', invert = false, mono = true }) {
  const good = invert ? v < 0 : v > 0;
  const neutral = v === 0;
  const color = neutral ? 'var(--vr-cream-mute)' : good ? 'var(--vr-up)' : 'var(--vr-down)';
  const sign = v > 0 ? '+' : '';
  return (
    <span style={{ fontSize: 10, color, fontFamily: mono ? 'var(--ff-mono)' : undefined, letterSpacing: '0.02em' }}>
      {sign}{v.toFixed(2)}{suffix}
    </span>
  );
}

function PlateauBadge({ status }) {
  const map = {
    STABLE:   { label: 'STABLE',   color: 'var(--vr-cream-dim)' },
    UNSTABLE: { label: 'UNSTABLE', color: 'var(--vr-warn)' },
    UNKNOWN:  { label: 'UNKNOWN',  color: 'var(--vr-cream-faint)' },
    'N/A':    { label: '—',         color: 'var(--vr-cream-faint)' },
  };
  const m = map[status] || map.UNKNOWN;
  return (
    <span className="t-eyebrow" style={{ fontSize: 8, color: m.color, letterSpacing: '0.18em' }}>{m.label}</span>
  );
}

// --- candidate row -----------------------------------------------------------

function CandidateRow({ c, bench, benchmarkName, isBench, truncated }) {
  const retDelta = isBench ? 0 : c.ret - bench.ret;
  const sharpeDelta = isBench ? 0 : c.sharpe - bench.sharpe;
  const calmarDelta = isBench ? 0 : c.calmar - bench.calmar;
  const ddDelta = isBench ? 0 : c.maxDD - bench.maxDD; // higher (less negative) is better

  const rowBg = c.winner
    ? 'var(--vr-gold-soft)'
    : isBench
      ? 'rgba(241,236,224,0.015)'
      : 'transparent';

  const dim = c.rejected ? 0.5 : 1;
  const winnerStripe = c.winner ? '2px solid var(--vr-gold)' : c.provisional ? '2px solid var(--vr-warn)' : isBench ? '2px solid var(--vr-cream-faint)' : '2px solid transparent';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr',
      padding: '12px 14px 12px 12px',
      background: rowBg,
      borderLeft: winnerStripe,
      opacity: dim,
    }}>
      {/* top row: name + passes */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            {isBench && <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-cream-faint)', letterSpacing: '0.22em' }}>BENCHMARK</span>}
            {c.winner && <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-gold)', letterSpacing: '0.22em' }}>★ WINNER</span>}
            {c.provisional && <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-warn)', letterSpacing: '0.22em' }}>PROVISIONAL</span>}
            {c.rejected && <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-cream-faint)', letterSpacing: '0.22em' }}>REJECTED</span>}
          </div>
          <div className="t-ticker" style={{
            fontSize: 11,
            color: c.winner ? 'var(--vr-gold)' : isBench ? 'var(--vr-cream)' : 'var(--vr-cream-dim)',
            textTransform: 'none',
            letterSpacing: '0.02em',
            fontFamily: isBench ? 'var(--ff-sans)' : 'var(--ff-mono)',
            fontStyle: isBench ? 'italic' : 'normal',
          }}>
            {isBench ? benchmarkName : c.id}
          </div>
          {!isBench && (
            <div className="t-read" style={{ fontSize: 10, color: 'var(--vr-cream-mute)', marginTop: 2 }}>{c.label}</div>
          )}
        </div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          {!isBench && (
            <>
              <div className="t-num" style={{ fontSize: 11, color: c.passes === c.gates ? 'var(--vr-up)' : c.passes > c.gates / 2 ? 'var(--vr-warn)' : 'var(--vr-down)', fontFamily: 'var(--ff-mono)' }}>
                {c.passes}/{c.gates}
              </div>
              <div className="t-eyebrow" style={{ fontSize: 8, marginTop: 2 }}>gates</div>
            </>
          )}
        </div>
      </div>

      {/* metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, alignItems: 'baseline' }}>
        <div>
          <div className="t-eyebrow" style={{ fontSize: 8 }}>Ret</div>
          <div className="t-num" style={{ fontSize: 13, color: c.ret >= 0 ? 'var(--vr-up)' : 'var(--vr-down)', marginTop: 2 }}>{c.ret.toFixed(1)}%</div>
          {!isBench && <MiniDelta v={retDelta} suffix="%" />}
        </div>
        <div>
          <div className="t-eyebrow" style={{ fontSize: 8 }}>Sharpe</div>
          <div className="t-num" style={{ fontSize: 13, color: 'var(--vr-cream)', marginTop: 2 }}>{c.sharpe.toFixed(2)}</div>
          {!isBench && <MiniDelta v={sharpeDelta} />}
        </div>
        <div>
          <div className="t-eyebrow" style={{ fontSize: 8 }}>Calmar</div>
          <div className="t-num" style={{ fontSize: 13, color: c.winner ? 'var(--vr-gold)' : 'var(--vr-cream)', marginTop: 2 }}>{c.calmar.toFixed(2)}</div>
          {!isBench && <MiniDelta v={calmarDelta} />}
        </div>
        <div>
          <div className="t-eyebrow" style={{ fontSize: 8 }}>Max DD</div>
          <div className="t-num" style={{ fontSize: 13, color: 'var(--vr-down)', marginTop: 2 }}>{c.maxDD.toFixed(1)}%</div>
          {!isBench && <MiniDelta v={ddDelta} suffix="%" />}
        </div>
      </div>

      {/* era stripe + plateau */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--vr-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <EraSpark eras={c.eras} />
          <span className="t-eyebrow" style={{ fontSize: 8 }}>eras</span>
        </div>
        {!isBench && <PlateauBadge status={c.plateau} />}
      </div>

      {c.note && (
        <div className="t-read" style={{ fontSize: 10, color: 'var(--vr-cream-mute)', marginTop: 8, fontStyle: 'italic', lineHeight: 1.45 }}>
          {c.note}
        </div>
      )}
    </div>
  );
}

// --- delta scatter -----------------------------------------------------------

function DeltaScatter({ candidates, bench }) {
  const W = 290, H = 180, PAD = 28;
  const xVals = candidates.map(c => c.sharpe - bench.sharpe);
  const yVals = candidates.map(c => c.ret - bench.ret);
  const xMin = Math.min(-0.1, ...xVals), xMax = Math.max(0.1, ...xVals);
  const yMin = Math.min(-5, ...yVals), yMax = Math.max(5, ...yVals);
  const xRange = xMax - xMin, yRange = yMax - yMin;
  const xScale = (v) => PAD + ((v - xMin) / xRange) * (W - PAD * 2);
  const yScale = (v) => H - PAD - ((v - yMin) / yRange) * (H - PAD * 2);
  const x0 = xScale(0), y0 = yScale(0);

  return (
    <div className="vr-card">
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--vr-line)' }}>
        <div className="t-eyebrow" style={{ fontSize: 9 }}>Benchmark-Relative</div>
        <div className="t-label" style={{ fontSize: 12, color: 'var(--vr-cream)', marginTop: 4 }}>Each candidate vs. the bench</div>
      </div>
      <div style={{ padding: '14px 4px' }}>
        <svg width={W} height={H} style={{ display: 'block', margin: '0 auto' }}>
          {/* quadrant backgrounds — top-right (good both) faint gold */}
          <rect x={x0} y={PAD} width={W - PAD - x0} height={y0 - PAD} fill="var(--vr-gold-soft)" opacity="0.6" />
          <rect x={PAD} y={y0} width={x0 - PAD} height={H - PAD - y0} fill="rgba(201,122,122,0.04)" />

          {/* axes */}
          <line x1={PAD} x2={W - PAD} y1={y0} y2={y0} stroke="rgba(241,236,224,0.1)" strokeWidth="0.5" />
          <line x1={x0} x2={x0} y1={PAD} y2={H - PAD} stroke="rgba(241,236,224,0.1)" strokeWidth="0.5" />

          {/* axis labels */}
          <text x={W - PAD} y={y0 - 4} fontSize="8" fill="var(--vr-cream-mute)" textAnchor="end" fontFamily="var(--ff-mono)">Δ SHARPE →</text>
          <text x={x0 + 4} y={PAD + 8} fontSize="8" fill="var(--vr-cream-mute)" fontFamily="var(--ff-mono)">↑ Δ RET %</text>

          {/* bench origin crosshair */}
          <circle cx={x0} cy={y0} r="3" fill="none" stroke="var(--vr-cream-faint)" strokeWidth="0.8" />
          <text x={x0 + 6} y={y0 + 10} fontSize="7" fill="var(--vr-cream-faint)" fontFamily="var(--ff-mono)">bench</text>

          {/* candidate dots */}
          {candidates.map((c, i) => {
            const cx = xScale(c.sharpe - bench.sharpe);
            const cy = yScale(c.ret - bench.ret);
            const fill = c.winner ? 'var(--vr-gold)' : c.provisional ? 'var(--vr-warn)' : c.rejected ? 'var(--vr-cream-faint)' : 'var(--vr-cream-dim)';
            const r = c.winner ? 4 : 3;
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={r} fill={fill} opacity={c.rejected ? 0.4 : 0.9} />
                {c.winner && <circle cx={cx} cy={cy} r={7} fill="none" stroke="var(--vr-gold)" strokeWidth="0.8" opacity="0.5" />}
              </g>
            );
          })}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
          <LegendDot color="var(--vr-gold)" label="Winner" />
          <LegendDot color="var(--vr-cream-dim)" label="Passed" />
          <LegendDot color="var(--vr-cream-faint)" label="Rejected" />
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span className="t-eyebrow" style={{ fontSize: 8 }}>{label}</span>
    </span>
  );
}

// --- reject rules panel ------------------------------------------------------

function RejectRules({ rules }) {
  return (
    <div className="vr-card">
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--vr-line)' }}>
        <div className="t-eyebrow" style={{ fontSize: 9 }}>Hard-Reject Gates</div>
        <div className="t-label" style={{ fontSize: 12, color: 'var(--vr-cream)', marginTop: 4 }}>How many candidates cleared each</div>
      </div>
      <div className="vr-divide">
        {rules.map((r) => {
          const pct = (r.cleared / r.total) * 100;
          return (
            <div key={r.label} style={{ padding: '12px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <div className="t-label" style={{ fontSize: 11, color: 'var(--vr-cream)' }}>{r.label}</div>
                <div className="t-num" style={{ fontSize: 11, color: 'var(--vr-cream-dim)', fontFamily: 'var(--ff-mono)' }}>
                  {r.cleared.toLocaleString()} <span style={{ color: 'var(--vr-cream-faint)' }}>/ {r.total.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ height: 2, background: 'rgba(241,236,224,0.04)' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct > 20 ? 'var(--vr-gold)' : 'var(--vr-warn)' }} />
              </div>
              {r.note && (
                <div className="t-read" style={{ fontSize: 10, color: 'var(--vr-cream-mute)', marginTop: 6, fontStyle: 'italic' }}>{r.note}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- run detail page ---------------------------------------------------------

function RunDetailPage({ id, onBack, onOpenPassport }) {
  const run = RD_DATA.runs.find(r => r.id === id);
  const detail = RD_DATA.details[id];
  if (!run || !detail) {
    return (
      <div className="vr-screen" style={{ padding: 16 }}>
        <button onClick={onBack} className="t-eyebrow" style={{ background: 'none', border: 'none', color: 'var(--vr-cream-mute)', cursor: 'pointer' }}>← Back</button>
        <div className="t-read" style={{ marginTop: 20 }}>Run detail not found.</div>
      </div>
    );
  }

  const sleeveMap = { STOCKS: 'stocks', CRYPTO: 'crypto', OPTIONS: 'options' };
  const sl = sleeveMap[run.sleeve] || 'stocks';
  const [showRejected, setShowRejected] = React.useState(false);

  const visible = detail.candidates.filter(c => !c.rejected);
  const rejected = detail.candidates.filter(c => c.rejected);
  const winner = detail.candidates.find(c => c.winner);
  const passportMap = {
    stop_5_target_15: 'ram_stop5_tgt15',
    'grid-00193': 'btc_4h_tsmom_grid193',
    GRADUATED_CORE_PLUS_TACTICAL: 'btc_managed_core_regime',
    GRADUATED_CORE_REGIME: 'btc_managed_core_regime',
  };
  const winnerPassport = winner && passportMap[winner.id];

  const statusTone = { SUCCEEDED: 'up', PARTIAL: 'warn', FAILED: 'down' };

  const coveragePct = (run.evaluated / run.total) * 100;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <SleeveChip sleeve={sl} />
          <span className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-cream-faint)' }}>· {run.role} run</span>
          <StatusPill tone={statusTone[run.status] || 'neutral'}>{run.status}</StatusPill>
        </div>
        <div className="t-h2" style={{ fontSize: 24, lineHeight: 1.2 }}>{run.title}</div>
        <div className="t-read" style={{ fontSize: 12, color: 'var(--vr-cream-dim)', marginTop: 10, maxWidth: 420, lineHeight: 1.55 }}>
          {run.hypothesis}
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 14, borderTop: '1px solid var(--vr-line)', paddingTop: 12 }}>
          <div>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Benchmark</div>
            <div className="t-ticker" style={{ fontSize: 12, color: 'var(--vr-cream)', textTransform: 'none' }}>{detail.benchmarkName}</div>
          </div>
          <div style={{ borderLeft: '1px solid var(--vr-line)', paddingLeft: 16 }}>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Evaluated</div>
            <div className="t-num" style={{ fontSize: 12, color: run.status === 'PARTIAL' ? 'var(--vr-warn)' : 'var(--vr-cream)' }}>
              {run.evaluated.toLocaleString()} <span style={{ color: 'var(--vr-cream-faint)' }}>/ {run.total.toLocaleString()}</span>
            </div>
          </div>
          <div style={{ borderLeft: '1px solid var(--vr-line)', paddingLeft: 16 }}>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Coverage</div>
            <div className="t-num" style={{ fontSize: 12, color: coveragePct < 50 ? 'var(--vr-warn)' : 'var(--vr-cream)' }}>
              {coveragePct < 10 ? coveragePct.toFixed(1) : coveragePct.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>

      {/* Interpretation */}
      <div className="vr-card" style={{ padding: '16px 18px', borderLeft: `2px solid ${detail.truncated ? 'var(--vr-warn)' : 'var(--vr-gold)'}` }}>
        <div className="t-eyebrow" style={{ fontSize: 9, color: detail.truncated ? 'var(--vr-warn)' : 'var(--vr-gold)', marginBottom: 8 }}>Interpretation</div>
        <div className="t-h3" style={{ fontSize: 16, fontStyle: 'italic', color: 'var(--vr-cream)', lineHeight: 1.45, letterSpacing: '-0.005em' }}>
          {detail.interpretation}
        </div>
      </div>

      {/* Comparison */}
      <SectionHeader eyebrow="Comparison" title={`${visible.length + 1} candidates vs. benchmark`} />
      <div className="vr-card" style={{ overflow: 'hidden' }}>
        <div className="vr-divide">
          {/* Benchmark as first row */}
          <CandidateRow
            c={{ ...detail.benchmark, ret: detail.benchmark.ret, label: 'benchmark' }}
            bench={detail.benchmark}
            benchmarkName={detail.benchmarkName}
            isBench
          />
          {visible.map(c => (
            <CandidateRow
              key={c.id}
              c={c}
              bench={detail.benchmark}
              benchmarkName={detail.benchmarkName}
              truncated={detail.truncated}
            />
          ))}
          {rejected.length > 0 && (
            <div>
              <button
                onClick={() => setShowRejected(s => !s)}
                style={{
                  width: '100%', padding: '12px 14px', background: 'transparent', border: 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  cursor: 'pointer', color: 'var(--vr-cream-mute)',
                }}
              >
                <span className="t-eyebrow" style={{ fontSize: 9 }}>
                  Rejected · {rejected.length} candidate{rejected.length !== 1 ? 's' : ''}
                </span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: showRejected ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </button>
              {showRejected && (
                <div className="vr-divide" style={{ borderTop: '1px solid var(--vr-line)' }}>
                  {rejected.map(c => (
                    <CandidateRow
                      key={c.id}
                      c={c}
                      bench={detail.benchmark}
                      benchmarkName={detail.benchmarkName}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Winner passport CTA */}
      {winner && winnerPassport && (
        <button
          onClick={() => onOpenPassport && onOpenPassport(winnerPassport)}
          className="vr-card vr-clickable"
          style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--vr-gold-soft)', borderColor: 'var(--vr-gold-line)', cursor: 'pointer', width: '100%', textAlign: 'left' }}
        >
          <div>
            <div className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-gold)', marginBottom: 4 }}>Winner</div>
            <div className="t-label" style={{ fontSize: 12, color: 'var(--vr-cream)' }}>Open Strategy Passport</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 2L8 6L3 10" stroke="var(--vr-gold)" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </button>
      )}

      {/* Delta scatter */}
      <DeltaScatter candidates={detail.candidates} bench={detail.benchmark} />

      {/* Reject rules */}
      <RejectRules rules={detail.rejectRules} />
    </div>
  );
}

Object.assign(window, { RunDetailPage });
