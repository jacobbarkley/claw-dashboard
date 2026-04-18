// primer-stability-shared.jsx
// Shared primitives for the Parameter Stability / Plateau View primer.
// Everything here is visual — no data logic beyond rendering helpers.

const PD = window.VIRES_PRIMER_DATA;

// ─── color scale ─────────────────────────────────────────────────────
// Restrained, 2-hue diverging: cool-dim (low Sharpe) → warm champagne (high).
// Uses the midnight-ink palette; never enters rainbow territory.
function sharpeToFill(v, vMin, vMax) {
  const t = Math.max(0, Math.min(1, (v - vMin) / (vMax - vMin)));
  // quintile bands — editorial, not continuous
  if (t < 0.15) return 'rgba(74, 78, 96, 0.55)';       // deep slate
  if (t < 0.35) return 'rgba(94, 96, 112, 0.65)';      // dim slate
  if (t < 0.55) return 'rgba(132, 118, 86, 0.70)';     // warm muddy
  if (t < 0.75) return 'rgba(170, 142, 86, 0.82)';     // brass
  if (t < 0.90) return 'rgba(200, 169, 104, 0.92)';    // champagne
  return         'rgba(244, 213, 138, 1.0)';            // bright champagne
}

function sharpeToStroke(v, vMin, vMax) {
  const t = Math.max(0, Math.min(1, (v - vMin) / (vMax - vMin)));
  if (t < 0.55) return 'rgba(241, 236, 224, 0.05)';
  return 'rgba(200, 169, 104, 0.20)';
}

// ─── reusable SVG defs ───────────────────────────────────────────────
// Diagonal hatch for hard-rejected cells. Slate, low contrast — evidence
// of "tried & failed", not an error state.
function SvgDefs() {
  return (
    <defs>
      <pattern id="reject-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
        <rect width="5" height="5" fill="#0c0d18"/>
        <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(138, 133, 117, 0.35)" strokeWidth="1"/>
      </pattern>
      <pattern id="reject-hatch-tiny" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)">
        <rect width="3" height="3" fill="#0c0d18"/>
        <line x1="0" y1="0" x2="0" y2="3" stroke="rgba(138, 133, 117, 0.35)" strokeWidth="0.6"/>
      </pattern>
      {/* soft topography for variation B */}
      <radialGradient id="plateau-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="rgba(244, 213, 138, 0.28)"/>
        <stop offset="60%" stopColor="rgba(200, 169, 104, 0.10)"/>
        <stop offset="100%" stopColor="rgba(200, 169, 104, 0)"/>
      </radialGradient>
      <filter id="soft-blur" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6"/>
      </filter>
    </defs>
  );
}

// ─── plateau outline: traces the union of plateau cells ──────────────
// Rendered as a marching-squares-style polygon by tracing the outer
// boundary of the plateau region in grid coordinates. Keeps it simple:
// for each plateau cell, if its neighbor in direction d is NOT plateau,
// draw that edge.
function plateauEdges(cells, cellW, cellH, x0, y0) {
  const key = (i, j) => `${i},${j}`;
  const set = new Set(cells.filter(c => c.plateau).map(c => key(c.i, c.j)));
  const edges = [];
  for (const c of cells) {
    if (!c.plateau) continue;
    const x = x0 + c.i * cellW;
    const y = y0 + c.j * cellH;
    // top
    if (!set.has(key(c.i, c.j - 1))) edges.push(`M ${x} ${y} L ${x + cellW} ${y}`);
    // bottom
    if (!set.has(key(c.i, c.j + 1))) edges.push(`M ${x} ${y + cellH} L ${x + cellW} ${y + cellH}`);
    // left
    if (!set.has(key(c.i - 1, c.j))) edges.push(`M ${x} ${y} L ${x} ${y + cellH}`);
    // right
    if (!set.has(key(c.i + 1, c.j))) edges.push(`M ${x + cellW} ${y} L ${x + cellW} ${y + cellH}`);
  }
  return edges.join(' ');
}

