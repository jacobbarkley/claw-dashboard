// primer-stability-data.js
// Deterministic synthetic parameter-sweep grid for the Plateau View primer.
// 2D sweep: stop% × target%. Metric colored by median-era Sharpe.
// Contains a genuine broad plateau AND a contrasting isolated lucky point,
// so variations can show both on the SAME grid.

(function () {
  // axes
  const STOPS   = [0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6]; // 12
  const TARGETS = [0.5, 0.8, 1.1, 1.5, 2.0, 2.5, 3.0, 3.6, 4.2, 5.0];           // 10

  // deterministic PRNG
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
  const rand = mk(0xB1A5E);

  // Plateau centered at stop≈1.4, target≈2.5 (indices ~6, ~5)
  // Lucky peak at stop≈2.4, target≈0.8 (corner, isolated)
  const plateauCx = 6, plateauCy = 5;
  const peakCx    = 10, peakCy   = 1;

  // Hard-reject logic: corners with extreme stop/target combos fail
  // cost-survival / era-robustness gates. Also a few scattered fails
  // to feel authentic.
  const isHardReject = (i, j) => {
    // Very tight stop + very wide target → thrashing; nothing survives cost
    if (i <= 1 && j >= 7) return true;
    // Very wide stop + very tight target → noise; era-robustness fails
    if (i >= 10 && j <= 1) return true;
    // Extreme bottom-right corner — min bars/era gate
    if (i === 11 && j === 0) return true;
    if (i === 0 && j === 9) return true;
    if (i === 1 && j === 8) return true;
    return false;
  };

  const cells = [];
  for (let j = 0; j < TARGETS.length; j++) {
    for (let i = 0; i < STOPS.length; i++) {
      // distance fields
      const dPlateau = Math.hypot((i - plateauCx) * 0.9, (j - plateauCy) * 1.05);
      const dPeak    = Math.hypot(i - peakCx,          j - peakCy);

      // broad plateau: gaussian with wide sigma — stays high across many cells
      const plateauContribution = 1.05 * Math.exp(-(dPlateau * dPlateau) / (2 * 2.6 * 2.6));
      // isolated peak: gaussian with tiny sigma — huge at exactly one cell, nothing nearby
      const peakContribution    = 1.40 * Math.exp(-(dPeak * dPeak) / (2 * 0.6 * 0.6));
      // background noise
      const noise = (rand() - 0.5) * 0.18;

      let sharpe = 0.35 + plateauContribution + peakContribution + noise;

      const rejected = isHardReject(i, j);
      if (rejected) sharpe = Math.max(0, sharpe - 0.3);

      // Derive calmar, profit factor as correlated-but-distinct metrics
      const calmarJitter = (rand() - 0.5) * 0.25;
      const pfJitter     = (rand() - 0.5) * 0.12;
      const calmar = Math.max(0.1, sharpe * 0.85 + calmarJitter);
      const pf     = Math.max(0.85, sharpe * 0.45 + 1.05 + pfJitter);

      // neighborhood robustness: compute later in a second pass
      cells.push({
        i, j,
        stop: STOPS[i],
        target: TARGETS[j],
        sharpe: +sharpe.toFixed(3),
        calmar: +calmar.toFixed(3),
        pf:     +pf.toFixed(3),
        rejected,
        // simulated per-cell extras for the detail panel
        trades: Math.round(280 + rand() * 640),
        winRate: +(0.46 + rand() * 0.12).toFixed(3),
        maxDD: +(-(5 + rand() * 14)).toFixed(2),
        eraRobustness: 0, // filled below
      });
    }
  }

  const get = (i, j) => cells.find(c => c.i === i && c.j === j);

  // Second pass: neighborhood stats (8-neighborhood, clipped at edges,
  // ignoring rejected cells).
  for (const c of cells) {
    const neighbors = [];
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;
        const n = get(c.i + di, c.j + dj);
        if (n && !n.rejected) neighbors.push(n);
      }
    }
    c.neighbors = neighbors.map(n => ({ i: n.i, j: n.j, sharpe: n.sharpe }));
    if (neighbors.length === 0) {
      c.nbMean = 0; c.nbMin = 0; c.nbMax = 0; c.nbSpread = 0;
    } else {
      const vals = neighbors.map(n => n.sharpe);
      c.nbMean   = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3);
      c.nbMin    = +Math.min(...vals).toFixed(3);
      c.nbMax    = +Math.max(...vals).toFixed(3);
      c.nbSpread = +(c.nbMax - c.nbMin).toFixed(3);
    }
    // era robustness: how many of 12 eras cleared a Sharpe > 0.5 floor.
    // Higher where plateau is broad, lower at isolated peaks.
    c.eraRobustness = Math.max(
      0,
      Math.min(12, Math.round(
        6 + (c.nbMean - 0.6) * 18 - (c.sharpe - c.nbMean) * 10 + (rand() - 0.5) * 2
      ))
    );
  }

  // Winner: the cell with the highest metric AND a strong neighborhood.
  // Deliberately pick a plateau cell (not the lucky peak) — that's the
  // whole point of the primer.
  const winnerCell = get(plateauCx, plateauCy);
  winnerCell.winner = true;

  // "Lucky lookalike" — the isolated-peak cell. Will be called out in
  // the contrast thumbnails.
  const luckyCell = get(peakCx, peakCy);
  luckyCell.luckyPeak = true;

  // Plateau membership: a cell is "in the plateau" iff
  //   - not rejected
  //   - own sharpe ≥ 0.85 × winner.sharpe
  //   - at least 4 of its 8 neighbors also ≥ 0.85 × winner.sharpe
  const plateauCut = winnerCell.sharpe * 0.85;
  for (const c of cells) {
    if (c.rejected) { c.plateau = false; continue; }
    if (c.sharpe < plateauCut) { c.plateau = false; continue; }
    const strong = (c.neighbors || []).filter(n => n.sharpe >= plateauCut).length;
    c.plateau = strong >= 4;
  }

  // Stats for the badge + natural-language summary
  const plateauCount = cells.filter(c => c.plateau).length;
  const totalEval    = cells.filter(c => !c.rejected).length;

  window.VIRES_PRIMER_DATA = {
    axes: {
      stop:   { values: STOPS,   label: 'Stop-loss (% of price)',      tickLeft: 'tight',  tickRight: 'loose' },
      target: { values: TARGETS, label: 'Profit-target (R multiple)',  tickLeft: 'close',  tickRight: 'far'   },
    },
    cells,
    winner: winnerCell,
    lucky: luckyCell,
    stats: {
      plateauCount,
      totalEval,
      totalCells: cells.length,
      plateauCut: +plateauCut.toFixed(3),
      winnerSharpe: winnerCell.sharpe,
    },
  };
})();
