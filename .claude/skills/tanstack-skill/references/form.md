# TanStack Form

`@tanstack/react-form` v1 (stable). Examples target **v1.33.x** (`npm view @tanstack/react-form version`). The v1 API is stable; the patterns below replace older 0.x/beta APIs (e.g. `fieldContext.useFieldContext()` is now the top-level `useFieldContext` export from `createFormHookContexts()`).

Headless, type-safe, framework-agnostic form state. Validation is first-class and supports **Standard Schema** (Zod 3.24+, Valibot 1.0+, ArkType 2.0+) passed directly to `validators`.

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Field Component](#field-component)
- [Validation](#validation)
- [Standard Schema Validation](#standard-schema-validation)
- [Linked Fields](#linked-fields)
- [Listeners](#listeners)
- [Field Arrays](#field-arrays)
- [Reactivity & Form State](#reactivity--form-state)
- [Submission Handling](#submission-handling)
- [Async Initial Values](#async-initial-values)
- [Form Composition (createFormHook)](#form-composition-createformhook)

## Installation

```bash
npm install @tanstack/react-form
npm install zod  # Optional: any Standard Schema lib (zod / valibot / arktype)
```

## Quick Start

```tsx
import { useForm } from '@tanstack/react-form'

function ContactForm() {
  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
    },
    onSubmit: async ({ value }) => {
      // `value` is fully typed from defaultValues
      await submitToAPI(value)
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <form.Field
        name="name"
        children={(field) => (
          <div>
            <label htmlFor={field.name}>Name</label>
            <input
              id={field.name}
              name={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          </div>
        )}
      />
      <form.Field
        name="email"
        children={(field) => (
          <div>
            <label htmlFor={field.name}>Email</label>
            <input
              id={field.name}
              name={field.name}
              type="email"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          </div>
        )}
      />

      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting]}
        children={([canSubmit, isSubmitting]) => (
          <button type="submit" disabled={!canSubmit}>
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        )}
      />
    </form>
  )
}
```

> The render function may be passed as the `children` prop or as a child function:
> `<form.Field name="x">{(field) => ...}</form.Field>`. Both are equivalent.

## Field Component

### Field State & Methods

```tsx
<form.Field
  name="username"
  children={(field) => {
    // field.state
    const {
      value, // current value
      meta: {
        errors,       // array of errors (strings or custom objects)
        errorMap,     // errors keyed by validator: { onChange, onBlur, onSubmit, ... }
        isValid,      // false when errors exist
        isTouched,    // true once the user changes OR blurs the field
        isBlurred,    // true once the field has lost focus
        isDirty,      // true once the value changed from default
        isPristine,   // true until the value changes (inverse of isDirty)
        isValidating, // true during async validation
      },
    } = field.state

    // field methods
    // field.handleChange(value)  — set value + run change validators
    // field.handleBlur()         — mark blurred + run blur validators
    // field.setValue(value)
    // field.pushValue / removeValue / moveValue / insertValue / swapValue / replaceValue (arrays)

    return (
      <div>
        <input
          id={field.name}
          name={field.name}
          value={field.state.value}
          onChange={(e) => field.handleChange(e.target.value)}
          onBlur={field.handleBlur}
        />
        {field.state.meta.isTouched && !field.state.meta.isValid && (
          <em>{field.state.meta.errors.map((e) => e?.message ?? e).join(', ')}</em>
        )}
      </div>
    )
  }}
/>
```

A reusable error helper:

```tsx
function FieldInfo({ field }: { field: AnyFieldApi }) {
  return (
    <>
      {field.state.meta.isTouched && !field.state.meta.isValid ? (
        <em>{field.state.meta.errors.join(', ')}</em>
      ) : null}
      {field.state.meta.isValidating ? 'Validating...' : null}
    </>
  )
}
```

### Different Input Types

```tsx
// Checkbox
<form.Field
  name="acceptTerms"
  children={(field) => (
    <label>
      <input
        type="checkbox"
        checked={field.state.value}
        onChange={(e) => field.handleChange(e.target.checked)}
        onBlur={field.handleBlur}
      />
      Accept Terms
    </label>
  )}
/>

// Number — use valueAsNumber so the value stays a number
<form.Field
  name="age"
  children={(field) => (
    <input
      type="number"
      value={field.state.value}
      onChange={(e) => field.handleChange(e.target.valueAsNumber)}
    />
  )}
/>

// Select
<form.Field
  name="country"
  children={(field) => (
    <select
      value={field.state.value}
      onChange={(e) => field.handleChange(e.target.value)}
    >
      <option value="">Select country</option>
      <option value="us">United States</option>
      <option value="uk">United Kingdom</option>
    </select>
  )}
/>
```

## Validation

Validators are keyed by lifecycle event. Each callback receives `({ value, fieldApi })` (field-level) or `({ value, formApi })` (form-level) and returns `undefined` (valid), a `string`, a custom object, or — at form level — a `{ form?, fields }` shape.

Field-level validator keys: `onChange`, `onBlur`, `onMount`, `onSubmit`, plus async variants `onChangeAsync`, `onBlurAsync`, `onSubmitAsync`. Debounce with `onChangeAsyncDebounceMs` (per-validator) or `asyncDebounceMs` (all async validators on the field).

```tsx
<form.Field
  name="username"
  validators={{
    onChange: ({ value }) => {
      if (!value) return 'Username is required'
      if (value.length < 3) return 'Must be at least 3 characters'
      return undefined
    },
    onBlur: ({ value }) =>
      value && !/^[a-zA-Z0-9_]+$/.test(value)
        ? 'Letters, numbers, and underscores only'
        : undefined,
  }}
  children={(field) => (
    <div>
      <input
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
      />
      {!field.state.meta.isValid && (
        <em>{field.state.meta.errors.join(', ')}</em>
      )}
    </div>
  )}
/>
```

### Async Validation

Async validators run after sync validators pass (set `asyncAlways: true` on the field to always run them).

```tsx
<form.Field
  name="email"
  asyncDebounceMs={500}
  validators={{
    onChangeAsync: async ({ value }) => {
      const exists = await checkEmailExists(value)
      return exists ? 'Email already registered' : undefined
    },
  }}
  children={(field) => (
    <div>
      <input
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
      />
      {field.state.meta.isValidating && <span>Checking...</span>}
      {field.state.meta.errors[0] && (
        <span className="error">{field.state.meta.errors[0]}</span>
      )}
    </div>
  )}
/>
```

### Form-Level Validation & Setting Field Errors

Form validators can set field-specific errors by returning a `{ form?, fields }` object. Field paths use dot/bracket notation.

```tsx
const form = useForm({
  defaultValues: { age: 0, details: { email: '' }, socials: [] },
  validators: {
    onSubmitAsync: async ({ value }) => {
      const hasErrors = await verifyDataOnServer(value)
      if (hasErrors) {
        return {
          form: 'Invalid data',           // optional form-level message
          fields: {
            age: 'Must be 13 or older',
            'details.email': 'An email is required',
            'socials[0].url': 'URL does not exist',
          },
        }
      }
      return null
    },
  },
})
```

### Custom Error Objects

Validators can return objects (not just strings); read them via `errorMap`:

```tsx
validators={{
  onChange: ({ value }) => (value < 13 ? { isOldEnough: false } : undefined),
}}

// ...
{field.state.meta.errorMap['onChange']?.isOldEnough === false && (
  <em>The user is not old enough</em>
)}
```

## Standard Schema Validation

Pass a Zod/Valibot/ArkType schema **directly** to any validator key — no adapter needed.

```tsx
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'

const userSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  age: z.number().gte(18, 'Must be at least 18'),
})

function UserForm() {
  const form = useForm({
    defaultValues: { name: '', email: '', age: 0 },
    validators: {
      onChange: userSchema, // whole-form schema; errors map back to each field
    },
    onSubmit: async ({ value }) => {
      await saveUser(value)
    },
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
      <form.Field
        name="email"
        children={(field) => (
          <div>
            <input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.errors[0]?.message && (
              <span className="error">{field.state.meta.errors[0].message}</span>
            )}
          </div>
        )}
      />
      {/* ...other fields */}
    </form>
  )
}
```

Notes:
- Schema validators can be set per-field too: `validators={{ onChange: z.string().min(3) }}`.
- Schema errors are `StandardSchemaV1Issue` objects — read `.message`.
- `onSubmit` always receives the **input** type of a Standard Schema. To get the transformed/output value, call `schema.parse(value)` inside `onSubmit`, and type `defaultValues` with `z.input<typeof schema>`.
- Async schema refinements are supported via `onChangeAsync` with a `z.*.refine(async ...)` schema.
- For partial schema reuse, call `fieldApi.parseValueWithSchema(schema)` inside a custom validator.

## Linked Fields

Re-validate a field when *another* field changes using `onChangeListenTo` (or `onBlurListenTo`):

```tsx
<form.Field
  name="confirm_password"
  validators={{
    onChangeListenTo: ['password'],
    onChange: ({ value, fieldApi }) =>
      value !== fieldApi.form.getFieldValue('password')
        ? 'Passwords do not match'
        : undefined,
  }}
  children={(field) => (
    <input
      type="password"
      value={field.state.value}
      onChange={(e) => field.handleChange(e.target.value)}
      onBlur={field.handleBlur}
    />
  )}
/>
```

## Listeners

Listeners run side effects on field events without affecting validation. Available: `onChange`, `onBlur`, `onMount`, `onSubmit`. Debounce with `onChangeDebounceMs` / `onBlurDebounceMs`.

```tsx
// Field-level: reset a dependent field when country changes
<form.Field
  name="country"
  listeners={{
    onChange: ({ value }) => form.setFieldValue('province', ''),
  }}
  children={(field) => (/* ... */)}
/>
```

```tsx
// Form-level listeners propagate to all fields
const form = useForm({
  listeners: {
    onChangeDebounceMs: 500,
    onChange: ({ formApi, fieldApi }) => {
      if (formApi.state.isValid) formApi.handleSubmit()
    },
    onMount: ({ formApi }) => log('mount', formApi.state.values),
  },
})
```

## Field Arrays

Use `mode="array"` on the array field; manipulate with `pushValue`, `removeValue`, `moveValue`, `insertValue`, `swapValue`, `replaceValue`. Reference subfields with bracket notation.

```tsx
const form = useForm({
  defaultValues: {
    teamName: '',
    members: [] as Array<{ name: string; role: string }>,
  },
  onSubmit: async ({ value }) => console.log('Team:', value),
})

return (
  <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
    <form.Field name="teamName" children={(field) => (
      <input
        placeholder="Team Name"
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
      />
    )} />

    <form.Field name="members" mode="array">
      {(membersField) => (
        <div>
          <h3>Members ({membersField.state.value.length})</h3>

          {membersField.state.value.map((_, index) => (
            <div key={index}>
              <form.Field name={`members[${index}].name`}>
                {(subField) => (
                  <input
                    placeholder="Name"
                    value={subField.state.value}
                    onChange={(e) => subField.handleChange(e.target.value)}
                  />
                )}
              </form.Field>

              <form.Field name={`members[${index}].role`}>
                {(subField) => (
                  <input
                    placeholder="Role"
                    value={subField.state.value}
                    onChange={(e) => subField.handleChange(e.target.value)}
                  />
                )}
              </form.Field>

              <button type="button" onClick={() => membersField.removeValue(index)}>
                Remove
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => membersField.pushValue({ name: '', role: '' })}
          >
            Add Member
          </button>
        </div>
      )}
    </form.Field>

    <button type="submit">Submit</button>
  </form>
)
```

## Reactivity & Form State

Two ways to read reactive state. Prefer `form.Subscribe` in JSX (only that subtree re-renders) and `useStore` when you need the value in component logic.

### form.Subscribe (UI)

```tsx
<form.Subscribe
  selector={(state) => [state.canSubmit, state.isSubmitting]}
  children={([canSubmit, isSubmitting]) => (
    <button type="submit" disabled={!canSubmit}>
      {isSubmitting ? 'Submitting...' : 'Submit'}
    </button>
  )}
/>
```

### useStore (logic)

```tsx
import { useStore } from '@tanstack/react-form'

const firstName = useStore(form.store, (state) => state.values.firstName)
const errorMap = useStore(form.store, (state) => state.errorMap)
```

> Always pass a selector — omitting it subscribes to the whole store and causes extra re-renders.

### Form State Properties & Methods

```tsx
// form.state (also reachable via form.store)
const {
  values,        // current values
  errors,        // form-level errors array
  errorMap,      // errors keyed by validator
  isSubmitting,  // true during submission
  isSubmitted,   // true after a successful submit
  canSubmit,     // valid && not currently submitting
  isValid,       // no validation errors
  isValidating,  // async validation in flight
  isDirty,       // any field changed
  isPristine,    // inverse of isDirty
  isTouched,     // any field touched
  submissionAttempts,
} = form.state

// Methods
form.handleSubmit()                 // run validators then onSubmit
form.reset()                        // reset to defaultValues (preventDefault on type="reset" buttons)
form.setFieldValue('name', 'John')  // set a field's value
form.getFieldValue('name')
form.validateAllFields('submit')    // 'change' | 'blur' | 'submit' | 'mount'
form.validateField('name', 'change')
```

## Submission Handling

`onSubmit` receives `{ value, formApi }`. Pass extra metadata via `onSubmitMeta` + `form.handleSubmit(meta)`:

```tsx
const form = useForm({
  defaultValues: { firstName: '' },
  // Default meta + its type
  onSubmitMeta: { action: '' as 'save' | 'publish' },
  onSubmit: async ({ value, meta }) => {
    await api[meta.action](value)
  },
})

// Trigger with metadata:
<button type="button" onClick={() => form.handleSubmit({ action: 'publish' })}>
  Publish
</button>
```

## Async Initial Values

Fetch defaults (e.g. via TanStack Query) and feed them to `defaultValues`, guarding on loading:

```tsx
import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'

function EditProfile() {
  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })

  const form = useForm({
    defaultValues: {
      firstName: data?.firstName ?? '',
      lastName: data?.lastName ?? '',
    },
    onSubmit: async ({ value }) => saveProfile(value),
  })

  if (isLoading) return <p>Loading...</p>

  return (/* form JSX */)
}
```

This pattern is SSR-safe (Next.js / TanStack Start): render the form once data is available, or hydrate `defaultValues` from server-fetched data.

## Form Composition (createFormHook)

Build a typed, app-wide form hook with reusable field/form components. In v1, `createFormHookContexts()` returns the `useFieldContext` / `useFormContext` hooks **directly** (top-level), and `createFormHook` returns `useAppForm`, `withForm`, and `withFieldGroup`.

```tsx
// src/hooks/form.tsx — shared across the app
import {
  createFormHook,
  createFormHookContexts,
} from '@tanstack/react-form'

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts()

function TextField({ label }: { label: string }) {
  const field = useFieldContext<string>()
  return (
    <label>
      <span>{label}</span>
      <input
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
      />
      {!field.state.meta.isValid && (
        <em>{field.state.meta.errors.map((e) => e?.message ?? e).join(', ')}</em>
      )}
    </label>
  )
}

function SubscribeButton({ label }: { label: string }) {
  const form = useFormContext()
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <button type="submit" disabled={isSubmitting}>{label}</button>
      )}
    </form.Subscribe>
  )
}

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField },
  formComponents: { SubscribeButton },
})
```

Usage — bind custom field components with `form.AppField`, and form components inside `form.AppForm`:

```tsx
import { useAppForm } from '../hooks/form'

function MyForm() {
  const form = useAppForm({
    defaultValues: { username: '', email: '' },
    onSubmit: async ({ value }) => saveUser(value),
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
      <form.AppField
        name="username"
        children={(field) => <field.TextField label="Username" />}
      />
      <form.AppField
        name="email"
        children={(field) => <field.TextField label="Email" />}
      />
      <form.AppForm>
        <form.SubscribeButton label="Submit" />
      </form.AppForm>
    </form>
  )
}
```

### Reusing form options & sections

`formOptions` shares config; `withForm` extracts a typed sub-form; `withFieldGroup` reuses a set of related fields.

```tsx
import { formOptions } from '@tanstack/react-form'
import { withForm } from '../hooks/form'

const formOpts = formOptions({
  defaultValues: { firstName: 'John', lastName: 'Doe' },
})

const ChildForm = withForm({
  ...formOpts,
  props: { title: 'Child Form' }, // extra props beyond `form`
  render: ({ form, title }) => (
    <div>
      <p>{title}</p>
      <form.AppField
        name="firstName"
        children={(field) => <field.TextField label="First Name" />}
      />
      <form.AppForm>
        <form.SubscribeButton label="Submit" />
      </form.AppForm>
    </div>
  ),
})

function Parent() {
  const form = useAppForm({ ...formOpts })
  return <ChildForm form={form} title="Testing" />
}
```
