# TanStack Start

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Server Functions](#server-functions)
- [SSR and Streaming](#ssr-and-streaming)
- [Data Loading](#data-loading)
- [Middleware](#middleware)
- [Deployment](#deployment)

## Installation

```bash
npm create @tanstack/start@latest my-app
cd my-app
npm install
npm run dev
```

Or add to existing project:

```bash
npm install @tanstack/react-start @tanstack/react-router vinxi
```

## Quick Start

### app.config.ts

```ts
import { defineConfig } from '@tanstack/react-start/config'
import viteTsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  vite: {
    plugins: [viteTsConfigPaths()],
  },
})
```

### app/routes/__root.tsx

```tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Meta, Scripts } from '@tanstack/react-start'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
```

### app/routes/index.tsx

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return <h1>Welcome to TanStack Start</h1>
}
```

### app/router.tsx

```tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
```

### app/client.tsx

```tsx
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start'
import { createRouter } from './router'

const router = createRouter()

hydrateRoot(document, <StartClient router={router} />)
```

### app/ssr.tsx

```tsx
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { createRouter } from './router'

export default createStartHandler({
  createRouter,
})(defaultStreamHandler)
```

## Project Structure

```
my-app/
├── app/
│   ├── routes/
│   │   ├── __root.tsx      # Root layout
│   │   ├── index.tsx       # / (home)
│   │   ├── about.tsx       # /about
│   │   └── posts/
│   │       ├── index.tsx   # /posts
│   │       └── $postId.tsx # /posts/:postId
│   ├── router.tsx          # Router configuration
│   ├── client.tsx          # Client entry point
│   └── ssr.tsx             # Server entry point
├── app.config.ts           # TanStack Start config
├── package.json
└── tsconfig.json
```

## Server Functions

### Basic Server Function

```tsx
// app/functions/users.ts
import { createServerFn } from '@tanstack/react-start/server'

export const getUsers = createServerFn({ method: 'GET' })
  .handler(async () => {
    const users = await db.users.findMany()
    return users
  })

export const createUser = createServerFn({ method: 'POST' })
  .validator((data: { name: string; email: string }) => data)
  .handler(async ({ data }) => {
    const user = await db.users.create({ data })
    return user
  })
```

### Using Server Functions

```tsx
// app/routes/users.tsx
import { createFileRoute } from '@tanstack/react-router'
import { getUsers, createUser } from '../functions/users'

export const Route = createFileRoute('/users')({
  loader: async () => {
    return await getUsers()
  },
  component: UsersPage,
})

function UsersPage() {
  const users = Route.useLoaderData()

  const handleCreateUser = async () => {
    const newUser = await createUser({
      data: { name: 'John', email: 'john@example.com' },
    })
    console.log('Created:', newUser)
  }

  return (
    <div>
      <ul>
        {users.map(user => <li key={user.id}>{user.name}</li>)}
      </ul>
      <button onClick={handleCreateUser}>Add User</button>
    </div>
  )
}
```

### Server Function with Validation

```tsx
import { createServerFn } from '@tanstack/react-start/server'
import { z } from 'zod'

const createPostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(10),
  authorId: z.string().uuid(),
})

export const createPost = createServerFn({ method: 'POST' })
  .validator(createPostSchema)
  .handler(async ({ data }) => {
    // data is typed as z.infer<typeof createPostSchema>
    const post = await db.posts.create({ data })
    return post
  })
```

### Server Function with Context

```tsx
import { createServerFn } from '@tanstack/react-start/server'

export const getProtectedData = createServerFn({ method: 'GET' })
  .handler(async (ctx) => {
    const session = await getSession(ctx.request)
    if (!session) {
      throw new Error('Unauthorized')
    }
    return await db.data.findMany({ where: { userId: session.userId } })
  })
```

## SSR and Streaming

### Streaming Data

```tsx
// app/routes/posts.tsx
import { createFileRoute, Await } from '@tanstack/react-router'
import { Suspense } from 'react'

export const Route = createFileRoute('/posts')({
  loader: async () => {
    return {
      // Immediately available
      title: 'Posts',
      // Streamed after initial render
      posts: fetchPosts(), // Returns a promise
    }
  },
  component: PostsPage,
})

function PostsPage() {
  const { title, posts } = Route.useLoaderData()

  return (
    <div>
      <h1>{title}</h1>
      <Suspense fallback={<div>Loading posts...</div>}>
        <Await promise={posts}>
          {(resolvedPosts) => (
            <ul>
              {resolvedPosts.map(post => <li key={post.id}>{post.title}</li>)}
            </ul>
          )}
        </Await>
      </Suspense>
    </div>
  )
}
```

### Head Meta Tags

```tsx
// app/routes/posts.$postId.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    return await fetchPost(params.postId)
  },
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
// app/router.tsx
import { QueryClient } from '@tanstack/react-query'

export function createRouter() {
  const queryClient = new QueryClient()

  return createTanStackRouter({
    routeTree,
    context: { queryClient },
  })
}

// app/routes/posts.$postId.tsx
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

## Middleware

```tsx
// app/middleware.ts
import { createMiddleware } from '@tanstack/react-start/server'

export const authMiddleware = createMiddleware()
  .server(async ({ next, request }) => {
    const session = await getSession(request)
    return next({ context: { session } })
  })

export const loggingMiddleware = createMiddleware()
  .server(async ({ next, request }) => {
    console.log(`${request.method} ${request.url}`)
    const start = Date.now()
    const result = await next()
    console.log(`Completed in ${Date.now() - start}ms`)
    return result
  })

// Usage in server function
export const getProfile = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { session } = context
    if (!session) throw new Error('Not authenticated')
    return await db.users.findUnique({ where: { id: session.userId } })
  })
```

## Deployment

### Build

```bash
npm run build
```

### Node.js

```bash
node .output/server/index.mjs
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY .output .output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

### Vercel

```json
// vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".output"
}
```

### Environment Variables

```ts
// app.config.ts
export default defineConfig({
  server: {
    preset: 'node-server', // or 'vercel', 'netlify', 'cloudflare-pages'
  },
})
```
