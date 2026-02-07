# Pi TUI Package Reference

Complete reference for `@mariozechner/pi-tui` - terminal UI framework with differential rendering.

## Installation

```bash
npm install @mariozechner/pi-tui
```

## Quick Start

```typescript
import { TUI, Text, Container, Editor, SelectList, matchesKey } from '@mariozechner/pi-tui';

const tui = new TUI();

// Set main content
const mainContent = new Text('Hello, TUI!', 1, 1);
tui.setMain(mainContent);

// Run TUI
await tui.run();
```

## Architecture

### Three-Strategy Rendering

1. **Full Redraw** - Fallback, clears and redraws everything
2. **Differential Updates** - Only sends changed lines
3. **Synchronized Output** - CSI 2026 for flicker-free rendering (when terminal supports it)

### Component Model

```typescript
interface Component {
  render(width: number): string[];  // Return array of lines
  handleInput?(data: string): void; // Handle keyboard input
  invalidate?(): void;              // Clear render cache
}

interface Focusable extends Component {
  focused: boolean;  // For IME cursor support
}
```

## TUI Class

### Constructor

```typescript
const tui = new TUI(options?: {
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
});
```

### Core Methods

```typescript
// Set main component
tui.setMain(component);

// Run (starts input loop)
await tui.run();

// Stop
tui.stop();

// Force redraw
tui.render();

// Get dimensions
const { width, height } = tui;
```

### Overlays

```typescript
// Show overlay
const handle = tui.showOverlay(component, options);

// Overlay options
interface OverlayOptions {
  // Size
  width?: number | `${number}%`;       // Fixed or percentage
  maxWidth?: number | `${number}%`;
  maxHeight?: number | `${number}%`;

  // Position
  anchor?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' |
           'top-center' | 'bottom-center' | 'left-center' | 'right-center';
  row?: number | `${number}%`;          // Absolute row
  col?: number | `${number}%`;          // Absolute column
  offsetX?: number;                      // Offset from anchor
  offsetY?: number;

  // Spacing
  margin?: number | { top, right, bottom, left };

  // Responsive
  visible?: (width: number, height: number) => boolean;
}

// Handle methods
handle.hide();
handle.setHidden(true | false);
const isHidden = handle.hidden;

// Hide all overlays
tui.hideOverlay();

// Check for overlay
tui.hasOverlay();
```

### Focus Management

```typescript
// Set focused component (for cursor positioning)
tui.setFocused(component);
```

## Built-in Components

### Text

Simple text content with optional padding:

```typescript
import { Text } from '@mariozechner/pi-tui';

// Basic
const text = new Text('Hello World', 0, 0);

// With padding (top, right, bottom, left)
const padded = new Text('Content', 1, 2, 1, 2);

// ANSI colors are safe
const colored = new Text('\x1b[31mRed text\x1b[0m', 0, 0);
```

### Editor

Multi-line text editor:

```typescript
import { Editor, EditorConfig } from '@mariozechner/pi-tui';

const config: EditorConfig = {
  theme: myTheme,              // Required: theme for styling
  keybindings: keybindings,    // Required: keybinding manager
  history?: [],                // Optional: command history
  historyIndex?: -1,
  placeholder?: 'Type here...',
  onSubmit: (text) => {},      // Called on Enter
  onFileRequest?: () => file,  // For @file completion
  onAbort?: () => {},          // Called on Escape
  highlightRegex?: /pattern/,  // Highlight matches
};

const editor = new Editor(config);

// Properties
editor.text = 'Set text';
const content = editor.text;
editor.focused = true;

// Methods
editor.addLine('New line');
editor.clear();
```

### Input

Single-line text input:

```typescript
import { Input } from '@mariozechner/pi-tui';

const input = new Input({
  theme: myTheme,
  prompt: 'Search: ',
  placeholder: 'Enter query...',
  value: '',
  onSubmit: (value) => {},
  onCancel?: () => {},
  autoFocus?: true,
  maxWidth?: 50,
});

input.focused = true;
const value = input.value;
```

### SelectList

Option selector:

