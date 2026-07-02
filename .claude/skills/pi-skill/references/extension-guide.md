# Pi Extension Development Guide

Step-by-step guide for creating extensions for the pi coding agent. For the exhaustive API surface (every method, event payload, and `ctx` member) see `extension-api.md`.

> **Tool `execute` parameter order is `(toolCallId, params, signal, onUpdate, ctx)`.** Import `Type` from `typebox` (or `@earendil-works/pi-ai`), and `StringEnum` from `@earendil-works/pi-ai`.

## Getting Started

### 1. Create Extension File

Create a TypeScript file in one of the auto-discovery locations:

**Global** (all projects):
```
~/.pi/agent/extensions/my-extension.ts
```

**Project-local** (current project only):
```
.pi/extensions/my-extension.ts
```

### 2. Basic Structure

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // All registration happens here
}
```

### 3. Test with Flag

```bash
pi -e ./my-extension.ts
```

### 4. Hot Reload

For extensions in auto-discovered locations, use `/reload` command to reload without restarting pi.

## Extension Patterns

### Pattern 1: Simple Tool

A tool the LLM can call to perform actions.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "calculate",
    label: "Calculator",
    description: "Perform mathematical calculations",
    parameters: Type.Object({
      expression: Type.String({ description: "Math expression to evaluate" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      try {
        // Never use eval in production - this is just an example
        const result = eval(params.expression);
        return {
          content: [{ type: "text", text: `Result: ${result}` }],
          details: { expression: params.expression, result },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          details: { error: error.message },
        };
      }
    },
  });
}
```

### Pattern 2: Tool with User Interaction

A tool that prompts the user during execution.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "deploy",
    label: "Deploy",
    description: "Deploy to an environment",
    parameters: Type.Object({
      env: StringEnum(["dev", "staging", "prod"] as const),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (params.env === "prod") {
        const confirmed = await ctx.ui.confirm(
          "Production Deploy",
          "Are you sure you want to deploy to production?"
        );
        if (!confirmed) {
          return {
            content: [{ type: "text", text: "Deployment cancelled by user" }],
            details: { cancelled: true },
          };
        }
      }

      onUpdate?.({
        content: [{ type: "text", text: `Deploying to ${params.env}...` }],
        details: { status: "deploying" },
      });

      // Simulate deployment
      await new Promise((resolve) => setTimeout(resolve, 2000));

      return {
        content: [{ type: "text", text: `Successfully deployed to ${params.env}` }],
        details: { env: params.env, success: true },
      };
    },
  });
}
```

### Pattern 3: Stateful Tool with Persistence

A tool that maintains state across session reloads.

```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

interface Note {
  id: number;
  text: string;
  timestamp: number;
}

