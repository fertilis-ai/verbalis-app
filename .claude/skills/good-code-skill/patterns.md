# Patterns reference

Full, copy-ready versions of the patterns summarized in `SKILL.md`, lifted and
condensed from pi-mono. Read the named source file for the production version.

---

## 1. Dual-mode EventStream (progressive + final)

One object that is both an `AsyncIterable<T>` for live events and a
`Promise<R>` for the final result. Source: `ai/src/utils/event-stream.ts`.

```ts
export class EventStream<T, R = T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private waiting: ((value: IteratorResult<T>) => void)[] = [];
  private done = false;
  private finalResultPromise: Promise<R>;
  private resolveFinalResult!: (result: R) => void;

  constructor(
    private isComplete: (event: T) => boolean,
    private extractResult: (event: T) => R,
  ) {
    this.finalResultPromise = new Promise((r) => (this.resolveFinalResult = r));
  }

  push(event: T): void {
    if (this.done) return;
    if (this.isComplete(event)) {
      this.done = true;
      this.resolveFinalResult(this.extractResult(event));
    }
    const waiter = this.waiting.shift();
    if (waiter) waiter({ value: event, done: false });
    else this.queue.push(event);
  }

  end(result?: R): void {
    this.done = true;
    if (result !== undefined) this.resolveFinalResult(result);
    while (this.waiting.length) this.waiting.shift()!({ value: undefined as any, done: true });
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.queue.length) yield this.queue.shift()!;
      else if (this.done) return;
      else {
        const r = await new Promise<IteratorResult<T>>((res) => this.waiting.push(res));
        if (r.done) return;
        yield r.value;
      }
    }
  }

  result(): Promise<R> {
    return this.finalResultPromise;
  }
}
```

Note erasable-syntax caveat: the production code declares explicit fields and
assigns them in the constructor body rather than using `private` parameter
properties (shown compactly above for brevity). Consumer:

```ts
for await (const event of stream) updateUi(event); // progressive
const finalMessage = await stream.result();         // final value
```

---

## 2. Result type for expected failures

Source: `agent/src/harness/types.ts`.

```ts
export type Result<TValue, TError> = { ok: true; value: TValue } | { ok: false; error: TError };

export function ok<TValue, TError>(value: TValue): Result<TValue, TError> {
  return { ok: true, value };
}
export function err<TValue, TError>(error: TError): Result<TValue, TError> {
  return { ok: false, error };
}
/** Tests / explicit adapter boundaries only. */
export function getOrThrow<TValue, TError>(result: Result<TValue, TError>): TValue {
  if (!result.ok) throw result.error;
  return result.value;
}
/** Object-only to avoid truthiness bugs with primitives. */
export function getOrUndefined<TValue extends object, TError>(r: Result<TValue, TError>): TValue | undefined {
  return r.ok ? r.value : undefined;
}
export function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}
```

Use: `const r = parse(x); if (!r.ok) return r; use(r.value);`. Throw only for
programmer error.

---

## 3. Schema-first: one schema, derived type, boundary validation

Source: `coding-agent/src/core/tools/read.ts` (+ `ai/src/validation.ts`).

```ts
import { type Static, Type } from "typebox";

const readSchema = Type.Object({
  path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
  offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});

// Static type is DERIVED from the schema — they cannot drift.
export type ReadToolInput = Static<typeof readSchema>;
```

Validate-and-coerce at the boundary (compiled validator cached per schema):

```ts
import { Value } from "typebox/value";

export function validateToolArguments(schema: TSchema, raw: unknown): unknown {
  const args = structuredClone(raw);
  Value.Convert(schema, args);          // coerce "3" -> 3, etc.
  const validator = getValidator(schema); // compiled + WeakMap-cached
  if (!validator.Check(args)) {
    const errors = [...validator.Errors(args)]
      .map((e) => `  - ${e.path}: ${e.message}`)
      .join("\n");
    throw new Error(`Validation failed:\n${errors}`);
  }
  return args;
}
```

