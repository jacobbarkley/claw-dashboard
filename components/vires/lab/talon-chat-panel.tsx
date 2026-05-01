"use client"

// Conversational drafting/refinement panel for an editable spec. Operator
// chats with Talon; each turn either:
//   - asks a clarifying question (kind=clarification, no spec change),
//   - returns a proposed revision (kind=revision; spec stays untouched
//     until operator deliberately taps Apply), or
//   - returns a BLOCKED revision (operator can see why, can't apply).
//
// Revisions are propose-only on the server (POST /revise-with-talon).
// Applying a proposal hits POST /apply-talon-revision with the same
// proposal+assessment payload, where the server re-runs the readiness
// check and writes the spec YAML + per-revision provenance.
//
// Conversation state (including proposals) persists to localStorage
// keyed by spec_id so a refresh keeps the chat. Cleared via the panel's
// "Clear conversation" link.

import { useEffect, useRef, useState } from "react"

import type { ScopeTriple, StrategySpecV1 } from "@/lib/research-lab-contracts"

import { TALON_WARN_KEY_PREFIX } from "./idea-thread-live"

const TALON_CHAT_KEY_PREFIX = "talon-chat:"

type Verdict = "PASS" | "WARN" | "BLOCKED"

interface DataReadinessLite {
  verdict: Verdict
  catalog_version: string
  warnings: string[]
}

interface ConversationMessage {
  role: "operator" | "talon"
  content: string
  kind?: "clarification" | "revision"
  timestamp?: string
  // Revision-only fields. Stored on the message so a refresh can restore
  // the Apply button on the latest unapplied proposal.
  proposal?: unknown
  assessment?: unknown
  data_readiness?: DataReadinessLite
  base_spec_version?: number
  applied?: boolean
  superseded?: boolean
}

interface ReviseResponse {
  kind?: "clarification" | "revision"
  reply?: string
  proposal?: unknown
  assessment?: unknown
  data_readiness?: DataReadinessLite
  base_spec_version?: number
  error?: string
  detail?: string
  talon_error?: string
}

interface ApplyResponse {
  ok?: boolean
  spec?: StrategySpecV1
  data_readiness?: DataReadinessLite
  error?: string
  detail?: string
}

interface TalonChatPanelProps {
  specId: string
  scope: ScopeTriple
  authoringMode: StrategySpecV1["authoring_mode"]
  specState: StrategySpecV1["state"]
  /**
   * Called after a successful Apply with the revised spec from the server
   * response. Parent should swap its local state to this spec immediately
   * so the form rerenders with v(N+1) without waiting for a deploy roundtrip.
   */
  onRevised: (revisedSpec: StrategySpecV1) => void
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
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  const storageKey = `${TALON_CHAT_KEY_PREFIX}${specId}`
  const visible =
    (specState === "DRAFTING" || specState === "AWAITING_APPROVAL")
  const isOperatorDrafted = authoringMode === "OPERATOR_DRAFTED"
  const panelTitle = isOperatorDrafted ? "Draft with Talon" : "Refine with Talon"
  const emptyCopy = isOperatorDrafted
    ? "Tell Talon what this strategy should become. It will use the idea thesis, current template, reference strategies, experiment plan, and data catalog to propose a complete draft. Nothing overwrites until you tap Apply changes."
    : "Spill what you want changed — sweep ranges, exit logic, universe, anything. Talon will ask follow-up questions if the message is vague, or propose a revised spec when it has enough to go on. Proposals don't auto-apply — review the reply, then tap Apply changes."
  const placeholder = isOperatorDrafted
    ? "Ask Talon to draft the full spec from this idea..."
    : "Talk to Talon — what should change?"

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

