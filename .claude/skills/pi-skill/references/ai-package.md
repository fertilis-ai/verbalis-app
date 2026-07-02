# Pi AI Package Reference

Complete reference for `@earendil-works/pi-ai` — unified multi-provider LLM API (the foundation package; binary `pi-ai`). TypeBox's `Type`, `Static`, and `TSchema` are re-exported from this package.

## Installation

```bash
npm install @earendil-works/pi-ai
```

## Quick Start

```typescript
import { Type, getModel, stream, complete, Context, Tool, StringEnum } from '@earendil-works/pi-ai';

const model = getModel('openai', 'gpt-4o-mini');

const tools: Tool[] = [{
  name: 'get_time',
  description: 'Get the current time',
  parameters: Type.Object({
    timezone: Type.Optional(Type.String({ description: 'Optional timezone' }))
  })
}];

const context: Context = {
  systemPrompt: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'What time is it?' }],
  tools
};

// Streaming
const s = stream(model, context);
for await (const event of s) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta);
  }
}
const message = await s.result();
context.messages.push(message);

// Or non-streaming
const response = await complete(model, context);
```

## Supported Providers

### API Key Providers

| Provider | Environment Variable | API |
|----------|---------------------|-----|
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic-messages` |
| OpenAI | `OPENAI_API_KEY` | `openai-responses` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_BASE_URL` | `azure-openai-responses` |
| Google | `GEMINI_API_KEY` | `google-generative-ai` |
| Google Vertex | `GOOGLE_CLOUD_PROJECT` + ADC | `google-vertex` |
| Mistral | `MISTRAL_API_KEY` | `openai-completions` |
| Groq | `GROQ_API_KEY` | `openai-completions` |
| Cerebras | `CEREBRAS_API_KEY` | `openai-completions` |
| xAI | `XAI_API_KEY` | `openai-completions` |
| OpenRouter | `OPENROUTER_API_KEY` | `openai-completions` |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` | `openai-completions` |
| MiniMax | `MINIMAX_API_KEY` | `openai-completions` |
| Kimi For Coding | `KIMI_API_KEY` | `anthropic-messages` |
| Amazon Bedrock | AWS credentials | `bedrock-converse-stream` |

### OAuth Providers

| Provider | Description |
|----------|-------------|
| Anthropic | Claude Pro/Max subscription |
| OpenAI Codex | ChatGPT Plus/Pro subscription |
| GitHub Copilot | Copilot subscription |
| Google Gemini CLI | Free tier or paid subscription |
| Antigravity | Free Gemini 3, Claude, GPT-OSS |

## Model Object

```typescript
interface Model<Api> {
  id: string;                    // HF model ID or custom
  name: string;                  // Display name
  api: Api;                      // API type
  provider: string;              // Provider name
  baseUrl?: string;              // Custom endpoint
  contextWindow: number;         // Total tokens
  maxTokens: number;             // Max output tokens
  reasoning?: boolean;           // Supports thinking/reasoning
  input: ("text" | "image")[];   // Capabilities
  cost: {
    input: number;               // Per million tokens
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  headers?: Record<string, string>;  // Custom headers
  compat?: CompatSettings;       // OpenAI compatibility
}
```

## Querying Models

```typescript
import { getProviders, getModels, getModel } from '@earendil-works/pi-ai';

const providers = getProviders();  // ['openai', 'anthropic', ...]
const models = getModels('anthropic');
const model = getModel('openai', 'gpt-4o-mini');

// Check capabilities
if (model.input.includes('image')) console.log('Supports vision');
if (model.reasoning) console.log('Supports thinking');
```

## Context & Messages

```typescript
interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
}

// Message types
type Message = UserMessage | AssistantMessage | ToolResultMessage;

interface UserMessage {
  role: 'user';
  content: string | ContentBlock[];
  timestamp: number;
}

interface AssistantMessage {
  role: 'assistant';
  content: ContentBlock[];  // text, toolCall, thinking
  usage: TokenUsage;
  stopReason: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';
  timestamp: number;
}

