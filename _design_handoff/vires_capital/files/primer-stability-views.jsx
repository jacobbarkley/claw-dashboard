// primer-stability-views.jsx
// The three plateau-view variations.
//
//   A — Classic editorial grid. Thin gold outline around the plateau.
//   B — Grid + soft topography / contour overlay (map-like).
//   C — Grid + bubble cells (size = neighborhood robustness).

const PD = window.VIRES_PRIMER_DATA;

// ─── grid geometry ───────────────────────────────────────────────────
const GRID = {
  cellW: 34,
  cellH: 32,
  x0: 64,
  y0: 24,
};
const gridPixelW = GRID.x0 + PD.axes.stop.values.length * GRID.cellW + 20;
const gridPixelH = GRID.y0 + PD.axes.target.values.length * GRID.cellH + 56;

const minS = Math.min(...PD.cells.map(c => c.sharpe));
const maxS = Math.max(...PD.cells.map(c => c.sharpe));

// ─── shared: one cell (rect) ─────────────────────────────────────────
function HeatCell({ cell, onHover, onSelect, selected, variant = 'A' }) {
  const x = GRID.x0 + cell.i * GRID.cellW;
  const y = GRID.y0 + cell.j * GRID.cellH;
  const isWinner = cell.winner;
  const isLucky  = cell.luckyPeak;

  if (cell.rejected) {
    return (
      <g
        onMouseEnter={(e) => onHover(cell, e)}
        onMouseLeave={() => onHover(null, null)}
      >
        <rect
          x={x + 0.5} y={y + 0.5}
          width={GRID.cellW - 1} height={GRID.cellH - 1}
          fill="url(#reject-hatch)"
          stroke="rgba(138, 133, 117, 0.15)"
          strokeWidth="0.5"
          style={{ cursor: 'not-allowed' }}
        />
      </g>
    );
  }

  const fill = sharpeToFill(cell.sharpe, minS, maxS);

  // Variation C: bubble cells — draw a faint bg rect and an inner disc
  if (variant === 'C') {
    const maxR = Math.min(GRID.cellW, GRID.cellH) / 2 - 2;
    const robust = (cell.eraRobustness ?? 6) / 12;
    const r = Math.max(3, maxR * (0.35 + robust * 0.65));
    return (
      <g
        onMouseEnter={(e) => onHover(cell, e)}
        onMouseLeave={() => onHover(null, null)}
        onClick={() => onSelect(cell)}
        style={{ cursor: 'pointer' }}
      >
        <rect
          x={x + 0.5} y={y + 0.5}
          width={GRID.cellW - 1} height={GRID.cellH - 1}
          fill="rgba(15, 16, 32, 0.4)"
          stroke="rgba(241, 236, 224, 0.04)"
          strokeWidth="0.5"
        />
        <circle
          cx={x + GRID.cellW / 2}
          cy={y + GRID.cellH / 2}
          r={r}
          fill={fill}
          opacity={0.95}
        />
        {isWinner && (
          <g>
            <text x={x + GRID.cellW - 4} y={y + 9} fontSize="9" fill="var(--vr-ink)" textAnchor="end" fontWeight="600">★</text>
          </g>
        )}
        {selected && (
          <rect
            x={x + 1} y={y + 1}
            width={GRID.cellW - 2} height={GRID.cellH - 2}
            fill="none" stroke="var(--vr-cream)" strokeWidth="1.2"
          />
        )}
      </g>
    );
  }

  return (
    <g
      onMouseEnter={(e) => onHover(cell, e)}
      onMouseLeave={() => onHover(null, null)}
      onClick={() => onSelect(cell)}
      style={{ cursor: 'pointer' }}
    >
      <rect
        x={x + 0.5} y={y + 0.5}
        width={GRID.cellW - 1} height={GRID.cellH - 1}
        fill={fill}
        stroke={sharpeToStroke(cell.sharpe, minS, maxS)}
        strokeWidth="0.5"
      />
      {isWinner && (
        <g>
          {/* small crosshair + star in corner, never dominating the cell */}
          <text x={x + GRID.cellW - 4} y={y + 10} fontSize="9" fill="var(--vr-ink)" textAnchor="end" fontWeight="600">★</text>
        </g>
      )}
      {isLucky && !isWinner && (
        <circle cx={x + GRID.cellW - 6} cy={y + 7} r="1.6" fill="var(--vr-down)" opacity="0.9"/>
      )}
      {selected && (
        <rect
          x={x + 1} y={y + 1}
          width={GRID.cellW - 2} height={GRID.cellH - 2}
          fill="none" stroke="var(--vr-cream)" strokeWidth="1.2"
        />
      )}
    </g>
  );
}