  useEffect(() => {
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [conversation, busy, applyingIdx])

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
    // Find the latest unapplied, non-blocked, non-superseded proposal —
    // that's the cumulative working baseline Talon should build on.
    const pendingProposalMessage = (() => {
      for (let i = conversationForServer.length - 1; i >= 0; i--) {
        const m = conversationForServer[i]
        if (
          m.role === "talon" &&
          m.kind === "revision" &&
          !m.applied &&
          !m.superseded &&
          m.data_readiness?.verdict !== "BLOCKED" &&
          m.proposal &&
          m.assessment
        ) {
          return m
        }
      }
      return null
    })()

    setConversation(prev => [...prev, operatorMessage])
    setInput("")
    setBusy(true)
    setError(null)

    const restoreInput = () => setInput(trimmed)

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
            pending_proposal: pendingProposalMessage?.proposal ?? null,
            pending_proposal_reply: pendingProposalMessage?.content ?? null,
          }),
        },
      )
    } catch (err) {
      console.error("[talon-revise] fetch threw:", err)
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}. Your message is back in the input — try again.`)
      restoreInput()
      setBusy(false)
      return
    }

    const rawBody = await res.text()
    let payload: ReviseResponse = {}
    try {
      payload = rawBody ? (JSON.parse(rawBody) as ReviseResponse) : {}
    } catch {
      console.error("[talon-revise] non-JSON response:", { status: res.status, rawBody })
      const timeoutLabel =
        res.status === 504
          ? "Talon timed out before Anthropic finished. Try again — your message is back in the input. Tighter messages tend to come back faster."
          : `Talon returned non-JSON (status ${res.status}). Your message is back in the input.`
      setError(timeoutLabel)
      restoreInput()
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
            : res.status === 504
              ? "Talon timed out. Try again — your message is back in the input"
              : `Revision failed (${res.status})`
      console.error("[talon-revise] non-success:", { status: res.status, payload })
      setError(detail ? `${baseLabel}: ${detail}` : baseLabel)
      restoreInput()
      setBusy(false)
      return
    }

    if (!payload.reply || !payload.kind) {
      setError("Talon returned an empty response. Your message is back in the input — try again.")
      restoreInput()
      setBusy(false)
      return
    }

    const talonMessage: ConversationMessage = {
      role: "talon",
      content: payload.reply,
      kind: payload.kind,
      timestamp: new Date().toISOString(),
      proposal: payload.proposal,
      assessment: payload.assessment,
      data_readiness: payload.data_readiness,
      base_spec_version: payload.base_spec_version,
      applied: false,
      superseded: false,
    }
    // If the new turn is a revision, every earlier unapplied
    // non-blocked proposal becomes superseded — only the latest
    // proposal is the working baseline.
    setConversation(prev => {
      const next =
        payload.kind === "revision" && payload.proposal
          ? prev.map(m =>
              m.role === "talon" &&
              m.kind === "revision" &&
              !m.applied &&
              !m.superseded &&
              m.data_readiness?.verdict !== "BLOCKED"
                ? { ...m, superseded: true }
                : m,
            )
          : prev
      return [...next, talonMessage]
    })
    setBusy(false)
  }

  const onApply = async (messageIdx: number) => {
    const target = conversation[messageIdx]
    if (
      !target ||
      target.kind !== "revision" ||
      !target.proposal ||
      !target.assessment ||
      target.applied ||
      target.superseded
    ) {
      return
    }
    if (target.data_readiness?.verdict === "BLOCKED") return

    setApplyingIdx(messageIdx)
    setError(null)

    let res: Response
    try {
      // Find the operator message that prompted this revision (the one
      // immediately preceding this Talon message). Best-effort — the
      // server stores it as audit context only.
      const operatorTriggerMessage =
        messageIdx > 0 && conversation[messageIdx - 1]?.role === "operator"
          ? conversation[messageIdx - 1].content
          : null

      res = await fetch(
        `/api/research/specs/${encodeURIComponent(specId)}/apply-talon-revision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope,
            proposal: target.proposal,
            assessment: target.assessment,
            base_spec_version: target.base_spec_version,
            talon_reply: target.content,
            operator_message: operatorTriggerMessage,
            conversation_at_revision: conversation
              .slice(0, messageIdx)
              .map(m => ({ role: m.role, content: m.content })),
          }),
        },
      )
    } catch (err) {
      console.error("[talon-apply] fetch threw:", err)
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`)
      setApplyingIdx(null)
      return
    }

    const rawBody = await res.text()
    let payload: ApplyResponse = {}
    try {
      payload = rawBody ? (JSON.parse(rawBody) as ApplyResponse) : {}
    } catch {
      console.error("[talon-apply] non-JSON response:", { status: res.status, rawBody })
      setError(`Apply returned non-JSON (status ${res.status})`)
      setApplyingIdx(null)
      return
    }

    if (res.status === 422) {
      // Server re-checked and verdict became BLOCKED. Mark this proposal
      // as blocked + surface the reason.
      setConversation(prev =>
        prev.map((m, idx) =>
          idx === messageIdx
            ? {
                ...m,
                data_readiness: payload.data_readiness ?? m.data_readiness,
              }
            : m,
        ),
      )
      const blockedReason =
        payload.data_readiness?.warnings?.join("; ") ??
        payload.detail ??
        "Server re-checked the proposal and rejected it as BLOCKED."
      setError(`Couldn't apply this revision: ${blockedReason}`)
      setApplyingIdx(null)
      return
    }

    if (!res.ok || !payload.spec) {
      const detail = payload.detail ?? payload.error
      console.error("[talon-apply] non-success:", { status: res.status, payload })
      setError(detail ?? `Apply failed (${res.status})`)
      setApplyingIdx(null)
      return
    }
    const revisedSpec = payload.spec

    // Mark this message applied, mark every earlier unapplied revision
    // superseded. Keep the warn-key in sync with the new readiness.
    setConversation(prev =>
      prev.map((m, idx) => {
        if (idx === messageIdx) {
          return { ...m, applied: true, data_readiness: payload.data_readiness ?? m.data_readiness }
        }
        if (idx < messageIdx && m.kind === "revision" && !m.applied && !m.superseded) {
          return { ...m, superseded: true }
        }
        return m
      }),
    )

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

    setApplyingIdx(null)
    onRevised(revisedSpec)
  }

  // Find the latest revision message that is applyable (PASS/WARN,
  // not applied, not superseded). Only that one renders an Apply button.
  const latestApplyableIdx = (() => {
    for (let i = conversation.length - 1; i >= 0; i--) {
      const m = conversation[i]
      if (
        m.role === "talon" &&
        m.kind === "revision" &&
        !m.applied &&
        !m.superseded &&
        m.data_readiness?.verdict !== "BLOCKED" &&
        m.proposal &&
        m.assessment
      ) {
        return i
      }
    }
    return null
  })()

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
          {panelTitle}
        </div>
        {conversation.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            disabled={busy || applyingIdx !== null}
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
              opacity: busy || applyingIdx !== null ? 0.5 : 1,
            }}
          >
            Clear conversation
          </button>
        )}
      </div>

      <div
        ref={logRef}
        style={{
          maxHeight: 360,
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
            {emptyCopy}
          </div>
        )}
        {conversation.map((m, idx) => (
          <ChatBubble
            key={`${m.timestamp ?? idx}-${m.role}`}
            message={m}
            isLatestApplyable={idx === latestApplyableIdx}
            isApplying={applyingIdx === idx}
            onApply={() => void onApply(idx)}
          />
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
          disabled={busy || applyingIdx !== null}
          rows={3}
          placeholder={placeholder}
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
            opacity: busy || applyingIdx !== null ? 0.65 : 1,
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
            disabled={busy || applyingIdx !== null || !input.trim()}
            style={{
              padding: "8px 16px",
              fontSize: 11.5,
              fontFamily: "var(--ff-mono)",
              background: "var(--vr-gold-soft)",
              border: "1px solid var(--vr-gold-line)",
              color: "var(--vr-gold)",
              borderRadius: 3,
              cursor: busy || applyingIdx !== null || !input.trim() ? "not-allowed" : "pointer",
              opacity: busy || applyingIdx !== null || !input.trim() ? 0.5 : 1,
            }}
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChatBubble({
  message,
  isLatestApplyable,
  isApplying,
  onApply,
}: {
  message: ConversationMessage
  isLatestApplyable: boolean
  isApplying: boolean
  onApply: () => void
}) {
  const isOperator = message.role === "operator"
  const align = isOperator ? "flex-end" : "flex-start"

  const status = bubbleStatus(message)
  const accent = status.accent
  const background = isOperator
    ? "rgba(207,168,84,0.07)"
    : status.background ?? "var(--vr-ink)"
  const border = isOperator ? "var(--vr-gold-line)" : status.border ?? "var(--vr-line)"
  const label = isOperator ? "You" : status.label

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
          gap: 6,
          opacity: status.muted ? 0.6 : 1,
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
        {!isOperator && message.kind === "revision" && status.detail && (
          <div
            style={{
              fontSize: 11,
              color: "var(--vr-cream-mute)",
              fontStyle: "italic",
              fontFamily: "var(--ff-serif)",
              lineHeight: 1.45,
            }}
          >
            {status.detail}
          </div>
        )}
        {!isOperator && isLatestApplyable && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
            <button
              type="button"
              onClick={onApply}
              disabled={isApplying}
              style={{
                padding: "6px 12px",
                fontSize: 11,
                fontFamily: "var(--ff-mono)",
                background: "var(--vr-gold-soft)",
                border: "1px solid var(--vr-gold-line)",
                color: "var(--vr-gold)",
                borderRadius: 3,
                cursor: isApplying ? "not-allowed" : "pointer",
                opacity: isApplying ? 0.5 : 1,
              }}
            >
              {isApplying ? "Applying…" : "Apply changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface BubbleStatus {
  label: string
  accent: string
  background?: string
  border?: string
  muted?: boolean
  detail?: string
}

function bubbleStatus(message: ConversationMessage): BubbleStatus {
  if (message.role === "operator") {
    return { label: "You", accent: "var(--vr-gold)" }
  }
  if (message.kind !== "revision") {
    return { label: "Talon", accent: "var(--vr-cream-mute)" }
  }
  const verdict = message.data_readiness?.verdict
  if (verdict === "BLOCKED") {
    return {
      label: "Talon · proposed (blocked)",
      accent: "var(--vr-down)",
      background: "rgba(220,90,90,0.05)",
      border: "var(--vr-down)",
      detail:
        message.data_readiness?.warnings && message.data_readiness.warnings.length > 0
          ? `Blocked because: ${message.data_readiness.warnings.join("; ")}`
          : "Blocked — proposal references unavailable data.",
    }
  }
  if (message.applied) {
    return {
      label: "Talon · applied",
      accent: "var(--vr-up)",
      background: "rgba(120,180,140,0.05)",
      border: "var(--vr-up)",
      detail: verdict === "WARN" ? "Applied with WARN — see callout above the form." : "Applied.",
    }
  }
  if (message.superseded) {
    return {
      label: "Talon · superseded",
      accent: "var(--vr-cream-faint)",
      muted: true,
      detail: "A later revision was applied; this proposal is now stale.",
    }
  }
  // Active proposal awaiting Apply.
  const verdictDetail =
    verdict === "WARN" && message.data_readiness?.warnings.length
      ? `Proposed with WARN — ${message.data_readiness.warnings.join("; ")}`
      : "Proposed — review the reply, then tap Apply changes."
  return {
    label: "Talon · proposed",
    accent: "var(--vr-gold)",
    background: "rgba(207,168,84,0.05)",
    border: "var(--vr-gold-line)",
    detail: verdictDetail,
  }
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
