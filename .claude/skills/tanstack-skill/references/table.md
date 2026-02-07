# TanStack Table

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Column Definitions](#column-definitions)
- [Sorting](#sorting)
- [Filtering](#filtering)
- [Pagination](#pagination)
- [Row Selection](#row-selection)
- [Column Visibility](#column-visibility)
- [Server-Side Data](#server-side-data)

## Installation

```bash
npm install @tanstack/react-table
```

## Quick Start

```tsx
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table'

type Person = {
  id: string
  name: string
  email: string
  age: number
}

const columns: ColumnDef<Person>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'age', header: 'Age' },
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
              <th key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
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

## Column Definitions

### Basic Columns

```tsx
const columns: ColumnDef<Person>[] = [
  // Simple accessor
  { accessorKey: 'name', header: 'Name' },

  // Accessor function for nested data
  {
    accessorFn: row => `${row.firstName} ${row.lastName}`,
    id: 'fullName',
    header: 'Full Name',
  },

  // Custom cell renderer
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => (
      <span className={`badge badge-${getValue()}`}>
        {getValue()}
      </span>
    ),
  },

  // Custom header
  {
    accessorKey: 'age',
    header: () => <span className="font-bold">Age</span>,
  },
]
```

### Column Groups

```tsx
const columns: ColumnDef<Person>[] = [
  {
    header: 'Personal Info',
    columns: [
      { accessorKey: 'firstName', header: 'First Name' },
      { accessorKey: 'lastName', header: 'Last Name' },
    ],
  },
  {
    header: 'Contact',
    columns: [
      { accessorKey: 'email', header: 'Email' },
      { accessorKey: 'phone', header: 'Phone' },
    ],
  },
]
```

### Action Columns

```tsx
const columns: ColumnDef<Person>[] = [
  // ... data columns
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => (
      <div>
        <button onClick={() => handleEdit(row.original)}>Edit</button>
        <button onClick={() => handleDelete(row.original.id)}>Delete</button>
      </div>
    ),
  },
]
```

## Sorting

```tsx
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
} from '@tanstack/react-table'

function SortableTable({ data }) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map(headerGroup => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map(header => (
              <th
                key={header.id}
                onClick={header.column.getToggleSortingHandler()}
                style={{ cursor: 'pointer' }}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      {/* tbody */}
    </table>
  )
}
```

## Filtering

### Global Filter

```tsx
import { getFilteredRowModel, GlobalFilterState } from '@tanstack/react-table'

function FilterableTable({ data }) {
  const [globalFilter, setGlobalFilter] = useState('')

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <>
      <input
        value={globalFilter}
        onChange={e => setGlobalFilter(e.target.value)}
        placeholder="Search all columns..."
      />
      <table>{/* ... */}</table>
    </>
  )
}
```

### Column Filters

```tsx
import { ColumnFiltersState } from '@tanstack/react-table'

function ColumnFilterTable({ data }) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useReactTable({
    data,
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map(headerGroup => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map(header => (
              <th key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
                {header.column.getCanFilter() && (
                  <input
                    value={(header.column.getFilterValue() ?? '') as string}
                    onChange={e => header.column.setFilterValue(e.target.value)}
                    placeholder={`Filter ${header.column.id}...`}
                  />
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      {/* tbody */}
    </table>
  )
}
```

### Custom Filter Functions

```tsx
const columns: ColumnDef<Person>[] = [
  {
    accessorKey: 'age',
    header: 'Age',
    filterFn: (row, columnId, filterValue) => {
      const age = row.getValue(columnId) as number
      const [min, max] = filterValue as [number, number]
      return age >= min && age <= max
    },
  },
]
```

## Pagination

```tsx
import { getPaginationRowModel, PaginationState } from '@tanstack/react-table'

function PaginatedTable({ data }) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  const table = useReactTable({
    data,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  return (
    <>
      <table>{/* ... */}</table>
      <div>
        <button
          onClick={() => table.firstPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {'<<'}
        </button>
        <button
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {'<'}
        </button>
        <span>
          Page {table.getState().pagination.pageIndex + 1} of{' '}
          {table.getPageCount()}
        </span>
        <button
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          {'>'}
        </button>
        <button
          onClick={() => table.lastPage()}
          disabled={!table.getCanNextPage()}
        >
          {'>>'}
        </button>
        <select
          value={table.getState().pagination.pageSize}
          onChange={e => table.setPageSize(Number(e.target.value))}
        >
          {[10, 20, 50].map(size => (
            <option key={size} value={size}>Show {size}</option>
          ))}
        </select>
      </div>
    </>
  )
}
```

## Row Selection

```tsx
import { RowSelectionState } from '@tanstack/react-table'

function SelectableTable({ data }) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const columns: ColumnDef<Person>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    },
    // ... other columns
  ]

  const table = useReactTable({
    data,
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true,
  })

  // Get selected rows
  const selectedRows = table.getSelectedRowModel().rows

  return (
    <>
      <div>Selected: {selectedRows.length} rows</div>
      <table>{/* ... */}</table>
    </>
  )
}
```

## Column Visibility

```tsx
import { VisibilityState } from '@tanstack/react-table'

function ToggleColumnsTable({ data }) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const table = useReactTable({
    data,
    columns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <>
      <div>
        {table.getAllLeafColumns().map(column => (
          <label key={column.id}>
            <input
              type="checkbox"
              checked={column.getIsVisible()}
              onChange={column.getToggleVisibilityHandler()}
            />
            {column.id}
          </label>
        ))}
      </div>
      <table>{/* ... */}</table>
    </>
  )
}
```

## Server-Side Data

```tsx
function ServerTable() {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const [sorting, setSorting] = useState<SortingState>([])

  const { data, isLoading } = useQuery({
    queryKey: ['users', pagination, sorting],
    queryFn: () =>
      fetch(
        `/api/users?page=${pagination.pageIndex}&size=${pagination.pageSize}` +
        `&sort=${sorting[0]?.id ?? ''}&order=${sorting[0]?.desc ? 'desc' : 'asc'}`
      ).then(r => r.json()),
  })

  const table = useReactTable({
    data: data?.rows ?? [],
    columns,
    pageCount: data?.pageCount ?? -1,
    state: { pagination, sorting },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  })

  if (isLoading) return <div>Loading...</div>

  return <table>{/* ... */}</table>
}
```
