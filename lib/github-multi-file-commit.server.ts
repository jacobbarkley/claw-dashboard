// Small Git Data API helper for atomic dashboard artifact commits.
//
// The GitHub Contents API writes one file per commit. Phase E needs spec +
// queue + audit updates to land together, so this helper writes multiple blobs,
// composes a tree, creates a commit, and fast-forwards the target ref.

import { promises as fs } from "fs"
import path from "path"

const GITHUB_REPO = "jacobbarkley/claw-dashboard"
const GITHUB_API = "https://api.github.com"
const DEFAULT_BRANCH = "main"
const BRANCH_OVERRIDE_KEYS = [
  "DASHBOARD_ARTIFACT_BRANCH",
  "DASHBOARD_MUTATION_BRANCH",
  "GITHUB_BRANCH",
] as const

export interface MultiFileCommitWrite {
  relpath: string
  content: string
}

export interface MultiFileCommitResult {
  mode: "github" | "local"
  commit_sha: string | null
  files: string[]
  branch: string | null
}

export interface DashboardDirectoryEntry {
  name: string
  path: string
  type: "file" | "dir" | string
}

export function dashboardArtifactBranch(): string {
  for (const key of BRANCH_OVERRIDE_KEYS) {
    const value = process.env[key]?.trim()
    if (value) return normalizeBranch(value, key)
  }

  const vercelRef = process.env.VERCEL_GIT_COMMIT_REF?.trim()
  if (vercelRef) return normalizeBranch(vercelRef, "VERCEL_GIT_COMMIT_REF")

  if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
    throw new Error(
      "VERCEL_GIT_COMMIT_REF is required for preview dashboard artifact writes. " +
        "Refusing to fall back to main from a preview deployment.",
    )
  }

  return DEFAULT_BRANCH
}

export async function commitDashboardFiles({
  files,
  message,
  branch = dashboardArtifactBranch(),
}: {
  files: MultiFileCommitWrite[]
  message: string
  branch?: string
}): Promise<MultiFileCommitResult> {
  if (files.length === 0) {
    return { mode: "local", commit_sha: null, files: [], branch: null }
  }
  const targetBranch = normalizeBranch(branch, "branch")
  const token = process.env.GITHUB_TOKEN
  if (token) return commitGithubFiles({ files, message, branch: targetBranch, token })
  if (process.env.VERCEL) {
    throw new Error("GITHUB_TOKEN is required for dashboard artifact writes on Vercel.")
  }
  return writeLocalFiles(files)
}

export async function readDashboardFileText(
  relpath: string,
  branch = dashboardArtifactBranch(),
): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN
  if (token) return readGithubFileText(relpath, token, normalizeBranch(branch, "branch"))
  try {
    return await fs.readFile(resolveRepoPath(relpath), "utf-8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null
    throw err
  }
}

export async function readDashboardDirectory(
  relpath: string,
  branch = dashboardArtifactBranch(),
): Promise<DashboardDirectoryEntry[] | null> {
  const token = process.env.GITHUB_TOKEN
  if (!token) return null
  return readGithubDirectory(relpath, token, normalizeBranch(branch, "branch"))
}

async function writeLocalFiles(files: MultiFileCommitWrite[]): Promise<MultiFileCommitResult> {
  const writes = await Promise.all(
    files.map(async (file, index) => {
      const absPath = resolveRepoPath(file.relpath)
      await fs.mkdir(path.dirname(absPath), { recursive: true })
      const tempPath = path.join(
        path.dirname(absPath),
        `.${path.basename(absPath)}.${process.pid}.${Date.now()}.${index}.tmp`,
      )
      let previous: string | null = null
      try {
        previous = await fs.readFile(absPath, "utf-8")
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err
      }
      await fs.writeFile(tempPath, file.content)
      return { relpath: file.relpath, absPath, tempPath, previous }
    }),
  )

  const applied: typeof writes = []
  try {
    for (const write of writes) {
      await fs.rename(write.tempPath, write.absPath)
      applied.push(write)
    }
  } catch (err) {
    for (const write of applied.reverse()) {
      try {
        if (write.previous === null) {
          await fs.unlink(write.absPath)
        } else {
          await fs.writeFile(write.absPath, write.previous)
        }
      } catch (rollbackErr) {
        console.error(`[multi-file-commit] rollback failed for ${write.relpath}:`, rollbackErr)
      }
    }
    await Promise.allSettled(writes.map(write => fs.unlink(write.tempPath)))
    throw err
  }
  return { mode: "local", commit_sha: null, files: files.map(file => file.relpath), branch: null }
}

