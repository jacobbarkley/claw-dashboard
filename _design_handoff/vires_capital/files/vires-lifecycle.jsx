// vires-lifecycle.jsx — Strategy lifecycle (compact + expanded)

const STAGE_ORDER = ['IDEATED', 'SPEC', 'BENCHED', 'CONFIRMED', 'PROMOTED', 'PAPER', 'LIVE_ELIGIBLE', 'LIVE'];

const STAGE_LABELS = {
  IDEATED:       { short: 'Ideated',        long: 'Idea · research' },
  SPEC:          { short: 'Spec',           long: 'Bench spec' },
  BENCHED:       { short: 'Benched',        long: 'Bench run complete' },
  CONFIRMED:     { short: 'Confirmed',      long: 'Frozen confirmation' },
  PROMOTED:      { short: 'Promoted',       long: 'Manifest promoted' },
  PAPER:         { short: 'Paper',          long: 'Paper shadow' },
  LIVE_ELIGIBLE: { short: 'Eligible',       long: 'Live eligible' },
  LIVE:          { short: 'Live',           long: 'Earning capital' },
  RETIRED:       { short: 'Retired',        long: 'Retired' },
  ROLLED_BACK:   { short: 'Rolled back',    long: 'Rolled back' },
};

// --- helpers -----------------------------------------------------------------

function fmtDate(iso, { time = false } = {}) {
  if (!iso) return null;
  const d = new Date(iso);
  const m = d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (!time) return m;
  const t = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
  return `${m} · ${t}`;
}

function StageDot({ status, size = 10, compact = false }) {
  // Form carries state; color is accent only.
  const GOLD = 'var(--vr-gold)';
  const CREAM = 'var(--vr-cream-dim)';
  const WARN = 'var(--vr-warn)';
  const FAINT = 'var(--vr-cream-faint)';
  const common = { width: size, height: size, borderRadius: '50%', flex: '0 0 auto', position: 'relative' };

  if (status === 'DONE')    return <span style={{ ...common, background: CREAM }} />;
  if (status === 'ACTIVE')  return <span style={{ ...common, background: GOLD, boxShadow: '0 0 0 3px rgba(200,169,104,0.12)' }} />;
  if (status === 'BLOCKED') return <span style={{ ...common, background: 'transparent', border: `1.5px solid ${WARN}` }} />;
  if (status === 'FUTURE')  return <span style={{ ...common, background: 'transparent', border: `1px dashed ${FAINT}` }} />;
  if (status === 'ROLLED_BACK') return (
    <span style={{ ...common, background: 'transparent', border: `1px solid ${CREAM}`, opacity: 0.5 }}>
      <span style={{ position: 'absolute', inset: '50% -4px auto -4px', height: 1, background: 'var(--vr-down)', transform: 'rotate(-20deg)' }} />
    </span>
  );
  return <span style={{ ...common, background: FAINT }} />;
}

// --- compact timeline --------------------------------------------------------

