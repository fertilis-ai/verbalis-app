# TanStack Store (Alpha)

> **Status**: Alpha - API is unstable. Used internally by TanStack Form and Router.

## Installation

```bash
npm install @tanstack/store
npm install @tanstack/react-store  # For React integration
```

## Overview

TanStack Store is a reactive state management library that powers TanStack Form and Router. It provides immutable state with fine-grained reactivity.

## Quick Start

```tsx
import { Store } from '@tanstack/store'
import { useStore } from '@tanstack/react-store'

// Create a store
const countStore = new Store(0)

function Counter() {
  const count = useStore(countStore)

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

## Creating Stores

### Simple Store

```ts
import { Store } from '@tanstack/store'

const store = new Store(initialValue)

// Read state
console.log(store.state)

// Update state
store.setState((prev) => newValue)
```

### Object Store

```ts
interface AppState {
  user: { name: string; email: string } | null
  theme: 'light' | 'dark'
  count: number
}

const appStore = new Store<AppState>({
  user: null,
  theme: 'light',
  count: 0,
})

// Update specific field
appStore.setState((prev) => ({
  ...prev,
  theme: 'dark',
}))
```

## React Integration

### useStore Hook

```tsx
import { useStore } from '@tanstack/react-store'

function UserProfile() {
  // Subscribe to entire store
  const state = useStore(appStore)

  // Or select specific slice
  const user = useStore(appStore, (state) => state.user)

  return <div>{user?.name}</div>
}
```

### Selector Pattern

```tsx
// Only re-renders when selected value changes
function ThemeToggle() {
  const theme = useStore(appStore, (state) => state.theme)

  return (
    <button onClick={() => appStore.setState((s) => ({
      ...s,
      theme: s.theme === 'light' ? 'dark' : 'light',
    }))}>
      Current: {theme}
    </button>
  )
}
```

## Subscribing to Changes

```ts
// Subscribe outside React
const unsubscribe = appStore.subscribe(() => {
  console.log('State changed:', appStore.state)
})

// Cleanup
unsubscribe()
```

## Derived State

```ts
import { derived } from '@tanstack/store'

const todosStore = new Store<Todo[]>([])

const completedTodos = derived(todosStore, (todos) =>
  todos.filter((t) => t.completed)
)

// Use in React
function CompletedList() {
  const completed = useStore(completedTodos)
  return <ul>{completed.map(/* ... */)}</ul>
}
```

For the latest API and examples, see: https://tanstack.com/store/latest
