# Refactor plan

This plan comes from a read-only review of `apps/web` (about 25k lines of TS and Rust) done on 2026-09-28. Line numbers refer to commit `994a717`.

Decisions already made: delete the unused system tools (shell, clipboard, notification) and remove pi-sidecar.

## Principles
- Each phase is one PR that leaves the app behaving the same (except the listed bug fixes) and keeps tests green.
- Order the work to reduce risk: fix bugs and delete dead code first, then extract shared helpers, then split large files.
- The CLAUDE.md invariants still apply: the editor text fallback, the Shiki JS regex engine, and `@streamdown/code >= 1.0.3`. Verify webview changes in a packaged build (`bunx tauri build --bundles dmg`).

## Phase 0: Correctness fixes — ✅ done
1. ✅ **Double tool-call sync.** The loop bus (`subscribeToLoopEvents`) is now the only path from the loop to conversation state. `syncToolCallToConversation` and the `tool_*` cases in the adapter run handler were removed. `upsertToolCall` in `chat-store.ts` implements one merge rule: fields present in the event win, and omitted fields keep their stored value.
2. ✅ **Circular import.** `agentic-loop-store` publishes `{ type: "loop_ended" }` on the bus, and chat-store calls `markToolCallsStopped` in response. The loop store no longer imports chat-store or settings-store.
3. ❎ **Model-resolution reasoning stamp: not a bug.** `getEffortCapability` returns `null` for every non-OpenRouter model by design, so stamping would force `reasoning: false` onto Anthropic/OpenAI registry models. The registry branch was left unchanged.
4. ✅ **Adapter leak.** A new `releaseAdapter(conversationId, adapter)` runs when each `run()` finishes. It removes the adapter and its event subscription, keeps the loop context and UI status visible, and does nothing if the adapter has already been replaced.
5. ✅ **Guardrails parameter removed** from `VerbalisAgentAdapter` and `createVerbalisAdapter`. The config comes only from `run(config)`. Also removed the unused `totalIterations`.

## Phase 1: Delete dead code and dependencies — ✅ done
1. ✅ **System tools:**
   - Removed `lib/tools/system-tools.ts` and its test, `SYSTEM_TOOLS` in `categories.ts`, clipboard undo in `undo-manager.ts` (`clipboard_write` type and `ClipboardWriteUndoData`), the tool-card icons, and `clipboard_read`/`clipboard_write` from the default writer agent in `toolbox-defaults.ts`. Seeded files are never overwritten, so `SUPERSEDED_TOOLBOX_DEFAULTS` plus an upgrade pass in `ensureDefaultToolboxItems` rewrite a `writer.md` that is still byte-identical to the old default. Edited copies are left alone, and `TOOLBOX_DEFAULTS_VERSION` is not bumped, because a bump would resurrect deleted defaults.
   - Removed the Rust `execute_shell`, `read_clipboard`, `write_clipboard` and `send_notification`, and the `arboard` and `notify-rust` crates.
   - The system tools were never executed; only the unused barrel imported `executeSystemTool`.
   - The `"system"` `ToolCategory` and `CATEGORY_CONFIG.system` are **kept**. Persisted `guardrailsConfig.categoryConfirmation.system`, the presets and the evaluator all key on them.
2. ✅ **pi-sidecar:** removed `packages/pi-sidecar`, `lib/pi-sidecar.ts`, the `bin/pi-sidecar*` binaries, `externalBin` and `plugins.shell` in `tauri.conf.json`, `run_pi_sidecar`, and the `build:sidecar` script.
   - `tauri-plugin-shell` was only used to open URLs ("(Get key)" in settings). It is replaced by `tauri-plugin-opener` (capability `opener:default`).
   - The JS side is pinned to `@tauri-apps/plugin-opener` **2.5.3** to match the Rust crate. `^2` resolved to 2.7.0, which pulls `@tauri-apps/api` 2.12 against Rust `tauri` 2.9.5. The pin keeps `api` at 2.10.1.
