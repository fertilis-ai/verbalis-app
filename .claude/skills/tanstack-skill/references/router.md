# TanStack Router

Fully type-safe React router with first-class search params, built-in data loading, and file-based or code-based routing.

**Version targeted:** `@tanstack/react-router` 1.170.x (stable) · `@tanstack/router-plugin` 1.168.x · `@tanstack/react-router-devtools` 1.167.x. APIs verified against the 1.170 docs.

## Table of Contents
- [Installation & Setup](#installation--setup)
- [Router Options](#router-options)
- [File-Based Routing](#file-based-routing)
- [Code-Based Routing](#code-based-routing)
- [Route Parameters](#route-parameters)
- [Search Parameters (Standard Schema)](#search-parameters-standard-schema)
- [Data Loading](#data-loading)
- [Navigation & Hooks](#navigation--hooks)
- [Route Context](#route-context)
- [Authenticated Routes](#authenticated-routes)
- [Error Handling & Not Found](#error-handling--not-found)
- [Code Splitting](#code-splitting)
- [SSR & Selective SSR](#ssr--selective-ssr)
- [Devtools](#devtools)

## Installation & Setup

```bash
npm install @tanstack/react-router
npm install -D @tanstack/router-plugin              # bundler plugin (file-based routing + code splitting)
npm install -D @tanstack/react-router-devtools      # devtools (separate package)
```

The `@tanstack/router-plugin` replaces the old `@tanstack/router-cli`. It ships integrations for Vite, Rspack, Webpack, and Esbuild and generates `routeTree.gen.ts` automatically during dev/build.

### Vite Configuration

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    // IMPORTANT: tanstackRouter must come BEFORE the React plugin
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true, // recommended
    }),
    react(),
  ],
})
```

> The previous `TanStackRouterVite()` named export still works but `tanstackRouter({ target: 'react' })` is the current form. For Rspack/Webpack/Esbuild import from `@tanstack/router-plugin/rspack` | `/webpack` | `/esbuild`.

### Quick Start

```tsx
// src/main.tsx
import ReactDOM from 'react-dom/client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen' // auto-generated, do not edit

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
})

// Register for full type inference on Link/navigate/params/search
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('app')!).render(
  <RouterProvider router={router} />,
)
```

## Router Options

Common `createRouter` options:

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `defaultPreload` | `false \| 'intent' \| 'viewport' \| 'render'` | `false` | `'intent'` preloads on hover/touchstart |
| `defaultPreloadDelay` | `number` | `50` | ms before an intent preload fires |
| `defaultPreloadStaleTime` | `number` | `30_000` | ms a preloaded route's data stays fresh |
| `defaultStaleTime` | `number` | `0` | loader data staleness |
| `defaultGcTime` | `number` | `1_800_000` | 30 min — loader cache GC |
| `scrollRestoration` | `boolean` | `false` | built-in scroll restoration across navigations |
| `defaultPendingComponent` | component | — | global pending UI |
| `defaultErrorComponent` | component | `ErrorComponent` | global error UI |
| `defaultNotFoundComponent` | component | — | global 404 UI |
| `notFoundMode` | `'fuzzy' \| 'root'` | `'fuzzy'` | who renders not-found |
| `context` | object | — | required when root uses `createRootRouteWithContext()` |

## File-Based Routing

The router plugin watches `src/routes/` and writes `src/routeTree.gen.ts`. Files map to URLs by convention.

### Directory Structure

```
src/routes/
├── __root.tsx           # Root layout (required)
├── index.tsx            # /
├── about.tsx            # /about
├── posts.tsx            # /posts layout (renders <Outlet/>)
├── posts.index.tsx      # /posts            (dot notation = nested)
├── posts.$postId.tsx    # /posts/$postId    (dynamic segment)
├── files.$.tsx          # /files/*          (splat / catch-all)
├── _auth.tsx            # pathless layout route (no URL segment)
├── _auth/dashboard.tsx  # /dashboard, wrapped by _auth
└── (marketing)/         # route group — parens, no URL segment
    └── pricing.tsx      # /pricing
```

Conventions: `__root` = root, `index` = exact path, `$param` = dynamic, `$` = splat, leading `_` = pathless layout, `(group)` = organizational group with no URL impact. Both directory nesting and `.` dot notation produce nested routes.

### Root Route

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet, Link } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <>
      <nav>
        <Link to="/" activeOptions={{ exact: true }}>Home</Link>
        <Link to="/posts">Posts</Link>
      </nav>
      <Outlet />
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

The path string passed to `createFileRoute('/about')` is filled in / kept in sync automatically by the plugin — if you write `createFileRoute()` the generator inserts the correct path on save.

## Code-Based Routing

For apps that don't use the file convention, build the tree manually:

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
      <Link to="/">Home</Link>
      <Outlet />
    </>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <h1>Home</h1>,
})

const postRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts/$postId',
  component: () => <h1>{postRoute.useParams().postId}</h1>,
})

const routeTree = rootRoute.addChildren([indexRoute, postRoute])
const router = createRouter({ routeTree })
```

## Route Parameters

### Dynamic Segments

```tsx
// src/routes/posts.$postId.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  component: PostPage,
})

function PostPage() {
  const { postId } = Route.useParams()
  return <h1>Post: {postId}</h1>
}
```

### Splat / Catch-All

```tsx
// src/routes/files.$.tsx — matches /files/any/deep/path
export const Route = createFileRoute('/files/$')({
  component: () => {
    const { _splat } = Route.useParams()
    return <div>Path: {_splat}</div>
  },
})
```

## Search Parameters (Standard Schema)

Search params are validated and fully typed via `validateSearch`. As of 1.x, `validateSearch` accepts any [Standard Schema](https://standardschema.dev) validator — **Zod, Valibot, and ArkType** all work directly (pass the schema, no adapter needed), as does a plain function.

### With a Standard Schema validator (Zod shown)

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const searchSchema = z.object({
  page: z.number().int().nonnegative().catch(1),
  sort: z.enum(['date', 'title', 'author']).catch('date'),
})

export const Route = createFileRoute('/posts')({
  validateSearch: searchSchema, // Standard Schema — types inferred
  component: PostsPage,
})

function PostsPage() {
  const { page, sort } = Route.useSearch() // page: number, sort: '...'
  return <div>Page {page}, sorted by {sort}</div>
}
```

Use `.catch(...)` (Zod) / `.fallback()` (Valibot) so invalid URLs degrade gracefully instead of throwing. A plain function also works: `validateSearch: (search: Record<string, unknown>) => ({ page: Number(search.page) || 1 })`.

### Updating Search Params

`search` accepts an updater that receives the previous (typed) search:

```tsx
import { useNavigate } from '@tanstack/react-router'

function NextButton() {
  const navigate = useNavigate({ from: '/posts' })
  return (
    <button onClick={() => navigate({ search: (prev) => ({ ...prev, page: prev.page + 1 }) })}>
      Next
    </button>
  )
}
```

To keep selected params across navigations, use the `retainSearchParams` middleware in the route's `search.middlewares`.

## Data Loading

### Route Loader

```tsx
// src/routes/posts.$postId.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => fetchPost(params.postId),
  pendingComponent: () => <div>Loading…</div>,
  component: PostPage,
})

function PostPage() {
  const post = Route.useLoaderData()
  return <h1>{post.title}</h1>
}
```

### loaderDeps (search-dependent loaders)

Loaders do **not** see search params by default. Declare dependencies with `loaderDeps` so the loader re-runs when they change and they participate in caching:

```tsx
export const Route = createFileRoute('/posts')({
  validateSearch: z.object({ offset: z.number().int().catch(0) }),
  loaderDeps: ({ search: { offset } }) => ({ offset }),
  loader: async ({ deps: { offset } }) => fetchPosts({ offset }),
})
```

### With TanStack Query

Prime the query cache in the loader, then read it with `useSuspenseQuery` (loader context carries the `queryClient` — see Route Context):

```tsx
import { useSuspenseQuery } from '@tanstack/react-query'

const postQuery = (postId: string) => ({
  queryKey: ['post', postId],
  queryFn: () => fetch(`/api/posts/${postId}`).then((r) => r.json()),
})

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(postQuery(params.postId)),
  component: PostPage,
})

function PostPage() {
  const { postId } = Route.useParams()
  const { data: post } = useSuspenseQuery(postQuery(postId))
  return <h1>{post.title}</h1>
}
```

> Streaming: deferred promises returned from a loader stream automatically when awaited via Suspense on the client — the old explicit `defer()` / `<Await>` API has been removed in favor of returning promises directly.

## Navigation & Hooks

### Link

```tsx
import { Link } from '@tanstack/react-router'

<Link to="/about">About</Link>
<Link to="/posts/$postId" params={{ postId: '123' }}>View</Link>
<Link to="/posts" search={{ page: 2, sort: 'date' }}>Page 2</Link>

// Active styling
<Link to="/about" activeProps={{ className: 'active' }}>About</Link>

// Per-link preload override (router-wide via defaultPreload)
<Link to="/posts/$postId" params={{ postId: '123' }} preload="intent">View</Link>
```

### Programmatic Navigation

```tsx
import { useNavigate, useRouter } from '@tanstack/react-router'

function Component() {
  const navigate = useNavigate()
  const router = useRouter()

  navigate({ to: '/posts/$postId', params: { postId: '123' } })
  navigate({ to: '/posts', search: { page: 2 } })
  navigate({ to: '/login', replace: true })
  router.invalidate() // re-run loaders for the current match tree
}
```

### Core Hooks

| Hook | Returns |
|------|---------|
| `Route.useParams()` / `useParams({ from })` | typed path params |
| `Route.useSearch()` / `useSearch({ from })` | typed search params |
| `Route.useLoaderData()` / `useLoaderData({ from })` | loader return value |
| `Route.useRouteContext()` / `useRouteContext({ from })` | merged route context |
| `useNavigate()` | imperative navigation fn |
| `useRouter()` | router instance (`invalidate`, `navigate`, history…) |
| `useMatch` / `useMatches` / `useMatchRoute` | match info / route matching |

Prefer the `Route.useX()` methods inside a route's own components (zero `from` needed); use the standalone `useX({ from: '/path' })` form elsewhere.

## Route Context

Context flows from the router down through `beforeLoad`, and is available in `loader`, `beforeLoad`, and components. Type it at the root with `createRootRouteWithContext`.

```tsx
// src/routes/__root.tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
  auth: AuthState
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => <Outlet />,
})
```

```tsx
// src/main.tsx — provide the context when creating the router
const router = createRouter({
  routeTree,
  context: { queryClient, auth: undefined! }, // auth injected below
})

function App() {
  const auth = useAuth()
  return <RouterProvider router={router} context={{ auth }} />
}
```

Child routes can extend context by returning from `beforeLoad`; the return value is merged into context for descendants.

## Authenticated Routes

The idiomatic pattern is a **pathless layout route** (`_authenticated.tsx`) whose `beforeLoad` guards all children:

```tsx
// src/routes/_authenticated.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href }, // return here after login
      })
    }
  },
  // no component needed — defaults to <Outlet />
})
```

Any route under `_authenticated/` (e.g. `_authenticated/dashboard.tsx` → `/dashboard`) is now protected. `redirect()` is imported from `@tanstack/react-router` and thrown from `beforeLoad`/`loader`.

## Error Handling & Not Found

### Error Boundary

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params }) => fetchPost(params.postId),
  errorComponent: ({ error, reset }) => (
    <div>
      <h1>Error</h1>
      <p>{error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  ),
  component: PostPage,
})
```

