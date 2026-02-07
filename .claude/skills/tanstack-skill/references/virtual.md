# TanStack Virtual

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Vertical Lists](#vertical-lists)
- [Horizontal Lists](#horizontal-lists)
- [Grid Virtualization](#grid-virtualization)
- [Dynamic Sizing](#dynamic-sizing)
- [Scroll to Index](#scroll-to-index)
- [Infinite Scroll](#infinite-scroll)

## Installation

```bash
npm install @tanstack/react-virtual
```

## Quick Start

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

function VirtualList() {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: 10000,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35, // Estimated row height in pixels
  })

  return (
    <div
      ref={parentRef}
      style={{ height: '400px', overflow: 'auto' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            Row {virtualItem.index}
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Vertical Lists

### With Data Array

```tsx
function UserList({ users }: { users: User[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: users.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 5, // Render 5 extra items above/below viewport
  })

  return (
    <div ref={parentRef} style={{ height: '500px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const user = users[virtualItem.index]
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <UserCard user={user} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

### Variable Height Items

```tsx
function VariableHeightList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // Return estimated size based on content
      return items[index].type === 'header' ? 60 : 40
    },
  })

  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {items[virtualItem.index].content}
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Horizontal Lists

```tsx
function HorizontalList({ items }: { items: string[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    horizontal: true,
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150, // Estimated width
  })

  return (
    <div
      ref={parentRef}
      style={{ width: '100%', height: '200px', overflow: 'auto' }}
    >
      <div
        style={{
          width: `${virtualizer.getTotalSize()}px`,
          height: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${virtualItem.size}px`,
              transform: `translateX(${virtualItem.start}px)`,
            }}
          >
            {items[virtualItem.index]}
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Grid Virtualization

```tsx
function VirtualGrid({ items, columnCount = 4 }: { items: Item[]; columnCount?: number }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const rowCount = Math.ceil(items.length / columnCount)

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // Row height
    overscan: 2,
  })

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: columnCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // Column width
    overscan: 2,
  })

  return (
    <div
      ref={parentRef}
      style={{ height: '600px', width: '100%', overflow: 'auto' }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: `${columnVirtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => (
          <div key={virtualRow.key}>
            {columnVirtualizer.getVirtualItems().map((virtualColumn) => {
              const index = virtualRow.index * columnCount + virtualColumn.index
              if (index >= items.length) return null

              return (
                <div
                  key={virtualColumn.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${virtualColumn.size}px`,
                    height: `${virtualRow.size}px`,
                    transform: `translateX(${virtualColumn.start}px) translateY(${virtualRow.start}px)`,
                  }}
                >
                  <GridItem item={items[index]} />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Dynamic Sizing

Measure actual element sizes dynamically:

```tsx
function DynamicList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Initial estimate
  })

  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement} // Auto-measure this element
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {/* Content with unknown height */}
            <ExpandableContent item={items[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Scroll to Index

```tsx
function ScrollableList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [targetIndex, setTargetIndex] = useState(0)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
  })

  const scrollToIndex = () => {
    virtualizer.scrollToIndex(targetIndex, {
      align: 'center', // 'start' | 'center' | 'end' | 'auto'
      behavior: 'smooth', // 'auto' | 'smooth'
    })
  }

  return (
    <div>
      <div>
        <input
          type="number"
          value={targetIndex}
          onChange={(e) => setTargetIndex(Number(e.target.value))}
          max={items.length - 1}
          min={0}
        />
        <button onClick={scrollToIndex}>Scroll to Index</button>
      </div>
      <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
        {/* Virtual list content */}
      </div>
    </div>
  )
}
```

## Infinite Scroll

Combine with TanStack Query for infinite loading:

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
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })

  const allItems = data?.pages.flatMap((page) => page.items) ?? []

  const virtualizer = useVirtualizer({
    count: hasNextPage ? allItems.length + 1 : allItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 5,
  })

  const virtualItems = virtualizer.getVirtualItems()

  // Fetch more when scrolling near the end
  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1]
    if (!lastItem) return

    if (
      lastItem.index >= allItems.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage()
    }
  }, [virtualItems, hasNextPage, isFetchingNextPage, allItems.length, fetchNextPage])

  return (
    <div ref={parentRef} style={{ height: '500px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualItems.map((virtualItem) => {
          const isLoader = virtualItem.index >= allItems.length

          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {isLoader ? (
                hasNextPage ? 'Loading more...' : 'End of list'
              ) : (
                <ItemRow item={allItems[virtualItem.index]} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

## Virtualizer Options

```tsx
const virtualizer = useVirtualizer({
  // Required
  count: 1000,                          // Total number of items
  getScrollElement: () => ref.current,  // Scroll container element
  estimateSize: (index) => 50,          // Estimated size (height/width)

  // Optional
  horizontal: false,                    // Set true for horizontal virtualization
  overscan: 5,                          // Extra items to render outside viewport
  paddingStart: 0,                      // Padding before first item
  paddingEnd: 0,                        // Padding after last item
  scrollMargin: 0,                      // Offset for scroll calculations
  gap: 0,                               // Gap between items
  lanes: 1,                             // For masonry-style layouts

  // Callbacks
  onChange: (instance) => {},           // Called when virtual items change
  measureElement: (el) => el.offsetHeight, // Custom measurement function
})

// Virtualizer methods
virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' })
virtualizer.scrollToOffset(offset, { align: 'start' })
virtualizer.measure()  // Re-measure all items
virtualizer.getTotalSize()  // Get total scrollable size
virtualizer.getVirtualItems()  // Get currently visible items
```
