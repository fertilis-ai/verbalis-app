import * as React from "react";
import { useFileStore } from "@/stores/file-store";
import { createHighlighter, type Highlighter } from "shiki";

export function FileEditor() {
  const { activeFilePath, openFiles, updateFileContent } = useFileStore();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = React.useRef<HTMLDivElement>(null);
  const highlightRef = React.useRef<HTMLDivElement>(null);

  const [highlighter, setHighlighter] = React.useState<Highlighter | null>(null);
  const [highlightedHtml, setHighlightedHtml] = React.useState("");

  const activeFile = openFiles.find((f) => f.path === activeFilePath);
  const content = activeFile?.currentContent ?? "";

  const lineCount = content.split("\n").length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  // Initialize Shiki highlighter
  React.useEffect(() => {
    let mounted = true;

    async function initHighlighter() {
      const h = await createHighlighter({
        themes: ["github-dark", "github-light"],
        langs: [
          "typescript", "tsx", "javascript", "jsx",
          "python", "rust", "go", "markdown",
          "json", "yaml", "toml", "css", "html", "bash",
        ],
      });
      if (mounted) {
        setHighlighter(h);
      }
    }

    initHighlighter();

    return () => {
      mounted = false;
    };
  }, []);

  // Update syntax highlighting when content, language, or highlighter changes
  React.useEffect(() => {
    if (!highlighter || !activeFile) {
      setHighlightedHtml("");
      return;
    }

    const lang = activeFile.language;
    if (lang === "plaintext") {
      setHighlightedHtml(`<pre><code>${escapeHtml(content)}</code></pre>`);
      return;
    }

    try {
      const html = highlighter.codeToHtml(content, {
        lang,
        themes: {
          dark: "github-dark",
          light: "github-light",
        },
      });
      setHighlightedHtml(html);
    } catch {
      setHighlightedHtml(`<pre><code>${escapeHtml(content)}</code></pre>`);
    }
  }, [content, highlighter, activeFile]);

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

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (activeFilePath) {
      updateFileContent(activeFilePath, e.target.value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab key inserts 2 spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const newValue =
        content.substring(0, start) + "  " + content.substring(end);

      if (activeFilePath) {
        updateFileContent(activeFilePath, newValue);
      }

      // Restore cursor position after state update
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  };

  if (!activeFilePath || !activeFile) {
    return null;
  }

  return (
    <div className="flex h-full font-mono text-sm">
      {/* Line numbers */}
      <div
        ref={lineNumbersRef}
        className="flex-shrink-0 select-none overflow-hidden bg-muted/30 text-muted-foreground text-right pr-2 pl-2 py-4"
        style={{ minWidth: `${String(lineCount).length + 2}ch` }}
      >
        {lineNumbers.map((num) => (
          <div key={num} className="leading-6">
            {num}
          </div>
        ))}
      </div>

      {/* Editor area with overlay */}
      <div className="relative flex-1 overflow-hidden">
        {/* Syntax highlighted overlay */}
        <div
          ref={highlightRef}
          className="absolute inset-0 overflow-hidden pointer-events-none p-4 [&_pre]:!bg-transparent [&_pre]:m-0 [&_pre]:p-0 [&_span]:!bg-transparent [&_code]:leading-6 [&_code]:whitespace-pre"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />

        {/* Transparent textarea for input */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          wrap="off"
          className="relative z-10 h-full w-full resize-none bg-transparent p-4 focus:outline-none leading-6 caret-foreground text-transparent selection:bg-primary/30 font-mono text-sm overflow-x-auto"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
