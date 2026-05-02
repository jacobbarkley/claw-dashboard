// Thin Upstash Redis REST helper for Research Lab live state.
//
// Existing job status routes already use UPSTASH_REDIS_REST_URL/TOKEN.
// Talon draft jobs reuse the same managed store so live UI state is fast,
// while terminal audit artifacts still persist to GitHub.

export interface LiveStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  setNx(key: string, value: string, ttlSeconds?: number): Promise<boolean>
  del(key: string): Promise<void>
  sadd(key: string, member: string): Promise<void>
  expire(key: string, seconds: number): Promise<void>
}

export function getResearchLabLiveStore(): LiveStore | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return {
    get: key => upstashCommand(url, token, ["GET", key]).then(value =>
      typeof value === "string" ? value : null,
    ),
    set: (key, value) => upstashCommand(url, token, ["SET", key, value]).then(() => undefined),
    setNx: async (key, value, ttlSeconds) => {
      const command = ttlSeconds
        ? ["SET", key, value, "EX", ttlSeconds, "NX"]
        : ["SET", key, value, "NX"]
      const result = await upstashCommand(url, token, command)
      return result === "OK"
    },
    del: key => upstashCommand(url, token, ["DEL", key]).then(() => undefined),
    sadd: (key, member) => upstashCommand(url, token, ["SADD", key, member]).then(() => undefined),
    expire: (key, seconds) => upstashCommand(url, token, ["EXPIRE", key, seconds]).then(() => undefined),
  }
}

async function upstashCommand(
  url: string,
  token: string,
  command: unknown[],
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`Upstash ${command[0]} ${response.status}`)
  }
  const payload = (await response.json()) as { result: unknown; error?: string }
  if (payload.error) {
    throw new Error(`Upstash ${command[0]} error: ${payload.error}`)
  }
  return payload.result
}
