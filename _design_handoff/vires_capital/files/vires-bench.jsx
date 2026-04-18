// vires-bench.jsx — v2: editorial, disciplined
const BD = window.VIRES_DATA.bench;
const BS = window.VIRES_DATA.strategy;

function BenchHero() {
  const stats = [
    { label: 'Runs', value: BD.runs.length },
    { label: 'Succeeded', value: BD.runs.filter(r => r.status === 'SUCCEEDED').length },
    { label: 'Partial', value: BD.runs.filter(r => r.status === 'PARTIAL').length },
    { label: 'Promoted', value: 1 },
  ];
  return (
    <div className="vr-card-hero" style={{ padding: 22 }}>
      <div className="t-eyebrow" style={{ marginBottom: 10 }}>The Bench</div>
      <div className="t-h2" style={{ lineHeight: 1.25, maxWidth: 320, marginBottom: 14 }}>
        Where strategies <span className="t-accent">earn</span> capital.
      </div>
      <div className="t-read" style={{ fontSize: 12, maxWidth: 310 }}>
        Benchmark runs validate strategies through risk-aware participation across market eras. Only survivors promote to live allocation.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 20, borderTop: '1px solid var(--vr-line)', paddingTop: 14 }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{ padding: '0 10px', borderLeft: i > 0 ? '1px solid var(--vr-line)' : 'none' }}>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 5 }}>{s.label}</div>
            <div className="t-h1 t-num" style={{ fontSize: 24 }}>
              <AnimatedNumber value={s.value} format={(v) => Math.round(v).toString()} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturedStrategy({ onOpen }) {
  const p = BS.performance;
  const metrics = [
    { l: 'Total Return', v: `${p.totalReturn.toFixed(1)}%`, c: 'var(--vr-up)' },
    { l: 'vs Bench',     v: `+${p.excess.toFixed(1)}%`,      c: 'var(--vr-up)' },
    { l: 'Sharpe',       v: p.sharpe.toFixed(2),             c: 'var(--vr-cream)' },
    { l: 'Calmar',       v: p.calmar.toFixed(2),             c: 'var(--vr-gold)' },
    { l: 'Max DD',       v: `${p.maxDD.toFixed(2)}%`,        c: 'var(--vr-down)' },
    { l: 'Win Rate',     v: `${p.winRate.toFixed(1)}%`,      c: 'var(--vr-cream)' },
  ];
  return (
    <button
      onClick={() => onOpen && onOpen('ram_stop5_tgt15')}
      className="vr-card vr-clickable"
      style={{ padding: 18, borderColor: 'var(--vr-gold-line)', background: 'var(--vr-ink)', width: '100%', textAlign: 'left', cursor: 'pointer', display: 'block' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusPill tone="gold">Promoted</StatusPill>
          <SleeveChip sleeve="stocks" />
        </div>
        <span className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-gold)', display: 'flex', alignItems: 'center', gap: 4 }}>Passport <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.2"/></svg></span>
      </div>
      <div className="t-h3" style={{ marginTop: 6 }}>{BS.name}</div>
      <div className="t-label" style={{ fontSize: 11, marginTop: 3 }}>{BS.variant}</div>
      <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
        {BS.symbols.map(s => (
          <span key={s} className="t-ticker" style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(241,236,224,0.03)', border: '1px solid var(--vr-line)', borderRadius: 2, color: 'var(--vr-cream-dim)' }}>{s}</span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 16, borderTop: '1px solid var(--vr-line)' }}>
        {metrics.map((m, i) => (
          <div key={m.l} style={{
            padding: '10px 12px',
            borderLeft: i % 3 !== 0 ? '1px solid var(--vr-line)' : 'none',
            borderBottom: i < 3 ? '1px solid var(--vr-line)' : 'none',
          }}>
            <div className="t-eyebrow" style={{ fontSize: 9 }}>{m.l}</div>
            <div className="t-num" style={{ fontSize: 15, color: m.c, fontWeight: 500, marginTop: 4 }}>{m.v}</div>
          </div>
        ))}
      </div>
    </button>
  );
}

function RunCard({ run, onOpenRun }) {
  const sleeveMap = { STOCKS: 'stocks', CRYPTO: 'crypto', OPTIONS: 'options' };
  const sl = sleeveMap[run.sleeve] || 'stocks';
  const color = `var(--vr-sleeve-${sl})`;
  const pct = (run.evaluated / run.total) * 100;
  const toneMap = { SUCCEEDED: 'up', PARTIAL: 'warn', FAILED: 'down' };
  const hasDetail = !!(window.VIRES_DATA.bench.details && window.VIRES_DATA.bench.details[run.id]);

  return (
    <button
      onClick={hasDetail ? () => onOpenRun && onOpenRun(run.id) : undefined}
      className={'vr-card' + (hasDetail ? ' vr-clickable' : '')}
      style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--vr-ink)', textAlign: 'left', border: '1px solid var(--vr-line)', width: '100%', cursor: hasDetail ? 'pointer' : 'default', font: 'inherit', color: 'inherit' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <SleeveChip sleeve={sl} />
            <span className="t-eyebrow" style={{ color: 'var(--vr-cream-faint)' }}>· {run.role}</span>
          </div>
          <div className="t-h4" style={{ fontSize: 14, lineHeight: 1.3 }}>{run.title}</div>
        </div>
        <StatusPill tone={toneMap[run.status] || 'neutral'}>{run.status}</StatusPill>
      </div>
      <div className="t-read" style={{ fontSize: 11 }}>{run.hypothesis}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 2 }}>
        <div>
          <div className="t-eyebrow" style={{ fontSize: 9 }}>{run.metric}</div>
          <div className="t-num" style={{ fontSize: 18, color, fontWeight: 500, marginTop: 3, fontFamily: 'var(--ff-mono)' }}>{run.value.toFixed(4)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="t-eyebrow" style={{ fontSize: 9 }}>Evaluated</div>
          <div className="t-num" style={{ fontSize: 13, color: 'var(--vr-cream)', marginTop: 3 }}>
            {run.evaluated.toLocaleString()}
            <span style={{ color: 'var(--vr-cream-faint)' }}> / {run.total.toLocaleString()}</span>
          </div>
        </div>
      </div>
      <div style={{ height: 2, background: 'rgba(241,236,224,0.04)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 1s' }} />
      </div>
      {run.winner && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--vr-line)', paddingTop: 8 }}>
          <span className="t-eyebrow" style={{ fontSize: 9 }}>Winner</span>
          <span className="t-ticker" style={{ fontSize: 11, color: 'var(--vr-gold)', textTransform: 'none' }}>{run.winner}</span>
        </div>
      )}
      {hasDetail && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
          <span className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-cream-mute)', display: 'flex', alignItems: 'center', gap: 4 }}>View Run <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.2"/></svg></span>
        </div>
      )}
    </button>
  );
}

