import * as React from "react";
import { FileCode, Loader2 } from "lucide-react";
import { useFileStore } from "@/stores/file-store";
import { FileSearchModal } from "./file-search-modal";
import { FileTabs } from "./file-tabs";
import { FileEditor } from "./file-editor";
import { UnsavedWarningModal } from "./unsaved-warning-modal";

export function FileViewer() {
  const {
    activeFilePath,
    openFiles,
    isLoading,
    isSearchOpen,
    setSearchOpen,
    saveActiveFile,
  } = useFileStore();

  const activeFile = openFiles.find((f) => f.path === activeFilePath);
  const hasOpenFiles = openFiles.length > 0;

  // Cmd+S to save
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveActiveFile();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveActiveFile]);

  return (
    <div className="flex h-full flex-col">
      {/* Modals */}
      <FileSearchModal open={isSearchOpen} onOpenChange={setSearchOpen} />
      <UnsavedWarningModal />

      {/* Header - always visible for consistent height */}
      {hasOpenFiles ? (
        <FileTabs />
      ) : (
        <div className="flex h-10 items-center border-b border-border px-2">
          <span className="text-sm font-medium">Workspace</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !activeFilePath || !activeFile ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <FileCode className="mx-auto h-12 w-12 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-medium">No file selected</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Select a file from the sidebar or press Ctrl+P to search
              </p>
            </div>
          </div>
        ) : (
          <FileEditor />
        )}
      </div>
    </div>
  );
}
