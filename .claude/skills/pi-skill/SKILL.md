---
name: pi-skill
description: This skill should be used when the user asks about "pi coding agent", "pi extensions", "create pi extension", "pi-ai package", "pi-agent package", "pi-tui package", "pi-mono", "register tool in pi", "pi custom tool", "pi event handlers", "pi session management", "mom slack bot", "pi web-ui", "pi pods", or needs guidance on building extensions, custom tools, event handling, UI components, or LLM integration for the pi ecosystem.
version: 0.1.0
---

# Pi Ecosystem Reference

This skill provides comprehensive documentation for the pi-mono repository - a unified toolkit for building AI agents with extensibility as a core design principle.

## Overview

Pi-mono is organized as a monorepo containing 7 packages:

| Package | Purpose | npm |
|---------|---------|-----|
| **coding-agent** | Main CLI tool (pi) with interactive mode, extensions, sessions | `@mariozechner/pi-coding-agent` |
| **ai** | Unified LLM API supporting 25+ providers | `@mariozechner/pi-ai` |
| **agent** | Stateful agent runtime with tool execution | `@mariozechner/pi-agent` |
| **tui** | Terminal UI framework with differential rendering | `@mariozechner/pi-tui` |
| **web-ui** | Browser chat components with artifacts | `@mariozechner/pi-web-ui` |
| **mom** | Self-managing Slack bot | `@mariozechner/pi-mom` |
| **pods** | GPU pod management for vLLM | `@mariozechner/pi` |

## Package Dependency Graph

```
┌─────────┐
│   ai    │ ← Foundation (all others depend on this)
└─────────┘
    ↑
    ├── agent (ai, tui)
    ├── coding-agent (ai, agent, tui)
    ├── mom (ai, agent, coding-agent)
    ├── web-ui (ai peer dep)
    └── pods (agent)
```

## Core Philosophy

Pi is aggressively extensible - keep the core minimal while enabling everything via extensions, skills, or packages:

- **No MCP** - Build CLI tools with READMEs, or add MCP via extension
- **No sub-agents** - Build your own spawning logic with extensions
- **No permission popups** - Build confirmation flows matching your security requirements
- **No plan mode** - Write plans to files, or build it with extensions
- **No built-in todos** - Use TODO.md or build with extensions
- **No background bash** - Use tmux for full observability

## Quick Reference: Creating Extensions

Extensions are TypeScript modules that extend pi. Place in `~/.pi/agent/extensions/` (global) or `.pi/extensions/` (project-local).

### Minimal Extension

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  // Register custom tool
  pi.registerTool({
    name: "my_tool",
    label: "My Tool",
    description: "What this tool does",
    parameters: Type.Object({
      text: Type.String({ description: "Input text" }),
    }),
    async execute(toolCallId, params, onUpdate, ctx, signal) {
      return {
        content: [{ type: "text", text: `Result: ${params.text}` }],
        details: { processed: true },
      };
    },
  });

  // Subscribe to events
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });

  // Register command
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello ${args || "world"}!`, "info");
    },
  });
}
```

### Key Extension APIs

**Registration:**
- `pi.registerTool(def)` - Custom tool for LLM
- `pi.registerCommand(name, opts)` - `/name` command
- `pi.registerShortcut(key, opts)` - Keyboard shortcut
- `pi.registerFlag(name, opts)` - CLI flag
- `pi.registerProvider(name, config)` - Custom LLM provider

**Message Control:**
- `pi.sendMessage(msg, opts)` - Inject custom message
- `pi.sendUserMessage(content, opts)` - Send as user
- `pi.appendEntry(type, data)` - Persist state outside LLM context

**Session:**
- `pi.setSessionName(name)` / `pi.getSessionName()`
- `pi.setLabel(entryId, label)` - Bookmark entries

**Tools:**
- `pi.getActiveTools()` / `pi.setActiveTools(names)`
- `pi.getAllTools()` - List all available tools

**Model:**
- `pi.setModel(model)` - Switch model
- `pi.getThinkingLevel()` / `pi.setThinkingLevel(level)`

### Key Events

| Event | When | Can Return |
|-------|------|------------|
| `session_start` | Initial load | - |
| `before_agent_start` | Before LLM call | `{ message, systemPrompt }` |
| `tool_call` | Before tool executes | `{ block: true, reason }` |
| `tool_result` | After tool executes | `{ content, details, isError }` |
| `context` | Before each LLM call | `{ messages }` (pruned) |
| `input` | Raw user input | `{ action: "transform" | "handled" | "continue" }` |

### Context Methods (ctx)

```typescript
ctx.ui.select(title, options)      // Selection dialog
ctx.ui.confirm(title, message)     // Confirm dialog
ctx.ui.input(prompt, placeholder)  // Text input
ctx.ui.editor(title, prefilled)    // Multi-line editor
ctx.ui.notify(message, level)      // Notification
ctx.ui.setStatus(key, text)        // Footer status
ctx.ui.setWidget(key, lines)       // Widget above/below editor
ctx.ui.custom((tui, theme, kb, done) => component)  // Custom UI

ctx.sessionManager.getBranch()     // Current branch entries
ctx.sessionManager.getLeafId()     // Current leaf entry ID
ctx.isIdle()                       // Agent status
ctx.abort()                        // Abort agent
ctx.shutdown()                     // Request graceful exit
ctx.compact(options)               // Trigger compaction
```

## Important Patterns

### State Persistence via Tool Details

Store state in tool result `details` for proper branching support:

```typescript
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.toolName === "my_tool") {
      // Reconstruct state from entry.message.details
    }
  }
});
```

### StringEnum for Google Compatibility

Use `StringEnum` from `@mariozechner/pi-ai` instead of `Type.Union`:

```typescript
import { StringEnum } from "@mariozechner/pi-ai";

// Good - works with Google API
action: StringEnum(["list", "add"] as const)

// Bad - doesn't work with Google
action: Type.Union([Type.Literal("list"), Type.Literal("add")])
```

### Output Truncation

Tools must truncate output to avoid overwhelming context (50KB / 2000 lines max):

```typescript
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@mariozechner/pi-coding-agent";

const truncation = truncateHead(output, {
  maxLines: DEFAULT_MAX_LINES,
  maxBytes: DEFAULT_MAX_BYTES,
});
```

## Additional Resources

### Reference Files

For detailed package documentation, consult:

- **`references/coding-agent.md`** - Complete extension API, events, UI components
- **`references/ai-package.md`** - LLM abstraction, providers, streaming, tools
- **`references/agent-package.md`** - Agent runtime, tool execution, events
- **`references/tui-package.md`** - Terminal UI components, overlays, rendering
- **`references/auxiliary-packages.md`** - web-ui, mom, pods packages

### Example Extensions

Working examples are in `packages/coding-agent/examples/extensions/`:

| Example | Purpose |
|---------|---------|
| `hello.ts` | Minimal tool registration |
| `todo.ts` | Stateful tool with persistence |
| `permission-gate.ts` | Block dangerous commands |
| `custom-compaction.ts` | Custom summarization |
| `plan-mode/` | Full plan mode implementation |
| `ssh.ts` | Remote execution via SSH |
| `doom-overlay/` | Game in overlay (yes, DOOM runs!) |

## Development Commands

```bash
npm install          # Install all dependencies
npm run build        # Build all packages
npm run check        # Type check + lint
./pi-test.sh         # Run pi from source
```

## Key Coding Conventions

- No `any` types unless absolutely necessary
- Never use inline imports (`await import()`)
- Never use `git add .` or `git add -A` - list specific files
- Always include `Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>` in commits
- Changelog entries go under `## [Unreleased]` section
