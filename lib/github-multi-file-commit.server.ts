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

export interface MultiFileCommitWrite {
  relpath: string
  content: string
}

export interface MultiFileCommitResult {
  mode: "github" | "local"
  commit_sha: string | null
  files: string[]
}

export async function commitDashboardFiles({
  files,
  message,
  branch = DEFAULT_BRANCH,
}: {
  files: MultiFileCommitWrite[]
  message: string
  branch?: string
}): Promise<MultiFileCommitResult> {
  if (files.length === 0) {
    return { mode: "local", commit_sha: null, files: [] }
  }
  const token = process.env.GITHUB_TOKEN
  return token
    ? commitGithubFiles({ files, message, branch, token })
    : writeLocalFiles(files)
}

export async function readDashboardFileText(relpath: string): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN
  if (token) return readGithubFileText(relpath, token)
  try {
    return await fs.readFile(resolveRepoPath(relpath), "utf-8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null
    throw err
  }
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
  return { mode: "local", commit_sha: null, files: files.map(file => file.relpath) }
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
    `/git/ref/heads/${encodeURIComponent(branch)}`,
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
    `/git/refs/heads/${encodeURIComponent(branch)}`,
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
  }
}

async function readGithubFileText(relpath: string, token: string): Promise<string | null> {
  const response = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${relpath}?ref=${DEFAULT_BRANCH}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.raw",
    },
    cache: "no-store",
  })
  if (response.status === 404) return null
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`GitHub raw GET ${response.status}: ${detail}`)
  }
  return response.text()
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
