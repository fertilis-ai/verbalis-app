# Theming Guide

## Table of Contents
- [CSS Variables](#css-variables)
- [Color System](#color-system)
- [Dark Mode](#dark-mode)
- [Custom Themes](#custom-themes)
- [Typography](#typography)
- [Tailwind CSS v4](#tailwind-css-v4)

---

## CSS Variables

shadcn/ui uses CSS variables (HSL format) for colors. All variables are defined in your global CSS file.

### Base Variables

```css
@layer base {
  :root {
    /* Background and text */
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;

    /* Card surfaces */
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;

    /* Popover surfaces */
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;

    /* Primary action color */
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;

    /* Secondary action color */
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;

    /* Muted backgrounds */
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;

    /* Accent highlights */
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;

    /* Destructive actions */
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;

    /* Borders and inputs */
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;

    /* Border radius */
    --radius: 0.5rem;

    /* Charts (optional) */
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
  }
}
```

### Using Variables in Components

Variables are accessed via `hsl()`:

```tsx
// In Tailwind classes
<div className="bg-background text-foreground" />
<div className="border-border" />
<div className="bg-primary text-primary-foreground" />

// In custom CSS
.custom-element {
  background-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
```

---

## Color System

### Base Colors

shadcn/ui offers several base color palettes:

| Base Color | Description |
|------------|-------------|
| `slate` | Cool gray with blue undertones |
| `gray` | Pure neutral gray |
| `zinc` | Warm gray with slight warmth |
| `neutral` | True neutral (default) |
| `stone` | Warm gray with brown undertones |

### Semantic Colors

| Variable | Usage |
|----------|-------|
| `primary` | Main action buttons, links |
| `secondary` | Secondary buttons, less emphasis |
| `muted` | Subdued backgrounds, disabled states |
| `accent` | Highlights, hover states |
| `destructive` | Delete, error, danger actions |

### Color Pairing

Each semantic color has a `-foreground` variant for text:

```tsx
// Button uses primary + primary-foreground
<Button>Primary Action</Button>

// Custom usage
<div className="bg-secondary text-secondary-foreground">
  Secondary content
</div>
```

---

## Dark Mode

### Setup with next-themes (Recommended)

```bash
bun add next-themes
```

#### 1. Create Theme Provider

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

#### 2. Wrap App in Provider

```tsx
// app/layout.tsx (Next.js App Router)
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

#### 3. Create Theme Toggle

```tsx
// components/theme-toggle.tsx
"use client"

import * as React from "react"
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
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### Dark Mode CSS Variables

Add dark mode values to your CSS:

```css
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;

  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;

  --popover: 222.2 84% 4.9%;
  --popover-foreground: 210 40% 98%;

  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;

  --secondary: 217.2 32.6% 17.5%;
  --secondary-foreground: 210 40% 98%;

  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;

  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;

  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;

  --border: 217.2 32.6% 17.5%;
  --input: 217.2 32.6% 17.5%;
  --ring: 212.7 26.8% 83.9%;

  --chart-1: 220 70% 50%;
  --chart-2: 160 60% 45%;
  --chart-3: 30 80% 55%;
  --chart-4: 280 65% 60%;
  --chart-5: 340 75% 55%;
}
```

### Vite/TanStack Start Dark Mode

For non-Next.js projects, manually handle the class:

```tsx
// Simple toggle without next-themes
import { useEffect, useState } from 'react'

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    setTheme(stored || system)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  return { theme, setTheme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') }
}
```

---

## Custom Themes

### Creating a Custom Color Palette

1. Choose your primary color (HSL format)
2. Generate complementary values
3. Update CSS variables

```css
:root {
  /* Blue theme */
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;

  /* Or green theme */
  --primary: 142.1 76.2% 36.3%;
  --primary-foreground: 355.7 100% 97.3%;

  /* Or orange theme */
  --primary: 24.6 95% 53.1%;
  --primary-foreground: 60 9.1% 97.8%;
}
```

### Theme Generator

Use the official theme generator: https://ui.shadcn.com/themes

Or programmatically:

```tsx
// Generate shades from a base color
function generateTheme(baseHue: number) {
  return {
    primary: `${baseHue} 70% 50%`,
    primaryForeground: `${baseHue} 10% 98%`,
    secondary: `${baseHue} 20% 95%`,
    secondaryForeground: `${baseHue} 70% 20%`,
    accent: `${baseHue} 30% 90%`,
    accentForeground: `${baseHue} 70% 15%`,
  }
}
```

### Multiple Theme Support

```css
/* Rose theme */
.theme-rose {
  --primary: 346.8 77.2% 49.8%;
  --primary-foreground: 355.7 100% 97.3%;
}

/* Green theme */
.theme-green {
  --primary: 142.1 76.2% 36.3%;
  --primary-foreground: 355.7 100% 97.3%;
}

/* Blue theme */
.theme-blue {
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
}
```

```tsx
// Theme selector
function ThemeSelector() {
  const [color, setColor] = useState('default')

  return (
    <select
      value={color}
      onChange={(e) => {
        document.documentElement.className = e.target.value === 'default'
          ? ''
          : `theme-${e.target.value}`
        setColor(e.target.value)
      }}
    >
      <option value="default">Default</option>
      <option value="rose">Rose</option>
      <option value="green">Green</option>
      <option value="blue">Blue</option>
    </select>
  )
}
```

---

## Typography

### Font Setup

```tsx
// app/layout.tsx (Next.js)
import { Inter } from "next/font/google"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>
        {children}
      </body>
    </html>
  )
}
```

```js
// tailwind.config.js
const { fontFamily } = require("tailwindcss/defaultTheme")

module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", ...fontFamily.sans],
      },
    },
  },
}
```

### Typography Utilities

shadcn/ui components use Tailwind's typography classes:

```tsx
// Headings
<h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
  Heading 1
</h1>
<h2 className="scroll-m-20 text-3xl font-semibold tracking-tight">
  Heading 2
</h2>

// Body text
<p className="leading-7 [&:not(:first-child)]:mt-6">
  Paragraph text
</p>

// Muted text
<p className="text-sm text-muted-foreground">
  Muted helper text
</p>

// Large text
<div className="text-lg font-semibold">Large text</div>

// Small text
<small className="text-sm font-medium leading-none">Small</small>
```

---

## Tailwind CSS v4

shadcn/ui supports Tailwind CSS v4 with the updated configuration format.

### v4 Configuration

```js
// tailwind.config.js (v4)
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // ... rest of colors
      },
    },
  },
}
```

### v4 CSS Import

```css
/* globals.css */
@import "tailwindcss";

@layer base {
  :root {
    --background: 0 0% 100%;
    /* ... variables */
  }
}
```

### Key Differences from v3

| v3 | v4 |
|----|----|
| `@tailwind base;` | `@import "tailwindcss";` |
| `darkMode: ["class"]` | Built-in, use `.dark` class |
| Separate `postcss.config.js` | Often integrated |

### Updating to v4

```bash
# Install v4
bun add -D tailwindcss@next @tailwindcss/postcss@next

# Update imports in CSS
# Change @tailwind directives to @import
```
