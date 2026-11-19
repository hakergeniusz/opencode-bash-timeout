/**
 * opencode-bash-timeout — native OpenCode V2 plugin.
 *
 * Port of the pi extension `pi-bash-timeout`. The pi original hooked
 * `tool_call`, mutated `event.input.timeout`, and returned
 * `{ block: true, reason }` for over-cap calls.
 *
 * OpenCode V2 mapping:
 * - `pi.on("tool_call")` -> `ctx.tool.hook("execute.before", ...)`
 * - `event.input` mutation -> mutate the hook's mutable `input` (ms, not seconds)
 * - `{ block: true, reason }` -> throw an Error; the SDK converts a rejected
 *   `execute.before` into a model-visible Tool.Error (see @opencode/plugin
 *   promise adapter: "Only execute.before may reject a call").
 *
 * Results are left untouched, matching the original: annotating every
 * successful call would burn input tokens on the hot path, and the tool's own
 * timeout message already explains what happened when it matters.
 */

import { Plugin } from "@opencode/plugin"
import { decideTimeout, readOptions } from "./logic"

export default Plugin.define({
  id: "opencode-bash-timeout",
  async setup(ctx) {
    const options = readOptions(ctx.options)

    const registration = await ctx.tool.hook("execute.before", (event) => {
      if (!options.toolNames.includes(event.tool)) return

      const input = event.input as { command?: unknown; timeout?: unknown }
      const decision = decideTimeout(input, options)

      if (decision.kind === "pass") return
      if (decision.kind === "inject") {
        input.timeout = decision.timeoutMs
        return
      }

      // Rejecting execute.before fails only this call and surfaces `reason`
      // to the model as a tool error — the V2 equivalent of pi's block.
      throw new Error(decision.reason)
    })

    return () => {
      void registration.dispose()
    }
  },
})
