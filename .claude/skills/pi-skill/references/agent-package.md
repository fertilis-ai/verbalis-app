# Pi Agent Core Package Reference

`@earendil-works/pi-agent-core` (monorepo dir `packages/agent`) — a general-purpose agent runtime providing the agent loop, **transport abstraction**, state management, and **attachment support**. It sits above `@earendil-works/pi-ai` and below `@earendil-works/pi-coding-agent`.

```bash
npm install @earendil-works/pi-agent-core @earendil-works/pi-ai
```

Exports the main entry (`.`) and a Node entry (`./node`).

## When to use this vs. the SDK

Most embedding use cases should use the **coding-agent SDK** (`createAgentSession` from `@earendil-works/pi-coding-agent`), which wraps this runtime with sessions, extensions, built-in tools, compaction, and TUI rendering. See `sdk-and-modes.md` — that is the supported, documented embedding surface.

Reach for `pi-agent-core` directly only when you need the bare agent loop without the coding-agent's filesystem tools and session machinery (e.g. a custom non-coding agent, a different transport, or a browser/server host).

> The low-level `pi-agent-core` API is not covered by the public docs pages; verify exact signatures against the package's own TypeScript types before relying on them. The shapes below describe the stable concepts.

## Core Concepts

- **Agent loop** — drives turns: user/assistant messages, tool calls, tool results, until the model stops.
- **State** — system prompt, current model, thinking level, registered tools, and the message list.
- **Transport abstraction** — how requests reach the provider (direct, proxied, cached, websocket/SSE). This is the main addition over the old `pi-agent` package.
- **Attachments** — first-class file/image attachment handling on messages.
- **Message queue** — `steer` (interrupt the current stream) vs. `followUp` (run after the current turn), each with `one-at-a-time` or `all` modes.

## Tools

Agent tools share the coding-agent tool shape. Note the `execute` parameter order matches the extension API: `(toolCallId, params, signal, onUpdate, ctx?)`.

```typescript
import { Type } from "@earendil-works/pi-ai";

const readFileTool = {
  name: "read_file",
  label: "Read File",
  description: "Read the contents of a file",
  parameters: Type.Object({ path: Type.String({ description: "Path to the file" }) }),
  async execute(toolCallId, params, signal, onUpdate) {
    const content = await fs.promises.readFile(params.path, "utf-8");
    return { content: [{ type: "text", text: content }], details: { size: content.length } };
  },
};
```

## Events

The runtime emits the same lifecycle events surfaced by the SDK and JSON/RPC modes:

`agent_start`, `agent_end`, `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, plus queue/compaction/retry events (`queue_update`, `compaction_start`/`compaction_end`, `auto_retry_start`/`auto_retry_end`).

```typescript
const unsubscribe = agent.subscribe((event) => {
  if (event.type === "message_update") {
    for (const block of event.message.content) {
      if (block.type === "text") process.stdout.write(block.text);
    }
  }
});
```

Event flow for a tool-using prompt:

```
agent_start
  turn_start → message_start(user) → message_end(user)
  message_start(assistant) → message_update… → message_end(assistant, with toolCall)
  tool_execution_start → tool_execution_update… → tool_execution_end
  message_start(toolResult) → message_end(toolResult) → turn_end
  turn_start → message_start(assistant) → message_update… → message_end → turn_end
agent_end
```

## Message Types

```typescript
type AgentMessage =
  | UserMessage        // { role: "user", content, timestamp, attachments? }
  | AssistantMessage   // { role: "assistant", content, usage, stopReason, timestamp, api, provider, model }
  | ToolResultMessage  // { role: "toolResult", toolCallId, toolName, content, isError, timestamp }
  | BashExecutionMessage; // { role: "bashExecution", command, output, exitCode, cancelled, truncated, timestamp }
```

Custom message types can be added via declaration merging on `CustomAgentMessages` and filtered out before the LLM sees them (the host decides how custom roles convert to provider messages).

## Relationship to coding-agent

The coding-agent builds on this runtime and adds: JSONL session persistence with tree structure, the extension event system, TUI rendering, the built-in tools (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`), and compaction. Inside an extension, the `turn_end`/`tool_execution_*`/`message_*` events you subscribe to are the coding-agent's surfacing of this runtime's events.
