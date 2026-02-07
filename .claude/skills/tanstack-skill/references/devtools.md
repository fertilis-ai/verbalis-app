# TanStack Devtools

## Table of Contents
- [Query Devtools](#query-devtools)
- [Router Devtools](#router-devtools)

## Query Devtools

### Installation

```bash
npm install @tanstack/react-query-devtools
```

### Basic Setup

```tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

### Configuration Options

```tsx
<ReactQueryDevtools
  initialIsOpen={false}           // Start closed
  buttonPosition="bottom-right"   // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  position="bottom"               // Panel position: 'top' | 'bottom' | 'left' | 'right'
  client={queryClient}            // Custom QueryClient (optional)
  styleNonce="your-csp-nonce"     // CSP nonce for inline styles
/>
```

### Embedded Panel Mode

```tsx
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { useState } from 'react'

function App() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div>
      <button onClick={() => setIsOpen(!isOpen)}>
        Toggle Query Devtools
      </button>
      {isOpen && (
        <ReactQueryDevtoolsPanel
          onClose={() => setIsOpen(false)}
          style={{ height: '400px' }}
        />
      )}
    </div>
  )
}
```

### Production Build

Devtools are automatically excluded in production builds. To include them in production:

```tsx
import { lazy, Suspense } from 'react'

const ReactQueryDevtoolsProduction = lazy(() =>
  import('@tanstack/react-query-devtools/build/modern/production.js').then(
    (d) => ({ default: d.ReactQueryDevtools })
  )
)

function App() {
  const [showDevtools, setShowDevtools] = useState(false)

  return (
    <>
      <YourApp />
      {showDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtoolsProduction />
        </Suspense>
      )}
    </>
  )
}
```

### Features

- View all queries and their states (fresh, fetching, stale, inactive)
- Inspect query data and errors
- Manually trigger refetch, invalidate, or remove queries
- View query timelines and retry counts
- Filter queries by key
- Toggle between dark/light themes

## Router Devtools

### Installation

```bash
npm install @tanstack/react-router-devtools
```

### Basic Setup

```tsx
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </>
  ),
})
```

### Configuration Options

```tsx
<TanStackRouterDevtools
  position="bottom-right"      // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  initialIsOpen={false}        // Start closed
  toggleButtonProps={{         // Style the toggle button
    style: { marginBottom: '4rem' },
  }}
/>
```

### Production Build

Router devtools are also excluded from production automatically. For production debugging:

```tsx
import { lazy, Suspense } from 'react'

const TanStackRouterDevtoolsProduction = lazy(() =>
  import('@tanstack/react-router-devtools').then((res) => ({
    default: res.TanStackRouterDevtools,
  }))
)

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      {process.env.NODE_ENV === 'development' && (
        <TanStackRouterDevtools />
      )}
      {process.env.SHOW_DEVTOOLS && (
        <Suspense>
          <TanStackRouterDevtoolsProduction />
        </Suspense>
      )}
    </>
  ),
})
```

### Features

- View route tree and matches
- Inspect route params and search params
- View loader data and pending states
- Navigate through route history
- Debug route matching behavior
- View preloaded routes

## Browser Extensions

### Query Devtools Browser Extension

Available for Chrome, Firefox, and Edge. Provides the same functionality as the embedded devtools but in the browser's DevTools panel.

Install from:
- Chrome Web Store
- Firefox Add-ons
- Edge Add-ons

### Usage

1. Install the extension
2. Open browser DevTools (F12)
3. Navigate to the "React Query" tab
4. No code changes needed - works automatically with any React Query app
