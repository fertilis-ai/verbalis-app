---
name: good-code-skill
description: >-
  Principles and patterns for writing high-quality TypeScript — libraries, CLIs,
  and agent/LLM tooling — distilled from the pi-mono codebase (packages ai,
  agent, tui, coding-agent). Use when writing or reviewing TypeScript modules,
  designing a public API or type contract, building streaming/async code,
  pluggable abstractions, or tests. Encodes conventions like schema-first types,
  discriminated-union events, Result-typed errors, stream-protocol error
  handling, dependency-injected Operations, deterministic fakes, and a minimal
  extensible core. Read patterns.md for full code examples of any pattern.
---

# Writing good code (pi-mono style)

A field guide to the engineering choices that make the pi-mono packages good.
Each rule is an imperative with the *why* and a tight example. Apply them when
writing new code; cite them when reviewing. They are transferable — none depend
on pi specifically. For full, copy-ready code examples, read `patterns.md`.
Source: [pi-mono](https://github.com/earendil-works/pi/)

## Mindset

- **Keep the core minimal; push everything else to extensions.** A small core
  with well-considered extension points beats a feature-rich one. Before adding
  to a core module, ask whether it belongs in an extension/plugin instead. Bloat
  is the default failure mode; resist it.
- **Understand every line you write.** If you can't explain how a change
  interacts with the rest of the system, it isn't done. AI-assisted is fine;
  unread output is not.
- **Be pragmatic, not dogmatic.** Match the solution to the domain. The TUI
  diffs *lines as strings* rather than building a virtual DOM, because terminals
  are line-based and strings are their native format. The simplest model that
  fits the domain wins.
- **Don't preserve backward compatibility unless asked.** Delete dead paths;
  don't accrete compatibility shims speculatively. Ask before removing anything
  that looks intentional.

## Module & API design

- **Layer packages with one-directional dependencies.** `ai` (provider-agnostic
  LLM API) ← `agent` (runtime) ← `coding-agent` (CLI). Each layer normalizes the
  messiness below it and exposes a clean surface above. Never let a lower layer
  reach up.
- **Curate the public surface in one `index.ts`.** Re-export the intended API
  explicitly; keep internals unexported. The export list *is* the contract.
- **Prefer options objects and factory functions over positional args and
  constructors.** `createReadTool(cwd, options)` and `createAgentSession(options)`
  scale: new optional fields don't churn call sites or signatures.
- **Convert to your lingua franca at exactly one boundary.** The agent supports
  custom message types but funnels everything through a single `convertToLlm`
  call before the model sees it (`agent-loop.ts`). One conversion point = one
  place to test, one place to reason about. Find the analog in your system and
  keep the translation single-sited.

## Types are the contract

- **Single source of truth: define a schema, derive the type, validate at the
  boundary.** With TypeBox: `const s = Type.Object({...})` →
  `type Input = Static<typeof s>` → `Value.Check(s, x)` at runtime. The static
  type and the runtime validator can never drift because they're the same
  object. See `read.ts:20-26`.
- **Model state and events as discriminated unions; match exhaustively.**
  `{ type: "text_delta"; ... } | { type: "done"; ... } | { type: "error"; ... }`.
  The compiler then forces every consumer to handle every case. Use
  `Extract<StopReason, "stop" | "length">` to constrain a field to a subset.
- **Return `Result<T, E>` for expected failures; throw only for bugs.** Errors
  that callers should handle are *values*, not control flow:
  `type Result<T,E> = { ok: true; value: T } | { ok: false; error: E }` with
  `ok()`/`err()` constructors and a `getOrThrow()` for test/adapter edges
  (`harness/types.ts`). Reserve `throw` for programmer error.
- **No `any` in the public surface.** Use generics (`AgentTool<TParameters, TDetails>`),
  `unknown` + narrowing, and type guards (`isFocusable(x): x is Focusable`).
  `any` is acceptable only internally after validation has narrowed a value.
- **Keep unions open when callers may extend them:** `type Api = KnownApi | (string & {})`
  gives autocomplete for known values while still accepting custom ones.
- **Let consumers extend types via declaration merging,** not by widening your
  own types: an empty `interface CustomAgentMessages {}` that apps augment.
- **Verify generated code with `satisfies`, never hand-edit it.** `models.generated.ts`
  entries end in `satisfies Model<"...">` — compile-time conformance, zero
  runtime cost, no narrowing. Generated files are written by their generator
  script (`scripts/generate-*.ts`); edit the generator, then regenerate.
- **Use only erasable TypeScript** (Node strip-only mode): no `enum`,
  `namespace`, parameter properties, or `import =`. Use explicit class fields
  assigned in the constructor. Top-level imports only — no `await import()` or
  `import("pkg").Type`.

## Errors & async

- **Encode failures in the stream protocol; don't throw across async
  boundaries.** A streaming function's documented contract is: *must not throw
  or reject for request/model/runtime failures; emit an `error` event instead*
  (`agent/src/types.ts`). The UI consuming the stream then never faces an
  unhandled rejection and partial output stays usable. Document this contract in
  the type's doc comment.
- **Make one stream serve both progressive and final consumers.** `EventStream<T, R>`
  is `AsyncIterable<T>` *and* exposes `result(): Promise<R>`. Callers either
  `for await (const e of stream)` for live updates or `await stream.result()`
  for the final value — same object (`utils/event-stream.ts`). Build this dual
  affordance into any streaming primitive.
- **Fail loud with actionable diagnostics, not silent corruption.** When the TUI
  detects a line wider than the terminal it writes a full crash log to disk
  *and* throws an error naming the fix ("Use visibleWidth() and
  truncateToWidth()"). When the read tool truncates, it appends "Use offset=N to
  continue" to the output. An error message should tell the reader what to do
  next.
- **Normalize unknown thrown values before use:** a `toError(e: unknown): Error`
  helper that handles `Error`, `string`, and JSON-stringifiable cases keeps catch
  blocks honest.

## Pluggability & testability

- **Inject side-effecting I/O behind a small `Operations` interface with a
  default.** Every built-in tool takes its filesystem/process access as a
  pluggable interface:

  ```ts
  export interface ReadOperations {
    readFile: (absolutePath: string) => Promise<Buffer>;
    access: (absolutePath: string) => Promise<void>;
    detectImageMimeType?: (absolutePath: string) => Promise<string | null | undefined>;
  }
  const defaultReadOperations: ReadOperations = { readFile: ..., access: ... };
  ```

  Production uses the default; an SSH/container extension swaps the
  implementation; tests pass a fake — all without a config layer or branching
  inside the tool. This one move buys both extensibility and determinism.
- **Define behavior as a minimal interface contract.** A TUI component is four
  methods: `render(width): string[]`, optional `handleInput`, optional
  `wantsKeyRelease`, `invalidate()`. Anything implementing it composes. Small
  contracts compose; god-objects don't.
- **Register pluggable implementations in a registry, tagged by source, with
  lazy loading.** Providers register by `api` id with an optional `sourceId` so a
  plugin can `unregister` exactly what it added; built-ins load their module
  lazily so unused providers cost nothing.

## Code style

- **Inline single-use helpers.** A one-line helper with one call site is noise;
  inline it. Extract only at the second caller.
- **Validate inputs at the boundary, then trust them inward.** Check access /
  parse args / coerce at the entry point; downstream code assumes validity.
- **Copy mutable state on the way in and out** to prevent aliasing bugs:
  `set messages(next) { messages = next.slice(); }`. Cheaper and clearer than
  `Object.freeze`.
- **Name by role, consistently:** `createX()` factories, `XOperations` for
  pluggable backends, `XResult`/`XEvent` for returns and events, `isX()` type
  guards, `XToolInput = Static<typeof xSchema>` for derived input types.
- **Organize a feature top-down in one file:** schema/types → defaults → helpers
  → factory → rendering. A reader meets the contract before the mechanics.
- **Comment the non-obvious why, not the what.** Reserve comments for terminal
  escape sequences, protocol quirks, and Unicode edge cases — the things the next
  reader can't infer from the code.

## Performance (only where it pays)

- Optimize measured hot paths, not guesses. The TUI shows the toolkit: an ASCII
  fast path in `visibleWidth`, a bounded LRU width cache, render coalescing
  throttled to ~16ms, a pooled tracker reused across compositing calls. Each is
  local, justified by a hot path, and leaves the rest of the code simple.

## Testing

- **Prefer a deterministic fake that honors the real contract over ad-hoc
  mocks.** The coding-agent test suite uses a *faux provider* that emits real
  streaming deltas (`text_start`/`text_delta`/`done`) and lets a test script the
  sequence of responses — no network, no keys, fully reproducible
  (`test/test-harness.ts`). Build one fake per external dependency and make it
  obey the same protocol as production.
- **Assert on captured effects.** Provider tests stand up a local HTTP server,
  let the real client send, and assert on the *captured request body/headers* —
  verifying exact wire format without a live API.
- **Test the extensibility contract,** e.g. that a custom message type survives
  the conversion boundary. The seams you advertise need tests too.
- **Use a real emulator when one exists** (the TUI tests drive `@xterm/headless`)
  rather than mocking the surface you're trying to verify.
- **Small factories for test data** (`createModel()`, `createAssistantMessage()`)
  keep tests to the one field that matters.

## Tooling & process discipline

- **One formatter/linter, no debate:** Biome, tabs, 120 columns, strict TS.
  Run the project check after every code change and fix all errors/warnings
  before committing.
- **Pin direct dependencies to exact versions; treat the lockfile as reviewed
  code.** New deps with lifecycle scripts require explicit allowlisting. A
  release-age gate keeps brand-new (potentially compromised) versions out.
- **Maintain a changelog and version in lockstep.** Every change lands an
  `[Unreleased]` entry; released sections are immutable.
- **Encode the rules where both humans and agents read them** (`AGENTS.md`).
  Conventions that live only in people's heads decay.

## Provenance

Distilled from `packages/{ai,agent,tui,coding-agent}` in pi-mono. Concrete
anchors: `ai/src/utils/event-stream.ts` (dual stream), `agent/src/harness/types.ts`
(Result), `agent/src/types.ts` (stream contract), `coding-agent/src/core/tools/read.ts`
(Operations injection + schema-first), `tui/src/tui.ts` (minimal Component
contract + fail-loud), `ai/src/models.generated.ts` (`satisfies` codegen),
`coding-agent/test/test-harness.ts` (faux provider). See `patterns.md` for full
code.
