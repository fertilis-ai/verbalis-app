# TanStack Config

`@tanstack/config` `0.22.2` (stable). An opinionated toolkit for building, versioning, and
publishing high-quality JS/TS packages. Used to maintain every package in the TanStack
ecosystem. Provides Vite-powered library builds, automated publishing/changelog generation,
a shared ESLint config, and TypeDoc generation — all Publint-clean by default.

## Table of Contents
- [Installation](#installation)
- [Package Layout](#package-layout)
- [Vite Build Config](#vite-build-config)
- [tanstackViteConfig Options](#tanstackviteconfig-options)
- [ESLint Config](#eslint-config)
- [Publishing & Release Automation](#publishing--release-automation)
- [TypeDoc Config](#typedoc-config)
- [Prettier](#prettier)
- [CI Example](#ci-example)

## Installation

```bash
npm install -D @tanstack/config
```

`@tanstack/config` is a thin meta-package. It re-exports from four standalone packages, so its
sub-paths and the underlying packages are interchangeable:

| Sub-path import                | Underlying package            | Pinned version |
|--------------------------------|-------------------------------|----------------|
| `@tanstack/config/vite`        | `@tanstack/vite-config`       | 0.4.1          |
| `@tanstack/config/eslint`      | `@tanstack/eslint-config`     | 0.3.3          |
| `@tanstack/config/publish`     | `@tanstack/publish-config`    | 0.2.2          |
| `@tanstack/config/typedoc`     | `@tanstack/typedoc-config`    | 0.3.2          |

There is **no** `@tanstack/config/prettier` export. (Use `@tanstack/config` for the convenience
of a single dependency, or depend on the individual packages directly — both are valid.)

## Package Layout

The build emits ESM and (optionally) CJS into `dist/`, plus type declarations. A typical
`package.json` for a package built with this toolkit:

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
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "src"],
  "scripts": {
    "build": "vite build",
    "test": "vitest",
    "lint": "eslint",
    "typecheck": "tsc --noEmit"
  }
}
```

## Vite Build Config

The build is driven by Vite. Merge `tanstackViteConfig` into your own Vite config with Vite's
`mergeConfig`. Put framework plugins and Vitest config in *your* config; let
`tanstackViteConfig` own the `build` field.

```ts
// vite.config.ts
import { defineConfig, mergeConfig } from 'vite'
import { tanstackViteConfig } from '@tanstack/config/vite'
import react from '@vitejs/plugin-react'

const config = defineConfig({
  plugins: [react()],
  // vitest, resolve aliases, etc.
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: './src/index.ts',
    srcDir: './src',
  }),
)
```

> Avoid modifying the `build` property in your custom config — `tanstackViteConfig` sets it,
> and `mergeConfig` would otherwise clobber its opinionated defaults.

### Multiple entry points

`entry` accepts an array for multi-export packages:

```ts
tanstackViteConfig({
  entry: ['./src/index.ts', './src/react/index.ts'],
  srcDir: './src',
})
```

## tanstackViteConfig Options

```ts
interface Options {
  entry: string | Array<string>          // required — library entry point(s)
  srcDir: string                         // required — source root, used for declaration output
  exclude?: Array<string>                // files/globs to exclude from the build
  outDir?: string                        // default: 'dist'
  cjs?: boolean                          // default: true — also emit a CommonJS build
  externalDeps?: Array<string>           // default: [] — force-externalize these deps
  bundledDeps?: Array<string>            // default: [] — force-bundle these deps
  tsconfigPath?: string                  // enables vite-tsconfig-paths when set
  beforeWriteDeclarationFile?: (
    filePath: string,
    content: string,
  ) => string | undefined                // transform .d.ts content before it is written
}
```

By default, all non-bundled dependencies are externalized. Use `bundledDeps` to inline a
specific dependency, or `externalDeps` to externalize something that would otherwise be bundled.
Set `cjs: false` for ESM-only packages.

## ESLint Config

A single flat-config array, `tanstackConfig`, that is framework-agnostic. It bundles core
ESLint (`@eslint/js`), `typescript-eslint`, `eslint-plugin-import-x`, and `eslint-plugin-n`.

```js
// eslint.config.js
import { tanstackConfig } from '@tanstack/config/eslint'

export default [
  ...tanstackConfig,
  {
    rules: {
      // project-specific overrides
    },
  },
]
```

Inspect the active ruleset with:

```bash
pnpm dlx @eslint/config-inspector
```

## Publishing & Release Automation

The `publish` function automates versioning, changelog generation, and npm publishing across a
monorepo. It is ESM-only (`"type": "module"` required). Releases are driven by Changesets and a
per-branch config.

```ts
// scripts/publish.ts
import { publish } from '@tanstack/config/publish'

await publish({
  rootDir: process.cwd(),
  branch: process.env.BRANCH,
  tag: process.env.TAG,
  ghToken: process.env.GH_TOKEN,
  branchConfigs: {
    main: { prerelease: false },
    alpha: { prerelease: true },
    beta: { prerelease: true },
  },
  packages: [
    { name: '@my-scope/core', packageDir: 'packages/core' },
    { name: '@my-scope/react', packageDir: 'packages/react' },
  ],
})
```

`branchConfigs` maps a git branch to release behaviour (`prerelease: true` cuts `-alpha.N` /
`-beta.N` tags). `packages` lists every publishable workspace package. The function reads the
current branch's Changesets, bumps versions, writes changelogs, builds, and publishes.

Authentication: pass a GitHub token via `ghToken` (for release notes/tags). npm publishing
supports OIDC **trusted publishing**, so an `NPM_TOKEN` is no longer strictly required when the
workflow is configured as a trusted publisher on npm.

### Adding a changeset

```bash
pnpm changeset       # interactively record a patch/minor/major bump
# commit the generated .changeset/*.md file with your PR
```

## TypeDoc Config

Shared TypeDoc settings for generating API reference docs:

```ts
// typedoc.config.js  (or imported into your build script)
import { tanstackTypeDocConfig } from '@tanstack/config/typedoc'
```

Used to produce the API markdown that powers the docs site; most consumers won't need it.

## Prettier

`@tanstack/config` does **not** ship a Prettier preset. TanStack repos use a plain root
`prettier` config (or `prettier-plugin-*` packages) checked into the repo, plus the import-sort
behaviour that lives in the ESLint config. Format with the standard Prettier CLI:

```bash
prettier --write .
```

## CI Example

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main, alpha, beta]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write          # required for npm OIDC trusted publishing
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm run build
      - run: npm run test
      - run: npm run lint
      - name: Publish
        run: node --experimental-strip-types scripts/publish.ts
        env:
          BRANCH: ${{ github.ref_name }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # NPM_TOKEN only needed if not using OIDC trusted publishing
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```
