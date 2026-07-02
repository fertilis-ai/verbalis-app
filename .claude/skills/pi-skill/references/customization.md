# Pi Customization Reference

Skills, prompt templates, themes, pi packages, custom models, custom providers, and containerization. Extensions have their own files (`extension-api.md`, `extension-guide.md`).

## Skills

Capability packages following the Agent Skills standard: a directory with `SKILL.md` (YAML frontmatter + markdown) plus optional `scripts/`, `references/`, `assets/`.

**Frontmatter:**

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | ≤ 64 chars, `[a-z0-9-]` |
| `description` | yes | ≤ 1024 chars — drives when the model loads the skill |
| `license` | no | |
| `compatibility` | no | ≤ 500 chars |
| `metadata` | no | arbitrary key/value |
| `allowed-tools` | no | space-delimited pre-approved tools |
| `disable-model-invocation` | no | `true` hides it from the system prompt (manual-only) |

**Discovery:**
- Global: `~/.pi/agent/skills/`, `~/.agents/skills/`
- Project (after trust): `.pi/skills/`, `.agents/skills/` (cwd + ancestors)
- Pi package `skills/` dirs, `pi.skills` in `package.json`, settings `skills` array

In `~/.pi/agent/skills/` and `.pi/skills/`, top-level `.md` files are discovered and any directory containing `SKILL.md` is discovered recursively. In `~/.agents/skills/` and project `.agents/skills/`, top-level `.md` files are ignored (only `SKILL.md` directories count) — this is the cross-harness interop convention.

**Loading / invocation:**
- `--skill <path>` (repeatable, additive), `--no-skills` to disable all
- `/skill:name` slash commands when `{ "enableSkillCommands": true }` (default true), e.g. `/skill:pdf-tools extract`
- Reuse another harness's skills: `{ "skills": ["~/.claude/skills", "~/.codex/skills"] }`

## Prompt Templates

`.md` files whose filename becomes a slash command (`review.md` → `/review`).

**Frontmatter (optional):** `description` (defaults to first non-empty line), `argument-hint` (e.g. `<required> [optional]`).

**Placeholders:** `$1`, `$2` (positional); `$@` / `$ARGUMENTS` (all args joined); `${1:-default}` (fallback); `${@:N}` (from Nth, 1-indexed); `${@:N:L}` (L args from N).

**Locations (precedence):** `~/.pi/agent/prompts/*.md` → `.pi/prompts/*.md` (trusted) → package `prompts/` dirs or `pi.prompts` → settings `prompts` array → `--prompt-template <path>`. `--no-prompt-templates` disables. Discovery in `prompts/` is **non-recursive**.

```
/review
/component Button "click handler"
```

## Themes

JSON files. Required: `name`, `colors` (**all 51 tokens**). Optional: `vars`, `$schema` (recommended), `export` block for HTML export.

Schema: `https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json`

**Color value formats:** hex (`"#ff0000"`), 256-color index (`39`), a `vars` reference (`"primary"`), or `""` (terminal default).

**Locations (precedence):** built-in (`dark`, `light`) → `~/.pi/agent/themes/*.json` → `.pi/themes/*.json` (trusted) → package `themes/` or `pi.themes` → settings `themes` → `--theme <path>`. `--no-themes` disables. Select with `{ "theme": "my-theme" }` or `pi --theme`. Custom theme files **hot-reload** on edit; first run auto-detects light/dark.

**The 51 tokens by group:**
- *Core UI (11):* `accent`, `border`, `borderAccent`, `borderMuted`, `success`, `error`, `warning`, `muted`, `dim`, `text`, `thinkingText`
- *Backgrounds/content (11):* `selectedBg`, `userMessageBg`, `userMessageText`, `customMessageBg`, `customMessageText`, `customMessageLabel`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`, `toolTitle`, `toolOutput`
- *Markdown (10):* `mdHeading`, `mdLink`, `mdLinkUrl`, `mdCode`, `mdCodeBlock`, `mdCodeBlockBorder`, `mdQuote`, `mdQuoteBorder`, `mdHr`, `mdListBullet`
- *Tool diffs (3):* `toolDiffAdded`, `toolDiffRemoved`, `toolDiffContext`
- *Syntax (9):* `syntaxComment`, `syntaxKeyword`, `syntaxFunction`, `syntaxVariable`, `syntaxString`, `syntaxNumber`, `syntaxType`, `syntaxOperator`, `syntaxPunctuation`
- *Thinking borders (6):* `thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium`, `thinkingHigh`, `thinkingXhigh`
- *Bash (1):* `bashMode`

## Pi Packages

Bundle extensions, skills, prompt templates, and themes for distribution via npm or git.

**Manifest** (`package.json`, `pi` key; add `keywords: ["pi-package"]` for the gallery):

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

Paths support globs and `!exclusions`. **Without a manifest**, convention dirs are auto-detected: `extensions/` (`.ts`/`.js`), `skills/` (recursive `SKILL.md` + top-level `.md`), `prompts/` (`.md`), `themes/` (`.json`).

**Dependencies:** put third-party deps in `bundledDependencies`; keep core `@earendil-works/pi-*` packages in `peerDependencies` with `"*"` (do not bundle them). **Gallery metadata:** `pi.video` (MP4, takes precedence), `pi.image`.

**CLI:**

```bash
pi install npm:@foo/bar@1.0.0          # npm:@scope/pkg[@version]
pi install git:github.com/user/repo@v1 # git:host/user/repo[@ref] (also git@…, ssh://…)
pi install https://github.com/user/repo
pi install ./relative/path             # or absolute path
pi remove npm:@foo/bar
pi list
pi update [--extensions | --self | npm:@foo/bar]
pi -e npm:@foo/bar                      # load for a single run (temporary)
```

In settings, the resource arrays accept an object form for filtering: `+path` force-include, `-path` force-exclude, `!pattern` exclude.

## Custom Models (`models.json`)

`~/.pi/agent/models.json`, reloaded each time the `/model` menu opens.

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "llama-3.1-8b", "name": "Llama 3.1 8B", "input": ["text"],
          "contextWindow": 128000, "maxTokens": 32000,
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 } }
      ]
    }
  }
}
```

