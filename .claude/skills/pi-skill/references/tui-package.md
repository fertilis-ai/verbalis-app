# Pi TUI Package Reference

`@earendil-works/pi-tui` — terminal UI library with differential rendering. Used for tool/message renderers, custom commands (`ctx.ui.custom`), and custom editors inside coding-agent extensions, and standalone for terminal apps.

```bash
npm install @earendil-works/pi-tui
```

> The signatures below follow the official TUI docs page. Some constructors are positional; verify against the package's TypeScript types when in doubt.

## Rendering Model

Three strategies, applied automatically: full redraw (fallback), differential updates (only changed lines), and synchronized output (CSI 2026, flicker-free) when the terminal supports it.

### Component interface

```typescript
interface Component {
  render(width: number): string[];   // return one string per line
  handleInput?(data: string): void;  // raw input bytes
  wantsKeyRelease?: boolean;
  invalidate(): void;                 // clear any render cache
}
```

### Focusable (IME / cursor)

```typescript
import { CURSOR_MARKER, type Component, type Focusable } from "@earendil-works/pi-tui";

class MyInput implements Component, Focusable {
  focused = false;
  render(width: number): string[] {
    const marker = this.focused ? CURSOR_MARKER : "";
    return [`> ${before}${marker}\x1b[7m${at}\x1b[27m${after}`];
  }
  invalidate() {}
}
```

## Built-in Components

```typescript
import { Text, Box, Container, Spacer, Markdown, Image } from "@earendil-works/pi-tui";

// Text — multi-line, word-wrapping. (content, paddingX=1, paddingY=1, bgFn?)
const text = new Text("Hello World", 1, 1, (s) => bgGray(s));
text.setText("Updated");

// Box — single child + optional background
const box = new Box(1, 1, (s) => bgGray(s));
box.addChild(new Text("Content", 0, 0));
box.setBgFn((s) => bgBlue(s));

// Container — stacks children vertically
const container = new Container();
container.addChild(componentA);
container.removeChild(componentA);

// Spacer — N blank lines
const spacer = new Spacer(2);

// Markdown — (content, paddingX, paddingY, markdownTheme)
const md = new Markdown("# Title\n\n**bold**", 1, 1, theme);
md.setText("Updated");

// Image — base64 (iTerm2/Kitty protocols)
const image = new Image(base64Data, "image/png", imageTheme, { maxWidthCells: 80, maxHeightCells: 24 });
```

### SelectList

```typescript
import { SelectList, type SelectItem } from "@earendil-works/pi-tui";

const items: SelectItem[] = [
  { value: "opt1", label: "Option 1", description: "First option" },
  { value: "opt2", label: "Option 2", description: "Second option" },
];

const list = new SelectList(items, Math.min(items.length, 10), {
  selectedPrefix: (t) => theme.fg("accent", t),
  selectedText:   (t) => theme.fg("accent", t),
  description:    (t) => theme.fg("muted", t),
  scrollInfo:     (t) => theme.fg("dim", t),
  noMatch:        (t) => theme.fg("warning", t),
});
list.onSelect = (item) => done(item.value);
list.onCancel = () => done(null);
```

### SettingsList

```typescript
import { SettingsList, type SettingItem, getSettingsListTheme } from "@earendil-works/pi-tui";

const items: SettingItem[] = [
  { id: "verbose", label: "Verbose mode", currentValue: "off", values: ["on", "off"] },
  { id: "color",   label: "Color output", currentValue: "on",  values: ["on", "off"] },
];

const settings = new SettingsList(
  items,
  Math.min(items.length + 2, 15),
  getSettingsListTheme(),
  (id, newValue) => { /* handle change */ },
  () => done(undefined),          // on close
  { enableSearch: true }
);
```

## Keyboard Input

```typescript
import { matchesKey, Key } from "@earendil-works/pi-tui";

handleInput(data: string) {
  if (matchesKey(data, Key.up)) { /* … */ }
  else if (matchesKey(data, Key.enter)) { /* … */ }
  else if (matchesKey(data, Key.escape)) { /* … */ }
  else if (matchesKey(data, Key.ctrl("c"))) { /* … */ }
}
```

`Key` identifiers: `Key.enter`, `Key.escape`, `Key.tab`, `Key.space`, `Key.backspace`, `Key.delete`, `Key.home`, `Key.end`, `Key.up`, `Key.down`, `Key.left`, `Key.right`, `Key.ctrl(x)`, `Key.shift(x)`, `Key.alt(x)`, `Key.ctrlShift(x)`. `matchesKey` also accepts string forms like `"ctrl+shift+p"`.

## Width Utilities

```typescript
import { visibleWidth, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

visibleWidth(str);                  // display width, ignoring ANSI codes
truncateToWidth(str, width, "…");   // truncate with optional ellipsis, ANSI-safe
wrapTextWithAnsi(str, width);       // word wrap preserving ANSI codes
```

## Differential Rendering (caching)

Cache by width; invalidate on state change, then request a re-render.

```typescript
class Cached {
  private cachedWidth?: number;
  private cachedLines?: string[];
  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    const lines = /* compute */ [];
    this.cachedWidth = width; this.cachedLines = lines;
    return lines;
  }
  invalidate() { this.cachedWidth = undefined; this.cachedLines = undefined; }
}
```

In extensions, after mutating component state call `invalidate()` then trigger a render (e.g. the render handle's `requestRender()`).

## Theme

```typescript
theme.fg("accent" | "success" | "error" | "warning" | "muted" | "dim" | "text" | "toolTitle" | …, text);
theme.bold(text); theme.italic(text); theme.strikethrough(text);
```

The full set of 51 theme color tokens (and how to define a theme) is in `customization.md`.

## Using TUI in an extension

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SelectList, type SelectItem } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("picker", {
    description: "Pick an option",
    handler: async (_args, ctx) => {
      const items: SelectItem[] = [
        { value: "a", label: "Option A" },
        { value: "b", label: "Option B" },
      ];
      const result = await ctx.ui.custom<string | null>((tui, theme, kb, done) => {
        const list = new SelectList(items, Math.min(items.length, 10), {
          selectedPrefix: (t) => theme.fg("accent", t),
          selectedText:   (t) => theme.fg("accent", t),
        });
        list.onSelect = (item) => done(item.value);
        list.onCancel = () => done(null);
        return list;
      });
      if (result) ctx.ui.notify(`Selected: ${result}`, "info");
    },
  });
}
```

## Custom Editor (vim-style example)

```typescript
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

class VimEditor extends CustomEditor {
  private mode: "normal" | "insert" = "insert";
  handleInput(data: string): void {
    if (matchesKey(data, "escape")) {
      if (this.mode === "insert") { this.mode = "normal"; return; }
      super.handleInput(data); return;
    }
    if (this.mode === "insert") { super.handleInput(data); return; }
    switch (data) {
      case "i": this.mode = "insert"; return;
      case "h": super.handleInput("\x1b[D"); return;
      case "j": super.handleInput("\x1b[B"); return;
      case "k": super.handleInput("\x1b[A"); return;
      case "l": super.handleInput("\x1b[C"); return;
    }
    if (data.length === 1 && data.charCodeAt(0) >= 32) return;  // swallow other normal-mode keys
    super.handleInput(data);
  }
  render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length > 0) {
      const label = this.mode === "normal" ? " NORMAL " : " INSERT ";
      const last = lines[lines.length - 1]!;
      lines[lines.length - 1] = truncateToWidth(last, width - label.length, "") + label;
    }
    return lines;
  }
}
```
