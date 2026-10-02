import * as React from "react";
import { highlightCode, escapeHtml } from "@/lib/highlighter";
import { cn } from "@/lib/utils";

interface CodeOverlayEditorProps {
  content: string;
  language: string;
  onChange: (value: string) => void;
  /** Runs before the built-in Tab handling. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
}

/**
 * A transparent <textarea> layered over a Shiki HTML overlay, with a line-number
 * gutter. The overlay is normally the only visible text layer, so the textarea
 * goes transparent only once the overlay has content, and a highlighting failure
 * falls back to escaped plaintext rather than leaving just the line numbers.
 */
export function CodeOverlayEditor({
  content,
  language,
  onChange,
  onKeyDown,
  className,
}: CodeOverlayEditorProps) {
  const lineNumbersRef = React.useRef<HTMLDivElement>(null);
  const highlightRef = React.useRef<HTMLDivElement>(null);

  const [highlightedHtml, setHighlightedHtml] = React.useState("");

  const lineCount = content.split("\n").length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  // Update syntax highlighting when content or language changes
  React.useEffect(() => {
    let cancelled = false;

    const plain = `<pre><code>${escapeHtml(content)}</code></pre>`;

    highlightCode(content, language)
      .then((html) => {
        if (cancelled) return;
        setHighlightedHtml(html ?? plain);
      })
      .catch((error: unknown) => {
        // The overlay is the only visible text layer, so a swallowed failure
        // would leave the editor showing nothing but line numbers.
        console.warn("[code-overlay-editor] Syntax highlighting failed:", error);
        if (cancelled) return;
        setHighlightedHtml(plain);
      });

    return () => {
      cancelled = true;
    };
  }, [content, language]);

  // Sync scroll between textarea, line numbers, and highlight overlay
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const scrollLeft = e.currentTarget.scrollLeft;

    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
    if (highlightRef.current) {
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    // Tab key inserts 2 spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      onChange(`${content.substring(0, start)}  ${content.substring(end)}`);

      // Restore cursor position after state update
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className={className}>
      {/* Line numbers */}
      <div
        ref={lineNumbersRef}
        className="flex-shrink-0 select-none overflow-hidden bg-muted/30 text-muted-foreground text-right pr-2 pl-2 py-4"
        style={{ minWidth: `${String(lineCount).length + 2}ch` }}
      >
        {lineNumbers.map((num) => (
          <div key={num} className="leading-5">
            {num}
          </div>
        ))}
      </div>

      {/* Editor area with overlay */}
      <div className="relative flex-1 overflow-hidden">
        {/* Syntax highlighted overlay */}
        <div
          ref={highlightRef}
          className="absolute inset-0 overflow-hidden pointer-events-none p-4 [&_pre]:!bg-transparent [&_pre]:m-0 [&_pre]:p-0 [&_span]:!bg-transparent [&_code]:leading-5 [&_code]:whitespace-pre"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />

        {/* Transparent textarea for input */}
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          wrap="off"
          className={cn(
            // `leading-5` must stay after `text-sm`: tailwind-merge drops a
            // preceding `leading-*` because text-size utilities also set
            // line-height, and the overlay depends on the two matching.
            "relative z-10 h-full w-full resize-none bg-transparent p-4 focus:outline-none caret-foreground selection:bg-primary/30 font-mono text-sm leading-5 overflow-x-auto",
            // Only hide the textarea's own text once the overlay actually has
            // something to show in its place.
            highlightedHtml ? "text-transparent" : "text-foreground",
          )}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>
    </div>
  );
}
