// vires-shared.jsx — v2 primitives

// ─── Formatting ─────────────────────────────────────────────────
const fmtCurrency = (n, opts = {}) => {
  const { sign = false, compact = false, digits = 2 } = opts;
  const abs = Math.abs(n);
  const signChar = n > 0 ? (sign ? '+' : '') : n < 0 ? '−' : '';
  let body;
  if (compact && abs >= 1000) {
    if (abs >= 1_000_000) body = `${(abs / 1_000_000).toFixed(2)}M`;
    else body = `${(abs / 1000).toFixed(1)}K`;
  } else {
    body = abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  return `${signChar}$${body}`;
};
const fmtPct = (n, opts = {}) => {
  const { sign = false, digits = 2 } = opts;
  const signChar = n > 0 ? (sign ? '+' : '') : n < 0 ? '−' : '';
  return `${signChar}${Math.abs(n).toFixed(digits)}%`;
};
const fmtNum = (n, digits = 2) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const toneOf = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');
const toneColor = (t) => t === 'up' ? 'var(--vr-up)' : t === 'down' ? 'var(--vr-down)' : 'var(--vr-cream-mute)';

// ─── Animated number ───────────────────────────────────────────
function AnimatedNumber({ value, format = fmtNum, duration = 700 }) {
  const [d, setD] = React.useState(value);
  const prev = React.useRef(value);
  React.useEffect(() => {
    const start = prev.current, end = value, t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setD(start + (end - start) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className="t-num">{format(d)}</span>;
}

// ─── Equity Display — financial-statement typography ──────────
function EquityDisplay({ value, size = 44 }) {
  // tween the number
  const [d, setD] = React.useState(value);
  const prev = React.useRef(value);
  React.useEffect(() => {
    const start = prev.current, end = value, t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / 700);
      const e = 1 - Math.pow(1 - p, 3);
      setD(start + (end - start) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const abs = Math.abs(d);
  const whole = Math.floor(abs);
  const cents = Math.round((abs - whole) * 100).toString().padStart(2, '0');
  const wholeFmt = whole.toLocaleString('en-US');
  return (
    <span className="t-equity" style={{ fontSize: size }}>
      <span className="dollar">$</span>
      <span className="whole">{wholeFmt}</span>
      <span className="sep">.</span>
      <span className="cents">{cents}</span>
    </span>
  );
}

// ─── Orbital flourish — decorative, hero-only ─────────────────
function OrbitRing({ size = 260, offsetX = -40, offsetY = -40 }) {
  return (
    <div className="orbit-ring" style={{
      width: size, height: size,
      top: offsetY, right: offsetX,
    }}>
      <div className="orbit-spin" style={{ width: '100%', height: '100%', position: 'relative' }}>
        <div className="orbit-node" />
      </div>
    </div>
  );
}

// ─── Starfield — subtle drifting particles ────────────────────
// Renders via portal into #app-frame so it fills the phone frame
// behind all content (parallax-style, doesn't scroll).
function Starfield({ count = 40, seed = 1 }) {
  const stars = React.useMemo(() => {
    let s = seed;
    const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    return Array.from({ length: count }, () => ({
      left: `${rand() * 100}%`,
      top: `${rand() * 100}%`,
      size: rand() > 0.9 ? 1.8 : rand() > 0.5 ? 1.1 : 0.7,
      driftX: (rand() - 0.5) * 14,
      driftY: (rand() - 0.5) * 14,
      driftDur: 90 + rand() * 80,
      twinkleDur: 3 + rand() * 5,
      twinkleDelay: rand() * 8,
      min: 0.06 + rand() * 0.12,
      max: 0.3 + rand() * 0.4,
      hue: rand() > 0.85 ? 'gold' : 'cream',
    }));
  }, [count, seed]);

  const host = typeof document !== 'undefined' ? document.getElementById('app-frame') : null;
  if (!host) return null;

  return ReactDOM.createPortal(
    <div className="orbit-field">
      {/* Distant nebula wash */}
      <div className="orbit-nebula" />
      {stars.map((s, i) => (
        <span key={i} className={`star star-${s.hue}`} style={{
          left: s.left, top: s.top,
          width: s.size, height: s.size,
          '--dx': `${s.driftX}px`,
          '--dy': `${s.driftY}px`,
          '--drift-dur': `${s.driftDur}s`,
          '--twinkle-dur': `${s.twinkleDur}s`,
          '--twinkle-delay': `${s.twinkleDelay}s`,
          '--twinkle-min': s.min,
          '--twinkle-max': s.max,
        }} />
      ))}
    </div>,
    host
  );
}

// ─── Wordmark ───────────────────────────────────────────────────
function ViresMark({ size = 20 }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
      <svg width={size * 0.9} height={size * 0.9} viewBox="0 0 24 24">
        <path d="M3 4 L12 21 L21 4" stroke="var(--vr-gold)" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="21" r="1.1" fill="var(--vr-gold)"/>
      </svg>
      <span className="t-display" style={{ fontSize: size }}>
        Vires<span className="t-accent"> Capital</span>
      </span>
    </div>
  );
}

// ─── Delta (up/down pill) ──────────────────────────────────────
function Delta({ value, format = fmtPct, size = 'var(--fs-body)' }) {
  const t = toneOf(value);
  const c = toneColor(t);
  return (
    <span className="t-num" style={{ color: c, fontSize: size, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {t === 'up' ? '▲' : t === 'down' ? '▼' : '■'} {format(value)}
    </span>
  );
}

// ─── Status pill ────────────────────────────────────────────────
function StatusPill({ tone = 'neutral', pulse = false, children }) {
  const map = {
    up:      { c: 'var(--vr-up)',         bg: 'var(--vr-up-soft)' },
    down:    { c: 'var(--vr-down)',       bg: 'var(--vr-down-soft)' },
    gold:    { c: 'var(--vr-gold)',       bg: 'var(--vr-gold-soft)' },
    warn:    { c: 'var(--vr-gold)',       bg: 'var(--vr-gold-soft)' },
    neutral: { c: 'var(--vr-cream-dim)',  bg: 'rgba(241,236,224,0.04)' },
  };
  const s = map[tone] || map.neutral;
  return (
    <span className="t-eyebrow" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px 2px',
      background: s.bg, color: s.c, borderRadius: 2,
      border: `1px solid ${s.c}22`,
    }}>
      {pulse && <span className="vr-pulse-dot" style={{ background: s.c }} />}
      {children}
    </span>
  );
}

// ─── Section header ────────────────────────────────────────────
function SectionHeader({ eyebrow, title, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
      <div>
        {eyebrow && <div className="t-eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>}
        {title && <div className="t-h3">{title}</div>}
      </div>
      {right}
    </div>
  );
}

// ─── Sleeve chip ───────────────────────────────────────────────
function SleeveChip({ sleeve, label }) {
  const map = {
    stocks:  { c: 'var(--vr-sleeve-stocks)',  l: label ?? 'Stocks' },
    options: { c: 'var(--vr-sleeve-options)', l: label ?? 'Options' },
    crypto:  { c: 'var(--vr-sleeve-crypto)',  l: label ?? 'Crypto' },
  };
  const s = map[sleeve] || { c: 'var(--vr-cream-mute)', l: label };
  return (
    <span className="t-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: s.c }}>
      <span style={{ width: 4, height: 4, borderRadius: 0, background: s.c }} />
      {s.l}
    </span>
  );
}

// ─── Glossary + Info popover ────────────────────────────────────
const GLOSSARY = {
  VIX: {
    title: 'VIX',
    full: 'Cboe Volatility Index',
    body: 'Market\u2019s 30-day forward expectation of S&P 500 volatility, derived from option prices. Often called the "fear gauge." Below 15 is calm; 15–25 is normal; 25–35 is elevated; above 35 is stressed.',
  },
  HMM: {
    title: 'HMM',
    full: 'Hidden Markov Model',
    body: 'A statistical model that infers the current "regime" of the market (e.g. trend, mean-reverting, chaotic) from observable price/volume signals. We use it to gate which strategies are allowed to trade.',
  },
  Jump: {
    title: 'Jump Variation',
    full: 'Realized Jump Stress',
    body: 'A measure of how much of recent price action came from sudden discontinuous moves (gaps, news shocks) versus smooth diffusion. High jump stress means the market is being driven by surprise events, not orderly flow.',
  },
  Sharpe: {
    title: 'Sharpe Ratio',
    full: 'Risk-Adjusted Return',
    body: 'Return per unit of volatility. Above 1.0 is strong; above 2.0 is excellent. Tells you whether returns came from skill or just from taking more risk.',
  },
  Sortino: {
    title: 'Sortino Ratio',
    full: 'Downside-Adjusted Return',
    body: 'Like Sharpe, but only penalizes downside volatility. Rewards strategies that have big up days but controlled losses.',
  },
  Calmar: {
    title: 'Calmar Ratio',
    full: 'Return ÷ Max Drawdown',
    body: 'Annualized return divided by worst peak-to-trough loss. Answers: "was the ride worth the dip?" Our primary success metric for crypto.',
  },
  MaxDD: {
    title: 'Max Drawdown',
    full: 'Worst Peak-to-Trough Loss',
    body: 'The largest percentage decline from a portfolio peak before recovering. Lower is better — measures the worst pain you would have endured holding the strategy.',
  },
  ProfitFactor: {
    title: 'Profit Factor',
    full: 'Gross Profit ÷ Gross Loss',
    body: 'Total winning P&L divided by total losing P&L. Above 1.5 is healthy; above 2.0 is excellent. A direct measure of how much winners outweigh losers.',
  },
  WinRate: {
    title: 'Win Rate',
    full: 'Percentage of Profitable Trades',
    body: 'Share of trades that closed positive. High win rate doesn\u2019t guarantee profitability — combine with average win/loss size for the full picture.',
  },
};

function InfoPop({ term, size = 11 }) {
  const [open, setOpen] = React.useState(false);
  const def = GLOSSARY[term];
  if (!def) return null;
  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setOpen(true); }} style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%',
        background: 'rgba(241,236,224,0.06)',
        border: '1px solid var(--vr-line)',
        color: 'var(--vr-cream-mute)',
        fontSize: size - 4, fontFamily: 'var(--ff-serif)',
        fontStyle: 'italic', fontWeight: 500,
        cursor: 'pointer', padding: 0, marginLeft: 5,
        verticalAlign: 'middle', lineHeight: 1,
      }}>i</button>
      {open && <DefinitionModal def={def} onClose={() => setOpen(false)} />}
    </>
  );
}

function DefinitionModal({ def, onClose }) {
  const host = typeof document !== 'undefined' ? document.getElementById('app-frame') : null;
  if (!host) return null;
  return ReactDOM.createPortal(
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0,
      background: 'rgba(8,9,16,0.7)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 32, zIndex: 100,
      animation: 'fadeIn 180ms ease',
      borderRadius: 'inherit',
    }}>
      <div onClick={(e) => e.stopPropagation()} className="vr-card" style={{
        width: '100%', maxWidth: 320,
        padding: '20px 22px',
        background: 'var(--vr-ink-raised)',
        border: '1px solid var(--vr-gold-line)',
        boxShadow: '0 30px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(200,169,104,0.08)',
        animation: 'popIn 220ms cubic-bezier(.2,.9,.3,1.2)',
      }}>
        <div className="t-eyebrow" style={{ color: 'var(--vr-gold)', marginBottom: 4 }}>Definition</div>
        <div className="t-h3" style={{ marginBottom: 2 }}>{def.title}</div>
        <div className="t-label" style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--vr-cream-mute)', marginBottom: 12 }}>
          {def.full}
        </div>
        <div className="t-read" style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--vr-cream-dim)' }}>
          {def.body}
        </div>
        <button onClick={onClose} style={{
          marginTop: 18, width: '100%',
          padding: '9px 12px',
          background: 'transparent',
          border: '1px solid var(--vr-line-hi)',
          color: 'var(--vr-cream)',
          fontFamily: 'var(--ff-sans)', fontSize: 11,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          cursor: 'pointer', borderRadius: 2,
        }}>Close</button>
      </div>
    </div>,
    host
  );
}

Object.assign(window, {
  fmtCurrency, fmtPct, fmtNum, toneOf, toneColor,
  AnimatedNumber, EquityDisplay, OrbitRing, Starfield,
  ViresMark, Delta, StatusPill, SectionHeader, SleeveChip,
  InfoPop, GLOSSARY,
});