// ─── the core plateau grid ───────────────────────────────────────────
function PlateauGrid({ variant, selected, onSelect, onHover, showPlateauEdges = true, showContour = false }) {
  return (
    <svg
      width={gridPixelW}
      height={gridPixelH}
      style={{ display: 'block' }}
    >
      <SvgDefs/>

      {/* B: soft topography — blurred gaussian glow over plateau region */}
      {showContour && (
        <g filter="url(#soft-blur)" opacity="0.85">
          {PD.cells.filter(c => !c.rejected).map((c, k) => {
            const t = Math.max(0, (c.sharpe - minS) / (maxS - minS));
            if (t < 0.55) return null;
            return (
              <circle
                key={k}
                cx={GRID.x0 + c.i * GRID.cellW + GRID.cellW / 2}
                cy={GRID.y0 + c.j * GRID.cellH + GRID.cellH / 2}
                r={GRID.cellW * 0.95}
                fill={sharpeToFill(c.sharpe, minS, maxS)}
                opacity={0.35}
              />
            );
          })}
        </g>
      )}

      {/* cells */}
      {PD.cells.map((c, k) => (
        <HeatCell
          key={k}
          cell={c}
          variant={variant}
          onHover={onHover}
          onSelect={onSelect}
          selected={selected && selected.i === c.i && selected.j === c.j}
        />
      ))}

      {/* B: iso-line contours (3 levels) */}
      {showContour && (
        <g fill="none" stroke="rgba(200, 169, 104, 0.6)" strokeWidth="0.7">
          {[0.70, 0.82, 0.92].map((pct, idx) => (
            <ContourIsoLine key={idx} pct={pct} opacity={0.25 + idx * 0.25} />
          ))}
        </g>
      )}

      {/* plateau outline — thin gold stroke traced around plateau region */}
      {showPlateauEdges && (
        <path
          d={plateauEdges(PD.cells, GRID.cellW, GRID.cellH, GRID.x0, GRID.y0)}
          fill="none"
          stroke="var(--vr-gold)"
          strokeWidth="1.4"
          opacity="0.9"
        />
      )}

      {/* axes */}
      <AxisX
        width={gridPixelW}
        x0={GRID.x0}
        cellW={GRID.cellW}
        values={PD.axes.stop.values}
        label={PD.axes.stop.label}
        tickLeft={PD.axes.stop.tickLeft}
        tickRight={PD.axes.stop.tickRight}
        y={GRID.y0 + PD.axes.target.values.length * GRID.cellH}
      />
      <AxisY
        height={gridPixelH}
        y0={GRID.y0}
        cellH={GRID.cellH}
        values={PD.axes.target.values}
        label={PD.axes.target.label}
        tickLeft={PD.axes.target.tickLeft}
        tickRight={PD.axes.target.tickRight}
        x={GRID.x0}
      />
    </svg>
  );
}

// ─── smooth iso-line generator (marching squares on bilinear grid) ──
function ContourIsoLine({ pct, opacity }) {
  const threshold = minS + (maxS - minS) * pct;
  // Simple approach: for each cell, check if threshold passes through.
  // We sample a dense grid of the bilinearly-interpolated sharpe field
  // and run marching squares.
  const W = PD.axes.stop.values.length;
  const H = PD.axes.target.values.length;
  const get = (i, j) => PD.cells.find(c => c.i === i && c.j === j);
  const field = (i, j) => {
    const c = get(i, j);
    if (!c || c.rejected) return 0;
    return c.sharpe;
  };
  const K = 4; // subdivisions per cell
  const edges = [];
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      for (let sj = 0; sj < K; sj++) {
        for (let si = 0; si < K; si++) {
          const u0 = si / K, u1 = (si + 1) / K;
          const v0 = sj / K, v1 = (sj + 1) / K;
          const a = field(i, j)       * (1 - u0) * (1 - v0) + field(i + 1, j) * u0 * (1 - v0) + field(i, j + 1) * (1 - u0) * v0 + field(i + 1, j + 1) * u0 * v0;
          const b = field(i, j)       * (1 - u1) * (1 - v0) + field(i + 1, j) * u1 * (1 - v0) + field(i, j + 1) * (1 - u1) * v0 + field(i + 1, j + 1) * u1 * v0;
          const c2 = field(i, j)      * (1 - u1) * (1 - v1) + field(i + 1, j) * u1 * (1 - v1) + field(i, j + 1) * (1 - u1) * v1 + field(i + 1, j + 1) * u1 * v1;
          const d = field(i, j)       * (1 - u0) * (1 - v1) + field(i + 1, j) * u0 * (1 - v1) + field(i, j + 1) * (1 - u0) * v1 + field(i + 1, j + 1) * u0 * v1;
          const code = (a >= threshold ? 1 : 0) | (b >= threshold ? 2 : 0) | (c2 >= threshold ? 4 : 0) | (d >= threshold ? 8 : 0);
          if (code === 0 || code === 15) continue;
          const cx = (ix, iy) => GRID.x0 + (i + ix) * GRID.cellW + GRID.cellW / 2;
          const cy = (ix, iy) => GRID.y0 + (j + iy) * GRID.cellH + GRID.cellH / 2;
          // compute actual pixel positions at sub-sample resolution
          const px = (uu, vv) => GRID.x0 + (i + uu) * GRID.cellW + GRID.cellW * 0.5;
          const py = (uu, vv) => GRID.y0 + (j + vv) * GRID.cellH + GRID.cellH * 0.5;
          const pA = [px(u0, v0), py(u0, v0)];
          const pB = [px(u1, v0), py(u1, v0)];
          const pC = [px(u1, v1), py(u1, v1)];
          const pD = [px(u0, v1), py(u0, v1)];
          const mid = (p1, p2, v1, v2) => {
            const t = (threshold - v1) / (v2 - v1 || 1e-9);
            return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
          };
          const lines = [];
          const pushLine = (p, q) => lines.push([p, q]);
          switch (code) {
            case 1: case 14: pushLine(mid(pA, pB, a, b), mid(pA, pD, a, d)); break;
            case 2: case 13: pushLine(mid(pA, pB, a, b), mid(pB, pC, b, c2)); break;
            case 3: case 12: pushLine(mid(pA, pD, a, d), mid(pB, pC, b, c2)); break;
            case 4: case 11: pushLine(mid(pC, pB, c2, b), mid(pC, pD, c2, d)); break;
            case 5: pushLine(mid(pA, pB, a, b), mid(pB, pC, b, c2)); pushLine(mid(pA, pD, a, d), mid(pC, pD, c2, d)); break;
            case 6: case 9: pushLine(mid(pA, pB, a, b), mid(pC, pD, c2, d)); break;
            case 7: case 8: pushLine(mid(pA, pD, a, d), mid(pC, pD, c2, d)); break;
            case 10: pushLine(mid(pA, pB, a, b), mid(pA, pD, a, d)); pushLine(mid(pB, pC, b, c2), mid(pC, pD, c2, d)); break;
          }
          for (const [p, q] of lines) edges.push(`M ${p[0].toFixed(1)} ${p[1].toFixed(1)} L ${q[0].toFixed(1)} ${q[1].toFixed(1)}`);
        }
      }
    }
  }
  return <path d={edges.join(' ')} style={{ opacity }}/>;
}

