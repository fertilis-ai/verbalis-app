# TanStack Pacer (Beta)

> **Status**: Beta - API may change. Use with caution in production.

## Installation

```bash
npm install @tanstack/pacer
npm install @tanstack/react-pacer  # For React hooks
```

## Overview

TanStack Pacer provides utilities for debouncing, throttling, rate limiting, queuing, and batching operations.

## Debouncing

Delay execution until input stops:

```tsx
import { useDebounce } from '@tanstack/react-pacer'

function SearchInput() {
  const [value, setValue] = useState('')
  const [debouncedValue, setDebouncedValue] = useDebounce('', 300)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)
    setDebouncedValue(e.target.value)
  }

  useEffect(() => {
    // Only fires 300ms after user stops typing
    if (debouncedValue) {
      fetchSearchResults(debouncedValue)
    }
  }, [debouncedValue])

  return <input value={value} onChange={handleChange} />
}
```

### Debounce Function

```ts
import { debounce } from '@tanstack/pacer'

const debouncedSearch = debounce(
  async (query: string) => {
    return await searchAPI(query)
  },
  300, // delay in ms
  {
    leading: false,  // Don't fire immediately
    trailing: true,  // Fire after delay
  }
)

// Usage
debouncedSearch('hello')
debouncedSearch('hello w')
debouncedSearch('hello world') // Only this one fires (after 300ms)
```

## Throttling

Limit execution rate:

```tsx
import { useThrottle } from '@tanstack/react-pacer'

function ScrollTracker() {
  const [scrollY, setScrollY] = useState(0)
  const throttledSetScrollY = useThrottle(setScrollY, 100)

  useEffect(() => {
    const handleScroll = () => {
      throttledSetScrollY(window.scrollY)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [throttledSetScrollY])

  return <div>Scroll position: {scrollY}</div>
}
```

### Throttle Function

```ts
import { throttle } from '@tanstack/pacer'

const throttledUpdate = throttle(
  (position: number) => {
    updateUI(position)
  },
  100, // max once per 100ms
  {
    leading: true,   // Fire immediately on first call
    trailing: true,  // Fire after interval if called during throttle
  }
)
```

## Rate Limiting

Control request frequency:

```ts
import { rateLimit } from '@tanstack/pacer'

const rateLimitedAPI = rateLimit(
  async (data: any) => {
    return await api.post('/endpoint', data)
  },
  {
    limit: 10,        // Max 10 calls
    interval: 1000,   // Per second
  }
)
```

## Queuing

Process items sequentially:

```ts
import { createQueue } from '@tanstack/pacer'

const uploadQueue = createQueue({
  concurrency: 3,  // Process 3 at a time
  onProcess: async (file: File) => {
    return await uploadFile(file)
  },
})

// Add items to queue
uploadQueue.add(file1)
uploadQueue.add(file2)
uploadQueue.add(file3)

// Monitor progress
uploadQueue.on('complete', (result) => {
  console.log('Uploaded:', result)
})
```

## Batching

Group multiple calls into one:

```ts
import { batch } from '@tanstack/pacer'

const batchedFetch = batch(
  async (ids: string[]) => {
    // Single API call with all IDs
    return await api.getMany(ids)
  },
  {
    maxSize: 50,      // Max batch size
    maxWait: 10,      // Max wait time (ms)
  }
)

// These will be batched into a single API call
batchedFetch('id1')
batchedFetch('id2')
batchedFetch('id3')
```

For the latest API and examples, see: https://tanstack.com/pacer/latest
