---
name: pi-skill
description: This skill should be used when the user asks about the "pi" coding agent / "pi coding harness" by Earendil Works (earendil-works/pi), "pi extensions", "create pi extension", "@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "@earendil-works/pi-agent-core", "@earendil-works/pi-tui", "pi packages", "pi skills", "pi prompt templates", "pi themes", "register tool in pi", "pi custom tool/provider/model", "pi event handlers", "pi RPC/JSON mode", "pi SDK", "pi session/compaction", or building extensions, custom tools, event handlers, UI components, or LLM integration for the pi ecosystem.
version: 0.2.0
---

# Pi Ecosystem Reference

Pi is a **minimal terminal coding harness** by Earendil Works. The core stays lightweight; everything else is added through TypeScript **extensions**, **skills**, **prompt templates**, **themes**, and distributable **pi packages**.

- **Repo:** `earendil-works/pi` (monorepo, root package `pi-monorepo`; packages versioned in lockstep, e.g. `0.79.x`)
- **Docs:** https://pi.dev/docs/latest
- **Install:** `npm install -g --ignore-scripts @earendil-works/pi-coding-agent` (binary: `pi`), or `curl -fsSL https://pi.dev/install.sh | sh`
- **License:** MIT

> ⚠️ **Renamed from the old `@mariozechner/pi-*` toolkit.** All packages now live under the `@earendil-works/*` scope, `pi-agent` is now `pi-agent-core`, and the old `web-ui`, `mom`, and `pods` packages no longer exist. Several APIs changed — notably the tool `execute(...)` parameter order and the event catalog. Always import from `@earendil-works/*`.

## Packages

| Package | npm name | Purpose | bin |
|---------|----------|---------|-----|
| **coding-agent** | `@earendil-works/pi-coding-agent` | Interactive coding agent CLI + extension system + SDK | `pi` |
| **ai** | `@earendil-works/pi-ai` | Unified multi-provider LLM API (Anthropic, OpenAI, Google, Mistral, Bedrock, …) | `pi-ai` |
| **agent** | `@earendil-works/pi-agent-core` | General-purpose agent runtime: transport abstraction, state management, attachments | — |
| **tui** | `@earendil-works/pi-tui` | Terminal UI library with differential rendering | — |

```
        ┌──────┐
        │  ai  │  ← foundation (LLM API, model/message/stream types)
        └──────┘
           ↑
  ┌────────┴─────────┐
  │  agent-core (ai) │  ← agent loop / state
  └────────┬─────────┘
           ↑
  coding-agent (ai, agent-core, tui)  ← CLI, extensions, sessions, SDK
```

Type schemas use **TypeBox**. `Type`, `Static`, and `TSchema` are re-exported from `@earendil-works/pi-ai` (docs examples also import `Type` directly from `typebox`).

## Core Philosophy

Keep the core minimal; build everything else as an extension, skill, or package. Capabilities other agents bake in are deliberately left out and provided as opt-in patterns/examples instead (e.g. plan mode, sub-agents, sandboxing, custom providers all ship as **example extensions**, not core features). This keeps the base agent small and auditable.

## Configuration & Resource Locations

| Path | Scope |
|------|-------|
| `~/.pi/agent/` | Global config root (`settings.json`, `auth.json`, `trust.json`, `keybindings.json`, `models.json`, `sessions/`) |
| `~/.pi/agent/extensions/`, `~/.pi/agent/skills/`, `~/.pi/agent/prompts/`, `~/.pi/agent/themes/` | Global resources |
| `~/.pi/agent/AGENTS.md`, `~/.pi/agent/SYSTEM.md` | Global instructions / system prompt |
| `.pi/` (project) | `settings.json`, `extensions/`, `skills/`, `prompts/`, `themes/`, `SYSTEM.md`, `APPEND_SYSTEM.md` (**trust-gated**) |
| `AGENTS.md` or `CLAUDE.md` (project, searched up the tree) | Project context files |
| `~/.agents/skills/`, project `.agents/skills/` | Cross-harness skill discovery |

Project resources under `.pi/` and `.agents/skills/` require **trust** (`~/.pi/agent/trust.json`; default `defaultProjectTrust: "ask"`). Trust gates *loading* of repo-provided code — it does **not** stop prompt injection from file contents. `--approve`/`-a` and `--no-approve`/`-na` set trust for a single run. Pi has **no built-in sandbox**; for untrusted code use containerization (see `references/customization.md`).

## Quick Reference: Creating Extensions

