# TanStack Form

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Field Component](#field-component)
- [Validation](#validation)
- [Field Arrays](#field-arrays)
- [Form State](#form-state)
- [Schema Validation](#schema-validation)
- [Custom Form Hook](#custom-form-hook)

## Installation

```bash
npm install @tanstack/react-form
npm install zod  # Optional: for schema validation
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
      console.log('Submitted:', value)
      await submitToAPI(value)
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
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
              type="email"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          </div>
        )}
      />
      <button type="submit">Submit</button>
    </form>
  )
}
```

## Field Component

### Field State

```tsx
<form.Field
  name="username"
  children={(field) => {
    // Available field state
    const {
      value,           // Current field value
      meta: {
        errors,        // Array of error messages
        isTouched,     // True if field has been blurred
        isValidating,  // True during async validation
        isPristine,    // True if value unchanged from default
        isDirty,       // True if value changed from default
      },
    } = field.state

    // Available field methods
    const {
      handleChange,   // (value) => void
      handleBlur,     // () => void
      setValue,       // (value) => void
      pushValue,      // For arrays: (value) => void
      removeValue,    // For arrays: (index) => void
    } = field

    return (
      <div>
        <input
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
        />
        {meta.isTouched && meta.errors.length > 0 && (
          <span className="error">{meta.errors.join(', ')}</span>
        )}
      </div>
    )
  }}
/>
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
      />
      Accept Terms
    </label>
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

// Textarea
<form.Field
  name="message"
  children={(field) => (
    <textarea
      value={field.state.value}
      onChange={(e) => field.handleChange(e.target.value)}
      rows={4}
    />
  )}
/>
```

## Validation

### Synchronous Validation

```tsx
<form.Field
  name="username"
  validators={{
    onChange: ({ value }) => {
      if (!value) return 'Username is required'
      if (value.length < 3) return 'Username must be at least 3 characters'
      return undefined
    },
    onBlur: ({ value }) => {
      if (value && !/^[a-zA-Z0-9_]+$/.test(value)) {
        return 'Username can only contain letters, numbers, and underscores'
      }
      return undefined
    },
  }}
  children={(field) => (
    <div>
      <input
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
      />
      {field.state.meta.errors.map((error, i) => (
        <p key={i} className="error">{error}</p>
      ))}
    </div>
  )}
/>
```

### Asynchronous Validation

```tsx
<form.Field
  name="email"
  validators={{
    onChangeAsyncDebounceMs: 500, // Debounce async validation
    onChangeAsync: async ({ value }) => {
      const exists = await checkEmailExists(value)
      if (exists) return 'Email already registered'
      return undefined
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

### Form-Level Validation

```tsx
const form = useForm({
  defaultValues: { password: '', confirmPassword: '' },
  validators: {
    onSubmit: ({ value }) => {
      if (value.password !== value.confirmPassword) {
        return {
          form: 'Passwords do not match',
          fields: {
            confirmPassword: 'Must match password',
          },
        }
      }
      return undefined
    },
  },
  onSubmit: async ({ value }) => {
    await register(value)
  },
})
```

## Field Arrays

```tsx
const form = useForm({
  defaultValues: {
    teamName: '',
    members: [] as Array<{ name: string; role: string }>,
  },
  onSubmit: async ({ value }) => {
    console.log('Team:', value)
  },
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
      {(field) => (
        <div>
          <h3>Members ({field.state.value.length})</h3>

          {field.state.value.map((_, index) => (
            <div key={index} className="member-row">
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

              <button type="button" onClick={() => field.removeValue(index)}>
                Remove
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => field.pushValue({ name: '', role: '' })}
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

## Form State

### Subscribe to Form State

```tsx
// Subscribe to specific state
<form.Subscribe
  selector={(state) => [state.canSubmit, state.isSubmitting]}
  children={([canSubmit, isSubmitting]) => (
    <button type="submit" disabled={!canSubmit || isSubmitting}>
      {isSubmitting ? 'Submitting...' : 'Submit'}
    </button>
  )}
/>

// Subscribe to form errors
<form.Subscribe
  selector={(state) => state.errors}
  children={(errors) => (
    errors.length > 0 && (
      <div className="form-errors">
        {errors.map((error, i) => <p key={i}>{error}</p>)}
      </div>
    )
  )}
/>
```

### Form State Properties

```tsx
const form = useForm({ ... })

// Access form state directly
const {
  values,        // Current form values
  errors,        // Form-level errors
  isSubmitting,  // True during submission
  canSubmit,     // True if form is valid and not submitting
  isValid,       // True if no validation errors
  isDirty,       // True if any field changed
  isTouched,     // True if any field touched
} = form.state

// Form methods
form.handleSubmit()           // Trigger submission
form.reset()                  // Reset to default values
form.setFieldValue('name', 'John')  // Set specific field
form.validateAllFields()      // Trigger validation
```

## Schema Validation

### With Zod

```tsx
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'

const userSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  age: z.number().min(18, 'Must be at least 18'),
})

function UserForm() {
  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      age: 0,
    },
    validators: {
      onChange: userSchema,
    },
    onSubmit: async ({ value }) => {
      // value is typed as z.infer<typeof userSchema>
      await saveUser(value)
    },
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
      <form.Field
        name="name"
        children={(field) => (
          <div>
            <input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.errors[0] && (
              <span className="error">{field.state.meta.errors[0]}</span>
            )}
          </div>
        )}
      />
      {/* ... other fields */}
    </form>
  )
}
```

## Custom Form Hook

Create reusable form components with `createFormHook`:

```tsx
// lib/form.tsx
import { createFormHook, createFormHookContexts } from '@tanstack/react-form'

// Create contexts
const { fieldContext, formContext } = createFormHookContexts()

// Define reusable field components
function TextField({ label }: { label: string }) {
  const field = fieldContext.useFieldContext()
  return (
    <div>
      <label>{label}</label>
      <input
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
      />
      {field.state.meta.errors[0] && (
        <span className="error">{field.state.meta.errors[0]}</span>
      )}
    </div>
  )
}

function SubmitButton() {
  const form = formContext.useFormContext()
  return (
    <form.Subscribe
      selector={(s) => [s.canSubmit, s.isSubmitting]}
      children={([canSubmit, isSubmitting]) => (
        <button type="submit" disabled={!canSubmit}>
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      )}
    />
  )
}

// Create custom hook
export const { useAppForm } = createFormHook({
  fieldComponents: { TextField },
  formComponents: { SubmitButton },
  fieldContext,
  formContext,
})

// Usage
function MyForm() {
  const form = useAppForm({
    defaultValues: { username: '', email: '' },
    onSubmit: async ({ value }) => await saveUser(value),
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
      <form.AppField name="username" children={(f) => <f.TextField label="Username" />} />
      <form.AppField name="email" children={(f) => <f.TextField label="Email" />} />
      <form.AppForm><form.SubmitButton /></form.AppForm>
    </form>
  )
}
```
