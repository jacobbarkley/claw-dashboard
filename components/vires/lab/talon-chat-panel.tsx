"use client"

// Conversational refinement panel for an AI_DRAFTED spec. Lives above the
// strategy-spec form on /vires/bench/lab/ideas/[id]/spec/edit. Each turn
// hits POST /api/research/specs/[id]/revise-with-talon, which either asks
// a clarifying question (kind=clarification, no spec change) or returns a
// revised proposal that the server has already re-checked + persisted in
// place (kind=revision; spec_version bumped). On a successful revision we
// call onRevised() so the parent can router.refresh() and re-render the
// form from the persisted YAML.
//
// Conversation persists to localStorage keyed by spec_id so a refresh
// keeps the chat. Cleared manually via the "Clear conversation" link.

import { useEffect, useRef, useState } from "react"

import type { ScopeTriple, StrategySpecV1 } from "@/lib/research-lab-contracts"

import { TALON_WARN_KEY_PREFIX } from "./idea-thread-live"

const TALON_CHAT_KEY_PREFIX = "talon-chat:"

interface ConversationMessage {
  role: "operator" | "talon"
  content: string
  kind?: "clarification" | "revision"
  timestamp?: string
}

interface ReviseResponse {
  kind?: "clarification" | "revision"
  reply?: string
  spec?: StrategySpecV1
  data_readiness?: {
    verdict: "PASS" | "WARN" | "BLOCKED"
    catalog_version: string
    warnings: string[]
  }
  error?: string
  detail?: string
  talon_error?: string
}

interface TalonChatPanelProps {
  specId: string
  scope: ScopeTriple
  authoringMode: StrategySpecV1["authoring_mode"]
  specState: StrategySpecV1["state"]
  onRevised: () => void
}