interface ToolResultMessage {
  role: 'toolResult';
  toolCallId: string;
  toolName: string;
  content: ContentBlock[];  // text, image
  isError: boolean;
  timestamp: number;
}
```

## Streaming Events

```typescript
const s = stream(model, context);

for await (const event of s) {
  switch (event.type) {
    case 'start':
      console.log(`Starting with ${event.partial.model}`);
      break;
    case 'text_start':
      console.log('[Text started]');
      break;
    case 'text_delta':
      process.stdout.write(event.delta);
      break;
    case 'text_end':
      console.log('[Text ended]');
      break;
    case 'thinking_start':
      console.log('[Thinking...]');
      break;
    case 'thinking_delta':
      process.stdout.write(event.delta);
      break;
    case 'thinking_end':
      console.log('[Thinking complete]');
      break;
    case 'toolcall_start':
      console.log(`[Tool call started]`);
      break;
    case 'toolcall_delta':
      // Partial arguments being streamed
      const partial = event.partial.content[event.contentIndex];
      break;
    case 'toolcall_end':
      console.log(`Tool: ${event.toolCall.name}(${JSON.stringify(event.toolCall.arguments)})`);
      break;
    case 'done':
      console.log(`Finished: ${event.reason}`);
      break;
    case 'error':
      console.error(`Error: ${event.error}`);
      break;
  }
}

const finalMessage = await s.result();
```

## Tool Definition

```typescript
import { Type, Tool, StringEnum } from '@earendil-works/pi-ai';

const weatherTool: Tool = {
  name: 'get_weather',
  description: 'Get current weather for a location',
  parameters: Type.Object({
    location: Type.String({ description: 'City name or coordinates' }),
    // Use StringEnum for Google compatibility (not Type.Enum)
    units: StringEnum(['celsius', 'fahrenheit'], { default: 'celsius' })
  })
};
```

## Handling Tool Calls

```typescript
const response = await complete(model, context);

for (const block of response.content) {
  if (block.type === 'toolCall') {
    // Execute tool
    const result = await executeMyTool(block.name, block.arguments);

    // Add tool result
    context.messages.push({
      role: 'toolResult',
      toolCallId: block.id,
      toolName: block.name,
      content: [{ type: 'text', text: JSON.stringify(result) }],
      isError: false,
      timestamp: Date.now()
    });
  }
}

// Continue with tool results
if (response.stopReason === 'toolUse') {
  const continuation = await complete(model, context);
}
```

## Tool Argument Validation

```typescript
import { validateToolCall } from '@earendil-works/pi-ai';

try {
  const validatedArgs = validateToolCall(tools, toolCall);
  const result = await executeMyTool(toolCall.name, validatedArgs);
} catch (error) {
  context.messages.push({
    role: 'toolResult',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: [{ type: 'text', text: error.message }],
    isError: true,
    timestamp: Date.now()
  });
}
```

## Image Input

```typescript
const model = getModel('openai', 'gpt-4o-mini');

if (model.input.includes('image')) {
  const response = await complete(model, {
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        { type: 'image', data: base64Image, mimeType: 'image/png' }
      ]
    }]
  });
}
```

## Thinking/Reasoning

### Unified Interface

```typescript
import { streamSimple, completeSimple } from '@earendil-works/pi-ai';

const response = await completeSimple(model, context, {
  reasoning: 'medium'  // 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
});

for (const block of response.content) {
  if (block.type === 'thinking') {
    console.log('Thinking:', block.thinking);
  } else if (block.type === 'text') {
    console.log('Response:', block.text);
  }
}
```

### Provider-Specific Options

```typescript
// OpenAI
await complete(model, context, {
  reasoningEffort: 'medium',
  reasoningSummary: 'detailed'
});

// Anthropic
await complete(model, context, {
  thinkingEnabled: true,
  thinkingBudgetTokens: 8192
});

// Google
await complete(model, context, {
  thinking: { enabled: true, budgetTokens: 8192 }
});
```

## Stop Reasons

- `"stop"` - Normal completion
- `"length"` - Hit max token limit
- `"toolUse"` - Model calling tools, expects results
- `"error"` - Error occurred
- `"aborted"` - Request cancelled via signal

## Aborting Requests

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 2000);

const s = stream(model, context, { signal: controller.signal });

for await (const event of s) {
  if (event.type === 'error' && event.reason === 'aborted') {
    console.log('Aborted:', event.error.errorMessage);
  }
}

const response = await s.result();
if (response.stopReason === 'aborted') {
  // Partial content in response.content
}
```