// ─── 1D slice: shown when a row or column is selected ────────────────
function SliceChart({ cell, axis = 'row' }) {
  if (!cell) return null;
  const W = 240, H = 80, PAD = 14;
  const pts = axis === 'row'
    ? PD.cells.filter(c => c.j === cell.j).sort((a, b) => a.i - b.i)
    : PD.cells.filter(c => c.i === cell.i).sort((a, b) => a.j - b.j);
  const vals = pts.map(p => p.rejected ? null : p.sharpe);
  const vmax = Math.max(...vals.filter(v => v != null), 1);
  const vmin = Math.min(...vals.filter(v => v != null), 0);
  const xStep = (W - PAD * 2) / (pts.length - 1);
  const y = (v) => H - PAD - ((v - vmin) / (vmax - vmin || 1)) * (H - PAD * 2);

  // area under the curve, broken around rejects
  const pathD = [];
  let moved = false;
  pts.forEach((p, i) => {
    if (p.rejected) { moved = false; return; }
    const px = PAD + i * xStep;
    const py = y(p.sharpe);
    pathD.push(moved ? `L ${px.toFixed(1)} ${py.toFixed(1)}` : `M ${px.toFixed(1)} ${py.toFixed(1)}`);
    moved = true;
  });

  return (
    <div>
      <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>
        1D SLICE · {axis === 'row' ? `TARGET = ${PD.axes.target.values[cell.j].toFixed(1)}R` : `STOP = ${PD.axes.stop.values[cell.i].toFixed(1)}%`}
      </div>
      <svg width={W} height={H} style={{ display: 'block', border: '1px solid var(--vr-line)' }}>
        <SvgDefs/>
        {/* rejected bands */}
        {pts.map((p, i) => p.rejected && (
          <rect key={i}
            x={PAD + i * xStep - xStep / 2}
            y={PAD}
            width={xStep}
            height={H - PAD * 2}
            fill="url(#reject-hatch-tiny)"
            opacity="0.9"
          />
        ))}
        {/* plateau threshold line */}
        <line
          x1={PAD} x2={W - PAD}
          y1={y(PD.stats.winnerSharpe * 0.85)}
          y2={y(PD.stats.winnerSharpe * 0.85)}
          stroke="var(--vr-gold-line)" strokeDasharray="2 3" strokeWidth="0.8"
        />
        <text x={W - PAD} y={y(PD.stats.winnerSharpe * 0.85) - 3}
          fontSize="7" fill="var(--vr-cream-mute)" textAnchor="end"
          fontFamily="var(--ff-mono)">
          0.85× peak
        </text>
        {/* curve */}
        <path d={pathD.join(' ')} fill="none" stroke="var(--vr-gold)" strokeWidth="1.3"/>
        {/* point markers */}
        {pts.map((p, i) => !p.rejected && (
          <circle key={i}
            cx={PAD + i * xStep}
            cy={y(p.sharpe)}
            r={p.winner ? 3 : 2}
            fill={p.winner ? 'var(--vr-gold)' : 'var(--vr-cream-dim)'}
            opacity={p.winner ? 1 : 0.7}
          />
        ))}
        {/* selected highlight */}
        <line
          x1={PAD + pts.findIndex(p => p.i === cell.i && p.j === cell.j) * xStep}
          x2={PAD + pts.findIndex(p => p.i === cell.i && p.j === cell.j) * xStep}
          y1={PAD} y2={H - PAD}
          stroke="var(--vr-cream)" strokeWidth="0.6" strokeDasharray="1 2" opacity="0.5"
        />
      </svg>
    </div>
  );
}

