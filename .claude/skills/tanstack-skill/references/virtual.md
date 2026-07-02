# TanStack Virtual

Headless UI utility for virtualizing long lists of elements in JS/TS. It renders
only the items currently in (or near) the viewport, keeping the DOM small no
matter how many items exist. Being headless, it ships **no markup or styles** —
you own all rendering and positioning.

- **Package:** `@tanstack/react-virtual`
- **Version targeted:** 3.14.3 (v3 is the current stable major)
- **Stability:** v3 is stable. The core is framework-agnostic with adapters for
  React, Vue, Svelte, Solid, Lit, and Angular.
- Supports vertical (default), horizontal, grid (two axes), and window scrolling.

## Table of Contents
- [Installation](#installation)
- [Mental Model](#mental-model)
- [Fixed-Size Vertical List](#fixed-size-vertical-list)
- [Horizontal Lists](#horizontal-lists)
- [Dynamic Measurement](#dynamic-measurement)
- [Grid Virtualization](#grid-virtualization)
- [Window Virtualizer](#window-virtualizer)
- [Scroll To Index / Offset](#scroll-to-index--offset)
- [Infinite Scroll](#infinite-scroll)
- [Integration with TanStack Table](#integration-with-tanstack-table)
- [API Reference](#api-reference)

## Installation

```bash
npm install @tanstack/react-virtual
```

React 18+ is supported (and React 19). No provider or context is required.

## Mental Model

You always render three layers:

1. **Scroll container** — a fixed-size element with `overflow: auto`. Its
   element is returned by `getScrollElement`.
2. **Sizer** — an inner element sized to `getTotalSize()` so the scrollbar
   reflects the full virtual length. Position it `relative`.
3. **Items** — only the items from `getVirtualItems()`, absolutely positioned
   and translated to their `start` offset.

`useVirtualizer` returns an instance; reading `getVirtualItems()` /
`getTotalSize()` during render is the correct pattern (the hook re-renders the
component when the visible range changes).

## Fixed-Size Vertical List

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

function VirtualList() {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: 10000,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35, // fixed row height in px
    overscan: 5,            // extra items rendered above/below viewport
  })

  return (
    <div ref={parentRef} style={{ height: 400, overflow: 'auto' }}>
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: item.size,
              transform: `translateY(${item.start}px)`,
            }}
          >
            Row {item.index}
          </div>
        ))}
      </div>
    </div>
  )
}
```

With a backing data array, index into it via `item.index`, and pass
`getItemKey` so keys stay stable across reorders:

```tsx
const virtualizer = useVirtualizer({
  count: users.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 50,
  getItemKey: (index) => users[index].id, // stable key instead of index
})
```

## Horizontal Lists

Set `horizontal: true`, size the sizer by **width**, and translate on the
**X** axis. `getScrollElement` must point at an element with horizontal overflow.

```tsx
function HorizontalList({ items }: { items: string[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    horizontal: true,
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150, // estimated width
  })

  return (
    <div ref={parentRef} style={{ width: '100%', height: 200, overflow: 'auto' }}>
      <div
        style={{
          width: virtualizer.getTotalSize(),
          height: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: item.size,
              transform: `translateX(${item.start}px)`,
            }}
          >
            {items[item.index]}
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Dynamic Measurement

When item sizes are unknown or variable, keep `estimateSize` as an initial
guess and attach `virtualizer.measureElement` as a `ref` to each rendered item.
The virtualizer measures the real size (via `getBoundingClientRect` by default,
through a `ResizeObserver`) and corrects offsets automatically.

Two requirements: the measured element must carry a `data-index` attribute, and
you must **not** set an explicit `height` on it (let content drive the size).

```tsx
function DynamicList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // initial estimate only
    overscan: 5,
  })

  return (
    <div ref={parentRef} style={{ height: 400, overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            data-index={item.index}        // required for measurement
            ref={virtualizer.measureElement} // measures real height
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${item.start}px)`,
            }}
          >
            <ExpandableContent item={items[item.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

Note: dynamic measurement is largely unsupported in Safari < 16 because it
lacks `ResizeObserver` content-box reporting; provide a good `estimateSize`
there. You can override how measurement works with the `measureElement` option
(see API Reference).

## Grid Virtualization

Combine a vertical (row) and a horizontal (column) virtualizer that share the
same scroll element.

```tsx
function VirtualGrid({ items, columnCount = 4 }: { items: Item[]; columnCount?: number }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const rowCount = Math.ceil(items.length / columnCount)

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 2,
  })

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: columnCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 2,
  })

  return (
    <div ref={parentRef} style={{ height: 600, width: '100%', overflow: 'auto' }}>
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          width: columnVirtualizer.getTotalSize(),
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) =>
          columnVirtualizer.getVirtualItems().map((virtualColumn) => {
            const index = virtualRow.index * columnCount + virtualColumn.index
            if (index >= items.length) return null
            return (
              <div
                key={`${virtualRow.key}:${virtualColumn.key}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: virtualColumn.size,
                  height: virtualRow.size,
                  transform: `translateX(${virtualColumn.start}px) translateY(${virtualRow.start}px)`,
                }}
              >
                <GridItem item={items[index]} />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
```

For masonry-style columns where each lane has independent heights, use the
`lanes` option on a single virtualizer instead of two virtualizers.

## Window Virtualizer

`useWindowVirtualizer` virtualizes against the **browser window** scroll rather
than a scroll container — ideal for full-page feeds. There is no
`getScrollElement`. When the list does not start at the very top of the page,
pass `scrollMargin` (the list's offset from the document top) and subtract it
from each item's `start`.

```tsx
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

function WindowList({ items }: { items: Item[] }) {
  const listRef = useRef<HTMLDivElement>(null)
  // Offset of the list from the top of the document.
  const scrollMargin = listRef.current?.offsetTop ?? 0

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => 80,
    overscan: 5,
    scrollMargin,
  })

  return (
    <div ref={listRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              // subtract scrollMargin so the first item lines up
              transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            <Row item={items[item.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Scroll To Index / Offset

```tsx
// Scroll a specific item into view.
virtualizer.scrollToIndex(index, {
  align: 'center',   // 'start' | 'center' | 'end' | 'auto' (default 'auto')
  behavior: 'smooth' // 'auto' | 'smooth' (default 'auto')
})

// Scroll to a raw pixel offset.
virtualizer.scrollToOffset(offset, { align: 'start' })
```

Smooth scrolling to an index is unreliable while items are being dynamically
measured, since target offsets shift as measurements land — prefer `'auto'`
behavior (or fixed sizes) when using `scrollToIndex`.

## Infinite Scroll

Pairs naturally with TanStack Query's `useInfiniteQuery`. Reserve one extra
virtual row for the loader, and call `fetchNextPage()` when the last virtual
item reaches the end of the loaded data.

```tsx
import { useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'

function InfiniteList() {
  const parentRef = useRef<HTMLDivElement>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['items'],
    queryFn: ({ pageParam }) => fetchItems(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const allRows = data ? data.pages.flatMap((p) => p.items) : []

  const rowVirtualizer = useVirtualizer({
    // +1 row for the loader when more pages exist
    count: hasNextPage ? allRows.length + 1 : allRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 5,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

  useEffect(() => {
    const [lastItem] = [...virtualItems].reverse()
    if (!lastItem) return
    if (lastItem.index >= allRows.length - 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [virtualItems, allRows.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div ref={parentRef} style={{ height: 500, overflow: 'auto' }}>
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
        {virtualItems.map((item) => {
          const isLoaderRow = item.index >= allRows.length
          return (
            <div
              key={item.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${item.start}px)`,
              }}
            >
              {isLoaderRow
                ? hasNextPage ? 'Loading more…' : 'Nothing more to load'
                : <ItemRow item={allRows[item.index]} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

## Integration with TanStack Table

TanStack Table is itself headless, so virtualization is just a virtualizer
driven by the table's row model. Build the virtualizer from
`table.getRowModel().rows`, then index into that array.

```tsx
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

function VirtualTable({ data, columns }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() })
  const rows = table.getRowModel().rows

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 8,
    // measureElement enables dynamic row heights for the rows below
    measureElement:
      typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
        ? (el) => el?.getBoundingClientRect().height
        : undefined,
  })

  return (
    <div ref={parentRef} style={{ height: 600, overflow: 'auto' }}>
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index]
          return (
            <div
              key={row.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                display: 'flex',
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <div key={cell.id} style={{ width: cell.column.getSize() }}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

For a sticky `<thead>` over virtualized `<tbody>` rows inside an actual
`<table>`, render the table normally and apply the same absolute-positioning /
`getTotalSize` technique to a wrapper around the rows.

## API Reference

### `useVirtualizer(options)`

Required options:

| Option | Type | Notes |
|--------|------|-------|
| `count` | `number` | Total number of items. |
| `getScrollElement` | `() => TScrollElement \| null` | The scroll container element. |
| `estimateSize` | `(index: number) => number` | Estimated item size in px (height, or width when `horizontal`). |

Common optional options (defaults shown):

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `enabled` | `boolean` | `true` | Disable to pause virtualization. |
| `overscan` | `number` | `1` | Extra items rendered outside the viewport. |
| `horizontal` | `boolean` | `false` | Virtualize the X axis. |
| `paddingStart` | `number` | `0` | Padding before the first item. |
| `paddingEnd` | `number` | `0` | Padding after the last item. |
| `scrollPaddingStart` | `number` | `0` | Scroll padding at the start (for `scrollToIndex`). |
| `scrollPaddingEnd` | `number` | `0` | Scroll padding at the end. |
| `gap` | `number` | `0` | Gap in px between items. |
| `lanes` | `number` | `1` | Number of columns/lanes (masonry). |
| `getItemKey` | `(index: number) => Key` | returns `index` | Stable keys across reorders. |
| `rangeExtractor` | `(range: Range) => number[]` | `defaultRangeExtractor` | Customize which indexes render (e.g. sticky items). |
| `scrollMargin` | `number` | `0` | Origin offset of the scroll (window virtualizer / preceding content). |
| `initialOffset` | `number \| (() => number)` | `0` | Initial scroll offset (SSR/hydration). |
| `isScrollingResetDelay` | `number` | `150` | Delay (ms) before `isScrolling` flips false. |
| `measureElement` | `(el, entry, instance) => number` | `getBoundingClientRect` | Override dynamic measurement. |
| `debug` | `boolean` | `false` | Verbose logging. |

React-adapter-specific options: `useFlushSync` (default `true`),
`directDomUpdates` (default `false`), `directDomUpdatesMode`
(`'transform' | 'position'`, default `'transform'`).

### Virtualizer instance

| Member | Signature | Notes |
|--------|-----------|-------|
| `getVirtualItems()` | `() => VirtualItem[]` | Currently rendered items; call during render. |
| `getTotalSize()` | `() => number` | Total size of all items (sizer dimension). |
| `scrollToIndex(index, opts?)` | `(index, { align?, behavior? }) => void` | `align`: `'start' \| 'center' \| 'end' \| 'auto'`. |
| `scrollToOffset(offset, opts?)` | `(offset, { align?, behavior? }) => void` | Scroll to a raw px offset. |
| `measure()` | `() => void` | Reset/re-measure cached item sizes. |
| `measureElement(el)` | `(el: TItemElement \| null) => void` | Ref callback for dynamic measurement. |
| `resizeItem(index, size)` | `(index, size) => void` | Imperatively set a measured size. |
| `getOffsetForIndex(index, align?)` | `(index, align?) => [number, align]` | Offset that would bring an index into view. |
| `scrollElement` | `TScrollElement \| null` | The resolved scroll element. |
| `scrollOffset` | `number` | Current scroll offset. |
| `options` | `Required<VirtualizerOptions>` | Resolved options (e.g. `options.scrollMargin`). |

### `VirtualItem`

```ts
interface VirtualItem {
  index: number // item index in the full list
  key: string | number | bigint // from getItemKey (defaults to index)
  start: number // offset (px) from the start of the list
  end: number   // start + size
  size: number  // measured or estimated size (px)
  lane: number  // lane/column index (0 unless `lanes` > 1)
}
```

### `useWindowVirtualizer(options)`

Same options as `useVirtualizer` **minus** `getScrollElement` (it scrolls the
window). Use `scrollMargin` for the list's document offset and subtract
`virtualizer.options.scrollMargin` from each item's `start` when positioning.
