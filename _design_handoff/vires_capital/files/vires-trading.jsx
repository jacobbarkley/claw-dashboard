// vires-trading.jsx — v2: Home + Stocks/Options/Crypto sub-screens
const D = window.VIRES_DATA;

// ─── Command strip ─────────────────────────────────────────────
function CommandStrip({ onNav, page }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 18px', borderBottom: '1px solid var(--vr-line)',
      background: 'rgba(10, 11, 20, 0.75)', backdropFilter: 'blur(20px)',
      position: 'sticky', top: 0, zIndex: 30,
    }}>
      <ViresMark size={16} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 2, padding: 2, background: 'rgba(241,236,224,0.02)', border: '1px solid var(--vr-line)', borderRadius: 3 }}>
          {['trading', 'bench', 'plateau'].map(p => (
            <button
              key={p}
              onClick={() => {
                if (p === 'plateau') {
                  window.location.href = 'Primer 04 - Parameter Stability.html';
                } else {
                  onNav(p);
                }
              }}
              className="t-eyebrow"
              style={{
                padding: '4px 10px', borderRadius: 2, border: 'none', cursor: 'pointer',
                background: page === p ? 'var(--vr-gold)' : 'transparent',
                color: page === p ? 'var(--vr-ink)' : 'var(--vr-cream-mute)',
                fontWeight: 600, fontSize: 9,
                fontStyle: p === 'plateau' ? 'italic' : 'normal',
                opacity: p === 'plateau' ? 0.75 : 1,
              }}
              title={p === 'plateau' ? 'Parameter Stability explainer · temporary during buildout' : undefined}
            >{p}</button>
          ))}
        </div>
        <span className="t-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--vr-gold)' }}>
          <span className="vr-pulse-dot" style={{ background: 'var(--vr-gold)' }} /> PAPER
        </span>
      </div>
    </div>
  );
}