---

## 4. Dependency-injected Operations (pluggable I/O + a default)

Source: `coding-agent/src/core/tools/read.ts`, `bash.ts`.

```ts
/** Pluggable operations. Override to delegate to remote systems (e.g. SSH). */
export interface ReadOperations {
  readFile: (absolutePath: string) => Promise<Buffer>;
  access: (absolutePath: string) => Promise<void>;
  detectImageMimeType?: (absolutePath: string) => Promise<string | null | undefined>;
}

const defaultReadOperations: ReadOperations = {
  readFile: (p) => fsReadFile(p),
  access: (p) => fsAccess(p, constants.R_OK),
  detectImageMimeType: detectSupportedImageMimeTypeFromFile,
};

export interface ReadToolOptions {
  autoResizeImages?: boolean;
  operations?: ReadOperations; // default: local filesystem
}

export function createReadTool(cwd: string, options: ReadToolOptions = {}) {
  const ops = options.operations ?? defaultReadOperations;
  // ...execute uses ops.access(...) then ops.readFile(...); never touches fs directly.
}
```

Bash uses the same shape so a sandbox/SSH/container backend drops in:

```ts
export interface BashOperations {
  exec: (
    command: string,
    cwd: string,
    options: { onData: (d: Buffer) => void; signal?: AbortSignal; timeout?: number; env?: NodeJS.ProcessEnv },
  ) => Promise<{ exitCode: number | null }>;
}
```

The payoff: production = default, extension = swap impl, test = fake — with no
config flags or branching inside the tool.

---

## 5. Discriminated-union streaming events

Source: `ai/src/types.ts`.

```ts
export type AssistantMessageEvent =
  | { type: "start"; partial: AssistantMessage }
  | { type: "text_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
  | { type: "done"; reason: Extract<StopReason, "stop" | "length" | "toolUse">; message: AssistantMessage }
  | { type: "error"; reason: Extract<StopReason, "aborted" | "error">; error: AssistantMessage };
```

`Extract<...>` constrains each variant's `reason` to the legal subset. Consumers
`switch (event.type)` and the compiler flags unhandled cases.

---

## 6. Stream-protocol error handling (don't throw across async)

Source: contract documented in `agent/src/types.ts`; honored in every provider.

```ts
/**
 * Stream function contract:
 * - Must NOT throw or reject for request/model/runtime failures.
 * - Must return an AssistantMessageEventStream.
 * - Failures are encoded in the stream via an `error` protocol event.
 */
function stream(model, context, options): AssistantMessageEventStream {
  const out = new AssistantMessageEventStream();
  run()
    .catch((error) => {
      const message = buildErrorMessage(model, error);
      out.push({ type: "error", reason: "error", error: message });
      out.end(message); // still resolves result() — partial output stays usable
    });
  return out;
}
```

---

## 7. Open unions + declaration merging for extensibility

Source: `ai/src/types.ts`, `agent/src/types.ts`.

```ts
// Autocomplete for known values, still accepts custom strings:
export type Api = KnownApi | (string & {});
export type Provider = KnownProvider | (string & {});

// Apps add their own message types without you widening anything:
export interface CustomAgentMessages {} // empty by default
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];

// In an app:
declare module "@earendil-works/pi-agent-core" {
  interface CustomAgentMessages {
    notification: NotificationMessage;
  }
}
```

---

## 8. Generated code verified with `satisfies`

Source: `ai/src/models.generated.ts`, generated by `ai/scripts/generate-models.ts`.

```ts
export const MODELS = {
  "amazon-bedrock": {
    "amazon.nova-2-lite-v1:0": {
      id: "amazon.nova-2-lite-v1:0",
      name: "Nova 2 Lite",
      api: "bedrock-converse-stream",
      provider: "amazon-bedrock",
      contextWindow: 128000,
      maxTokens: 4096,
      // ...
    } satisfies Model<"bedrock-converse-stream">, // compile-time conformance, no narrowing
  },
} as const;
```

