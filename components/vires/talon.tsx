"use client"

// Vires Talon — the embedded analyst chat. Opened by clicking the
// celestial body (sun/moon) on the Account Equity hero. Slides in from
// the right on desktop, full-width takeover on mobile.
//
// Behavior Jacob asked for:
//   - Slides over from the right, doesn't render as a centered modal
//   - Conversation persists across open / close via localStorage so
//     leaving and coming back keeps the thread alive
//   - Explicit trash icon clears the memory
//
// Wired to the existing /api/chat endpoint. The Talon system prompt was
// already in place from the ClawBoy iteration; Vires inherits it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { useChat, type UIMessage } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"

// ─── Context ────────────────────────────────────────────────────────────────

interface ViresTalonContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const ViresTalonContext = createContext<ViresTalonContextValue | null>(null)

export function useViresTalon(): ViresTalonContextValue {
  const ctx = useContext(ViresTalonContext)
  if (!ctx) {
    // Safe fallback — in the rare case a component tries to open Talon
    // outside the /vires tree, no-op rather than crash.
    return { isOpen: false, open: () => {}, close: () => {}, toggle: () => {} }
  }
  return ctx
}

// ─── Persistence ────────────────────────────────────────────────────────────

const STORAGE_KEY = "vires.talon.messages"

function loadMessages(): UIMessage[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as UIMessage[]
  } catch {
    return []
  }
}

function saveMessages(messages: UIMessage[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  } catch {
    // Quota exceeded or Safari private mode — silently drop.
  }
}

function clearMessages() {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

// ─── Provider + Panel ───────────────────────────────────────────────────────

export function ViresTalonProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(v => !v), [])

  const value = useMemo<ViresTalonContextValue>(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle],
  )

  return (
    <ViresTalonContext.Provider value={value}>
      {children}
      <ViresTalonPanel />
    </ViresTalonContext.Provider>
  )
}

const SUGGESTED = [
  "What's driving today's equity move?",
  "Are any strategies degrading in recent eras?",
  "Summarize bench promotions pending review.",
  "Is market regime favoring any sleeve right now?",
]

