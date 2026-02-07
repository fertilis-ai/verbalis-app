# Pi Coding Agent Reference

Complete reference for `@mariozechner/pi-coding-agent` - the main CLI tool.

## Installation

```bash
npm install -g @mariozechner/pi-coding-agent
```

## Architecture

### Three Modes of Operation

1. **Interactive Mode** (default) - Full TUI with streaming, tool execution, session management
2. **Print Mode** (`-p`) - Single response, exit
3. **RPC/JSON Mode** - Process integration via stdin/stdout with event stream

### Directory Structure

```
packages/coding-agent/
├── src/
│   ├── cli.ts                    # CLI entry point
│   ├── cli/                      # CLI utilities
│   │   ├── args.ts               # Argument parsing
│   │   ├── config-selector.ts    # Configuration UI
│   │   ├── file-processor.ts     # File handling
│   │   ├── list-models.ts        # Model listing
│   │   └── session-picker.ts     # Session selection
│   ├── core/
│   │   ├── extensions/           # Extension system
│   │   │   ├── loader.ts         # Extension loading
│   │   │   ├── runner.ts         # Event dispatch
│   │   │   ├── types.ts          # Extension types
│   │   │   └── wrapper.ts        # API wrapper
│   │   ├── compaction/           # Context compaction
│   │   ├── tools/                # Built-in tools
│   │   │   ├── bash.ts
│   │   │   ├── read.ts
│   │   │   ├── write.ts
│   │   │   ├── edit.ts
│   │   │   ├── grep.ts
│   │   │   ├── find.ts
│   │   │   └── ls.ts
│   │   ├── session-manager.ts    # Session persistence
│   │   ├── model-resolver.ts     # Model selection
│   │   ├── system-prompt.ts      # System prompt building
│   │   └── sdk.ts                # Programmatic API
│   └── modes/
│       ├── interactive/          # TUI mode
│       ├── print-mode.ts         # Print mode
│       └── rpc/                   # RPC mode
└── examples/
    └── extensions/               # 58+ example extensions
```

## Extension System

### Extension Locations (Auto-Discovery)

| Location | Scope |
|----------|-------|
| `~/.pi/agent/extensions/*.ts` | Global |
| `~/.pi/agent/extensions/*/index.ts` | Global (subdirectory) |
| `.pi/extensions/*.ts` | Project-local |
| `.pi/extensions/*/index.ts` | Project-local (subdirectory) |

### Extension API (ExtensionAPI)

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // All registration and event subscriptions happen here
}
```

#### Tool Registration

```typescript
pi.registerTool({
  name: "my_tool",
  label: "My Tool",                    // Display name
  description: "What this tool does",  // LLM sees this
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),
    text: Type.Optional(Type.String()),
  }),

  async execute(toolCallId, params, onUpdate, ctx, signal) {
    // Stream progress
    onUpdate?.({ content: [...], details: {} });

    // Check cancellation
    if (signal?.aborted) return { content: [...] };

    return {
      content: [{ type: "text", text: "..." }],  // Sent to LLM
      details: { ... }                            // For rendering & state
    };
  },

  // Optional: Custom rendering
  renderCall(args, theme) {
    return new Text(theme.fg("toolTitle", "my_tool ") + args.action, 0, 0);
  },

  renderResult(result, { expanded, isPartial }, theme) {
    if (isPartial) return new Text("Processing...", 0, 0);
    return new Text(theme.fg("success", "Done"), 0, 0);
  }
});
```

#### Command Registration

```typescript
pi.registerCommand("stats", {
  description: "Show session statistics",
  handler: async (args, ctx) => {
    const count = ctx.sessionManager.getEntries().length;
    ctx.ui.notify(`${count} entries`, "info");
  },
  // Optional: argument completion
  getArgumentCompletions: (prefix) => {
    return [{ value: "verbose", label: "verbose" }];
  }
});
```

#### Shortcut Registration

```typescript
pi.registerShortcut("ctrl+shift+p", {
  description: "Toggle plan mode",
  handler: async (ctx) => {
    ctx.ui.notify("Toggled!");
  },
});
```

#### Flag Registration

```typescript
pi.registerFlag("plan", {
  description: "Start in plan mode",
  type: "boolean",
  default: false,
});

