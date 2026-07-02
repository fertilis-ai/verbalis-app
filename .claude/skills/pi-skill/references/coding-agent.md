# Pi Coding Agent — CLI & Usage Reference

Reference for `@earendil-works/pi-coding-agent` (binary: `pi`). For the extension API see `extension-api.md`; for embedding see `sdk-and-modes.md`.

## Install

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
# or
curl -fsSL https://pi.dev/install.sh | sh
```

`--ignore-scripts` skips dependency lifecycle scripts (not needed by pi). Uninstall preserves data in `~/.pi/agent/`:

```bash
npm uninstall -g @earendil-works/pi-coding-agent   # pnpm remove / yarn global remove / bun uninstall
```

## Modes of Operation

| Mode | Flag | Behavior |
|------|------|----------|
| Interactive (default) | – | Full TUI: streaming, tool execution, sessions, slash commands |
| Print | `-p` / `--print` | Single response, then exit |
| JSON event stream | `--mode json` | All events emitted as JSON lines (see `sdk-and-modes.md`) |
| RPC | `--mode rpc` | Process integration over stdin/stdout JSONL (see `sdk-and-modes.md`) |
| Export | `--export <in> [out]` | Export a session to HTML |

## Authentication

- **Subscription (OAuth):** run `/login` — supports Claude Pro/Max, ChatGPT Plus/Pro (Codex), GitHub Copilot. Stored in `~/.pi/agent/auth.json`.
- **API key:** `export ANTHROPIC_API_KEY=…` (or any provider's env var) before launching. See `ai-package.md` / `references/customization.md` for the full provider/env-var list.

## CLI Reference

```bash
pi [options] [@files...] [messages...]
```

### Package management
```bash
pi install <source> [-l]      # install a pi package (extensions/skills/prompts/themes)
pi remove <source> [-l]       # remove an installed package
pi uninstall <source> [-l]    # alias of remove
pi update [source|self|pi]    # update a package, or pi itself
pi update --extensions        # update all installed packages
pi update --self              # update pi
pi list                       # list installed packages
pi config                     # open/inspect config
```
Sources: `npm:@scope/pkg@1.2.3`, `git:github.com/user/repo@v1`, `https://…`, absolute/relative paths. `-l` targets the local project. `pi -e npm:@foo/bar` loads a package for a single run.

### Model options
```bash
--provider <name>             # anthropic, openai, google, deepseek, groq, xai, ...
--model <pattern>             # accepts provider/id and optional :<thinking>
--api-key <key>
--thinking <level>            # off | minimal | low | medium | high | xhigh
--models <patterns>           # comma-separated; Ctrl+P cycles between them
--list-models [search]
```

### Session options
```bash
-c, --continue                # resume most recent session
-r, --resume                  # browse & select a session
--session <path|id>           # use a specific session
--fork <path|id>              # fork from a session
--session-dir <dir>
--no-session                  # ephemeral (no persistence)
-n, --name <name>             # name the session
```

### Tool options
```bash
-t,   --tools <list>          # enable only these tools
-xt,  --exclude-tools <list>
-nbt, --no-builtin-tools      # drop the built-in tools
-nt,  --no-tools              # disable all tools
```
Built-in tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`.

### Resource options
```bash
-e, --extension <source>      # load an extension (repeatable)
    --no-extensions
    --skill <path>            # load a skill (repeatable, additive)
    --no-skills
    --prompt-template <path>  # load a prompt template (repeatable)
    --no-prompt-templates
    --theme <path>            # load a theme (repeatable)
    --no-themes
