# TanStack AI (Alpha)

> **Status**: Alpha - API is unstable and may change significantly.

## Installation

```bash
npm install @tanstack/ai @tanstack/ai-client
npm install @tanstack/react-ai  # For React integration
```

## Overview

TanStack AI is a multi-provider AI SDK with a unified interface. Switch between OpenAI, Anthropic, Ollama, and Google Gemini without code changes.

## Quick Start

### Server Setup

```ts
// server.ts
import { createAIServer } from '@tanstack/ai/server'
import { openai } from '@tanstack/ai/openai'
import { anthropic } from '@tanstack/ai/anthropic'

const ai = createAIServer({
  providers: {
    openai: openai({ apiKey: process.env.OPENAI_API_KEY }),
    anthropic: anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  },
  defaultProvider: 'openai',
})

// Use in API route
export async function POST(req: Request) {
  const { messages } = await req.json()

  const response = await ai.chat({
    model: 'gpt-4',
    messages,
  })

  return new Response(response.text)
}
```

### Client Usage

```tsx
import { useChat } from '@tanstack/react-ai'

function ChatComponent() {
  const { messages, input, setInput, sendMessage, isLoading } = useChat({
    api: '/api/chat',
  })

  return (
    <div>
      <div>
        {messages.map((msg, i) => (
          <div key={i}>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type a message..."
      />
      <button onClick={sendMessage} disabled={isLoading}>
        {isLoading ? 'Sending...' : 'Send'}
      </button>
    </div>
  )
}
```

## Streaming Responses

```tsx
const { messages, isStreaming } = useChat({
  api: '/api/chat',
  onStream: (chunk) => {
    console.log('Received chunk:', chunk)
  },
})
```

## Tool/Function Calling

```ts
const response = await ai.chat({
  model: 'gpt-4',
  messages,
  tools: [
    {
      name: 'get_weather',
      description: 'Get the current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' },
        },
        required: ['location'],
      },
    },
  ],
})

// Handle tool calls
if (response.toolCalls) {
  for (const call of response.toolCalls) {
    if (call.name === 'get_weather') {
      const weather = await getWeather(call.arguments.location)
      // Continue conversation with tool result
    }
  }
}
```

## Switching Providers

```ts
// Use different providers at runtime
const response = await ai.chat({
  provider: 'anthropic',
  model: 'claude-3-opus',
  messages,
})
```

For the latest API and examples, see: https://tanstack.com/ai/latest
