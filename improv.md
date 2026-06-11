# Sapio-App — Project Review & Improvement Suggestions

*Review date: 2026-06-10. Scope: full repo (~44k lines TS across 136 source files, plus the Tauri Rust backend). Findings were gathered by parallel reviews across five dimensions — security/privacy, architecture, code quality, testing/DX, and build/backend — and the highest-impact claims were verified directly in the code.*

## Implementation Status (2026-06-10)

**Implemented and tested** (type-check clean, 1,780 tests green, lint green, production build + `cargo check` pass):
1.1 CSP · 1.2 HTTP scope (dropped `http://**`; `https://**` kept — the fetch polyfill routes all provider calls incl. custom baseUrls through it) · 1.3 request-body logging gated behind the debug setting · 1.5 shell tightening (interpreter `-c`/`-e` blocklist + per-segment allowlist matching with command-substitution rejection) · 1.6 clipboard risk bump + notification prefix/cap · 2.3 folder-UI + tree-traversal dedup · 3.1 adapter unsubscribe · 3.2 scheduler tick guards · 3.4 memory-file catch logging · 4.1 TS2556 fix · 4.2 CI workflow · 4.3 Biome (linter-only; a11y group + a few opinionated rules deferred as warnings) · 4.4 root test script + turbo tasks · 4.6 doc drift · 5.1 pi-coding-agent pinned to ^0.51.4 · 5.2 async fs commands · 5.3 dep alignment (`@tauri-apps/api` ^2.9.0, `@types/uuid` removed) · 5.4 all four items (sandbox param removed from both sides, release logging at Warn, sidecar triple guard, node-stub runtime warnings + docs).

**Deferred** (deliberately — larger refactors or product decisions):
1.4 filesystem deny-by-default (changes agent UX; needs a working-directory policy decision) · 2.1/2.2 chat-store split + store cycle break · 2.4 storage.ts split · 2.5 agent-selection persistence · 2.6 task-store execution-state consolidation · 3.3 per-conversation pendingToolCalls · 3.5 web-fallback abort handling · 4.5 route/Rust/component test coverage · log rotation & key-age warnings.

---

## 1. Security & Privacy

These matter most given the project's stated principle of "Privacy by Default". The first three are verified in the code.

### 1.1 Content Security Policy is disabled — HIGH
`apps/web/src-tauri/tauri.conf.json:25` sets `"csp": null`, which turns off all CSP protection in the webview. Since the app renders LLM output (markdown, potentially HTML), an injection in rendered content has free rein.

**Fix:** Set a restrictive CSP and loosen only as needed:
```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' http://localhost:* http://127.0.0.1:*"
```

### 1.2 HTTP capability allows any URL on the internet — HIGH
`apps/web/src-tauri/capabilities/default.json:17-18` includes `"https://**"` and `"http://**"`. Combined with the agent's web tools this enables exfiltration to arbitrary servers and requests against intranet hosts (the plain-`http://**` pattern is the worst part).

**Fix:** Allowlist the actual provider endpoints (Anthropic, OpenAI, OpenRouter, local Ollama/LM Studio ports, search endpoints). If general web fetch is a deliberate agent feature, gate non-allowlisted hosts through the guardrails confirmation flow instead of granting blanket capability.

### 1.3 Raw API request bodies are logged to a plaintext file — HIGH
`apps/web/src/lib/http.ts:32-36` writes every POST body to `~/.sapio/logs/api_request.txt`, unconditionally. That file accumulates full conversation content (prompts, memory files, context files) in plaintext on disk — directly against the privacy-by-default principle.

**Fix:** Gate this behind the existing `agentDebugLogging` setting (default off), redact obvious secrets, and add log rotation / max size. Better: log only method, URL, status, and payload size by default.

### 1.4 File-system access defaults to allow — MEDIUM
The Rust `read_file`/`write_file`/`delete_path` commands accept any path after tilde expansion (`apps/web/src-tauri/src/commands.rs:224-255`). Guardrails block `~/.ssh`, `~/.aws`, `/etc`, etc., but the default policy is `allow` (`guardrails/types.ts:91`), so anything not on the blocklist is readable — including `~/.zshrc`, browser profiles, `.env` files in arbitrary repos.

**Fix:** Flip filesystem policy to deny-by-default with the working directory (plus `~/.sapio`) allowlisted. Validate the working-directory setting itself — warn if the user sets it to `~` or `/`.

### 1.5 Shell allowlist patterns are bypassable — MEDIUM
`guardrails/types.ts:106-131` allowlists `python *`, `node *`, `find *`, `echo *`. These act as escape hatches: `python -c "..."` or `node -e "..."` can do anything the blocklist tries to prevent.

**Fix:** Narrow interpreter patterns to script execution (`python *.py`, no `-c`/`-e`), or treat interpreter invocations with inline-code flags as high-risk requiring confirmation. Also consider rejecting commands containing `|`, `;`, `&&` unless each segment passes the check.