// ─── Axis ticks with human labels ────────────────────────────────────
function AxisX({ width, x0, cellW, values, label, tickLeft, tickRight, y }) {
  return (
    <g>
      {values.map((v, i) => (
        <text
          key={i}
          x={x0 + i * cellW + cellW / 2}
          y={y + 14}
          fontSize="8.5"
          fill="var(--vr-cream-mute)"
          textAnchor="middle"
          fontFamily="var(--ff-mono)"
        >
          {v.toFixed(1)}
        </text>
      ))}
      {/* bracket labels */}
      <text x={x0} y={y + 28} fontSize="8" fill="var(--vr-cream-faint)"
            fontFamily="var(--ff-sans)" letterSpacing="0.22em">
        ← {tickLeft.toUpperCase()}
      </text>
      <text x={x0 + values.length * cellW} y={y + 28} fontSize="8" fill="var(--vr-cream-faint)"
            fontFamily="var(--ff-sans)" letterSpacing="0.22em" textAnchor="end">
        {tickRight.toUpperCase()} →
      </text>
      <text
        x={x0 + (values.length * cellW) / 2}
        y={y + 44}
        fontSize="9"
        fill="var(--vr-cream-dim)"
        textAnchor="middle"
        fontFamily="var(--ff-sans)"
        letterSpacing="0.18em"
        style={{ textTransform: 'uppercase' }}
      >{label}</text>
    </g>
  );
}

function AxisY({ height, y0, cellH, values, label, tickLeft, tickRight, x }) {
  return (
    <g>
      {values.map((v, j) => (
        <text
          key={j}
          x={x - 10}
          y={y0 + j * cellH + cellH / 2 + 3}
          fontSize="8.5"
          fill="var(--vr-cream-mute)"
          textAnchor="end"
          fontFamily="var(--ff-mono)"
        >
          {v.toFixed(1)}
        </text>
      ))}
      <text x={x - 36} y={y0 - 6} fontSize="8" fill="var(--vr-cream-faint)"
            letterSpacing="0.22em" fontFamily="var(--ff-sans)">
        ↑ {tickRight.toUpperCase()}
      </text>
      <text x={x - 36} y={y0 + values.length * cellH + 10} fontSize="8" fill="var(--vr-cream-faint)"
            letterSpacing="0.22em" fontFamily="var(--ff-sans)">
        ↓ {tickLeft.toUpperCase()}
      </text>
      <text
        x={-y0 - (values.length * cellH) / 2}
        y={x - 46}
        fontSize="9"
        fill="var(--vr-cream-dim)"
        textAnchor="middle"
        fontFamily="var(--ff-sans)"
        letterSpacing="0.18em"
        style={{ textTransform: 'uppercase' }}
        transform="rotate(-90)"
      >{label}</text>
    </g>
  );
}

// ─── Plateau-detected badge ──────────────────────────────────────────
function PlateauBadge({ count, cut }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      padding: '6px 12px 6px 10px',
      border: '1px solid var(--vr-gold-line)',
      background: 'var(--vr-gold-soft)',
      borderRadius: 2,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 0,
        background: 'var(--vr-gold)',
        transform: 'rotate(45deg)',
      }}/>
      <span className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-gold)', letterSpacing: '0.24em' }}>
        PLATEAU DETECTED
      </span>
      <span style={{ width: 1, height: 10, background: 'var(--vr-gold-line)' }}/>
      <span className="t-num" style={{ fontSize: 10, color: 'var(--vr-cream-dim)' }}>
        {count} cells ≥ {(cut).toFixed(2)}
      </span>
    </div>
  );
}

// ─── Glossary / primer popover ───────────────────────────────────────
function PrimerLink({ onOpen }) {
  return (
    <button onClick={onOpen}
      style={{
        background: 'none', border: 'none', padding: 0,
        color: 'var(--vr-gold)', cursor: 'pointer',
        fontFamily: 'var(--ff-sans)', fontSize: 11,
        letterSpacing: 0.02, borderBottom: '1px dashed var(--vr-gold-line)',
      }}>
      What's a plateau? →
    </button>
  );
}