export function TalonChatPanel({
  specId,
  scope,
  authoringMode,
  specState,
  onRevised,
}: TalonChatPanelProps) {
  const [conversation, setConversation] = useState<ConversationMessage[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  const storageKey = `${TALON_CHAT_KEY_PREFIX}${specId}`
  const visible =
    authoringMode === "AI_DRAFTED" &&
    (specState === "DRAFTING" || specState === "AWAITING_APPROVAL")

  // Load persisted conversation on mount. The lint rule flags the
  // setState-in-effect pattern, but it's the correct shape for syncing
  // localStorage to client state without a hydration mismatch — server
  // renders empty, effect populates after hydrate.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as ConversationMessage[]
      if (Array.isArray(parsed)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setConversation(
          parsed.filter(
            (m): m is ConversationMessage =>
              !!m && (m.role === "operator" || m.role === "talon") && typeof m.content === "string",
          ),
        )
      }
    } catch {
      // Malformed cache — start fresh, don't surface to the operator.
    }
  }, [storageKey])

  // Persist on every change.
  useEffect(() => {
    if (conversation.length === 0) {
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        // ignore
      }
      return
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(conversation))
    } catch {
      // localStorage full or unavailable — chat won't persist but session works.
    }
  }, [conversation, storageKey])

  // Auto-scroll the message log to the bottom on new messages or busy flips.
  useEffect(() => {
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [conversation, busy])

  if (!visible) return null

  const onClear = () => {
    setConversation([])
    setError(null)
  }

  const onSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || busy) return

    const operatorMessage: ConversationMessage = {
      role: "operator",
      content: trimmed,
      timestamp: new Date().toISOString(),
    }
    const conversationForServer = conversation
    setConversation(prev => [...prev, operatorMessage])
    setInput("")
    setBusy(true)
    setError(null)

    let res: Response
    try {
      res = await fetch(
        `/api/research/specs/${encodeURIComponent(specId)}/revise-with-talon`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope,
            conversation: conversationForServer.map(m => ({ role: m.role, content: m.content })),
            message: trimmed,
          }),
        },
      )
    } catch (err) {
      console.error("[talon-revise] fetch threw:", err)
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`)
      setBusy(false)
      return
    }

    const rawBody = await res.text()
    let payload: ReviseResponse = {}
    try {
      payload = rawBody ? (JSON.parse(rawBody) as ReviseResponse) : {}
    } catch {
      console.error("[talon-revise] non-JSON response:", { status: res.status, rawBody })
      setError(`Talon returned non-JSON (status ${res.status})`)
      setBusy(false)
      return
    }

    if (!res.ok) {
      const detail = payload.talon_error ?? payload.detail ?? payload.error
      const baseLabel =
        res.status === 503
          ? "Talon isn't configured on this deployment"
          : res.status === 502
            ? "Talon is unreachable right now"
            : `Revision failed (${res.status})`
      console.error("[talon-revise] non-success:", { status: res.status, payload })
      setError(detail ? `${baseLabel}: ${detail}` : baseLabel)
      setBusy(false)
      return
    }

    if (!payload.reply || !payload.kind) {
      setError("Talon returned an empty response.")
      setBusy(false)
      return
    }

    const talonMessage: ConversationMessage = {
      role: "talon",
      content: payload.reply,
      kind: payload.kind,
      timestamp: new Date().toISOString(),
    }
    setConversation(prev => [...prev, talonMessage])

    if (payload.kind === "revision" && payload.spec) {
      const dr = payload.data_readiness
      const warnKey = `${TALON_WARN_KEY_PREFIX}${specId}`
      try {
        if (dr?.verdict === "WARN" && dr.warnings.length > 0) {
          window.localStorage.setItem(
            warnKey,
            JSON.stringify({
              warnings: dr.warnings,
              catalog_version: dr.catalog_version,
              created_at: new Date().toISOString(),
            }),
          )
        } else if (dr?.verdict === "PASS") {
          window.localStorage.removeItem(warnKey)
        }
      } catch {
        // ignore storage failure
      }
      onRevised()
    }

    setBusy(false)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void onSend()
    }
  }

  return (
    <div
      className="vr-card"
      style={{
        padding: "14px 14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            fontSize: 16,
            color: "var(--vr-cream)",
          }}
        >
          Refine with Talon
        </div>
        {conversation.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="t-mono"
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              fontSize: 10.5,
              color: "var(--vr-cream-faint)",
              cursor: "pointer",
              letterSpacing: "0.04em",
              textDecoration: "underline",
              opacity: busy ? 0.5 : 1,
            }}
          >
            Clear conversation
          </button>
        )}
      </div>

      <div
        ref={logRef}
        style={{
          maxHeight: 320,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: conversation.length === 0 ? 0 : "8px 2px",
        }}
      >
        {conversation.length === 0 && !busy && (
          <div
            style={{
              padding: "10px 12px",
              background: "var(--vr-ink)",
              border: "1px solid var(--vr-line)",
              borderRadius: 3,
              fontSize: 11.5,
              color: "var(--vr-cream-dim)",
              lineHeight: 1.55,
              fontStyle: "italic",
              fontFamily: "var(--ff-serif)",
            }}
          >
            Spill what you want changed — sweep ranges, exit logic, universe, anything. Talon will ask follow-up questions if the message is vague, or return a revised spec when it has enough to go on. Each revision overwrites the current spec and bumps the version.
          </div>
        )}
        {conversation.map((m, idx) => (
          <ChatBubble key={`${m.timestamp ?? idx}-${m.role}`} message={m} />
        ))}
        {busy && <ThinkingBubble />}
      </div>

      {error && (
        <div
          style={{
            padding: "8px 10px",
            border: "1px solid var(--vr-down)",
            borderRadius: 3,
            background: "rgba(220,90,90,0.08)",
            color: "var(--vr-cream)",
            fontSize: 11.5,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          rows={3}
          placeholder="Talk to Talon — what should change?"
          style={{
            width: "100%",
            resize: "vertical",
            padding: "10px 12px",
            background: "var(--vr-ink)",
            border: "1px solid var(--vr-line)",
            borderRadius: 3,
            color: "var(--vr-cream)",
            fontFamily: "var(--ff-sans)",
            lineHeight: 1.5,
            opacity: busy ? 0.65 : 1,
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            className="t-mono"
            style={{ fontSize: 9.5, color: "var(--vr-cream-faint)", letterSpacing: "0.04em" }}
          >
            ⌘/ctrl + Enter to send
          </span>
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={busy || !input.trim()}
            style={{
              padding: "8px 16px",
              fontSize: 11.5,
              fontFamily: "var(--ff-mono)",
              background: "var(--vr-gold-soft)",
              border: "1px solid var(--vr-gold-line)",
              color: "var(--vr-gold)",
              borderRadius: 3,
              cursor: busy || !input.trim() ? "not-allowed" : "pointer",
              opacity: busy || !input.trim() ? 0.5 : 1,
            }}
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChatBubble({ message }: { message: ConversationMessage }) {
  const isOperator = message.role === "operator"
  const align = isOperator ? "flex-end" : "flex-start"
  const background = isOperator ? "rgba(207,168,84,0.07)" : "var(--vr-ink)"
  const border = isOperator ? "var(--vr-gold-line)" : "var(--vr-line)"
  const accent = isOperator ? "var(--vr-gold)" : "var(--vr-cream-mute)"
  const label = isOperator ? "You" : message.kind === "revision" ? "Talon · revised" : "Talon"

  return (
    <div style={{ display: "flex", justifyContent: align }}>
      <div
        style={{
          maxWidth: "88%",
          padding: "8px 12px",
          background,
          border: `1px solid ${border}`,
          borderRadius: 3,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div
          className="t-eyebrow"
          style={{ fontSize: 9, color: accent, letterSpacing: "0.14em" }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--vr-cream)",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {message.content}
        </div>
      </div>
    </div>
  )
}

function ThinkingBubble() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        style={{
          padding: "8px 12px",
          background: "var(--vr-ink)",
          border: "1px solid var(--vr-line)",
          borderRadius: 3,
          fontSize: 12,
          color: "var(--vr-cream-mute)",
          fontStyle: "italic",
          fontFamily: "var(--ff-serif)",
        }}
      >
        Talon is thinking…
      </div>
    </div>
  )
}
