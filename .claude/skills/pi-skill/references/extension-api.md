# Pi Extension API Reference

Complete API surface for extensions of `@earendil-works/pi-coding-agent`. For task-oriented patterns see `extension-guide.md`.

## Loading & Structure

Auto-discovery locations:

| Location | Scope |
|----------|-------|
| `~/.pi/agent/extensions/*.ts` | Global |
| `~/.pi/agent/extensions/*/index.ts` | Global (subdirectory) |
| `.pi/extensions/*.ts` | Project-local (trust-gated) |
| `.pi/extensions/*/index.ts` | Project-local (subdirectory) |

Also loadable via the `extensions` settings array, pi packages, or `pi -e <source>` (one-time). `/reload` hot-reloads discovered extensions.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) { /* register + subscribe here */ }
// async default functions are also supported
```

Common imports:

```typescript
import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";                                   // or from "@earendil-works/pi-ai"
import { StringEnum } from "@earendil-works/pi-ai";
import { Text, matchesKey, type AutocompleteItem } from "@earendil-works/pi-tui";
```

## Registration Methods

### registerTool

```typescript
pi.registerTool({
  name: "my_tool",
  label: "My Tool",                  // display name
  description: "What the LLM sees",
  promptSnippet?: string,            // extra text injected into the system prompt
  promptGuidelines?: string[],       // usage guidelines for the model
  parameters: Type.Object({          // TypeBox schema
    action: StringEnum(["list", "add"] as const),
    text: Type.Optional(Type.String()),
  }),
  prepareArguments?(args: unknown): unknown,   // normalize args before execute

  // ⚠️ PARAMETER ORDER: (toolCallId, params, signal, onUpdate, ctx)
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    onUpdate?.({ content: [{ type: "text", text: "…" }], details: {} });  // stream progress
    if (signal?.aborted) return { content: [{ type: "text", text: "Aborted" }] };
    return {
      content: [{ type: "text", text: "…" }],   // sent to the LLM
      details: { /* … */ },                      // for rendering + session state
      // terminate: true,                         // stop the run after this batch
      //                                            (only if every finalized result in the batch is terminate:true)
    };
  },

  // optional custom rendering (return a pi-tui Component)
  renderCall?(args, theme, context) { return new Text("…", 0, 0); },
  renderResult?(result, { expanded, isPartial }, theme, context) { return new Text("…", 0, 0); },
  renderShell?: "self",
});
```

Registering a tool with the **same name as a built-in** (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) overrides it.

### registerCommand

```typescript
pi.registerCommand("stats", {
  description: "Show session statistics",
  getArgumentCompletions?(prefix: string): AutocompleteItem[] | null,
  handler: async (args: string, ctx: ExtensionCommandContext) => {
    ctx.ui.notify(`${ctx.sessionManager.getEntries().length} entries`, "info");
  },
});
```

### registerShortcut / registerFlag

```typescript
pi.registerShortcut("ctrl+shift+p", {
  description: "Toggle plan mode",
  handler: async (ctx) => { /* … */ },
});

pi.registerFlag("plan", { description: "Start in plan mode", type: "boolean", default: false });
if (pi.getFlag("--plan")) { /* … */ }
```

### registerProvider / registerMessageRenderer

```typescript
pi.registerProvider("my-proxy", { /* ProviderConfig — see customization.md */ });
pi.unregisterProvider("my-proxy");

pi.registerMessageRenderer("my-extension", (message, options, theme, context) => {
  let t = theme.fg("accent", `[${message.customType}] `) + message.content;
  if (options.expanded && message.details) t += "\n" + theme.fg("dim", JSON.stringify(message.details, null, 2));
  return new Text(t, 0, 0);
});
```

## Other `pi.*` Methods

```typescript
// Inject a custom message into the conversation
pi.sendMessage(
  { customType: "my-ext", content: "…", display: true, details: {} },
  { deliverAs: "steer" | "followUp" | "nextTurn", triggerTurn: true }
);
// Send as the user (string or content blocks incl. images)
pi.sendUserMessage("What is 2+2?", { deliverAs: "steer" | "followUp" });
pi.sendUserMessage([
  { type: "text", text: "Describe:" },
  { type: "image", source: { type: "base64", mediaType: "image/png", data: "…" } },
]);

pi.appendEntry("my-state", { count: 42 });    // persist outside the LLM context

pi.getActiveTools();                          // string[]
pi.getAllTools();                             // [{ name, description, parameters, promptGuidelines?, sourceInfo }]
pi.setActiveTools(["read", "bash"]);