**Provider fields:** `baseUrl`, `api`, `apiKey` (required), plus `headers`, `authHeader`, `models`, `modelOverrides`, `compat`. **API types:** `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`.

**Model fields:** `id` (req), `name`, `api`, `reasoning` (false), `thinkingLevelMap`, `input` (`["text"]`), `contextWindow` (128000), `maxTokens` (16384), `cost` (per-million, zeros), `compat`.

**Value resolution** for `apiKey`/`headers`: `!shell command` (uses stdout), `$ENV_VAR` / `${A}_${B}` interpolation, or literal (escapes `$$`, `$!`). `thinkingLevelMap` maps each level → provider value or `null` (unsupported). `modelOverrides` customizes built-in models; a built-in provider can be proxied by setting only `baseUrl`.

## Custom Providers (extension)

Register a provider at runtime, optionally with OAuth and custom streaming.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import {
  type Context, type Model, type SimpleStreamOptions, type AssistantMessageEventStream,
  calculateCost, createAssistantMessageEventStream,
} from "@earendil-works/pi-ai";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("my-proxy", {
    name: "My Proxy",
    baseUrl: "https://proxy.example.com",
    apiKey: "PROXY_API_KEY",            // env var name or literal
    api: "anthropic-messages",
    models: [{
      id: "claude-sonnet-4-20250514",
      name: "Claude Sonnet (proxy)",
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 16384,
    }],
    // optional OAuth for /login
    oauth: {
      name: "Corporate AI",
      async login(cb: OAuthLoginCallbacks) { /* … → OAuthCredentials */ },
      async refreshToken(creds: OAuthCredentials) { /* … */ },
      getApiKey(creds: OAuthCredentials) { return creds.access; },
      modifyModels(models, creds) { return models; },
    },
  });
}
```

**`api` values:** `anthropic-messages`, `openai-completions`, `openai-responses`, `azure-openai-responses`, `openai-codex-responses`, `mistral-conversations`, `google-generative-ai`, `google-vertex`, `bedrock-converse-stream`.

**`OAuthLoginCallbacks`:** `onAuth({url})`, `onDeviceCode({userCode, verificationUri, intervalSeconds?, expiresInSeconds?})`, `onPrompt({message}): Promise<string>`, `onSelect({message, options:[{id,label}]}): Promise<string|undefined>`. **`OAuthCredentials`:** `{ refresh, access, expires }`.

**Custom streaming** (`streamSimple`): build a stream with `createAssistantMessageEventStream()` and push `start` → content events (`text_*`, `thinking_*`, `toolcall_*`) → `done` (`{reason, message}`) or `error`; compute cost via `calculateCost(model, usage)`. See the `custom-provider-anthropic` and `custom-provider-gitlab-duo` example extensions.

## Containerization (no built-in sandbox)

Pi has no sandbox; isolate untrusted work with one of:

**Plain Docker** (`Dockerfile.pi`):

```dockerfile
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends bash ca-certificates git ripgrep
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent
WORKDIR /workspace
ENTRYPOINT ["pi"]
```
```bash
docker build -t pi-sandbox -f Dockerfile.pi .
docker run --rm -it -e ANTHROPIC_API_KEY -v "$PWD:/workspace" -v pi-agent-home:/root/.pi/agent pi-sandbox
```

**Gondolin** (local micro-VM; `@earendil-works/gondolin`, requires Node ≥ 23.6 + QEMU) — ships as an example extension:

```bash
cp -R packages/coding-agent/examples/extensions/gondolin ~/.pi/agent/extensions/gondolin
cd ~/.pi/agent/extensions/gondolin && npm install --ignore-scripts
pi -e ~/.pi/agent/extensions/gondolin
```

**OpenShell** (policy-controlled sandbox): `openshell sandbox create --name pi-sandbox --from pi -- pi`, then `upload`/`download` workspace files; code inside reaches inference via `https://inference.local`.

> Related project: `earendil-works/pi-chat` — a pi extension (Apache-2.0) bridging Discord/Telegram to sandboxed pi sessions, each channel in its own Gondolin micro-VM. Install with `pi install /path/to/pi-chat`.
