# Pi SDK, RPC & JSON Modes, Session Format

Programmatic embedding and process-integration surfaces of `@earendil-works/pi-coding-agent`.

## SDK — `createAgentSession`

Embed a full coding agent (built-in tools, extensions, sessions, compaction) in a Node program.

```typescript
import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  DefaultResourceLoader,
  createAgentSession,
  defineTool,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),     // or .create(cwd) / .continueRecent(cwd) / .open(file)
});

await session.prompt("What files are in the current directory?");
```

### CreateAgentSessionOptions

```typescript
interface CreateAgentSessionOptions {
  cwd?: string;
  agentDir?: string;                 // default getAgentDir() → ~/.pi/agent
  model?: Model;
  thinkingLevel?: ThinkingLevel;
  scopedModels?: Array<{ model: Model; thinkingLevel: ThinkingLevel }>;
  tools?: string[];                  // restrict built-in tools
  noTools?: "all" | "builtin";
  excludeTools?: string[];
  customTools?: ToolDefinition[];    // built with defineTool(...)
  authStorage?: AuthStorage;
  modelRegistry?: ModelRegistry;
  sessionManager?: SessionManager;
  settingsManager?: SettingsManager;
  resourceLoader?: ResourceLoader;   // e.g. new DefaultResourceLoader(...)
}
```

### AgentSession

```typescript
interface AgentSession {
  prompt(text: string, options?: PromptOptions): Promise<void>;
  steer(text: string): Promise<void>;
  followUp(text: string): Promise<void>;
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;

  sessionFile: string | undefined;
  sessionId: string;

  setModel(model: Model): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): void;
  cycleModel(): Promise<ModelCycleResult | undefined>;
  cycleThinkingLevel(): ThinkingLevel | undefined;

  agent: Agent;
  model: Model | undefined;
  thinkingLevel: ThinkingLevel;
  messages: AgentMessage[];
  isStreaming: boolean;

  navigateTree(targetId: string, options?: NavigateTreeOptions): Promise<{ editorText?: string; cancelled: boolean }>;
  compact(customInstructions?: string): Promise<CompactionResult>;
  abortCompaction(): void;
  abort(): Promise<void>;
  dispose(): void;
}

interface PromptOptions {
  expandPromptTemplates?: boolean;
  images?: ImageContent[];
  streamingBehavior?: "steer" | "followUp";
  source?: InputSource;
  preflightResult?: (success: boolean) => void;
}
```

### Supporting classes

```typescript
class SessionManager {
  static inMemory(cwd?: string): SessionManager;
  static create(cwd: string): SessionManager;
  static continueRecent(cwd: string): SessionManager;
  static open(filePath: string): SessionManager;
  static list(cwd: string): Promise<SessionInfo[]>;
  static listAll(cwd: string): Promise<SessionInfo[]>;
}

class AuthStorage {
  static create(authPath?: string): AuthStorage;
  setRuntimeApiKey(provider: string, key: string): void;
}

class ModelRegistry {
  static create(authStorage: AuthStorage, modelsPath?: string): ModelRegistry;
  static inMemory(authStorage: AuthStorage): ModelRegistry;
  find(provider: string, id: string): Model | undefined;
  getAvailable(): Promise<Model[]>;
}

function defineTool(config: {
  name: string; label: string; description: string;
  parameters: TSchema;
  execute: (toolCallId: string, params: unknown) => Promise<ToolResult>;
}): ToolDefinition;
```

### Subscribe event types

`message_update`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `message_start`, `message_end`, `agent_start`, `agent_end`, `turn_start`, `turn_end`, `queue_update`, `compaction_start`, `compaction_end`, `auto_retry_start`, `auto_retry_end`.

### Runtime API (multi-session host)

For hosts that switch/fork sessions at runtime:

```typescript
const runtime = await createAgentSessionRuntime(factory, { cwd, agentDir, sessionManager });
runtime.session; runtime.services; runtime.diagnostics;
await runtime.newSession();
await runtime.switchSession(filePath);
await runtime.fork(entryId, options);
await runtime.importFromJsonl(content);
```

## JSON Event Stream Mode

```bash
pi --mode json "Your prompt"
```

Emits a session header line, then one JSON object per line for each event. Filter with `jq`:

