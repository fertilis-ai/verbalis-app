# Tauri Rust API Reference

## Table of Contents

- [Builder Pattern](#builder-pattern)
- [Commands](#commands)
- [State Management](#state-management)
- [Events](#events)
- [Windows](#windows)
- [App Handle & Manager](#app-handle--manager)
- [Error Handling](#error-handling)

## Builder Pattern

### Basic Setup

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())  // Add plugins
        .manage(MyState::default())           // Manage state
        .invoke_handler(tauri::generate_handler![cmd_a, cmd_b])
        .setup(|app| {
            // Initialization logic
            Ok(())
        })
        .on_window_event(|window, event| {
            // Handle window events
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Builder Methods

| Method | Purpose |
|--------|---------|
| `.plugin()` | Register a plugin |
| `.manage()` | Register managed state |
| `.invoke_handler()` | Register commands |
| `.setup()` | Run initialization code |
| `.on_window_event()` | Handle window events globally |
| `.on_page_load()` | Handle page load events |
| `.register_uri_scheme_protocol()` | Custom URI schemes |
| `.run()` | Start the application |

## Commands

### Basic Command

```rust
#[tauri::command]
fn my_command() {
    println!("Called!");
}
```

### With Arguments

```rust
#[tauri::command]
fn greet(name: String, age: u32) -> String {
    format!("{} is {} years old", name, age)
}
```

Arguments are automatically deserialized from JSON. Use `snake_case` in Rust, pass `camelCase` from JS:

```typescript
invoke('greet', { name: 'Alice', age: 30 });
```

### With Result

```rust
#[tauri::command]
fn might_fail(value: i32) -> Result<String, String> {
    if value > 0 {
        Ok("Success".into())
    } else {
        Err("Value must be positive".into())
    }
}
```

### Async Commands

```rust
#[tauri::command]
async fn async_command() -> Result<String, String> {
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    Ok("Done".into())
}
```

### Accessing Special Types

```rust
#[tauri::command]
fn with_context(
    app: tauri::AppHandle,        // App handle
    window: tauri::Window,        // Current window
    state: tauri::State<MyState>, // Managed state
) -> String {
    format!("Window: {}", window.label())
}
```

### Raw Request Data

```rust
#[tauri::command]
fn upload(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let data = request.body();      // Raw body bytes
    let headers = request.headers(); // Request headers
    Ok(())
}
```

### Progress Channel

```rust
use tauri::ipc::Channel;

#[tauri::command]
async fn download(on_progress: Channel<u32>) -> Result<(), String> {
    for i in 0..100 {
        on_progress.send(i).unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    Ok(())
}
```

Frontend:
```typescript
await invoke('download', {
  onProgress: new Channel<number>((progress) => {
    console.log(`Progress: ${progress}%`);
  })
});
```

## State Management

### Define State

```rust
use std::sync::Mutex;

#[derive(Default)]
struct AppState {
    counter: u32,
    data: Vec<String>,
}

pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(AppState::default()))
        // ...
}
```

### Access in Commands

```rust
use tauri::State;

#[tauri::command]
fn increment(state: State<'_, Mutex<AppState>>) -> u32 {
    let mut state = state.lock().unwrap();
    state.counter += 1;
    state.counter
}
```

### Access via Manager Trait

```rust
use tauri::Manager;

fn some_function(app: &tauri::AppHandle) {
    let state = app.state::<Mutex<AppState>>();
    let mut state = state.lock().unwrap();
    state.counter += 1;
}
```

## Events

### Emit from Rust

```rust
use tauri::Emitter;

// Emit to all windows
app.emit("event-name", payload)?;

// Emit to specific window
window.emit("event-name", payload)?;

// Emit to specific target
app.emit_to("window-label", "event-name", payload)?;
```

### Listen in Rust

```rust
use tauri::Listener;

app.listen("event-name", |event| {
    println!("Received: {:?}", event.payload());
});

// Listen once
app.once("event-name", |event| {
    println!("Received once: {:?}", event.payload());
});
```

### Event Payload

```rust
#[derive(Clone, serde::Serialize)]
struct MyPayload {
    message: String,
    count: u32,
}

app.emit("my-event", MyPayload {
    message: "Hello".into(),
    count: 42,
})?;
```

## Windows

### Create Window in Setup

```rust
use tauri::WebviewWindowBuilder;

tauri::Builder::default()
    .setup(|app| {
        WebviewWindowBuilder::new(
            app,
            "settings",
            tauri::WebviewUrl::App("settings.html".into())
        )
        .title("Settings")
        .inner_size(400.0, 300.0)
        .resizable(false)
        .build()?;
        Ok(())
    })
```

### Create Window Dynamically

```rust
#[tauri::command]
async fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    WebviewWindowBuilder::new(
        &app,
        "settings",
        tauri::WebviewUrl::App("settings.html".into())
    )
    .title("Settings")
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}
```

### Window Methods

```rust
// Get window by label
let window = app.get_webview_window("main").unwrap();

// Window operations
window.show()?;
window.hide()?;
window.close()?;
window.set_title("New Title")?;
window.set_focus()?;
window.minimize()?;
window.maximize()?;
window.unmaximize()?;
window.set_fullscreen(true)?;
window.set_size(tauri::LogicalSize::new(800.0, 600.0))?;
window.set_position(tauri::LogicalPosition::new(100.0, 100.0))?;
window.center()?;
```

## App Handle & Manager

### Getting App Handle

```rust
// In setup
.setup(|app| {
    let handle = app.handle().clone();
    // use handle
    Ok(())
})

// In command
#[tauri::command]
fn my_cmd(app: tauri::AppHandle) {
    // use app
}

// From window
let handle = window.app_handle();
```

### Manager Trait Methods

```rust
use tauri::Manager;

// Get window
let window = app.get_webview_window("main");

// Get all windows
let windows = app.webview_windows();

// Get state
let state = app.state::<MyState>();

// Emit event
app.emit("event", payload)?;

// App paths
let app_dir = app.path().app_data_dir()?;
let config_dir = app.path().app_config_dir()?;
```

## Error Handling

### Custom Error Type

```rust
#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found: {0}")]
    NotFound(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[tauri::command]
fn my_cmd() -> Result<String, AppError> {
    Err(AppError::NotFound("item".into()))
}
```

### Using anyhow

```rust
use anyhow::Result;

#[tauri::command]
fn my_cmd() -> Result<String, String> {
    do_something()
        .map_err(|e| e.to_string())
}
```