// ─── Sub-tab nav (Home / Stocks / Options / Crypto) ────────────
function SubNav({ tab, onTab }) {
  const tabs = [
    { k: 'home',    l: 'Home' },
    { k: 'stocks',  l: 'Stocks' },
    { k: 'options', l: 'Options' },
    { k: 'crypto',  l: 'Crypto' },
  ];
  return (
    <div style={{
      display: 'flex', gap: 0, padding: '0 18px',
      borderBottom: '1px solid var(--vr-line)',
      background: 'var(--vr-ink)',
      position: 'sticky', top: 49, zIndex: 20,
    }}>
      {tabs.map(t => (
        <button key={t.k} onClick={() => onTab(t.k)} style={{
          flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '12px 4px 11px', position: 'relative',
          fontFamily: 'var(--ff-sans)', fontSize: 12, fontWeight: 500,
          color: tab === t.k ? 'var(--vr-cream)' : 'var(--vr-cream-mute)',
          letterSpacing: 0,
        }}>
          {t.l}
          {tab === t.k && (
            <span style={{ position: 'absolute', left: '50%', bottom: -1, transform: 'translateX(-50%)', width: 20, height: 2, background: 'var(--vr-gold)' }} />
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Celestial body: sun by day, moon by night ──────────────────
function Celestial({ parallax = { x: 0, y: 0 }, onOpenTalon }) {
  const hour = new Date().getHours();
  const isDay = hour >= 6 && hour < 18;
  const size = 58;
  const tx = parallax.x * 6;
  const ty = parallax.y * 4;
  const [hover, setHover] = React.useState(false);

  const wrapperStyle = {
    position: 'absolute', top: 16, right: 18, width: size, height: size,
    pointerEvents: onOpenTalon ? 'auto' : 'none',
    cursor: onOpenTalon ? 'pointer' : 'default',
    zIndex: 3,
    transform: `translate3d(${tx}px, ${ty}px, 0) scale(${hover ? 1.06 : 1})`,
    transition: 'transform 0.25s cubic-bezier(0.2,0.8,0.2,1)',
  };
  const wrapperProps = {
    style: wrapperStyle,
    onClick: onOpenTalon,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    role: onOpenTalon ? 'button' : undefined,
    tabIndex: onOpenTalon ? 0 : undefined,
    'aria-label': onOpenTalon ? 'Open Talon assistant' : undefined,
    onKeyDown: onOpenTalon ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenTalon(); } } : undefined,
  };

  // Interactive halo — only visible on hover/focus
  const Halo = () => (
    <div style={{
      position: 'absolute', inset: -14,
      borderRadius: '50%',
      pointerEvents: 'none',
      opacity: hover ? 1 : 0,
      transition: 'opacity 0.22s ease-out',
      background: isDay
        ? 'radial-gradient(circle, rgba(244,213,138,0.28) 0%, rgba(244,213,138,0.10) 45%, transparent 70%)'
        : 'radial-gradient(circle, rgba(232,228,216,0.22) 0%, rgba(232,228,216,0.06) 45%, transparent 70%)',
      animation: hover ? 'vr-halo-pulse 1.6s ease-in-out infinite' : 'none',
    }}/>
  );

  if (isDay) {
    return (
      <div {...wrapperProps}>
        <Halo/>
        <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow: 'visible', display: 'block' }}>
          <defs>
            <radialGradient id="sunCore" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#fff4d4" stopOpacity="1"/>
              <stop offset="35%"  stopColor="#f4d58a" stopOpacity="1"/>
              <stop offset="70%"  stopColor="#c8a968" stopOpacity="0.95"/>
              <stop offset="100%" stopColor="#8e763f" stopOpacity="0.85"/>
            </radialGradient>
            <radialGradient id="sunCorona" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#f4d58a" stopOpacity="0.45"/>
              <stop offset="55%"  stopColor="#c8a968" stopOpacity="0.14"/>
              <stop offset="100%" stopColor="#c8a968" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="sunOuter" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#c8a968" stopOpacity="0.10"/>
              <stop offset="60%"  stopColor="#c8a968" stopOpacity="0.03"/>
              <stop offset="100%" stopColor="#c8a968" stopOpacity="0"/>
            </radialGradient>
            <filter id="sunBlur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.4"/>
            </filter>
          </defs>
          <circle cx="32" cy="32" r="30" fill="url(#sunOuter)"/>
          <circle cx="32" cy="32" r="20" fill="url(#sunCorona)">
            <animate attributeName="r" values="19;21;19" dur="5s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.85;1;0.85" dur="5s" repeatCount="indefinite"/>
          </circle>
          <circle cx="32" cy="32" r="11" fill="url(#sunCore)" filter="url(#sunBlur)"/>
          <circle cx="29" cy="29" r="2.5" fill="#fffaec" opacity="0.75"/>
        </svg>
      </div>
    );
  }

  return (
    <div {...wrapperProps}>
      <Halo/>
      <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#e8e4d8" stopOpacity="0.20"/>
            <stop offset="60%"  stopColor="#c9c3b3" stopOpacity="0.05"/>
            <stop offset="100%" stopColor="#c9c3b3" stopOpacity="0"/>
          </radialGradient>
          <radialGradient id="moonBody" cx="38%" cy="35%" r="70%">
            <stop offset="0%"   stopColor="#f5f0e2"/>
            <stop offset="55%"  stopColor="#d8d2bf"/>
            <stop offset="100%" stopColor="#8a8575"/>
          </radialGradient>
          <radialGradient id="moonShadow" cx="72%" cy="55%" r="60%">
            <stop offset="0%"   stopColor="#000" stopOpacity="0"/>
            <stop offset="70%"  stopColor="#000" stopOpacity="0.32"/>
            <stop offset="100%" stopColor="#000" stopOpacity="0.52"/>
          </radialGradient>
          <filter id="moonCraterBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.3"/>
          </filter>
        </defs>
        <circle cx="32" cy="32" r="30" fill="url(#moonGlow)"/>
        <circle cx="32" cy="32" r="14" fill="url(#moonBody)"/>
        <circle cx="32" cy="32" r="14" fill="url(#moonShadow)"/>
        <g filter="url(#moonCraterBlur)" opacity="0.45">
          <circle cx="28" cy="29" r="2.2" fill="#8a8575"/>
          <circle cx="34" cy="26" r="1.2" fill="#8a8575"/>
          <circle cx="30" cy="35" r="1.6" fill="#8a8575"/>
          <circle cx="36" cy="33" r="0.9" fill="#8a8575"/>
          <circle cx="26" cy="33" r="0.7" fill="#8a8575"/>
        </g>
        <circle cx="27" cy="27" r="1.8" fill="#fffaec" opacity="0.55"/>
      </svg>
    </div>
  );
}

// ─── Hero: Account Equity (clean, no buying power) ──────────────
function HomeHero() {
  const a = D.account;
  const [px, setPx] = React.useState({ x: 0, y: 0 });
  const heroRef = React.useRef(null);
  const handleMouse = (e) => {
    const r = heroRef.current?.getBoundingClientRect();
    if (!r) return;
    setPx({
      x: ((e.clientX - r.left) / r.width - 0.5) * 2,
      y: ((e.clientY - r.top) / r.height - 0.5) * 2,
    });
  };
  const alloc = [
    { k: 'stocks',  label: 'Stocks',  value: a.equity_deployed, color: 'var(--vr-sleeve-stocks)' },
    { k: 'crypto',  label: 'Crypto',  value: a.crypto_deployed, color: 'var(--vr-sleeve-crypto)' },
    { k: 'options', label: 'Options', value: a.options_deployed, color: 'var(--vr-sleeve-options)' },
    { k: 'cash',    label: 'Cash',    value: a.cash,             color: 'var(--vr-cream-faint)' },
  ];
  const total = alloc.reduce((s, x) => s + x.value, 0);

  return (
    <div
      ref={heroRef}
      className="vr-card-hero"
      style={{ padding: '24px 22px 20px', overflow: 'hidden' }}
      onMouseMove={handleMouse}
      onMouseLeave={() => setPx({ x: 0, y: 0 })}
    >
      <OrbitRing size={220} offsetX={-90} offsetY={-100} />
      <OrbitRing size={340} offsetX={-180} offsetY={-180} />
      <Celestial parallax={px} onOpenTalon={() => window.__viresOpenTalon?.()} />
      <div className="t-eyebrow" style={{ marginBottom: 10 }}>Account Equity</div>
      <EquityDisplay value={a.equity} size={42} />
      <div style={{ display: 'flex', gap: 18, marginTop: 14, alignItems: 'baseline' }}>
        <Delta value={a.today_pnl_pct} size="13px" />
        <span className="t-label" style={{ fontSize: 11 }}>today</span>
        <span style={{ color: 'var(--vr-cream-faint)' }}>·</span>
        <span className="t-num" style={{ color: toneColor(toneOf(a.total_pnl_pct)), fontSize: 12 }}>
          {fmtPct(a.total_pnl_pct, { sign: true })}
        </span>
        <span className="t-label" style={{ fontSize: 11 }}>since inception</span>
      </div>

      {/* Allocation bar */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', height: 4, borderRadius: 1, overflow: 'hidden', background: 'rgba(241,236,224,0.04)' }}>
          {alloc.map(x => (
            <div key={x.k} style={{ flexBasis: `${(x.value / total) * 100}%`, background: x.color, transition: 'flex-basis 0.8s' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, marginTop: 14 }}>
          {alloc.map((x, i) => (
            <div key={x.k} style={{ padding: i > 0 ? '0 0 0 12px' : '0 12px 0 0', borderLeft: i > 0 ? '1px solid var(--vr-line)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <span style={{ width: 4, height: 4, background: x.color }} />
                <span className="t-eyebrow" style={{ fontSize: 9 }}>{x.label}</span>
              </div>
              <div className="t-num" style={{ fontSize: 13, color: 'var(--vr-cream)', fontWeight: 500 }}>
                {fmtCurrency(x.value, { compact: true, digits: x.value < 1000 ? 2 : 2 })}
              </div>
              <div className="t-num" style={{ fontSize: 10, color: 'var(--vr-cream-mute)', marginTop: 2 }}>
                {((x.value / total) * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Operator status — redesigned as readable rows, not 4 tiles ──
function DeskStatus() {
  const o = D.operator;
  const rows = [
    { label: 'Promotion', value: `${o.checkpoint.substantiveDays} of ${o.checkpoint.neededDays} days`, detail: `${o.checkpoint.shadowDays} shadow days observed`, pill: { tone: 'warn', text: 'Accumulating' } },
    { label: 'Plan',      value: `${o.planCount} trade ready`,      detail: o.planSymbols.join(', '), pill: { tone: 'up', text: 'Ready' } },
    { label: 'Research',  value: `${o.research.top.symbol} · ${o.research.top.bias.toLowerCase()}`, detail: `${o.research.top.bull}% bull case · ${o.research.theses} active thesis`, pill: { tone: 'gold', text: 'Medium' } },
    { label: 'Pipeline',  value: `${o.pipeline.high} high, ${o.pipeline.medium} medium`, detail: `${o.pipeline.critical} critical`, pill: { tone: 'warn', text: o.pipeline.verdict } },
  ];
  return (
    <div className="vr-card">
      <div style={{ padding: '14px 16px 12px' }}>
        <div className="t-eyebrow">Desk Status</div>
      </div>
      <div className="vr-divide">
        {rows.map(r => (
          <div key={r.label} style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '68px 1fr auto', gap: 12, alignItems: 'center' }}>
            <span className="t-eyebrow" style={{ fontSize: 9 }}>{r.label}</span>
            <div>
              <div className="t-h4" style={{ fontSize: 13, color: 'var(--vr-cream)' }}>{r.value}</div>
              <div className="t-label" style={{ fontSize: 11, marginTop: 2 }}>{r.detail}</div>
            </div>
            <StatusPill tone={r.pill.tone}>{r.pill.text}</StatusPill>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Market regime ──────────────────────────────────────────────
function MarketRegime() {
  const r = D.operator.regime;
  const items = [
    { l: 'VIX',   k: 'VIX',  v: r.vix.toFixed(2),     s: r.vixRegime.toLowerCase() },
    { l: 'HMM',   k: 'HMM',  v: r.hmm.toLowerCase(),  s: 'regime state' },
    { l: 'Jump',  k: 'Jump', v: r.jump.toLowerCase(), s: 'stress' },
  ];
  return (
    <div className="vr-card">
      <div style={{ padding: '14px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="t-eyebrow">Market Regime</div>
        <span className="t-label" style={{ fontSize: 10 }}>{D.asOf}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderTop: '1px solid var(--vr-line)' }}>
        {items.map((it, i) => (
          <div key={it.l} style={{ padding: '14px 16px', borderLeft: i > 0 ? '1px solid var(--vr-line)' : 'none' }}>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 6, display: 'flex', alignItems: 'center' }}>
              {it.l}<InfoPop term={it.k} />
            </div>
            <div className="t-h3" style={{ fontSize: 16, textTransform: 'capitalize' }}>{it.v}</div>
            <div className="t-label" style={{ fontSize: 10, marginTop: 3 }}>{it.s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Equity curve ──────────────────────────────────────────────
const TIMEFRAMES = [
  { k: '1D', label: '1D', days: 1 },
  { k: '1W', label: '1W', days: 7 },
  { k: '1M', label: '1M', days: 30 },
  { k: '3M', label: '3M', days: 90 },
  { k: '1Y', label: '1Y', days: 365 },
  { k: 'ALL', label: 'ALL', days: Infinity },
];

// Shared timeframe across equity chart + sleeve sparklines.
// Writes to localStorage + broadcasts a custom event so every chart on the page stays in sync.
const TF_KEY = 'vr.tf';
const TF_EVENT = 'vr:tf-change';
function useSharedTimeframe() {
  const [tf, setTfState] = React.useState(() => {
    try { return localStorage.getItem(TF_KEY) || '1M'; } catch { return '1M'; }
  });
  React.useEffect(() => {
    const handler = (e) => setTfState(e.detail);
    window.addEventListener(TF_EVENT, handler);
    return () => window.removeEventListener(TF_EVENT, handler);
  }, []);
  const setTf = React.useCallback((v) => {
    try { localStorage.setItem(TF_KEY, v); } catch {}
    window.dispatchEvent(new CustomEvent(TF_EVENT, { detail: v }));
  }, []);
  return [tf, setTf];
}

// Synthesize older history before the real curve starts so longer
// timeframes have data. Deterministic noise around base $100k.
function synthHistoryBefore(firstEq, firstDate, days) {
  const out = [];
  let s = 7;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 - 0.5; };
  let eq = firstEq * (1 - 0.18); // start ~18% below current
  const start = new Date(firstDate);
  for (let i = days; i >= 1; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    const drift = 0.0006; // mild upward drift
    const vol = 0.011;
    eq = eq * (1 + drift + rand() * vol);
    out.push({ date: d.toISOString().slice(0, 10), eq });
  }
  return out;
}

// Upsample a daily close series into intraday points with deterministic
// seeded noise. Anchors on exact daily closes so total P&L is preserved.
// stepsPerDay controls density (auto-chosen by timeframe so tight windows
// get hourly/minute texture, wide windows stay readable).
function upsampleIntraday(daily, stepsPerDay) {
  if (!daily || daily.length < 2 || stepsPerDay <= 0) return daily || [];
  const mk = (seed) => {
    let t = seed >>> 0;
    return () => {
      t = (t + 0x6D2B79F5) >>> 0;
      let r = t;
      r = Math.imul(r ^ (r >>> 15), r | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  };
  const rand = mk(0xC0FFEE);
  const mean = daily.reduce((a, b) => a + b.eq, 0) / daily.length || 100000;
  // Intraday 1-bar stdev ~ 18bps, scaled down if very dense so total wiggle stays coherent
  const sigma = mean * (stepsPerDay >= 30 ? 0.0009 : 0.0018);
  const out = [];
  for (let i = 0; i < daily.length - 1; i++) {
    const a = daily[i], b = daily[i + 1];
    for (let s = 0; s < stepsPerDay; s++) {
      const t = s / stepsPerDay;
      const base = a.eq + (b.eq - a.eq) * t;
      const env = Math.sin(Math.PI * t); // 0 at endpoints, 1 mid
      const n1 = (rand() - 0.5) * 2;
      const n2 = (rand() - 0.5) * 2;
      const noise = (n1 * 0.8 + n2 * 0.4) * sigma * env;
      const uShape = Math.sin(Math.PI * 2 * t - 0.3) * sigma * 0.35 * env;
      const hrFloat = 9.5 + t * 6.5; // 9:30 → 16:00
      const hour = Math.floor(hrFloat);
      const mins = Math.round((hrFloat - hour) * 60);
      out.push({
        date: a.date,
        hour: `${hour.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`,
        eq: base + noise + uShape,
      });
    }
    out.push({ date: a.date, hour: '16:00', eq: a.eq });
  }
  const last = daily[daily.length - 1];
  out.push({ date: last.date, hour: '16:00', eq: last.eq });
  return out;
}

function EquityChart() {
  const [tf, setTf] = useSharedTimeframe();
  const [tfMenu, setTfMenu] = React.useState(false);
  const [hover, setHover] = React.useState(null);

  const fullCurve = React.useMemo(() => {
    const real = D.equityCurve;
    const first = real[0];
    const synthDays = 365 * 2; // 2y of backfill
    const past = synthHistoryBefore(first.eq, first.date, synthDays);
    return [...past, ...real];
  }, []);

  const tfMeta = TIMEFRAMES.find(t => t.k === tf);
  const dailyCurve = React.useMemo(() => {
    if (tfMeta.days === Infinity) return fullCurve;
    // For 1D we need yesterday + today so upsampleIntraday can draw today's session.
    const window = Math.max(2, Math.min(fullCurve.length, tfMeta.days + 1));
    return fullCurve.slice(-window);
  }, [fullCurve, tf]);
  const curve = React.useMemo(() => {
    const steps = { '1D': 78, '1W': 26, '1M': 10, '3M': 4, '1Y': 1, 'ALL': 1 }[tf] ?? 10;
    if (steps <= 1) return dailyCurve;
    const upsampled = upsampleIntraday(dailyCurve, steps);
    // For 1D, show only today's session (the bars generated from the prior-day close up to today's close).
    if (tf === '1D') {
      const todayDate = dailyCurve[dailyCurve.length - 1].date;
      const idx = upsampled.findIndex(p => p.date === dailyCurve[dailyCurve.length - 2].date);
      // Keep from the last prior-close anchor through today's close.
      return upsampled.slice(Math.max(0, idx));
    }
    return upsampled;
  }, [dailyCurve, tf]);

  const vals = curve.map(p => p.eq);
  const min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min) * 0.15 || 100;
  const minP = min - pad, maxP = max + pad;
  const W = 340, H = 130;
  const range = maxP - minP || 1;
  const pts = curve.map((p, i) => [(i / Math.max(1, curve.length - 1)) * W, H - ((p.eq - minP) / range) * H]);
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const fd = `${d} L${W},${H} L0,${H} Z`;
  const baseY = H - ((100000 - minP) / range) * H;
  const baseInRange = baseY >= 0 && baseY <= H;
  const last = curve[curve.length - 1];
  const periodPct = ((last.eq - curve[0].eq) / curve[0].eq) * 100;

  return (
    <div className="vr-card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 4 }}>Equity Curve</div>
          <div className="t-num" style={{ fontSize: 16, color: 'var(--vr-cream)', fontWeight: 500 }}>
            {fmtCurrency(hover ? hover.eq : last.eq)}
          </div>
          <div className="t-label" style={{ fontSize: 10, marginTop: 3 }}>
            {hover ? `${hover.date}${hover.hour ? ` · ${hover.hour}` : ''}` : tfMeta.label}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <Delta value={periodPct} />
          <div style={{ position: 'relative' }}>
            <button onClick={() => setTfMenu(v => !v)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', background: 'rgba(241,236,224,0.04)',
              border: '1px solid var(--vr-line)', color: 'var(--vr-cream-dim)',
              fontFamily: 'var(--ff-sans)', fontSize: 10,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              cursor: 'pointer', borderRadius: 2,
            }}>{tfMeta.label} <span style={{ fontSize: 8, opacity: 0.6 }}>▾</span></button>
            {tfMenu && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                background: 'var(--vr-ink-raised)',
                border: '1px solid var(--vr-line-hi)',
                borderRadius: 3, padding: 4, zIndex: 50,
                boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
                minWidth: 70,
              }}>
                {TIMEFRAMES.map(t => (
                  <button key={t.k} onClick={() => { setTf(t.k); setTfMenu(false); setHover(null); }} style={{
                    display: 'block', width: '100%', textAlign: 'right',
                    padding: '6px 10px', background: t.k === tf ? 'rgba(200,169,104,0.08)' : 'transparent',
                    border: 'none', color: t.k === tf ? 'var(--vr-gold)' : 'var(--vr-cream-dim)',
                    fontFamily: 'var(--ff-sans)', fontSize: 10,
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    cursor: 'pointer', borderRadius: 2,
                  }}>{t.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}
           onMouseLeave={() => setHover(null)}
           onMouseMove={(e) => {
             const rect = e.currentTarget.getBoundingClientRect();
             const x = ((e.clientX - rect.left) / rect.width) * W;
             const i = Math.max(0, Math.min(curve.length - 1, Math.round((x / W) * (curve.length - 1))));
             setHover(curve[i]);
           }}>
        <defs>
          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--vr-gold)" stopOpacity="0.14"/>
            <stop offset="100%" stopColor="var(--vr-gold)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {baseInRange && <>
          <line x1="0" y1={baseY} x2={W} y2={baseY} stroke="var(--vr-cream-faint)" strokeDasharray="1 3" strokeWidth="0.8"/>
          <text x={W - 4} y={baseY - 4} fontSize="8" fill="var(--vr-cream-mute)" textAnchor="end" fontFamily="var(--ff-mono)" letterSpacing="0.15em">BASE 100K</text>
        </>}
        <path d={fd} fill="url(#eqGrad)"/>
        <path d={d} stroke="var(--vr-gold)" strokeWidth="2.4" fill="none" strokeLinejoin="round" opacity="0.18"/>
        <path d={d} stroke="var(--vr-gold)" strokeWidth="1.1" fill="none" strokeLinejoin="round"/>
        {hover && (() => {
          const i = curve.indexOf(hover);
          const [x, y] = pts[i];
          return (
            <g>
              <line x1={x} y1="0" x2={x} y2={H} stroke="var(--vr-cream-faint)" strokeWidth="0.6" strokeDasharray="1 3"/>
              <circle cx={x} cy={y} r="3.5" fill="var(--vr-ink)" stroke="var(--vr-gold)" strokeWidth="1.3"/>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ─── Sleeve quick-link card (Home) ─────────────────────────────
function SleeveCard({ sleeve, total, count, todayPct, onOpen }) {
  const cfg = {
    stocks:  { c: 'var(--vr-sleeve-stocks)',  l: 'Stocks'  },
    options: { c: 'var(--vr-sleeve-options)', l: 'Options' },
    crypto:  { c: 'var(--vr-sleeve-crypto)',  l: 'Crypto'  },
  }[sleeve];
  return (
    <button onClick={onOpen} className="vr-card" style={{
      padding: 16, textAlign: 'left', border: '1px solid var(--vr-line)',
      cursor: 'pointer', width: '100%',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="t-eyebrow" style={{ color: cfg.c }}>
          <span style={{ display: 'inline-block', width: 4, height: 4, background: cfg.c, marginRight: 6, verticalAlign: 'middle' }} />
          {cfg.l}
        </span>
        <span style={{ color: 'var(--vr-cream-mute)' }}>›</span>
      </div>
      <div className="t-num" style={{ fontSize: 18, color: 'var(--vr-cream)', fontWeight: 500, marginTop: 4 }}>
        {total === 0 ? '—' : fmtCurrency(total, { compact: true })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="t-label" style={{ fontSize: 10 }}>
          {count === 0 ? 'Dormant' : `${count} open`}
        </span>
        {todayPct !== null && <Delta value={todayPct} size="11px" />}
      </div>
    </button>
  );
}

// ─── Elevated Strategies (promoted from bench) ──────────────────
const ELEVATED = [
  {
    id: 'ram',
    name: 'Regime-Aware Momentum',
    sleeve: 'stocks',
    headline: 'Six large-caps · SPY regime gate',
    metric: { label: 'Calmar', value: '2.55' },
    secondary: { label: 'Sharpe', value: '1.93' },
    promoted: '2026-04-17',
    rationale: [
      'A six-name large-cap momentum sleeve (AAPL, AVGO, COST, LLY, META, NVDA) that participates only when the SPY regime gate confirms a constructive trend backdrop.',
      'Earned promotion through risk-aware participation: the strategy sits in cash through chop, then leans in when the regime model gives the green light.',
      'Won its bench because it cleared every era — median-era Sharpe 1.93, worst-era Sharpe 1.41 — while keeping max drawdown under 9%.',
    ],
    rules: [
      { k: 'Stop',     v: '5% trailing' },
      { k: 'Target',   v: '15% partial' },
      { k: 'Max hold', v: '60 sessions' },
      { k: 'Sizing',   v: 'Equal-weight, regime-scaled' },
    ],
  },
  {
    id: 'btctsm',
    name: 'BTC 4H TSMOM',
    sleeve: 'crypto',
    headline: '4-hour time-series momentum · trend filter',
    metric: { label: 'Med Era Sharpe', value: '0.59' },
    secondary: { label: 'Plateau', value: 'Confirmed' },
    promoted: '2026-04-16',
    rationale: [
      'Long-only Bitcoin time-series momentum on the 4-hour bar with a slow trend regime filter that suppresses signals during chop.',
      'Promoted after a neighborhood probe (433 of 486 candidates evaluated) confirmed the winner sits on a real plateau — its top neighbors all cleared the bench gates, ruling out a spiky single-point fit.',
      'Survives fees and slippage across the full 2016–2026 crypto era catalog without leaning on any single regime.',
    ],
    rules: [
      { k: 'Bar',         v: '4-hour' },
      { k: 'Direction',   v: 'Long-only' },
      { k: 'Regime gate', v: 'Slow-trend confirm' },
      { k: 'Sizing',      v: 'Volatility-targeted' },
    ],
  },
  {
    id: 'btcmgd',
    name: 'BTC Managed Exposure',
    sleeve: 'crypto',
    headline: 'Graduated 80/70/0 ladder + tactical top-up',
    metric: { label: 'Calmar', value: '0.96' },
    secondary: { label: 'vs HODL', value: '+0.34' },
    promoted: '2026-04-17',
    rationale: [
      'A graduated BTC core that holds 80%, 70%, or 0% notional based on the regime tier, with an optional tactical top-up layer when conditions are favorable.',
      'Designed to stay close to HODL on the upside while cutting exposure entirely during the worst regimes — beating buy-and-hold on every risk-adjusted metric.',
      'Bench validated: Calmar 0.96 vs HODL\u2019s 0.62 — meaningfully better compensation for the worst pain endured.',
    ],
    rules: [
      { k: 'Tier 1',  v: '80% notional · constructive' },
      { k: 'Tier 2',  v: '70% notional · neutral' },
      { k: 'Tier 3',  v: '0% notional · risk-off' },
      { k: 'Tactical', v: '+10% top-up when armed' },
    ],
  },
];

function ElevatedStrategyCard({ s, open, onToggle }) {
  const sleeveColor = `var(--vr-sleeve-${s.sleeve})`;
  return (
    <div className="vr-card" style={{
      padding: 0, overflow: 'hidden',
      borderColor: open ? 'var(--vr-gold-line)' : 'var(--vr-line)',
      transition: 'border-color 200ms ease',
    }}>
      <div onClick={onToggle} role="button" tabIndex={0} style={{
        width: '100%', padding: '14px 16px', textAlign: 'left',
        background: 'transparent', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ width: 4, height: 4, background: sleeveColor }} />
              <SleeveChip sleeve={s.sleeve} />
              <span className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-gold)', marginLeft: 4 }}>· Elevated</span>
            </div>
            <div className="t-h3" style={{ fontSize: 16, marginBottom: 3 }}>{s.name}</div>
            <div className="t-label" style={{ fontSize: 11, color: 'var(--vr-cream-mute)' }}>{s.headline}</div>
          </div>
          <span style={{
            color: 'var(--vr-cream-mute)', fontSize: 14,
            transition: 'transform 220ms ease',
            transform: open ? 'rotate(90deg)' : 'rotate(0)',
            lineHeight: 1, marginTop: 2,
          }}>›</span>
        </div>
        <div style={{ display: 'flex', gap: 18, paddingTop: 8, borderTop: '1px solid var(--vr-line)' }}>
          <div>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3, display: 'flex', alignItems: 'center' }}>
              {s.metric.label}
              {GLOSSARY[s.metric.label.replace(/Med Era /, '')] && <InfoPop term={s.metric.label.replace(/Med Era /, '')} size={10} />}
            </div>
            <div className="t-num" style={{ fontSize: 15, color: 'var(--vr-gold)', fontWeight: 500 }}>{s.metric.value}</div>
          </div>
          <div>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3, display: 'flex', alignItems: 'center' }}>
              {s.secondary.label}
              {GLOSSARY[s.secondary.label] && <InfoPop term={s.secondary.label} size={10} />}
            </div>
            <div className="t-num" style={{ fontSize: 15, color: 'var(--vr-cream)', fontWeight: 500 }}>{s.secondary.value}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Promoted</div>
            <div className="t-label" style={{ fontSize: 11, color: 'var(--vr-cream-dim)' }}>{s.promoted}</div>
          </div>
        </div>
      </div>
      {open && (
        <div style={{
          padding: '4px 16px 16px',
          borderTop: '1px solid var(--vr-line)',
          animation: 'fadeIn 240ms ease',
        }}>
          <div className="t-eyebrow" style={{ fontSize: 9, margin: '14px 0 8px' }}>Why It Passed</div>
          {s.rationale.map((p, i) => (
            <p key={i} className="t-read" style={{
              fontSize: 12.5, lineHeight: 1.55, color: 'var(--vr-cream-dim)',
              margin: '0 0 8px',
            }}>{p}</p>
          ))}
          <div className="t-eyebrow" style={{ fontSize: 9, margin: '14px 0 8px' }}>Rules</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px' }}>
            {s.rules.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--vr-line)' }}>
                <span className="t-label" style={{ fontSize: 10, color: 'var(--vr-cream-mute)' }}>{r.k}</span>
                <span className="t-num" style={{ fontSize: 11, color: 'var(--vr-cream)' }}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ElevatedStrategies() {
  const [openId, setOpenId] = React.useState(null);
  return (
    <div>
      <SectionHeader
        eyebrow="From the Bench"
        title={<>Elevated <span className="t-accent">Strategies</span></>}
        right={<span className="t-label" style={{ fontSize: 10, color: 'var(--vr-cream-mute)' }}>{ELEVATED.length} live</span>}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ELEVATED.map(s => (
          <ElevatedStrategyCard key={s.id} s={s}
            open={openId === s.id}
            onToggle={() => setOpenId(openId === s.id ? null : s.id)} />
        ))}
      </div>
    </div>
  );
}

// ─── HOME ───────────────────────────────────────────────────────
function HomeScreen({ onOpenSleeve }) {
  const a = D.account;
  const stocks = D.positions.filter(p => p.sleeve === 'stocks');
  const crypto = D.positions.filter(p => p.sleeve === 'crypto');
  return (
    <div className="vr-screen" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <HomeHero />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <SleeveCard sleeve="stocks"  total={stocks.reduce((s, p) => s + p.mv, 0)} count={stocks.length} todayPct={stocks.reduce((s, p) => s + p.today * p.mv, 0) / (stocks.reduce((s, p) => s + p.mv, 0) || 1)} onOpen={() => onOpenSleeve('stocks')} />
        <SleeveCard sleeve="options" total={0} count={0} todayPct={null} onOpen={() => onOpenSleeve('options')} />
        <SleeveCard sleeve="crypto"  total={crypto.reduce((s, p) => s + p.mv, 0)} count={crypto.length} todayPct={crypto[0]?.today ?? 0} onOpen={() => onOpenSleeve('crypto')} />
      </div>
      <EquityChart />
      <ElevatedStrategies />
      <MarketRegime />
      <DeskStatus />
    </div>
  );
}

// ─── Positions (used in sleeve sub-screens) ─────────────────────
function PositionRow({ p }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12,
      padding: '14px 16px', alignItems: 'center',
    }}>
      <div>
        <div className="t-ticker" style={{ fontSize: 13 }}>{p.symbol}</div>
        <div className="t-num" style={{ fontSize: 10, color: 'var(--vr-cream-mute)', marginTop: 3 }}>
          {p.qty < 1 ? p.qty.toFixed(5) : p.qty} @ ${fmtNum(p.entry, 2)}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="t-num" style={{ fontSize: 13, color: 'var(--vr-cream)', fontWeight: 500 }}>{fmtCurrency(p.mv, { compact: true })}</div>
        <div className="t-num" style={{ fontSize: 10, color: 'var(--vr-cream-mute)', marginTop: 3 }}>${fmtNum(p.price, 2)}</div>
      </div>
      <div style={{ textAlign: 'right', minWidth: 60 }}>
        <Delta value={p.upct} size="12px" />
        <div className="t-num" style={{ fontSize: 10, color: toneColor(toneOf(p.today)), marginTop: 3 }}>
          {fmtPct(p.today, { sign: true })}
        </div>
      </div>
    </div>
  );
}

// ─── Sleeve sparkline: cumulative return % | market value, compact ──
// Derived deterministically from the account equityCurve + sleeve's
// current allocation share, with seeded intra-sleeve noise so each
// sleeve looks distinct without fake data.
function SleeveSparkline({ sleeve, currentValue }) {
  const [mode, setMode] = React.useState('ret'); // 'ret' | 'mv'
  const [tf, setTf] = useSharedTimeframe();
  const [tfMenu, setTfMenu] = React.useState(false);
  const [hover, setHover] = React.useState(null);

  // Deterministic per-sleeve noise
  const seeds = { stocks: 7919, crypto: 4421, options: 0 };
  const seed = seeds[sleeve] ?? 1;
  const mulberry32 = (s) => { let a = s; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  // Same full curve pipeline the main EquityChart uses, so
  // sleeves honor the identical time window / intraday upsampling.
  const fullCurve = React.useMemo(() => {
    const real = D.equityCurve;
    const first = real[0];
    const past = synthHistoryBefore(first.eq, first.date, 365 * 2);
    return [...past, ...real];
  }, []);
  const tfMeta = TIMEFRAMES.find(t => t.k === tf);
  const windowed = React.useMemo(() => {
    if (!tfMeta) return fullCurve;
    if (tfMeta.days === Infinity) return fullCurve;
    const w = Math.max(2, Math.min(fullCurve.length, tfMeta.days + 1));
    return fullCurve.slice(-w);
  }, [fullCurve, tf]);
  const daily = windowed;

  const pts = React.useMemo(() => {
    if (sleeve === 'options') return null;
    if (!daily || daily.length === 0) return null;
    const base = daily[0].eq;
    const rand = mulberry32(seed);
    const amp = sleeve === 'crypto' ? 2.1 : 1.05;
    const noiseK = sleeve === 'crypto' ? 0.022 : 0.009;
    let drift = 0;
    // Walk gives a cumulative return path in %; MV is scaled so the FINAL
    // point equals currentValue — keeps visual consistency with hero.
    const rets = daily.map((d) => {
      const accRet = (d.eq - base) / base;
      drift += (rand() - 0.5) * noiseK;
      return accRet * amp + drift;
    });
    const finalRet = rets[rets.length - 1];
    return daily.map((d, i) => ({
      date: d.date,
      ret: rets[i],
      mv: currentValue * (1 + rets[i]) / (1 + finalRet),
    }));
  }, [sleeve, currentValue, seed, daily]);

  const W = 620;
  const H = 64;
  const PAD_X = 2;
  const PAD_Y = 6;

  const cfgColor = {
    stocks:  'var(--vr-sleeve-stocks)',
    crypto:  'var(--vr-sleeve-crypto)',
    options: 'var(--vr-cream-faint)',
  }[sleeve];

  // ── Timeframe selector matches the EquityChart dropdown ──
  const TfControl = (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setTfMenu(v => !v)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 7px', background: 'rgba(241,236,224,0.04)',
        border: '1px solid var(--vr-line)', color: 'var(--vr-cream-dim)',
        fontFamily: 'var(--ff-sans)', fontSize: 9,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        cursor: 'pointer', borderRadius: 2,
      }}>{tfMeta?.label ?? tf} <span style={{ fontSize: 7, opacity: 0.6 }}>▾</span></button>
      {tfMenu && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0,
          background: 'var(--vr-ink-raised)',
          border: '1px solid var(--vr-line-hi)',
          borderRadius: 3, padding: 4, zIndex: 50,
          boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
          minWidth: 64,
        }}>
          {TIMEFRAMES.map(t => (
            <button key={t.k} onClick={() => { setTf(t.k); setTfMenu(false); setHover(null); }} style={{
              display: 'block', width: '100%', textAlign: 'right',
              padding: '5px 9px', background: t.k === tf ? 'rgba(200,169,104,0.08)' : 'transparent',
              border: 'none', color: t.k === tf ? 'var(--vr-gold)' : 'var(--vr-cream-dim)',
              fontFamily: 'var(--ff-sans)', fontSize: 9,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              cursor: 'pointer', borderRadius: 2,
            }}>{t.label}</button>
          ))}
        </div>
      )}
    </div>
  );

  // ── Options placeholder ──
  if (sleeve === 'options' || !pts) {
    return (
      <div style={{ marginTop: 14, position: 'relative' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 6,
        }}>
          <span className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-cream-mute)' }}>
            NO DATA · AWAITING PROMOTION
          </span>
          {TfControl}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: 'block' }}>
          <line x1={PAD_X} x2={W - PAD_X} y1={H / 2} y2={H / 2}
                stroke="var(--vr-line-hi)" strokeWidth="1" strokeDasharray="3 4" opacity="0.7"/>
        </svg>
      </div>
    );
  }

  const values = pts.map(p => mode === 'ret' ? p.ret : p.mv);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = (maxV - minV) || 1;
  const xStep = (W - PAD_X * 2) / Math.max(1, pts.length - 1);
  const yAt = (v) => PAD_Y + (H - PAD_Y * 2) * (1 - (v - minV) / range);
  const path = pts.map((p, i) => {
    const x = PAD_X + i * xStep;
    const y = yAt(mode === 'ret' ? p.ret : p.mv);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const areaPath = path + ` L ${(W - PAD_X).toFixed(1)} ${H} L ${PAD_X} ${H} Z`;

  const last = values[values.length - 1];
  const first = values[0];
  const changeRet = (pts[pts.length - 1].ret - pts[0].ret);
  const label = mode === 'ret'
    ? `${changeRet >= 0 ? '+' : ''}${(changeRet * 100).toFixed(2)}%`
    : fmtCurrency(last);

  const gradId = `sleeve-spark-${sleeve}`;
  const hoveredV = hover != null ? values[hover] : last;
  const hoveredP = hover != null ? pts[hover] : pts[pts.length - 1];

  return (
    <div style={{ marginTop: 14, position: 'relative' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 6, gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-cream-mute)' }}>
            {mode === 'ret' ? 'CUMULATIVE RETURN' : 'MARKET VALUE'}
          </span>
          <span className="t-num" style={{
            fontSize: 12,
            color: mode === 'ret'
              ? toneColor(toneOf(hover != null ? hoveredV : changeRet))
              : 'var(--vr-cream)',
          }}>
            {mode === 'ret'
              ? `${hoveredV >= 0 ? '+' : ''}${(hoveredV * 100).toFixed(2)}%`
              : fmtCurrency(hoveredV)}
          </span>
          {hover != null && (
            <span className="t-label" style={{ fontSize: 10, color: 'var(--vr-cream-mute)' }}>
              {hoveredP.date}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 1, background: 'rgba(241,236,224,0.03)', border: '1px solid var(--vr-line)', borderRadius: 3, padding: 1 }}>
            {[{k:'ret', l:'RET'}, {k:'mv', l:'MV'}].map(t => (
              <button
                key={t.k}
                onClick={() => setMode(t.k)}
                className="t-eyebrow"
                style={{
                  padding: '3px 7px', borderRadius: 2, border: 'none', cursor: 'pointer',
                  background: mode === t.k ? 'var(--vr-cream-faint)' : 'transparent',
                  color: mode === t.k ? 'var(--vr-ink)' : 'var(--vr-cream-mute)',
                  fontWeight: 600, fontSize: 8,
                }}
              >{t.l}</button>
            ))}
          </div>
          {TfControl}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: 'block' }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * W;
          const i = Math.max(0, Math.min(pts.length - 1, Math.round((x - PAD_X) / xStep)));
          setHover(i);
        }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={cfgColor} stopOpacity="0.28"/>
            <stop offset="100%" stopColor={cfgColor} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {mode === 'ret' && minV < 0 && maxV > 0 && (
          <line
            x1={PAD_X} x2={W - PAD_X}
            y1={yAt(0)} y2={yAt(0)}
            stroke="var(--vr-line-hi)" strokeWidth="0.6" strokeDasharray="2 3"
          />
        )}
        <path d={areaPath} fill={`url(#${gradId})`}/>
        <path d={path} fill="none" stroke={cfgColor} strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round"/>
        {hover != null && (
          <>
            <line
              x1={PAD_X + hover * xStep} x2={PAD_X + hover * xStep}
              y1={0} y2={H}
              stroke="var(--vr-line-hi)" strokeWidth="0.6"
            />
            <circle
              cx={PAD_X + hover * xStep}
              cy={yAt(mode === 'ret' ? hoveredP.ret : hoveredP.mv)}
              r="2.5" fill={cfgColor} stroke="var(--vr-ink)" strokeWidth="0.8"
            />
          </>
        )}
      </svg>
    </div>
  );
}
function SleeveSummary({ sleeve, positions }) {
  const cfg = {
    stocks:  { c: 'var(--vr-sleeve-stocks)',  title: 'Stocks',  copy: 'Equity sleeve · momentum bias' },
    options: { c: 'var(--vr-sleeve-options)', title: 'Options', copy: 'Premium sleeve · BPS and hedges' },
    crypto:  { c: 'var(--vr-sleeve-crypto)',  title: 'Crypto',  copy: 'Digital asset sleeve' },
  }[sleeve];
  const total = positions.reduce((s, p) => s + p.mv, 0);
  const today = positions.reduce((s, p) => s + (p.today * p.mv), 0) / (total || 1);
  const upnl = positions.reduce((s, p) => s + p.upnl, 0);

  return (
    <div className="vr-card-hero" style={{ padding: '22px', borderColor: `${cfg.c}33` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 5, height: 5, background: cfg.c, display: 'inline-block' }} />
        <span className="t-eyebrow" style={{ color: cfg.c }}>{cfg.title}</span>
      </div>
      <div className="t-display t-num" style={{ fontSize: 36 }}>
        {total === 0 ? '—' : fmtCurrency(total)}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, alignItems: 'baseline' }}>
        {total > 0 ? (
          <>
            <Delta value={today} size="12px" />
            <span className="t-label" style={{ fontSize: 11 }}>today</span>
            <span style={{ color: 'var(--vr-cream-faint)' }}>·</span>
            <span className="t-num" style={{ fontSize: 12, color: toneColor(toneOf(upnl)) }}>{fmtCurrency(upnl, { sign: true })}</span>
            <span className="t-label" style={{ fontSize: 11 }}>unrealized</span>
          </>
        ) : (
          <span className="t-label">{cfg.copy}</span>
        )}
      </div>
      <SleeveSparkline sleeve={sleeve} currentValue={total} />
    </div>
  );
}

// ─── Watchlist ──────────────────────────────────────────────────
function Watchlist({ sleeve }) {
  const items = D.watchlist;
  const toneFor = (t) => t === 'MOMENTUM LONG' ? 'gold' : t === 'REGIME GATE' ? 'warn' : 'neutral';
  return (
    <div className="vr-card">
      <div style={{ padding: '14px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="t-eyebrow">Qualified Universe</div>
        <span className="t-label" style={{ fontSize: 10, color: 'var(--vr-cream-mute)' }}>
          {items.filter(w => w.inPosition).length} active · {items.length} tracked
        </span>
      </div>
      <div className="vr-divide" style={{ borderTop: '1px solid var(--vr-line)' }}>
        {items.map(w => (
          <div key={w.symbol} style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="t-ticker" style={{ fontSize: 13 }}>{w.symbol}</span>
                <StatusPill tone={toneFor(w.trigger)}>{w.trigger}</StatusPill>
              </div>
              <div className="t-label" style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--vr-cream-mute)' }}>{w.note}</div>
            </div>
            <div style={{ textAlign: 'right', minWidth: 70 }}>
              {w.stop ? (
                <>
                  <div className="t-num" style={{ fontSize: 10, color: 'var(--vr-down)' }}>SL ${fmtNum(w.stop, 2)}</div>
                  <div className="t-num" style={{ fontSize: 10, color: 'var(--vr-up)', marginTop: 2 }}>TP ${fmtNum(w.target, 2)}</div>
                </>
              ) : w.mom20 != null ? (
                <>
                  <div className="t-num" style={{ fontSize: 11, color: 'var(--vr-cream)' }}>${fmtNum(w.last, 2)}</div>
                  <div className="t-num" style={{
                    fontSize: 10, marginTop: 2,
                    color: w.mom20 >= 0 ? 'var(--vr-up)' : 'var(--vr-down)'
                  }}>
                    {w.mom20 >= 0 ? '+' : ''}{w.mom20.toFixed(2)}% 20d
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Crypto signal card — TSMOM state ──────────────────────────
function CryptoTSMOM() {
  const s = D.cryptoSignals.tsmom;
  return (
    <div className="vr-card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 4 }}>BTC 4H TSMOM</div>
          <div className="t-h3" style={{ fontSize: 16 }}>Time-Series Momentum</div>
        </div>
        <StatusPill tone={s.signal === 'ARMED' ? 'up' : 'neutral'} pulse={s.signal === 'ARMED'}>
          {s.signal}
        </StatusPill>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderTop: '1px solid var(--vr-line)' }}>
        <div style={{ padding: '12px 0 4px', paddingRight: 12 }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Bar</div>
          <div className="t-num" style={{ fontSize: 14, color: 'var(--vr-cream)' }}>{s.bar}</div>
        </div>
        <div style={{ padding: '12px 12px 4px', borderLeft: '1px solid var(--vr-line)' }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Direction</div>
          <div className="t-num" style={{ fontSize: 14, color: 'var(--vr-cream)' }}>{s.direction}</div>
        </div>
        <div style={{ padding: '12px 0 4px 12px', borderLeft: '1px solid var(--vr-line)' }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Last Cross</div>
          <div className="t-num" style={{ fontSize: 11, color: 'var(--vr-cream)' }}>{s.lastCross}</div>
        </div>
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--vr-line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span className="t-label" style={{ fontSize: 10 }}>Signal Strength</span>
          <span className="t-num" style={{ fontSize: 11, color: 'var(--vr-gold)' }}>{(s.strength * 100).toFixed(0)}%</span>
        </div>
        <div style={{ height: 4, background: 'rgba(241,236,224,0.05)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${s.strength * 100}%`, height: '100%',
            background: 'linear-gradient(to right, var(--vr-gold), rgba(200,169,104,0.6))',
          }} />
        </div>
      </div>
    </div>
  );
}

// ─── Crypto exposure ladder ─────────────────────────────────────
function CryptoExposure() {
  const e = D.cryptoSignals.exposure;
  const tiers = [
    { label: 'Tier 1', notional: 80, active: e.notional === 80, note: 'Constructive regime' },
    { label: 'Tier 2', notional: 70, active: e.notional === 70, note: 'Neutral regime' },
    { label: 'Tier 3', notional: 0,  active: e.notional === 0,  note: 'Risk-off' },
  ];
  return (
    <div className="vr-card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 4 }}>Managed Exposure</div>
          <div className="t-h3" style={{ fontSize: 16 }}>Graduated {e.ladder} ladder</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Current</div>
          <div className="t-num" style={{ fontSize: 18, color: 'var(--vr-gold)', fontWeight: 500 }}>{e.notional}%</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tiers.map(t => (
          <div key={t.label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px',
            background: t.active ? 'rgba(200,169,104,0.06)' : 'transparent',
            border: `1px solid ${t.active ? 'var(--vr-gold-line)' : 'var(--vr-line)'}`,
            borderRadius: 2,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: t.active ? 'var(--vr-gold)' : 'var(--vr-cream-faint)',
              boxShadow: t.active ? '0 0 8px var(--vr-gold)' : 'none',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="t-eyebrow" style={{ fontSize: 10, color: t.active ? 'var(--vr-gold)' : 'var(--vr-cream-dim)' }}>{t.label}</span>
                <span className="t-label" style={{ fontSize: 10, color: 'var(--vr-cream-mute)' }}>{t.note}</span>
              </div>
            </div>
            <span className="t-num" style={{ fontSize: 13, color: t.active ? 'var(--vr-cream)' : 'var(--vr-cream-mute)', fontWeight: 500 }}>{t.notional}%</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, padding: '10px 12px', borderTop: '1px solid var(--vr-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="t-label" style={{ fontSize: 11 }}>Tactical Top-Up</span>
        <StatusPill tone="gold" pulse>{e.tactical}</StatusPill>
      </div>
    </div>
  );
}

// ─── Crypto universe ────────────────────────────────────────────
function CryptoUniverse() {
  const items = D.cryptoUniverse;
  return (
    <div className="vr-card">
      <div style={{ padding: '14px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="t-eyebrow">Tracked Assets</div>
        <span className="t-label" style={{ fontSize: 10, color: 'var(--vr-cream-mute)' }}>
          {items.filter(w => w.inPosition).length} active · {items.length} tracked
        </span>
      </div>
      <div className="vr-divide" style={{ borderTop: '1px solid var(--vr-line)' }}>
        {items.map(w => (
          <div key={w.symbol} style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="t-ticker" style={{ fontSize: 13 }}>{w.symbol}</span>
                <StatusPill tone="gold">{w.trigger}</StatusPill>
              </div>
              <div className="t-label" style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--vr-cream-mute)' }}>{w.note}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="t-num" style={{ fontSize: 11, color: 'var(--vr-cream)' }}>${fmtNum(w.last, 2)}</div>
              <div className="t-num" style={{ fontSize: 10, color: 'var(--vr-gold)', marginTop: 2 }}>{w.exposure}% exposure</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sleeve sub-screen (Stocks / Options / Crypto) ─────────────
function SleeveScreen({ sleeve }) {
  const positions = D.positions.filter(p => p.sleeve === sleeve);
  return (
    <div className="vr-screen" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SleeveSummary sleeve={sleeve} positions={positions} />

      {positions.length > 0 ? (
        <div className="vr-card">
          <div style={{ padding: '14px 16px 10px' }}>
            <div className="t-eyebrow">Open Positions</div>
          </div>
          <div className="vr-divide" style={{ borderTop: '1px solid var(--vr-line)' }}>
            {positions.map(p => <PositionRow key={p.symbol} p={p} />)}
          </div>
        </div>
      ) : (
        <div className="vr-card" style={{ padding: '20px 18px' }}>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>Open Positions</div>
          <div className="t-h4" style={{ color: 'var(--vr-cream-dim)' }}>None</div>
          <div className="t-label" style={{ fontSize: 11, marginTop: 4 }}>Sleeve idle pending strategy promotion from Bench.</div>
        </div>
      )}

      {sleeve === 'stocks' && <Watchlist />}

      {sleeve === 'options' && (
        <div className="vr-card" style={{ padding: 18 }}>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>Bull Put Spreads · Hedges</div>
          <div className="t-h4" style={{ color: 'var(--vr-cream-dim)' }}>No strategies deployed</div>
          <div className="t-label" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
            Awaiting BPS variant promotion from the Bench. Target: weekly income with defined risk.
          </div>
        </div>
      )}

      {sleeve === 'crypto' && (
        <>
          <CryptoTSMOM />
          <CryptoExposure />
          <CryptoUniverse />
        </>
      )}
    </div>
  );
}

// ─── Entry ─────────────────────────────────────────────────────
function TradingPage() {
  const [tab, setTab] = React.useState(() => localStorage.getItem('vr-tab') || 'home');
  React.useEffect(() => { localStorage.setItem('vr-tab', tab); }, [tab]);
  return (
    <div>
      <SubNav tab={tab} onTab={setTab} />
      {tab === 'home' && <HomeScreen onOpenSleeve={setTab} />}
      {tab !== 'home' && <SleeveScreen sleeve={tab} />}
    </div>
  );
}

Object.assign(window, { CommandStrip, TradingPage });