await pi.setModel(model);                      // boolean
pi.getThinkingLevel();                         // "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
pi.setThinkingLevel("high");

pi.setSessionName("Refactor auth");
pi.getSessionName();
pi.setLabel(entryId, "checkpoint" /* or undefined to clear */);

pi.getCommands();   // [{ name, description?, source: "extension"|"prompt"|"skill", sourceInfo }]

await pi.exec("git", ["status"], { signal, timeout: 5000 });  // { stdout, stderr, code, killed }

pi.events.on("my:event", (data) => { /* … */ });   // inter-extension comms
pi.events.emit("my:event", { payload: "…" });
```

## Event Catalog (`pi.on(name, handler)`)

Handlers are `async (event, ctx) => …`. Returning a value (where noted) influences behavior.

### Session lifecycle
| Event | Payload | Return |
|-------|---------|--------|
| `project_trust` | `{ cwd }` | `{ trusted: "yes"\|"no"\|"undecided"; remember? }` |
| `session_start` | `{ reason: "startup"\|"reload"\|"new"\|"resume"\|"fork"; previousSessionFile? }` | – |
| `session_before_switch` | `{ reason: "new"\|"resume"; targetSessionFile? }` | `{ cancel? }` |
| `session_switch` | `{ previousSessionFile }` | – |
| `session_before_fork` | `{ entryId; position: "before"\|"at" }` | `{ cancel?; skipConversationRestore? }` |
| `session_fork` | `{ entryId }` | – |
| `session_before_compact` | `{ preparation; branchEntries; customInstructions; signal }` | `{ cancel? }` or `{ compaction: { summary, firstKeptEntryId, tokensBefore } }` |
| `session_compact` | `{ compactionEntry; fromExtension }` | – |
| `session_before_tree` | `{ preparation; signal }` | `{ cancel? }` or `{ summary: { summary, details } }` |
| `session_tree` | `{ newLeafId; oldLeafId; summaryEntry; fromExtension }` | – |
| `session_shutdown` | `{ reason: "quit"\|"reload"\|"new"\|"resume"\|"fork"; targetSessionFile? }` | – |
| `resources_discover` | `{ cwd; reason: "startup"\|"reload" }` | `{ skillPaths?; promptPaths?; themePaths? }` |

### Agent / turn / context
| Event | Payload | Return |
|-------|---------|--------|
| `before_agent_start` | `{ prompt; images?; systemPrompt; systemPromptOptions }` | `{ message?; systemPrompt? }` |
| `agent_start` | – | – |
| `agent_end` | `{ messages }` | – |
| `turn_start` | `{ turnIndex; timestamp }` | – |
| `turn_end` | `{ turnIndex; message; toolResults }` | – |
| `context` | `{ messages }` (deep copy, safe to modify) | `{ messages }` (pruned/edited) |
| `before_provider_request` | `{ payload }` | modified `payload` or `undefined` |
| `after_provider_response` | `{ status; headers }` | – |

### Messages / tools
| Event | Payload | Return |
|-------|---------|--------|
| `message_start` | `{ message }` | – |
| `message_update` | `{ message; assistantMessageEvent }` | – |
| `message_end` | `{ message }` | `{ message? }` |
| `tool_call` | `{ toolName; toolCallId; input }` | `{ block?; reason? }` |
| `tool_result` | `{ toolName; toolCallId; input; content; details; isError }` | `{ content?; details?; isError? }` |
| `tool_execution_start` | `{ toolCallId; toolName; args }` | – |
| `tool_execution_update` | `{ toolCallId; toolName; args; partialResult }` | – |
| `tool_execution_end` | `{ toolCallId; toolName; result; isError }` | – |

### Model / input
| Event | Payload | Return |
|-------|---------|--------|
| `model_select` | `{ model; previousModel?; source: "set"\|"cycle"\|"restore" }` | – |
| `thinking_level_select` | `{ level; previousLevel }` | – |
| `user_bash` | `{ command; excludeFromContext; cwd }` | `{ operations }` or `{ result: { output, exitCode, cancelled, truncated } }` |
| `input` | `{ text; images?; source: "interactive"\|"rpc"\|"extension"; streamingBehavior? }` | `{ action: "continue"\|"transform"\|"handled"; text? }` |

## ExtensionContext (`ctx`)

Available in every event handler and tool `execute`.

```typescript
// UI (no-ops/guarded when !ctx.hasUI — check ctx.mode / ctx.hasUI in headless modes)
ctx.ui.notify(message, "info" | "warn" | "error");
ctx.ui.setStatus(key, text);              // footer status segment
ctx.ui.setWidget(key, lines);             // widget near the editor
ctx.ui.setTitle(text);
ctx.ui.setEditorText(text);
await ctx.ui.select(title, items: string[]);          // string | undefined
await ctx.ui.confirm(title, message);                 // boolean
await ctx.ui.input(title, defaultValue?);             // string | undefined
await ctx.ui.editor(title, initialText?);             // string | undefined
await ctx.ui.custom(factory, options?);               // custom component (see tui-package.md)

