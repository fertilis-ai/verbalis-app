# TanStack Router

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [File-Based Routing](#file-based-routing)
- [Code-Based Routing](#code-based-routing)
- [Route Parameters](#route-parameters)
- [Search Parameters](#search-parameters)
- [Data Loading](#data-loading)
- [Navigation](#navigation)
- [Route Context](#route-context)
- [Error Handling](#error-handling)

## Installation

```bash
npm install @tanstack/react-router
npm install -D @tanstack/router-plugin  # Vite plugin for file-based routing
```

### Vite Configuration

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [TanStackRouterVite(), react()],
})
```

## Quick Start

```tsx
// src/main.tsx
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = createRouter({ routeTree })

// Register for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  return <RouterProvider router={router} />
}
```

## File-Based Routing

### Directory Structure

```
src/routes/
├── __root.tsx          # Root layout (required)
├── index.tsx           # / (home page)
├── about.tsx           # /about
├── posts/
│   ├── index.tsx       # /posts
│   └── $postId.tsx     # /posts/:postId (dynamic)
├── _layout.tsx         # Layout route (no URL segment)
└── _layout/
    └── settings.tsx    # Uses _layout as parent
```

### Root Route

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet, Link } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
        <Link to="/posts">Posts</Link>
      </nav>
      <main>
        <Outlet />
      </main>
      <TanStackRouterDevtools position="bottom-right" />
    </>
  ),
})
```

### Basic Route

```tsx
// src/routes/about.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: AboutPage,
})

function AboutPage() {
  return <h1>About Us</h1>
}
```

## Code-Based Routing

```tsx
import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  Link,
} from '@tanstack/react-router'

const rootRoute = createRootRoute({
  component: () => (
    <>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
      </nav>
      <Outlet />
    </>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <h1>Home</h1>,
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: () => <h1>About</h1>,
})

const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

const router = createRouter({ routeTree })
```

## Route Parameters

### Dynamic Segments

```tsx
// src/routes/posts/$postId.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  component: PostPage,
})

function PostPage() {
  const { postId } = Route.useParams()
  return <h1>Post: {postId}</h1>
}
```

### Catch-All Routes

```tsx
// src/routes/files/$.tsx - matches /files/any/path/here
export const Route = createFileRoute('/files/$')({
  component: () => {
    const { _splat } = Route.useParams()
    return <div>Path: {_splat}</div>
  },
})
```

## Search Parameters

### Basic Search Params

```tsx
// src/routes/posts.tsx
import { createFileRoute } from '@tanstack/react-router'

type PostsSearch = {
  page?: number
  filter?: string
}

export const Route = createFileRoute('/posts')({
  validateSearch: (search: Record<string, unknown>): PostsSearch => ({
    page: Number(search.page) || 1,
    filter: (search.filter as string) || '',
  }),
  component: PostsPage,
})

function PostsPage() {
  const { page, filter } = Route.useSearch()
  return <div>Page: {page}, Filter: {filter}</div>
}
```

### With Zod Validation

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const searchSchema = z.object({
  page: z.number().catch(1),
  sort: z.enum(['date', 'title', 'author']).catch('date'),
  order: z.enum(['asc', 'desc']).catch('desc'),
})

export const Route = createFileRoute('/posts')({
  validateSearch: searchSchema,
  component: PostsPage,
})

function PostsPage() {
  const { page, sort, order } = Route.useSearch()
  // Types are fully inferred: page: number, sort: 'date' | 'title' | 'author', etc.
  return <div>Page {page}, sorted by {sort} {order}</div>
}
```

### Updating Search Params

```tsx
import { useNavigate } from '@tanstack/react-router'

function Pagination() {
  const navigate = useNavigate()
  const { page } = Route.useSearch()

  const nextPage = () => {
    navigate({
      search: (prev) => ({ ...prev, page: page + 1 }),
    })
  }

  return <button onClick={nextPage}>Next Page</button>
}
```

## Data Loading

### Route Loader

```tsx
// src/routes/posts/$postId.tsx
import { createFileRoute } from '@tanstack/react-router'

async function fetchPost(postId: string) {
  const res = await fetch(`/api/posts/${postId}`)
  if (!res.ok) throw new Error('Post not found')
  return res.json()
}

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    return await fetchPost(params.postId)
  },
  component: PostPage,
})

function PostPage() {
  const post = Route.useLoaderData()
  return <h1>{post.title}</h1>
}
```

### With TanStack Query

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

const postQueryOptions = (postId: string) => ({
  queryKey: ['post', postId],
  queryFn: () => fetch(`/api/posts/${postId}`).then(r => r.json()),
})

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ context, params }) => {
    // Ensure data is cached before render
    await context.queryClient.ensureQueryData(postQueryOptions(params.postId))
  },
  component: PostPage,
})

function PostPage() {
  const { postId } = Route.useParams()
  const { data: post } = useSuspenseQuery(postQueryOptions(postId))
  return <h1>{post.title}</h1>
}
```

### Pending States

```tsx
export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  pendingComponent: () => <div>Loading posts...</div>,
  component: PostsPage,
})
```

## Navigation

### Link Component

```tsx
import { Link } from '@tanstack/react-router'

// Basic link
<Link to="/about">About</Link>

// With params
<Link to="/posts/$postId" params={{ postId: '123' }}>View Post</Link>

// With search params
<Link to="/posts" search={{ page: 2, sort: 'date' }}>Page 2</Link>

// Active styling
<Link
  to="/about"
  activeProps={{ className: 'active' }}
  inactiveProps={{ className: 'inactive' }}
>
  About
</Link>

// Preload on hover (default behavior)
<Link to="/posts/$postId" params={{ postId: '123' }} preload="intent">
  View Post
</Link>
```

### Programmatic Navigation

```tsx
import { useNavigate, useRouter } from '@tanstack/react-router'

function Component() {
  const navigate = useNavigate()
  const router = useRouter()

  // Navigate to path
  const goToPost = () => {
    navigate({ to: '/posts/$postId', params: { postId: '123' } })
  }

  // Navigate with search
  const goToPage = () => {
    navigate({ to: '/posts', search: { page: 2 } })
  }

  // Replace instead of push
  const replace = () => {
    navigate({ to: '/login', replace: true })
  }

  // Invalidate and reload current route
  const reload = () => {
    router.invalidate()
  }

  return <button onClick={goToPost}>Go to Post</button>
}
```

## Route Context

### Setting Up Context

```tsx
// src/main.tsx
import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  context: {
    queryClient,
    auth: undefined!, // Will be provided by RouterProvider
  },
})

// In App component
function App() {
  const auth = useAuth()
  return <RouterProvider router={router} context={{ auth }} />
}
```

### Using Context in Routes

```tsx
// src/routes/posts/$postId.tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ context, params }) => {
    const { queryClient, auth } = context
    if (!auth.isAuthenticated) throw redirect({ to: '/login' })
    return queryClient.ensureQueryData(postQueryOptions(params.postId))
  },
})
```

## Error Handling

### Route Error Boundary

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    if (!post) throw new Error('Post not found')
    return post
  },
  errorComponent: ({ error }) => (
    <div>
      <h1>Error</h1>
      <p>{error.message}</p>
    </div>
  ),
  component: PostPage,
})
```

### Not Found Routes

```tsx
// src/routes/__root.tsx
export const Route = createRootRoute({
  notFoundComponent: () => (
    <div>
      <h1>404</h1>
      <p>Page not found</p>
      <Link to="/">Go Home</Link>
    </div>
  ),
})
```

### Redirects

```tsx
import { redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/protected')({
  beforeLoad: async ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: '/protected' },
      })
    }
  },
})
```
