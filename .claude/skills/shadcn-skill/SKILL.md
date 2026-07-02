---
name: shadcn-skill
description: Build React UIs with shadcn/ui components - beautiful, accessible, copy-paste components built on Radix UI and Tailwind CSS v4. Use when creating React components with shadcn/ui, adding UI components via the shadcn CLI (npx/pnpm dlx/bunx shadcn@latest add), installing from registries or namespaced/MCP sources, customizing OKLCH themes and CSS variables, building forms with TanStack Form or React Hook Form integration, configuring the shadcn MCP server, or setting up shadcn in TanStack Start, Next.js, Vite, or other React frameworks.
---

# shadcn/ui

A collection of beautifully-designed, accessible components built on Radix UI primitives and styled with Tailwind CSS. Components are copied into your project - you own the code.

> **Current stack (2026):** shadcn/ui defaults to **Tailwind CSS v4** and the **`new-york` style** (the `default` style is deprecated). Theme colors use the **OKLCH** color space and are wired up with the `@theme inline` directive — there is no `tailwind.config.js` for colors anymore. See [references/theming.md](references/theming.md).

## Quick Start (TanStack Start)

```bash
# Create new TanStack Start project
bunx create-tanstack-app@latest my-app --template react
cd my-app

# Initialize shadcn/ui (npx / pnpm dlx / bunx all work)
npx shadcn@latest init

# Add components
npx shadcn@latest add button card input
```

## Adding Components

```bash
# Add individual components
npx shadcn@latest add button
npx shadcn@latest add dialog
npx shadcn@latest add form

# Add multiple at once
npx shadcn@latest add button card input label

# Add all components
npx shadcn@latest add --all

# Inspect a component's files before installing
npx shadcn@latest view button

# Search a registry
npx shadcn@latest search @shadcn -q "calendar"
```

Components are added to `src/components/ui/` by default.

### Registries & Namespaced Components

The CLI installs from registries, not just the official one. Add from a URL, or from a namespaced registry configured in `components.json`:

```bash
# From any registry URL
npx shadcn@latest add https://example.com/r/login-form.json

# From a namespaced registry (e.g. @acme, @v0)
npx shadcn@latest add @acme/auth-card
npx shadcn@latest view @acme/auth-card @v0/dashboard
```

## MCP Server

shadcn ships an MCP server so the agent can browse registries and install components conversationally ("add a login form", "show me all available components").

```bash
# Configure for Claude Code (writes .mcp.json)
npx shadcn@latest mcp init --client claude
```

This adds the server to your project's `.mcp.json`:

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

Restart Claude Code and run `/mcp` to verify the connection. The server can list/search components across configured registries (public, private, third-party) and add them by natural-language request.

## Component Categories

| Category | Components |
|----------|------------|
| **Form & Input** | Button, Input, Textarea, Checkbox, Radio Group, Select, Switch, Slider, Toggle, Toggle Group, Date Picker, Calendar, Combobox, Form, Label, Input OTP |
| **Layout & Navigation** | Accordion, Breadcrumb, Navigation Menu, Sidebar, Tabs, Separator, Scroll Area, Resizable |
| **Overlays & Dialogs** | Dialog, Alert Dialog, Sheet, Drawer, Popover, Tooltip, Hover Card, Context Menu, Dropdown Menu, Menubar, Command |
| **Feedback & Status** | Alert, Toast (Sonner), Progress, Skeleton, Badge, Avatar |
| **Data Display** | Card, Table, Data Table, Carousel, Aspect Ratio, Collapsible, Pagination |
| **Charts** | Area, Bar, Line, Pie, Radar, Radial (via Recharts) |

## Core Components

### Button

```tsx
import { Button } from "@/components/ui/button"

// Variants
<Button variant="default">Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Sizes
<Button size="default">Default</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>

// States
<Button disabled>Disabled</Button>
<Button asChild><a href="/login">Login</a></Button>
```

### Input & Label

```tsx
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

<div className="grid w-full max-w-sm items-center gap-1.5">
  <Label htmlFor="email">Email</Label>
  <Input type="email" id="email" placeholder="Email" />
</div>
```

### Card

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card Description</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card Content</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Dialog

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"

<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline">Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>
        Dialog description goes here.
      </DialogDescription>
    </DialogHeader>
    <div className="py-4">Dialog content</div>
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline">Cancel</Button>
      </DialogClose>
      <Button>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Select

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

<Select>
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="Select option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
    <SelectItem value="option3">Option 3</SelectItem>
  </SelectContent>
</Select>
```

## Form with TanStack Form

```tsx
import { useForm } from '@tanstack/react-form'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function ContactForm() {
  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
    },
    onSubmit: async ({ value }) => {
      console.log(value)
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="space-y-4"
    >
      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) =>
            !value ? 'Name is required' : undefined,
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Name</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.errors.length > 0 && (
              <p className="text-sm text-destructive">
                {field.state.meta.errors.join(', ')}
              </p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field name="email">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Email</Label>
            <Input
              id={field.name}
              type="email"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <Button type="submit">Submit</Button>
    </form>
  )
}
```

## Theming Basics (Tailwind v4 + OKLCH)

shadcn/ui uses CSS variables in the **OKLCH** color space, mapped to Tailwind utilities via `@theme inline`. There is no color config in `tailwind.config.js` — everything lives in your CSS entry file:

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  /* ...one --color-* mapping per token */
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  /* ...card, popover, secondary, muted, accent, destructive,
     border, input, ring, chart-1..5, sidebar-* */
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  /* ...dark overrides */
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
}
```

Tokens are consumed as plain utilities (`bg-primary`, `text-muted-foreground`) — you no longer wrap them in `hsl(var(--token))`. See [references/theming.md](references/theming.md) for the full scaffold (all variables, sidebar/chart tokens, dark mode setup, custom themes).

### Dark Mode Toggle

```tsx
import { useTheme } from "next-themes" // or your theme provider
import { Button } from "@/components/ui/button"
import { Moon, Sun } from "lucide-react"

function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
```

## CLI Configuration

The `components.json` file configures the CLI. For Tailwind v4, leave `tailwind.config` blank and only `new-york` is a valid `style`:

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

- `style`: only `"new-york"` (the `"default"` style is deprecated).
- `tailwind.config`: `""` for Tailwind v4 (no JS color config).
- `iconLibrary`: `"lucide"` (default for new-york) or `"radix"`.
- `registries`: map namespace → URL template for `add @namespace/component`.

## cn() Utility

The `cn()` helper merges Tailwind classes conditionally:

```tsx
import { cn } from "@/lib/utils"

<div className={cn(
  "flex items-center",
  isActive && "bg-primary text-primary-foreground",
  className
)} />
```

## References

| When you need... | Read |
|------------------|------|
| Framework-specific installation | [references/installation.md](references/installation.md) |
| Full component catalog with examples | [references/components.md](references/components.md) |
| Theming, colors, dark mode | [references/theming.md](references/theming.md) |
| Form patterns, data tables, common recipes | [references/patterns.md](references/patterns.md) |

## Sources

- Official Documentation: https://ui.shadcn.com
- GitHub: https://github.com/shadcn-ui/ui
- Component Registry: https://ui.shadcn.com/r
