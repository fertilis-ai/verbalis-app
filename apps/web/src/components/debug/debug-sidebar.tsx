import * as React from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebugStore } from "@/stores/debug-store";

export function DebugSidebar() {
  const { logFiles, selectedFile, loadLogFiles, selectFile } = useDebugStore();

  React.useEffect(() => {
    loadLogFiles();
  }, [loadLogFiles]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 items-center border-b border-border px-2">
        <span className="text-sm font-medium">Debug</span>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-auto py-1">
        {logFiles.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">No log files</p>
        ) : (
          logFiles.map((file) => (
            <button
              key={file}
              onClick={() => selectFile(file)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent",
                selectedFile === file && "bg-sidebar-accent text-sidebar-accent-foreground"
              )}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{file}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