function ViresTalonPanel() {
  const { isOpen, close } = useViresTalon()
  const transport = useMemo(() => new TextStreamChatTransport({ api: "/api/chat" }), [])
  const chat = useChat({ transport })
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [mounted, setMounted] = useState(false)
  const [restored, setRestored] = useState(false)

  // Mount + restore persisted conversation once.
  useEffect(() => {
    setMounted(true)
    const saved = loadMessages()
    if (saved.length > 0) {
      chat.setMessages(saved)
    }
    setRestored(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save every message change after the initial restore.
  useEffect(() => {
    if (!restored) return
    saveMessages(chat.messages)
  }, [chat.messages, restored])

  // Auto-scroll when new messages arrive.
  useEffect(() => {
    if (scrollRef.current && chat.messages.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chat.messages])

  // On open, park at bottom for an existing conversation, top for empty.
  useEffect(() => {
    if (!isOpen || !scrollRef.current) return
    if (chat.messages.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    } else {
      scrollRef.current.scrollTop = 0
    }
  }, [isOpen, chat.messages.length])

  // Escape closes.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, close])

  // Lock body scroll on mobile when open.
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [isOpen])

  // Desktop focus on open — skip mobile (auto-popping the keyboard is rude).
  useEffect(() => {
    if (!isOpen || !inputRef.current) return
    if (typeof window !== "undefined" && window.innerWidth >= 640) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const isLoading = chat.status === "streaming" || chat.status === "submitted"

  const send = () => {
    const text = input.trim()
    if (!text || isLoading) return
    chat.sendMessage({ text })
    setInput("")
    if (inputRef.current) inputRef.current.style.height = "auto"
  }

  const handleClear = () => {
    chat.setMessages([])
    clearMessages()
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = "auto"
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"
  }

  if (!mounted) return null

  const panelStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: "420px",
    maxWidth: "94vw",
    background: "var(--vr-ink-raised)",
    borderLeft: "1px solid var(--vr-line-hi)",
    boxShadow: "-20px 0 60px rgba(0, 0, 0, 0.55)",
    display: "flex",
    flexDirection: "column",
    zIndex: 60,
    transform: isOpen ? "translateX(0)" : "translateX(100%)",
    transition: "transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",
    pointerEvents: isOpen ? "auto" : "none",
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={close}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(6, 7, 14, 0.55)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 55,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal={isOpen}
        aria-hidden={!isOpen}
        aria-label="Talon analyst chat"
        style={panelStyle}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid var(--vr-line)",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--vr-cream)", letterSpacing: "-0.005em" }}>
              Talon
            </div>
            <div className="t-eyebrow" style={{ fontSize: 9, marginTop: 2 }}>
              Analyst · Vires
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {chat.messages.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear conversation"
                style={{
                  padding: 8,
                  background: "transparent",
                  border: "1px solid var(--vr-line)",
                  borderRadius: 3,
                  color: "var(--vr-cream-mute)",
                  cursor: "pointer",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
                title="Clear conversation and forget memory"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={close}
              aria-label="Close Talon"
              style={{
                padding: "8px 10px",
                background: "transparent",
                border: "1px solid var(--vr-line)",
                borderRadius: 3,
                color: "var(--vr-cream)",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {chat.messages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="t-read" style={{ fontSize: 13, lineHeight: 1.6 }}>
                Ask Talon about your portfolio, today&rsquo;s plan, the active
                strategy, or the market regime. Live context comes from the
                operator feed.
              </div>
              <div>
                <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 8 }}>Suggested</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {SUGGESTED.map(prompt => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => chat.sendMessage({ text: prompt })}
                      style={{
                        textAlign: "left",
                        fontSize: 12,
                        padding: "10px 12px",
                        borderRadius: 3,
                        background: "rgba(241, 236, 224, 0.02)",
                        border: "1px solid var(--vr-gold-line)",
                        color: "var(--vr-cream-dim)",
                        cursor: "pointer",
                        fontFamily: "var(--ff-sans)",
                        lineHeight: 1.4,
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {chat.messages.map(m => (
            <div
              key={m.id}
              style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "88%",
                  padding: "10px 13px",
                  borderRadius: 6,
                  fontSize: 13,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  ...(m.role === "user"
                    ? {
                        background: "rgba(200, 169, 104, 0.08)",
                        border: "1px solid var(--vr-gold-line)",
                        color: "var(--vr-cream)",
                      }
                    : {
                        background: "rgba(241, 236, 224, 0.03)",
                        border: "1px solid var(--vr-line)",
                        borderLeft: "2px solid var(--vr-gold)",
                        color: "var(--vr-cream-dim)",
                      }),
                }}
              >
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    return <span key={i}>{part.text}</span>
                  }
                  return null
                })}
              </div>
            </div>
          ))}

          {isLoading && chat.messages[chat.messages.length - 1]?.role === "user" && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  padding: "10px 13px",
                  borderRadius: 6,
                  background: "rgba(241, 236, 224, 0.03)",
                  border: "1px solid var(--vr-line)",
                  borderLeft: "2px solid var(--vr-gold)",
                  display: "flex",
                  gap: 4,
                }}
              >
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--vr-gold)",
                      opacity: 0.4,
                      animation: `vr-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div
          style={{
            padding: 12,
            borderTop: "1px solid var(--vr-line)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 4,
              border: "1px solid var(--vr-line-hi)",
              background: "rgba(241, 236, 224, 0.02)",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Ask Talon. ⌘+Enter to send."
              rows={1}
              style={{
                flex: 1,
                resize: "none",
                background: "transparent",
                border: "none",
                outline: "none",
                fontFamily: "var(--ff-sans)",
                fontSize: 13,
                color: "var(--vr-cream)",
                lineHeight: 1.45,
                maxHeight: 120,
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={!input.trim() || isLoading}
              aria-label="Send"
              style={{
                padding: "6px 10px",
                background: "var(--vr-gold)",
                color: "var(--vr-ink)",
                border: "none",
                borderRadius: 3,
                cursor: !input.trim() || isLoading ? "default" : "pointer",
                opacity: !input.trim() || isLoading ? 0.4 : 1,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              →
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