```bash
pi --mode json "List files" 2>/dev/null | jq -c 'select(.type == "message_end")'
```

```jsonc
{"type":"session","version":3,"id":"uuid","timestamp":"…","cwd":"/path"}
{"type":"agent_start"}
{"type":"turn_start"}
{"type":"message_start","message":{"role":"assistant","content":[],…}}
{"type":"message_update","message":{…},"assistantMessageEvent":{"type":"text_delta","delta":"Hello"}}
{"type":"message_end","message":{…}}
{"type":"turn_end","message":{…},"toolResults":[]}
{"type":"agent_end","messages":[…]}
```

`AgentSessionEvent` = the `AgentEvent` union (lifecycle/turn/message/tool events above) plus `queue_update`, `compaction_start`/`compaction_end` (`reason: "manual"|"threshold"|"overflow"`), and `auto_retry_start`/`auto_retry_end`.

## RPC Mode

```bash
pi --mode rpc [--provider … --model … --name … --no-session --session-dir …]
```

Strict JSONL over stdin/stdout (LF-delimited). Send command objects (one per line) to stdin; receive `{ "type": "response" }` results and streamed event lines on stdout.

**Commands** by group:
- *Prompting:* `prompt`, `steer`, `follow_up`, `abort`
- *State:* `get_state`, `get_messages`, `get_session_stats`, `get_last_assistant_text`, `get_commands`
- *Model:* `set_model`, `cycle_model`, `get_available_models`
- *Thinking:* `set_thinking_level` (`off|minimal|low|medium|high|xhigh`), `cycle_thinking_level`
- *Queue:* `set_steering_mode` / `set_follow_up_mode` (`all|one-at-a-time`)
- *Session:* `new_session`, `switch_session`, `fork`, `clone`, `get_fork_messages`, `set_session_name`
- *Other:* `bash`, `compact`, `set_auto_compaction`, `set_auto_retry`, `abort_retry`, `export_html`

**Event types** (stdout): `agent_start`, `agent_end`, `turn_start`, `turn_end`, `message_start`, `message_end`, `message_update`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `queue_update`, `compaction_start`, `compaction_end`, `auto_retry_start`, `auto_retry_end`, `extension_error`.

**Message shapes:** `UserMessage`, `AssistantMessage` (`{ …, api, provider, model, usage, stopReason }`), `ToolResultMessage`, `BashExecutionMessage` (`{ command, output, exitCode, cancelled, truncated, fullOutputPath }`).

## Session File Format

Location: `~/.pi/agent/sessions/--<path>--/<timestamp>_<uuid>.jsonl` (`<path>` = cwd with `/`→`-`). JSONL: first line is the header; subsequent lines are entries forming a tree via `id`/`parentId`.

```jsonc
// header (version 3); parentSession present when this session was forked from another file
{"type":"session","version":3,"id":"uuid","timestamp":"2024-12-03T14:00:00.000Z","cwd":"/path","parentSession":"…"}

// entry base: { type, id, parentId: string|null, timestamp }
{"type":"message","id":"a1","parentId":"p0","timestamp":"…","message":{"role":"user","content":"Hello"}}
{"type":"model_change","id":"d4","parentId":"c3","timestamp":"…","provider":"openai","modelId":"gpt-4o"}
{"type":"thinking_level_change","id":"e5","parentId":"d4","timestamp":"…","thinkingLevel":"high"}
{"type":"compaction","id":"f6","parentId":"e5","timestamp":"…","summary":"…","firstKeptEntryId":"c3","tokensBefore":50000}
{"type":"branch_summary","id":"g7","parentId":"a1","timestamp":"…","fromId":"f6","summary":"…"}
{"type":"custom","id":"h8","parentId":"g7","timestamp":"…","customType":"my-ext","data":{"count":42}}
{"type":"custom_message","id":"i9","parentId":"h8","timestamp":"…","customType":"my-ext","content":"…","display":true}
{"type":"label","id":"j0","parentId":"i9","timestamp":"…","targetId":"a1","label":"checkpoint-1"}
{"type":"session_info","id":"k1","parentId":"j0","timestamp":"…","name":"Refactor auth module"}
```

Entry types: `session` (header), `message`, `model_change`, `thinking_level_change`, `compaction`, `branch_summary`, `custom`, `custom_message`, `label`, `session_info`.
