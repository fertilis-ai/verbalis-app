# Tauri JavaScript API Reference

## Table of Contents

- [Core](#core)
- [Events](#events)
- [Window](#window)
- [Webview](#webview)
- [Path](#path)
- [Dialog](#dialog)
- [File System](#file-system)
- [Opener](#opener)
- [Shell](#shell)
- [Clipboard](#clipboard)
- [Notification](#notification)

## Core

### invoke

Call a Rust command from the frontend.

```typescript
import { invoke } from '@tauri-apps/api/core';

// Basic call
await invoke('my_command');

// With arguments
const result = await invoke<string>('greet', { name: 'World' });

// With raw data
await invoke('upload', new Uint8Array([1, 2, 3]), {
  headers: { 'Content-Type': 'application/octet-stream' }
});
```

### Channel

Send progress updates from Rust to frontend.

```typescript
import { invoke, Channel } from '@tauri-apps/api/core';

const onProgress = new Channel<number>();
onProgress.onmessage = (progress) => {
  console.log(`Progress: ${progress}%`);
};

await invoke('download', { url: '...', onProgress });
```

### convertFileSrc

Convert a file path to a URL that can be used in `<img>`, `<video>`, etc.

```typescript
import { convertFileSrc } from '@tauri-apps/api/core';

const assetUrl = convertFileSrc('/path/to/image.png');
// Use in: <img src={assetUrl} />
```

## Events

### listen

Listen to events from Rust or other windows.

```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen<string>('my-event', (event) => {
  console.log('Event:', event.event);
  console.log('Payload:', event.payload);
  console.log('ID:', event.id);
});

// Stop listening
unlisten();
```

### once

Listen to an event only once.

```typescript
import { once } from '@tauri-apps/api/event';

await once<{ loaded: boolean }>('app-ready', (event) => {
  console.log('App is ready:', event.payload.loaded);
});
```

### emit

Emit an event to all listeners.

```typescript
import { emit } from '@tauri-apps/api/event';

await emit('frontend-event', { data: 'value' });
```

### emitTo

Emit an event to a specific target.

```typescript
import { emitTo } from '@tauri-apps/api/event';

// To a window
await emitTo('settings-window', 'config-changed', { theme: 'dark' });

// To webview
await emitTo({ kind: 'Webview', label: 'main' }, 'event', payload);
```

### Event Options

```typescript
import { listen } from '@tauri-apps/api/event';

// Listen to events from any target
await listen('event', handler, { target: { kind: 'Any' } });

// Listen to events from specific window
await listen('event', handler, { target: { kind: 'Window', label: 'main' } });
```

## Window

### getCurrentWindow

Get the current window instance.

```typescript
import { getCurrentWindow } from '@tauri-apps/api/window';

const window = getCurrentWindow();
```

### Window Methods

```typescript
const win = getCurrentWindow();

// Visibility
await win.show();
await win.hide();
await win.close();

// Focus
await win.setFocus();
await win.isFocused();

// Size & Position
await win.setSize(new LogicalSize(800, 600));
await win.setMinSize(new LogicalSize(400, 300));
await win.setMaxSize(new LogicalSize(1920, 1080));
await win.setPosition(new LogicalPosition(100, 100));
await win.center();

// State
await win.minimize();
await win.maximize();
await win.unmaximize();
await win.toggleMaximize();
await win.isMaximized();
await win.isMinimized();
await win.setFullscreen(true);

// Properties
await win.setTitle('New Title');
await win.title();
await win.setResizable(false);
await win.setAlwaysOnTop(true);
await win.setDecorations(false);

// Events
const unlisten = await win.listen('tauri://close-requested', () => {
  console.log('Close requested');
});

await win.onCloseRequested((event) => {
  event.preventDefault(); // Prevent close
});
```

### Create New Window

```typescript
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

const webview = new WebviewWindow('settings', {
  url: 'settings.html',
  title: 'Settings',
  width: 400,
  height: 300,
  resizable: false,
  center: true,
});

webview.once('tauri://created', () => {
  console.log('Window created');
});

webview.once('tauri://error', (e) => {
  console.error('Failed to create window:', e);
});
```

### Get All Windows

```typescript
import { getAllWindows } from '@tauri-apps/api/window';
import { getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';

const windows = await getAllWindows();
const webviewWindows = await getAllWebviewWindows();
```

## Webview

### getCurrentWebview

```typescript
import { getCurrentWebview } from '@tauri-apps/api/webview';

const webview = getCurrentWebview();

// Methods
await webview.setFocus();
await webview.position();
await webview.size();
await webview.close();
await webview.setZoom(1.5);
await webview.reparent('other-window');
```

## Path

### Path Functions

```typescript
import {
  appDataDir,
  appConfigDir,
  appLocalDataDir,
  appCacheDir,
  audioDir,
  cacheDir,
  configDir,
  dataDir,
  desktopDir,
  documentDir,
  downloadDir,
  homeDir,
  pictureDir,
  publicDir,
  resourceDir,
  tempDir,
  videoDir,
} from '@tauri-apps/api/path';

const appData = await appDataDir();    // ~/.local/share/app-name (Linux)
const config = await appConfigDir();   // ~/.config/app-name (Linux)
const home = await homeDir();          // ~
const desktop = await desktopDir();    // ~/Desktop
```

### Path Manipulation

```typescript
import { join, dirname, basename, extname, resolve } from '@tauri-apps/api/path';

const full = await join(await homeDir(), 'documents', 'file.txt');
const dir = await dirname('/path/to/file.txt');  // /path/to
const name = await basename('/path/to/file.txt'); // file.txt
const ext = await extname('/path/to/file.txt');  // .txt
```

## Dialog

Requires: `@tauri-apps/plugin-dialog`

```typescript
import { open, save, message, ask, confirm } from '@tauri-apps/plugin-dialog';

// Open file
const file = await open({
  multiple: false,
  filters: [{ name: 'Images', extensions: ['png', 'jpg'] }],
});

// Open multiple files
const files = await open({ multiple: true });

// Open directory
const dir = await open({ directory: true });

// Save file
const savePath = await save({
  defaultPath: 'document.txt',
  filters: [{ name: 'Text', extensions: ['txt'] }],
});

// Message box
await message('Hello!', { title: 'Greeting', kind: 'info' });

// Confirmation
const confirmed = await confirm('Are you sure?', {
  title: 'Confirm',
  kind: 'warning',
});

// Yes/No dialog
const answer = await ask('Do you want to continue?', {
  title: 'Question',
  kind: 'info',
});
```

## File System

Requires: `@tauri-apps/plugin-fs`

```typescript
import {
  readTextFile,
  writeTextFile,
  readFile,
  writeFile,
  readDir,
  mkdir,
  remove,
  rename,
  copyFile,
  exists,
  stat,
} from '@tauri-apps/plugin-fs';

// Read/Write text
const content = await readTextFile('/path/to/file.txt');
await writeTextFile('/path/to/file.txt', 'content');

// Read/Write binary
const bytes = await readFile('/path/to/file.bin');
await writeFile('/path/to/file.bin', new Uint8Array([1, 2, 3]));

// Directory operations
const entries = await readDir('/path/to/dir');
await mkdir('/path/to/new-dir', { recursive: true });

// File operations
await remove('/path/to/file');
await rename('/old/path', '/new/path');
await copyFile('/src', '/dest');

// Info
const fileExists = await exists('/path/to/file');
const info = await stat('/path/to/file');
console.log(info.isFile, info.isDirectory, info.size);
```

## Opener

Requires: `@tauri-apps/plugin-opener` (preferred for opening URLs/files; replaces `shell.open` from v1)

```typescript
import { openUrl, openPath, revealItemInDir } from '@tauri-apps/plugin-opener';

// Open URL in default browser
await openUrl('https://tauri.app');

// Open file with default app
await openPath('/path/to/file.pdf');

// Open with a specific app
await openPath('/path/to/file.txt', 'code');

// Reveal a file in the system file manager (Finder/Explorer)
await revealItemInDir('/path/to/file.pdf');
```

## Shell

Requires: `@tauri-apps/plugin-shell` (for executing commands / sidecars; use `opener` for opening URLs)

```typescript
import { Command } from '@tauri-apps/plugin-shell';

// Run command (must be configured in tauri.conf.json)
const command = Command.create('my-sidecar', ['arg1', 'arg2']);

command.on('close', (data) => {
  console.log('Exit code:', data.code);
});

command.on('error', (error) => {
  console.error('Error:', error);
});

command.stdout.on('data', (line) => {
  console.log('stdout:', line);
});

command.stderr.on('data', (line) => {
  console.error('stderr:', line);
});

const child = await command.spawn();
// Later: await child.kill();
```

## Clipboard

Requires: `@tauri-apps/plugin-clipboard-manager`

```typescript
import { writeText, readText, writeImage, readImage } from '@tauri-apps/plugin-clipboard-manager';

// Text
await writeText('Hello clipboard!');
const text = await readText();

// Image
import { Image } from '@tauri-apps/api/image';
const img = await Image.fromPath('/path/to/image.png');
await writeImage(img);
```

## Notification

Requires: `@tauri-apps/plugin-notification`

```typescript
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

// Check/request permission
let permission = await isPermissionGranted();
if (!permission) {
  const result = await requestPermission();
  permission = result === 'granted';
}

// Send notification
if (permission) {
  sendNotification({
    title: 'Tauri App',
    body: 'Hello from Tauri!',
    icon: 'icons/icon.png',
  });
}
```
