"use client"

import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"
import { useState, useRef, useEffect, useMemo } from "react"
import { Nav } from "@/components/nav"
import { Send, Loader2, Trash2 } from "lucide-react"

export function ChatPanel() {
  const transport = useMemo(() => new TextStreamChatTransport({ api: "/api/chat" }), [])
  const chat = useChat({ transport })
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chat.messages])

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = "auto"
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"
  }

  const send = () => {
    const text = input.trim()
    if (!text || chat.status === "streaming" || chat.status === "submitted") return
    chat.sendMessage({ text })
    setInput("")
    if (inputRef.current) inputRef.current.style.height = "auto"
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const isLoading = chat.status === "streaming" || chat.status === "submitted"

  if (!mounted) return null

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col">
      <Nav active="chat" />

      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4 pb-32">
          {chat.messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full min-h-[40vh] space-y-3">
              <div className="text-lg font-medium" style={{ color: "var(--cb-text-primary, #f0eff8)" }}>
                ClawBoy Assistant
              </div>
              <div className="text-sm text-center max-w-md" style={{ color: "var(--cb-text-tertiary, #52506a)" }}>
                Ask about your portfolio, strategy, market regime, or trading decisions. I have live context from the operator feed.
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {["Why didn't we trade today?", "What's our current regime?", "Explain the active strategy", "How's the portfolio doing?"].map((q) => (
                  <button
                    key={q}
                    onClick={() => chat.sendMessage({ text: q })}
                    className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:border-zinc-600"
                    style={{
                      borderColor: "rgba(90,70,160,0.2)",
                      color: "var(--cb-text-secondary, #8a87a8)",
                      background: "radial-gradient(circle at top left, rgba(34,197,94,0.06), transparent 40%), rgba(24,24,27,0.8)",
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chat.messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user" ? "rounded-br-md" : "rounded-bl-md"
                }`}
                style={
                  m.role === "user"
                    ? {
                        background: "radial-gradient(circle at top left, rgba(34,197,94,0.14), transparent 40%), radial-gradient(circle at bottom right, rgba(79,70,229,0.12), transparent 40%), rgba(24,24,27,0.95)",
                        border: "1px solid rgba(90,70,160,0.2)",
                        color: "var(--cb-text-primary, #f0eff8)",
                      }
                    : {
                        background: "rgba(9,9,11,0.8)",
                        border: "1px solid rgba(63,63,70,0.3)",
                        color: "var(--cb-text-secondary, #8a87a8)",
                      }
                }
              >
                <div className="whitespace-pre-wrap">
                  {m.parts?.map((part, i) =>
                    part.type === "text" ? <span key={i}>{part.text}</span> : null
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading && chat.messages[chat.messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <div
                className="rounded-2xl rounded-bl-md px-4 py-3"
                style={{
                  background: "rgba(9,9,11,0.8)",
                  border: "1px solid rgba(63,63,70,0.3)",
                }}
              >
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--cb-text-tertiary, #52506a)" }} />
              </div>
            </div>
          )}
        </div>

        {/* Input bar — fixed at bottom */}
        <div className="fixed bottom-0 left-0 right-0 sm:relative bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/50 px-4 sm:px-6 py-3">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your portfolio..."
                rows={1}
                className="w-full resize-none rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-zinc-600"
                style={{
                  background: "radial-gradient(circle at top left, rgba(34,197,94,0.06), transparent 50%), rgba(24,24,27,0.9)",
                  border: "1px solid rgba(90,70,160,0.2)",
                  color: "var(--cb-text-primary, #f0eff8)",
                }}
              />
            </div>
            {chat.messages.length > 0 && (
              <button
                type="button"
                onClick={() => chat.setMessages([])}
                className="p-2.5 rounded-xl transition-colors hover:bg-zinc-800"
                style={{ color: "var(--cb-text-tertiary, #52506a)" }}
                title="Clear chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={send}
              disabled={isLoading || !input.trim()}
              className="p-2.5 rounded-xl transition-colors disabled:opacity-30"
              style={{
                background: input.trim() ? "rgba(34,197,94,0.15)" : "transparent",
                border: "1px solid rgba(34,197,94,0.2)",
                color: "var(--cb-green, #22c55e)",
              }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
