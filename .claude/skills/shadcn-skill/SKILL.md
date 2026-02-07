---
name: shadcn-skill
description: Build React UIs with shadcn/ui components - beautiful, accessible, copy-paste components built on Radix UI and Tailwind CSS. Use when creating React components with shadcn/ui, adding UI components via the shadcn CLI (bunx shadcn@latest), customizing component themes and styles, building forms with TanStack Form or React Hook Form integration, or setting up shadcn in TanStack Start, Next.js, Vite, or other React frameworks.
---

# shadcn/ui

A collection of beautifully-designed, accessible components built on Radix UI primitives and styled with Tailwind CSS. Components are copied into your project - you own the code.

## Quick Start (TanStack Start)

```bash
# Create new TanStack Start project
bunx create-tanstack-app@latest my-app --template react
cd my-app

# Initialize shadcn/ui
bunx shadcn@latest init

# Add components
bunx shadcn@latest add button card input
```

## Adding Components

```bash
# Add individual components
bunx shadcn@latest add button
bunx shadcn@latest add dialog
bunx shadcn@latest add form

# Add multiple at once
bunx shadcn@latest add button card input label

# Add all components
bunx shadcn@latest add --all
```

Components are added to `src/components/ui/` by default.

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

## Theming Basics

shadcn/ui uses CSS variables for theming. Colors are defined in `globals.css`:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... dark mode values */
  }
}
```

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
    </Button>
  )
}
```

## CLI Configuration

The `components.json` file configures the CLI:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

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
