# Theming Guide

## Table of Contents
- [How Theming Works (Tailwind v4)](#how-theming-works-tailwind-v4)
- [Full globals.css Scaffold](#full-globalscss-scaffold)
- [Color System](#color-system)
- [Dark Mode](#dark-mode)
- [Custom Themes](#custom-themes)
- [Typography](#typography)
- [Migrating from HSL / Tailwind v3](#migrating-from-hsl--tailwind-v3)

---

## How Theming Works (Tailwind v4)

shadcn/ui (current) uses **CSS variables in the OKLCH color space** and wires them to
Tailwind utilities with the **`@theme inline`** directive — directly in your CSS entry
file. There is **no color configuration in `tailwind.config.js`**.

Three pieces work together:

1. **`:root` / `.dark`** define raw theme values (`--background: oklch(1 0 0)`).
2. **`@theme inline`** maps each value to a Tailwind color token
   (`--color-background: var(--background)`), which generates `bg-background`,
   `text-background`, `border-background`, etc.
3. **`@custom-variant dark`** enables the `dark:` variant against the `.dark` class.

Because tokens are real Tailwind colors, you use them as plain utilities and **never
wrap them in `hsl(...)`**:

```tsx
<div className="bg-background text-foreground" />
<div className="bg-primary text-primary-foreground" />
<div className="border-border" />
```

When you need a raw value in custom CSS, reference the variable directly:

```css
.custom-element {
  background-color: var(--primary);
  color: var(--primary-foreground);
}
```

---

## Full globals.css Scaffold

This is the complete default `neutral` theme produced by `shadcn init` on Tailwind v4.

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

---

## Color System

### Base Colors

`shadcn init` scaffolds from one of these neutral base palettes (chosen by `baseColor`
in `components.json`):

| Base Color | Description |
|------------|-------------|
| `neutral`  | True neutral (default) |
| `stone`    | Warm gray with brown undertones |
| `zinc`     | Cool neutral gray |
| `gray`     | Pure neutral gray |
| `slate`    | Cool gray with blue undertones |

### Semantic Tokens

| Token | Usage |
|-------|-------|
| `background` / `foreground` | Page surface and default text |
| `card` / `popover` | Raised surfaces (each with `-foreground`) |
| `primary` | Main action buttons, links |
| `secondary` | Secondary buttons, less emphasis |
| `muted` | Subdued backgrounds, helper text (`muted-foreground`) |
| `accent` | Highlights, hover states |
| `destructive` | Delete, error, danger actions |
| `border` / `input` / `ring` | Borders, input borders, focus rings |
| `chart-1`…`chart-5` | Chart series colors |
| `sidebar*` | Sidebar surface, text, primary, accent, border, ring |

Each surface color pairs with a `-foreground` token for readable text:

```tsx
<div className="bg-secondary text-secondary-foreground">Secondary content</div>
```

---

## Dark Mode

Dark mode is driven by a `.dark` class on `<html>`. The `@custom-variant dark` line in
your CSS enables `dark:` utilities, and the `.dark` block overrides the theme values.

### Next.js — next-themes (Recommended)

```bash
bun add next-themes
```

```tsx
// components/theme-provider.tsx
"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

```tsx
// app/layout.tsx
import { ThemeProvider } from "@/components/theme-provider"

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

```tsx
// components/theme-toggle.tsx
"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ThemeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### Vite / TanStack Start — manual toggle

For non-Next.js projects, toggle the `.dark` class yourself:

```tsx
import { useEffect, useState } from 'react'

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    setTheme(stored ?? system)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  return { theme, setTheme, toggle: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')) }
}
```

---

## Custom Themes

To customize, edit the OKLCH values in `:root` and `.dark`. OKLCH is
`oklch(lightness chroma hue)` — lightness `0`–`1`, chroma `0`+ (0 = gray), hue
`0`–`360`.

```css
:root {
  /* Blue primary */
  --primary: oklch(0.55 0.18 255);
  --primary-foreground: oklch(0.985 0 0);
}

.dark {
  --primary: oklch(0.7 0.16 255);
  --primary-foreground: oklch(0.205 0 0);
}
```

### Theme Generator

Use the official generator to produce a full OKLCH palette:
https://ui.shadcn.com/themes — or browse community themes at https://tweakcn.com.

### Multiple Theme Classes

Layer additional theme classes for runtime switching. Because tokens are plain CSS
variables, overriding a class is enough:

```css
.theme-rose {
  --primary: oklch(0.55 0.22 17);
  --primary-foreground: oklch(0.985 0 0);
}
.theme-green {
  --primary: oklch(0.55 0.16 150);
  --primary-foreground: oklch(0.985 0 0);
}
```

```tsx
function ThemeSelector() {
  const [color, setColor] = useState('default')
  return (
    <select
      value={color}
      onChange={(e) => {
        const v = e.target.value
        document.documentElement.classList.remove('theme-rose', 'theme-green')
        if (v !== 'default') document.documentElement.classList.add(`theme-${v}`)
        setColor(v)
      }}
    >
      <option value="default">Default</option>
      <option value="rose">Rose</option>
      <option value="green">Green</option>
    </select>
  )
}
```

---

## Typography

### Font Setup (Tailwind v4)

Expose a font as a CSS variable, then register it in `@theme inline`:

```tsx
// app/layout.tsx (Next.js)
import { Inter } from "next/font/google"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
```

```css
/* globals.css */
@theme inline {
  --font-sans: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
}
```

For Vite/TanStack, load the font via `@font-face` or a `<link>` and set `--font-sans`
the same way.

### Typography Utilities

```tsx
<h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">Heading 1</h1>
<h2 className="scroll-m-20 text-3xl font-semibold tracking-tight">Heading 2</h2>
<p className="leading-7 [&:not(:first-child)]:mt-6">Paragraph text</p>
<p className="text-sm text-muted-foreground">Muted helper text</p>
<small className="text-sm font-medium leading-none">Small</small>
```

---

## Migrating from HSL / Tailwind v3

If you have an older shadcn project on Tailwind v3 + HSL variables:

| Old (v3 / HSL) | New (v4 / OKLCH) |
|----------------|------------------|
| `@tailwind base; @tailwind components; @tailwind utilities;` | `@import "tailwindcss";` |
| Colors in `tailwind.config.js` `theme.extend.colors` | `@theme inline` in CSS; `tailwind.config: ""` |
| `--primary: 222.2 47.4% 11.2%` (HSL triplet) | `--primary: oklch(0.205 0 0)` |
| `bg-primary` → `hsl(var(--primary))` | `bg-primary` reads the variable directly |
| `darkMode: ["class"]` in config | `@custom-variant dark (&:is(.dark *));` |
| `tailwindcss-animate` plugin | `tw-animate-css` (imported in CSS) |

The CLI can assist parts of this: `npx shadcn@latest add` against a v4 project writes
the new format. Review the official Tailwind v4 upgrade guide for the build-tool changes
(PostCSS plugin → `@tailwindcss/vite` or `@tailwindcss/postcss`).