// ─── detail rail ─────────────────────────────────────────────────────
function DetailRail({ cell, sliceAxis, onSliceAxis }) {
  if (!cell) {
    return (
      <div className="t-read" style={{ fontSize: 12, color: 'var(--vr-cream-mute)', fontStyle: 'italic', lineHeight: 1.6 }}>
        Click any cell to inspect its neighborhood, era robustness, and 1D parameter slice.
      </div>
    );
  }
  const stop = PD.axes.stop.values[cell.i];
  const target = PD.axes.target.values[cell.j];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* header */}
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          {cell.winner && <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-gold)' }}>★ PROMOTED</span>}
          {cell.plateau && !cell.winner && <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-gold)' }}>IN PLATEAU</span>}
          {!cell.plateau && !cell.rejected && <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-cream-mute)' }}>OUTSIDE PLATEAU</span>}
          {cell.luckyPeak && <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-down)' }}>ISOLATED</span>}
          {cell.rejected && <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-cream-mute)' }}>HARD-REJECTED</span>}
        </div>
        <div className="t-ticker" style={{ fontSize: 12, color: 'var(--vr-cream)' }}>
          stop {stop.toFixed(1)}% · target {target.toFixed(1)}R
        </div>
        <div className="t-label" style={{ fontSize: 10, color: 'var(--vr-cream-mute)', marginTop: 2 }}>
          Parameter set · grid index ({cell.i}, {cell.j})
        </div>
      </div>

      {/* headline metric */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        border: '1px solid var(--vr-line)',
      }}>
        {[
          { l: 'Med Era Sharpe', v: cell.sharpe.toFixed(2), c: cell.winner ? 'var(--vr-gold)' : 'var(--vr-cream)' },
          { l: 'Calmar', v: cell.calmar.toFixed(2), c: 'var(--vr-cream)' },
          { l: 'Profit Factor', v: cell.pf.toFixed(2), c: 'var(--vr-cream)' },
        ].map((m, i) => (
          <div key={m.l} style={{ padding: '10px 10px', borderLeft: i > 0 ? '1px solid var(--vr-line)' : 'none' }}>
            <div className="t-eyebrow" style={{ fontSize: 8 }}>{m.l}</div>
            <div className="t-num" style={{ fontSize: 15, color: m.c, marginTop: 4 }}>{m.v}</div>
          </div>
        ))}
      </div>

      {!cell.rejected && <NeighborhoodStats cell={cell} />}

      {/* era robustness bar */}
      {!cell.rejected && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div className="t-eyebrow" style={{ fontSize: 9 }}>ERA ROBUSTNESS</div>
            <div className="t-num" style={{ fontSize: 10, color: 'var(--vr-cream-dim)' }}>
              {cell.eraRobustness}/12 eras
            </div>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 6,
                background: i < cell.eraRobustness ? 'var(--vr-gold)' : 'rgba(241,236,224,0.04)',
                opacity: i < cell.eraRobustness ? 0.85 : 1,
              }}/>
            ))}
          </div>
        </div>
      )}

      {/* slice toggle + chart */}
      {!cell.rejected && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {['row', 'col'].map(a => (
              <button key={a}
                onClick={() => onSliceAxis(a)}
                className="t-eyebrow"
                style={{
                  flex: 1, padding: '5px 8px',
                  background: sliceAxis === a ? 'var(--vr-gold-soft)' : 'rgba(241,236,224,0.02)',
                  border: '1px solid ' + (sliceAxis === a ? 'var(--vr-gold-line)' : 'var(--vr-line)'),
                  color: sliceAxis === a ? 'var(--vr-gold)' : 'var(--vr-cream-mute)',
                  fontSize: 8, cursor: 'pointer',
                }}>
                {a === 'row' ? 'ALONG STOP →' : 'ALONG TARGET ↑'}
              </button>
            ))}
          </div>
          <SliceChart cell={cell} axis={sliceAxis}/>
        </div>
      )}

      {/* note */}
      {cell.rejected && (
        <div className="t-read" style={{ fontSize: 11, color: 'var(--vr-cream-mute)', fontStyle: 'italic', lineHeight: 1.5 }}>
          This combination failed a hard-reject gate (cost-survival, min-bars-per-era,
          or era-robustness floor). Rejected territory remains visible as evidence — not error.
        </div>
      )}
      {cell.luckyPeak && !cell.rejected && (
        <div className="t-read" style={{ fontSize: 11, color: 'var(--vr-down)', fontStyle: 'italic', lineHeight: 1.5 }}>
          High Sharpe, but no nearby peers. A neighborhood collapse this steep usually
          won't hold out-of-sample.
        </div>
      )}
    </div>
  );
}

