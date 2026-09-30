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

## Phase 1: Delete dead code and dependencies — ✅ done (manual smoke test pending)
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
5. ✅ **Downloads:** `lib/download.ts` (`downloadFile(content, filename, type)`) is used by `execution-history.tsx` and `guardrails-section.tsx`.
6. ✅ **ZDR setting renamed** to `openRouterZdrOnly` (setter `setOpenRouterZdrOnly`). Persist version 2 → 3 copies `modelDiscoveryNoDataCollection` into the new key and deletes the old one. Without it, Zustand would drop the old key and ZDR routing would silently switch off. The state comment now says the setting also enforces ZDR routing on chat, image, transcription and speech requests.

Follow-up found in Phase 2 (not done here):
- The default-model select in `settings-view.tsx` still labels options with the raw provider id (`GPT-4o (openai)`). Switching it to `getProviderLabel` is a visible UI change, so it was left alone.

## Phase 3: Single tool registry and typed Tauri boundary
- **One tool registry.** Merge `TOOL_DEFINITIONS` (`lib/tools.ts:188–360`) and `ALL_TOOLS` (`lib/tools/categories.ts`) into one registry. Each entry holds its definition, metadata and executor.
  - Keep one `getToolCategory`/`getToolRiskLevel`/`toolSupportsUndo`.
  - Move the file tools to `tools/fs-tools.ts`, and reduce `tools.ts` to assembling the registry.
  - Validate LLM-supplied tool arguments with Typebox `Value.Check` before executing (`tools.ts:468–535`).
- **Typed commands.** `lib/tauri/commands.ts` gets one typed function per Rust command, replacing about 55 raw `invoke("…")` strings in 14 files. `tools.ts` and `undo-manager.ts` then use it instead of calling `invoke` directly.
- **Rust cleanup:**
  - Add an `app_dir()` helper (replacing six copies of `home.join(".verbalis")`) and `validate_log_filename()` (four copies).
  - Keep one source for the default agent file (it is currently in both `commands.rs:44` and `storage.ts:26`).

## Phase 4: Split `chat-store.ts` (1550 lines)
Extract pure modules and keep the store as a thin coordinator:

| New module | Source lines | Contents |
|---|---|---|
| `lib/llm/resolve-model.ts` | 64–166 | Model resolution and the unknown-model error text (900–916), with a typed wrapper for the `getModel` cast (`chat-store.ts:116`) |
| `lib/llm/local-model.ts` | 186–223 | Local model resolution |
| `lib/prompt/build-system-prompt.ts` | 546–605 | System prompt assembly as a pure function; add unit tests |
| `lib/agentic/run-conversation.ts` | 610–823 | The adapter run, with the event switch as a pure reducer; add unit tests |
| `streamPlain()` helper | 873–891, 934–961 | One streaming loop replacing the two copies |
| `lib/chat-persistence.ts` | 349–380, 1047–1099, 1300–1308 | Serialize/deserialize and the folder-path rule (3 copies); `createConversationInternal` uses `conversationToChatData` |
| `lib/tool-call-patch.ts` | — | The pending/executing checks and merge rules |

Also merge the three "update conversation, ghost or regular" copies into one.

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
  - `execution-history.tsx`, with a `useHistoryTable` hook
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