function CompactLifecycle({ lifecycle, onExpand }) {
  if (!lifecycle) return null;
  const { stages, currentStage } = lifecycle;
  const currentIdx = stages.findIndex(s => s.stage === currentStage);
  const activeStage = stages.find(s => s.status === 'ACTIVE') || stages[currentIdx];

  return (
    <div className="vr-card">
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--vr-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div className="t-eyebrow" style={{ fontSize: 9 }}>Lifecycle</div>
          <div className="t-label" style={{ fontSize: 12, color: 'var(--vr-cream)', marginTop: 4 }}>
            {activeStage && STAGE_LABELS[activeStage.stage]?.long}
          </div>
        </div>
        {activeStage?.at && (
          <div style={{ textAlign: 'right' }}>
            <div className="t-eyebrow" style={{ fontSize: 9 }}>Since</div>
            <div className="t-num" style={{ fontSize: 11, color: 'var(--vr-cream-dim)', marginTop: 3, fontFamily: 'var(--ff-mono)' }}>{fmtDate(activeStage.at)}</div>
          </div>
        )}
      </div>
      <div style={{ padding: '16px 18px 14px' }}>
        {/* Compact track: dot-rail-dot-rail... */}
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${stages.length}, 1fr)`, alignItems: 'center' }}>
          {/* rails */}
          {stages.map((s, i) => {
            if (i === stages.length - 1) return null;
            const next = stages[i + 1];
            let rail = 'var(--vr-line)';
            if (s.status === 'DONE' && next.status !== 'FUTURE') rail = 'var(--vr-cream-dim)';
            if (s.status === 'DONE' && next.status === 'FUTURE') rail = 'var(--vr-line-hi)';
            if (s.status === 'ACTIVE') rail = 'var(--vr-gold)';
            if (s.status === 'BLOCKED' || next.status === 'BLOCKED') rail = 'var(--vr-warn)';
            const dashed = next.status === 'FUTURE';
            return (
              <div key={`r${i}`} style={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                left: `calc(${((i + 0.5) / stages.length) * 100}% + 6px)`,
                width: `calc(${(1 / stages.length) * 100}% - 12px)`,
                height: 1,
                background: dashed ? 'transparent' : rail,
                borderTop: dashed ? `1px dashed var(--vr-cream-faint)` : 'none',
                opacity: dashed ? 0.5 : 1,
              }} />
            );
          })}
          {/* dots */}
          {stages.map((s) => (
            <div key={s.stage} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1 }}>
              <StageDot status={s.status} />
            </div>
          ))}
        </div>
        {/* labels */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stages.length}, 1fr)`, marginTop: 10 }}>
          {stages.map((s) => (
            <div key={s.stage} className="t-eyebrow" style={{
              fontSize: 8,
              textAlign: 'center',
              color: s.status === 'ACTIVE' ? 'var(--vr-gold)' : s.status === 'BLOCKED' ? 'var(--vr-warn)' : s.status === 'DONE' ? 'var(--vr-cream-dim)' : 'var(--vr-cream-faint)',
              letterSpacing: '0.14em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>{STAGE_LABELS[s.stage]?.short || s.stage}</div>
          ))}
        </div>

        {/* Active stage detail strip */}
        {activeStage && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--vr-line)', display: 'flex', gap: 12, alignItems: 'center' }}>
            <StageDot status={activeStage.status} size={8} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-read" style={{ fontSize: 11, color: 'var(--vr-cream-dim)', lineHeight: 1.5 }}>
                {activeStage.detail}
              </div>
              {activeStage.artifact && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="t-eyebrow" style={{ fontSize: 8 }}>Artifact</span>
                  <span className="t-ticker" style={{ fontSize: 10, color: activeStage.status === 'ACTIVE' ? 'var(--vr-gold)' : 'var(--vr-cream-dim)', textTransform: 'none', letterSpacing: '0.02em', fontFamily: 'var(--ff-mono)' }}>
                    {activeStage.artifact.label}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {onExpand && (
          <button
            onClick={onExpand}
            style={{
              marginTop: 14, width: '100%', background: 'transparent',
              border: '1px solid var(--vr-line)', borderRadius: 3,
              padding: '8px 10px', cursor: 'pointer', color: 'var(--vr-cream-mute)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              font: 'inherit',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--vr-line-hi)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--vr-line)'}
          >
            <span className="t-eyebrow" style={{ fontSize: 9 }}>View full lifecycle</span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.2"/></svg>
          </button>
        )}
      </div>
    </div>
  );
}

// --- expanded lifecycle ------------------------------------------------------

function ArtifactChip({ artifact, onOpenRun }) {
  if (!artifact) return null;
  const clickable = artifact.kind === 'run' && artifact.runId;
  const kindLabel = {
    note: 'RESEARCH',
    spec: 'SPEC',
    run: 'RUN',
    confirm: 'CONFIRMATION',
    manifest: 'MANIFEST',
    shadow: 'SHADOW',
    eligibility: 'ELIGIBILITY',
    live: 'EXECUTION',
  }[artifact.kind] || 'ARTIFACT';

  const Wrap = clickable ? 'button' : 'div';
  return (
    <Wrap
      onClick={clickable ? () => onOpenRun && onOpenRun(artifact.runId) : undefined}
      style={{
        display: 'inline-flex', flexDirection: 'column', gap: 3,
        padding: '7px 10px',
        background: 'rgba(241,236,224,0.02)',
        border: '1px solid var(--vr-line)',
        borderRadius: 3,
        cursor: clickable ? 'pointer' : 'default',
        font: 'inherit', color: 'inherit', textAlign: 'left',
        minWidth: 0,
      }}
    >
      <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-cream-faint)', letterSpacing: '0.2em' }}>{kindLabel}</span>
      <span className="t-ticker" style={{ fontSize: 10, color: clickable ? 'var(--vr-gold)' : 'var(--vr-cream-dim)', textTransform: 'none', letterSpacing: '0.02em', fontFamily: 'var(--ff-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {artifact.label}
      </span>
    </Wrap>
  );
}

function LifecycleRow({ stage, isLast, onOpenRun }) {
  const LABEL = STAGE_LABELS[stage.stage];
  const statusColor = {
    DONE: 'var(--vr-cream-dim)',
    ACTIVE: 'var(--vr-gold)',
    BLOCKED: 'var(--vr-warn)',
    FUTURE: 'var(--vr-cream-faint)',
    ROLLED_BACK: 'var(--vr-down)',
  }[stage.status] || 'var(--vr-cream-dim)';

  const isDim = stage.status === 'FUTURE';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 12, position: 'relative' }}>
      {/* rail + dot */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        {/* dot */}
        <div style={{ marginTop: 4, zIndex: 1 }}>
          <StageDot status={stage.status} size={10} />
        </div>
        {/* rail */}
        {!isLast && (
          <div style={{
            position: 'absolute',
            top: 16, bottom: -24,
            left: '50%', transform: 'translateX(-50%)',
            width: 1,
            background: stage.status === 'BLOCKED' ? 'var(--vr-warn)' : stage.status === 'FUTURE' ? 'transparent' : stage.status === 'ACTIVE' ? 'var(--vr-gold)' : 'var(--vr-line-hi)',
            borderLeft: stage.status === 'FUTURE' ? '1px dashed var(--vr-cream-faint)' : undefined,
            opacity: stage.status === 'FUTURE' ? 0.5 : 1,
          }} />
        )}
      </div>

      {/* content */}
      <div style={{ paddingBottom: isLast ? 0 : 22, opacity: isDim ? 0.55 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="t-eyebrow" style={{ fontSize: 9, color: statusColor, letterSpacing: '0.22em' }}>{LABEL?.short || stage.stage}</span>
            {stage.status === 'ACTIVE' && <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-gold)', letterSpacing: '0.24em' }}>● ACTIVE</span>}
            {stage.status === 'BLOCKED' && <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-warn)', letterSpacing: '0.24em' }}>○ BLOCKED</span>}
            {stage.status === 'ROLLED_BACK' && <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-down)', letterSpacing: '0.24em' }}>⊘ ROLLED BACK</span>}
          </div>
          <div className="t-num" style={{ fontSize: 10, color: 'var(--vr-cream-faint)', fontFamily: 'var(--ff-mono)' }}>
            {fmtDate(stage.at, { time: true }) || '—'}
          </div>
        </div>
        <div className="t-h4" style={{ fontSize: 13, color: 'var(--vr-cream)', marginTop: 4, lineHeight: 1.35 }}>
          {stage.title}
        </div>
        <div className="t-read" style={{ fontSize: 11, color: 'var(--vr-cream-mute)', marginTop: 5, lineHeight: 1.55 }}>
          {stage.detail}
        </div>
        {(stage.actor || stage.cadence) && (
          <div style={{ display: 'flex', gap: 14, marginTop: 7 }}>
            {stage.actor && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="t-eyebrow" style={{ fontSize: 8 }}>Actor</span>
                <span className="t-ticker" style={{ fontSize: 10, color: 'var(--vr-cream-dim)', textTransform: 'none', letterSpacing: '0.02em' }}>{stage.actor}</span>
              </div>
            )}
            {stage.cadence && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="t-eyebrow" style={{ fontSize: 8 }}>Cadence</span>
                <span className="t-ticker" style={{ fontSize: 10, color: 'var(--vr-cream-dim)', textTransform: 'none', letterSpacing: '0.02em' }}>{stage.cadence}</span>
              </div>
            )}
          </div>
        )}
        {stage.artifact && (
          <div style={{ marginTop: 10 }}>
            <ArtifactChip artifact={stage.artifact} onOpenRun={onOpenRun} />
          </div>
        )}
      </div>
    </div>
  );
}

function ExpandedLifecycle({ passportId, onBack, onOpenRun }) {
  const passport = window.VIRES_DATA.passports.find(p => p.id === passportId);
  if (!passport || !passport.lifecycle) {
    return (
      <div className="vr-screen" style={{ padding: 16 }}>
        <button onClick={onBack} className="t-eyebrow" style={{ background: 'none', border: 'none', color: 'var(--vr-cream-mute)', cursor: 'pointer' }}>← Back</button>
        <div className="t-read" style={{ marginTop: 20 }}>Lifecycle unavailable.</div>
      </div>
    );
  }
  const { stages, currentStage, blockedAt } = passport.lifecycle;
  const active = stages.find(s => s.status === 'ACTIVE') || stages.find(s => s.stage === currentStage);
  const blocked = stages.find(s => s.status === 'BLOCKED');
  const sleeveMap = { STOCKS: 'stocks', CRYPTO: 'crypto', OPTIONS: 'options' };
  const sl = sleeveMap[passport.sleeve] || 'stocks';

  return (
    <div className="vr-screen" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6, color: 'var(--vr-cream-mute)',
        alignSelf: 'flex-start',
      }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M6.5 2L3 5L6.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        <span className="t-eyebrow" style={{ fontSize: 9 }}>Back to Passport</span>
      </button>

      {/* Identity */}
      <div style={{ padding: '4px 2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <SleeveChip sleeve={sl} />
          <span className="t-eyebrow" style={{ fontSize: 9, color: 'var(--vr-cream-faint)' }}>· Lifecycle</span>
        </div>
        <div className="t-h2" style={{ fontSize: 24, lineHeight: 1.2 }}>{passport.name}</div>
        <div className="t-label" style={{ fontSize: 12, color: 'var(--vr-cream-mute)', marginTop: 6, letterSpacing: '0.06em' }}>{passport.variant}</div>
      </div>

      {/* Current state strip */}
      <div className="vr-card" style={{ padding: '16px 18px', borderLeft: blocked ? '2px solid var(--vr-warn)' : '2px solid var(--vr-gold)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <div>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 6, color: blocked ? 'var(--vr-warn)' : 'var(--vr-gold)' }}>
              {blocked ? 'Blocked at' : 'Currently'}
            </div>
            <div className="t-h3" style={{ fontSize: 18, fontStyle: 'italic', color: 'var(--vr-cream)', lineHeight: 1.3 }}>
              {blocked ? STAGE_LABELS[blocked.stage]?.long : STAGE_LABELS[active?.stage]?.long}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="t-eyebrow" style={{ fontSize: 9 }}>Stage {STAGE_ORDER.indexOf(active?.stage) + 1}<span style={{ color: 'var(--vr-cream-faint)' }}> / {STAGE_ORDER.length}</span></div>
          </div>
        </div>
        {blocked && (
          <div className="t-read" style={{ fontSize: 11, color: 'var(--vr-cream-mute)', marginTop: 10, lineHeight: 1.55 }}>
            {blocked.detail}
          </div>
        )}
      </div>

      {/* Full timeline */}
      <SectionHeader eyebrow="Audit" title="Full history" />
      <div className="vr-card" style={{ padding: '20px 18px' }}>
        {stages.map((s, i) => (
          <LifecycleRow key={s.stage} stage={s} isLast={i === stages.length - 1} onOpenRun={onOpenRun} />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { CompactLifecycle, ExpandedLifecycle, STAGE_LABELS });
