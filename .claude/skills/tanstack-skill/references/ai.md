# TanStack AI

> **Status: Alpha (`@tanstack/ai` v0.31.0, June 2026).** This is a `0.x`, pre-1.0 library under
> active development — it ships breaking changes in minor/patch releases (often several per week).
> Pin exact versions and verify the API against the live docs before relying on anything here.
> The package families (`@tanstack/ai`, `@tanstack/ai-react`, the provider adapters) version
> independently, so their numbers will not match.
>
> Verify: `npm view @tanstack/ai version` · Docs: https://tanstack.com/ai/latest · Source: https://github.com/TanStack/ai

## Table of Contents
- [Overview](#overview)
- [Packages](#packages)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Server: `chat()`](#server-chat)
- [Provider Adapters](#provider-adapters)
- [Client: `useChat`](#client-usechat)
- [Tool Calling](#tool-calling)
- [Structured Outputs](#structured-outputs)
- [Other Generation Activities](#other-generation-activities)
- [Notes & Caveats](#notes--caveats)

## Overview

TanStack AI is a type-safe, provider-agnostic TypeScript AI SDK. The core idea: a small set of
**activity functions** (`chat`, `summarize`, `generateImage`, etc.) take a tree-shakeable
**adapter** for a specific provider/model. You call them on the server, stream the result to the
browser as Server-Sent Events, and consume it with framework hooks (`useChat` and friends).

Confirmed capabilities in 0.31.0: streaming chat, isomorphic (server/client) tools with optional
approval, structured outputs via Standard Schema (Zod/Valibot/ArkType/JSON Schema), multimodal
prompts, image/audio/video/speech/transcription generation, realtime voice, MCP tool sources,
chat middleware, and OpenTelemetry instrumentation.

## Packages

| Package | Purpose |
|---------|---------|
| `@tanstack/ai` | Core: `chat`, activities, `toolDefinition`, streaming/SSE helpers, middleware |
| `@tanstack/ai-react` | React hooks: `useChat`, `useRealtimeChat`, `useGeneration`, etc. |
| `@tanstack/ai-client` | Framework-agnostic chat/generation clients + connection adapters (re-exported by `ai-react`) |
| `@tanstack/ai-anthropic` | Anthropic Claude adapter (`anthropicText`, ...) |
| `@tanstack/ai-openai` | OpenAI adapter (`openaiText`, `openaiImage`, `openaiRealtime`, ...) |

Other adapters published in the same line include `@tanstack/ai-gemini`, `@tanstack/ai-ollama`,
`@tanstack/ai-openrouter`, `@tanstack/ai-grok`, `@tanstack/ai-groq`, `@tanstack/ai-fal`, and
`@tanstack/ai-elevenlabs`. Non-React framework bindings exist as `@tanstack/ai-vue`,
`@tanstack/ai-svelte`, `@tanstack/ai-solid`, and `@tanstack/ai-preact`. (Verify availability/version
of each before use; this set changes frequently.)

## Installation

```bash
# Core + React + Anthropic adapter
npm install @tanstack/ai @tanstack/ai-react @tanstack/ai-anthropic
```

Provider adapters read their API key from the environment by default
(`anthropicText` uses `ANTHROPIC_API_KEY`), or you can pass it explicitly via config.

## Quick Start

A minimal end-to-end chat: a server route that streams, and a React component that consumes it.

**Server route** (any web-standard `Request`/`Response` handler — route handler, Start, etc.):

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: anthropicText('claude-opus-4-8'), // reads ANTHROPIC_API_KEY from env
    messages,
  })

  return toServerSentEventsResponse(stream)
}
```

**React client:**

```tsx
import { useState } from 'react'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading, error } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}:</strong>
          {message.parts.map((part, i) =>
            part.type === 'text' ? <span key={i}>{part.content}</span> : null,
          )}
        </div>
      ))}

      {error && <p role="alert">{error.message}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (input.trim() && !isLoading) {
            sendMessage(input)
            setInput('')
          }
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} disabled={isLoading} />
        <button type="submit" disabled={!input.trim() || isLoading}>Send</button>
      </form>
    </div>
  )
}
```

## Server: `chat()`

`chat()` returns a stream of typed chunks. Pass an `adapter` (provider + model), the `messages`,
and optionally `tools`, `outputSchema`, `system`, etc. Convert the stream to a response with one
of the helpers exported from `@tanstack/ai`:

- `toServerSentEventsResponse(stream)` — SSE `Response` (pairs with `fetchServerSentEvents`)
- `toServerSentEventsStream(stream)` / `toHttpStream(stream)` / `toHttpResponse(stream)`
- `streamToText(stream)` — collapse to a plain text stream

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

const stream = chat({
  adapter: anthropicText('claude-sonnet-4-6'),
  system: 'You are a concise assistant.',
  messages: [{ role: 'user', content: 'Explain SSE in one sentence.' }],
})

return toServerSentEventsResponse(stream)
```