// ─── Metric switcher ─────────────────────────────────────────────────
function MetricSwitcher({ metric, onMetric }) {
  const opts = [
    { k: 'sharpe', label: 'MED ERA SHARPE' },
    { k: 'calmar', label: 'CALMAR' },
    { k: 'pf',     label: 'PROFIT FACTOR' },
  ];
  return (
    <div style={{ display: 'flex', gap: 0, border: '1px solid var(--vr-line)' }}>
      {opts.map((o, i) => (
        <button key={o.k}
          onClick={() => onMetric(o.k)}
          className="t-eyebrow"
          style={{
            padding: '6px 12px',
            borderLeft: i > 0 ? '1px solid var(--vr-line)' : 'none',
            background: metric === o.k ? 'var(--vr-gold-soft)' : 'transparent',
            color: metric === o.k ? 'var(--vr-gold)' : 'var(--vr-cream-mute)',
            border: 'none', borderLeft: i > 0 ? '1px solid var(--vr-line)' : 'none',
            fontSize: 8, cursor: 'pointer', letterSpacing: '0.22em',
            fontFamily: 'var(--ff-sans)',
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Legend (color scale) ────────────────────────────────────────────
function ColorLegend() {
  const bands = [
    { t: 0.08, label: '0.0' },
    { t: 0.25, label: '' },
    { t: 0.45, label: '' },
    { t: 0.65, label: '' },
    { t: 0.83, label: '' },
    { t: 0.96, label: `${maxS.toFixed(1)}` },
  ];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span className="t-eyebrow" style={{ fontSize: 8 }}>LOW</span>
      <div style={{ display: 'flex' }}>
        {bands.map((b, i) => (
          <div key={i} style={{
            width: 18, height: 10,
            background: sharpeToFill(minS + (maxS - minS) * b.t, minS, maxS),
          }}/>
        ))}
      </div>
      <span className="t-eyebrow" style={{ fontSize: 8 }}>HIGH</span>
    </div>
  );
}

// ─── Bubble size legend (Variation C only) ──────────────────────────
// Small inline pop explaining what bubble size encodes, with a mini
// visual scale. Hover or click to open.
function BubbleLegend() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  // close on outside click
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // scale samples — low / mid / high robustness
  const samples = [
    { r: 4,  eras: 3,  label: 'Fragile',    t: 0.20, note: '3 / 12 eras held up' },
    { r: 8,  eras: 7,  label: 'Middling',   t: 0.60, note: '7 / 12 eras held up' },
    { r: 13, eras: 11, label: 'Robust',     t: 0.95, note: '11 / 12 eras held up' },
  ];

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setOpen(true)}
        aria-label="Bubble size encoding"
        style={{
          width: 16, height: 16, borderRadius: '50%',
          background: 'rgba(241,236,224,0.04)',
          border: '1px solid var(--vr-line-hi)',
          color: 'var(--vr-cream-mute)',
          fontSize: 10, fontFamily: 'var(--ff-serif)',
          fontStyle: 'italic',
          cursor: 'pointer', padding: 0, lineHeight: '14px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
        i
      </button>

      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          className="vr-card"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: -8,
            width: 300, padding: '16px 18px',
            background: 'rgba(10, 11, 24, 0.97)',
            border: '1px solid var(--vr-line-hi)',
            animation: 'popIn 0.2s ease',
            zIndex: 40,
          }}>
          <div className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-gold)' }}>
            BUBBLE SIZE
          </div>
          <div className="t-h4" style={{ fontSize: 13, marginTop: 6, color: 'var(--vr-cream)' }}>
            Neighborhood robustness
          </div>
          <div className="t-read" style={{ fontSize: 11, color: 'var(--vr-cream-dim)', marginTop: 6, lineHeight: 1.55 }}>
            Each bubble's <em>size</em> shows how many of the 12 market eras this parameter
            set (and its 8 neighbors) cleared the Sharpe floor. Color still encodes the raw metric.
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            marginTop: 14, gap: 0,
            border: '1px solid var(--vr-line)',
          }}>
            {samples.map((s, i) => {
              // Render a little grid-cell lookalike to match the real viz
              const W = 34, H = 32;
              return (
                <div key={i} style={{
                  padding: '10px 8px 8px',
                  borderLeft: i > 0 ? '1px solid var(--vr-line)' : 'none',
                  textAlign: 'center',
                }}>
                  <svg width={W} height={H} style={{ display: 'block', margin: '0 auto' }}>
                    <rect x="0.5" y="0.5" width={W - 1} height={H - 1}
                          fill="rgba(15, 16, 32, 0.4)"
                          stroke="rgba(241, 236, 224, 0.06)" strokeWidth="0.5"/>
                    <circle cx={W/2} cy={H/2} r={s.r}
                            fill={sharpeToFill(minS + (maxS - minS) * s.t, minS, maxS)}
                            opacity="0.95"/>
                  </svg>
                  <div className="t-eyebrow" style={{ fontSize: 8, marginTop: 6, color: 'var(--vr-cream-dim)' }}>
                    {s.label}
                  </div>
                  <div className="t-num" style={{ fontSize: 9, color: 'var(--vr-cream-mute)', marginTop: 2 }}>
                    {s.eras}/12
                  </div>
                </div>
              );
            })}
          </div>

          <div className="t-read" style={{ fontSize: 10.5, color: 'var(--vr-cream-mute)', marginTop: 12, lineHeight: 1.5, fontStyle: 'italic' }}>
            A cluster of large, same-sized bubbles is a plateau. One big bubble surrounded
            by tiny ones is a lucky point — and usually won't hold.
          </div>
        </div>
      )}
    </span>
  );
}

// ─── Contour legend (Variation B only) ─────────────────────────────
// Explains the three iso-lines: 0.70×, 0.82×, 0.92× of peak Sharpe.
function ContourLegend() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setOpen(true)}
        aria-label="Contour lines"
        style={{
          width: 16, height: 16, borderRadius: '50%',
          background: 'rgba(241,236,224,0.04)',
          border: '1px solid var(--vr-line-hi)',
          color: 'var(--vr-cream-mute)',
          fontSize: 10, fontFamily: 'var(--ff-serif)',
          fontStyle: 'italic',
          cursor: 'pointer', padding: 0, lineHeight: '14px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
        i
      </button>

      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          className="vr-card"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: -8,
            width: 320, padding: '16px 18px',
            background: 'rgba(10, 11, 24, 0.97)',
            border: '1px solid var(--vr-line-hi)',
            animation: 'popIn 0.2s ease',
            zIndex: 40,
          }}>
          <div className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-gold)' }}>
            CONTOUR LINES
          </div>
          <div className="t-h4" style={{ fontSize: 13, marginTop: 6, color: 'var(--vr-cream)' }}>
            Reading the topography
          </div>
          <div className="t-read" style={{ fontSize: 11, color: 'var(--vr-cream-dim)', marginTop: 6, lineHeight: 1.55 }}>
            Three gold iso-lines trace where the metric crosses a fraction of the peak.
            Closely-spaced contours = a steep ridge (fragile). Widely-spaced, concentric
            contours = a broad plateau (robust).
          </div>

          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            marginTop: 14,
            padding: '10px 12px',
            border: '1px solid var(--vr-line)',
          }}>
            {[
              { pct: '0.92', opacity: 0.75, note: 'Near-peak ridge' },
              { pct: '0.82', opacity: 0.50, note: 'Plateau core' },
              { pct: '0.70', opacity: 0.25, note: 'Plateau edge' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="42" height="8" style={{ flexShrink: 0 }}>
                  <line x1="0" y1="4" x2="42" y2="4"
                        stroke="var(--vr-gold)" strokeWidth="0.8" opacity={r.opacity}/>
                </svg>
                <span className="t-num" style={{ fontSize: 10, color: 'var(--vr-cream-dim)', width: 40 }}>
                  {r.pct}×
                </span>
                <span className="t-label" style={{ fontSize: 10, color: 'var(--vr-cream-mute)' }}>
                  {r.note}
                </span>
              </div>
            ))}
          </div>

          <div className="t-read" style={{ fontSize: 10.5, color: 'var(--vr-cream-mute)', marginTop: 12, lineHeight: 1.5, fontStyle: 'italic' }}>
            The winner sits inside the innermost ring. If that ring is large and the outer
            rings widen gently, the edge is real.
          </div>
        </div>
      )}
    </span>
  );
}

