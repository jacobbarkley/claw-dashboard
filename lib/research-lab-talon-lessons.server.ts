import { promises as fs } from "fs"
import path from "path"

import yaml from "js-yaml"

import { readDashboardFileText } from "@/lib/github-multi-file-commit.server"

interface LessonFile {
  title?: string
  summary?: string
  prompt_rules?: string[]
}

interface ExemplarFile {
  title?: string
  summary?: string
  prompt_rules?: string[]
}

interface TalonContextIndex {
  lesson_files?: string[]
  exemplar_files?: string[]
}

const LESSON_ROOT = path.join(process.cwd(), "data", "research_lab", "talon")
const INDEX_RELPATH = "data/research_lab/talon/_index.json"

export async function formatTalonLessonsForPrompt(): Promise<string> {
  const index = await readContextIndex()
  const [lessons, exemplars] = index
    ? await Promise.all([
        readIndexedYamlFiles<LessonFile>(index.lesson_files ?? []),
        readIndexedYamlFiles<ExemplarFile>(index.exemplar_files ?? []),
      ])
    : await Promise.all([
        readYamlDirectory<LessonFile>(path.join(LESSON_ROOT, "strategy_lessons")),
        readYamlDirectory<ExemplarFile>(path.join(LESSON_ROOT, "exemplars")),
      ])
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
