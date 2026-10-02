import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";

// Shape checks for files read back from disk.
//
// The schemas are deliberately lenient: they require only what the loaders and
// their callers dereference, leave everything else optional, and allow extra
// keys, so any file that loaded before still loads. They check — they never
// clean, default or convert — so a valid file is returned exactly as parsed.
//
// `Value.Check` and `Value.Errors` interpret the schema rather than compiling
// it, so they work under the packaged app's CSP (no `new Function`).

const OptionalString = Type.Optional(Type.String());
const OptionalNullableString = Type.Optional(Type.Union([Type.String(), Type.Null()]));

/** `_meta.yaml` in a chats or scheduler folder. */
export const FolderMetaSchema = Type.Object({
  isPinned: Type.Optional(Type.Boolean()),
  createdAt: OptionalString,
});

/** The fields of a chat file that the chat tree reads. */
export const ChatSummarySchema = Type.Object({
  id: Type.String(),
  title: OptionalString,
  updatedAt: OptionalString,
});

/** A chat file opened in full. Messages need string content for rendering. */
export const ChatFileSchema = Type.Object({
  id: Type.String(),
  title: OptionalString,
  updatedAt: OptionalString,
  messages: Type.Array(
    Type.Object({
      content: Type.String(),
      toolCalls: Type.Optional(Type.Array(Type.Object({}))),
    }),
  ),
});

/** A schedule `.yaml` file. */
export const ScheduleFileSchema = Type.Object({
  id: Type.String(),
  name: OptionalString,
  cron: OptionalString,
  agentId: OptionalString,
  prompt: OptionalString,
  enabled: Type.Optional(Type.Boolean()),
  hasError: Type.Optional(Type.Boolean()),
  lastRun: OptionalNullableString,
  nextRun: OptionalNullableString,
  createdAt: OptionalString,
  updatedAt: OptionalString,
});

/** A task folder's `folder.yaml`. */
export const TaskFolderFileSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  isPinned: Type.Optional(Type.Boolean()),
  tasks: Type.Optional(
    Type.Array(
      Type.Object({
        id: Type.String(),
        title: OptionalString,
        description: OptionalString,
      }),
    ),
  ),
  createdAt: OptionalString,
  updatedAt: OptionalString,
});

/**
 * Check a value read from `path` against `schema`. On failure, log the path and
 * the first error and return false; the caller skips the file or returns null.
 */
export function checkLoaded<T extends TSchema>(schema: T, value: unknown, path: string): value is Static<T> {
  if (Value.Check(schema, value)) return true;
  const [first] = Value.Errors(schema, value);
  const where = first?.instancePath || "/";
  console.warn(`[storage] Ignoring invalid file ${path}: ${where} ${first?.message ?? "has the wrong shape"}`);
  return false;
}

/** Parse `content` with `parse`, then check it. Logs and returns null on either failure. */
export function parseLoaded<T extends TSchema>(
  schema: T,
  content: string,
  path: string,
  parse: (content: string) => unknown,
): Static<T> | null {
  let value: unknown;
  try {
    value = parse(content);
  } catch (error) {
    console.warn(`[storage] Ignoring unparseable file ${path}:`, error);
    return null;
  }
  return checkLoaded(schema, value, path) ? value : null;
}
