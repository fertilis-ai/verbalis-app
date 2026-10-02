import * as React from "react";
import { computeLineDiff, type DiffLine } from "@/lib/toolbox/line-diff";
import type { ToolCallState } from "@/lib/types/chat";

export interface KeyedDiffLine extends DiffLine {
  key: string;
}

/** Stable, content-based React keys (repeated lines get an occurrence suffix). */
function keyDiffLines(lines: DiffLine[]): KeyedDiffLine[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = `${line.type}:${line.text}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...line, key: `${base}#${n}` };
  });
}

/**
 * Before/after preview for Toolbox write/edit confirmations, so the user
 * approves a *change* rather than a content blob. For edits the diff comes
 * straight from the arguments; for overwrites the current content is loaded
 * to diff against (a brand-new item renders no diff — the arguments pane
 * already shows its full content).
 */
export function useToolboxDiff(toolCall: ToolCallState, active: boolean): KeyedDiffLine[] | null {
  const [diff, setDiff] = React.useState<KeyedDiffLine[] | null>(null);

  React.useEffect(() => {
    if (!active) {
      setDiff(null);
      return;
    }
    const { category, name, content, old_string, new_string } = toolCall.arguments as Record<
      string,
      unknown
    >;

    if (toolCall.name === "edit_toolbox_item") {
      if (typeof old_string === "string" && typeof new_string === "string") {
        setDiff(keyDiffLines(computeLineDiff(old_string, new_string)));
      }
      return;
    }

    // write_toolbox_item: diff against the existing item, if any.
    if (typeof category !== "string" || typeof name !== "string" || typeof content !== "string") {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { loadToolboxItem } = await import("@/lib/storage");
        const existing = await loadToolboxItem(
          category as Parameters<typeof loadToolboxItem>[0],
          name
        );
        if (!cancelled && existing) {
          setDiff(keyDiffLines(computeLineDiff(existing.content, content)));
        }
      } catch {
        // No preview on load failure; the arguments pane still shows content.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, toolCall.name, toolCall.arguments]);

  return diff && diff.length > 0 ? diff : null;
}