You can also `await chat({ ... })`-style usage for non-streaming results when an `outputSchema`
is supplied (see [Structured Outputs](#structured-outputs)).

## Provider Adapters

Adapters are per-activity factory functions. The Anthropic text adapter:

```ts
import { anthropicText } from '@tanstack/ai-anthropic'

// Model id is a typed literal; API key auto-detected from ANTHROPIC_API_KEY
anthropicText('claude-opus-4-8')

// Or pass config explicitly (any @anthropic-ai/sdk ClientOptions except apiKey-as-required)
anthropicText('claude-haiku-4-5', { apiKey: process.env.MY_KEY, baseURL: '...' })
```

The Anthropic adapter exposes typed model constants and a model list
(`ANTHROPIC_MODELS`, plus constants like `CLAUDE_OPUS_4_8`, `CLAUDE_SONNET_4_6`,
`CLAUDE_HAIKU_4_5`). It also provides `anthropicSummarize` and Anthropic-specific tools
(e.g. a text-editor tool) under `@tanstack/ai-anthropic/tools`.

OpenAI's adapter follows the same shape with more activities: `openaiText`, `openaiImage`,
`openaiSpeech`, `openaiTranscription`, `openaiVideo`, `openaiRealtime`, plus `openaiCompatible`
for OpenAI-compatible endpoints.

Swapping providers means swapping the adapter — the `chat()` call and the client are unchanged:

```ts
import { openaiText } from '@tanstack/ai-openai'
chat({ adapter: openaiText('gpt-5.2'), messages })
```

## Client: `useChat`

`useChat(options)` from `@tanstack/ai-react`. Connect it to your route with a **connection
adapter** (`fetchServerSentEvents`, `fetchHttpStream`, `xhrServerSentEvents`, ...). Note: `useChat`
does **not** manage the input box for you — keep input in your own state (the old `input`/`setInput`
return fields no longer exist).

Key options: `connection` (or `fetcher`), `body` (extra fields sent with each request),
`outputSchema`, `live`, lifecycle callbacks `onResponse` / `onChunk` / `onFinish` / `onError`.

Key return values:

| Field | Description |
|-------|-------------|
| `messages` | `UIMessage[]` — each has `id`, `role`, and a `parts` array (`text`, `thinking`, tool, structured-output, ...) |
| `sendMessage(content)` | Send a `string` or `MultimodalContent` |
| `append(message)` | Append a message without triggering generation logic |
| `addToolResult(...)` | Provide the output of a client-side tool call |
| `addToolApprovalResponse({ id, approved })` | Approve/deny a tool that `needsApproval` |
| `reload()` / `stop()` | Re-run last assistant turn / abort current generation |
| `isLoading`, `error`, `status`, `connectionStatus` | Request + connection state |

Render messages by walking `message.parts` and switching on `part.type` (it is **not** a flat
`content` string):

```tsx
{message.parts.map((part, i) => {
  if (part.type === 'thinking') return <em key={i}>{part.content}</em>
  if (part.type === 'text') return <span key={i}>{part.content}</span>
  return null
})}
```

## Tool Calling

Define a tool once with `toolDefinition()` (Standard Schema input/output), then attach a `.server()`
or `.client()` implementation. Tools passed to `chat({ tools })` are executed automatically by the
SDK; the loop continues until the model finishes.

```ts
import { chat, toolDefinition } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { z } from 'zod'

const getWeatherDef = toolDefinition({
  name: 'getWeather',
  description: 'Get the current weather for a location',
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.object({ temperature: z.number(), conditions: z.string() }),
})

// Server implementation — args are typed from inputSchema
const getWeather = getWeatherDef.server(async ({ location }) => {
  return { temperature: 72, conditions: 'Sunny' }
})

const stream = chat({
  adapter: anthropicText('claude-opus-4-8'),
  messages: [{ role: 'user', content: "What's the weather in Paris?" }],
  tools: [getWeather], // executed automatically by the SDK
})
```

- `.client(fn)` builds a browser-side tool; resolve its result with `addToolResult` from `useChat`.
- `needsApproval: true` on the definition pauses for `addToolApprovalResponse({ id, approved })`.
- Agent-loop control: `maxIterations`, `untilFinishReason`, `combineStrategies` (from `@tanstack/ai`).
- MCP tool sources are supported via `ChatMCPOptions` / `MCPToolSource`.

## Structured Outputs

Pass `outputSchema` (any Standard Schema) to `chat()`. On the server you get a validated object;
on the client, `useChat({ outputSchema })` adds a progressively-parsed `partial` and a validated
`final`.

```ts
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { z } from 'zod'

const result = await chat({
  adapter: anthropicText('claude-sonnet-4-6'),
  messages: [{ role: 'user', content: 'Summarize: ...' }],
  outputSchema: z.object({ title: z.string(), bullets: z.array(z.string()) }),
})
```

```tsx
const { partial, final } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  outputSchema: z.object({ title: z.string(), bullets: z.array(z.string()) }),
})
// `partial` is a DeepPartial<T> updated live; `final` is the validated T (or null)
```

> Anthropic has no native structured-output mode — the adapter implements it by forcing a
> tool call whose schema matches `outputSchema`. The client `outputSchema` is for type inference
> only; real validation runs server-side against the schema passed to `chat()`.

## Other Generation Activities

Mirroring `chat()`, the core exports `summarize`, `generateImage`, `generateAudio`,
`generateSpeech`, `generateVideo`, `getVideoJobStatus`, and `generateTranscription`, each taking a
matching adapter. React has corresponding hooks: `useSummarize`, `useGeneration`,
`useGenerateImage`, `useGenerateAudio`, `useGenerateSpeech`, `useGenerateVideo`,
`useTranscription`, and `useRealtimeChat`.

```ts
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const image = await generateImage({
  adapter: openaiImage('gpt-image-1'),
  prompt: 'A red guitar on a wooden table',
})
```

## Notes & Caveats

- **Alpha.** Treat every signature above as a snapshot of 0.31.0. Adapters lag the core package
  version (e.g. `@tanstack/ai-anthropic` was ~0.15.x when core was 0.31.0). Always re-check.
- The earlier `createAIServer` / `useChat({ api, input, setInput })` shape from pre-alpha drafts
  is **not** the current API — the model is adapter-per-activity (`chat({ adapter })`) plus
  connection-based hooks.
- For anything not confirmed here (middleware, realtime voice, MCP, devtools, non-React bindings),
  consult the live docs and the package's `.d.ts` files rather than assuming.