3. ✅ **Rust commands:**
   - Removed `read_config`, `save_config`, `backup_file`, `restore_file`, the `AppConfig` struct, the default `config.yaml` write in `init_app_data_dir`, and the `serde_yaml` and `tokio` crates.
   - `config-sync` already writes `config.yaml` when it is missing. The only value in the Rust default (`theme: dark`) equals the store default.
   - `http_request` is **kept**: `lib/tools/web-tools.ts` calls it three times. Replacing it with `tauri-plugin-http` is a separate change that needs CSP and scope work.
4. ✅ **TS modules and exports:**
   - Removed `context-sharing.ts`, the unused barrels (`lib/agentic/index.ts`, `lib/tools/index.ts`, `lib/guardrails/index.ts`), and the `classifyError` import and `includeTools` path in chat-store.
   - Removed from the adapter: `isLocal`, `pause`/`resume`/`checkPause`, and `abort`. `stop(reason)` is the single stop path.
   - Removed `selectUniqueAgentIds`/`selectRecentRecords` and the legacy `yolo`/`sandboxed`/`guardrails` fields and setters. They were neither read nor persisted, and `config-sync` now only calls `setGuardrailsConfig`.
   - `stopConfigSync` is **kept**. It is the only way to reset config-sync's module state (subscription, poll timer, `lastKnownContent`) between tests.
5. ✅ **npm packages:** removed `@hookform/resolvers`, `@tanstack/react-form`, `dotenv` (and its catalog entry), `@verbalis-app/env` and `packages/env`, and `@tauri-apps/plugin-shell`.

Follow-ups found in Phase 1 (not done here):
- The guardrails **shell-command UI and config** now govern tools that no longer exist: "Shell Command Restrictions", the Shell/min rate limit, `sandbox.shellCommands`, and `shellCommands` allow/deny lists. Removing them changes persisted config shape, so it needs a settings migration.
- The loop events `loop_paused` and `loop_resumed` and the `"paused"` loop status are still handled in the store and UI, but nothing can emit them now. Remove them together with the UI branches.

## Phase 2: Shared helpers (removes duplication) — ✅ done
1. ✅ **`lib/openrouter.ts`:** `OPENROUTER_BASE_URL`, `openRouterHeaders(apiKey)`, `withZdr(body, zdr)`, `openRouterFetch(path, {apiKey, zdr, body, signal})` and `openRouterCompat(zdr)`.
   - `openRouterHeaders` returns only `Authorization`, and nothing for a blank key, so model listing still works unauthenticated. chat-store spreads it into pi-ai's `model.headers`.
   - `openRouterFetch` is a GET with just the auth header, or a JSON POST with `withZdr` applied when a `body` is given. It returns the raw `Response`; callers keep their own non-OK handling (throw in speech/transcription/image, `{ models: [], error }` in provider-models, swallow in the ZDR id fetch).
   - `openRouterCompat` moved over unchanged from chat-store. It is pi-ai's `openRouterRouting` compat shape, not the `provider: { zdr }` body shape, so it is not built on `withZdr`.
   - Switched over: `speech.ts`, `transcription.ts`, `tools/image-tools.ts`, the five OpenRouter sites in `provider-models.ts`, and chat-store. The speech key is now trimmed like the others.
2. ✅ **`readErrorBody`** moved to `http.ts`; the three `readErrorMessage` copies are gone. **Intentional behavior change:** speech, transcription and image errors now also show a top-level `message` or a short plain-text body, where they used to show only `HTTP <status>`.
   - Tests that mock `@/lib/http` now spread `importOriginal()`, so `readErrorBody` is real under test instead of `undefined`.