// ─── One variation card ──────────────────────────────────────────────
function VariationCard({ letter, title, description, variant }) {
  const [hover, setHover] = React.useState(null);
  const [pointer, setPointer] = React.useState({ x: 0, y: 0 });
  const [selected, setSelected] = React.useState(PD.winner);
  const [sliceAxis, setSliceAxis] = React.useState('row');
  const [metric, setMetric] = React.useState('sharpe');
  const [primerOpen, setPrimerOpen] = React.useState(false);
  const wrapRef = React.useRef(null);

  const handleHover = (cell, e) => {
    if (!cell) { setHover(null); return; }
    setHover(cell);
    if (e && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      setPointer({ x: e.clientX - r.left, y: e.clientY - r.top });
    }
  };

  const showEdges  = variant !== 'C';
  const showContour = variant === 'B';

  return (
    <div className="vr-card pr-primary-card" style={{ width: 840, padding: 26 }}>
      {/* header */}
      <div className="pr-primary-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-gold)' }}>VARIATION {letter}</span>
            <span style={{ width: 18, height: 1, background: 'var(--vr-line-hi)' }}/>
            <PrimerLink onOpen={() => setPrimerOpen(true)}/>
            {variant === 'B' && <ContourLegend/>}
            {variant === 'C' && <BubbleLegend/>}
          </div>
          <div className="t-h3" style={{ fontSize: 22, marginBottom: 4 }}>{title}</div>
          <div className="t-read" style={{ fontSize: 12, color: 'var(--vr-cream-mute)', maxWidth: 520 }}>
            {description}
          </div>
        </div>
        <MetricSwitcher metric={metric} onMetric={setMetric}/>
      </div>

      {/* plateau badge row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 14, flexWrap: 'wrap' }}>
        <PlateauBadge count={PD.stats.plateauCount} cut={PD.stats.plateauCut}/>
        <ColorLegend/>
      </div>

      {/* body: grid + rail */}
      <div ref={wrapRef} className="pr-grid-rail" style={{ position: 'relative', display: 'grid', gridTemplateColumns: `${gridPixelW}px 1fr`, gap: 24, alignItems: 'flex-start' }}>
        <div style={{ position: 'relative' }}>
          <PlateauGrid
            variant={variant}
            selected={selected}
            onSelect={setSelected}
            onHover={handleHover}
            showPlateauEdges={showEdges}
            showContour={showContour}
          />
          {hover && (
            <CellTooltip cell={hover} x={pointer.x} y={pointer.y} axes={PD.axes}/>
          )}
        </div>
        <div className="pr-rail" style={{
          paddingLeft: 22,
          borderLeft: '1px solid var(--vr-line)',
          minHeight: gridPixelH - 16,
          minWidth: 250,
        }}>
          <DetailRail
            cell={selected}
            sliceAxis={sliceAxis}
            onSliceAxis={setSliceAxis}
          />
        </div>
      </div>

      {/* summary + contrast */}
      <div className="pr-summary-row" style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 160px 160px', gap: 14 }}>
        <StabilitySummary winner={PD.winner} stats={PD.stats} axes={PD.axes}/>
        <PrimerExampleCard kind="lucky"/>
        <PrimerExampleCard kind="plateau"/>
      </div>

      {/* legend dots under grid */}
      <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <LegendSwatch color="var(--vr-gold)" label="In plateau"/>
        <LegendSwatch kind="star" label="Promoted winner"/>
        <LegendSwatch kind="dot" color="var(--vr-down)" label="Isolated lucky peak"/>
        <LegendSwatch kind="hatch" label="Hard-rejected"/>
        {variant === 'C' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingLeft: 6, borderLeft: '1px solid var(--vr-line)' }}>
            <svg width="34" height="12" style={{ display: 'block' }}>
              <circle cx="5" cy="6" r="2" fill="var(--vr-gold)" opacity="0.6"/>
              <circle cx="17" cy="6" r="4" fill="var(--vr-gold)" opacity="0.8"/>
              <circle cx="29" cy="6" r="5.5" fill="var(--vr-gold)"/>
            </svg>
            <span className="t-eyebrow" style={{ fontSize: 8 }}>Size ↔ neighborhood</span>
            <BubbleLegend/>
          </span>
        )}
      </div>

      {primerOpen && <PrimerPopover onClose={() => setPrimerOpen(false)}/>}
    </div>
  );
}