function PrimerPopover({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(6, 7, 14, 0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, animation: 'fadeIn 0.2s ease',
        backdropFilter: 'blur(4px)',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="vr-card"
        style={{
          width: 480, padding: '28px 32px',
          animation: 'popIn 0.25s ease',
          background: 'rgba(15, 16, 32, 0.95)',
        }}>
        <div className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-gold)' }}>PRIMER</div>
        <div className="t-h2" style={{ fontSize: 26, marginTop: 8, lineHeight: 1.2 }}>
          Why plateaus beat <span className="t-accent">lucky peaks.</span>
        </div>
        <div className="t-read" style={{ fontSize: 13, marginTop: 18, color: 'var(--vr-cream-dim)', lineHeight: 1.6 }}>
          When you sweep a strategy across a range of parameters, the highest single cell
          is often a coincidence — a lucky alignment with one segment of history.
          It won't survive the next regime.
        </div>
        <div className="t-read" style={{ fontSize: 13, marginTop: 14, color: 'var(--vr-cream-dim)', lineHeight: 1.6 }}>
          A <span style={{ color: 'var(--vr-gold)' }}>plateau</span> is a region of neighboring
          parameter sets that all perform well. Broad plateaus suggest the edge is about the
          underlying idea — not one brittle value. That's what survives out-of-sample.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 22 }}>
          <PrimerExampleCard kind="lucky" />
          <PrimerExampleCard kind="plateau" />
        </div>

        <div className="t-read" style={{ fontSize: 11, marginTop: 18, color: 'var(--vr-cream-mute)', lineHeight: 1.5, fontStyle: 'italic' }}>
          Vires promotes the center of the plateau — not the single best cell.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} className="t-eyebrow" style={{
            background: 'none', border: '1px solid var(--vr-line-hi)',
            padding: '6px 14px', color: 'var(--vr-cream-dim)',
            cursor: 'pointer', borderRadius: 2, fontSize: 9,
          }}>CLOSE</button>
        </div>
      </div>
    </div>
  );
}

// ─── Contrast thumbnails: lucky peak vs broad plateau ────────────────
function PrimerExampleCard({ kind }) {
  const W = 160, H = 96, N = 8, M = 5;
  const cw = W / N, ch = H / M;
  const isLucky = kind === 'lucky';
  // synthesize a tiny grid for illustration
  const cells = [];
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      let v;
      if (isLucky) {
        v = (i === 5 && j === 2) ? 1.0 : 0.15 + ((i * 7 + j * 13) % 5) * 0.04;
      } else {
        const d = Math.hypot(i - 4, j - 2);
        v = Math.max(0.1, 0.95 * Math.exp(-(d * d) / 6));
      }
      cells.push({ i, j, v });
    }
  }
  const max = Math.max(...cells.map(c => c.v));
  return (
    <div className="vr-inset" style={{ padding: 10 }}>
      <div className="t-eyebrow" style={{ fontSize: 8, color: isLucky ? 'var(--vr-warn, #c7a86b)' : 'var(--vr-gold)' }}>
        {isLucky ? 'LUCKY POINT' : 'BROAD PLATEAU'}
      </div>
      <svg width={W} height={H} style={{ display: 'block', marginTop: 6 }}>
        {cells.map((c, k) => (
          <rect key={k}
            x={c.i * cw + 0.5} y={c.j * ch + 0.5}
            width={cw - 1} height={ch - 1}
            fill={sharpeToFill(c.v, 0, max)}
            opacity={0.95}
          />
        ))}
      </svg>
      <div className="t-read" style={{ fontSize: 10.5, color: 'var(--vr-cream-mute)', marginTop: 8, lineHeight: 1.45 }}>
        {isLucky
          ? 'One bright cell, dark neighbors. Fragile — breaks when markets shift.'
          : 'Bright cluster. Robust — the edge persists across nearby parameters.'}
      </div>
    </div>
  );
}

