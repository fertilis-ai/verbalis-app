import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";

export function FileTabs() {
  const { openFiles, activeFilePath, setActiveFile, closeFile } = useFileStore();

  if (openFiles.length === 0) {
    return null;
  }

  return (
    <div className="flex h-10 items-center border-b border-border bg-muted/30 overflow-x-auto">
      {openFiles.map((file) => (
        <FileTab
          key={file.path}
          path={file.path}
          isModified={file.isModified}
          isActive={file.path === activeFilePath}
          onSelect={() => setActiveFile(file.path)}
          onClose={() => closeFile(file.path)}
        />
      ))}
    </div>
  );
}

interface FileTabProps {
  path: string;
  isModified: boolean;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

function FileTab({ path, isModified, isActive, onSelect, onClose }: FileTabProps) {
  const [isCloseHovered, setIsCloseHovered] = React.useState(false);
  const fileName = path.split("/").pop() ?? path;

  return (
    <div
      className={cn(
        "group flex h-10 items-center gap-2 px-3 p-2 border-r border-border cursor-pointer text-sm min-w-0",
        isActive
          ? "bg-background text-foreground"
          : "text-muted-foreground hover:bg-muted/50"
      )}
      onClick={onSelect}
    >
      <span className="truncate max-w-[120px]" title={path}>
        {fileName}
      </span>
      <button
        className={cn(
          "p-0.5 rounded-sm hover:bg-muted flex-shrink-0 w-5 h-5 flex items-center justify-center",
          !isActive && !isModified && "opacity-0 group-hover:opacity-100"
        )}
        onMouseEnter={() => setIsCloseHovered(true)}
        onMouseLeave={() => setIsCloseHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="Close"
      >
        {isModified && !isCloseHovered ? (
          <span className="w-2 h-2 rounded-full bg-foreground flex-shrink-0" />
        ) : (
          <X className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