ctx.mode;                 // "tui" | "rpc" | "json" | "print"
ctx.hasUI;                // boolean
ctx.cwd;                  // working directory
ctx.isProjectTrusted();

// Session (read-only)
ctx.sessionManager.getEntries();
ctx.sessionManager.getBranch();           // entries on the current branch
ctx.sessionManager.getLeafId();
ctx.sessionManager.getSessionFile();
ctx.sessionManager.getLabel(entryId);

// Model
ctx.modelRegistry.find(provider, id);     // Model | undefined
ctx.model;                                // current Model | undefined

// Control
ctx.signal;                               // AbortSignal | undefined
ctx.isIdle();
ctx.abort();
ctx.hasPendingMessages();
ctx.shutdown();                           // request graceful exit
ctx.getContextUsage();                    // { tokens } | undefined
ctx.compact({ customInstructions?, onComplete?, onError? });
ctx.getSystemPrompt();
```

## ExtensionCommandContext

Extends `ExtensionContext`; available only in command handlers.

```typescript
ctx.getSystemPromptOptions();             // { customPrompt?, selectedTools?, contextFiles?, skills?, … }
await ctx.waitForIdle();                   // wait for streaming to finish
await ctx.newSession({ parentSession?, setup?(sm), withSession?(ctx) });   // { cancelled }
await ctx.fork(entryId, { position?: "before"|"at", withSession? });        // { cancelled }
await ctx.navigateTree(entryId, { summarize?, customInstructions?, replaceInstructions?, label? });
await ctx.switchSession(filePath, { withSession? });                         // { cancelled }
await ctx.reload();
```

## Built-in Tool Helpers

```typescript
import {
  isToolCallEventType, isBashToolResult,
  truncateHead, truncateTail, truncateLine, formatSize,
  DEFAULT_MAX_BYTES /* 50KB */, DEFAULT_MAX_LINES /* 2000 */,
  createLocalBashOperations, createBashTool,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
```

### Typed results

```typescript
pi.on("tool_result", async (event, ctx) => {
  if (isBashToolResult(event)) {
    // event.details typed as BashToolDetails (e.g. event.details.exitCode)
  }
});
```

### Truncation

```typescript
const t = truncateHead(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
if (t.truncated) result += `\n[Truncated: ${t.outputLines}/${t.totalLines} lines]`;
```

### Custom operations (remote/sandboxed tools)

Build a tool from custom backing operations (SSH, container, etc.) instead of the local filesystem:

```typescript
import { createBashTool, createLocalBashOperations } from "@earendil-works/pi-coding-agent";

const remoteBash = createBashTool(cwd, {
  operations: { /* run, kill, … over SSH */ },
});
pi.registerTool(remoteBash);
```

See the `sandbox/`, `gondolin/`, and `ssh`-style example extensions for full implementations.

## Rendering & Theme

Tool `renderCall`/`renderResult`, `registerMessageRenderer`, and `ctx.ui.custom` return `@earendil-works/pi-tui` components. Use the theme for colors:

```typescript
theme.fg("accent" | "success" | "error" | "warning" | "muted" | "dim" | "text" | "toolTitle", text);
theme.bold(text); theme.italic(text); theme.strikethrough(text);
```

Syntax highlighting:

```typescript
import { highlightCode, getLanguageFromPath } from "@earendil-works/pi-coding-agent";
const highlighted = highlightCode(code, getLanguageFromPath("/x/file.rs"), theme);
```

Custom editor (e.g. modal/vim input) — extend `CustomEditor` and install it on `session_start`:

```typescript
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

class VimEditor extends CustomEditor { /* override handleInput / render — see tui-package.md */ }

pi.on("session_start", (_e, ctx) =>
  ctx.ui.setEditorComponent((_tui, theme, keybindings) => new VimEditor(theme, keybindings)));
```