export default function (pi: ExtensionAPI) {
  let notes: Note[] = [];
  let nextId = 1;

  // Reconstruct state from session
  const reconstructState = (ctx: ExtensionContext) => {
    notes = [];
    nextId = 1;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (msg.role !== "toolResult" || msg.toolName !== "notes") continue;

      const details = msg.details;
      if (details?.notes) {
        notes = details.notes;
        nextId = details.nextId;
      }
    }
  };

  // Reconstruct on all relevant session events
  pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_switch", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_fork", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

  pi.registerTool({
    name: "notes",
    label: "Notes",
    description: "Manage notes. Actions: list, add (text), delete (id)",
    parameters: Type.Object({
      action: StringEnum(["list", "add", "delete"] as const),
      text: Type.Optional(Type.String({ description: "Note text for add" })),
      id: Type.Optional(Type.Number({ description: "Note ID for delete" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      switch (params.action) {
        case "list":
          return {
            content: [{
              type: "text",
              text: notes.length
                ? notes.map((n) => `#${n.id}: ${n.text}`).join("\n")
                : "No notes"
            }],
            details: { notes: [...notes], nextId },
          };

        case "add":
          if (!params.text) {
            return {
              content: [{ type: "text", text: "Error: text required" }],
              details: { notes: [...notes], nextId, error: "text required" },
            };
          }
          const note: Note = { id: nextId++, text: params.text, timestamp: Date.now() };
          notes.push(note);
          return {
            content: [{ type: "text", text: `Added note #${note.id}` }],
            details: { notes: [...notes], nextId },
          };

        case "delete":
          if (params.id === undefined) {
            return {
              content: [{ type: "text", text: "Error: id required" }],
              details: { notes: [...notes], nextId, error: "id required" },
            };
          }
          const idx = notes.findIndex((n) => n.id === params.id);
          if (idx === -1) {
            return {
              content: [{ type: "text", text: `Note #${params.id} not found` }],
              details: { notes: [...notes], nextId, error: "not found" },
            };
          }
          notes.splice(idx, 1);
          return {
            content: [{ type: "text", text: `Deleted note #${params.id}` }],
            details: { notes: [...notes], nextId },
          };
      }
    },
  });
}
```

### Pattern 4: Permission Gate

Block or confirm dangerous operations.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+[/~]/,
  /rm\s+-r\s+[/~]/,
  /sudo\s+/,
  />\s*\/dev\/sd/,
  /mkfs\./,
  /dd\s+if=/,
];

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = event.input.command;
    const isDangerous = DANGEROUS_PATTERNS.some((p) => p.test(command));

    if (isDangerous) {
      const confirmed = await ctx.ui.confirm(
        "Dangerous Command",
        `The following command may be dangerous:\n\n${command}\n\nAllow execution?`
      );
      if (!confirmed) {
        return { block: true, reason: "Blocked by user" };
      }
    }
  });
}
```

### Pattern 5: Tool Result Modification

Modify tool results before they're sent to the LLM.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName === "read") {
      // Add line count metadata
      const text = event.content[0]?.text || "";
      const lineCount = text.split("\n").length;

      return {
        content: event.content,
        details: { ...event.details, lineCount },
        isError: event.isError,
      };
    }
  });
}
```

### Pattern 6: Custom Command

Add a command users can invoke with `/name`.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("stats", {
    description: "Show session statistics",
    handler: async (args, ctx) => {
      const entries = ctx.sessionManager.getEntries();
      const messages = entries.filter((e) => e.type === "message");
      const userMessages = messages.filter((e) => e.message.role === "user");
      const assistantMessages = messages.filter((e) => e.message.role === "assistant");
      const toolResults = messages.filter((e) => e.message.role === "toolResult");

      ctx.ui.notify(
        `Session stats:\n` +
        `  Total entries: ${entries.length}\n` +
        `  User messages: ${userMessages.length}\n` +
        `  Assistant messages: ${assistantMessages.length}\n` +
        `  Tool results: ${toolResults.length}`,
        "info"
      );
    },
  });

  // Command with argument completion
  pi.registerCommand("goto", {
    description: "Jump to a labeled entry",
    getArgumentCompletions: (prefix) => {
      const entries = pi.sessionManager.getEntries();
      const labels = entries
        .map((e) => pi.sessionManager.getLabel(e.id))
        .filter(Boolean)
        .filter((l) => l.startsWith(prefix));
      return labels.map((l) => ({ value: l, label: l }));
    },
    handler: async (args, ctx) => {
      // Navigate to labeled entry
      ctx.ui.notify(`Navigating to: ${args}`, "info");
    },
  });
}
```

### Pattern 7: Custom Shortcut

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let planMode = false;

  pi.registerShortcut("ctrl+shift+p", {
    description: "Toggle plan mode",
    handler: async (ctx) => {
      planMode = !planMode;
      ctx.ui.setStatus("plan-mode", planMode ? "PLAN MODE" : undefined);
      ctx.ui.notify(planMode ? "Plan mode enabled" : "Plan mode disabled", "info");
    },
  });
}
```

### Pattern 8: System Prompt Modification

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const rules = `
## Additional Rules
- Always explain your reasoning before taking actions
- Ask for confirmation before making destructive changes
- Prefer simple solutions over complex ones
`;
    return {
      systemPrompt: event.systemPrompt + "\n" + rules,
    };
  });
}
```

