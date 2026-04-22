import { randomUUID } from "crypto"
import { execFile } from "child_process"
import { promises as fs } from "fs"
import { existsSync } from "fs"
import path from "path"
import { promisify } from "util"

import { NextRequest, NextResponse } from "next/server"

import { loadCampaignById } from "@/lib/vires-campaigns.server"
import type { CampaignManifest } from "@/lib/vires-campaigns"

const GITHUB_REPO = "jacobbarkley/claw-dashboard"
const GITHUB_API = "https://api.github.com"
const LOCAL_REQUEST_DIR = path.join(process.cwd(), "data", "bench", "runtime", "passport_workflow_requests")
const execFileAsync = promisify(execFile)
const DEFAULT_WSL_DISTRO = process.env.OPENCLAW_WSL_DISTRO ?? "Ubuntu-24.04"
const DEFAULT_TRADING_BOT_LINUX_ROOT =
  process.env.OPENCLAW_TRADING_BOT_ROOT_LINUX ?? "/home/jacobbarkley/.openclaw/workspace/trading-bot"
const DEFAULT_WSL_REPO_MARKER = `\\\\wsl.localhost\\${DEFAULT_WSL_DISTRO}${DEFAULT_TRADING_BOT_LINUX_ROOT.replaceAll("/", "\\")}`

type WorkflowAction = "CONFIRM_PROMOTION" | "CONFIRM_DEMOTION"

interface PassportWorkflowRequest {
  schema_version: "passport_workflow_request.v1"
  request_id: string
  created_at: string
  status: "PENDING"
  action: WorkflowAction
  actor: string
  note: string | null
  source_surface: "BENCH_CAMPAIGN" | "PASSPORT"
  campaign_id: string | null
  origin_candidate_id: string | null
  passport_role_id: string | null
  target_action: string | null
  supersedes_record_id: string | null
  record_id: string | null
  readiness_as_of: string | null
}

async function persistLocalRequest(request: PassportWorkflowRequest) {
  await fs.mkdir(LOCAL_REQUEST_DIR, { recursive: true })
  const filename = `${request.created_at.replace(/[:.]/g, "-")}-${request.request_id}.json`
  const absolutePath = path.join(LOCAL_REQUEST_DIR, filename)
  await fs.writeFile(absolutePath, JSON.stringify(request, null, 2))
  return {
    mode: "local" as const,
    file: path.relative(process.cwd(), absolutePath).replaceAll("\\", "/"),
  }
}

async function persistGithubRequest(request: PassportWorkflowRequest, token: string) {
  const filename = `data/bench/runtime/passport_workflow_requests/${request.created_at.replace(/[:.]/g, "-")}-${request.request_id}.json`
  const content = Buffer.from(JSON.stringify(request, null, 2)).toString("base64")
  const response = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${filename}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      message: `passport workflow: ${request.action.toLowerCase().replaceAll("_", "-")} ${request.request_id}`,
      content,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`GitHub API ${response.status}: ${detail}`)
  }

  return {
    mode: "github" as const,
    file: filename,
  }
}

function resolveWorkflowMode(): "direct" | "request" {
  if (process.env.PASSPORT_WORKFLOW_EXECUTION === "request") return "request"
  if (process.platform !== "win32") return "request"
  return existsSync(DEFAULT_WSL_REPO_MARKER) ? "direct" : "request"
}

function promotionExecutionArgs(campaign: CampaignManifest) {
  const promotion = campaign.promotion_readiness
  if (!promotion?.origin_candidate_id || !promotion.passport_role_id) return null
  const candidate = campaign.candidates.find(item => item.candidate_id === promotion.origin_candidate_id)
  const campaignRunId = candidate?.latest_run?.run_id ?? null
  if (!campaignRunId) return null
  return {
    campaignId: campaign.campaign_id,
    campaignRunId,
    variantId: promotion.origin_candidate_id,
    passportRoleId: promotion.passport_role_id,
    targetAction: promotion.target_action ?? "CREATE_NEW",
    supersedesRecordId: promotion.supersedes_record_id ?? null,
    originCandidateId: promotion.origin_candidate_id,
  }
}