function Leaderboard({ onOpen }) {
  return (
    <div className="vr-card">
      <div style={{ padding: '14px 16px 10px' }}>
        <div className="t-eyebrow">Leaderboard · By Calmar</div>
        <div className="t-h4" style={{ marginTop: 3, fontSize: 14 }}>Regime-Aware Momentum · Variants</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 56px 48px 48px', gap: 8, padding: '8px 16px', fontSize: 9, color: 'var(--vr-cream-mute)', textTransform: 'uppercase', letterSpacing: '0.22em', borderTop: '1px solid var(--vr-line)', borderBottom: '1px solid var(--vr-line)' }}>
        <span>#</span><span>Variant</span><span style={{ textAlign: 'right' }}>Calmar</span><span style={{ textAlign: 'right' }}>Ret</span><span style={{ textAlign: 'right' }}>Shp</span>
      </div>
      <div className="vr-divide">
        {BD.leaderboard.slice(0, 5).map(row => (
          <button key={row.id} onClick={() => row.winner && onOpen && onOpen('ram_stop5_tgt15')} style={{
            display: 'grid', gridTemplateColumns: '24px 1fr 56px 48px 48px',
            gap: 8, padding: '11px 16px', alignItems: 'center',
            background: row.winner ? 'var(--vr-gold-soft)' : 'transparent',
            border: 'none', width: '100%', textAlign: 'left',
            cursor: row.winner ? 'pointer' : 'default',
            color: 'inherit', font: 'inherit',
          }}>
            <span className={row.winner ? 't-h3' : 't-num'} style={{
              fontSize: row.winner ? 16 : 11,
              color: row.winner ? 'var(--vr-gold)' : 'var(--vr-cream-mute)',
              fontStyle: row.winner ? 'italic' : 'normal',
              fontFamily: row.winner ? 'var(--ff-serif)' : 'var(--ff-mono)',
            }}>{row.rank}</span>
            <span className="t-ticker" style={{ fontSize: 10, textTransform: 'none', color: row.winner ? 'var(--vr-gold)' : 'var(--vr-cream-dim)' }}>{row.id}</span>
            <span className="t-num" style={{ fontSize: 12, color: 'var(--vr-cream)', textAlign: 'right', fontWeight: 500 }}>{row.primary.toFixed(3)}</span>
            <span className="t-num" style={{ fontSize: 11, color: 'var(--vr-up)', textAlign: 'right' }}>{row.ret.toFixed(1)}%</span>
            <span className="t-num" style={{ fontSize: 11, color: 'var(--vr-cream-dim)', textAlign: 'right' }}>{row.sharpe.toFixed(2)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BenchPage({ onOpenPassport, onOpenRun }) {
  const [filter, setFilter] = React.useState('ALL');
  const filtered = filter === 'ALL' ? BD.runs : BD.runs.filter(r => r.sleeve === filter);
  return (
    <div className="vr-screen" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <BenchHero />
      <SectionHeader eyebrow="Promoted" title="In production" />
      <FeaturedStrategy onOpen={onOpenPassport} />
      <Leaderboard onOpen={onOpenPassport} />
      <SectionHeader
        eyebrow="Research"
        title="Active runs"
        right={
          <div style={{ display: 'flex', gap: 2, padding: 2, background: 'rgba(241,236,224,0.02)', border: '1px solid var(--vr-line)', borderRadius: 3 }}>
            {['ALL', 'STOCKS', 'CRYPTO'].map(f => (
              <button key={f} onClick={() => setFilter(f)} className="t-eyebrow" style={{
                padding: '3px 7px', borderRadius: 2, border: 'none', cursor: 'pointer',
                background: filter === f ? 'var(--vr-gold)' : 'transparent',
                color: filter === f ? 'var(--vr-ink)' : 'var(--vr-cream-mute)',
                fontWeight: 600, fontSize: 9,
              }}>{f}</button>
            ))}
          </div>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(r => <RunCard key={r.id} run={r} onOpenRun={onOpenRun} />)}
      </div>
    </div>
  );
}

Object.assign(window, { BenchPage });
