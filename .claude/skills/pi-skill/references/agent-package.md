# Pi Agent Package Reference

Complete reference for `@mariozechner/pi-agent` - stateful agent runtime with tool execution.

## Installation

```bash
npm install @mariozechner/pi-agent @mariozechner/pi-ai
```

## Quick Start

```typescript
import { Agent, AgentTool, AgentEvent } from '@mariozechner/pi-agent';
import { getModel, complete, stream } from '@mariozechner/pi-ai';
import { Type } from '@sinclair/typebox';

const model = getModel('openai', 'gpt-4o-mini');

const readFileTool: AgentTool = {
  name: 'read_file',
  label: 'Read File',
  description: 'Read the contents of a file',
  parameters: Type.Object({
    path: Type.String({ description: 'Path to the file' })
  }),
  async execute(toolCallId, params, signal, onUpdate) {
    const content = await fs.promises.readFile(params.path, 'utf-8');
    return {
      content: [{ type: 'text', text: content }],
      details: { path: params.path, size: content.length }
    };
  }
};

const agent = new Agent({
  initialState: {
    systemPrompt: 'You are a helpful assistant with file access.',
    model,
    thinkingLevel: 'off',
    tools: [readFileTool],
    messages: []
  },
  convertToLlm: (messages) => messages.map(m => {
    // Convert agent messages to pi-ai messages
    return m;
  }),
  steeringMode: 'one-at-a-time',
  followUpMode: 'one-at-a-time'
});

// Subscribe to events
const unsubscribe = agent.subscribe((event: AgentEvent) => {
  console.log(event.type, event);
});

// Send prompt
await agent.prompt('What files are in the current directory?');

// Or with content array
await agent.prompt({
  role: 'user',
  content: [{ type: 'text', text: 'Hello' }],
  timestamp: Date.now()
});
```

## Agent Configuration

```typescript
interface AgentConfig {
  initialState: AgentState;
  convertToLlm: (messages: AgentMessage[]) => Message[];
  transformContext?: (messages: Message[]) => Promise<Message[]>;
  steeringMode?: 'one-at-a-time' | 'all';
  followUpMode?: 'one-at-a-time' | 'all';
  completeFn?: typeof complete;
  streamFn?: typeof stream;
}
```

### steeringMode

How steering messages (interrupts during streaming) are handled:
- `'one-at-a-time'` - Process one steering message per agent run
- `'all'` - Process all queued steering messages

### followUpMode

How follow-up messages (queued for after streaming) are handled:
- `'one-at-a-time'` - Process one follow-up per agent run
- `'all'` - Process all queued follow-ups

### convertToLlm

Required function that converts `AgentMessage[]` to `Message[]` for the LLM.

```typescript
convertToLlm: (messages) => {
  return messages
    .filter(m => m.role !== 'my-custom-type')  // Filter custom types
    .map(m => {
      if (m.role === 'user-with-attachments') {
        // Transform to standard user message with images
        return { role: 'user', content: [...], timestamp: m.timestamp };
      }
      return m;
    });
}
```

### transformContext

Optional async function to modify messages before each LLM call (for pruning, summarization, etc.):

```typescript
transformContext: async (messages) => {
  // Summarize old messages, prune large tool results, etc.
  return messages;
}
```

## Agent State

```typescript
interface AgentState {
  systemPrompt: string;
  model: Model;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool[];
  messages: AgentMessage[];
}

type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
```

### State Access

```typescript
const state = agent.getState();
console.log(state.systemPrompt);
console.log(state.model.id);
console.log(state.messages.length);
```

### State Modification

```typescript
agent.setSystemPrompt('New system prompt');
agent.setModel(newModel);
agent.setThinkingLevel('high');
agent.setTools([...newTools]);
```

## Tool Definition