function resolveRepoPath(relpath: string): string {
  const root = path.resolve(process.cwd())
  const absPath = path.resolve(root, relpath)
  if (absPath !== root && !absPath.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Refusing to write outside dashboard repo: ${relpath}`)
  }
  return absPath
}

async function commitGithubFiles({
  files,
  message,
  branch,
  token,
}: {
  files: MultiFileCommitWrite[]
  message: string
  branch: string
  token: string
}): Promise<MultiFileCommitResult> {
  const ref = await githubJson<{ object?: { sha?: string } }>(
    `/git/ref/heads/${encodePathSegments(branch)}`,
    token,
  )
  const baseCommitSha = ref.object?.sha
  if (!baseCommitSha) throw new Error(`Unable to resolve branch ref: ${branch}`)

  const baseCommit = await githubJson<{ tree?: { sha?: string } }>(
    `/git/commits/${baseCommitSha}`,
    token,
  )
  const baseTreeSha = baseCommit.tree?.sha
  if (!baseTreeSha) throw new Error(`Unable to resolve base tree for ${baseCommitSha}`)

  const tree = []
  for (const file of files) {
    const blob = await githubJson<{ sha?: string }>(
      "/git/blobs",
      token,
      {
        method: "POST",
        body: {
          content: file.content,
          encoding: "utf-8",
        },
      },
    )
    if (!blob.sha) throw new Error(`GitHub blob response missing sha for ${file.relpath}`)
    tree.push({
      path: file.relpath,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    })
  }

  const newTree = await githubJson<{ sha?: string }>(
    "/git/trees",
    token,
    {
      method: "POST",
      body: {
        base_tree: baseTreeSha,
        tree,
      },
    },
  )
  if (!newTree.sha) throw new Error("GitHub tree response missing sha")

  const commit = await githubJson<{ sha?: string }>(
    "/git/commits",
    token,
    {
      method: "POST",
      body: {
        message,
        tree: newTree.sha,
        parents: [baseCommitSha],
      },
    },
  )
  if (!commit.sha) throw new Error("GitHub commit response missing sha")

  await githubJson(
    `/git/refs/heads/${encodePathSegments(branch)}`,
    token,
    {
      method: "PATCH",
      body: {
        sha: commit.sha,
        force: false,
      },
    },
  )

  return {
    mode: "github",
    commit_sha: commit.sha,
    files: files.map(file => file.relpath),
    branch,
  }
}

async function readGithubFileText(relpath: string, token: string, branch: string): Promise<string | null> {
  const response = await fetch(
    `${GITHUB_API}/repos/${GITHUB_REPO}/contents/${encodePathSegments(relpath)}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw",
      },
      cache: "no-store",
    },
  )
  if (response.status === 404) return null
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`GitHub raw GET ${response.status}: ${detail}`)
  }
  return response.text()
}

async function readGithubDirectory(
  relpath: string,
  token: string,
  branch: string,
): Promise<DashboardDirectoryEntry[] | null> {
  const response = await fetch(
    `${GITHUB_API}/repos/${GITHUB_REPO}/contents/${encodePathSegments(relpath)}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    },
  )
  if (response.status === 404) return null
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`GitHub directory GET ${response.status}: ${detail}`)
  }
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload)) return null
  return payload
    .map(entry => entry as Partial<DashboardDirectoryEntry>)
    .filter((entry): entry is DashboardDirectoryEntry =>
      typeof entry.name === "string" &&
      typeof entry.path === "string" &&
      typeof entry.type === "string",
    )
}

function normalizeBranch(value: string, label: string): string {
  const branch = value.trim()
  if (
    !branch ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.includes("//") ||
    branch.includes("..") ||
    branch.includes("@{") ||
    branch.endsWith(".lock") ||
    !/^[A-Za-z0-9._/-]+$/.test(branch)
  ) {
    throw new Error(`${label} must be a safe git branch name`)
  }
  return branch
}

function encodePathSegments(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/")
}

async function githubJson<T>(
  endpoint: string,
  token: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}${endpoint}`, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`GitHub API ${options?.method ?? "GET"} ${endpoint} failed ${response.status}: ${detail}`)
  }
  return response.json() as Promise<T>
}
