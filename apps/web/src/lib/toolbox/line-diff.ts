/**
 * Minimal line diff for Toolbox write/edit confirmations — shows the user the
 * *change* they are approving instead of a full content blob. Deliberately
 * naive (common prefix/suffix trim, everything between is removed/added):
 * confirmations compare one edit at a time, where this reads the same as a
 * real LCS diff without the dependency.
 */

export interface DiffLine {
  type: "context" | "removed" | "added";
  text: string;
}

/** Context lines kept on each side of the changed block. */
const CONTEXT_LINES = 2;

/**
 * Diff two texts line-wise. Returns [] when they are identical. Context is
 * trimmed to a few lines around the change; elided runs become a "⋯" line.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  if (oldText === newText) return [];

  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Common prefix
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
    start++;
  }

  // Common suffix (not overlapping the prefix)
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  const lines: DiffLine[] = [];

  // Leading context (elide the rest)
  const headStart = Math.max(0, start - CONTEXT_LINES);
  if (headStart > 0) lines.push({ type: "context", text: "⋯" });
  for (let i = headStart; i < start; i++) {
    lines.push({ type: "context", text: oldLines[i] });
  }

  for (let i = start; i < oldEnd; i++) lines.push({ type: "removed", text: oldLines[i] });
  for (let i = start; i < newEnd; i++) lines.push({ type: "added", text: newLines[i] });

  // Trailing context (elide the rest)
  const tailEnd = Math.min(oldLines.length, oldEnd + CONTEXT_LINES);
  for (let i = oldEnd; i < tailEnd; i++) {
    lines.push({ type: "context", text: oldLines[i] });
  }
  if (tailEnd < oldLines.length) lines.push({ type: "context", text: "⋯" });

  return lines;
}