### 1.6 Smaller items
- **Clipboard tools** (`lib/tools/system-tools.ts:174-193`): `clipboard_read` is "low" risk with no confirmation — it's a quiet exfiltration channel for whatever the user last copied (often passwords). Bump to medium and rate-limit.
- **Notifications** (`system-tools.ts:98`): agent-sent notifications can impersonate system alerts. Prefix titles with the app name and cap body length.
- **Debug logging scope** (`lib/logger.ts:42-58`): when enabled, full tool args are written to disk. Log tool name + outcome only, or warn the user explicitly when enabling.

**What's already good:** API keys live in the OS keychain (never localStorage), guardrails are on by default with confirmation + undo for destructive ops, log-file commands guard path traversal, rate limiting exists for shell/API calls, and the bundle identifier is properly set to `com.sapio.app`.

---

## 2. Architecture & State Management

### 2.1 Split the chat store (~1,350 lines)
`stores/chat-store.ts` mixes conversation CRUD, streaming (the `streamMessage` function alone is ~430 lines), folder-tree management, ghost mode, tool-call coordination, and model/agent selection. It's 3× the size of the next-largest store and is the choke point for every other refactor.

**Fix:** Split into a conversation store, a folder/tree UI store, and a streaming module. Extract `streamMessage` into a `lib/` function that takes the store API as a parameter — that alone makes the loop testable.

### 2.2 Break the store dependency cycle
`chat-store` and `agentic-loop-store` import each other (`chat-store.ts:20` ↔ `agentic-loop-store.ts:13`), and `scheduler-store`/`task-store` reach into both. Direct `useXStore.getState().method()` calls across stores make the data flow hard to trace and the stores impossible to test in isolation.

**Fix:** Make the flow one-directional: the agentic loop emits events; chat/task/scheduler subscribe via `store.subscribe()` or a small event bus. Start with the bidirectional chat↔agentic-loop pair.

### 2.3 Deduplicate folder-tree logic (quick wins)
Identical `toggleFolderExpansion`/pinning logic is copy-pasted in `chat-store.ts:1096`, `scheduler-store.ts:174`, and `toolbox-store.ts:75`. Tree traversal is reimplemented in `scheduler-runner.ts:24`, `scheduler-store.ts:64`, `storage.ts`, and `tree-utils.ts`.

**Fix:** A `createFolderUIStore()` factory and a generic `traverseTree()` in `tree-utils.ts` collapse four implementations into one each. Low effort, immediate payoff.

### 2.4 Split storage.ts by platform (~940 lines)
Every function in `lib/storage.ts` carries both a Tauri implementation and a localStorage web fallback inline. ~70% of the file is dual-mode boilerplate.

**Fix:** Extract `storage/tauri-storage.ts` and `storage/web-storage.ts` behind a shared interface, selected once via `isTauri()`. Halves the reading burden and lets tests mock the platform cleanly.

### 2.5 Persist agent selection
Selected model survives restarts (synced to settings) but `agentId` in chat-store is ephemeral — restart always resets to the first agent. Move it into the settings-store persisted config for consistency.

### 2.6 Consolidate execution state in task-store
`runningTaskIds`, `runningConversations`, and `taskGenerations` are three parallel structures tracking one concept. A single `Map<taskId, {status, generation, conversationId}>` removes the possibility of them disagreeing.

---

## 3. Likely Bugs & Robustness

### 3.1 Adapter event handlers are never unsubscribed
`agentic-loop-store.ts:123-125` subscribes to adapter events but `removeAdapter()` (line 146) never unsubscribes. Old handlers keep firing with a captured `conversationId` — if a conversation is stopped and restarted, the stale adapter's events can interleave with the new one's, and handlers accumulate over the app's lifetime.

**Fix:** Store the unsubscribe function returned by `onEvent()` keyed by conversation ID and call it in `removeAdapter()`. This addresses both the leak and the stale-event race.

### 3.2 Scheduler tick re-entrancy is fragile
`scheduler-runner.ts:162-200` guards with a `tickInFlight` boolean, but a tick that runs longer than the 1-minute interval releases the flag just as the next queued tick fires, allowing back-to-back execution against possibly inconsistent state. Combine the flag with a minimum-elapsed-time check (e.g. skip if the last tick started < 30 s ago), and log a warning when a tick overruns the interval.

### 3.3 `isCurrentLoop` checked once per event
In `agentic-loop-store.ts:272-279` the current-loop check guards iteration appends but `pendingToolCalls`/`currentStatus` updates aren't consistently scoped to the event's conversation. With two conversations running concurrently, a tool event from conversation A landing just after the user switches to B can pollute B's UI state. Key the pending-tool-call state by conversation ID rather than keeping a single global list.

### 3.4 Empty catch blocks hide real failures
`chat-store.ts:498-510` swallows all errors when loading SOUL.md/USER.md memory files. Missing-file is fine to ignore, but permission or corruption errors silently degrade the system prompt. Log anything that isn't a not-found error. Worth a quick `grep -rn "catch {}" src/` sweep for the same pattern elsewhere.

### 3.5 No abort handling on web-fallback streaming
The web-only streaming path in `chat-store.ts:728-794` has no AbortSignal — cancelling or navigating away leaves the stream running to completion. Wire an `AbortController` into the conversation lifecycle.

