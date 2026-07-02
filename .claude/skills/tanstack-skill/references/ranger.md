# TanStack Ranger

Headless utility for building range and multi-range sliders. You render and style every element yourself; Ranger handles values, snapping, dragging, keyboard interaction, and tick/percentage math.

- Package: `@tanstack/react-ranger`
- Version targeted: **0.0.5** (still pre-1.0 / experimental — API may change)
- Peer deps: React 16.8+ / 17 / 18

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Single Range Slider](#single-range-slider)
- [Multi-Range Slider](#multi-range-slider)
- [Steps and Ticks](#steps-and-ticks)
- [Options](#options)
- [Ranger Instance API](#ranger-instance-api)

## Installation

```bash
npm install @tanstack/react-ranger
```

## Quick Start

```tsx
import React from 'react'
import { useRanger, Ranger } from '@tanstack/react-ranger'

function BasicSlider() {
  const trackRef = React.useRef<HTMLDivElement>(null)
  const [values, setValues] = React.useState<ReadonlyArray<number>>([10, 50])

  const ranger = useRanger<HTMLDivElement>({
    getRangerElement: () => trackRef.current, // required: returns the track DOM node
    values,
    min: 0,
    max: 100,
    stepSize: 5,
    onChange: (instance: Ranger<HTMLDivElement>) => setValues(instance.sortedValues),
  })

  return (
    <div
      ref={trackRef}
      style={{ position: 'relative', height: 4, background: '#ddd', borderRadius: 2 }}
    >
      {ranger.handles().map(
        ({ value, isActive, onKeyDownHandler, onMouseDownHandler, onTouchStart }, i) => (
          <button
            key={i}
            role="slider"
            aria-valuemin={ranger.options.min}
            aria-valuemax={ranger.options.max}
            aria-valuenow={value}
            onKeyDown={onKeyDownHandler}
            onMouseDown={onMouseDownHandler}
            onTouchStart={onTouchStart}
            style={{
              position: 'absolute',
              top: '50%',
              left: `${ranger.getPercentageForValue(value)}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: isActive ? 1 : 0,
              width: 14,
              height: 14,
              borderRadius: '100%',
              background: '#4f46e5',
              border: 'none',
              cursor: 'grab',
            }}
          />
        ),
      )}
    </div>
  )
}
```

## How It Works

`useRanger(options)` returns a `Ranger` instance. The two pieces you use most:

- **`ranger.handles()`** — a method (call it, do not access as a property) returning one descriptor per value. Each descriptor exposes `value`, `isActive`, and the event handlers `onKeyDownHandler`, `onMouseDownHandler`, `onTouchStart`. Wire those handlers to your handle element to enable drag, touch, and keyboard control. There is no `getHandleProps()` and no `percent` field.
- **`ranger.getPercentageForValue(value)`** — converts a value in `[min, max]` to a 0–100 CSS percentage for positioning.

`onChange` fires when a handle is released; `onDrag` fires continuously while dragging. Both receive the instance, whose `sortedValues` holds the values in ascending order.

## Single Range Slider

```tsx
function SingleSlider() {
  const trackRef = React.useRef<HTMLDivElement>(null)
  const [values, setValues] = React.useState<ReadonlyArray<number>>([25])

  const ranger = useRanger<HTMLDivElement>({
    getRangerElement: () => trackRef.current,
    values,
    min: 0,
    max: 100,
    stepSize: 5,
    onChange: (instance) => setValues(instance.sortedValues),
  })

  return (
    <div>
      <label>Volume: {values[0]}%</label>
      <div
        ref={trackRef}
        style={{ position: 'relative', height: 8, background: '#e5e7eb', borderRadius: 4, maxWidth: 400 }}
      >
        {/* Track fill */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            height: '100%',
            borderRadius: 4,
            background: '#4f46e5',
            width: `${ranger.getPercentageForValue(values[0])}%`,
          }}
        />
        {ranger.handles().map(({ value, isActive, onKeyDownHandler, onMouseDownHandler, onTouchStart }, i) => (
          <button
            key={i}
            role="slider"
            aria-valuemin={ranger.options.min}
            aria-valuemax={ranger.options.max}
            aria-valuenow={value}
            onKeyDown={onKeyDownHandler}
            onMouseDown={onMouseDownHandler}
            onTouchStart={onTouchStart}
            style={{
              position: 'absolute',
              top: '50%',
              left: `${ranger.getPercentageForValue(value)}%`,
              transform: 'translate(-50%, -50%)',
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'white',
              border: '2px solid #4f46e5',
              cursor: 'grab',
              zIndex: isActive ? 1 : 0,
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

## Multi-Range Slider

Pass multiple `values`. Use `sortedValues` to draw the selected band between handles.

```tsx
function PriceRangeSlider() {
  const trackRef = React.useRef<HTMLDivElement>(null)
  const [values, setValues] = React.useState<ReadonlyArray<number>>([20, 80])

  const ranger = useRanger<HTMLDivElement>({
    getRangerElement: () => trackRef.current,
    values,
    min: 0,
    max: 100,
    stepSize: 1,
    onChange: (instance) => setValues(instance.sortedValues),
  })

  const [low, high] = ranger.sortedValues

  return (
    <div>
      <label>Price: ${values[0]} – ${values[1]}</label>
      <div
        ref={trackRef}
        style={{ position: 'relative', height: 8, background: '#e5e7eb', borderRadius: 4, maxWidth: 400, margin: '20px 0' }}
      >
        {/* Selected band */}
        {ranger.sortedValues.length >= 2 && (
          <div
            style={{
              position: 'absolute',
              left: `${ranger.getPercentageForValue(low)}%`,
              width: `${ranger.getPercentageForValue(high) - ranger.getPercentageForValue(low)}%`,
              height: '100%',
              borderRadius: 4,
              background: '#4f46e5',
            }}
          />
        )}
        {ranger.handles().map(({ value, isActive, onKeyDownHandler, onMouseDownHandler, onTouchStart }, i) => (
          <button
            key={i}
            role="slider"
            aria-valuenow={value}
            onKeyDown={onKeyDownHandler}
            onMouseDown={onMouseDownHandler}
            onTouchStart={onTouchStart}
            style={{
              position: 'absolute',
              top: '50%',
              left: `${ranger.getPercentageForValue(value)}%`,
              transform: 'translate(-50%, -50%)',
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'white',
              border: '2px solid #4f46e5',
              cursor: 'grab',
              zIndex: isActive ? 1 : 0,
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

## Steps and Ticks

Use `stepSize` for evenly spaced snapping, or `steps` (an array) for discrete snap points. Render labels with `ranger.getTicks()`, which returns `{ value, key, percentage }` for each tick. Ticks are auto-generated from `tickSize` (default 10), derived from `steps`, or set explicitly via `ticks`.

```tsx
function TickedSlider() {
  const trackRef = React.useRef<HTMLDivElement>(null)
  const [values, setValues] = React.useState<ReadonlyArray<number>>([0, 250000])

  const ranger = useRanger<HTMLDivElement>({
    getRangerElement: () => trackRef.current,
    values,
    min: 0,
    max: 500000,
    steps: [0, 20000, 100000, 250000, 500000], // snap to these exact points
    ticks: [0, 100000, 250000, 500000],         // render labels at these points
    onChange: (instance) => setValues(instance.sortedValues),
  })

  return (
    <div ref={trackRef} style={{ position: 'relative', height: 4, background: '#ddd', margin: '0 40px' }}>
      {ranger.getTicks().map(({ value, key, percentage }) => (
        <div
          key={key}
          style={{ position: 'absolute', left: `${percentage}%`, transform: 'translateX(-50%)', top: 8, fontSize: 11 }}
        >
          {value.toLocaleString()}
        </div>
      ))}
      {/* handles rendered as in earlier examples */}
    </div>
  )
}
```

## Options

```tsx
const ranger = useRanger<HTMLDivElement>({
  // Required
  getRangerElement: () => trackRef.current, // returns the track DOM node
  values,                                   // ReadonlyArray<number> of current handle positions
  min: 0,
  max: 100,
  stepSize: 1,                              // snapping interval (required unless `steps` is given)

  // Optional
  steps: [0, 25, 50, 75, 100],              // discrete snap points; overrides stepSize
  tickSize: 10,                             // auto tick interval (default 10)
  ticks: [0, 50, 100],                      // explicit tick positions; overrides tickSize
  onChange: (instance) => {},               // fires when a handle is released
  onDrag: (instance) => {},                 // fires continuously during drag
  interpolator: {                           // custom (non-linear) scale; defaults to linear
    getPercentageForValue: (val, min, max) => ((val - min) / (max - min)) * 100,
    getValueForClientX: (clientX, { width, left }, min, max) =>
      min + (max - min) * ((clientX - left) / width),
  },
  debug: false,
})
```

## Ranger Instance API

```tsx
ranger.handles()                  // () => Array<{ value, isActive, onKeyDownHandler, onMouseDownHandler, onTouchStart }>
ranger.getTicks()                 // () => Array<{ value, key, percentage }>
ranger.getPercentageForValue(v)   // number → 0–100 CSS percentage
ranger.sortedValues               // ReadonlyArray<number>, ascending
ranger.activeHandleIndex          // number | null (index of handle being dragged)
ranger.options                    // resolved options (e.g. ranger.options.min / .max)

// Handle descriptor (from ranger.handles())
handle.value                      // number — current value
handle.isActive                   // boolean — true while this handle is being dragged
handle.onKeyDownHandler           // arrow keys move by one step
handle.onMouseDownHandler         // starts a mouse drag
handle.onTouchStart               // starts a touch drag
```
