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

## Phase 1: Delete dead code and dependencies
- **System tools:**
  - `lib/tools/system-tools.ts` and its entries in `categories.ts`
  - Clipboard undo in `guardrails/undo-manager.ts:152–170, 271`
  - The Rust `execute_shell` (which also has a blocking-timeout bug), `read_clipboard`, `write_clipboard` and `send_notification`, plus their registrations in `lib.rs`
- **pi-sidecar:**
  - `packages/pi-sidecar`, `lib/pi-sidecar.ts`, `externalBin` in `tauri.conf.json`, and `run_pi_sidecar` (`commands.rs:379–425`)
  - `tauri-plugin-shell` on both the Rust and JS sides
- **Unused Rust commands:** `read_config`, `save_config`, `backup_file`, `restore_file`, and the `AppConfig` struct. Also evaluate `http_request`, which duplicates `tauri-plugin-http`.
- **Unused TS modules and exports:**
  - `lib/agentic/context-sharing.ts` and its barrel `lib/agentic/index.ts`
  - The unused barrels `lib/tools/index.ts` and `lib/guardrails/index.ts`
  - `classifyError` import and the `includeTools` path (chat-store)
  - `isLocal` and `pause`/`resume`/`abort` (adapter)
  - `selectUniqueAgentIds` and `selectRecentRecords`
  - `stopConfigSync`
  - Legacy `setYolo`/`setSandboxed`/`setGuardrails`, after migrating `config-sync.ts:138–140`
- **Unused npm packages:** `@hookform/resolvers`, `@tanstack/react-form`, `dotenv`, `@verbalis-app/env` (and `packages/env`), `@tauri-apps/plugin-shell`.

## Phase 2: Shared helpers (removes duplication)
- **`lib/openrouter.ts`:**
  - `OPENROUTER_BASE_URL`
  - `openRouterHeaders(apiKey)`
  - `withZdr(body, zdr)`
  - `openRouterFetch(path, {apiKey, zdr, body, signal})`
  - Callers to switch over: `speech.ts`, `transcription.ts`, `tools/image-tools.ts`, `provider-models.ts` (5 sites), and `openRouterCompat` in chat-store.
- **`http.ts`:** move `readErrorBody` here (from `provider-models.ts:30`) and delete the three identical copies of `readErrorMessage`.
- **Path helpers:** add `dirname`/`basename` next to `lib/path-resolution.ts`, replacing about 20 ad-hoc `lastIndexOf("/")`/`split("/").pop()` sites.
- **Provider labels:** `PROVIDER_LABELS`/`getProviderLabel()` in `lib/models.ts`, replacing the maps in `chat-input.tsx:25`, `model-picker.tsx:9` and `settings-view.tsx:198,359`. Merge chat-store's `defaultBaseUrls` into `PROVIDER_BASE_URL_MAP`.
- **Downloads:** `lib/download.ts`, replacing the blob-download code in `execution-history.tsx` and `guardrails-section.tsx`.
- **Rename the ZDR setting:** `modelDiscoveryNoDataCollection` becomes `openRouterZdrOnly`. Add a persist migration (version 2 to 3) and update the outdated comment in `settings-store.ts:49`.

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