function LegendSwatch({ color, label, kind = 'square' }) {
  let swatch;
  if (kind === 'star') {
    swatch = <span style={{ fontSize: 11, color: 'var(--vr-gold)' }}>★</span>;
  } else if (kind === 'dot') {
    swatch = <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block' }}/>;
  } else if (kind === 'hatch') {
    swatch = (
      <svg width="12" height="10">
        <defs>
          <pattern id="leg-hatch" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)">
            <rect width="3" height="3" fill="#0c0d18"/>
            <line x1="0" y1="0" x2="0" y2="3" stroke="rgba(138, 133, 117, 0.35)" strokeWidth="0.8"/>
          </pattern>
        </defs>
        <rect width="12" height="10" fill="url(#leg-hatch)"/>
      </svg>
    );
  } else {
    swatch = <span style={{ width: 12, height: 10, border: `1px solid ${color}`, display: 'inline-block' }}/>;
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {swatch}
      <span className="t-eyebrow" style={{ fontSize: 8 }}>{label}</span>
    </span>
  );
}

// ─── Mini static grid for "also considered" thumbnails ──────────────
function MiniPlateauGrid({ variant, scale = 0.6 }) {
  const cw = Math.round(GRID.cellW * scale);
  const ch = Math.round(GRID.cellH * scale);
  const x0 = 14;
  const y0 = 10;
  const W = x0 + PD.axes.stop.values.length * cw + 10;
  const H = y0 + PD.axes.target.values.length * ch + 16;

  const showContour = variant === 'B';
  const showEdges   = variant !== 'C';

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <SvgDefs/>
      {showContour && (
        <g filter="url(#soft-blur)" opacity="0.85">
          {PD.cells.filter(c => !c.rejected).map((c, k) => {
            const t = Math.max(0, (c.sharpe - minS) / (maxS - minS));
            if (t < 0.55) return null;
            return (
              <circle key={k}
                cx={x0 + c.i * cw + cw / 2}
                cy={y0 + c.j * ch + ch / 2}
                r={cw * 0.95}
                fill={sharpeToFill(c.sharpe, minS, maxS)}
                opacity={0.35}/>
            );
          })}
        </g>
      )}
      {PD.cells.map((c, k) => {
        const x = x0 + c.i * cw;
        const y = y0 + c.j * ch;
        if (c.rejected) {
          return (
            <rect key={k} x={x + 0.5} y={y + 0.5}
              width={cw - 1} height={ch - 1}
              fill="url(#reject-hatch-tiny)"
              stroke="rgba(138, 133, 117, 0.12)" strokeWidth="0.4"/>
          );
        }
        if (variant === 'C') {
          const maxR = Math.min(cw, ch) / 2 - 1.2;
          const robust = (c.eraRobustness ?? 6) / 12;
          const r = Math.max(1.2, maxR * (0.32 + robust * 0.68));
          return (
            <g key={k}>
              <rect x={x + 0.5} y={y + 0.5} width={cw - 1} height={ch - 1}
                    fill="rgba(15, 16, 32, 0.4)"
                    stroke="rgba(241, 236, 224, 0.04)" strokeWidth="0.4"/>
              <circle cx={x + cw/2} cy={y + ch/2} r={r}
                      fill={sharpeToFill(c.sharpe, minS, maxS)} opacity={0.95}/>
              {c.winner && (
                <text x={x + cw - 2} y={y + 7} fontSize="7"
                      fill="var(--vr-ink)" textAnchor="end" fontWeight="600">★</text>
              )}
            </g>
          );
        }
        return (
          <g key={k}>
            <rect x={x + 0.5} y={y + 0.5} width={cw - 1} height={ch - 1}
                  fill={sharpeToFill(c.sharpe, minS, maxS)}
                  stroke={sharpeToStroke(c.sharpe, minS, maxS)} strokeWidth="0.4"/>
            {c.winner && (
              <text x={x + cw - 2} y={y + 7} fontSize="7"
                    fill="var(--vr-ink)" textAnchor="end" fontWeight="600">★</text>
            )}
            {c.luckyPeak && !c.winner && (
              <circle cx={x + cw - 3} cy={y + 4} r="1" fill="var(--vr-down)" opacity="0.9"/>
            )}
          </g>
        );
      })}
      {showEdges && (
        <path d={plateauEdges(PD.cells, cw, ch, x0, y0)}
              fill="none" stroke="var(--vr-gold)" strokeWidth="1" opacity="0.9"/>
      )}
      <text x={x0} y={H - 3} fontSize="7" fill="var(--vr-cream-faint)"
            fontFamily="var(--ff-sans)" letterSpacing="0.22em">← TIGHT</text>
      <text x={x0 + PD.axes.stop.values.length * cw} y={H - 3} fontSize="7"
            fill="var(--vr-cream-faint)" fontFamily="var(--ff-sans)"
            letterSpacing="0.22em" textAnchor="end">LOOSE →</text>
    </svg>
  );
}

function MiniVariationCard({ letter, title, description, variant }) {
  return (
    <div className="vr-inset" style={{ padding: '18px 20px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-cream-mute)' }}>VARIATION {letter}</span>
      </div>
      <div className="t-h4" style={{ fontSize: 14, color: 'var(--vr-cream)', marginBottom: 6, lineHeight: 1.3 }}>
        {title}
      </div>
      <div className="t-read" style={{ fontSize: 11.5, color: 'var(--vr-cream-mute)', lineHeight: 1.55, marginBottom: 14 }}>
        {description}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0', opacity: 0.85 }}>
        <MiniPlateauGrid variant={variant} scale={0.58}/>
      </div>
    </div>
  );
}

