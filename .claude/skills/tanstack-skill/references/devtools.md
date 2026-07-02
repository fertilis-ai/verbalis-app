# TanStack Devtools

Two coexisting ways to debug a TanStack app:

1. **Per-library devtools** — the standalone `ReactQueryDevtools` / `TanStackRouterDevtools`
   floating widgets, each with its own toggle button.
2. **Unified TanStack Devtools** (newer) — a single shell (`TanStackDevtools`) that hosts every
   library's panel as a *plugin* behind one trigger. Recommended for apps using more than one
   TanStack library.

Current versions (stable unless noted):

| Package                              | Version  | Purpose                                    |
|--------------------------------------|----------|--------------------------------------------|
| `@tanstack/react-query-devtools`     | 5.101.0  | Query devtools (widget + `...Panel`)       |
| `@tanstack/react-router-devtools`    | 1.167.0  | Router devtools (widget + `...Panel`)      |
| `@tanstack/react-form-devtools`      | 0.2.29   | Form devtools panel (beta)                 |
| `@tanstack/react-devtools`           | 0.10.5   | Unified shell `TanStackDevtools` (beta)    |
| `@tanstack/devtools`                 | 0.12.2   | Framework-agnostic core for the shell      |
| `@tanstack/devtools-vite`            | latest   | Vite plugin: source links, prod stripping  |