async function executeStrategyBankDirect(args: string[]) {
  const { stdout } = await execFileAsync(
    "wsl.exe",
    ["-d", DEFAULT_WSL_DISTRO, "--cd", DEFAULT_TRADING_BOT_LINUX_ROOT, "python3", "-m", "openclaw_core.cli.strategy_bank", ...args],
    {
      timeout: 30000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  )
  const trimmed = stdout.trim()
  return trimmed ? JSON.parse(trimmed) : null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const action = body?.action as WorkflowAction | undefined
    const actor = typeof body?.actor === "string" && body.actor.trim() ? body.actor.trim() : "operator"
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null
    const createdAt = new Date().toISOString()

    if (action !== "CONFIRM_PROMOTION" && action !== "CONFIRM_DEMOTION") {
      return NextResponse.json({ error: "Unsupported workflow action" }, { status: 400 })
    }

    if (action === "CONFIRM_PROMOTION") {
      const campaignId = typeof body?.campaign_id === "string" ? body.campaign_id : null
      if (!campaignId) {
        return NextResponse.json({ error: "campaign_id required" }, { status: 400 })
      }

      const campaign = await loadCampaignById(campaignId)
      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
      }

      const promotion = campaign.promotion_readiness ?? null
      const readiness = promotion?.readiness ?? null
      if (!promotion || !readiness) {
        return NextResponse.json({ error: "Campaign has no readiness scorecard yet" }, { status: 409 })
      }
      if (readiness.overall_status !== "READY_TO_NOMINATE") {
        return NextResponse.json(
          {
            error: "Campaign is not promotion-ready",
            blockers: readiness.blockers ?? [],
          },
          { status: 409 },
        )
      }
      if (!promotion.origin_candidate_id || !promotion.passport_role_id) {
        return NextResponse.json({ error: "Promotion linkage is incomplete on this campaign" }, { status: 409 })
      }

      const workflowRequest: PassportWorkflowRequest = {
        schema_version: "passport_workflow_request.v1",
        request_id: randomUUID(),
        created_at: createdAt,
        status: "PENDING",
        action,
        actor,
        note,
        source_surface: "BENCH_CAMPAIGN",
        campaign_id: campaign.campaign_id,
        origin_candidate_id: promotion.origin_candidate_id,
        passport_role_id: promotion.passport_role_id,
        target_action: promotion.target_action ?? null,
        supersedes_record_id: promotion.supersedes_record_id ?? null,
        record_id: null,
        readiness_as_of: readiness.as_of ?? null,
      }

      const execution = promotionExecutionArgs(campaign)
      if (resolveWorkflowMode() === "direct" && execution) {
        const directResult = await executeStrategyBankDirect([
          "confirm-promotion",
          "--campaign-id",
          execution.campaignId,
          "--campaign-run-id",
          execution.campaignRunId,
          "--variant-id",
          execution.variantId,
          "--passport-role-id",
          execution.passportRoleId,
          "--target-action",
          execution.targetAction,
          ...(execution.supersedesRecordId ? ["--supersedes-record-id", execution.supersedesRecordId] : []),
          ...(execution.originCandidateId ? ["--origin-candidate-id", execution.originCandidateId] : []),
          "--actor",
          actor,
          ...(note ? ["--note", note] : []),
        ])
        return NextResponse.json({
          ok: true,
          mode: "direct",
          request: workflowRequest,
          result: directResult,
        })
      }

      const token = process.env.GITHUB_TOKEN
      const persisted = token
        ? await persistGithubRequest(workflowRequest, token)
        : await persistLocalRequest(workflowRequest)

      return NextResponse.json({
        ok: true,
        request: workflowRequest,
        ...persisted,
      })
    }

    const recordId = typeof body?.record_id === "string" ? body.record_id : null
    const campaignId = typeof body?.campaign_id === "string" ? body.campaign_id : null
    const passportRoleId = typeof body?.passport_role_id === "string" ? body.passport_role_id : null
    const reopenStatus = typeof body?.reopen_status === "string" ? body.reopen_status : null
    if (!recordId) {
      return NextResponse.json({ error: "record_id required" }, { status: 400 })
    }

    const workflowRequest: PassportWorkflowRequest = {
      schema_version: "passport_workflow_request.v1",
      request_id: randomUUID(),
      created_at: createdAt,
      status: "PENDING",
      action,
      actor,
      note,
      source_surface: "PASSPORT",
      campaign_id: campaignId,
      origin_candidate_id: null,
      passport_role_id: passportRoleId,
      target_action: null,
      supersedes_record_id: null,
      record_id: recordId,
      readiness_as_of: null,
    }

    if (resolveWorkflowMode() === "direct") {
      const directResult = await executeStrategyBankDirect([
        "confirm-demotion",
        "--record-id",
        recordId,
        ...(campaignId ? ["--campaign-id", campaignId] : []),
        ...(reopenStatus ? ["--reopen-status", reopenStatus] : []),
        "--actor",
        actor,
        ...(note ? ["--note", note] : []),
      ])
      return NextResponse.json({
        ok: true,
        mode: "direct",
        request: workflowRequest,
        result: directResult,
      })
    }

    const token = process.env.GITHUB_TOKEN
    const persisted = token
      ? await persistGithubRequest(workflowRequest, token)
      : await persistLocalRequest(workflowRequest)

    return NextResponse.json({
      ok: true,
      request: workflowRequest,
      ...persisted,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal error",
      },
      { status: 500 },
    )
  }
}