```typescript
interface AgentTool {
  name: string;
  label?: string;                           // Display name
  description: string;                       // LLM sees this
  parameters: TSchema;                       // TypeBox schema

  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    onUpdate?: (result: ToolResultUpdate) => void
  ): Promise<ToolResult>;

  // Optional: Custom rendering
  renderCall?(args: unknown, theme: Theme): Component;
  renderResult?(result: ToolResult, options: RenderOptions, theme: Theme): Component;
}

interface ToolResult {
  content: ContentBlock[];        // Sent to LLM
  details?: Record<string, any>;  // For rendering & persistence
}

interface ToolResultUpdate {
  content?: ContentBlock[];
  details?: Record<string, any>;
}
```

### Tool Execution Pattern

```typescript
async execute(toolCallId, params, signal, onUpdate) {
  // Stream progress updates
  onUpdate?.({
    content: [{ type: 'text', text: 'Starting...' }],
    details: { progress: 0 }
  });

  // Check for cancellation
  if (signal?.aborted) {
    return {
      content: [{ type: 'text', text: 'Cancelled' }],
      details: { cancelled: true }
    };
  }

  // Do work...
  const result = await someAsyncOperation();

  // Stream more progress
  onUpdate?.({
    content: [{ type: 'text', text: 'Processing...' }],
    details: { progress: 50 }
  });

  // Return final result
  return {
    content: [{ type: 'text', text: `Result: ${result}` }],
    details: { data: result, timestamp: Date.now() }
  };
}
```

## Agent Events

```typescript
type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end' }
  | { type: 'turn_start'; turnIndex: number }
  | { type: 'turn_end'; turnIndex: number }
  | { type: 'message_start'; message: AgentMessage; index: number }
  | { type: 'message_update'; message: AgentMessage; index: number }
  | { type: 'message_end'; message: AgentMessage; index: number }
  | { type: 'tool_execution_start'; toolCalls: ToolCall[] }
  | { type: 'tool_execution_update'; toolCallId: string; update: ToolResultUpdate }
  | { type: 'tool_execution_end'; results: Map<string, ToolResult> };
```

### Event Flow Example

For a prompt that triggers a tool call:

```
agent_start
├─ turn_start (0)
├─ message_start (user)
├─ message_end (user)
├─ message_start (assistant)
├─ message_update... (streaming)
├─ message_end (assistant with tool call)
├─ tool_execution_start
├─ tool_execution_update... (progress)
├─ tool_execution_end
├─ message_start (toolResult)
├─ message_end (toolResult)
├─ turn_end (0)
├─ turn_start (1)
├─ message_start (assistant)
├─ message_update... (streaming)
├─ message_end (assistant)
├─ turn_end (1)
└─ agent_end
```

### Subscribing to Events

```typescript
const unsubscribe = agent.subscribe((event) => {
  switch (event.type) {
    case 'agent_start':
      console.log('Agent started');
      break;

    case 'turn_start':
      console.log(`Turn ${event.turnIndex} started`);
      break;

    case 'message_update':
      // Streaming update
      const content = event.message.content;
      for (const block of content) {
        if (block.type === 'text') {
          process.stdout.write(block.text);
        }
      }
      break;

    case 'tool_execution_start':
      for (const tc of event.toolCalls) {
        console.log(`Executing: ${tc.name}`);
      }
      break;

    case 'tool_execution_end':
      for (const [id, result] of event.results) {
        console.log(`Tool ${id} completed`);
      }
      break;

    case 'agent_end':
      console.log('Agent finished');
      break;
  }
});

// Clean up
unsubscribe();
```

## Message Types

### Built-in Message Types

```typescript
type AgentMessage =
  | UserMessage           // { role: 'user', content, timestamp }
  | AssistantMessage      // { role: 'assistant', content, usage, stopReason, timestamp }
  | ToolResultMessage     // { role: 'toolResult', toolCallId, toolName, content, isError, timestamp }
  | CustomAgentMessages[keyof CustomAgentMessages];
```

### Custom Message Types

Extend via declaration merging:

```typescript
// Define your custom message type
interface SystemNotification {
  role: 'system-notification';
  message: string;
  level: 'info' | 'warning' | 'error';
  timestamp: number;
}

// Register via declaration merging
declare module '@mariozechner/pi-agent' {
  interface CustomAgentMessages {
    'system-notification': SystemNotification;
  }
}

// Type guard
function isSystemNotification(msg: AgentMessage): msg is SystemNotification {
  return msg.role === 'system-notification';
}

// Filter in convertToLlm
convertToLlm: (messages) => {
  return messages.filter(m => !isSystemNotification(m)) as Message[];
}

// Queue custom message
agent.queueMessage({
  role: 'system-notification',
  message: 'System update',
  level: 'info',
  timestamp: Date.now()
}, 'steer');
```

## Prompt Methods

### Basic Prompt

```typescript
// String prompt
await agent.prompt('What is 2+2?');

// Message object
await agent.prompt({
  role: 'user',
  content: [{ type: 'text', text: 'Hello' }],
  timestamp: Date.now()
});

// With images
await agent.prompt({
  role: 'user',
  content: [
    { type: 'text', text: 'What is this?' },
    { type: 'image', data: base64, mimeType: 'image/png' }
  ],
  timestamp: Date.now()
});
```

### Queue Message

```typescript
// Queue for steering (interrupts current streaming)
agent.queueMessage(message, 'steer');

// Queue for follow-up (after agent finishes)
agent.queueMessage(message, 'followUp');
```

## Control Methods

### Abort

```typescript
agent.abort();  // Stops current streaming and tool execution
```

### Check Status

```typescript
agent.isStreaming();  // Currently processing
agent.isIdle();       // Not processing
```

### Wait for Idle

```typescript
await agent.waitForIdle();
// Agent is now idle
```

### Pending Messages

```typescript
agent.hasPendingMessages();  // Has queued messages
```

## Running Multiple Agents

```typescript
const agent1 = new Agent({ ... });
const agent2 = new Agent({ ... });

// Run concurrently
await Promise.all([
  agent1.prompt('Task 1'),
  agent2.prompt('Task 2')
]);

// Or coordinate
await agent1.prompt('Research this topic');
const research = agent1.getState().messages;
await agent2.prompt(`Based on: ${JSON.stringify(research)}, write a summary`);
```

## Custom Stream Function

```typescript
const agent = new Agent({
  ...,
  streamFn: async function* (model, context, options) {
    // Custom streaming logic
    // Could proxy through a backend, add logging, etc.
    yield* originalStream(model, context, options);
  }
});
```

## Error Handling

### Tool Errors

```typescript
async execute(toolCallId, params, signal, onUpdate) {
  try {
    const result = await riskyOperation();
    return { content: [{ type: 'text', text: result }] };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      details: { error: error.message },
      isError: true
    };
  }
}
```

### Agent Errors

```typescript
agent.subscribe((event) => {
  if (event.type === 'message_end' && event.message.role === 'assistant') {
    if (event.message.stopReason === 'error') {
      console.error('LLM error');
    }
  }
});
```

## Context Window Management

```typescript
const agent = new Agent({
  ...,
  transformContext: async (messages) => {
    const tokenCount = estimateTokens(messages);
    const limit = agent.getState().model.contextWindow;

    if (tokenCount > limit * 0.8) {
      // Summarize old messages
      return summarizeMessages(messages);
    }
    return messages;
  }
});
```

## Serialization

```typescript
// Save state
const state = agent.getState();
const serialized = JSON.stringify(state);
localStorage.setItem('agent-state', serialized);

// Restore state
const restored = JSON.parse(localStorage.getItem('agent-state'));
const agent = new Agent({
  initialState: restored,
  ...
});
```

## Integration with pi-coding-agent

The coding-agent wraps pi-agent with:

- Session persistence (JSONL files with tree structure)
- Extension system (hooks for all events)
- TUI rendering
- Tool implementations (read, bash, edit, write, grep, find, ls)
- Compaction handling

```typescript
// In coding-agent extension
pi.on("turn_end", async (event, ctx) => {
  // This wraps the agent's turn_end event
  console.log(`Turn ${event.turnIndex} completed`);
});
```
