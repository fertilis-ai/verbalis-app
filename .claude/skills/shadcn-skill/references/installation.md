# Installation Guide

> Current shadcn/ui targets **Tailwind CSS v4**. Vite/React projects use the
> `@tailwindcss/vite` plugin, the CSS entry is a single `@import "tailwindcss";`, and
> there is no color config in `tailwind.config.js`. Theme variables (OKLCH) live in your
> CSS file — see [theming.md](theming.md).

## Table of Contents

- [TanStack Start](#tanstack-start)
- [Next.js](#nextjs)
- [Vite](#vite)
- [Manual Installation](#manual-installation)
- [components.json Configuration](#componentsjson-configuration)
- [MCP Server](#mcp-server)

The CLI runs equally with `npx`, `pnpm dlx`, `yarn dlx`, or `bunx`. Examples below use
`npx`.

## TanStack Start

```bash
# Create new TanStack Start project
bunx create-tanstack-app@latest my-app --template react
cd my-app

# Initialize shadcn/ui
npx shadcn@latest init

# Select options when prompted:
# - Base color: Neutral (default), Stone, Zinc, Gray, or Slate
# - (Style is fixed to "new-york"; "default" is deprecated)

# Add components
npx shadcn@latest add button card input
```

### TanStack Start Configuration

After init, your `components.json` should look like:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

## Next.js

```bash
# Create new Next.js project (ships with Tailwind v4)
bunx create-next-app@latest my-app --typescript --tailwind --eslint --app
cd my-app

# Initialize shadcn/ui
npx shadcn@latest init

# For App Router with RSC, answer "yes" to React Server Components
```

### Next.js App Router Structure

```plaintext
app/
├── globals.css          # @import "tailwindcss" + @theme inline + OKLCH vars
├── layout.tsx           # Root layout with providers
└── page.tsx
components/
├── ui/                  # shadcn components go here
│   ├── button.tsx
│   ├── card.tsx
│   └── ...
└── ...
lib/
└── utils.ts             # cn() utility
```

## Vite

```bash
# Create new Vite + React project
bun create vite my-app --template react-ts
cd my-app
bun install

# Install Tailwind v4 and the Vite plugin
bun add tailwindcss @tailwindcss/vite

# Initialize shadcn/ui
npx shadcn@latest init
```

### CSS Entry

Replace the contents of `src/index.css` with a single import (init then injects the
theme variables):

```css
@import "tailwindcss";
```

### Vite Plugin + Path Aliases

`vite.config.ts`:

```ts
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

`tsconfig.json` **and** `tsconfig.app.json` both need the alias:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## Manual Installation

If you prefer not to use the CLI (Tailwind v4):

### 1. Install Dependencies

```bash
bun add class-variance-authority clsx tailwind-merge lucide-react tw-animate-css
```

> Note: under Tailwind v4 the old `tailwindcss-animate` plugin is replaced by
> `tw-animate-css`, imported from CSS rather than configured as a JS plugin.

### 2. Create the `cn()` Utility

```ts
// lib/utils.ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### 3. Set Up CSS (Tailwind v4)

In your CSS entry file, import Tailwind, enable the dark variant, map tokens with
`@theme inline`, and define the OKLCH variables. The full scaffold is in
[theming.md](theming.md#full-globalscss-scaffold). Minimal shape:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* ...one mapping per token */
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  /* ...rest of the OKLCH tokens */
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  /* ...dark overrides */
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
}
```

There is **no** `tailwind.config.js` color block in v4 — `@theme inline` replaces it.

## components.json Configuration

Full configuration options:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "registries": {
    "@shadcn": "https://ui.shadcn.com/r/{name}.json"
  }
}
```

### Options Explained

| Field | Meaning |
|-------|---------|
| `style` | Only `"new-york"` is valid (`"default"` is deprecated) |
| `rsc` | `true` for React Server Components (Next.js App Router) |
| `tsx` | `true` for TypeScript, `false` for JavaScript |
| `tailwind.config` | `""` for Tailwind v4 (path to config only for v3) |
| `tailwind.css` | Path to global CSS file |
| `tailwind.baseColor` | `neutral`, `stone`, `zinc`, `gray`, or `slate` |
| `tailwind.cssVariables` | Use CSS variables for colors (recommended) |
| `tailwind.prefix` | Optional prefix for generated Tailwind classes |
| `iconLibrary` | `"lucide"` (default for new-york) or `"radix"` |
| `aliases.*` | Import path aliases |
| `registries` | Map `@namespace` → registry URL template |

## MCP Server

Let the agent browse registries and install components conversationally.

```bash
# Configure for Claude Code (writes .mcp.json)
npx shadcn@latest mcp init --client claude
```

Resulting `.mcp.json`:

```json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

Restart Claude Code, run `/mcp` to verify, then prompt e.g. "add a login form using the
shadcn registry" or "list all available components".

### Namespaced & URL Installs

```bash
# From a registry URL
npx shadcn@latest add https://example.com/r/hero.json

# From a configured namespace
npx shadcn@latest add @acme/auth-card
npx shadcn@latest view @acme/auth-card @v0/dashboard
npx shadcn@latest search @shadcn -q "table"
```
