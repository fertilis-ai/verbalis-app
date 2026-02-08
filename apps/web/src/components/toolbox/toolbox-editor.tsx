import * as React from "react";
import { Wrench } from "lucide-react";
import { useToolboxStore, itemKey, type ToolboxCategory } from "@/stores/toolbox-store";
import { ToolboxTabs } from "./toolbox-tabs";
import { createHighlighter, type Highlighter } from "shiki";

// Map category to language for syntax highlighting
function getLanguage(category: ToolboxCategory): string {
  switch (category) {
    case "prompts":
      return "yaml";
    case "memories":
      return "markdown";
    case "agents":
      return "markdown";
    case "skills":
      return "markdown";
    case "workflows":
      return "yaml";
    default:
      return "text";
  }
}

export function ToolboxEditor() {
  const { openItems, activeItemKey, updateItem, updateOpenItemContent, markOpenItemSaved } =
    useToolboxStore();
  const [highlightedHtml, setHighlightedHtml] = React.useState("");
  const [highlighter, setHighlighter] = React.useState<Highlighter | null>(null);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = React.useRef<HTMLDivElement>(null);
  const highlightRef = React.useRef<HTMLDivElement>(null);

  const activeItem = openItems.find(
    (i) => itemKey(i.category, i.name) === activeItemKey
  );
  const hasOpenItems = openItems.length > 0;

  // Initialize Shiki highlighter
  React.useEffect(() => {
    let mounted = true;

    async function initHighlighter() {
      const h = await createHighlighter({
        themes: ["github-dark", "github-light"],
        langs: ["yaml", "markdown", "json"],
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

  // Update syntax highlighting when content or highlighter changes
  React.useEffect(() => {
    if (!highlighter || !activeItem) {
      setHighlightedHtml("");
      return;
    }

    const lang = getLanguage(activeItem.category);
    try {
      const html = highlighter.codeToHtml(activeItem.currentContent, {
        lang,
        themes: {
          dark: "github-dark",
          light: "github-light",
        },
      });
      setHighlightedHtml(html);
    } catch {
      // Fallback if highlighting fails
      setHighlightedHtml(`<pre><code>${escapeHtml(activeItem.currentContent)}</code></pre>`);
    }
  }, [activeItem?.currentContent, activeItem?.category, highlighter]);

  const handleSave = async () => {
    if (activeItem) {
      await updateItem(activeItem.category, activeItem.name, activeItem.currentContent);
      markOpenItemSaved(activeItem.category, activeItem.name, activeItem.currentContent);
    }
  };

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

  const content = activeItem?.currentContent ?? "";
  const lineCount = content.split("\n").length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      {hasOpenItems ? (
        <ToolboxTabs />
      ) : (
        <div className="flex h-10 items-center border-b border-border px-2 bg-sidebar">
          <span className="text-sm font-medium">Toolbox</span>
        </div>
      )}

      {!activeItem ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Wrench className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-medium">No item selected</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Select an item from the sidebar to edit
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden font-mono text-sm">
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
              onChange={(e) => {
                if (activeItem) {
                  updateOpenItemContent(activeItem.category, activeItem.name, e.target.value);
                }
              }}
              onScroll={handleScroll}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                  e.preventDefault();
                  handleSave();
                }
                // Tab key inserts 2 spaces
                if (e.key === "Tab") {
                  e.preventDefault();
                  const textarea = e.currentTarget;
                  const start = textarea.selectionStart;
                  const end = textarea.selectionEnd;
                  const newValue =
                    content.substring(0, start) + "  " + content.substring(end);
                  if (activeItem) {
                    updateOpenItemContent(activeItem.category, activeItem.name, newValue);
                  }
                  requestAnimationFrame(() => {
                    textarea.selectionStart = textarea.selectionEnd = start + 2;
                  });
                }
              }}
              wrap="off"
              className="relative z-10 h-full w-full resize-none bg-transparent p-4 focus:outline-none leading-6 caret-foreground text-transparent selection:bg-primary/30 font-mono text-sm overflow-x-auto"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        </div>
      )}
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