### Pattern 9: Input Transformation

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("input", async (event, ctx) => {
    // Quick commands
    if (event.text.startsWith("?")) {
      return {
        action: "transform",
        text: `Respond briefly and concisely: ${event.text.slice(1)}`,
      };
    }

    // Handle special command
    if (event.text === "ping") {
      ctx.ui.notify("pong", "info");
      return { action: "handled" };
    }

    return { action: "continue" };
  });
}
```

### Pattern 10: Custom UI Component

```typescript
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

class FilePickerComponent {
  private files: string[];
  private selected = 0;
  private theme: Theme;
  private onSelect: (file: string) => void;
  private onCancel: () => void;

  constructor(files: string[], theme: Theme, onSelect: (file: string) => void, onCancel: () => void) {
    this.files = files;
    this.theme = theme;
    this.onSelect = onSelect;
    this.onCancel = onCancel;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "up")) {
      this.selected = Math.max(0, this.selected - 1);
    } else if (matchesKey(data, "down")) {
      this.selected = Math.min(this.files.length - 1, this.selected + 1);
    } else if (matchesKey(data, "enter")) {
      this.onSelect(this.files[this.selected]);
    } else if (matchesKey(data, "escape")) {
      this.onCancel();
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    lines.push(this.theme.fg("accent", " Select a file "));
    lines.push(this.theme.fg("dim", "─".repeat(width)));

    for (let i = 0; i < this.files.length; i++) {
      const file = this.files[i];
      const prefix = i === this.selected ? this.theme.fg("accent", "> ") : "  ";
      const text = i === this.selected ? this.theme.bold(file) : file;
      lines.push(truncateToWidth(prefix + text, width));
    }

    lines.push("");
    lines.push(this.theme.fg("dim", "↑/↓ to navigate, Enter to select, Escape to cancel"));
    return lines;
  }

  invalidate(): void {}
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("pick", {
    description: "Pick a file",
    handler: async (args, ctx) => {
      const files = ["file1.ts", "file2.ts", "file3.ts"];

      const selected = await ctx.ui.custom<string | null>((tui, theme, kb, done) => {
        return new FilePickerComponent(
          files,
          theme,
          (file) => done(file),
          () => done(null)
        );
      });

      if (selected) {
        ctx.ui.notify(`Selected: ${selected}`, "info");
      }
    },
  });
}
```

## Directory Extension Structure

For larger extensions, use a directory:

```
~/.pi/agent/extensions/
└── my-extension/
    ├── index.ts        # Entry point
    ├── tools/
    │   ├── deploy.ts
    │   └── monitor.ts
    ├── events/
    │   └── gates.ts
    └── ui/
        └── picker.ts
```

**index.ts:**
```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerDeployTool } from "./tools/deploy.js";
import { registerMonitorTool } from "./tools/monitor.js";
import { registerGates } from "./events/gates.js";

export default function (pi: ExtensionAPI) {
  registerDeployTool(pi);
  registerMonitorTool(pi);
  registerGates(pi);
}
```

## Extension with Dependencies

For extensions needing npm packages:

```
~/.pi/agent/extensions/
└── my-extension/
    ├── package.json
    ├── package-lock.json
    ├── node_modules/
    └── src/
        └── index.ts
```

**package.json:**
```json
{
  "name": "my-extension",
  "dependencies": {
    "axios": "^1.0.0"
  },
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

Run `npm install` in the extension directory.

## Best Practices

1. **Always use StringEnum** for enums to ensure Google API compatibility
2. **Store state in tool details** for proper branching support
3. **Truncate tool output** to prevent context overflow
4. **Check ctx.hasUI** before using UI methods in non-interactive modes
5. **Use signal.aborted** to handle cancellation gracefully
6. **Call invalidate()** when caching render output and state changes
7. **Reconstruct state on all session events** (start, switch, fork, tree)
8. **Provide custom renderers** for better tool output display
9. **Mind the `execute` parameter order**: `(toolCallId, params, signal, onUpdate, ctx)` — `signal` comes before `onUpdate`
10. **Never use inline `await import()`** and prefer `pi.exec(...)` over spawning shells directly
