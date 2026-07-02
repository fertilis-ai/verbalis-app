# TanStack Table

Headless UI library for building powerful tables & datagrids. You own 100% of the markup and styles; the library manages state and logic.

**Target version:** `@tanstack/react-table` **v8.21.3** (stable). All examples below are v8-correct. Note: a v9 (`useTable` + `tableFeatures` + `_rowModels`) is in beta — do **not** use that API here; v8 uses `useReactTable` + `get*RowModel()`.

## Table of Contents
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Quick Start](#quick-start)
- [Column Definitions](#column-definitions)
- [Row Models](#row-models)
- [Controlled vs Uncontrolled State](#controlled-vs-uncontrolled-state)
- [Sorting](#sorting)
- [Filtering](#filtering)
- [Pagination](#pagination)
- [Row Selection](#row-selection)
- [Column Visibility](#column-visibility)
- [Column Ordering](#column-ordering)
- [Column Pinning](#column-pinning)
- [Column Sizing / Resizing](#column-sizing--resizing)
- [Grouping & Aggregation](#grouping--aggregation)
- [Expanding & Sub-Rows](#expanding--sub-rows)
- [Server-Side / Manual Operations](#server-side--manual-operations)
- [Virtualization](#virtualization)

## Installation

```bash
npm install @tanstack/react-table
```

Single dependency, no peer deps beyond React 16.8+. Works with React, Vue, Solid, Svelte, Qwik, Angular, Lit, and vanilla JS via framework adapters.

## Core Concepts

- **Headless**: the library returns a `table` instance with state + APIs; you render the DOM yourself.
- **Column definitions** (`columns`) describe how to access and render data. They are *not* state — define them outside render or memoize them.
- **Row models** are opt-in pipelines. `getCoreRowModel()` is always required; add `getSortedRowModel()`, `getFilteredRowModel()`, etc. only for features you use.
- **`flexRender`** renders a `header`/`cell`/`footer` definition (string, JSX, or function) with the correct context.
- **State** lives inside the table by default; lift any slice into React state by pairing `state.<slice>` with `on<Slice>Change`.

## Quick Start

```tsx
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'

type Person = {
  id: string
  firstName: string
  lastName: string
  age: number
}

// createColumnHelper gives full type-safety on accessors, cells, and headers.
const columnHelper = createColumnHelper<Person>()

const columns = [
  columnHelper.accessor('firstName', { header: 'First Name' }),
  columnHelper.accessor('lastName', { header: 'Last Name' }),
  columnHelper.accessor('age', {
    header: 'Age',
    cell: info => info.getValue(),
  }),
  // Computed/derived column needs an explicit id:
  columnHelper.accessor(row => `${row.firstName} ${row.lastName}`, {
    id: 'fullName',
    header: 'Full Name',
  }),
  // Display-only column (no data model — no sorting/filtering):
  columnHelper.display({
    id: 'actions',
    cell: ({ row }) => <button onClick={() => edit(row.original)}>Edit</button>,
  }),
]

function DataTable({ data }: { data: Person[] }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map(headerGroup => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map(header => (
              <th key={header.id} colSpan={header.colSpan}>
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map(row => (
          <tr key={row.id}>
            {row.getVisibleCells().map(cell => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

> Both `createColumnHelper` and plain `ColumnDef<Person>[]` objects work. The helper is preferred for inference (especially with `accessorFn`). The object form (`{ accessorKey: 'firstName', header: 'Name' }`) is equivalent.

## Column Definitions

### Three column kinds

| Kind | Created with | Has data model? | Use for |
|------|--------------|-----------------|---------|
| Accessor | `columnHelper.accessor` / `accessorKey` / `accessorFn` | Yes | Real data — enables sorting/filtering/grouping |
| Display | `columnHelper.display` | No | Buttons, checkboxes, expanders |
| Group | `columnHelper.group` / `{ header, columns: [...] }` | No | Nesting columns under a shared header |

```tsx
const columns = [
  // accessorKey — direct property access
  columnHelper.accessor('email', { header: 'Email' }),

  // accessorFn — computed value (requires explicit id)
  columnHelper.accessor(row => row.profile.name, { id: 'name', header: 'Name' }),

  // Custom cell + header renderers
  columnHelper.accessor('status', {
    header: () => <span className="font-bold">Status</span>,
    cell: ({ getValue }) => <span className={`badge-${getValue()}`}>{getValue()}</span>,
  }),

  // Grouped columns (group/display columns have no data, so give them an id if no string header)
  columnHelper.group({
    header: 'Name',
    columns: [
      columnHelper.accessor('firstName', { header: 'First' }),
      columnHelper.accessor('lastName', { header: 'Last' }),
    ],
  }),
]
```

Common `ColumnDef` options: `header`, `cell`, `footer`, `id`, `enableSorting`, `enableColumnFilter`, `enableGlobalFilter`, `enableHiding`, `enablePinning`, `enableResizing`, `sortingFn`, `filterFn`, `aggregationFn`, `size` / `minSize` / `maxSize`, `meta`.

The cell context (`info`) exposes `getValue()`, `row`, `column`, `table`, and `renderValue()`.

## Row Models

Import only what you use; each is a factory you call:

```tsx
import {
  getCoreRowModel,        // required — base rows
  getSortedRowModel,      // sorting
  getFilteredRowModel,    // column + global filtering
  getPaginationRowModel,  // client-side pagination
  getGroupedRowModel,     // grouping
  getExpandedRowModel,    // expanding / sub-rows
  getFacetedRowModel,     // faceting (unique values, min/max)
  getFacetedUniqueValues,
  getFacetedMinMaxValues,
} from '@tanstack/react-table'
```

## Controlled vs Uncontrolled State

By default state is internal. Read it with `table.getState()`; mutate with `table.setX(...)`.

To control a slice, pass it in `state` and supply the matching `onXChange` handler:

```tsx
const [sorting, setSorting] = useState<SortingState>([])

const table = useReactTable({
  data,
  columns,
  state: { sorting },          // controlled slice
  onSortingChange: setSorting, // updater function (value | (prev) => next)
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
})
```

`onXChange` handlers receive an **updater** (the same shape as a React `setState` arg), so passing the setState function directly works. For uncontrolled defaults, use `initialState` instead of `state`:

```tsx
const table = useReactTable({
  data,
  columns,
  initialState: { pagination: { pageSize: 25 }, columnVisibility: { id: false } },
  getCoreRowModel: getCoreRowModel(),
})
```

> Do not pass the same slice in both `state` and `initialState`. Use `getRowId: row => row.uuid` so selection/expansion keys survive data reordering.

## Sorting

```tsx
import { useReactTable, getCoreRowModel, getSortedRowModel, type SortingState } from '@tanstack/react-table'

const [sorting, setSorting] = useState<SortingState>([])

const table = useReactTable({
  data,
  columns,
  state: { sorting },
  onSortingChange: setSorting,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
})

// In <th>:
<th onClick={header.column.getToggleSortingHandler()} style={{ cursor: 'pointer' }}>
  {flexRender(header.column.columnDef.header, header.getContext())}
  {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
</th>
```

Per-column control: `enableSorting`, `enableMultiSort`, `sortDescFirst`, `sortingFn` (`'alphanumeric' | 'text' | 'datetime' | 'basic'` or a custom fn). Useful APIs: `column.getCanSort()`, `column.getSortIndex()`, `column.clearSorting()`, `table.setSorting()`.

## Filtering

### Column filters

```tsx
import { getFilteredRowModel, type ColumnFiltersState } from '@tanstack/react-table'

const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

const table = useReactTable({
  data,
  columns,
  state: { columnFilters },
  onColumnFiltersChange: setColumnFilters,
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
})

// Per-column filter input (in <th>):
{header.column.getCanFilter() && (
  <input
    value={(header.column.getFilterValue() ?? '') as string}
    onChange={e => header.column.setFilterValue(e.target.value)}
    placeholder={`Filter ${header.column.id}…`}
  />
)}
```

Built-in `filterFn` names: `'includesString'`, `'includesStringSensitive'`, `'equalsString'`, `'arrIncludes'`, `'arrIncludesAll'`, `'arrIncludesSome'`, `'equals'`, `'weakEquals'`, `'inNumberRange'`. Or supply a custom function:

```tsx
columnHelper.accessor('age', {
  filterFn: (row, columnId, filterValue) => {
    const [min, max] = filterValue as [number, number]
    const age = row.getValue<number>(columnId)
    return age >= min && age <= max
  },
})
```

### Global filter

```tsx
const [globalFilter, setGlobalFilter] = useState('')

const table = useReactTable({
  data,
  columns,
  state: { globalFilter },
  onGlobalFilterChange: setGlobalFilter,
  globalFilterFn: 'includesString', // default; or 'fuzzy' with a custom fn registered
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
})

<input
  value={globalFilter}
  onChange={e => setGlobalFilter(e.target.value)}
  placeholder="Search all columns…"
/>
```

Exclude a column from global search with `enableGlobalFilter: false` in its def.

### Faceting (filter UIs)

Add `getFacetedRowModel: getFacetedRowModel()` plus `getFacetedUniqueValues()` / `getFacetedMinMaxValues()`, then read `column.getFacetedUniqueValues()` (a `Map`) or `column.getFacetedMinMaxValues()` to build dropdowns/range inputs.

## Pagination

```tsx
import { getPaginationRowModel, type PaginationState } from '@tanstack/react-table'

const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })

const table = useReactTable({
  data,
  columns,
  state: { pagination },
  onPaginationChange: setPagination,
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
})

<div>
  <button onClick={() => table.firstPage()} disabled={!table.getCanPreviousPage()}>{'<<'}</button>
  <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>{'<'}</button>
  <span>Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
  <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>{'>'}</button>
  <button onClick={() => table.lastPage()} disabled={!table.getCanNextPage()}>{'>>'}</button>
  <select
    value={table.getState().pagination.pageSize}
    onChange={e => table.setPageSize(Number(e.target.value))}
  >
    {[10, 20, 50].map(size => <option key={size} value={size}>Show {size}</option>)}
  </select>
</div>
```

APIs: `table.setPageIndex()`, `table.setPageSize()`, `table.getPageCount()`, `table.getRowCount()`. For server-side, set `manualPagination: true` and provide `rowCount` (or legacy `pageCount`) — see [Server-Side](#server-side--manual-operations).

## Row Selection

```tsx
import { type RowSelectionState } from '@tanstack/react-table'

const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

const columns = [
  columnHelper.display({
    id: 'select',
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllRowsSelected()}
        ref={el => { if (el) el.indeterminate = table.getIsSomeRowsSelected() }}
        onChange={table.getToggleAllRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
  }),
  // …other columns
]

const table = useReactTable({
  data,
  columns,
  state: { rowSelection },
  onRowSelectionChange: setRowSelection,
  getCoreRowModel: getCoreRowModel(),
  getRowId: row => row.id,            // recommended: stable keys
  enableRowSelection: true,           // or (row) => row.original.age > 18
  // enableMultiRowSelection: false,  // single-select mode
})

const selectedRows = table.getSelectedRowModel().rows
```

Use `getToggleAllPageRowsSelectedHandler()` / `getIsAllPageRowsSelected()` to select only the current page. Raw selection state is `table.getState().rowSelection` (a `{ [rowId]: true }` map).

## Column Visibility

```tsx
import { type VisibilityState } from '@tanstack/react-table'

const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

const table = useReactTable({
  data,
  columns,
  state: { columnVisibility },
  onColumnVisibilityChange: setColumnVisibility,
  getCoreRowModel: getCoreRowModel(),
})

<label>
  <input
    type="checkbox"
    checked={table.getIsAllColumnsVisible()}
    onChange={table.getToggleAllColumnsVisibilityHandler()}
  /> Toggle All
</label>
{table.getAllLeafColumns().map(column => (
  <label key={column.id}>
    <input
      type="checkbox"
      checked={column.getIsVisible()}
      onChange={column.getToggleVisibilityHandler()}
    /> {column.id}
  </label>
))}
```

Disable hiding per column with `enableHiding: false`. `row.getVisibleCells()` and `table.getVisibleLeafColumns()` already respect visibility.

## Column Ordering

```tsx
import { type ColumnOrderState } from '@tanstack/react-table'

const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]) // array of column ids

const table = useReactTable({
  data,
  columns,
  state: { columnOrder },
  onColumnOrderChange: setColumnOrder,
  getCoreRowModel: getCoreRowModel(),
})
```

Order is applied left-to-right by column id; ids not listed keep their default order after the listed ones. Pair with a drag-and-drop library (e.g. `@dnd-kit`) to reorder.

## Column Pinning

```tsx
import { type ColumnPinningState } from '@tanstack/react-table'

const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({ left: [], right: [] })

const table = useReactTable({
  data,
  columns,
  state: { columnPinning },
  onColumnPinningChange: setColumnPinning,
  getCoreRowModel: getCoreRowModel(),
})

// Pin/unpin a column:
<button onClick={() => column.pin('left')}>Pin left</button>
<button onClick={() => column.pin(false)}>Unpin</button>
```

Two rendering strategies:
- **Sticky CSS** (single table): use `column.getIsPinned()`, `column.getStart('left')`, `column.getAfter('right')` to compute `position: sticky` offsets.
- **Split tables**: render with `getLeftHeaderGroups()`/`getCenterHeaderGroups()`/`getRightHeaderGroups()` and the matching `row.getLeftVisibleCells()` / `getCenterVisibleCells()` / `getRightVisibleCells()`.

## Column Sizing / Resizing

```tsx
const columns = [
  columnHelper.accessor('id', { size: 200, minSize: 50, maxSize: 500 }),
]

const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
  columnResizeMode: 'onChange',      // live resize; default is 'onEnd'
  columnResizeDirection: 'ltr',      // or 'rtl'
  enableColumnResizing: true,
})

// Apply width and a resize handle in the header cell:
<th style={{ width: header.getSize() }}>
  {flexRender(header.column.columnDef.header, header.getContext())}
  {header.column.getCanResize() && (
    <div
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      className={`resizer ${header.column.getIsResizing() ? 'isResizing' : ''}`}
    />
  )}
</th>
```

`column.getSize()` returns the current width. Live state: `table.getState().columnSizingInfo.isResizingColumn`. With `'onChange'` mode, memoize the table body for performance.

## Grouping & Aggregation

```tsx
import { getGroupedRowModel, getExpandedRowModel, type GroupingState } from '@tanstack/react-table'

const [grouping, setGrouping] = useState<GroupingState>([]) // array of column ids

const table = useReactTable({
  data,
  columns,
  state: { grouping },
  onGroupingChange: setGrouping,
  getCoreRowModel: getCoreRowModel(),
  getGroupedRowModel: getGroupedRowModel(),
  getExpandedRowModel: getExpandedRowModel(), // needed to expand grouped rows
})
```

Per-column: `enableGrouping`, `aggregationFn` (`'sum' | 'min' | 'max' | 'extent' | 'mean' | 'median' | 'unique' | 'uniqueCount' | 'count'` or custom), and `aggregatedCell` for rendering the aggregate. Cell helpers: `cell.getIsGrouped()`, `cell.getIsAggregated()`, `cell.getIsPlaceholder()`. Toggle with `column.getToggleGroupingHandler()`.

## Expanding & Sub-Rows

```tsx
import { getExpandedRowModel, type ExpandedState } from '@tanstack/react-table'

const [expanded, setExpanded] = useState<ExpandedState>({}) // true | Record<string, boolean>

const table = useReactTable({
  data,
  columns,
  state: { expanded },
  onExpandedChange: setExpanded,
  getSubRows: row => row.children,   // where nested rows live in your data
  getCoreRowModel: getCoreRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
  // getRowCanExpand: row => true,   // expand rows without subRows (e.g. detail panels)
})

// Expander cell:
{row.getCanExpand() && (
  <button onClick={row.getToggleExpandedHandler()} style={{ paddingLeft: `${row.depth * 1}rem` }}>
    {row.getIsExpanded() ? '▼' : '▶'}
  </button>
)}
```

Options: `manualExpanding`, `paginateExpandedRows`, `filterFromLeafRows`, `maxLeafRowFilterDepth`. `row.depth` gives nesting level for indentation.

## Server-Side / Manual Operations

When the backend does the work, set the matching `manual*` flag and supply controlled state. The manual flag tells the table **not** to re-process rows client-side (it trusts `data` as already sorted/filtered/paginated).

```tsx
function ServerTable() {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const { data, isLoading } = useQuery({
    queryKey: ['users', pagination, sorting, columnFilters],
    queryFn: () => fetchUsers({ pagination, sorting, columnFilters }),
    placeholderData: keepPreviousData, // avoid layout flashes between pages
  })

  const table = useReactTable({
    data: data?.rows ?? [],
    columns,
    rowCount: data?.total ?? 0,          // total across all pages (preferred over pageCount)
    state: { pagination, sorting, columnFilters },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    // Do NOT add get*RowModel() for the manual features — only getCoreRowModel().
  })

  if (isLoading) return <div>Loading…</div>
  return <table>{/* render as usual */}</table>
}
```

Manual flags: `manualPagination`, `manualSorting`, `manualFiltering`, `manualGrouping`, `manualExpanding`. Provide `rowCount` (v8.13+) so `getPageCount()` works without a client row model.

## Virtualization

For thousands of rows, pair with `@tanstack/react-virtual` (separate package) rather than a built-in feature. Virtualize the row loop only:

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

const rows = table.getRowModel().rows
const rowVirtualizer = useVirtualizer({
  count: rows.length,
  estimateSize: () => 40,
  getScrollElement: () => parentRef.current,
  overscan: 10,
})

rowVirtualizer.getVirtualItems().map(virtualRow => {
  const row = rows[virtualRow.index]
  // render <tr> positioned with virtualRow.start / measureElement
})
```

Keep `columns` and `data` referentially stable (memoized) so virtualization stays smooth.
