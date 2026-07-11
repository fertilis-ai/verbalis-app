/**
 * Smart path resolution for agent file tools.
 *
 * Resolves relative paths to the user's Working Directory,
 * and routes known app-data prefixes (agents/, prompts/, etc.)
 * to the Verbalis settings directory (~/.verbalis/).
 */

/** Known prefixes that should resolve to the settings/app-data directory. */
const SETTINGS_PREFIXES = [
  "agents",
  "prompts",
  "memories",
  "skills",
  "workflows",
  "chats",
  "tasks",
  "scheduler",
] as const;

export type ResolutionKind =
  | "empty"
  | "absolute"
  | "tilde"
  | "settings_prefix"
  | "relative";

export interface ResolvePathResult {
  resolvedPath: string;
  originalPath: string;
  resolution: ResolutionKind;
}

/** Trim, collapse repeated slashes, strip trailing slash, strip leading `./`. */
export function normalizePath(path: string): string {
  let p = path.trim();
  // Collapse repeated slashes (but keep leading slash)
  p = p.replace(/\/{2,}/g, "/");
  // Strip trailing slash (unless root "/")
  if (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }
  // Strip leading "./"
  if (p.startsWith("./")) {
    p = p.slice(2);
  }
  return p;
}

/**
 * Resolve a raw path from an agent tool call to a fully-qualified path.
 *
 * Rules (in order):
 * 1. Empty / whitespace → return workingDirectory (or homeDir fallback)
 * 2. Starts with `/` → absolute, normalize only
 * 3. Starts with `~/` → pass through (Rust expand_tilde handles it)
 * 4. Starts with a settings-category prefix → prepend settingsDir
 * 5. Otherwise → prepend workingDirectory (fall back to homeDir if WD empty)
 */
export function resolvePath(
  rawPath: string,
  workingDirectory: string,
  settingsDir: string,
  homeDir: string,
): ResolvePathResult {
  const trimmed = rawPath.trim();

  // 1. Empty → WD
  if (!trimmed) {
    const fallback = workingDirectory || homeDir;
    return {
      resolvedPath: normalizePath(fallback),
      originalPath: rawPath,
      resolution: "empty",
    };
  }

  const normalized = normalizePath(trimmed);

  // 2. Absolute path
  if (normalized.startsWith("/")) {
    return {
      resolvedPath: normalized,
      originalPath: rawPath,
      resolution: "absolute",
    };
  }

  // 3. Tilde path — leave for Rust to expand
  if (normalized.startsWith("~/") || normalized === "~") {
    return {
      resolvedPath: normalized,
      originalPath: rawPath,
      resolution: "tilde",
    };
  }

  // 4. Settings-category prefix
  for (const prefix of SETTINGS_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      const base = normalizePath(settingsDir);
      return {
        resolvedPath: `${base}/${normalized}`,
        originalPath: rawPath,
        resolution: "settings_prefix",
      };
    }
  }

  // 5. Relative → prepend WD
  const base = normalizePath(workingDirectory || homeDir);
  return {
    resolvedPath: `${base}/${normalized}`,
    originalPath: rawPath,
    resolution: "relative",
  };
}