// Check value
if (pi.getFlag("--plan")) {
  // Plan mode enabled
}
```

#### Provider Registration

```typescript
pi.registerProvider("my-proxy", {
  baseUrl: "https://proxy.example.com",
  apiKey: "PROXY_API_KEY",  // env var name or literal
  api: "anthropic-messages",
  models: [{
    id: "claude-sonnet-4-20250514",
    name: "Claude 4 Sonnet (proxy)",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 16384
  }],
  // Optional: OAuth for /login
  oauth: {
    name: "Corporate AI",
    async login(callbacks) { ... },
    async refreshToken(credentials) { ... },
    getApiKey(credentials) { return credentials.access; }
  }
});
```

#### Message Control

```typescript
// Inject custom message
pi.sendMessage({
  customType: "my-extension",
  content: "Message text",
  display: true,
  details: { ... },
}, {
  deliverAs: "steer",      // "steer" | "followUp" | "nextTurn"
  triggerTurn: true,       // Trigger LLM response if idle
});

// Send user message
pi.sendUserMessage("What is 2+2?");
pi.sendUserMessage([
  { type: "text", text: "Describe:" },
  { type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } },
]);

// Persist state outside LLM context
pi.appendEntry("my-state", { count: 42 });
```

#### Tool Management

```typescript
const active = pi.getActiveTools();    // ["read", "bash", "edit", "write"]
const all = pi.getAllTools();          // [{ name, description }, ...]
pi.setActiveTools(["read", "bash"]);   // Switch to read-only mode
```

#### Model Control

```typescript
const model = ctx.modelRegistry.find("anthropic", "claude-sonnet-4-5");
await pi.setModel(model);

const level = pi.getThinkingLevel();  // "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
pi.setThinkingLevel("high");
```

#### Session Control

```typescript
pi.setSessionName("Refactor auth module");
const name = pi.getSessionName();

pi.setLabel(entryId, "checkpoint-before-refactor");
```

#### Inter-Extension Communication

```typescript
pi.events.on("my:event", (data) => { ... });
pi.events.emit("my:event", { payload: "..." });
```

#### Shell Execution

```typescript
const result = await pi.exec("git", ["status"], { signal, timeout: 5000 });
// result.stdout, result.stderr, result.code, result.killed
```

### Event System

#### Session Events

```typescript
// Initial load
pi.on("session_start", async (_event, ctx) => {
  // Reconstruct state from ctx.sessionManager.getBranch()
});

// New session or resume
pi.on("session_before_switch", async (event, ctx) => {
  // event.reason: "new" | "resume"
  // event.targetSessionFile (for resume)
  return { cancel: true };  // Optional: cancel
});
pi.on("session_switch", async (event, ctx) => {
  // event.previousSessionFile
});

// Fork
pi.on("session_before_fork", async (event, ctx) => {
  // event.entryId
  return { cancel: true };
  // OR: return { skipConversationRestore: true };
});
pi.on("session_fork", async (event, ctx) => {});

// Compaction
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, signal } = event;
  return { cancel: true };
  // OR: return { compaction: { summary, firstKeptEntryId, tokensBefore } };
});
pi.on("session_compact", async (event, ctx) => {
  // event.compactionEntry, event.fromExtension
});

// Tree navigation
pi.on("session_before_tree", async (event, ctx) => {
  return { cancel: true };
  // OR: return { summary: { summary: "...", details: {} } };
});
pi.on("session_tree", async (event, ctx) => {
  // event.newLeafId, event.oldLeafId
});

// Shutdown
pi.on("session_shutdown", async (_event, ctx) => {
  // Cleanup, save state
});
```

#### Agent Events

```typescript
// Before agent loop
pi.on("before_agent_start", async (event, ctx) => {
  // event.prompt, event.images, event.systemPrompt
  return {
    message: { customType: "...", content: "...", display: true },
    systemPrompt: event.systemPrompt + "\n\nExtra instructions...",
  };
});

pi.on("agent_start", async (_event, ctx) => {});
pi.on("agent_end", async (event, ctx) => {
  // event.messages - messages from this prompt
});

// Per turn
pi.on("turn_start", async (event, ctx) => {
  // event.turnIndex, event.timestamp
});
pi.on("turn_end", async (event, ctx) => {
  // event.turnIndex, event.message, event.toolResults
});

