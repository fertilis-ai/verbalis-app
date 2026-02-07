# TanStack Query

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [useQuery](#usequery)
- [useMutation](#usemutation)
- [Query Invalidation](#query-invalidation)
- [Optimistic Updates](#optimistic-updates)
- [Infinite Queries](#infinite-queries)
- [Prefetching](#prefetching)
- [Query Options Pattern](#query-options-pattern)

## Installation

```bash
npm install @tanstack/react-query
npm install @tanstack/react-query-devtools  # Optional devtools
```

## Quick Start

```tsx
import { QueryClient, QueryClientProvider, useQuery, useMutation } from '@tanstack/react-query'

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
    queryFn: () => fetch('/api/posts').then(r => r.json()),
  })

  if (isPending) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <ul>
      {data.map(post => <li key={post.id}>{post.title}</li>)}
    </ul>
  )
}
```

## Core Concepts

### QueryClient Configuration

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,    // 5 minutes
      gcTime: 1000 * 60 * 10,      // 10 minutes (garbage collection)
      retry: 3,                     // Retry failed requests 3 times
      refetchOnWindowFocus: true,   // Refetch when window regains focus
      refetchOnReconnect: true,     // Refetch on network reconnect
    },
    mutations: {
      retry: 1,
    },
  },
})
```

### Query Keys

Query keys uniquely identify cached data:

```tsx
// Simple key
useQuery({ queryKey: ['todos'], ... })

// With variables - array format
useQuery({ queryKey: ['todo', todoId], ... })

// With filters
useQuery({ queryKey: ['todos', { status: 'done', page: 1 }], ... })
```

## useQuery

### Basic Usage

```tsx
const {
  data,              // The resolved data
  error,             // Error object if query failed
  isPending,         // True while loading (no cached data)
  isLoading,         // True on first load only
  isFetching,        // True whenever fetching (including background)
  isError,           // True if query errored
  isSuccess,         // True if query succeeded
  refetch,           // Function to manually refetch
  status,            // 'pending' | 'error' | 'success'
} = useQuery({
  queryKey: ['posts'],
  queryFn: fetchPosts,
  staleTime: 5000,
  gcTime: 10000,
  enabled: true,     // Set false to disable automatic fetching
  select: (data) => data.filter(x => x.active), // Transform data
  placeholderData: [], // Show while loading
})
```

### Dependent Queries

```tsx
const { data: user } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId),
})

const { data: projects } = useQuery({
  queryKey: ['projects', user?.id],
  queryFn: () => fetchProjects(user.id),
  enabled: !!user?.id, // Only fetch when user is available
})
```

### Parallel Queries

```tsx
import { useQueries } from '@tanstack/react-query'

const results = useQueries({
  queries: userIds.map(id => ({
    queryKey: ['user', id],
    queryFn: () => fetchUser(id),
  })),
})
```

## useMutation

### Basic Mutation

```tsx
const mutation = useMutation({
  mutationFn: (newPost: { title: string; body: string }) =>
    fetch('/api/posts', {
      method: 'POST',
      body: JSON.stringify(newPost),
    }).then(r => r.json()),
  onSuccess: (data, variables, context) => {
    console.log('Created:', data)
  },
  onError: (error, variables, context) => {
    console.error('Failed:', error)
  },
  onSettled: (data, error, variables, context) => {
    // Always runs after mutation completes
  },
})

// Usage
mutation.mutate({ title: 'Hello', body: 'World' })

// Or with async/await
const data = await mutation.mutateAsync({ title: 'Hello', body: 'World' })
```

### Mutation State

```tsx
const {
  mutate,        // Trigger mutation
  mutateAsync,   // Trigger and return promise
  isPending,     // True while mutation is in progress
  isError,       // True if mutation errored
  isSuccess,     // True if mutation succeeded
  error,         // Error object
  data,          // Returned data
  reset,         // Reset mutation state
} = useMutation({ ... })
```

## Query Invalidation

```tsx
const queryClient = useQueryClient()

// Invalidate all queries starting with 'posts'
queryClient.invalidateQueries({ queryKey: ['posts'] })

// Invalidate exact query
queryClient.invalidateQueries({ queryKey: ['posts', postId], exact: true })

// Invalidate and refetch
queryClient.invalidateQueries({
  queryKey: ['posts'],
  refetchType: 'active', // Only refetch active queries
})

// Common pattern: invalidate on mutation success
const mutation = useMutation({
  mutationFn: createPost,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  },
})
```

## Optimistic Updates

```tsx
const queryClient = useQueryClient()

const mutation = useMutation({
  mutationFn: updatePost,
  onMutate: async (newPost) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['posts', newPost.id] })

    // Snapshot previous value
    const previousPost = queryClient.getQueryData(['posts', newPost.id])

    // Optimistically update
    queryClient.setQueryData(['posts', newPost.id], newPost)

    // Return context for rollback
    return { previousPost }
  },
  onError: (err, newPost, context) => {
    // Rollback on error
    queryClient.setQueryData(['posts', newPost.id], context.previousPost)
  },
  onSettled: () => {
    // Always refetch to ensure consistency
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  },
})
```

## Infinite Queries

```tsx
import { useInfiniteQuery } from '@tanstack/react-query'

function Posts() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['posts'],
    queryFn: ({ pageParam }) =>
      fetch(`/api/posts?cursor=${pageParam}`).then(r => r.json()),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  return (
    <>
      {data?.pages.map((page, i) => (
        <div key={i}>
          {page.posts.map(post => <Post key={post.id} post={post} />)}
        </div>
      ))}
      <button
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
      >
        {isFetchingNextPage ? 'Loading...' : hasNextPage ? 'Load More' : 'No more'}
      </button>
    </>
  )
}
```

## Prefetching

```tsx
const queryClient = useQueryClient()

// Prefetch on hover
function PostLink({ postId }) {
  const prefetch = () => {
    queryClient.prefetchQuery({
      queryKey: ['post', postId],
      queryFn: () => fetchPost(postId),
      staleTime: 5000, // Only prefetch if older than 5 seconds
    })
  }

  return (
    <Link to={`/posts/${postId}`} onMouseEnter={prefetch}>
      View Post
    </Link>
  )
}

// Prefetch in route loader
const loader = async ({ params }) => {
  await queryClient.ensureQueryData({
    queryKey: ['post', params.id],
    queryFn: () => fetchPost(params.id),
  })
  return null
}
```

## Query Options Pattern

Create reusable query options for type safety:

```tsx
// queries/posts.ts
import { queryOptions } from '@tanstack/react-query'

export const postsQueryOptions = () =>
  queryOptions({
    queryKey: ['posts'],
    queryFn: fetchPosts,
    staleTime: 1000 * 60 * 5,
  })

export const postQueryOptions = (postId: string) =>
  queryOptions({
    queryKey: ['post', postId],
    queryFn: () => fetchPost(postId),
  })

// Usage in component
function Post({ postId }: { postId: string }) {
  const { data } = useQuery(postQueryOptions(postId))
  return <div>{data?.title}</div>
}

// Usage in loader
const loader = ({ params }) =>
  queryClient.ensureQueryData(postQueryOptions(params.id))
```

## useSuspenseQuery

Use with React Suspense for cleaner loading states:

```tsx
import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'

function Posts() {
  // data is guaranteed to be defined (no loading state needed)
  const { data } = useSuspenseQuery({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  })

  return <PostList posts={data} />
}

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Posts />
    </Suspense>
  )
}
```