3. ✅ **Path helpers:** `dirname`/`basename` in `lib/path-resolution.ts`, with exactly the old `substring`/`split("/").pop()` semantics (`dirname` is `""` without a slash). 20 sites replaced; per-caller fallbacks (`|| "unknown"`, the optional `pendingCloseFilePath`) stay at the call site.
4. ✅ **Provider labels:** `PROVIDER_LABELS`/`getProviderLabel()` in `lib/models.ts` (including `lmstudio`/`ollama`) replace the maps in `chat-input.tsx`, `model-picker.tsx` and the API-key names and local-provider labels in `settings-view.tsx`. chat-store's `defaultBaseUrls` is merged into `PROVIDER_BASE_URL_MAP`. `models.ts` keeps its own OpenRouter URL literal: importing `lib/openrouter.ts` would drag `http` → `logger` → `storage` into a dependency-free module.
5. ✅ **Downloads:** `lib/download.ts` (`downloadFile(content, filename, type)`) is used by `guardrails-section.tsx` (and was used by `execution-history.tsx`, since deleted as dead UI).
6. ✅ **ZDR setting renamed** to `openRouterZdrOnly` (setter `setOpenRouterZdrOnly`). Persist version 2 → 3 copies `modelDiscoveryNoDataCollection` into the new key and deletes the old one. Without it, Zustand would drop the old key and ZDR routing would silently switch off. The state comment now says the setting also enforces ZDR routing on chat, image, transcription and speech requests.

Packaged-build smoke test (2026-09-29, all passed):
- Settings migration v2 → v3 on real data: `openRouterZdrOnly` carried over and `modelDiscoveryNoDataCollection` was removed.
- API-key labels and the "(Get key)" link. ZDR filtering in the model picker (243 of 439 models) and its badges. Refresh for text, image and speech models. Provider labels in the chat picker.
- Chat with tools; the request carries the ZDR routing preference. Image generation with ZDR. Speech with ZDR on: OpenRouter refuses a non-ZDR model with a 404 ZDR error, as expected.
- Guardrails export to `~/Downloads` (valid JSON).
- File rename (on disk, in the tree and in the tab) and the file name in the unsaved-changes modal.
- Chats: move to folder and folder rename.
- Default filename in image Save As.
- Schedules: update, Run now, move into a folder, edit when nested, folder rename, folder delete.
- Tasks: folder create with auto-select, a run, folder delete.
- Syntax highlighting in the Workspace and Toolbox editors.

Follow-ups found in Phase 2 (not done here):
- The default-model select in `settings-view.tsx` still labelled options with the raw provider id (`GPT-4o (openai)`). → **Fixed**, verified in the packaged app (`Qwen: Qwen3.8 27B (OpenRouter)`).
- **Read-aloud was broken in the packaged app** ("The operation is not supported"). The CSP had no `media-src`, so `blob:` audio was blocked. This dates from the TTS commit (`b177332`), not Phase 2. → **Fixed** (CSP `media-src 'self' blob:`), verified in the packaged app.
- The image, transcription and speech pickers were not filtered by ZDR; only the text picker was. → **Fixed.** In the packaged app a speech Refresh stored `zdr` flags (8 of 21 false). The image and transcription lists pick up flags on their next Refresh.
- Transcription returned HTTP 400 ("Provider returned 400") for `say`-generated test audio. The request was unchanged from before Phase 2. → **Fixed** (recordings re-encoded to WAV), verified in the packaged app.
- `toolbox/execution-history.tsx` (`ExecutionHistory`) was not mounted anywhere: dead UI that Phase 1 missed. → **Fixed** (deleted along with `tool-history-store`).
- Schedule YAML stored `agentId: Assistant`, but the UI showed "default". → **Fixed** (unit-tested; new schedules store `default`, and legacy `Assistant` maps to `default`).

