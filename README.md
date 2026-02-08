# Sapio

A local-first personal AI assistant that runs as a desktop app (via Tauri) or in the browser. Sapio keeps your data on-device, learns over time, and acts autonomously on your behalf.

## Tech Stack

- **React 19** + **TypeScript** - UI with strict type safety
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** + **shadcn/ui** - Styling and accessible components
- **Tauri v2** - Native desktop app (macOS, Windows, Linux)
- **pi-mono** - AI agent runtime, memory, tasks, MCP extensions
- **Turborepo** + **Bun** - Monorepo build system and package manager

## Getting Started

First, install the dependencies:

```bash
bun install
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.

## Project Structure

```
sapio-app/
├── apps/
│   └── web/            # React frontend + Tauri desktop runtime
│       ├── src/        # React source code
│       └── src-tauri/  # Tauri Rust backend
├── packages/
│   ├── config/         # Shared TypeScript configuration
│   ├── env/            # Type-safe environment variables
│   └── pi-sidecar/    # AI sidecar process
```

## Available Scripts

- `bun run dev` - Start all applications in development mode
- `bun run build` - Build all applications
- `bun run dev:web` - Start only the web application
- `bun run check-types` - Check TypeScript types across all apps
- `cd apps/web && bun run desktop:dev` - Start Tauri desktop app in development
- `cd apps/web && bun run desktop:build` - Build Tauri desktop app
