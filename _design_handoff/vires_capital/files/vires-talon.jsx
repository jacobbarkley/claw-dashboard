// ─── Talon: centered modal chat, opened from the celestial ──────────
// Uses window.claude.complete() — a real Claude connection lives inside
// this sandbox, so typing actually returns a response.

function TalonChat({ open, onClose }) {
  const [messages, setMessages] = React.useState([]);   // {role, content}
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const bodyRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const [isMobile, setIsMobile] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  );
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Vires-flavored suggested prompts
  const suggestions = [
    "What's driving today's equity move?",
    "Are any strategies degrading in recent eras?",
    "Summarize bench promotions pending review.",
    "Is market regime favoring any sleeve right now?",
  ];

  // Reset + focus on open
  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // Escape closes
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Auto-scroll
  React.useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    const next = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const systemPreamble =
        "You are Talon, a concise trading assistant inside the Vires Capital prototype " +
        "dashboard. Vires is an autonomous-paper algorithmic trading platform with a " +
        "Bench (strategy R&D with era-based robustness testing), a Trading view (live " +
        "account, stocks/options/crypto sleeves), and a Plateau primer explaining how " +
        "robust edges sit on parameter plateaus rather than isolated lucky peaks. The " +
        "system is in PAPER mode — no real capital. Keep answers short, honest, and " +
        "specific. When you don't have live data, say so plainly. Use plain prose, " +
        "not bullet lists unless the user asks.";
      const reply = await window.claude.complete({
        messages: [
          { role: 'user', content: systemPreamble + "\n\n---\n\n" + q },
          ...next.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: q },
        ].slice(-6),
      });
      setMessages(m => [...m, { role: 'assistant', content: (reply || '').trim() || '(no response)' }]);
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: `Couldn't reach Claude: ${err?.message || err}` }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(6, 7, 14, 0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : 20,
        animation: 'vr-fade-in 0.18s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 620,
          maxHeight: isMobile ? '88vh' : '82vh',
          height: isMobile ? '88vh' : 'auto',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(12, 13, 24, 0.96)',
          border: '1px solid var(--vr-gold-line)',
          borderRadius: isMobile ? '12px 12px 0 0' : 8,
          borderBottomWidth: isMobile ? 0 : 1,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,169,104,0.05) inset',
          overflow: 'hidden',
          animation: isMobile ? 'vr-sheet-in 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'vr-modal-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        {/* mobile grab handle */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px', flexShrink: 0 }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--vr-line-hi)' }}/>
          </div>
        )}
        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--vr-line)',
          background: 'linear-gradient(180deg, rgba(200,169,104,0.05), transparent)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 8 L6 4 L8 6 L14 2 L12 8 L14 14 L8 10 L6 12 L2 8 Z"
                    fill="var(--vr-gold)" opacity="0.92"/>
            </svg>
            <span className="t-h4" style={{ fontSize: 13, color: 'var(--vr-cream)', letterSpacing: '0.02em' }}>Talon</span>
            <span className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-cream-faint)', paddingLeft: 10, borderLeft: '1px solid var(--vr-line)' }}>
              PAPER · HAIKU
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--vr-cream-mute)', padding: 4, display: 'flex',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* body */}
        <div ref={bodyRef} style={{
          flex: 1, overflowY: 'auto', padding: '18px',
          display: 'flex', flexDirection: 'column', gap: 14,
          minHeight: 280,
        }}>
          {messages.length === 0 && !loading && (
            <>
              <div className="t-read" style={{ fontSize: 13, color: 'var(--vr-cream-dim)', lineHeight: 1.55 }}>
                Ask anything about the portfolio, today's plan, the bench, or the market regime.
                I have general context about Vires but no live operator feed yet — that wires in later.
              </div>
              <div className="t-eyebrow" style={{ fontSize: 8, color: 'var(--vr-cream-faint)', marginTop: 6 }}>SUGGESTED</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    className="t-read"
                    style={{
                      textAlign: 'left',
                      padding: '9px 12px',
                      background: 'rgba(241, 236, 224, 0.02)',
                      border: '1px solid var(--vr-line)',
                      borderRadius: 3,
                      color: 'var(--vr-cream-dim)',
                      fontSize: 12.5, lineHeight: 1.4,
                      cursor: 'pointer',
                      transition: 'background 0.12s, border-color 0.12s, color 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(200, 169, 104, 0.06)';
                      e.currentTarget.style.borderColor = 'var(--vr-gold-line)';
                      e.currentTarget.style.color = 'var(--vr-cream)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(241, 236, 224, 0.02)';
                      e.currentTarget.style.borderColor = 'var(--vr-line)';
                      e.currentTarget.style.color = 'var(--vr-cream-dim)';
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '82%',
                padding: '10px 13px',
                borderRadius: 6,
                fontFamily: 'var(--ff-sans)',
                fontSize: 13, lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                ...(m.role === 'user' ? {
                  background: 'var(--vr-gold)',
                  color: 'var(--vr-ink)',
                  fontWeight: 500,
                } : {
                  background: 'rgba(241, 236, 224, 0.04)',
                  color: 'var(--vr-cream)',
                  border: '1px solid var(--vr-line)',
                }),
              }}>
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                padding: '10px 13px',
                background: 'rgba(241, 236, 224, 0.04)',
                border: '1px solid var(--vr-line)',
                borderRadius: 6,
                display: 'flex', gap: 5, alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: 'var(--vr-gold)',
                    animation: `vr-dot 1.1s ${i * 0.18}s ease-in-out infinite`,
                  }}/>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* input */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          style={{
            display: 'flex', gap: 8, padding: 14,
            borderTop: '1px solid var(--vr-line)',
            background: 'rgba(10, 11, 20, 0.6)',
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the portfolio…"
            disabled={loading}
            style={{
              flex: 1,
              background: 'rgba(241, 236, 224, 0.03)',
              border: '1px solid var(--vr-line)',
              borderRadius: 3,
              padding: '9px 12px',
              color: 'var(--vr-cream)',
              fontFamily: 'var(--ff-sans)', fontSize: 13,
              outline: 'none',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--vr-gold-line)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--vr-line)'; }}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            style={{
              background: input.trim() && !loading ? 'var(--vr-gold)' : 'rgba(241, 236, 224, 0.04)',
              color: input.trim() && !loading ? 'var(--vr-ink)' : 'var(--vr-cream-faint)',
              border: '1px solid ' + (input.trim() && !loading ? 'var(--vr-gold)' : 'var(--vr-line)'),
              borderRadius: 3,
              padding: '0 14px',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              fontWeight: 600, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              transition: 'background 0.12s',
            }}
          >
            Send
          </button>
        </form>
      </div>

      <style>{`
        @keyframes vr-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes vr-modal-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes vr-sheet-in {
          from { opacity: 0; transform: translateY(100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes vr-dot {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.9); }
          40%           { opacity: 1;    transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}

Object.assign(window, { TalonChat });
