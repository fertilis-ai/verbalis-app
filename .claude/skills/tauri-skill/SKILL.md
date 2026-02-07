---
name: tauri-skill
description: Build cross-platform desktop and mobile applications with Tauri v2. Use when creating Tauri projects, defining Rust commands, setting up frontend-backend IPC, managing application state, configuring plugins and permissions, or working with windows and events.
---

# Tauri v2 Application Development

Build tiny, fast, secure cross-platform apps using web frontends (HTML/JS/CSS) with a Rust backend. Apps leverage the system's native webview for minimal bundle sizes (<600KB).

## Quick Start

```bash
# Create new project
npm create tauri-app@latest
# Or: yarn create tauri-app / pnpm create tauri-app / cargo create-tauri-app

# Initialize in existing project
npx tauri init
```

## Project Structure

```
my-app/
├── src/                    # Frontend (any framework)
├── src-tauri/
│   ├── Cargo.toml          # Rust dependencies
│   ├── tauri.conf.json     # App configuration
│   ├── capabilities/       # Permission definitions
│   │   └── default.json
│   ├── src/
│   │   ├── lib.rs          # Entry point, command registration
│   │   └── commands.rs     # Command implementations (optional)
│   └── icons/              # App icons
└── package.json
```

## Configuration (tauri.conf.json)

```json
{
  "productName": "MyApp",
  "identifier": "com.myapp.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{ "title": "My App", "width": 800, "height": 600 }]
  },
  "bundle": {
    "resources": ["./resources"]
  }
}
```

## Commands (Backend → Frontend IPC)

### Define Commands in Rust

```rust
// src-tauri/src/lib.rs
#[tauri::command]
fn greet(name: String) -> String {
    format!("Hello, {}!", name)
}

// Async command with Result
#[tauri::command]
async fn fetch_data(url: String) -> Result<String, String> {
    // async logic here
    Ok("data".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet, fetch_data])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Invoke from Frontend

```typescript
import { invoke } from '@tauri-apps/api/core';

// Call command
const greeting = await invoke<string>('greet', { name: 'World' });

// With raw data and headers
await invoke('upload', new Uint8Array([1, 2, 3]), {
  headers: { Authorization: 'Bearer token' }
});
```

## State Management

```rust
use std::sync::Mutex;
use tauri::State;

struct AppState {
    counter: u32,
}

#[tauri::command]
fn increase_counter(state: State<'_, Mutex<AppState>>) -> u32 {
    let mut state = state.lock().unwrap();
    state.counter += 1;
    state.counter
}

// Async variant
#[tauri::command]
async fn increase_counter_async(state: State<'_, Mutex<AppState>>) -> Result<u32, ()> {
    let mut state = state.lock().await;
    state.counter += 1;
    Ok(state.counter)
}

pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(AppState { counter: 0 }))
        .invoke_handler(tauri::generate_handler![increase_counter])
        .run(tauri::generate_context!())
        .unwrap();
}
```

## Events (Bidirectional Communication)

### Listen in Frontend

```typescript
import { listen, once, emit } from '@tauri-apps/api/event';

// Listen to events
const unlisten = await listen<string>('backend-event', (event) => {
  console.log('Payload:', event.payload);
});

// Listen once
await once<{ loggedIn: boolean }>('app-loaded', (event) => {
  console.log('Logged in:', event.payload.loggedIn);
});

// Emit to backend
await emit('frontend-event', { data: 'value' });

// Cleanup on unmount
unlisten();
```

### Window-specific Events

```typescript
import { getCurrentWindow } from '@tauri-apps/api/window';

const unlisten = await getCurrentWindow().listen('state-changed', (event) => {
  console.log('Window state changed:', event.payload);
});
```

## Windows & Webviews

### Create Windows in Rust

```rust
tauri::Builder::default()
    .setup(|app| {
        let webview_url = tauri::WebviewUrl::App("index.html".into());

        tauri::WebviewWindowBuilder::new(app, "main", webview_url.clone())
            .title("Main Window")
            .build()?;

        tauri::WebviewWindowBuilder::new(app, "settings", webview_url)
            .title("Settings")
            .build()?;
        Ok(())
    })
    .run(tauri::generate_context!())
    .unwrap();
```

### Window API in Frontend

```typescript
import { getCurrentWebviewWindow, getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';
import { getCurrentWebview } from '@tauri-apps/api/webview';

// Get current window
const window = getCurrentWebviewWindow();
await window.setFocus();

// Get all windows
const windows = await getAllWebviewWindows();

// Reparent webview to another window
await getCurrentWebview().reparent('other-window');
```

## Capabilities & Permissions

Tauri v2 uses a capability-based security model. Define permissions in `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main-capability",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:path:default",
    "core:event:default",
    "core:window:default",
    "core:app:default",
    "core:resources:default",
    "core:menu:default",
    "core:tray:default",
    "fs:default",
    "fs:allow-write-text-file",
    "shell:allow-open"
  ]
}
```

### Scoped Permissions

```json
{
  "permissions": [
    {
      "identifier": "fs:allow-write-text-file",
      "allow": [{ "path": "$HOME/myapp/**" }]
    }
  ]
}
```

## Official Plugins

Install via npm/cargo, add permissions in capabilities:

| Plugin | Permission | Purpose |
|--------|------------|---------|
| `@tauri-apps/plugin-fs` | `fs:default` | File system access |
| `@tauri-apps/plugin-shell` | `shell:allow-open` | Shell commands, open URLs |
| `@tauri-apps/plugin-dialog` | `dialog:default` | Native dialogs |
| `@tauri-apps/plugin-store` | `store:default` | Key-value storage |
| `@tauri-apps/plugin-http` | `http:default` | HTTP client |
| `@tauri-apps/plugin-websocket` | `websocket:default` | WebSocket connections |
| `@tauri-apps/plugin-notification` | `notification:default` | System notifications |
| `@tauri-apps/plugin-clipboard` | `clipboard:default` | Clipboard access |
| `@tauri-apps/plugin-autostart` | `autostart:allow-*` | Launch on startup |
| `@tauri-apps/plugin-upload` | `upload:default` | File uploads |

## Plugin Structure (Custom)

```
tauri-plugin-[name]/
├── src/
│   ├── lib.rs          # Plugin registration, state
│   ├── commands.rs     # Plugin commands
│   ├── desktop.rs      # Desktop implementation
│   ├── mobile.rs       # Mobile implementation
│   └── error.rs        # Error types
├── permissions/        # Generated permission files
├── guest-js/           # TypeScript API bindings
├── android/            # Android native code
├── ios/                # iOS native code
├── Cargo.toml
└── package.json
```

## Testing

### Mock IPC in Frontend Tests

```typescript
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { invoke } from '@tauri-apps/api/core';

afterEach(() => clearMocks());

test('mocked command', async () => {
  mockIPC((cmd, args) => {
    if (cmd === 'greet') {
      return `Hello, ${args.name}!`;
    }
  });

  const result = await invoke('greet', { name: 'Test' });
  expect(result).toBe('Hello, Test!');
});
```

## Build & Run

```bash
# Development
npm run tauri dev

# Build for production
npm run tauri build

# Debug with IDE (add to project root Cargo.toml)
[workspace]
members = ["src-tauri"]
```

## Documentation

- [Tauri v2 Docs](https://v2.tauri.app)
- [Configuration Reference](https://v2.tauri.app/reference/config)
- [JavaScript API](https://v2.tauri.app/reference/javascript)
- [Rust API](https://docs.rs/tauri)
- [Plugins](https://v2.tauri.app/plugin)
