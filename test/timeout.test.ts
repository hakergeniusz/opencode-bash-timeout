import { describe, expect, it } from "bun:test"
import {
  DEFAULT_OPTIONS,
  decideTimeout,
  readOptions,
  truncate,
  type TimeoutDecision,
} from "../src/logic"

function decide(input: Record<string, unknown>): TimeoutDecision {
  return decideTimeout(input, DEFAULT_OPTIONS)
}

function reasonOf(decision: TimeoutDecision): string {
  if (decision.kind !== "block") throw new Error("expected a block decision")
  return decision.reason
}

describe("opencode-bash-timeout decision", () => {
  it("injects the 60s default when no timeout is given", () => {
    const decision = decide({ command: "make build" })
    expect(decision).toEqual({ kind: "inject", timeoutMs: 60_000 })
  })

  it("replaces invalid timeouts (0, negative, NaN, Infinity, string) with 60s", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "90"]) {
      expect(decide({ command: "ls", timeout: bad })).toEqual({ kind: "inject", timeoutMs: 60_000 })
    }
  })

  it("passes a valid timeout through untouched", () => {
    expect(decide({ command: "ls", timeout: 300_000 })).toEqual({ kind: "pass" })
  })

  it("accepts exactly the 30-minute cap", () => {
    expect(decide({ command: "ls", timeout: 30 * 60_000 })).toEqual({ kind: "pass" })
  })

  it("blocks a timeout over the cap (never silently clamps)", () => {
    const decision = decide({ command: "make train", timeout: 30 * 60_000 + 1 })
    expect(decision.kind).toBe("block")
  })

  it("block reason suggests backgrounding and includes the command", () => {
    const reason = reasonOf(decide({ command: "python train.py", timeout: 7_200_000 }))
    expect(reason).toContain("nohup python train.py > /tmp/job.log 2>&1 &")
    expect(reason).toContain("tail -n 40 /tmp/job.log")
    expect(reason).toContain("1800000ms (30 min) cap")
  })

  it("collapses whitespace and truncates long commands in the reason", () => {
    const long = `echo    ${"a".repeat(300)}`
    const reason = reasonOf(decide({ command: long, timeout: 9_999_999 }))
    expect(reason).toContain("echo a")
    expect(reason).toContain("…")
    expect(reason).not.toContain("a".repeat(200))
  })

  it("falls back to <command> when the blocked call has no command", () => {
    expect(reasonOf(decide({ timeout: 9_999_999 }))).toContain("nohup <command>")
  })

  it("truncate caps at 120 characters with an ellipsis", () => {
    const result = truncate("x".repeat(300))
    expect(result).toHaveLength(120)
    expect(result.endsWith("…")).toBe(true)
  })
})

describe("readOptions", () => {
  it("uses safe defaults for absent or nonsense options", () => {
    expect(readOptions(undefined)).toEqual(DEFAULT_OPTIONS)
    expect(readOptions({ defaultTimeoutMs: -1, maxTimeoutMs: NaN, toolNames: "shell" })).toEqual(
      DEFAULT_OPTIONS,
    )
  })

  it("accepts custom timeouts and tool names", () => {
    const options = readOptions({
      defaultTimeoutMs: 30_000,
      maxTimeoutMs: 600_000,
      toolNames: ["my-shell", "", 7],
    })
    expect(options).toEqual({
      defaultTimeoutMs: 30_000,
      maxTimeoutMs: 600_000,
      toolNames: ["my-shell"],
    })
  })

  it("never lets the cap fall below the default", () => {
    expect(readOptions({ defaultTimeoutMs: 5_000, maxTimeoutMs: 1_000 }).maxTimeoutMs).toBe(5_000)
  })
})