```typescript
import { SelectList } from '@mariozechner/pi-tui';

const list = new SelectList({
  theme: myTheme,
  items: [
    { label: 'Option 1', value: 'opt1' },
    { label: 'Option 2', value: 'opt2' },
    { label: 'Disabled', value: 'opt3', disabled: true },
  ],
  selected?: 0,                    // Initial selection
  onSelect: (item) => {},          // On Enter
  onCancel?: () => {},             // On Escape
  showSearch?: true,               // Enable filtering
  searchPlaceholder?: 'Search...',
  maxVisibleItems?: 10,
});

// Selection
list.selected = 1;
const item = list.getSelectedItem();
list.selectNext();
list.selectPrevious();
```

### SettingsList

Toggle/radio settings:

```typescript
import { SettingsList, Setting } from '@mariozechner/pi-tui';

const settings: Setting[] = [
  {
    label: 'Enable Feature',
    type: 'toggle',
    value: true,
    onChange: (value) => {}
  },
  {
    label: 'Mode',
    type: 'radio',
    options: ['Fast', 'Normal', 'Slow'],
    value: 'Normal',
    onChange: (value) => {}
  }
];

const list = new SettingsList({
  theme: myTheme,
  settings,
  onClose?: () => {},
});
```

### Container

Groups children vertically:

```typescript
import { Container } from '@mariozechner/pi-tui';

const container = new Container([
  new Text('Header', 0, 0),
  new Text('Body', 0, 0),
  new Text('Footer', 0, 0),
]);

// Dynamic children
container.children = [newChild1, newChild2];
```

### Box

Adds padding/border:

```typescript
import { Box } from '@mariozechner/pi-tui';

const box = new Box({
  child: new Text('Content', 0, 0),
  padding?: { top: 1, right: 2, bottom: 1, left: 2 },
  border?: {
    style: 'single' | 'double' | 'rounded',
    color: 'dim'
  },
  background?: 'bgMuted',
});
```

### Markdown

Rendered markdown:

```typescript
import { Markdown } from '@mariozechner/pi-tui';

const md = new Markdown({
  content: '# Hello\n\nThis is **markdown**.',
  theme: myTheme,
  maxWidth?: 80,
});
```

### Image

Display images (iTerm2/Kitty protocols):

```typescript
import { Image } from '@mariozechner/pi-tui';

// From file
const img = new Image({ path: '/path/to/image.png' });

// From buffer
const img = new Image({ buffer: imageBuffer, mimeType: 'image/png' });

// With size constraints
const img = new Image({
  path: '/path/to/image.png',
  maxWidth: 40,
  maxHeight: 20,
});
```

## Key Handling

### matchesKey

Check if input matches a key:

```typescript
import { matchesKey } from '@mariozechner/pi-tui';

handleInput(data: string) {
  if (matchesKey(data, 'enter')) { ... }
  if (matchesKey(data, 'escape')) { ... }
  if (matchesKey(data, 'ctrl+c')) { ... }
  if (matchesKey(data, 'ctrl+shift+p')) { ... }
  if (matchesKey(data, 'up')) { ... }
  if (matchesKey(data, 'down')) { ... }
  if (matchesKey(data, 'tab')) { ... }
  if (matchesKey(data, 'shift+tab')) { ... }
}
```

### Key Names

- Letters: `a`, `b`, ..., `z`
- Numbers: `0`, `1`, ..., `9`
- Modifiers: `ctrl+`, `shift+`, `alt+`, `meta+`
- Special: `enter`, `return`, `escape`, `tab`, `backspace`, `delete`
- Arrows: `up`, `down`, `left`, `right`
- Navigation: `home`, `end`, `pageup`, `pagedown`

## Theme

```typescript
interface Theme {
  fg(color: string, text: string): string;
  bg(color: string, text: string): string;
  bold(text: string): string;
  italic(text: string): string;
  underline(text: string): string;
  strikethrough(text: string): string;
}

// Usage
theme.fg('accent', 'Highlighted text');
theme.fg('success', '✓ Done');
theme.fg('error', 'Failed');
theme.fg('warning', 'Warning');
theme.fg('muted', 'Secondary');
theme.fg('dim', 'Tertiary');
theme.fg('text', 'Primary');
theme.fg('toolTitle', 'Tool Name');

theme.bg('bgMuted', 'Background');
theme.bold(theme.fg('accent', 'Bold accent'));
```

