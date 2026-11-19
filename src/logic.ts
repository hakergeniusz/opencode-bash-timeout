/**
 * Pure timeout decision logic — no SDK imports so it can be unit-tested on its
 * own (ported from the pi extension `pi-bash-timeout`).
 *
 * OpenCode's `shell` tool takes its timeout in **milliseconds** (the pi
 * original used seconds), so the 60s default and 30-minute cap are expressed
 * here as 60_000 ms and 1_800_000 ms respectively.
 */

/** Applied when the model does not ask for a specific timeout. */
export const DEFAULT_TIMEOUT_MS = 60_000

/** Hard ceiling for any single foreground command: 30 minutes. */
export const MAX_TIMEOUT_MS = 30 * 60_000

export interface TimeoutOptions {
  /** Timeout injected when the call has no usable timeout. */
  defaultTimeoutMs: number
  /** Hard ceiling; requests above this are blocked, not clamped. */
  maxTimeoutMs: number
  /** Tool names to enforce. OpenCode's built-in is `shell`; `bash` is kept for compatibility. */
  toolNames: readonly string[]
}

export const DEFAULT_OPTIONS: TimeoutOptions = {
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  maxTimeoutMs: MAX_TIMEOUT_MS,
  toolNames: ["shell", "bash"],
}

export type TimeoutDecision =
  | { kind: "pass" }
  | { kind: "inject"; timeoutMs: number }
  | { kind: "block"; reason: string }

/** Read plugin options from `ctx.options`, falling back to safe defaults. */
export function readOptions(raw: unknown): TimeoutOptions {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>

  const defaultTimeoutMs = positiveNumber(source.defaultTimeoutMs, DEFAULT_OPTIONS.defaultTimeoutMs)
  const maxTimeoutMs = Math.max(
    positiveNumber(source.maxTimeoutMs, DEFAULT_OPTIONS.maxTimeoutMs),
    defaultTimeoutMs,
  )

  const names = source.toolNames
  const toolNames = Array.isArray(names)
    ? names.filter((name): name is string => typeof name === "string" && name.length > 0)
    : DEFAULT_OPTIONS.toolNames

  return { defaultTimeoutMs, maxTimeoutMs, toolNames }
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * Decide what to do with a shell tool call:
 * - valid timeout within the cap -> pass through untouched
 * - missing / nonsense timeout   -> inject the default
 * - timeout above the cap        -> block with guidance (never silently clamp)
 */
export function decideTimeout(
  input: { command?: unknown; timeout?: unknown },
  options: TimeoutOptions = DEFAULT_OPTIONS,
): TimeoutDecision {
  const requested = input.timeout

  if (typeof requested === "number" && Number.isFinite(requested) && requested > 0) {
    if (requested <= options.maxTimeoutMs) return { kind: "pass" }
    return { kind: "block", reason: buildBlockReason(requested, options, input.command) }
  }

  return { kind: "inject", timeoutMs: options.defaultTimeoutMs }
}

function buildBlockReason(requestedMs: number, options: TimeoutOptions, command: unknown): string {
  const truncated = truncate(typeof command === "string" ? command : undefined)
  return (
    `bash-timeout: ${requestedMs}ms exceeds the ${options.maxTimeoutMs}ms (30 min) cap ` +
    `for foreground shell commands. ` +
    `Run long jobs in the background instead, e.g. ` +
    `\`nohup ${truncated} > /tmp/job.log 2>&1 &\`, ` +
    `then poll with \`sleep 30 && tail -n 40 /tmp/job.log\`. ` +
    `Re-run in the foreground only if it finishes inside 30 minutes.`
  )
}

/** Collapse whitespace, trim, and cap the length with an ellipsis. */
export function truncate(command: string | undefined, max = 120): string {
  const collapsed = (command ?? "<command>").replace(/\s+/g, " ").trim()
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed
}
