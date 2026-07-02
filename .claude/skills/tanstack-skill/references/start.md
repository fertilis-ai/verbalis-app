# TanStack Start

> **Version / status**: `@tanstack/react-start` **v1.168.x** (verify with `npm view @tanstack/react-start version`). Start is now versioned in lockstep with TanStack Router and lives in the same monorepo (`TanStack/router`). It is in the **Release Candidate** stage: the API is considered feature-complete and stable, and v1 is expected soon — but it is not yet declared v1.0/production-stable. Start relies 100% on TanStack Router for routing.
>
> **Current setup is Vite-plugin based** (`tanstackStart` from `@tanstack/react-start/plugin/vite`). The old `app.config.ts` / Vinxi / `ssr.tsx` / `client.tsx` setup is gone. `createServerFn`, `createMiddleware`, and `createStart` are imported from `@tanstack/react-start` (no longer `@tanstack/react-start/server`).

## Table of Contents
- [Installation](#installation)
- [Project Setup](#project-setup)
- [Project Structure](#project-structure)
- [Server Functions](#server-functions)
- [Server Routes (API Routes)](#server-routes-api-routes)
- [Middleware](#middleware)
- [SSR, Streaming, and Selective SSR](#ssr-streaming-and-selective-ssr)
- [Data Loading](#data-loading)
- [Static Prerendering](#static-prerendering)
- [Deployment](#deployment)

## Installation

Scaffold a new app:

```bash
npx @tanstack/cli@latest create
```

Or add to an existing project (Start runs on Vite or Rsbuild — Vite shown throughout):

```bash
npm install @tanstack/react-start @tanstack/react-router react react-dom
npm install -D vite @vitejs/plugin-react
```

## Project Setup

### vite.config.ts

The TanStack Start Vite plugin must come **before** the React plugin.

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart(),
    // react's vite plugin must come AFTER start's plugin
    viteReact(),
  ],
})
```

### package.json

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "node .output/server/index.mjs"
  }
}
```

### src/router.tsx

Export a `getRouter()` function — Start calls it for both the client and the server. There is no separate `client.tsx` / `ssr.tsx` entry anymore.

```tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
  })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
```

### src/routes/__root.tsx

Use `HeadContent` and `Scripts` from `@tanstack/react-router` (the old `Meta`/`Scripts` from `@tanstack/react-start` is superseded). The root route renders the full HTML document.

```tsx
import type { ReactNode } from 'react'
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'TanStack Start Starter' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

### src/routes/index.tsx

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return <h1>Welcome to TanStack Start</h1>
}
```

## Project Structure

```
my-app/
├── src/
│   ├── routes/
│   │   ├── __root.tsx       # Root document (HeadContent + Scripts)
│   │   ├── index.tsx        # / (home)
│   │   ├── about.tsx        # /about
│   │   ├── api/
│   │   │   └── users.ts     # Server route -> /api/users
│   │   └── posts/
│   │       ├── index.tsx    # /posts
│   │       └── $postId.tsx  # /posts/:postId
│   ├── router.tsx           # getRouter()
│   ├── start.ts             # (optional) createStart — global middleware
│   └── routeTree.gen.ts     # generated
├── vite.config.ts           # tanstackStart() Vite plugin
├── package.json
└── tsconfig.json
```

## Server Functions

`createServerFn` creates an RPC that runs **only on the server** but is callable from anywhere (components, loaders, hooks). Import it from `@tanstack/react-start`. Default method is `GET`; use `{ method: 'POST' }` for mutations. Chain `.validator()` (parse/validate input) and `.handler()`.

```tsx
import { createServerFn } from '@tanstack/react-start'

// GET (default) — no input
export const getServerTime = createServerFn().handler(async () => {
  return new Date().toISOString()
})

// POST with validation
export const createUser = createServerFn({ method: 'POST' })
  .validator((data: { name: string; email: string }) => data)
  .handler(async ({ data }) => {
    return db.users.create({ data })
  })

// Call from anywhere — input passed via { data }
const time = await getServerTime()
const user = await createUser({ data: { name: 'John', email: 'john@example.com' } })
```

### Validation with Zod

`.validator()` accepts any standard-schema validator (Zod, Valibot, ArkType) or a plain function. The validated/inferred type flows into `data`.

```tsx
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const createPostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(10),
  authorId: z.string().uuid(),
})

export const createPost = createServerFn({ method: 'POST' })
  .validator(createPostSchema)
  .handler(async ({ data }) => {
    // data: z.infer<typeof createPostSchema>
    return db.posts.create({ data })
  })
```

### Accessing the request / headers

Use the request helpers from `@tanstack/react-start/server` inside a handler (do not pass the raw request as data).

```tsx
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

export const getProtectedData = createServerFn({ method: 'GET' }).handler(
  async () => {
    const headers = getRequestHeaders()
    const session = await getSession(headers)
    if (!session) throw new Error('Unauthorized')
    return db.data.findMany({ where: { userId: session.userId } })
  },
)
```

### Calling from a component with `useServerFn`

`useServerFn` wires a server function to router invalidation/redirect handling for use in event handlers.

```tsx
import { useServerFn } from '@tanstack/react-start'

function CreateUserButton() {
  const createUserFn = useServerFn(createUser)
  return (
    <button
      onClick={() =>
        createUserFn({ data: { name: 'John', email: 'john@example.com' } })
      }
    >
      Add User
    </button>
  )
}
```

### Server-only utilities

`createServerOnlyFn` wraps a plain helper that must never reach the client (it throws if called in the browser).

```tsx
import { createServerOnlyFn } from '@tanstack/react-start'

const getDatabaseUrl = createServerOnlyFn(() => process.env.DATABASE_URL!)
```

## Server Routes (API Routes)

Server routes (REST/JSON endpoints, webhooks) are defined on a normal file route via the `server.handlers` object. Each HTTP method returns a standard `Response`. (This replaces the older `createServerFileRoute` / `createAPIFileRoute` APIs.)

```tsx
// src/routes/api/users.ts  ->  /api/users
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/users')({
  server: {
    handlers: {
      GET: async () => {
        const users = await db.users.findMany()
        return Response.json(users)
      },
      POST: async ({ request }) => {
        const body = await request.json()
        const user = await db.users.create({ data: body })
        return Response.json(user, { status: 201 })
      },
    },
  },
})
```

Route-level middleware applies to all handlers; per-method middleware uses the `createHandlers` form:

```tsx
export const Route = createFileRoute('/api/users')({
  server: {
    middleware: [requestLogger],               // all methods
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: {
          middleware: [authMiddleware],        // this method only
          handler: () => Response.json(/* ... */),
        },
      }),
  },
})
```

## Middleware

`createMiddleware` (from `@tanstack/react-start`) builds composable middleware for server functions and server routes. The `.server()` step calls `next()` and can extend `context`.

```tsx
import { createMiddleware } from '@tanstack/react-start'

export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')
  return next({ context: { session } })
})

export const loggingMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const start = Date.now()
    const result = await next()
    console.log(`${request.method} ${request.url} (${Date.now() - start}ms)`)
    return result
  },
)

// Attach to a server function
export const getProfile = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return db.users.findUnique({ where: { id: context.session.userId } })
  })
```

### Global middleware (`src/start.ts`)

`createStart` registers middleware that runs for **every** request — SSR, server functions, and server routes.

```tsx
// src/start.ts
import { createStart, createMiddleware } from '@tanstack/react-start'

const globalLogger = createMiddleware().server(async ({ next }) => next())

export const startInstance = createStart(() => ({
  requestMiddleware: [globalLogger],
}))
```

## SSR, Streaming, and Selective SSR

Start renders routes on the server by default. Loaders returning promises stream to the client; resolve them with `<Await>` inside `<Suspense>`.

```tsx
// src/routes/posts.tsx
import { createFileRoute, Await } from '@tanstack/react-router'
import { Suspense } from 'react'

export const Route = createFileRoute('/posts')({
  loader: async () => ({
    title: 'Posts',          // available immediately
    posts: fetchPosts(),     // a promise — streamed in later
  }),
  component: PostsPage,
})

function PostsPage() {
  const { title, posts } = Route.useLoaderData()
  return (
    <div>
      <h1>{title}</h1>
      <Suspense fallback={<div>Loading posts...</div>}>
        <Await promise={posts}>
          {(resolved) => (
            <ul>{resolved.map((p) => <li key={p.id}>{p.title}</li>)}</ul>
          )}
        </Await>
      </Suspense>
    </div>
  )
}
```

### Selective SSR

Control SSR per route with the `ssr` option:

- `ssr: true` (default) — render component + run loader on the server.
- `ssr: 'data-only'` — run the loader on the server, but render the component only on the client (good for browser-only APIs while keeping data fast).
- `ssr: false` — skip the server entirely for this route (client-only; e.g. dashboards that don't need SEO).

```tsx
export const Route = createFileRoute('/dashboard')({
  ssr: 'data-only', // or false
  component: DashboardPage,
})
```

### Head / meta tags

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => fetchPost(params.postId),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData.title },
      { name: 'description', content: loaderData.excerpt },
      { property: 'og:title', content: loaderData.title },
      { property: 'og:image', content: loaderData.coverImage },
    ],
  }),
  component: PostPage,
})
```

## Data Loading

### With TanStack Query

```tsx
// src/router.tsx
import { QueryClient } from '@tanstack/react-query'

export function getRouter() {
  const queryClient = new QueryClient()
  return createRouter({ routeTree, context: { queryClient } })
}

// src/routes/posts.$postId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

const postQueryOptions = (postId: string) => ({
  queryKey: ['post', postId],
  queryFn: () => fetchPost(postId),
})

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ context, params }) => {
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

## Static Prerendering

Enable build-time HTML generation through the Vite plugin (`crawlLinks` follows internal links to discover pages):

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  plugins: [
    tanstackStart({
      prerender: { enabled: true, crawlLinks: true },
    }),
  ],
})
```

## Deployment

`vite build` (Vite + Nitro) produces a server bundle at `.output/server/index.mjs`. Start is host-agnostic; deployment is configured per provider via Vite/Nitro rather than a single legacy `preset` field.

### Node.js / Docker

```bash
npm run build
node .output/server/index.mjs
```

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

### Provider presets and plugins

- **Cloudflare Workers** — add `@cloudflare/vite-plugin`:
  ```ts
  import { cloudflare } from '@cloudflare/vite-plugin'
  // plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), tanstackStart(), viteReact()]
  ```
- **Netlify** — add `@netlify/vite-plugin-tanstack-start` to the Vite config.
- **Vercel / Railway** — deploy via the default Nitro output (no custom preset needed).
- **Bun** — `nitro({ preset: 'bun' })`.

> Official deployment partners include Cloudflare, Netlify, and Railway; Vercel, Node/Docker, Bun, and Appwrite are also documented.

### Environment variables

Vite exposes only variables prefixed with `VITE_` to the client (`import.meta.env.VITE_FOO`). Unprefixed vars (e.g. `process.env.DATABASE_URL`) stay server-only — read them inside server functions, server routes, or `createServerOnlyFn` helpers.
