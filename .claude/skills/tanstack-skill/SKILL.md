---
name: tanstack-skill
description: Implement TanStack libraries in TypeScript React apps. Use when building with Query (data fetching/caching), Router (type-safe routing), Table (data grids), Form (type-safe forms), Virtual (list virtualization), Start (full-stack framework), or integrating multiple TanStack tools together.
---

# TanStack Skill

High-quality, type-safe libraries for React applications. TanStack libraries share consistent patterns: headless architecture, full TypeScript support, and framework-agnostic cores.

## Quick Start

Install the libraries you need:

```bash
# Core libraries (most common)
npm install @tanstack/react-query @tanstack/react-router @tanstack/react-table

# Additional libraries
npm install @tanstack/react-form @tanstack/react-virtual @tanstack/react-ranger

# Devtools (development only)
npm install @tanstack/react-query-devtools @tanstack/react-router-devtools
```

## Library Ecosystem

| Library | Package | Status | Purpose |
|---------|---------|--------|---------|
| **Query** | `@tanstack/react-query` | Stable | Server state, data fetching, caching |
| **Router** | `@tanstack/react-router` | Stable | Type-safe routing, file-based routes |
| **Table** | `@tanstack/react-table` | Stable | Headless data tables, sorting, filtering |
| **Form** | `@tanstack/react-form` | Stable | Type-safe forms, validation |
| **Virtual** | `@tanstack/react-virtual` | Stable | Virtualize large lists at 60FPS |
| **Start** | `@tanstack/react-start` | RC | Full-stack framework with SSR |
| **Ranger** | `@tanstack/react-ranger` | Stable | Range/multi-range sliders |
| **DB** | `@tanstack/react-db` | Beta | Reactive client-first data store |
| **AI** | `@tanstack/ai` | Alpha | Multi-provider AI SDK |
| **Pacer** | `@tanstack/pacer` | Beta | Debounce, throttle, rate limiting |
| **Store** | `@tanstack/react-store` | Alpha | Reactive state management |
| **Config** | `@tanstack/config` | Stable | Package build/publish tooling |

## Common Provider Setup

Most TanStack libraries require a provider at the app root:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 3,
    },
  },
})

// Import your generated route tree
import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  context: { queryClient }, // Share QueryClient with router
})

// Register router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

## Common Patterns

### Query + Router Integration

Load data in route loaders, access via Query:

```tsx
// routes/posts.$postId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

const postQueryOptions = (postId: string) => ({
  queryKey: ['post', postId],
  queryFn: () => fetch(`/api/posts/${postId}`).then(r => r.json()),
})

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ context, params }) => {
    // Ensure data is in cache before rendering
    return context.queryClient.ensureQueryData(postQueryOptions(params.postId))
  },
  component: PostComponent,
})

function PostComponent() {
  const { postId } = Route.useParams()
  const { data: post } = useSuspenseQuery(postQueryOptions(postId))

  return <article><h1>{post.title}</h1></article>
}
```

### Table + Virtual Integration

Virtualize large tables for performance:

```tsx
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

function VirtualizedTable({ data, columns }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const { rows } = table.getRowModel()
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  })

  return (
    <div ref={parentRef} style={{ height: '500px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index]
          return (
            <div
              key={row.id}
              style={{
                position: 'absolute',
                top: 0,
                transform: `translateY(${virtualRow.start}px)`,
                height: `${virtualRow.size}px`,
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <span key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </span>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

### Form + Query Integration

Submit forms and invalidate queries:

```tsx
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'

function CreatePostForm() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data: { title: string; content: string }) =>
      fetch('/api/posts', {
        method: 'POST',
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
  })

  const form = useForm({
    defaultValues: { title: '', content: '' },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value)
    },
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
      <form.Field
        name="title"
        validators={{
          onChange: ({ value }) => !value ? 'Title required' : undefined,
        }}
        children={(field) => (
          <input
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
          />
        )}
      />
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving...' : 'Create Post'}
      </button>
    </form>
  )
}
```

## TypeScript Best Practices

### Infer Types from Query Functions

```tsx
// Define query options factory
const postsQueryOptions = () => ({
  queryKey: ['posts'] as const,
  queryFn: async () => {
    const res = await fetch('/api/posts')
    return res.json() as Promise<Post[]>
  },
})

// Type is inferred automatically
const { data } = useQuery(postsQueryOptions())
// data: Post[] | undefined
```

### Type-Safe Router Params

```tsx
// Router automatically infers param types from path
const Route = createFileRoute('/users/$userId/posts/$postId')({
  component: () => {
    const { userId, postId } = Route.useParams()
    // userId: string, postId: string - fully typed
  },
})
```

### Type-Safe Search Params

```tsx
import { z } from 'zod'

const searchSchema = z.object({
  page: z.number().catch(1),
  sort: z.enum(['date', 'title']).catch('date'),
})

const Route = createFileRoute('/posts')({
  validateSearch: searchSchema,
  component: () => {
    const { page, sort } = Route.useSearch()
    // page: number, sort: 'date' | 'title' - validated and typed
  },
})
```

## Reference Files

Read these for detailed API documentation:

| When you need... | Read |
|------------------|------|
| Data fetching, caching, mutations | `references/query.md` |
| Routing, navigation, loaders | `references/router.md` |
| Data tables, sorting, filtering | `references/table.md` |
| Form state, validation | `references/form.md` |
| List virtualization | `references/virtual.md` |
| Full-stack SSR framework | `references/start.md` |
| Range sliders | `references/ranger.md` |
| Package tooling | `references/config.md` |
| Development tools | `references/devtools.md` |
| Reactive data store (beta) | `references/db.md` |
| AI integrations (alpha) | `references/ai.md` |
| Debounce/throttle (beta) | `references/pacer.md` |
| State management (alpha) | `references/store.md` |

## Sources

Official TanStack documentation for each library:

| Library | Documentation |
|---------|---------------|
| Query | https://tanstack.com/query/latest |
| Router | https://tanstack.com/router/latest |
| Table | https://tanstack.com/table/latest |
| Form | https://tanstack.com/form/latest |
| Virtual | https://tanstack.com/virtual/latest |
| Start | https://tanstack.com/start/latest |
| Ranger | https://tanstack.com/ranger/latest |
| DB | https://tanstack.com/db/latest |
| AI | https://tanstack.com/ai/latest |
| Pacer | https://tanstack.com/pacer/latest |
| Store | https://tanstack.com/store/latest |
| Config | https://tanstack.com/config/latest |

GitHub: https://github.com/TanStack
