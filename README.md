# opencode-bash-timeout

Native **OpenCode V2** plugin that guarantees every foreground shell command is
bounded. Port of the pi extension
[`pi-bash-timeout`](https://github.com/hakergeniusz/pi-bash-timeout): a hangy
command should never burn a turn and pin the session, so the timeout is made
non-optional without changing the tool itself.

| Situation | What happens |
| --- | --- |
| No timeout given | 60 s (60 000 ms) is injected into the tool input |
| Invalid timeout (`0`, negative, `NaN`, `Infinity`, string) | 60 s is injected |
| Valid timeout within the cap | Passed through untouched |
| Timeout over 30 minutes | Call is **blocked** with guidance to background the job |

The 30-minute cap is a hard block, not a silent clamp, so the model is never
left believing it got an hour when it got 30 minutes. The block message
suggests the `nohup … &` + polling pattern so long jobs keep working. Results
are deliberately left untouched: annotating every successful call would cost
fresh input tokens on the hot path, and the tool's own timeout message already
explains what applied when it matters.

## How it maps from the pi original

| pi concept | OpenCode V2 equivalent used here |
| --- | --- |
| `pi.on("tool_call")` on tool `bash` | `ctx.tool.hook("execute.before")` on tools `shell` / `bash` |
| Mutating `event.input.timeout` | Mutating the hook's mutable `event.input` (in **milliseconds**) |
| Returning `{ block: true, reason }` | Throwing an `Error(reason)` — the SDK turns a rejected `execute.before` into a model-visible `Tool.Error` |
| Extension entry point | `Plugin.define({ id, setup })` from `@opencode/plugin` |

Two intentional adaptations to the host:

- OpenCode's built-in tool is named **`shell`** (not `bash`) and its `timeout`
  is in **milliseconds**. The original 60 s default and 30-minute cap are
  therefore 60 000 ms and 1 800 000 ms here. Both `shell` and `bash` are
  watched by default.
- Blocking uses hook rejection instead of a `{ block }` return value; this is
  the documented OpenCode V2 mechanism ("Only `execute.before` may reject a
  call").

## Install / load

Place the package where OpenCode can load it and add it to `opencode.json(c)`:

```jsonc
{
  "plugins": ["opencode-bash-timeout"]
}
```

Local directory form:

```jsonc
{
  "plugins": ["./plugins/opencode-bash-timeout"]
}
```

## Options

Pass options with the object form of `plugins` (read from `ctx.options`):

```jsonc
{
  "plugins": [
    {
      "package": "opencode-bash-timeout",
      "options": {
        "defaultTimeoutMs": 60000,
        "maxTimeoutMs": 1800000,
        "toolNames": ["shell", "bash"]
      }
    }
  ]
}
```

- `defaultTimeoutMs` — timeout injected for missing/invalid calls (default `60000`).
- `maxTimeoutMs` — hard cap; higher requests are blocked (default `1800000`).
- `toolNames` — tool names to enforce (default `["shell", "bash"]`).

Invalid numeric options fall back to the defaults, and the cap is never
allowed below the default.

## Known gaps

- **Background commands:** OpenCode's shell tool can run commands in the
  background with no timeout. This plugin only touches the tool-call input for
  foreground `shell`/`bash` calls, matching the pi original; it does not add a
  timeout to background jobs. (It also does not use `ctx.shell.hook`, whose
  event has no background flag and would otherwise impose the default on long
  background runs.)
- **Other shell execution paths:** commands started by code other than the
  `shell`/`bash` tool call are not intercepted.
- **No result annotations:** successful tool results are not modified, same as
  the original.

## Development

```bash
bun install
bun test
bun run typecheck
```

## License

[MIT](LICENSE) — 2026 hakergeniusz
