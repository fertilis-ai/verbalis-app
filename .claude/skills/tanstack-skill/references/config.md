# TanStack Config

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Build Configuration](#build-configuration)
- [Publishing](#publishing)
- [Linting](#linting)

## Installation

```bash
npm install -D @tanstack/config
```

## Quick Start

TanStack Config provides opinionated tooling for building and publishing JavaScript/TypeScript packages.

### package.json Setup

```json
{
  "name": "my-package",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/cjs/index.cjs",
  "module": "dist/esm/index.js",
  "types": "dist/esm/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/esm/index.d.ts",
        "default": "./dist/esm/index.js"
      },
      "require": {
        "types": "./dist/cjs/index.d.cts",
        "default": "./dist/cjs/index.cjs"
      }
    }
  },
  "files": ["dist", "src"],
  "scripts": {
    "build": "tsup",
    "test": "vitest",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  }
}
```

## Build Configuration

### tsup.config.ts

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  esbuildOptions(options) {
    options.banner = {
      js: '"use client"', // For React Server Components
    }
  },
})
```

### Multiple Entry Points

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    utils: 'src/utils/index.ts',
    react: 'src/react/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  external: ['react', 'react-dom'],
})
```

## Publishing

### Version Management

```bash
# Bump version
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0

# Prerelease versions
npm version prerelease --preid=beta  # 1.0.0 -> 1.0.1-beta.0
```

### Publishing Workflow

```bash
# Build and test
npm run build
npm run test
npm run lint

# Publish to npm
npm publish

# Publish with tag
npm publish --tag beta
npm publish --tag next
```

### Changesets (Recommended)

```bash
npm install -D @changesets/cli
npx changeset init
```

```bash
# Add a changeset
npx changeset

# Version packages
npx changeset version

# Publish
npx changeset publish
```

## Linting

### ESLint Configuration

```js
// eslint.config.js
import { tanstackConfig } from '@tanstack/config/eslint'

export default [
  ...tanstackConfig,
  {
    rules: {
      // Custom overrides
    },
  },
]
```

### TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### Publint Check

```bash
# Check package exports
npx publint

# Common issues:
# - Missing types exports
# - Incorrect main/module fields
# - Missing files in package
```

## CI/CD Example

```yaml
# .github/workflows/publish.yml
name: Publish

on:
  push:
    branches: [main]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org

      - run: npm ci
      - run: npm run build
      - run: npm run test
      - run: npm run lint

      - name: Publish
        run: npx changeset publish
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