Fixes for these (branch `fix/smoke-test-bugs`):
- **Read-aloud:** added `media-src 'self' blob:` to the CSP.
- **Default-model labels:** the select uses `getProviderLabel`.
- **ZDR pickers:**
  - `/endpoints/zdr` also lists image, transcription and speech models, so `provider-models.ts` now sets a `zdr` flag on those too.
  - It is omitted when the ZDR list fails to load.
  - `filterZdrModels` hides only models known to lack ZDR (`zdr: false`), so lists cached before the flag existed stay usable until Refresh.
  - The current selection is always kept, even if it isn't ZDR, so its select never renders blank. Such a selection still works, but OpenRouter refuses it while ZDR is on.
- **Transcription:**
  - Recordings are decoded with Web Audio and re-sent as 16-bit mono WAV (`recordingToWav`/`encodeWav`). WAV is the format every OpenRouter transcription provider accepts.
  - When decoding fails, the recording goes as recorded.
  - The error now names the format that was sent.
- **Dead UI:** deleted `ExecutionHistory` and `tool-history-store` (only it used the store). The persisted `verbalis-tool-history` localStorage key is now orphaned and harmless.
- **Schedule agent:**
  - The fallback to a generic prompt was a real bug. `Assistant` matches no seeded agent (they are `default`, `organizer`, `researcher` and `writer`). `sendMessageToConversation` therefore found no agent, and scheduled runs used a generic "You are a helpful AI assistant." prompt with temperature 0.7 and no tool scoping, while the UI showed the first option.
  - New schedules now store `default`.
  - `resolveScheduleAgentId` maps a stored `Assistant` to `default`, in the runner and the Agent select, unless the user has an agent by that name. No YAML is rewritten.

## Phase 3: Single tool registry and typed Tauri boundary — ✅ done (branch `refactor/phase-3`, packaged smoke test pending)
1. ✅ **Typed commands.** `lib/tauri/commands.ts` has one typed function per Rust command. It is a leaf module (it imports only `invoke`), because logger, storage and http depend on it. Every raw `invoke("…")` outside it is gone, including in `tools.ts` and `undo-manager.ts`.
   - **Latent bug found:** `storage.readDirectory` sent `max_depth`, but Tauri expects camelCase argument keys, so Rust ignored it and every tree load used its default depth of 3 (the Workspace tree asked for 10). The depth now reaches Rust. The Workspace tree asks for 3 explicitly (`FILE_TREE_DEPTH`), keeping the depth it has always had. The other callers ask for 1 and use only top-level entries. All other invoke key casings were checked against the Rust signatures.
