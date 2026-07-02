# TanStack Query (React)

`@tanstack/react-query` — **v5** (latest 5.101.0, stable). All examples are TypeScript + React.

**Key v5 changes vs v4:** single-object signature only (no overloads); `cacheTime` → `gcTime`; `isLoading` → `isPending` (status); `keepPreviousData` → `placeholderData: keepPreviousData`; `useErrorBoundary` → `throwOnError`; `onSuccess`/`onError`/`onSettled` removed from `useQuery` (still on `useMutation`); infinite queries require `initialPageParam`; new dedicated Suspense hooks.

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [QueryClient Configuration](#queryclient-configuration)
- [Query Keys](#query-keys)
- [useQuery](#usequery)
- [useQueries](#usequeries)
- [Suspense Hooks](#suspense-hooks)
- [useMutation](#usemutation)
- [useMutationState](#usemutationstate)
- [Query Invalidation](#query-invalidation)
- [Optimistic Updates](#optimistic-updates)
- [Infinite Queries](#infinite-queries)
- [Prefetching](#prefetching)
- [Query Options Pattern](#query-options-pattern)
- [streamedQuery](#streamedquery)
- [SSR & Hydration](#ssr--hydration)

## Installation

```bash
npm install @tanstack/react-query
npm install -D @tanstack/react-query-devtools  # Optional devtools
```

## Quick Start

```tsx
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Posts />
    </QueryClientProvider>
  )
}

function Posts() {
  const { data, isPending, error } = useQuery({
    queryKey: ['posts'],
    queryFn: (): Promise<Post[]> => fetch('/api/posts').then((r) => r.json()),
  })

  if (isPending) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <ul>
      {data.map((post) => <li key={post.id}>{post.title}</li>)}
    </ul>
  )
}
```

## QueryClient Configuration

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,    // how long data is "fresh" (default 0)
      gcTime: 1000 * 60 * 10,      // garbage-collect inactive cache (default 5 min). Renamed from cacheTime in v4.
      retry: 3,                     // retry failed queries (default 3)
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
})
```

## Query Keys

Query keys uniquely identify cached data. They are hashed deterministically (object key order does not matter).

```tsx
useQuery({ queryKey: ['todos'], /* ... */ })                       // simple
useQuery({ queryKey: ['todo', todoId], /* ... */ })               // with variable
useQuery({ queryKey: ['todos', { status: 'done', page: 1 }], /* ... */ }) // with filters
```

## useQuery

```tsx
const {
  data,              // resolved data (TData | undefined)
  error,             // Error | null
  status,            // 'pending' | 'error' | 'success'
  fetchStatus,       // 'fetching' | 'paused' | 'idle'
  isPending,         // status === 'pending' (no cached data yet)
  isError,           // status === 'error'
  isSuccess,         // status === 'success'
  isFetching,        // fetchStatus === 'fetching' (incl. background refetch)
  isLoading,         // isPending && isFetching (first hard load only)
  isPlaceholderData, // currently showing placeholderData
  refetch,           // () => Promise<...> manual refetch
} = useQuery({
  queryKey: ['posts'],
  queryFn: fetchPosts,
  staleTime: 5000,
  gcTime: 10000,
  enabled: true,                              // false disables automatic fetching
  select: (data) => data.filter((x) => x.active), // transform/derive (memoized)
  placeholderData: [],                        // shown while pending; doesn't persist to cache
  retry: 3,
  throwOnError: false,                        // true to bubble to nearest Error Boundary
})
```

`isPending` vs `isLoading`: `isPending` is true whenever there is no data (e.g. a disabled query never loaded). `isLoading` is the derived `isPending && isFetching` — use it for "first load" spinners.

### Dependent Queries

```tsx
const { data: user } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId),
})

const { data: projects } = useQuery({
  queryKey: ['projects', user?.id],
  queryFn: () => fetchProjects(user!.id),
  enabled: !!user?.id, // only run once user is available
})
```

### Keep Previous Data (pagination)

```tsx
import { keepPreviousData } from '@tanstack/react-query'

const { data, isPlaceholderData } = useQuery({
  queryKey: ['projects', page],
  queryFn: () => fetchProjects(page),
  placeholderData: keepPreviousData, // v5 replacement for keepPreviousData: true
})
```

## useQueries

Run a dynamic number of queries in parallel. Use `combine` to merge results into a single value (memoize the function or define it outside render).

```tsx
import { useQueries } from '@tanstack/react-query'

const combined = useQueries({
  queries: ids.map((id) => ({
    queryKey: ['post', id],
    queryFn: () => fetchPost(id),
  })),
  combine: (results) => ({
    data: results.map((r) => r.data),
    pending: results.some((r) => r.isPending),
  }),
})
```

## Suspense Hooks

Dedicated v5 hooks integrate with React `<Suspense>` and Error Boundaries. `data` is guaranteed defined; `enabled`/`placeholderData` are not allowed. By default they only throw errors when there is no cached data (`throwOnError: (error, query) => query.state.data === undefined`).

```tsx
import {
  useSuspenseQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQueries,
} from '@tanstack/react-query'
import { Suspense } from 'react'

function Posts() {
  const { data } = useSuspenseQuery({ queryKey: ['posts'], queryFn: fetchPosts })
  return <PostList posts={data} /> // data: Post[] (never undefined)
}

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Posts />
    </Suspense>
  )
}
```

To force an error to surface during a background refetch, throw it yourself:

```tsx
const { data, error, isFetching } = useSuspenseQuery({ queryKey, queryFn })
if (error && !isFetching) throw error
```

## useMutation

```tsx
const mutation = useMutation({
  mutationFn: (newPost: { title: string; body: string }) =>
    fetch('/api/posts', { method: 'POST', body: JSON.stringify(newPost) }).then((r) => r.json()),
  mutationKey: ['createPost'],              // optional; needed for useMutationState / defaults
  scope: { id: 'posts' },                   // mutations sharing a scope.id run serially
  onMutate: (variables, context) => {
    // runs before mutationFn; context.client is the QueryClient
    return { optimisticId: 1 }              // becomes onMutateResult in later callbacks
  },
  onSuccess: (data, variables, onMutateResult, context) => {},
  onError: (error, variables, onMutateResult, context) => {},
  onSettled: (data, error, variables, onMutateResult, context) => {}, // always runs
})

mutation.mutate({ title: 'Hello', body: 'World' })          // fire-and-forget
const data = await mutation.mutateAsync({ title: 'Hi', body: '!' }) // returns a promise

// Per-call callbacks (only fire if the component is still mounted):
mutation.mutate(payload, { onSuccess: (d) => {} })
```

> Note: as of v5.80 the callback signatures gained a trailing `context` argument and `onMutate`'s return value is passed as `onMutateResult` (previously the 3rd positional `context`). `context.client` exposes the QueryClient.

### Mutation State

```tsx
const {
  mutate, mutateAsync,
  status,        // 'idle' | 'pending' | 'error' | 'success'
  isIdle, isPending, isError, isSuccess,
  error, data, variables,
  reset,         // clear error/data back to idle
} = useMutation({ /* ... */ })
```

## useMutationState

Read state of mutations across the app (e.g. global pending indicators or optimistic UI from a sibling).

```tsx
import { useMutationState } from '@tanstack/react-query'

// Variables of every in-flight mutation
const pendingVars = useMutationState({
  filters: { status: 'pending' },
  select: (mutation) => mutation.state.variables,
})

// Data for a specific mutationKey
const data = useMutationState({
  filters: { mutationKey: ['posts'] },
  select: (mutation) => mutation.state.data,
})
const latest = data[data.length - 1]
```

## Query Invalidation

```tsx
const queryClient = useQueryClient()

// Fuzzy: invalidate everything whose key starts with ['posts']
queryClient.invalidateQueries({ queryKey: ['posts'] })

// Exact match only
queryClient.invalidateQueries({ queryKey: ['posts', postId], exact: true })

// Control which queries actually refetch
queryClient.invalidateQueries({ queryKey: ['posts'], refetchType: 'active' }) // 'active' | 'inactive' | 'all' | 'none'

// Predicate filter
queryClient.invalidateQueries({
  predicate: (query) => query.queryKey[0] === 'posts' && query.queryKey[1] !== undefined,
})

// Common pattern: invalidate after a mutation
const mutation = useMutation({
  mutationFn: createPost,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['posts'] }),
})
```

## Optimistic Updates

Cache-based approach with rollback via the `onMutate` context:

```tsx
const queryClient = useQueryClient()

const mutation = useMutation({
  mutationFn: updatePost,
  onMutate: async (newPost) => {
    await queryClient.cancelQueries({ queryKey: ['posts', newPost.id] })
    const previousPost = queryClient.getQueryData(['posts', newPost.id])
    queryClient.setQueryData(['posts', newPost.id], newPost)
    return { previousPost } // available as onMutateResult below
  },
  onError: (err, newPost, onMutateResult) => {
    queryClient.setQueryData(['posts', newPost.id], onMutateResult?.previousPost)
  },
  onSettled: (data, error, newPost) => {
    queryClient.invalidateQueries({ queryKey: ['posts', newPost.id] })
  },
})
```

Alternative UI-only approach (no cache write): derive optimistic state from `mutation.variables` / `mutation.isPending` while rendering, or read pending mutations via `useMutationState`.

## Infinite Queries

In v5 `initialPageParam` is required and `pageParam` is passed via the query function context.

```tsx
import { useInfiniteQuery } from '@tanstack/react-query'

function Posts() {
  const {
    data,
    fetchNextPage,
    fetchPreviousPage,
    hasNextPage,
    hasPreviousPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['posts'],
    queryFn: ({ pageParam }) =>
      fetch(`/api/posts?cursor=${pageParam}`).then((r) => r.json()),
    initialPageParam: 0,                                   // required in v5
    getNextPageParam: (lastPage, allPages, lastPageParam) =>
      lastPage.nextCursor ?? undefined,                    // undefined/null => hasNextPage false
    getPreviousPageParam: (firstPage) => firstPage.prevCursor ?? undefined,
    maxPages: 3, // cap stored pages; refetch only re-fetches retained pages (perf)
  })

  return (
    <>
      {data?.pages.map((page, i) => (
        <div key={i}>
          {page.posts.map((post) => <Post key={post.id} post={post} />)}
        </div>
      ))}
      <button onClick={() => fetchNextPage()} disabled={!hasNextPage || isFetchingNextPage}>
        {isFetchingNextPage ? 'Loading...' : hasNextPage ? 'Load More' : 'No more'}
      </button>
    </>
  )
}
```

`data` is `{ pages: TPage[]; pageParams: TPageParam[] }`.

## Prefetching

Imperative (e.g. on hover) and declarative hook variants. Prefetch functions never throw and resolve to `void`. `ensureQueryData` returns the data and resolves immediately if cached & fresh.

```tsx
const queryClient = useQueryClient()

// On hover
const prefetch = () =>
  queryClient.prefetchQuery({
    queryKey: ['post', postId],
    queryFn: () => fetchPost(postId),
    staleTime: 60_000, // skip if cached data is younger than this
  })

// Infinite
queryClient.prefetchInfiniteQuery({
  queryKey: ['posts'],
  queryFn: fetchPage,
  initialPageParam: 0,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
  pages: 3, // prefetch multiple pages
})

// Returns data (ideal for route loaders)
const post = await queryClient.ensureQueryData({
  queryKey: ['post', id],
  queryFn: () => fetchPost(id),
})
// ensureInfiniteQueryData(...) is the infinite equivalent
```

Declarative hooks fire a prefetch during render without blocking; pair with a Suspense boundary so a child `useSuspenseQuery` reads the warm cache:

```tsx
import { usePrefetchQuery, usePrefetchInfiniteQuery } from '@tanstack/react-query'

function App() {
  usePrefetchQuery({ queryKey: ['post', id], queryFn: () => fetchPost(id) })
  return (
    <Suspense fallback={<Loading />}>
      <Post id={id} /> {/* uses useSuspenseQuery internally */}
    </Suspense>
  )
}
```

### experimental: prefetch in render (`query.promise` + `React.use`)

```tsx
const queryClient = new QueryClient({
  defaultOptions: { queries: { experimental_prefetchInRender: true } },
})

function TodoList({ query }: { query: UseQueryResult<Todo[]> }) {
  const data = React.use(query.promise) // suspend on the in-render promise
  return <>{/* ... */}</>
}
```

## Query Options Pattern

`queryOptions` / `infiniteQueryOptions` co-locate config and preserve types (incl. the typed `queryKey`), reusable across `useQuery`, `useSuspenseQuery`, `useQueries`, `prefetchQuery`, `setQueryData`, etc.

```tsx
// queries/posts.ts
import { queryOptions, infiniteQueryOptions } from '@tanstack/react-query'

export const postQueryOptions = (postId: string) =>
  queryOptions({
    queryKey: ['post', postId],
    queryFn: () => fetchPost(postId),
    staleTime: 1000 * 60 * 5,
  })

export const postsInfiniteOptions = () =>
  infiniteQueryOptions({
    queryKey: ['posts'],
    queryFn: fetchPage,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })

// Usage
useQuery(postQueryOptions(id))
useSuspenseQuery(postQueryOptions(id))
useInfiniteQuery(postsInfiniteOptions())
queryClient.prefetchQuery(postQueryOptions(id))
queryClient.setQueryData(postQueryOptions(id).queryKey, newPost) // typed key
```

`mutationOptions` is the analogous helper for mutations (optional `mutationKey`).

## streamedQuery

Build a `queryFn` from an `AsyncIterable`; chunks accumulate in the cache as they arrive (great for streaming/LLM responses).

```tsx
import { queryOptions, streamedQuery } from '@tanstack/react-query'

export const chatQueryOptions = (question: string) =>
  queryOptions({
    queryKey: ['chat', question],
    queryFn: streamedQuery({ streamFn: () => chatAnswer(question) }),
    staleTime: Infinity,
  })
```

## SSR & Hydration

Dehydrate the cache on the server and rehydrate on the client. Set `staleTime > 0` so prefetched data isn't immediately refetched.

```tsx
import {
  QueryClient,
  dehydrate,
  HydrationBoundary,
} from '@tanstack/react-query'

// server
const queryClient = new QueryClient()
await queryClient.prefetchQuery(postQueryOptions(id))
const state = dehydrate(queryClient)

// client
<HydrationBoundary state={state}>
  <App />
</HydrationBoundary>
```

For streaming SSR (e.g. Next.js App Router / Suspense), use the experimental `@tanstack/react-query-next-experimental` `ReactQueryStreamedHydration` provider so in-flight queries dehydrate as they resolve.