// ─── Top-level stack: B as primary, A + C as "also considered" ──────
function PlateauPrimer() {
  return (
    <div style={{
      minHeight: '100vh',
      padding: '56px 48px 80px',
      position: 'relative',
    }} className="pr-page">
      <Starfield count={60}/>
      <div className="pr-intro" style={{ maxWidth: 920, margin: '0 auto 48px', position: 'relative', zIndex: 2 }}>
        <div className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-gold)', marginBottom: 12 }}>PRIMER · 04 / PARAMETER STABILITY</div>
        <div className="t-h1 pr-h1" style={{ fontSize: 44, lineHeight: 1.1, marginBottom: 16 }}>
          Robust edges live on <span className="t-accent">plateaus</span>, not peaks.
        </div>
        <div className="t-read" style={{ fontSize: 15, color: 'var(--vr-cream-dim)', lineHeight: 1.6, maxWidth: 700 }}>
          The Parameter Stability view colors a 2D sweep — stop-loss × profit-target for a
          volatility-breakout strategy — by median-era Sharpe, with hard-rejected cells drawn as
          evidence of tried & failed. The promoted set sits inside a broad stable region;
          the isolated high-Sharpe cell in the corner is the lucky lookalike.
        </div>
      </div>

      {/* Primary: Variation B */}
      <div style={{ maxWidth: 920, margin: '0 auto 18px', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-gold)' }}>PRIMARY DIRECTION</span>
          <span style={{ flex: 1, height: 1, background: 'var(--vr-line-hi)' }}/>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40, alignItems: 'center', position: 'relative', zIndex: 2 }}>
        <VariationCard
          letter="B"
          title="Topographic contours overlay"
          description="Same grid with a bilinearly-smoothed glow over the plateau region and a thin gold outline tracing its edge. Plateaus read as broad, diffuse mountains; lucky peaks read as tight, isolated bright spots. A map, not a table."
          variant="B"
        />
      </div>

      {/* Also considered: A + C as side-by-side thumbnails */}
      <div className="pr-also-considered" style={{ maxWidth: 920, margin: '72px auto 0', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-cream-mute)' }}>ALSO CONSIDERED</span>
          <span style={{ flex: 1, height: 1, background: 'var(--vr-line)' }}/>
        </div>
        <div className="pr-mini-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <MiniVariationCard
            letter="A"
            title="Editorial grid with plateau outline only"
            description="Same underlying grid, but without the topographic glow — just the thin gold stroke around the plateau. Clean and literal, though the outline alone does less to communicate the gradient inside the plateau."
            variant="A"
          />
          <MiniVariationCard
            letter="C"
            title="Bubble cells — size encodes robustness"
            description="Each cell's disc scales with 8-neighborhood era-robustness. Colored tiles carry the metric more cleanly; bubbles make the cells feel fussy and the encoding takes a beat longer to read."
            variant="C"
          />
        </div>
      </div>

      {/* Annotations */}
      <div className="pr-annotations" style={{ maxWidth: 920, margin: '80px auto 0', position: 'relative', zIndex: 2 }}>
        <div className="vr-hr" style={{ marginBottom: 32 }}/>
        <div className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-gold)', marginBottom: 14 }}>ANNOTATION IDEAS</div>
        <div className="pr-annotations-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
          {[
            { h: 'Plateau-detected badge', b: 'Always visible above the grid. States cell count and the threshold (e.g. 0.85× of peak). Calibrates expectation before the user looks at any cell.' },
            { h: 'Natural-language reading', b: "One sentence under the grid: 'This parameter set sits inside a 14-cell robust region…' — written in plain English, not quant jargon." },
            { h: 'Contrast thumbnails', b: 'Two tiny static grids sit beside the summary: "Lucky point" vs "Broad plateau". Teaches the vocabulary without a tutorial.' },
            { h: 'Inline primer link', b: '"What\'s a plateau? →" opens a modal with the same thumbnails and a two-paragraph explainer. Clickable from anywhere that mentions plateaus.' },
            { h: 'Neighborhood stats', b: 'Mean / min / max / spread of the 8 surrounding cells. Tight spread = robust; wide spread = single-cell luck.' },
            { h: 'Hard-reject territory', b: 'Diagonal hatch on slate. Tooltip explains which gate failed. Visible evidence, not hidden error.' },
          ].map((r, i) => (
            <div key={i} className="vr-inset" style={{ padding: '14px 18px' }}>
              <div className="t-h4" style={{ fontSize: 13, color: 'var(--vr-cream)', marginBottom: 6 }}>{r.h}</div>
              <div className="t-read" style={{ fontSize: 12, color: 'var(--vr-cream-mute)', lineHeight: 1.55 }}>{r.b}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: '48px auto 0', position: 'relative', zIndex: 2 }}>
        <div className="vr-hr" style={{ marginBottom: 24 }}/>
        <div className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-gold)', marginBottom: 12 }}>RESPONSIVE</div>
        <div className="t-read" style={{ fontSize: 13, color: 'var(--vr-cream-dim)', lineHeight: 1.65, maxWidth: 720 }}>
          Desktop: side rail on the right, grid pinned to 12×10 cells at 34×32px. Tablet: rail moves
          below the grid; axis tick density drops in half. Mobile: cells compact to 18×18, detail
          panel becomes a pinned sheet from the bottom, and the 1D slice chart replaces the heatmap
          when the user taps a row/column label — the primary read on mobile is the slice, not the grid.
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PlateauPrimer });
