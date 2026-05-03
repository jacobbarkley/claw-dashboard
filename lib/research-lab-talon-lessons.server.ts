import { promises as fs } from "fs"
import path from "path"

import yaml from "js-yaml"

import {
  commitDashboardFiles,
  readDashboardFileText,
  type MultiFileCommitResult,
} from "@/lib/github-multi-file-commit.server"

export interface TalonStrategyLesson {
  schema_version?: "research_lab.talon_strategy_lesson.v1"
  lesson_id?: string
  title?: string
  summary?: string
  source?: Record<string, unknown> | null
  prompt_rules?: string[]
  created_at?: string
  created_by?: string
}

export interface TalonExemplar {
  schema_version?: "research_lab.talon_exemplar.v1"
  exemplar_id?: string
  title?: string
  summary?: string
  prompt_rules?: string[]
}

export interface TalonContextIndex {
  schema_version?: "research_lab.talon_context_index.v1"
  lesson_files?: string[]
  exemplar_files?: string[]
}

export interface TalonPromptContext {
  index: TalonContextIndex | null
  lessons: TalonStrategyLesson[]
  exemplars: TalonExemplar[]
  formatted_prompt: string
}

export interface CreateTalonStrategyLessonInput {
  lessonId?: string | null
  title: string
  summary: string
  promptRules: string[]
  source?: Record<string, unknown> | null
  createdBy?: string | null
}

export interface CreateTalonStrategyLessonResult extends MultiFileCommitResult {
  lesson: TalonStrategyLesson
  relpath: string
  index: TalonContextIndex
}

const LESSON_ROOT = path.join(process.cwd(), "data", "research_lab", "talon")
const INDEX_RELPATH = "data/research_lab/talon/_index.json"
const STRATEGY_LESSON_DIR = "data/research_lab/talon/strategy_lessons"

export async function loadTalonPromptContext(): Promise<TalonPromptContext> {
  const index = await readContextIndex()
  const [lessons, exemplars] = index
    ? await Promise.all([
        readIndexedYamlFiles<TalonStrategyLesson>(index.lesson_files ?? []),
        readIndexedYamlFiles<TalonExemplar>(index.exemplar_files ?? []),
      ])
    : await Promise.all([
        readYamlDirectory<TalonStrategyLesson>(path.join(LESSON_ROOT, "strategy_lessons")),
        readYamlDirectory<TalonExemplar>(path.join(LESSON_ROOT, "exemplars")),
      ])
  return {
    index,
    lessons,
    exemplars,
    formatted_prompt: formatPromptContext(lessons, exemplars),
  }
}

export async function formatTalonLessonsForPrompt(): Promise<string> {
  const context = await loadTalonPromptContext()
  return context.formatted_prompt
}

export async function createTalonStrategyLesson({
  lessonId,
  title,
  summary,
  promptRules,
  source = null,
  createdBy = "jacob",
}: CreateTalonStrategyLessonInput): Promise<CreateTalonStrategyLessonResult> {
  const now = new Date().toISOString()
  const id = normalizeLessonId(lessonId) ?? buildLessonId(title, now)
  const relpath = `${STRATEGY_LESSON_DIR}/${id}.yaml`
  const index = normalizeIndex(await readContextIndex())
  const nextIndex: TalonContextIndex = {
    ...index,
    schema_version: "research_lab.talon_context_index.v1",
    lesson_files: appendUnique(index.lesson_files ?? [], relpath),
    exemplar_files: index.exemplar_files ?? [],
  }
  const lesson: TalonStrategyLesson = {
    schema_version: "research_lab.talon_strategy_lesson.v1",
    lesson_id: id,
    title,
    source,
    summary,
    prompt_rules: promptRules,
    created_at: now,
    created_by: createdBy ?? "jacob",
  }
  const persisted = await commitDashboardFiles({
    message: `research lab: record Talon lesson ${id}`,
    files: [
      {
        relpath,
        content: `${yaml.dump(lesson, { noRefs: true, lineWidth: 100 })}`,
      },
      {
        relpath: INDEX_RELPATH,
        content: `${JSON.stringify(nextIndex, null, 2)}\n`,
      },
    ],
  })
  return {
    ...persisted,
    lesson,
    relpath,
    index: nextIndex,
  }
}

function formatPromptContext(lessons: TalonStrategyLesson[], exemplars: TalonExemplar[]): string {
  const lines: string[] = []
  if (lessons.length) {
    lines.push("Durable Talon strategy lessons:")
    for (const lesson of lessons) {
      lines.push(`- ${lesson.title ?? "Untitled lesson"}: ${lesson.summary ?? ""}`.trim())
      for (const rule of lesson.prompt_rules ?? []) lines.push(`  - ${rule}`)
    }
  }
  if (exemplars.length) {
    lines.push("", "Known-good / known-bad exemplars:")
    for (const exemplar of exemplars) {
      lines.push(`- ${exemplar.title ?? "Untitled exemplar"}: ${exemplar.summary ?? ""}`.trim())
      for (const rule of exemplar.prompt_rules ?? []) lines.push(`  - ${rule}`)
    }
  }
  return lines.join("\n")
}

function normalizeIndex(index: TalonContextIndex | null): TalonContextIndex {
  return {
    schema_version: "research_lab.talon_context_index.v1",
    lesson_files: index?.lesson_files ?? [],
    exemplar_files: index?.exemplar_files ?? [],
  }
}

function appendUnique(values: string[], next: string): string[] {
  return values.includes(next) ? values : [...values, next]
}

function normalizeLessonId(input: string | null | undefined): string | null {
  if (!input) return null
  const normalized = safeSlug(input)
  return normalized || null
}

function buildLessonId(title: string, now: string): string {
  const stamp = now.replace(/\D/g, "").slice(0, 14)
  return `${safeSlug(title).slice(0, 64) || "talon_lesson"}_${stamp}`
}

function safeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

async function readContextIndex(): Promise<TalonContextIndex | null> {
  const raw = await readDashboardFileText(INDEX_RELPATH)
  if (!raw) return null
  return JSON.parse(raw) as TalonContextIndex
}

async function readIndexedYamlFiles<T>(relpaths: string[]): Promise<T[]> {
  const docs: Array<T | null> = await Promise.all(
    relpaths.map(async (relpath): Promise<T | null> => {
      const raw = await readDashboardFileText(relpath)
      return raw ? yaml.load(raw) as T : null
    }),
  )
  return docs.filter((doc): doc is T => doc !== null)
}

async function readYamlDirectory<T>(directory: string): Promise<T[]> {
  let names: string[]
  try {
    names = await fs.readdir(directory)
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return []
    throw err
  }
  const docs = await Promise.all(
    names
      .filter(name => name.endsWith(".yaml") || name.endsWith(".yml"))
      .sort()
      .map(async name => {
        const raw = await fs.readFile(path.join(directory, name), "utf-8")
        return yaml.load(raw) as T
      }),
  )
  return docs.filter(Boolean)
}
