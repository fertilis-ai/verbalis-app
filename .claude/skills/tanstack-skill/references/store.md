# TanStack Store

The reactive core that powers TanStack Form, Router, and other TanStack libraries. Framework-agnostic, type-safe, immutable state with fine-grained reactivity.

- Packages: `@tanstack/store` (core), `@tanstack/react-store` (React adapter)
- Version targeted: **0.11.0** (still pre-1.0; API surface changed notably in this release — see note below)

> **API change in 0.11.0:** The core was rebuilt on a signal/atom model. The standalone `Derived` and `Effect` *classes* from earlier versions were removed. Derived state is now created with `createStore(() => ...)` (returns a `ReadonlyStore`) or with `createAtom`. The React `useStore` hook still exists but is now a **deprecated alias for `useSelector`**. Code below reflects 0.11.0 exports.

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Store Class](#store-class)
- [Stores with Actions](#stores-with-actions)
- [Derived (Readonly) Stores](#derived-readonly-stores)
- [Atoms](#atoms)
- [Batching](#batching)
- [React Integration](#react-integration)
- [Subscribing Outside React](#subscribing-outside-react)
- [API Reference](#api-reference)

## Installation

```bash
npm install @tanstack/store
npm install @tanstack/react-store   # React hooks (re-exports the core)
```

## Quick Start

```tsx
import { Store } from '@tanstack/store'
import { useStore } from '@tanstack/react-store' // alias of useSelector

const countStore = new Store(0)

function Counter() {
  const count = useStore(countStore) // subscribe to whole value

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => countStore.setState((prev) => prev + 1)}>
        Increment
      </button>
    </div>
  )
}
```

## Store Class

```ts
import { Store } from '@tanstack/store'

// Constructor overloads:
//   new Store(initialValue)
//   new Store((prev?) => initialValue)       // lazy / computed initial value
//   new Store(initialValue, actionsFactory)  // with bound actions (see below)
const store = new Store(0)

store.state                     // read current value
store.get()                     // same as .state
store.setState((prev) => prev + 1) // immutable update — always returns the next state
```

Object state — spread the previous state to update a single field:

```ts
interface AppState {
  user: { name: string } | null
  theme: 'light' | 'dark'
}

const appStore = new Store<AppState>({ user: null, theme: 'light' })

appStore.setState((prev) => ({ ...prev, theme: 'dark' }))
```

## Stores with Actions

Pass an actions factory as the second constructor argument. Actions are exposed on `store.actions`.

```ts
const counter = new Store(0, ({ setState, get }) => ({
  increment: () => setState((prev) => prev + 1),
  add: (n: number) => setState((prev) => prev + n),
  reset: () => setState(() => 0),
  double: () => setState(() => get() * 2),
}))

counter.actions.increment()
counter.actions.add(5)
```

## Derived (Readonly) Stores

A store created with a getter function automatically recomputes whenever any store it reads from changes. This replaces the old `Derived` class. It returns a `ReadonlyStore` (no `setState`).

```ts
import { Store } from '@tanstack/store'
import { createStore } from '@tanstack/store'

const price = new Store(100)
const quantity = new Store(2)
const taxRate = new Store(0.1)

// Recomputes whenever price/quantity/taxRate change
const total = createStore(() => {
  const subtotal = price.state * quantity.state
  return subtotal + subtotal * taxRate.state
})

console.log(total.state) // 220
price.setState(() => 150)
console.log(total.state) // 330
```

The getter also receives the previous derived value, useful for cumulative computations:

```ts
const count = new Store(1)
const runningSum = createStore<number>((prev) => count.state + (prev ?? 0))

console.log(runningSum.state) // 1
count.setState(() => 2)
console.log(runningSum.state) // 3
```

## Atoms

Atoms are the lower-level reactive primitive (the same machinery stores are built on). `createAtom` makes a single reactive value; pass a getter for a derived/readonly atom; `createAsyncAtom` tracks a promise.

```ts
import { createAtom, createAsyncAtom } from '@tanstack/store'

const firstName = createAtom('John')
const lastName = createAtom('Doe')

// Derived (readonly) atom
const fullName = createAtom(() => `${firstName.state} ${lastName.state}`)

// Async atom: state is { status: 'pending' | 'done' | 'error', data?, error? }
const user = createAsyncAtom(async () => (await fetch('/api/me')).json())
```

## Batching

Group several updates so dependents recompute and subscribers fire once, after the batch completes.

```ts
import { batch } from '@tanstack/store'

batch(() => {
  price.setState(() => 200)
  quantity.setState(() => 5)
  taxRate.setState(() => 0.2)
}) // derived stores / subscribers update a single time
```

`flush()` is also exported to force any pending reactive work to run synchronously.

## React Integration

`useSelector` is the primary read hook. `useStore` is a deprecated alias with the same signature, kept for backward compatibility.

```tsx
import { useSelector, useStore } from '@tanstack/react-store'

function UserProfile() {
  // Subscribe to the whole value
  const state = useSelector(appStore)

  // Or select a slice — component only re-renders when the slice changes
  const theme = useSelector(appStore, (s) => s.theme)

  // Optional custom equality (third arg)
  const user = useSelector(appStore, (s) => s.user, { compare: Object.is })

  return <div>{theme}</div>
}
```

`useStore(source, selector?, compare?)` — identical behavior, accepts the compare function positionally:

```tsx
const theme = useStore(appStore, (s) => s.theme)
```

Both work with any source exposing `get()` and `subscribe()` — `Store`, `ReadonlyStore`, atoms, and readonly atoms. Other React exports: `useAtom`, `useCreateStore`, `useCreateAtom`, and `createStoreContext` (for scoping a store to a provider).

## Subscribing Outside React

```ts
const sub = appStore.subscribe((value) => {
  console.log('state changed:', value)
})

sub.unsubscribe() // cleanup
```

## API Reference

### `@tanstack/store`

```ts
class Store<T, TActions> {
  constructor(initialValue: T)
  constructor(getValue: (prev?: T) => T)
  constructor(initialValue: T, actionsFactory: ({ setState, get }) => TActions)
  state: T                                  // getter
  actions: TActions
  get(): T
  setState(updater: (prev: T) => T): void
  subscribe(fn: (value: T) => void): { unsubscribe: () => void }
}

class ReadonlyStore<T> { state: T; get(): T; subscribe(fn): Subscription } // no setState

function createStore<T>(getValue: (prev?: T) => T): ReadonlyStore<T> // derived/readonly
function createStore<T>(initialValue: T): Store<T>
function createStore<T, A>(initialValue: T, actions): Store<T, A>

function createAtom<T>(initialValue: T, options?): Atom<T>
function createAtom<T>(getValue: (prev?: T) => T, options?): ReadonlyAtom<T> // derived
function createAsyncAtom<T>(getValue: () => Promise<T>, options?): ReadonlyAtom<AsyncAtomState<T>>

function batch(fn: () => void): void
function flush(): void
function shallow<T>(a: T, b: T): boolean   // shallow-equality helper for selectors
```

### `@tanstack/react-store`

```ts
function useSelector<S, R>(source, selector?, options?: { compare? }): R   // primary read hook
function useStore<S, R>(source, selector?, compare?): R                    // deprecated alias of useSelector
function useAtom(...)              // read/create atoms in components
function useCreateStore(...) ; function useCreateAtom(...)
function createStoreContext(...)  // provider-scoped store
```

For the latest API see https://tanstack.com/store/latest/docs/overview
