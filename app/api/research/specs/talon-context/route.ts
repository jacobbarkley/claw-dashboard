// GET/POST /api/research/specs/talon-context
//
// Durable Talon quality-loop surface. GET shows the indexed prompt context;
// POST records a new strategy lesson into the file-backed context library so
// failed/repaired runs can improve future drafts without living only in chat.

import { NextRequest, NextResponse } from "next/server"

import {
  createTalonStrategyLesson,
  loadTalonPromptContext,
} from "@/lib/research-lab-talon-lessons.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface LessonBody {
  lesson_id?: unknown
  title?: unknown
  summary?: unknown
  prompt_rules?: unknown
  source?: unknown
  created_by?: unknown
}

export async function GET() {
  try {
    const context = await loadTalonPromptContext()
    return NextResponse.json({ ok: true, context })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Talon context" },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  let body: LessonBody
  try {
    body = (await req.json()) as LessonBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  try {
    const title = requiredString(body.title, "title")
    const summary = requiredString(body.summary, "summary")
    const promptRules = stringList(body.prompt_rules)
    if (promptRules.length === 0) {
      throw new Error("prompt_rules must include at least one durable prompt rule")
    }
    const source = recordOrNull(body.source)
    const result = await createTalonStrategyLesson({
      lessonId: optionalString(body.lesson_id),
      title,
      summary,
      promptRules,
      source,
      createdBy: optionalString(body.created_by) ?? "jacob",
    })
    return NextResponse.json({ ok: true, ...result }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid Talon lesson" },
      { status: 400 },
    )
  }
}

function requiredString(input: unknown, field: string): string {
  const value = optionalString(input)
  if (!value) throw new Error(`${field} is required`)
  return value
}

function optionalString(input: unknown): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null
}

function stringList(input: unknown): string[] {
  return Array.isArray(input)
    ? input
        .filter((item): item is string => typeof item === "string")
        .map(item => item.trim())
        .filter(Boolean)
    : []
}

function recordOrNull(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  return input as Record<string, unknown>
}
