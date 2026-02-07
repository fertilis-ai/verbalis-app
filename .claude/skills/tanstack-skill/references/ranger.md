# TanStack Ranger

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Single Range Slider](#single-range-slider)
- [Multi-Range Slider](#multi-range-slider)
- [Custom Styling](#custom-styling)
- [Options](#options)

## Installation

```bash
npm install @tanstack/react-ranger
```

## Quick Start

```tsx
import { useRanger } from '@tanstack/react-ranger'
import { useState } from 'react'

function RangeSlider() {
  const [values, setValues] = useState([50])

  const rangerInstance = useRanger({
    getRangerElement: () => rangerRef.current,
    values,
    min: 0,
    max: 100,
    stepSize: 1,
    onChange: (instance) => setValues(instance.sortedValues),
  })

  const rangerRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={rangerRef}
      style={{
        position: 'relative',
        height: '4px',
        background: '#ddd',
        borderRadius: '2px',
        width: '300px',
      }}
    >
      {rangerInstance.handles.map((handle, i) => (
        <button
          key={i}
          {...handle.getHandleProps()}
          style={{
            position: 'absolute',
            top: '50%',
            left: `${handle.percent}%`,
            transform: 'translate(-50%, -50%)',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: '#4f46e5',
            border: 'none',
            cursor: 'grab',
          }}
        />
      ))}
    </div>
  )
}
```

## Single Range Slider

```tsx
function SingleSlider() {
  const [values, setValues] = useState([25])
  const rangerRef = useRef<HTMLDivElement>(null)

  const rangerInstance = useRanger({
    getRangerElement: () => rangerRef.current,
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
        ref={rangerRef}
        style={{
          position: 'relative',
          height: '8px',
          background: '#e5e7eb',
          borderRadius: '4px',
          width: '100%',
          maxWidth: '400px',
        }}
      >
        {/* Track fill */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            height: '100%',
            borderRadius: '4px',
            background: '#4f46e5',
            width: `${rangerInstance.handles[0]?.percent ?? 0}%`,
          }}
        />
        {/* Handle */}
        {rangerInstance.handles.map((handle, i) => (
          <button
            key={i}
            {...handle.getHandleProps()}
            style={{
              position: 'absolute',
              top: '50%',
              left: `${handle.percent}%`,
              transform: 'translate(-50%, -50%)',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'white',
              border: '2px solid #4f46e5',
              cursor: 'grab',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

## Multi-Range Slider

```tsx
function PriceRangeSlider() {
  const [values, setValues] = useState([20, 80])
  const rangerRef = useRef<HTMLDivElement>(null)

  const rangerInstance = useRanger({
    getRangerElement: () => rangerRef.current,
    values,
    min: 0,
    max: 100,
    stepSize: 1,
    onChange: (instance) => setValues(instance.sortedValues),
  })

  return (
    <div>
      <label>Price Range: ${values[0]} - ${values[1]}</label>
      <div
        ref={rangerRef}
        style={{
          position: 'relative',
          height: '8px',
          background: '#e5e7eb',
          borderRadius: '4px',
          width: '100%',
          maxWidth: '400px',
          margin: '20px 0',
        }}
      >
        {/* Selected range track */}
        {rangerInstance.sortedValues.length >= 2 && (
          <div
            style={{
              position: 'absolute',
              left: `${rangerInstance.handles[0]?.percent ?? 0}%`,
              height: '100%',
              borderRadius: '4px',
              background: '#4f46e5',
              width: `${(rangerInstance.handles[1]?.percent ?? 0) - (rangerInstance.handles[0]?.percent ?? 0)}%`,
            }}
          />
        )}
        {/* Handles */}
        {rangerInstance.handles.map((handle, i) => (
          <button
            key={i}
            {...handle.getHandleProps()}
            style={{
              position: 'absolute',
              top: '50%',
              left: `${handle.percent}%`,
              transform: 'translate(-50%, -50%)',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'white',
              border: '2px solid #4f46e5',
              cursor: 'grab',
            }}
          >
            <span style={{ position: 'absolute', top: '-25px', left: '50%', transform: 'translateX(-50%)' }}>
              ${handle.value}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

## Custom Styling

### With Steps/Ticks

```tsx
function SteppedSlider() {
  const [values, setValues] = useState([50])
  const rangerRef = useRef<HTMLDivElement>(null)
  const steps = [0, 25, 50, 75, 100]

  const rangerInstance = useRanger({
    getRangerElement: () => rangerRef.current,
    values,
    min: 0,
    max: 100,
    stepSize: 25,
    onChange: (instance) => setValues(instance.sortedValues),
  })

  return (
    <div style={{ padding: '20px 0' }}>
      <div
        ref={rangerRef}
        style={{
          position: 'relative',
          height: '8px',
          background: '#e5e7eb',
          borderRadius: '4px',
          width: '100%',
          maxWidth: '400px',
        }}
      >
        {/* Step markers */}
        {steps.map((step) => (
          <div
            key={step}
            style={{
              position: 'absolute',
              left: `${step}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '4px',
              height: '16px',
              background: '#9ca3af',
              borderRadius: '2px',
            }}
          />
        ))}
        {/* Labels */}
        {steps.map((step) => (
          <span
            key={step}
            style={{
              position: 'absolute',
              left: `${step}%`,
              top: '20px',
              transform: 'translateX(-50%)',
              fontSize: '12px',
              color: '#6b7280',
            }}
          >
            {step}
          </span>
        ))}
        {/* Handle */}
        {rangerInstance.handles.map((handle, i) => (
          <button
            key={i}
            {...handle.getHandleProps()}
            style={{
              position: 'absolute',
              top: '50%',
              left: `${handle.percent}%`,
              transform: 'translate(-50%, -50%)',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#4f46e5',
              border: 'none',
              cursor: 'grab',
              zIndex: 10,
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

## Options

```tsx
const rangerInstance = useRanger({
  // Required
  getRangerElement: () => ref.current,  // Reference to track element
  values: [25, 75],                      // Current values array
  min: 0,                                // Minimum value
  max: 100,                              // Maximum value

  // Optional
  stepSize: 1,                           // Step increment
  onChange: (instance) => {},            // Called on value change
  onDrag: (instance) => {},              // Called during drag
  interpolator: {                        // Custom value interpolation
    getPercentageForValue: (val, min, max) => ((val - min) / (max - min)) * 100,
    getValueForClientX: (clientX, trackRect, min, max) => { ... },
  },
})

// Instance properties
rangerInstance.sortedValues      // Values in ascending order
rangerInstance.handles           // Array of handle objects
rangerInstance.getPercentageForValue(value)  // Convert value to percentage

// Handle properties
handle.value                     // Current value
handle.percent                   // Percentage position (0-100)
handle.getHandleProps()          // Props to spread on handle element
```