## Utility Functions

### Text Manipulation

```typescript
import {
  stripAnsi,           // Remove ANSI codes
  truncateToWidth,     // Truncate preserving ANSI
  padToWidth,          // Pad to width
  visualWidth,         // Get visual width (handles ANSI, emoji)
  wrapText,            // Word wrap
} from '@mariozechner/pi-tui';

const plain = stripAnsi('\x1b[31mRed\x1b[0m');  // 'Red'
const truncated = truncateToWidth('Long text', 5);  // 'Long…'
const width = visualWidth('\x1b[31mRed\x1b[0m');  // 3
const lines = wrapText('Long paragraph...', 40);
```

### Terminal Info

```typescript
import {
  isKitty,          // Kitty terminal
  isIterm2,         // iTerm2
  supportsUnicode,  // Unicode support
  supportsTrueColor,// 24-bit color
} from '@mariozechner/pi-tui';
```

## Creating Custom Components

### Basic Component

```typescript
class MyComponent {
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(private theme: Theme) {}

  handleInput(data: string): void {
    if (matchesKey(data, 'enter')) {
      // Handle enter
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines: string[] = [];
    lines.push(this.theme.fg('accent', 'My Component'));
    lines.push(this.theme.fg('dim', '─'.repeat(width)));
    lines.push('Content here');

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
```

### Focusable Component

```typescript
class FocusableComponent {
  focused = false;

  handleInput(data: string): void {
    if (!this.focused) return;
    // Handle input only when focused
  }

  render(width: number): string[] {
    const prefix = this.focused ? '> ' : '  ';
    return [`${prefix}Focusable content`];
  }
}
```

### Component with State

```typescript
class Counter {
  private count = 0;
  private cache?: string[];

  handleInput(data: string): void {
    if (matchesKey(data, 'up')) {
      this.count++;
      this.cache = undefined;  // Invalidate on state change
    }
    if (matchesKey(data, 'down')) {
      this.count--;
      this.cache = undefined;
    }
  }

  render(width: number): string[] {
    if (this.cache) return this.cache;
    this.cache = [`Count: ${this.count}`, '↑/↓ to change'];
    return this.cache;
  }

  invalidate(): void {
    this.cache = undefined;
  }
}
```

## Overlay Examples

### Centered Modal

```typescript
tui.showOverlay(new MyModal(), {
  anchor: 'center',
  width: 60,
  maxHeight: '80%',
  margin: 2,
});
```

### Bottom Sheet

```typescript
tui.showOverlay(new BottomSheet(), {
  anchor: 'bottom-center',
  width: '100%',
  maxHeight: '50%',
});
```

### Side Panel

```typescript
tui.showOverlay(new SidePanel(), {
  anchor: 'right-center',
  width: 40,
  maxHeight: '100%',
});
```

### Responsive Overlay

```typescript
tui.showOverlay(new ResponsivePanel(), {
  anchor: 'center',
  width: '80%',
  maxWidth: 100,
  maxHeight: '90%',
  visible: (w, h) => w >= 60,  // Hide if terminal too narrow
});
```

## Integration with coding-agent Extensions

```typescript
import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { Text, SelectList, matchesKey } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("picker", {
    description: "Show a picker",
    handler: async (args, ctx) => {
      const result = await ctx.ui.custom<string | null>((tui, theme, kb, done) => {
        return new SelectList({
          theme,
          items: [
            { label: 'Option A', value: 'a' },
            { label: 'Option B', value: 'b' },
          ],
          onSelect: (item) => done(item.value),
          onCancel: () => done(null),
        });
      });

      if (result) {
        ctx.ui.notify(`Selected: ${result}`, "info");
      }
    }
  });
}
```

## Performance Tips

1. **Cache render output** - Recalculate only when content changes
2. **Use `invalidate()`** - Clear cache when state changes externally
3. **Minimize `render()` calls** - TUI handles diffing, but avoid unnecessary work
4. **Batch updates** - Change state, then call `invalidate()` once
5. **Use `truncateToWidth`** - Prevents lines from wrapping unexpectedly