### Not Found

`notFound()` (imported from `@tanstack/react-router`) is thrown for missing resources; non-matching URLs trigger it automatically.

```tsx
import { createFileRoute, notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await getPost(params.postId)
    if (!post) throw notFound()
    return post
  },
  notFoundComponent: () => <p>Post not found</p>,
  component: PostPage,
})
```

Set a global handler with `defaultNotFoundComponent` on `createRouter`, or `notFoundComponent` on `__root`. `notFoundMode: 'fuzzy'` (default) renders the nearest route's `notFoundComponent`; `'root'` always uses the root's.

## Code Splitting

Route config is split into **critical** (always bundled: path parsing, `validateSearch`, `loader`, `beforeLoad`, context) and **non-critical** (lazy-loadable: `component`, `pendingComponent`, `errorComponent`, `notFoundComponent`).

**Automatic (recommended):** set `autoCodeSplitting: true` in the plugin — components are split without changing your code. Works only with file-based routing + a supported bundler.

**Manual via `.lazy.tsx`:** keep critical config in `route.tsx` and move the component into `route.lazy.tsx` with `createLazyFileRoute`:

```tsx
// posts.tsx — critical (stays in main bundle)
export const Route = createFileRoute('/posts')({ loader: fetchPosts })

// posts.lazy.tsx — non-critical (lazy loaded)
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/posts')({
  component: Posts,
})

function Posts() { /* ... */ }
```

Don't split the `loader` — it's already async and splitting it disables preloading benefits.

## SSR & Selective SSR

With TanStack Start (or a custom SSR setup), control rendering per route via the `ssr` option. Default is `true` (full SSR); change the global default with `defaultSsr` in `createStart`.

```tsx
export const Route = createFileRoute('/posts/$postId')({
  ssr: true,         // (default) beforeLoad + loader + component on server
  // ssr: 'data-only' // run beforeLoad + loader on server, render component on client only
  // ssr: false       // skip server beforeLoad/loader/render entirely (client-only)
  loader: () => fetchPost(),
  component: PostPage,
})
```

`'data-only'` is useful when a component needs browser APIs but you still want server-fetched data hydrated in. Streaming is handled by returning promises from loaders and resolving them with Suspense on the client.

## Devtools

Devtools moved to their own package: `@tanstack/react-router-devtools` (import `TanStackRouterDevtools`).

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      {/* tree-shaken out of production builds automatically */}
      <TanStackRouterDevtools position="bottom-right" />
    </>
  ),
})
```