// Context modification (before each LLM call)
pi.on("context", async (event, ctx) => {
  // event.messages is a deep copy, safe to modify
  const filtered = event.messages.filter(m => !shouldPrune(m));
  return { messages: filtered };
});
```

#### Tool Events

```typescript
// Before tool execution (can block)
pi.on("tool_call", async (event, ctx) => {
  // event.toolName, event.toolCallId, event.input
  if (shouldBlock(event)) {
    return { block: true, reason: "Not allowed" };
  }
});

// After tool execution (can modify)
pi.on("tool_result", async (event, ctx) => {
  // event.toolName, event.toolCallId, event.input
  // event.content, event.details, event.isError
  return { content: [...], details: {...}, isError: false };
});
```

#### Other Events

```typescript
// Model change
pi.on("model_select", async (event, ctx) => {
  // event.model, event.previousModel, event.source
});

// User bash (! or !! commands)
pi.on("user_bash", (event, ctx) => {
  // event.command, event.excludeFromContext, event.cwd
  return { operations: remoteBashOps };
  // OR: return { result: { output, exitCode, cancelled, truncated } };
});

// Raw input (before skill/template expansion)
pi.on("input", async (event, ctx) => {
  // event.text, event.images, event.source
  return { action: "transform", text: newText };
  // OR: return { action: "handled" };
  // OR: return { action: "continue" };
});
```

### Extension Context (ExtensionContext)

Available in all event handlers:

```typescript
// UI methods
ctx.ui.select("Pick one:", options)
ctx.ui.confirm("Title", "Message", { timeout? })
ctx.ui.input("Prompt:", "placeholder")
ctx.ui.editor("Edit:", "prefilled")
ctx.ui.notify("Message", "info|warning|error")
ctx.ui.setStatus("key", "text")
ctx.ui.setWidget("key", lines, { placement })
ctx.ui.setFooter(renderer)
ctx.ui.setHeader(renderer)
ctx.ui.setEditorText("prefill")
ctx.ui.setEditorComponent(customEditor)
ctx.ui.custom<T>((tui, theme, kb, done) => component)

// Session access (read-only)
ctx.sessionManager.getEntries()
ctx.sessionManager.getBranch()
ctx.sessionManager.getLeafId()
ctx.sessionManager.getLabel(entryId)

// Model access
ctx.modelRegistry.find(provider, modelId)
ctx.model  // Current model

// Control
ctx.hasUI           // false in non-interactive modes
ctx.cwd             // Working directory
ctx.isIdle()        // Agent status
ctx.abort()         // Abort agent
ctx.shutdown()      // Request graceful exit
ctx.getContextUsage()  // Token count
ctx.compact(options)   // Trigger compaction
ctx.getSystemPrompt()  // Current system prompt
```

### Extension Command Context (ExtensionCommandContext)

Available only in command handlers (extends ExtensionContext):

```typescript
ctx.waitForIdle()        // Wait for agent to finish streaming
ctx.newSession(options)  // Create new session
ctx.fork(entryId)        // Fork from entry
ctx.navigateTree(id, options)  // Navigate session tree
```

## Built-in Tools

### Tool Details Types

Each built-in tool has a typed `details` object:

```typescript
import {
  BashToolDetails,
  ReadToolDetails,
  GrepToolDetails,
  FindToolDetails,
  LsToolDetails,
  isBashToolResult,
} from "@mariozechner/pi-coding-agent";

pi.on("tool_result", async (event, ctx) => {
  if (isBashToolResult(event)) {
    // event.details is BashToolDetails
    console.log(event.details.exitCode);
  }
});
```

### Overriding Built-in Tools

Register a tool with the same name to override:

```typescript
pi.registerTool({
  name: "read",  // Overrides built-in read
  // ...
});
```

### Creating Tools with Custom Operations

For remote execution (SSH, containers):

```typescript
import { createReadTool, createBashTool, type ReadOperations } from "@mariozechner/pi-coding-agent";

const remoteRead = createReadTool(cwd, {
  operations: {
    readFile: (path) => sshExec(remote, `cat ${path}`),
    access: (path) => sshExec(remote, `test -r ${path}`).then(() => {}),
  }
});

pi.registerTool(remoteRead);
```

## Output Truncation

Tools must truncate output to avoid context overflow:

```typescript
import {
  truncateHead,      // Keep first N lines/bytes
  truncateTail,      // Keep last N lines/bytes
  truncateLine,      // Truncate single line
  formatSize,        // Human-readable size
  DEFAULT_MAX_BYTES, // 50KB
  DEFAULT_MAX_LINES, // 2000
} from "@mariozechner/pi-coding-agent";