// ─── Natural-language summary ────────────────────────────────────────
function StabilitySummary({ winner, stats, axes }) {
  const stop = axes.stop.values[winner.i];
  const target = axes.target.values[winner.j];
  return (
    <div className="vr-inset" style={{ padding: '14px 16px' }}>
      <div className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-cream-mute)' }}>READING</div>
      <div className="t-read" style={{ fontSize: 12, color: 'var(--vr-cream)', marginTop: 8, lineHeight: 1.55 }}>
        This parameter set sits inside a{' '}
        <span style={{ color: 'var(--vr-gold)' }}>{stats.plateauCount}-cell robust region</span>.
        Stops between {(stop - 0.4).toFixed(1)}% and {(stop + 0.4).toFixed(1)}% produce comparable
        returns, suggesting the edge comes from the idea — not one lucky value.
      </div>
    </div>
  );
}

// ─── Neighborhood stats block ────────────────────────────────────────
function NeighborhoodStats({ cell }) {
  const rows = [
    { l: 'Mean',   v: cell.nbMean?.toFixed(2) },
    { l: 'Min',    v: cell.nbMin?.toFixed(2) },
    { l: 'Max',    v: cell.nbMax?.toFixed(2) },
    { l: 'Spread', v: cell.nbSpread?.toFixed(2) },
  ];
  return (
    <div>
      <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 8 }}>8-NEIGHBORHOOD</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, border: '1px solid var(--vr-line)' }}>
        {rows.map((r, i) => (
          <div key={r.l} style={{
            padding: '10px 8px',
            borderLeft: i > 0 ? '1px solid var(--vr-line)' : 'none',
          }}>
            <div className="t-eyebrow" style={{ fontSize: 8 }}>{r.l}</div>
            <div className="t-num" style={{ fontSize: 14, color: 'var(--vr-cream)', marginTop: 4 }}>{r.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tooltip (floating, shown on hover) ──────────────────────────────
function CellTooltip({ cell, x, y, axes }) {
  if (!cell) return null;
  return (
    <div style={{
      position: 'absolute', left: x + 12, top: y - 10,
      background: 'rgba(10, 11, 24, 0.96)',
      border: '1px solid var(--vr-line-hi)',
      padding: '8px 12px',
      fontFamily: 'var(--ff-mono)',
      fontSize: 10,
      color: 'var(--vr-cream)',
      pointerEvents: 'none',
      zIndex: 20,
      backdropFilter: 'blur(6px)',
      whiteSpace: 'nowrap',
    }}>
      <div style={{ color: 'var(--vr-cream-mute)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 4 }}>
        stop {axes.stop.values[cell.i].toFixed(1)}% · target {axes.target.values[cell.j].toFixed(1)}R
      </div>
      <div>Sharpe <span style={{ color: 'var(--vr-gold)' }}>{cell.sharpe.toFixed(2)}</span></div>
      <div style={{ color: 'var(--vr-cream-dim)' }}>Calmar {cell.calmar.toFixed(2)} · PF {cell.pf.toFixed(2)}</div>
      {cell.rejected && (
        <div style={{ color: 'var(--vr-cream-mute)', fontStyle: 'italic', marginTop: 4 }}>Hard-rejected</div>
      )}
      {cell.plateau && !cell.rejected && (
        <div style={{ color: 'var(--vr-gold)', marginTop: 4 }}>✓ in plateau</div>
      )}
    </div>
  );
}

Object.assign(window, {
  sharpeToFill, sharpeToStroke, plateauEdges,
  SvgDefs, AxisX, AxisY, PlateauBadge,
  PrimerLink, PrimerPopover, PrimerExampleCard,
  StabilitySummary, NeighborhoodStats, CellTooltip,
});
