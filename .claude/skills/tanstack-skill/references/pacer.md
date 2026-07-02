# TanStack Pacer

Utilities for **debouncing, throttling, rate limiting, queuing, and batching** — both plain (synchronous) and async variants, with React hooks.

- Packages: `@tanstack/pacer` (core), `@tanstack/react-pacer` (React adapter)
- Version targeted: **0.21.1** (Beta — API may change; not yet 1.0)

## Table of Contents
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Debouncing](#debouncing)
- [Throttling](#throttling)
- [Rate Limiting](#rate-limiting)
- [Queuing](#queuing)
- [Batching](#batching)
- [Hook Reference](#hook-reference)

## Installation

```bash
npm install @tanstack/pacer          # framework-agnostic core
npm install @tanstack/react-pacer    # React hooks (re-exports core)
```

## Core Concepts

Each technique comes in three layers:

1. **Plain utility functions** — `debounce`, `throttle`, `rateLimit`, `queue`, `batch`. They take `(fn, options)` and return a wrapped function. The options are an **object** (`{ wait }`, `{ limit, window }`, etc.) — there is no positional delay argument.
2. **Class instances** — `Debouncer`, `Throttler`, `RateLimiter`, `Queuer`, `AsyncQueuer`. Call `instance.maybeExecute(...)` to invoke, plus `cancel()` / `flush()` (and `addItem()` / `start()` / `stop()` for queuers).
3. **React hooks** — wrap the instances so they survive re-renders.

The React hooks generally follow the shape `useXxx(fn, options, selector?)`:

- The lower-level hooks (`useDebouncer`, `useThrottler`, `useRateLimiter`, `useQueuer`, `useAsyncQueuer`) return the **instance**.
- The `useXxxCallback` hooks return a wrapped **callback** to use directly in event handlers.
- The `useXxxValue` / `useXxxState` hooks return a `[value, instance]` tuple for deriving a paced value from state.

State is powered by TanStack Store. **By default the hooks do not subscribe to any state** — pass a `selector` (third argument) to opt into re-renders for the specific state fields you read (e.g. `isPending`, `executionCount`, `size`). Without a selector, `instance.state` is an empty object.

## Debouncing

Delay execution until input stops. Hooks: `useDebouncedCallback`, `useDebouncedValue`, `useDebouncer`, `useDebouncedState`.

### useDebouncedCallback (event handlers)

```tsx
import { useDebouncedCallback } from '@tanstack/react-pacer'

function SearchInput() {
  const debouncedSearch = useDebouncedCallback(
    (value: string) => fetchSearchResults(value),
    { wait: 300 }, // fires 300ms after the last call
  )

  return <input onChange={(e) => debouncedSearch(e.target.value)} />
}
```

### useDebouncedValue (derive from state)

```tsx
import { useDebouncedValue } from '@tanstack/react-pacer'

function Search() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, debouncer] = useDebouncedValue(
    query,
    { wait: 500 },
    (state) => ({ isPending: state.isPending }), // opt-in to re-render on pending
  )

  useEffect(() => {
    if (debouncedQuery) fetchSearchResults(debouncedQuery)
  }, [debouncedQuery])

  return (
    <input value={query} onChange={(e) => setQuery(e.target.value)} />
  )
}
```

### debounce utility (no React)

```ts
import { debounce } from '@tanstack/pacer'

const debounced = debounce(() => saveChanges(), {
  wait: 1000,
  leading: false, // do not fire on the leading edge
  trailing: true, // fire after the wait window (default)
})

inputEl.addEventListener('input', debounced)
```

## Throttling

Execute at most once per interval. Hooks: `useThrottledCallback`, `useThrottledValue`, `useThrottler`, `useThrottledState`. (Async variants: `useAsyncThrottledCallback`, etc.)

### useThrottledCallback (scroll / resize)

```tsx
import { useThrottledCallback } from '@tanstack/react-pacer'

function ScrollTracker() {
  const handleScroll = useThrottledCallback(
    () => trackScrollPosition(window.scrollY),
    { wait: 100 }, // at most once every 100ms
  )

  useEffect(() => {
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  return <div>Scroll to track…</div>
}
```

### useThrottler (full instance access)

```tsx
import { useThrottler } from '@tanstack/react-pacer'

const throttler = useThrottler(
  (value: number) => updateProgress(value),
  { wait: 200, leading: true, trailing: true },
)

// In an event handler:
<input type="range" onChange={(e) => throttler.maybeExecute(Number(e.target.value))} />
```

### throttle utility (no React)

```ts
import { throttle } from '@tanstack/pacer'

const throttled = throttle((pos: number) => updateUI(pos), {
  wait: 100,
  leading: true,
  trailing: true,
})
```

## Rate Limiting

Cap the number of executions per rolling time window. Hooks: `useRateLimitedCallback`, `useRateLimiter`. Options are `{ limit, window }` (count per window in ms) — note: not `interval`.

### useRateLimitedCallback

```tsx
import { useRateLimitedCallback } from '@tanstack/react-pacer'

function ApiButton() {
  const handleClick = useRateLimitedCallback(
    () => callApi(),
    {
      limit: 3,
      window: 10000, // 3 calls per 10 seconds
      onReject: (limiter) =>
        alert(`Too many requests. Wait ${limiter.getMsUntilNextWindow()}ms`),
    },
  )

  return <button onClick={handleClick}>Call API</button>
}
```

### useRateLimiter (instance + state)

```tsx
import { useRateLimiter } from '@tanstack/react-pacer'

const limiter = useRateLimiter(
  (data: FormData) => submitForm(data),
  { limit: 5, window: 60000 },
  (state) => ({ rejectionCount: state.rejectionCount, isExceeded: state.isExceeded }),
)

limiter.maybeExecute(formData)
limiter.getRemainingInWindow() // calls left in the current window
```

### rateLimit utility (no React)

```ts
import { rateLimit } from '@tanstack/pacer'

const rateLimited = rateLimit(
  async (data: unknown) => api.post('/endpoint', data),
  { limit: 10, window: 1000 }, // max 10 per second
)
```

## Queuing

Process items in order with optional delay and concurrency. Sync hooks: `useQueuer`, `useQueuedState`, `useQueuedValue`. Async hook: `useAsyncQueuer`.

Add items with `queuer.addItem(item)`; control with `queuer.start()` / `queuer.stop()` / `queuer.flush()`.

### useQueuer (paced, sequential)

```tsx
import { useQueuer } from '@tanstack/react-pacer'

function NotificationQueue() {
  const queue = useQueuer<{ id: number; message: string }>(
    (n) => showToast(n.message),
    { wait: 2000, maxSize: 10 }, // 2s between items, cap at 10
    (state) => ({ size: state.size }),
  )

  return (
    <div>
      <button onClick={() => queue.addItem({ id: Date.now(), message: 'Hi!' })}>
        Add
      </button>
      <p>Queued: {queue.state.size}</p>
      <button onClick={() => queue.flush()}>Show all now</button>
    </div>
  )
}
```

### useAsyncQueuer (concurrent async processing)

```tsx
import { useAsyncQueuer } from '@tanstack/react-pacer'

function Uploader() {
  const queuer = useAsyncQueuer<File>(
    async (file) => uploadFile(file), // returns a Promise
    {
      concurrency: 3,       // up to 3 in flight at once
      wait: 0,
      started: true,
      onSuccess: (result, file) => console.log('Uploaded', file.name, result),
      onError: (err, file) => console.error('Failed', file.name, err),
    },
    (state) => ({ activeItems: state.activeItems, size: state.size }),
  )

  const onPick = (files: FileList) => {
    for (const file of files) queuer.addItem(file)
  }

  return <input type="file" multiple onChange={(e) => onPick(e.target.files!)} />
}
```

The core `AsyncQueuer` class supports FIFO/LIFO ordering, priority via `getPriority`, pause/resume, cancellation, and item expiration. Handlers (`onSuccess`, `onError`, `onSettled`) can be passed in options or set later via `queuer.setOptions({ ... })`.

## Batching

Group rapid individual calls into a single batched call (e.g. one network request for many IDs).

```ts
import { batch } from '@tanstack/pacer'

const batchedFetch = batch(
  async (ids: string[]) => api.getMany(ids), // receives all collected items
  {
    maxSize: 50, // flush once 50 items are queued
    wait: 10,    // …or after 10ms, whichever comes first
  },
)

batchedFetch('id1')
batchedFetch('id2')
batchedFetch('id3') // collapsed into a single getMany(['id1','id2','id3'])
```

## Hook Reference

| Technique | Callback hook | Value/state hook | Instance hook | Utility fn |
|-----------|---------------|------------------|---------------|------------|
| Debounce | `useDebouncedCallback` | `useDebouncedValue`, `useDebouncedState` | `useDebouncer` | `debounce` |
| Throttle | `useThrottledCallback` | `useThrottledValue`, `useThrottledState` | `useThrottler` | `throttle` |
| Rate limit | `useRateLimitedCallback` | — | `useRateLimiter` | `rateLimit` |
| Queue | — | `useQueuedValue`, `useQueuedState` | `useQueuer`, `useAsyncQueuer` | `queue` |
| Batch | — | — | — | `batch` |

Async-specific hooks exist alongside the sync ones (e.g. `useAsyncDebouncedCallback`, `useAsyncThrottledCallback`, `useAsyncRateLimitedCallback`) for functions that return Promises. Instance methods shared across paced types: `maybeExecute(...args)`, `cancel()`, `flush()`; queuers add `addItem()`, `start()`, `stop()`.

For the latest API see https://tanstack.com/pacer/latest/docs/overview