## Table of Contents
- [Query Devtools](#query-devtools)
- [Router Devtools](#router-devtools)
- [Unified TanStack Devtools](#unified-tanstack-devtools)
- [Vite Plugin](#vite-plugin)
- [TanStack Start](#tanstack-start)
- [Production Lazy Loading](#production-lazy-loading)
- [Browser Extension](#browser-extension)

## Query Devtools

```bash
npm i @tanstack/react-query-devtools
```

### Floating widget

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

### Props (`ReactQueryDevtools`)

```tsx
<ReactQueryDevtools
  initialIsOpen={false}          // start with the panel open
  buttonPosition="bottom-right"  // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'relative'
  position="bottom"             // panel side: 'top' | 'bottom' | 'left' | 'right'
  client={queryClient}          // custom QueryClient (defaults to nearest provider)
  errorTypes={[]}               // declared errors selectable to simulate per query
  styleNonce="csp-nonce"        // nonce for injected <style> (CSP)
  shadowDOMTarget={shadowRoot}  // render styles into a ShadowRoot instead of <head>
/>
```

### Embedded panel (`ReactQueryDevtoolsPanel`)

Use the panel component directly to control placement yourself (and to plug into the unified
shell). It needs no toggle button.

```tsx
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { useState } from 'react'

function App() {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <button onClick={() => setIsOpen((o) => !o)}>Toggle Query Devtools</button>
      {isOpen && (
        <ReactQueryDevtoolsPanel onClose={() => setIsOpen(false)} style={{ height: 400 }} />
      )}
    </>
  )
}
```

## Router Devtools

```bash
npm i @tanstack/react-router-devtools
```

### Floating widget

```tsx
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
})
```

Rendered inside the root route, it auto-connects to the router. Pass `router` explicitly when
rendering outside the route tree.

### Props (`TanStackRouterDevtools`)

```tsx
<TanStackRouterDevtools
  router={router}              // router instance (auto-detected inside the route tree)
  initialIsOpen={false}        // start open
  position="bottom-left"       // logo/toggle: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  panelProps={{ className }}   // props merged onto the panel
  toggleButtonProps={{ style }}// props merged onto the toggle button
  closeButtonProps={{ onClick }}
  shadowDOMTarget={shadowRoot} // render styles into a ShadowRoot instead of <head>
  containerElement="footer"    // wrapper element (default 'footer')
/>
```

### Embedded panel (`TanStackRouterDevtoolsPanel`)

```tsx
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

<TanStackRouterDevtoolsPanel router={router} shadowDOMTarget={shadowContainer} />
```

## Unified TanStack Devtools

```bash
npm i -D @tanstack/react-devtools
# usually paired with the Vite plugin (optional but recommended):
npm i -D @tanstack/devtools-vite
```

Mount one `TanStackDevtools` shell and pass each library's **`*Panel`** component as a plugin.
Each plugin is `{ name, render }` (use `component` instead of `render` in Vue). Render it once,
near the app root.

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { ReactFormDevtoolsPanel } from '@tanstack/react-form-devtools'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <TanStackDevtools
      plugins={[
        { name: 'TanStack Query', render: <ReactQueryDevtoolsPanel /> },
        { name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel router={router} /> },
        { name: 'TanStack Form', render: <ReactFormDevtoolsPanel /> },
      ]}
    />
  </StrictMode>,
)
```

### Shell config

The `config` prop customizes the shell; settings persist to `localStorage` (and can be changed
at runtime via the settings panel).

```tsx
<TanStackDevtools
  config={{
    defaultOpen: false,                 // open panel on mount
    hideUntilHover: false,              // hide trigger until hover
    position: 'bottom-right',           // trigger: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'middle-left' | 'middle-right'
    panelLocation: 'bottom',            // panel: 'top' | 'bottom'
    openHotkey: ['Control', '~'],       // toggle hotkey
    inspectHotkey: ['Shift', 'Alt', 'CtrlOrMeta'],
    requireUrlFlag: false,              // only show when urlFlag is present
    urlFlag: 'tanstack-devtools',       // the query param to look for
    theme: 'dark',                      // 'light' | 'dark' (defaults to system)
    triggerHidden: false,               // hide trigger entirely (hotkey still works)
  }}
  plugins={[/* ... */]}
/>
```

## Vite Plugin

`@tanstack/devtools-vite` adds "Go to source", console piping, and — most importantly —
strips devtools from production builds by default (`removeDevtoolsOnBuild: true`). Place it
before the framework plugin.

```ts
// vite.config.ts
import { devtools } from '@tanstack/devtools-vite'
import react from '@vitejs/plugin-react'

export default {
  plugins: [
    devtools(), // removeDevtoolsOnBuild defaults to true
    react(),
  ],
}
```

Notable options: `injectSource`, `consolePiping`, `enhancedLogs`, `removeDevtoolsOnBuild`,
`eventBusConfig` (server event bus, default port 4206), and `editor` (defaults to VS Code).

## TanStack Start

TanStack Start ships the unified devtools wired up. Render `TanStackDevtools` in your root
route's component (after `<Outlet />`) and register the Query/Router panels as plugins, exactly
as above. The Router panel auto-connects to Start's router; pass the `queryClient` to the Query
panel's provider as usual. Add `devtools()` from `@tanstack/devtools-vite` to the Start Vite
config so the panels are stripped from production bundles automatically.

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <TanStackDevtools
        plugins={[
          { name: 'TanStack Query', render: <ReactQueryDevtoolsPanel /> },
          { name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel /> },
        ]}
      />
    </>
  ),
})
```

## Production Lazy Loading

Devtools are excluded from production builds. To debug a production build, lazy-load them on
demand. The current production entry point is the package's `/production` export.

```tsx
import { lazy, Suspense, useState } from 'react'

const ReactQueryDevtoolsProduction = lazy(() =>
  import('@tanstack/react-query-devtools/production').then((d) => ({
    default: d.ReactQueryDevtools,
  })),
)

function App() {
  const [showDevtools, setShowDevtools] = useState(false)

  // expose a global toggle: window.toggleDevtools()
  // @ts-expect-error
  window.toggleDevtools = () => setShowDevtools((v) => !v)

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

The Router devtools lazy-load the same way:

```tsx
const RouterDevtoolsProduction = lazy(() =>
  import('@tanstack/react-router-devtools').then((d) => ({
    default: d.TanStackRouterDevtools,
  })),
)
```

When using the Vite plugin, prefer leaving `removeDevtoolsOnBuild: true` and gating the unified
shell behind `config.requireUrlFlag` instead of hand-rolling lazy imports.

## Browser Extension

A standalone **TanStack Query** browser extension (Chrome / Firefox / Edge) mirrors the embedded
Query devtools without any code. Install it, open browser DevTools (F12), and use the
"TanStack Query" tab — it attaches automatically to any React Query app on the page.