## Custom Models

```typescript
// Ollama example
const ollamaModel: Model<'openai-completions'> = {
  id: 'llama-3.1-8b',
  name: 'Llama 3.1 8B (Ollama)',
  api: 'openai-completions',
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 32000
};

const response = await stream(ollamaModel, context, { apiKey: 'dummy' });
```

## OpenAI Compatibility Settings

```typescript
interface OpenAICompletionsCompat {
  supportsStore?: boolean;
  supportsDeveloperRole?: boolean;
  supportsReasoningEffort?: boolean;
  maxTokensField?: 'max_completion_tokens' | 'max_tokens';
  thinkingFormat?: 'openai' | 'zai';
}

const model: Model<'openai-completions'> = {
  // ...
  compat: {
    supportsStore: false,
    maxTokensField: 'max_tokens'
  }
};
```

## Cross-Provider Handoffs

Messages from different providers are automatically transformed:

```typescript
// Start with Claude
const claudeResponse = await complete(claudeModel, context, { thinkingEnabled: true });
context.messages.push(claudeResponse);

// Switch to GPT - thinking blocks converted to <thinking> tags
context.messages.push({ role: 'user', content: 'Is that correct?' });
const gptResponse = await complete(gptModel, context);
context.messages.push(gptResponse);

// Switch to Gemini
context.messages.push({ role: 'user', content: 'Summarize' });
const geminiResponse = await complete(geminiModel, context);
```

## Context Serialization

```typescript
// Serialize entire context
const serialized = JSON.stringify(context);
localStorage.setItem('conversation', serialized);

// Restore
const restored: Context = JSON.parse(localStorage.getItem('conversation')!);
restored.messages.push({ role: 'user', content: 'Continue' });
```

## OAuth Authentication

### CLI Login

```bash
npx @earendil-works/pi-ai login              # Interactive
npx @earendil-works/pi-ai login anthropic    # Specific provider
npx @earendil-works/pi-ai list               # List providers
```

### Programmatic OAuth

```typescript
import {
  loginGitHubCopilot,
  refreshOAuthToken,
  getOAuthApiKey,
} from '@earendil-works/pi-ai/oauth';   // OAuth helpers live under the /oauth subpath

// Login
const credentials = await loginGitHubCopilot({
  onAuth: (url, instructions) => console.log(`Open: ${url}`),
  onPrompt: async (prompt) => await getUserInput(prompt.message),
  onProgress: (message) => console.log(message)
});

// Save credentials
const auth = { 'github-copilot': { type: 'oauth', ...credentials } };
writeFileSync('auth.json', JSON.stringify(auth));

// Use
const result = await getOAuthApiKey('github-copilot', auth);
if (result) {
  auth['github-copilot'] = { type: 'oauth', ...result.newCredentials };
  const response = await complete(model, context, { apiKey: result.apiKey });
}
```

## Vertex AI Setup

```bash
# Local development
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT="my-project"
export GOOGLE_CLOUD_LOCATION="us-central1"

# CI/Production
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

```typescript
const model = getModel('google-vertex', 'gemini-2.5-flash');
const response = await complete(model, {
  messages: [{ role: 'user', content: 'Hello from Vertex AI' }]
});
```

## Debug Payload

```typescript
const response = await complete(model, context, {
  onPayload: (payload) => {
    console.log('Provider payload:', JSON.stringify(payload, null, 2));
  }
});
```

## Browser Usage

```typescript
// API key must be passed explicitly in browser
const response = await complete(model, context, {
  apiKey: 'your-api-key'
});
```

**Warning**: Exposing API keys in frontend code is dangerous. Use a backend proxy for production.

## Cache Retention

Set `PI_CACHE_RETENTION=long` to extend prompt cache:

| Provider | Default | With long |
|----------|---------|-----------|
| Anthropic | 5 min | 1 hour |
| OpenAI | in-memory | 24 hours |