Extensions are TypeScript modules auto-discovered from `~/.pi/agent/extensions/*.ts` (or `*/index.ts`) and project `.pi/extensions/`. Test ad-hoc with `pi -e ./my-extension.ts`; hot-reload discovered extensions with `/reload`.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";                  // or: from "@earendil-works/pi-ai"
import { StringEnum } from "@earendil-works/pi-ai";

export default function (pi: ExtensionAPI) {
  // Register a custom tool the LLM can call
  pi.registerTool({
    name: "my_tool",
    label: "My Tool",
    description: "What this tool does",
    parameters: Type.Object({
      action: StringEnum(["list", "add"] as const),  // StringEnum, not Type.Union (Google compat)
      text: Type.Optional(Type.String({ description: "Input text" })),
    }),
    // NOTE new parameter order: (toolCallId, params, signal, onUpdate, ctx)
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: "Working…" }], details: {} });
      if (signal?.aborted) return { content: [{ type: "text", text: "Aborted" }] };
      return {
        content: [{ type: "text", text: `Result: ${params.text ?? ""}` }],  // sent to LLM
        details: { processed: true },                                       // for rendering + state
        // terminate: true,  // optional: stop the run after this tool batch
      };
    },
  });

  // Gate a built-in tool by subscribing to an event
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && /rm\s+-rf/.test(event.input.command ?? "")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });

  // Register a /command
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => ctx.ui.notify(`Hello ${args || "world"}!`, "info"),
  });
}
```

### Registration APIs

- `pi.registerTool(def)` — custom tool for the LLM (same name as a built-in → overrides it)
- `pi.registerCommand(name, opts)` — `/name` slash command (supports `getArgumentCompletions`)
- `pi.registerShortcut(key, opts)` — keyboard shortcut
- `pi.registerFlag(name, opts)` — CLI flag (read with `pi.getFlag`)
- `pi.registerProvider(name, config)` / `pi.unregisterProvider(name)` — custom LLM provider (OAuth supported)
- `pi.registerMessageRenderer(customType, fn)` — render custom message entries

### Message / state / model control

- `pi.sendMessage(msg, { deliverAs, triggerTurn })` — inject a custom message (`deliverAs`: `"steer" | "followUp" | "nextTurn"`)
- `pi.sendUserMessage(content, opts)` — send as the user (string or content blocks incl. images)
- `pi.appendEntry(type, data)` — persist state to the session outside the LLM context
- `pi.getActiveTools()` / `pi.setActiveTools(names)` / `pi.getAllTools()`
- `pi.setModel(model)`, `pi.getThinkingLevel()` / `pi.setThinkingLevel(level)`
- `pi.setSessionName(name)` / `pi.getSessionName()`, `pi.setLabel(entryId, label)`
- `pi.exec(cmd, args, { signal, timeout })`, `pi.events.on/emit(...)` for inter-extension comms

### Key Events (subscribe with `pi.on`)

| Event | When | Can return |
|-------|------|-----------|
| `project_trust` | Trust decision needed | `{ trusted, remember? }` |
| `session_start` | Load / new / resume / fork (`event.reason`) | – |
| `resources_discover` | Resource discovery | `{ skillPaths?, promptPaths?, themePaths? }` |
| `before_agent_start` | Before the agent loop | `{ message?, systemPrompt? }` |
| `turn_start` / `turn_end` | Per turn | – |
| `context` | Before each LLM call (deep-copied messages) | `{ messages }` (pruned) |
| `tool_call` | Before a tool runs | `{ block: true, reason }` |
| `tool_result` | After a tool runs | `{ content?, details?, isError? }` |
| `tool_execution_start/update/end` | Tool lifecycle | – |
| `message_start/update/end` | Assistant message lifecycle | `message_end` → `{ message? }` |
| `before_provider_request` / `after_provider_response` | Raw provider payload/headers | request → modified payload |
| `model_select` / `thinking_level_select` | Model / thinking change | – |
| `user_bash` | `!`/`!!` shell command | `{ operations }` or `{ result }` |
| `input` | Raw input (pre skill/template expansion) | `{ action: "continue" \| "transform" \| "handled", text? }` |
| `session_before_switch/fork/compact/tree` | Cancellable session transitions | `{ cancel? }` (+ extras) |

The full event catalog with payloads, the `ExtensionContext` (`ctx`) surface (`ctx.ui.*`, `ctx.sessionManager.*`, `ctx.modelRegistry`, `ctx.compact`, …), and `ExtensionCommandContext` (`ctx.newSession`, `ctx.fork`, `ctx.navigateTree`, …) are in **`references/extension-api.md`**.

## Important Patterns

### State persistence via tool `details`

Store state in the tool result's `details` so it survives reloads, forks, and branch navigation. Reconstruct on every session event:

```typescript
const reconstruct = (ctx) => {
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.role === "toolResult"
        && entry.message.toolName === "my_tool") {
      // rebuild from entry.message.details
    }
  }
};
pi.on("session_start", (_e, ctx) => reconstruct(ctx));
pi.on("session_switch", (_e, ctx) => reconstruct(ctx));
pi.on("session_fork",   (_e, ctx) => reconstruct(ctx));
pi.on("session_tree",   (_e, ctx) => reconstruct(ctx));
```

### StringEnum for Google compatibility

```typescript
import { StringEnum } from "@earendil-works/pi-ai";
action: StringEnum(["list", "add"] as const)          // ✅ works everywhere
// action: Type.Union([Type.Literal("list"), ...])    // ❌ breaks on Google
```

### Truncate tool output

Tools must cap output (default 50KB / 2000 lines) to avoid blowing the context window:

```typescript
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";
const t = truncateHead(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
```

## The Broader Ecosystem

Beyond extensions, pi is customized and embedded through:

- **Skills** — `SKILL.md` capability packages (Agent Skills standard); invoked via `/skill:name`. → `references/customization.md`
- **Prompt templates** — `.md` files in `prompts/` become `/command` slash commands with `$1`/`$@`/`$ARGUMENTS` placeholders. → `references/customization.md`
- **Themes** — JSON files defining 51 color tokens; hot-reload on edit. → `references/customization.md`
- **Pi packages** — bundle extensions/skills/prompts/themes for npm/git distribution; managed with `pi install`/`pi remove`/`pi update`/`pi list`. → `references/customization.md`
- **Custom models** — `~/.pi/agent/models.json` adds providers/models (incl. OpenAI-compatible/local). → `references/customization.md`
- **Custom providers** — `pi.registerProvider(...)` with OAuth and custom streaming. → `references/customization.md`
- **SDK** — embed an agent programmatically via `createAgentSession(...)`. → `references/sdk-and-modes.md`
- **RPC mode** (`--mode rpc`) and **JSON event stream** (`--mode json`) for process integration. → `references/sdk-and-modes.md`

## Reference Files

| File | Contents |
|------|----------|
| `references/coding-agent.md` | CLI flags, slash commands, modes, settings.json keys, sessions, compaction, security/trust, built-in tools, env vars, keybindings |
| `references/extension-api.md` | Full Extension API: every `register*` method, complete event catalog + payloads, `ExtensionContext` / `ExtensionCommandContext`, rendering, helpers |
| `references/extension-guide.md` | Extension cookbook: 10+ ready-to-adapt patterns and directory/dependency layouts |
| `references/ai-package.md` | `@earendil-works/pi-ai`: providers, models, streaming, tools, thinking, OAuth |
| `references/agent-package.md` | `@earendil-works/pi-agent-core`: agent runtime and how it relates to the SDK |
| `references/tui-package.md` | `@earendil-works/pi-tui`: components, `Key`/`matchesKey`, width utils, differential rendering |
| `references/sdk-and-modes.md` | SDK (`createAgentSession`), RPC mode, JSON event stream, session file format |
| `references/customization.md` | Skills, prompt templates, themes, pi packages, custom models, custom providers, containerization |

## Example Extensions

In `packages/coding-agent/examples/extensions/`:

| Example | Purpose |
|---------|---------|
| `plan-mode/` | Full plan-mode implementation |
| `subagent/` | Spawn and coordinate sub-agents |
| `sandbox/` | Run tools inside a sandbox |
| `gondolin/` | Micro-VM isolation (QEMU; requires Node ≥ 23.6) |
| `custom-provider-anthropic/` | Register a custom Anthropic-compatible provider |
| `custom-provider-gitlab-duo/` | Custom provider with OAuth |
| `dynamic-resources/` | `resources_discover` to add skills/prompts/themes at runtime |
| `with-deps/` | Extension with its own npm dependencies |
| `doom-overlay/` | DOOM in a TUI overlay |

## Development Commands

```bash
npm install --ignore-scripts   # install deps
npm run build                  # build tui → ai → agent → coding-agent
npm run check                  # biome + type checks + import/dep checks
npm test                       # run tests (./test.sh runs the no-API-key subset)
./pi-test.sh                   # run pi from source
```

For forking/rebranding, configure via the `piConfig` object in `package.json` (`name`, `configDir`) and reference assets through `src/config.ts` (not `__dirname`). `/debug` writes logs to `~/.pi/agent/pi-debug.log`.