-nc, --no-context-files       # skip AGENTS.md / CLAUDE.md
```

### Other
```bash
--system-prompt <text>        # replace the system prompt
--append-system-prompt <text>
--verbose
-a,  --approve                # trust project resources for this run
-na, --no-approve             # decline project resources for this run
-h, --help / -v, --version
```

## Slash Commands

`/login`, `/logout`, `/model`, `/scoped-models`, `/settings`, `/resume`, `/new`, `/name <name>`, `/session`, `/tree`, `/fork`, `/clone`, `/compact [prompt]`, `/copy`, `/export [file]`, `/share` (private GitHub gist), `/reload`, `/hotkeys`, `/changelog`, `/trust`, `/debug`, `/quit`. Skills register as `/skill:name` when `enableSkillCommands` is on.

## Editor & Input

- `@` — fuzzy file search; `Tab` — path completion
- `Shift+Enter` / `Ctrl+Enter` — newline (multi-line)
- `Ctrl+V` (`Alt+V` on Windows) / drag — paste image
- `!command` — run shell, send output to the model; `!!command` — run silently (excluded from context)
- `Ctrl+G` — edit in `$VISUAL` / `$EDITOR`
- `Enter` queues a **steering** message (interrupts streaming); `Alt+Enter` queues a **follow-up**; `Escape` aborts/restores; `Alt+Up` retrieves queued messages
- `Ctrl+L` model select, `Ctrl+P` cycle models, `Shift+Tab` cycle thinking level, `Ctrl+T` toggle thinking, `Ctrl+O` expand tools

## Sessions

Stored as tree-structured **JSONL** under `~/.pi/agent/sessions/`, organized by working directory. Each session is a tree of entries linked by `id`/`parentId`, supporting branching and fork. See `sdk-and-modes.md` for the exact on-disk format.

- `pi -c` continue, `pi -r` browse, `pi --no-session` ephemeral, `pi --name "task"`, `pi --fork <id>`
- `/tree` — navigate branches (↑/↓ move, `Ctrl+←`/`Ctrl+→` fold/unfold, `Shift+L` label, `Enter` switch)
- `/clone` duplicates the active branch; `/share` uploads a private gist; `/export` writes HTML
- `treeFilterMode` setting: `default | no-tools | user-only | labeled-only | all`

## Compaction

When `contextTokens > contextWindow − reserveTokens`, pi summarizes older content while preserving recent work:

1. Walk back accumulating tokens until `keepRecentTokens` is reached → cut point.
2. Messages from the previous kept boundary to the cut point are summarized by the LLM (iteratively, prior summary as context).
3. A `CompactionEntry` is appended with the `summary` + `firstKeptEntryId`; reloads use the summary plus messages from `firstKeptEntryId` forward.

Cut points are valid at user/assistant/BashExecution/custom messages — **never at tool results**. `/compact [instructions]` triggers it manually; `/tree` offers to summarize abandoned branches (`BranchSummaryEntry`).

```json
{ "compaction": { "enabled": true, "reserveTokens": 16384, "keepRecentTokens": 20000 } }
```

## Security & Trust

Pi runs with the **permissions of the user who starts it** and has **no built-in sandbox**; built-in tools and extensions run with full process permissions.

Trust-gated resources (loaded only after trust): `.pi/settings.json`, `.pi/extensions`, `.pi/skills`, `.pi/prompts`, `.pi/themes`, `.pi/SYSTEM.md`, `.pi/APPEND_SYSTEM.md`, project `.agents/skills`. Decisions are stored in `~/.pi/agent/trust.json` keyed by canonical directory; global `defaultProjectTrust` ∈ `"ask" | "never" | "always"` (default `"ask"`). `--approve`/`--no-approve` override for one run.

Trust only guards *loading* repo-provided code — it does not prevent prompt injection via file contents, comments, build output, or context. For untrusted code, isolate with a container/VM (see `references/customization.md` → Containerization).

## settings.json

Global `~/.pi/agent/settings.json`, project `.pi/settings.json`. Selected keys (defaults in parens):

**Model/thinking:** `defaultProvider`, `defaultModel`, `defaultThinkingLevel`, `hideThinkingBlock` (`false`), `thinkingBudgets` (object), `enabledModels` (array, Ctrl+P cycle), `scopedModels`.

**UI:** `theme` (`"dark"`), `quietStartup` (`false`), `collapseChangelog` (`false`), `doubleEscapeAction` (`"tree"`; `tree|fork|none`), `treeFilterMode` (`"default"`), `editorPaddingX` (`0`), `autocompleteMaxVisible` (`5`), `showHardwareCursor` (`false`).

**Trust/telemetry:** `defaultProjectTrust` (`"ask"`, global only), `enableInstallTelemetry` (`true`), `enableAnalytics` (`false`), `trackingId`.

**Compaction/branch:** `compaction.{enabled,reserveTokens,keepRecentTokens}`, `branchSummary.{reserveTokens,skipPrompt}`.

**Retry:** `retry.{enabled,maxRetries,baseDelayMs}`, `retry.provider.{timeoutMs,maxRetries,maxRetryDelayMs}`.

**Delivery/transport:** `steeringMode`/`followUpMode` (`"one-at-a-time"`; `all|one-at-a-time`), `transport` (`"auto"`; `sse|websocket|websocket-cached|auto`), `httpIdleTimeoutMs` (`300000`), `websocketConnectTimeoutMs` (`15000`).

**Terminal/images:** `terminal.{showImages,imageWidthCells,clearOnShrink}`, `images.{autoResize,blockImages}`, `markdown.codeBlockIndent`.

**Shell/network:** `shellPath`, `shellCommandPrefix`, `npmCommand` (array), `httpProxy` (global only), `sessionDir`.

**Resources:** `packages`, `extensions`, `skills`, `prompts`, `themes` (arrays of paths/sources; object form supports `+include`/`-exclude`/`!pattern` filtering), `enableSkillCommands` (`true`).

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PI_CODING_AGENT_DIR` | Override config dir (default `~/.pi/agent`) |
| `PI_CODING_AGENT_SESSION_DIR` | Override session dir |
| `PI_PACKAGE_DIR` | Override package install dir |
| `PI_OFFLINE` | Offline mode (also `--offline`) |
| `PI_SKIP_VERSION_CHECK` | Skip startup version check |
| `PI_TELEMETRY` | Telemetry toggle |
| `PI_CACHE_RETENTION` | `long` for extended prompt cache (Anthropic 5min→1h, OpenAI in-memory→24h) |
| `PI_EXPERIMENTAL` | Enable experimental features |
| `VISUAL`, `EDITOR` | External editor for `Ctrl+G` |

## Keybindings

Config: `~/.pi/agent/keybindings.json` (namespaced ids; `/reload` to apply). Format `modifier+key` (`ctrl`/`shift`/`alt`); each action takes a key or array; user config overrides defaults.

```json
{
  "tui.editor.cursorUp": ["up", "ctrl+p"],
  "tui.editor.cursorDown": ["down", "ctrl+n"],
  "tui.editor.deleteWordBackward": ["ctrl+w", "alt+backspace"]
}
```

Notable defaults: submit `enter`, newline `shift+enter`, interrupt `escape`, exit `ctrl+d`, external editor `ctrl+g`, paste image `ctrl+v`, model select `ctrl+l`, cycle models `ctrl+p`/`shift+ctrl+p`, thinking cycle `shift+tab` / toggle `ctrl+t`, expand tools `ctrl+o`, follow-up `alt+enter`, dequeue `alt+up`. Run `/hotkeys` to view the live set.
