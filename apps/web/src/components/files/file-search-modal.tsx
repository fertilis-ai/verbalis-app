import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Search, File } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useFileStore, type FileNode } from "@/stores/file-store";

interface FileSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FileSearchModal({ open, onOpenChange }: FileSearchModalProps) {
  const { tree, selectFile, searchQuery, setSearchQuery } = useFileStore();
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const flatFiles = React.useMemo(() => {
    const files: FileNode[] = [];
    const flatten = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (!node.isDirectory) {
          files.push(node);
        }
        if (node.children) {
          flatten(node.children);
        }
      }
    };
    flatten(tree);
    return files;
  }, [tree]);

  const filteredFiles = React.useMemo(() => {
    if (!searchQuery) return flatFiles.slice(0, 20);
    const query = searchQuery.toLowerCase();
    return flatFiles
      .filter((f) => f.name.toLowerCase().includes(query) || f.path.toLowerCase().includes(query))
      .slice(0, 20);
  }, [flatFiles, searchQuery]);

  React.useEffect(() => {
    if (open) {
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filteredFiles.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = filteredFiles[selectedIndex];
      if (selected) {
        selectFile(selected.path);
        onOpenChange(false);
        setSearchQuery("");
      }
    } else if (e.key === "Escape") {
      onOpenChange(false);
      setSearchQuery("");
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/4 z-50 w-full max-w-lg -translate-x-1/2 rounded-lg border border-border bg-popover shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search files..."
              className="border-0 bg-transparent focus-visible:ring-0"
            />
          </div>
          <div className="max-h-80 overflow-auto p-2">
            {filteredFiles.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No files found
              </p>
            ) : (
              filteredFiles.map((file, index) => (
                <div
                  key={file.path}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                    index === selectedIndex && "bg-muted"
                  )}
                  onClick={() => {
                    selectFile(file.path);
                    onOpenChange(false);
                    setSearchQuery("");
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <File className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate">{file.name}</span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {file.path}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