*(Note: an earlier-suspected leak in `guardrails/undo-manager.ts` is already fixed — it clears its interval at line 403.)*

---

## 4. Testing & Tooling

### 4.1 Fix the standing TS2556 error — 5 minutes
`stores/scheduler-store.test.ts:54,61` (and `agentic/sapio-agent-adapter.test.ts:71`) use `(...args: unknown[]) => mockFn(...args)` — spreading `unknown[]` fails type-check. Pass the mock function directly or type the args as a tuple. This is the only thing keeping `bun run check-types` red; fixing it makes type-check a usable CI gate.

### 4.2 Add CI — highest leverage tooling change
No `.github/workflows/`. A single workflow running `bun install`, `bun run check-types`, and `bun run test:run` (after 4.1) catches regressions on every push. Add `cargo clippy` + `cargo test` for the Rust side later.

### 4.3 Add a linter/formatter
No ESLint/Biome/Prettier config anywhere. Biome is the natural fit for a Bun monorepo — one `biome.json` at the root, `bun run lint` script, wire into CI.

### 4.4 Wire `test` into the root + turbo
Root `package.json` has only `quick_test`; turbo.json has no test task. Add `"test": "turbo test:run"` at the root and a `test:run` task in turbo.json so tests are orchestrated and one command works everywhere (and in CI).

### 4.5 Coverage gaps, in priority order
- **Routes:** 0 of 9 route files tested — these hold real wiring logic (chat, tasks, scheduler).
- **Rust backend:** 0 tests across ~33 commands. Start with pure functions: path expansion/validation in `commands.rs`, the log-filename guard.
- **Components:** ~23 of 44 non-ui components untested (file-editor, kanban-column, markdown-content, loop-progress-panel…).

### 4.6 Doc drift in CLAUDE.md
CLAUDE.md still says "Testing infrastructure not yet configured" — there are 64 test files and two vitest configs. It also still flags the `com.tauri.dev` placeholder identifier, which was already fixed. Update the Notes section so agents and contributors aren't misled.

---

## 5. Build, Dependencies & Rust Backend

### 5.1 Pin `@mariozechner/pi-coding-agent`
`packages/pi-sidecar/package.json:9` uses `"latest"` — every fresh install can pull a different version of the package at the heart of the agent runtime. Pin it (exact or caret) and upgrade deliberately.

### 5.2 Make filesystem Tauri commands async
`commands.rs:155-262`: `read_file`, `write_file`, `read_directory` (recursive!), `delete_path` are synchronous commands, which run on Tauri's main thread and can freeze the UI on large files/trees. Mark them `async` — Tauri then runs them on a thread pool with no other changes needed.

### 5.3 Dependency alignment
- `@types/uuid` is `^11` while `uuid` is `^13` (`apps/web/package.json:52,70`) — uuid ships its own types since v10, so drop `@types/uuid` entirely.
- `@tauri-apps/api` is `^2.0.0` against Rust `tauri 2.9.5`; tighten to `^2.9.0` to avoid old-API installs.

### 5.4 Small Rust/build items
- `execute_shell` accepts a `_sandbox: bool` parameter that's ignored (`commands.rs:385`) — implement it or remove it; as-is it implies a safety feature that doesn't exist.
- Release builds have no logging at all (`lib.rs:12-17` gates the log plugin on `debug_assertions`) — enable it at `Warn` level in release so production issues are diagnosable.
- `build-sidecar.mjs:10-22` regexes `rustc -vV` output without a null check — fail loudly if the target triple can't be detected.
- The `nodeStubsPlugin` in `vite.config.ts` returns silent no-op proxies for Node builtins; consider a `console.warn` when a stub is actually touched at runtime, so a real `fs`/`stream` usage in webview code surfaces instead of failing mysteriously. Also worth a short comment in the file explaining why it exists (the blank-screen history isn't discoverable from the code).

---

## Suggested Order of Attack

| # | Item | Effort | Why first |
|---|------|--------|-----------|
| 1 | Fix TS2556 (4.1) | minutes | Unblocks type-check as a gate |
| 2 | Stop logging request bodies (1.3) | ~1 h | Active privacy leak, ships in every build |
| 3 | Set CSP + narrow HTTP scope (1.1, 1.2) | ~2 h | Biggest attack-surface reduction |
| 4 | CI + Biome + root test script (4.2–4.4) | ~3 h | Locks in everything that follows |
| 5 | Adapter unsubscribe + scheduler tick guard (3.1, 3.2) | ~2 h | Real concurrency bugs |
| 6 | Pin pi-coding-agent, fix uuid types, async fs commands (5.1–5.3) | ~2 h | Cheap correctness/perf wins |
| 7 | Folder-UI + tree-traversal dedup (2.3) | ~1 day | Quick architectural win |
| 8 | Filesystem deny-by-default + shell allowlist tightening (1.4, 1.5) | ~1 day | Privacy principle alignment |
| 9 | Split chat-store, break store cycle (2.1, 2.2) | 3–5 days | Long-term maintainability |
| 10 | Split storage.ts, route/Rust tests (2.4, 4.5) | ongoing | Steady-state quality |