const truncation = truncateHead(output, {
  maxLines: DEFAULT_MAX_LINES,
  maxBytes: DEFAULT_MAX_BYTES,
});

if (truncation.truncated) {
  result += `\n[Truncated: ${truncation.outputLines}/${truncation.totalLines} lines]`;
}
```

## UI Components

### Custom Components

```typescript
const result = await ctx.ui.custom<boolean>((tui, theme, keybindings, done) => {
  class MyComponent {
    handleInput(data: string) {
      if (matchesKey(data, "enter")) done(true);
      if (matchesKey(data, "escape")) done(false);
    }
    render(width: number): string[] {
      return ["Press Enter or Escape"];
    }
  }
  return new MyComponent();
});
```

### Overlay Mode

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyOverlay({ onClose: done }),
  {
    overlay: true,
    overlayOptions: { anchor: "top-right", width: "50%", margin: 2 }
  }
);
```

### Custom Editor

```typescript
import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";

class VimEditor extends CustomEditor {
  private mode: "normal" | "insert" = "insert";

  handleInput(data: string): void {
    if (matchesKey(data, "escape") && this.mode === "insert") {
      this.mode = "normal";
      return;
    }
    if (this.mode === "normal" && data === "i") {
      this.mode = "insert";
      return;
    }
    super.handleInput(data);
  }
}

pi.on("session_start", (_event, ctx) => {
  ctx.ui.setEditorComponent((_tui, theme, keybindings) =>
    new VimEditor(theme, keybindings)
  );
});
```

### Message Rendering

```typescript
import { Text } from "@mariozechner/pi-tui";

pi.registerMessageRenderer("my-extension", (message, options, theme) => {
  const { expanded } = options;
  let text = theme.fg("accent", `[${message.customType}] `) + message.content;
  if (expanded && message.details) {
    text += "\n" + theme.fg("dim", JSON.stringify(message.details, null, 2));
  }
  return new Text(text, 0, 0);
});
```

### Theme Colors

```typescript
theme.fg("toolTitle", text)   // Tool names
theme.fg("accent", text)      // Highlights
theme.fg("success", text)     // Success (green)
theme.fg("error", text)       // Errors (red)
theme.fg("warning", text)     // Warnings (yellow)
theme.fg("muted", text)       // Secondary text
theme.fg("dim", text)         // Tertiary text

theme.bold(text)
theme.italic(text)
theme.strikethrough(text)
```

### Syntax Highlighting

```typescript
import { highlightCode, getLanguageFromPath } from "@mariozechner/pi-coding-agent";

const lang = getLanguageFromPath("/path/to/file.rs");  // "rust"
const highlighted = highlightCode(code, lang, theme);
```

## SDK Usage

```typescript
import { AuthStorage, createAgentSession, ModelRegistry, SessionManager } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage: new AuthStorage(),
  modelRegistry: new ModelRegistry(authStorage),
});

await session.prompt("What files are in the current directory?");
```

## CLI Reference

```bash
pi [options] [@files...] [messages...]

# Modes
-p, --print              # Print response and exit
--mode json              # Output all events as JSON lines
--mode rpc               # RPC mode for process integration

# Model options
--provider <name>        # Provider (anthropic, openai, google, etc.)
--model <id>             # Model ID
--thinking <level>       # off, minimal, low, medium, high, xhigh

# Session options
-c, --continue           # Continue most recent session
-r, --resume             # Browse and select session
--session <path>         # Use specific session file
--no-session             # Ephemeral mode

# Tool options
--tools <list>           # Enable specific tools (read,bash,edit,write)
--no-tools               # Disable all built-in tools

# Resource options
-e, --extension <path>   # Load extension
--no-extensions          # Disable extension discovery
--skill <path>           # Load skill
--no-skills              # Disable skill discovery
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PI_CODING_AGENT_DIR` | Override config directory (default: `~/.pi/agent`) |
| `PI_SKIP_VERSION_CHECK` | Skip version check at startup |
| `PI_CACHE_RETENTION` | Set to `long` for extended prompt cache |
| `VISUAL`, `EDITOR` | External editor for Ctrl+G |
