# TanStack DB

> **Status**: Early / pre-1.0. `@tanstack/react-db` is `0.1.x` (latest `0.1.86`), `@tanstack/db` core is `0.6.x`. The API is still evolving and may change between minor releases. Verify against the live docs before relying on it in production.

TanStack DB is a reactive client store for your API: it normalizes data into **collections**, runs sub-millisecond incremental **live queries** over them, and applies **transactional optimistic mutations** with automatic rollback. It builds on TanStack Query and works with sync engines like ElectricSQL.

## Table of Contents
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Defining a Collection](#defining-a-collection)
- [Collection Types](#collection-types)
- [Live Queries (useLiveQuery)](#live-queries-uselivequery)
- [The Query Builder](#the-query-builder)
- [Optimistic Mutations](#optimistic-mutations)
- [Persistence Handlers](#persistence-handlers)
- [createOptimisticAction](#createoptimisticaction)

## Installation

```bash
npm install @tanstack/react-db

# Plus one or more collection adapters, depending on your data source:
npm install @tanstack/query-db-collection @tanstack/react-query  # REST via TanStack Query
npm install @tanstack/electric-db-collection                     # ElectricSQL sync
npm install @tanstack/trailbase-db-collection                    # TrailBase
# localStorage / localOnly collections ship inside @tanstack/react-db
```

Core building blocks (`createCollection`, operators, `createOptimisticAction`, `createTransaction`) live in `@tanstack/db` and are re-exported from `@tanstack/react-db`.

## Core Concepts

- **Collection** — a typed, keyed set of objects loaded from a source (REST, Electric, localStorage, in-memory). Each item is identified by `getKey`.
- **Live query** — a reactive query over one or more collections, recomputed incrementally (differential dataflow) as data changes. Returned via `useLiveQuery`.
- **Optimistic mutation** — `insert` / `update` / `delete` on a collection apply immediately to local state, overlaid on synced data, and are persisted by handlers. State rolls back automatically if the handler rejects.

## Defining a Collection

`createCollection` takes an *options object* produced by one of the adapter helpers. Always provide `getKey`; a `schema` (e.g. Zod/Valibot/standard-schema) is optional but gives type inference and validation.

```tsx
import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient } from '@tanstack/react-query'
import { z } from 'zod'

const queryClient = new QueryClient()

const todoSchema = z.object({
  id: z.string(),
  text: z.string(),
  completed: z.boolean(),
})

const todoCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['todos'],
    queryFn: async () => (await fetch('/api/todos')).json(),
    queryClient,
    getKey: (item) => item.id,
    schema: todoSchema,
  })
)
```

## Collection Types

Each type is created by passing its `*Options` helper to `createCollection`.

### Query collection — `queryCollectionOptions` (`@tanstack/query-db-collection`)
Loads data through a TanStack Query `queryFn`. Best for REST/GraphQL backends. See the full example above. Add `onInsert` / `onUpdate` / `onDelete` to persist mutations (see [Persistence Handlers](#persistence-handlers)).

### Electric collection — `electricCollectionOptions` (`@tanstack/electric-db-collection`)
Real-time sync from a Postgres database via ElectricSQL shapes.

```tsx
import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'

const todosCollection = createCollection(
  electricCollectionOptions({
    shapeOptions: {
      url: '/api/todos',
      params: { table: 'todos' },
    },
    getKey: (item) => item.id,
  })
)
```

### TrailBase collection — `trailBaseCollectionOptions` (`@tanstack/trailbase-db-collection`)
Syncs against a TrailBase backend record API.

### localStorage collection — `localStorageCollectionOptions` (`@tanstack/react-db`)
Persists to `localStorage` (or `sessionStorage`) and syncs across browser tabs.

```tsx
import { createCollection, localStorageCollectionOptions } from '@tanstack/react-db'

const settingsCollection = createCollection(
  localStorageCollectionOptions({
    id: 'settings',
    storageKey: 'app-settings',
    storage: localStorage, // optional; defaults to localStorage
    getKey: (item) => item.id,
  })
)
```

### localOnly collection — `localOnlyCollectionOptions` (`@tanstack/react-db`)
In-memory only, no persistence. Useful for ephemeral UI state. Supports the same optional `onInsert` / `onUpdate` / `onDelete` lifecycle hooks.

```tsx
import { createCollection, localOnlyCollectionOptions } from '@tanstack/react-db'

const tempCollection = createCollection(
  localOnlyCollectionOptions({
    id: 'temp-data',
    getKey: (item) => item.id,
  })
)
```

## Live Queries (useLiveQuery)

`useLiveQuery` takes a query-builder callback and returns reactive results. The result includes `data` plus state flags (`isLoading`, etc.).

```tsx
import { useLiveQuery } from '@tanstack/react-db'
import { eq } from '@tanstack/db'

function TodoList() {
  const { data: todos, isLoading } = useLiveQuery((q) =>
    q
      .from({ todo: todoCollection })
      .where(({ todo }) => eq(todo.completed, false))
      .select(({ todo }) => ({ id: todo.id, text: todo.text }))
  )

  if (isLoading) return <div>Loading…</div>
  return (
    <ul>
      {todos.map((t) => <li key={t.id}>{t.text}</li>)}
    </ul>
  )
}
```

Pass a dependency array as the second argument to re-run when external values change:

```tsx
const { data } = useLiveQuery(
  (q) => q.from({ todos: todoCollection }).where(({ todos }) => gt(todos.priority, minPriority)),
  [minPriority]
)
```

`useLiveSuspenseQuery` is the Suspense-enabled variant. For a query outside React, use `createLiveQueryCollection` from `@tanstack/db`.

## The Query Builder

Built up fluently inside the `useLiveQuery` callback (`q`). Each clause receives a named-collection object so you can reference fields.

```tsx
import { eq, and, gt } from '@tanstack/db'

const { data } = useLiveQuery((q) =>
  q
    .from({ todos: todoCollection })
    // Join another collection; third arg is join type: 'inner' | 'left' | 'right' | 'full'
    .join(
      { lists: listCollection },
      ({ todos, lists }) => eq(lists.id, todos.listId),
      'inner'
    )
    .where(({ todos }) => and(gt(todos.priority, 5), eq(todos.status, 'pending')))
    .orderBy(({ todos }) => todos.createdAt, 'asc')
    .select(({ todos, lists }) => ({
      id: todos.id,
      title: todos.title,
      listName: lists.name,
    }))
)
```

- `.from({ alias: collection })` — source collection (required).
- `.join({ alias: collection }, onFn, type)` — join across collections.
- `.where(rowFn)` — filter; combine predicates with operators.
- `.select(rowFn)` — project fields (omit to return whole rows).
- `.orderBy(rowFn, 'asc' | 'desc')` — sort.
- `.findOne()` — return a single result instead of an array.

**Operators** (from `@tanstack/db`): `eq`, `gt`, `gte`, `lt`, `lte`, `and`, `or`, `not`, `inArray`, `like`, etc.

## Optimistic Mutations

Collections expose `insert`, `update`, and `delete`. They apply locally and immediately, then invoke the matching persistence handler. **`update` uses a draft callback** — mutate the draft proxy, do not return a new object.

```tsx
// Insert
todoCollection.insert({ id: crypto.randomUUID(), text: 'Buy groceries', completed: false })

// Update — mutate the draft proxy
todoCollection.update(todo.id, (draft) => {
  draft.completed = true
})

// Delete
todoCollection.delete(todo.id)
```

If a mutation's handler rejects, the optimistic change is rolled back automatically.

## Persistence Handlers

`onInsert` / `onUpdate` / `onDelete` on the collection options persist optimistic mutations to your backend. Each receives a `{ transaction }` whose `mutations` array describes the change. Mutation entries expose `original`, `modified`, `changes`, `key`, and `type`.

```tsx
const todoCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['todos'],
    queryFn: fetchTodos,
    queryClient,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified } = transaction.mutations[0]
      await api.todos.create(modified)
    },
    onUpdate: async ({ transaction }) => {
      const { original, changes } = transaction.mutations[0]
      await api.todos.update(original.id, changes)
    },
    onDelete: async ({ transaction }) => {
      const { key } = transaction.mutations[0]
      await api.todos.delete(key)
    },
  })
)
```

The handler should resolve only once the server write has synced back into the collection (e.g. let the query refetch, or call `collection.utils.refetch()`), so the optimistic overlay can be safely discarded.

## createOptimisticAction

For mutations that span multiple collections, guess a server transform, or need custom optimistic logic, use `createOptimisticAction` from `@tanstack/db`. `onMutate` applies optimistic state synchronously; `mutationFn` persists to the server and waits for the write to sync back.

```tsx
import { createOptimisticAction } from '@tanstack/db'

const addTodo = createOptimisticAction<string>({
  onMutate: (text) => {
    // Applies local optimistic state immediately
    todoCollection.insert({ id: crypto.randomUUID(), text, completed: false })
  },
  mutationFn: async (text) => {
    const res = await fetch('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ text, completed: false }),
    })
    const result = await res.json()
    // Ensure the server write has synced back before resolving
    await todoCollection.utils.refetch()
    return result
  },
})

// Returns a transaction; await `.isPersisted.promise` to know when it settled
const tx = addTodo('New Todo Item')
```

For full manual control over transaction boundaries, use `createTransaction` from `@tanstack/db`.

---

For the latest API and examples, see: https://tanstack.com/db/latest/docs/overview