2. ✅ **One tool registry.** Each tool is a `ToolSpec` (`tools/categories.ts`): schema, category, risk level, undo support, path parameters and executor.
   - Specs live in `fs-tools.ts` (new), `web-tools.ts`, `image-tools.ts`, `toolbox-tools.ts` and `memory-tools.ts`, and schemas and descriptions were moved byte for byte. `tools/registry.ts` assembles them in the order the model has always seen and holds the only `getToolCategory`/`getToolRiskLevel`/`toolSupportsUndo`. The guardrails evaluator uses them.
   - `tools.ts` keeps `getToolsForContext` (same gates) and `executeTool`, which replaces the switch with a lookup. `TOOL_PATH_PARAMS` became each spec's `pathParams`.
   - The registry is built on first use, not at module load. The import cycle registry → toolbox-tools → toolbox-schemas → registry (toolbox-schemas needs the tool names to validate an agent's `tools:` list) otherwise reads `TOOLBOX_TOOLS` before it exists when toolbox-tools loads first.
   - `registry.test.ts` pins every tool's name, category, risk level and undo support, in order.
   - **Dropped dead metadata:** `requiresConfirmation`, `requiresNetwork` and `estimatedDurationMs`. Nothing read them; confirmation comes from the guardrails matrix (category × risk level). Also dropped the web-tools comment claiming `http_fetch` is "elevated for non-GET methods": the evaluator has no such logic.
   - **Order change:** the "Valid tools: …" list in the agent `tools:` validation error now follows registry order (file, web, image, toolbox, remember) instead of the old `ALL_TOOLS` order (file, toolbox, remember, web, image).
3. ✅ **Argument validation.** `executeTool` runs pi-ai's `validateToolArguments` (TypeBox `Value.Convert` + compiled check) before path resolution. Stringly-typed values are coerced (`"2"` → `2`), and a malformed call returns `Validation failed for tool "…"` as an error result instead of reaching an executor.
   - **Not a behavior change in the app:** pi-agent-core's loop already runs the same validation, with the same schemas, before it calls the adapter's `execute` (`agent-loop.js` `prepareToolCall`), and the adapter is the only caller of `executeTool`. So coercion and `null` handling for optional arguments are unchanged. The check makes executors independent of their caller.
   - TypeBox compiles with `new Function` when it can. `tools.csp.test.ts` blocks the `Function` constructor as the packaged CSP does, checks that the eval attempt was made and refused, and asserts that validation and coercion still work.
   - Removed two tests for impossible results (a non-array from `list_files`, an object from `read_file`). The executors are now typed to return strings.
4. ✅ **Rust cleanup.**
   - `app_dir()` replaces the `home.join(".verbalis")` copies; there were three, not six, since Phase 1 deleted commands.
   - `validate_log_filename()` replaces four copies of the traversal check.
   - Both have unit tests (`cargo test --lib`), the first in the crate.
   - The default agent lives only in `src/lib/toolbox/default-agent.md`: `include_str!` in `commands.rs`, `?raw` in `storage.ts`. The two copies were byte-identical before the move.

Verified: `tsc`, the full Vitest suite (87 files, 2038 tests), Biome (no new warnings), `cargo check`, `cargo test --lib` and the Vite production build.

Packaged smoke test (`cd apps/web && bunx tauri build --bundles dmg`); these cover the rewired commands and argument validation, which the dev build can't check:
- Any agent tool call (e.g. `read_directory`). Validation compiles TypeBox schemas, which must fall back from `new Function` under the CSP; it already did in the pi loop, so this is a regression check.
- Undo of an agent `write_file`, `delete_path` and `rename_path`.
- The debug log viewer: list, read and clear a log.
- Keychain: save an API key, restart, and check that it reloads.
- Generated image: Copy and Reveal in Finder.
- Workspace file tree: directories nested more than 3 levels still show empty past depth 3, as before.
- A self-authored agent with an unknown tool in `tools:` shows the "Valid tools" list.

Follow-ups found in Phase 3 (not done here):
- **Undo trash is never cleaned.** `undo-manager.ts` `cleanupTrash` lists `~/.verbalis/trash` with `list_files`. That command returns file *stems* and skips directories, so `deletePath(trash/<stem>)` misses any trashed file with an extension, and trashed directories are never considered. Needs a listing that returns full names, including directories.
- `FILE_TREE_DEPTH` could be raised now that the depth reaches Rust, if deep folders should show in the Workspace tree.

## Phase 4: Split `chat-store.ts` (1550 lines) — ✅ done (branch `refactor/phase-4`, stacked on `refactor/phase-3`; dev smoke test pending)
`chat-store.ts` is down from 1550 to 918 lines and now coordinates the modules below. New lib modules use `import type` only from `@/stores/chat-store`, and Phase 5 moves those types out.

1. ✅ **`lib/tool-call-patch.ts`:** `isToolCallInFlight`, `mergeToolCalls`, `upsertToolCall` (moved verbatim), `stopInFlightToolCalls`, `rejectToolCall` and `restoreToolCall` (an in-flight call loaded from disk becomes `error`). The stop and reject patches return the same conversation when no call changed.
2. ✅ **`lib/chat-persistence.ts`:** `serializeMessages`, `deserializeMessages`, `conversationToChatData`, `chatFolderArg` (the folder rule: `undefined` for the root chats directory, which had 3 copies) and `saveConversation`. `createConversationInternal`, `renameChat`, the end-of-turn save and the YAML migration use these.
3. ✅ **`lib/llm/resolve-model.ts`:** `resolveModelObject` (moved verbatim) and `unresolvedModelMessage` (the no-key, unknown-model and no-model texts). The `getModel` cast is in one private `lookupRegistryModel`. **`lib/llm/local-model.ts`:** `resolveLocalModel` and `buildLocalModel`, moved verbatim.
4. ✅ **`lib/llm/stream-plain.ts`:** `streamPlain()` replaces the local and cloud web-only streaming loops. Each call site keeps its own options and fallback error (`"Local LLM error"` / `"Failed to send message"`).
5. ✅ **`lib/prompt/build-system-prompt.ts`:** `loadToolboxPromptSections()` does the I/O (memories, skills, inventory), and `buildSystemPrompt()` is pure. Section order and text are byte-identical; the tests pin them.
6. ✅ **`lib/agentic/run-conversation.ts`:** `runConversation(params, deps)` owns the adapter lifecycle: stop the old adapter, create a new one, provide trimmed history, report the context budget, retry once at half the history budget on context overflow, and call `releaseAdapter` in `finally`. The event switch is the pure reducer `applyAdapterEvent`. The store injects the loop store, a fresh-message reader and the update function.
7. ✅ **One ghost-or-regular update.** `updateConversationInState` replaces the three copies (adapter events, the loop-bus tool-call subscriber, and `applyUpdate` for stop/reject).

Intentional differences (no visible behavior change):
- The update helper returns the previous state when the updater returns the same conversation, so no-op updates no longer notify subscribers. The adapter handler now routes every event through the reducer, which returns `c` for events it doesn't handle.
- Ghost detection uses `ghostConversation?.id` alone, without `isGhostMode`. `ghostConversation` is only set in ghost mode.
- The prompt-section warnings are logged with the `[system-prompt]` prefix.

Tests: `tool-call-patch` (13), `chat-persistence` (9), `resolve-model` (9, against the real pi-ai registry), `local-model` (6), `stream-plain` (5), `build-system-prompt` (10) and `run-conversation` (17: the reducer, adapter lifecycle, trimming, overflow retry, a second overflow shown, and release on throw). `chat-store.test.ts` still passes unchanged (157).

Verified: `tsc`, the full Vitest suite (94 files, 2107 tests) and Biome (54 warnings in `src`, the same count as before; the touched files have none). Phase 4 doesn't touch the CSP or webview dependencies, so a packaged build isn't required.

Dev smoke test (`bun run dev`, Tauri): `chat-store.test.ts` doesn't cover the adapter path, so check:
- A chat turn with a tool call that needs confirmation: approve one and reject one.
- A turn with several tool iterations: each new assistant message appears and the first one isn't duplicated.
- Stop mid-turn: in-flight tool calls show as stopped.
- A ghost chat with a tool call, then leave ghost mode.
- Rename a chat in a subfolder, restart, and check that it reloads from the same folder.
- A local model (LM Studio/Ollama) and a web-only cloud turn, both of which stream.

## Phase 5: Shared tree/folder model and runners
- **Folder-tree factory.** Chat, scheduler and task stores repeat folder CRUD, pin/expand and load-from-disk logic (`chat-store.ts:1189–1344`, `scheduler-store.ts:120–160`, `task-store.ts:101–137`). Move it into a `createFolderTreeSlice` factory, and fix the top-level-only `findNodeInTree` copy in `task-store.ts:75–83`.
- **One background runner.** Create `runBackgroundConversation()` for `task-runner.ts` and `scheduler-runner.ts`, including shared logging that respects `isLoggingEnabled`.
- **Move domain types out of stores.** `Message`, `Conversation` and similar go into `lib/types`, so that `lib/*` no longer imports from `@/stores/*`.

## Phase 6: Split `storage.ts` (1107 lines) and `commands.rs` (960 lines)
- **`lib/storage/` modules:**
  - `web-fs.ts` (24–194)
  - `fs.ts` (227–367)
  - `tree.ts` (369–427)
  - `chats.ts`, `agents.ts`, `tasks.ts`, `scheduler.ts`, `toolbox.ts`, `defaults.ts`
  - Keep an `index.ts` re-export so imports stay stable.
- **Validate on load.** Check YAML/JSON reads with Typebox (storage load points and `settings-store.ts:391`).
- **`src-tauri/src/commands/` modules:** `fs.rs`, `http.rs`, `logs.rs`, `keychain.rs`, following the existing section banners.

## Phase 7: Components
- **`CodeOverlayEditor`.** One shared component for `file-editor.tsx` and `toolbox-editor.tsx`, covering highlight with fallback, scroll sync, Tab indent and the gutter. The CLAUDE.md invariants (`text-transparent` only when the overlay is non-empty, `leading-5` placement) must live inside it, and `editor-highlight-fallback.test.tsx` has to keep passing for both callers.
- **`settings-view.tsx` (749 lines):**
  - Put each section in `components/settings/sections/*`.
  - Add a `SettingsSection` wrapper (about 9 copies of the header today) and a `useScrollSpy` hook.
  - Add a `DiscoverableModelSelect` to replace the four Refresh/spinner/error/select blocks.
- **Sidebars:** build a generic folder-tree sidebar for chat and scheduler (only a 96-line diff between them). The toolbox and file sidebars should adopt `useInlineEditing`, `shared/item-context-menu.tsx`, `usePollingLoader` and `confirm-modal` instead of native `confirm()`.
- **Split large components:**
  - `tool-call-card.tsx`: Header/Details/Actions; move `useToolboxDiff` into the toolbox layer.
  - `guardrails-section.tsx`
  - `loop-progress-panel.tsx`
  - `chat-input.tsx`: `ModelQuickSelect` and `EffortSelect`
- **Store selectors.** Replace whole-store `useXStore()` subscriptions with selectors or `useShallow` in `settings-view`, `model-picker`, `guardrails-section`, `chat-view`, `chat-sidebar` and the editors.
- **Bootstrap hook.** Move the `routes/__root.tsx:55–78` bootstrap into `useAppBootstrap`.

## Phase 8: Tooling and tests
- **Strict TS config.** Make `apps/web/tsconfig.json` extend `@verbalis-app/config/tsconfig.base.json` (`noUncheckedIndexedAccess`, `noUnused*`) and fix the resulting errors. This can run in parallel with earlier phases, one directory at a time.
- **Biome.** Set `noExplicitAny: warn`, and make `noDangerouslySetInnerHtml` an error everywhere except the two editors and the markdown renderer (per-line ignores there).
- **`chat-store.test.ts` (2380 lines).** Split it by concern: conversations/folders, tool execution, sendMessage/reasoning/ZDR, context. Use the unused shared mocks `test/mocks/storage.ts` and `test/mocks/tauri.ts` in place of 29 inline `@/lib/storage` mocks.
- **New tests:** `loop-progress-panel`, `scheduler-view`, the new pure modules (prompt builder, event reducer, resolve-model, openrouter helper), and `image-tools` ZDR.
- **Quick test script.** Fix the CLAUDE.md note, or the script: `quick_test` currently runs the full suite, not a subset.

## Out of scope / later
- Consolidating zod and Typebox (zod has one use, in `toolbox-schemas.ts`).
- Moving blocking `std::fs` calls in async Rust commands to `spawn_blocking`.
- A Rust-side path scope check, if the frontend isn't meant to be the security boundary.

## Verification (every phase)
- `bun run quick_test`
- `bunx tsc --noEmit -p apps/web`
- `bunx biome lint`
- `cargo check` in `src-tauri`, for Rust phases
- For phases 1, 3, 6 and 7: a packaged build (`cd apps/web && bunx tauri build --bundles dmg`) plus a manual smoke test covering:
  - chat with tools and a confirmation
  - the editors, with highlighting and the fallback
  - voice, read-aloud and image generation with ZDR on
  - scheduler and task runs
