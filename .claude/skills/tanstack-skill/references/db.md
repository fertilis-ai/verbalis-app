# TanStack DB (Beta)

> **Status**: Beta - API may change. Use with caution in production.

## Installation

```bash
npm install @tanstack/react-db
```

## Overview

TanStack DB is a reactive, client-first data store for managing API data with collections, live queries, and optimistic mutations.

## Quick Start

```tsx
import { createDB, createCollection } from '@tanstack/db'
import { useQuery } from '@tanstack/react-db'

// Define a collection
const usersCollection = createCollection({
  name: 'users',
  primaryKey: 'id',
})

// Create database instance
const db = createDB({
  collections: [usersCollection],
})

// Use in React
function UserList() {
  const { data: users } = useQuery(
    db.users.query().where('active', '==', true)
  )

  return (
    <ul>
      {users.map(user => <li key={user.id}>{user.name}</li>)}
    </ul>
  )
}
```

## Core Concepts

### Collections

Collections are typed sets of objects with a primary key:

```tsx
const postsCollection = createCollection({
  name: 'posts',
  primaryKey: 'id',
  schema: {
    id: 'string',
    title: 'string',
    authorId: 'string',
    createdAt: 'date',
  },
})
```

### Live Queries

Queries are reactive and update automatically:

```tsx
// Filter
const query = db.posts.query().where('authorId', '==', userId)

// Sort
const query = db.posts.query().orderBy('createdAt', 'desc')

// Limit
const query = db.posts.query().limit(10)

// Join across collections
const query = db.posts
  .query()
  .join(db.users, 'authorId', 'id')
  .select(['title', 'users.name'])
```

### Optimistic Mutations

```tsx
import { useMutation } from '@tanstack/react-db'

function CreatePost() {
  const mutation = useMutation({
    mutationFn: async (post) => {
      // Optimistically add to collection
      db.posts.insert(post)

      // Sync with server
      const result = await api.createPost(post)

      // Update with server response
      db.posts.update(post.id, result)
    },
    onError: (_, post) => {
      // Rollback on error
      db.posts.delete(post.id)
    },
  })

  return (
    <button onClick={() => mutation.mutate({ id: uuid(), title: 'New Post' })}>
      Create Post
    </button>
  )
}
```

## Syncing with Backend

```tsx
// Load data from API
async function syncUsers() {
  const users = await api.getUsers()
  db.users.sync(users) // Replace collection contents
}

// Append data
async function loadMorePosts(cursor: string) {
  const posts = await api.getPosts({ cursor })
  db.posts.insert(posts) // Add to collection
}
```

For the latest API and examples, see: https://tanstack.com/db/latest