Never hand-edit a generated file. Edit the generator script and regenerate; the
`satisfies` check fails the build if a generated entry stops conforming.

---

## 9. Deterministic faux provider for tests

Source: `coding-agent/test/test-harness.ts`. A fake that obeys the real streaming
contract — emits deltas, sequences scripted responses, captures contexts.

```ts
export interface FauxResponse {
  text?: string;
  toolCalls?: Array<{ id?: string; name: string; args: Record<string, unknown> }>;
  thinking?: string;
  stopReason?: StopReason;
  error?: string;
  delayMs?: number;
}

// "hello" is shorthand for { text: "hello" }.
export function createFauxStreamFn(responses: FauxResponseInput[]) {
  const state = { callCount: 0, contexts: [] as Context[] };
  const streamFn = (model, context, options) => {
    state.contexts.push(context);
    const res = normalize(responses[state.callCount++ % responses.length]);
    const stream = new AssistantMessageEventStream();
    queueMicrotask(async () => {
      // emit start -> text_start -> text_delta (chunked 3-5 chars) -> text_end -> done
      emitRealisticDeltas(stream, res);
    });
    return stream;
  };
  return { streamFn, state };
}
```

Tests assert on `state.callCount`, `state.contexts` (exact prompt sent), and the
event sequence — no network, no API keys, no flakiness.

---

## 10. Capture-based wire-format assertions

Source: `ai/test/anthropic-eager-tool-input-compat.test.ts`. Verify exact request
shape against a local server instead of a live API.

```ts
async function captureAnthropicRequest(compat, context): Promise<CapturedRequest> {
  let captured: CapturedRequest | undefined;
  const server = createServer(async (req, res) => {
    captured = { headers: req.headers, body: await readRequestBody(req) };
    writeEmptySseResponse(res);
  });
  // start server on an ephemeral port, point the real client at it, run the provider
  return captured!;
}

it("sends per-tool eager_input_streaming by default", async () => {
  const req = await captureAnthropicRequest(undefined, createContext());
  expect(getFirstTool(req.body).eager_input_streaming).toBe(true);
  expect(req.headers["anthropic-beta"]).toBeUndefined();
});
```

---

## 11. Minimal interface contract (composition over inheritance)

Source: `tui/src/tui.ts`. A whole UI toolkit built on a four-method interface.

```ts
export interface Component {
  render(width: number): string[];   // pure: width in, lines out
  handleInput?(data: string): void;  // optional, only when focused
  wantsKeyRelease?: boolean;          // opt into release events
  invalidate(): void;                 // drop cached render state
}

export interface Focusable {
  focused: boolean;
}
export function isFocusable(c: Component | null): c is Component & Focusable {
  return c !== null && "focused" in c;
}
```

Anything implementing `Component` composes into a `Container`. No base class to
extend, no lifecycle to learn beyond these methods.

---

## 12. Fail loud with actionable diagnostics

Source: `tui/src/tui.ts`. On an invariant violation, persist a full diagnostic
*and* throw an error that names the fix.

```ts
if (!isImage && visibleWidth(line) > width) {
  const crashLogPath = path.join(os.homedir(), ".pi", "agent", "pi-crash.log");
  fs.mkdirSync(path.dirname(crashLogPath), { recursive: true });
  fs.writeFileSync(crashLogPath, buildCrashReport(i, width, newLines));
  this.stop();
  throw new Error(
    `Rendered line ${i} exceeds terminal width (${visibleWidth(line)} > ${width}).\n` +
      `Use visibleWidth() and truncateToWidth().`,
  );
}
```

The read tool applies the same spirit softly: when truncating, it appends
`Use offset=N to continue` so the consumer knows the next move.
