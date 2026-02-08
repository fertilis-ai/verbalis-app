import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToolboxStore, itemKey } from "@/stores/toolbox-store";

export function ToolboxTabs() {
  const { openItems, activeItemKey, setActiveItem, closeItem } = useToolboxStore();

  if (openItems.length === 0) {
    return null;
  }

  return (
    <div className="flex h-10 items-center border-b border-border bg-sidebar overflow-x-auto scrollbar-hidden">
      {openItems.map((item) => {
        const key = itemKey(item.category, item.name);
        return (
          <ToolboxTab
            key={key}
            name={item.name}
            isModified={item.isModified}
            isActive={key === activeItemKey}
            onSelect={() => setActiveItem(item.category, item.name)}
            onClose={() => closeItem(item.category, item.name)}
          />
        );
      })}
    </div>
  );
}

interface ToolboxTabProps {
  name: string;
  isModified: boolean;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

function ToolboxTab({ name, isModified, isActive, onSelect, onClose }: ToolboxTabProps) {
  const [isCloseHovered, setIsCloseHovered] = React.useState(false);

  return (
    <div
      className={cn(
        "group flex h-10 items-center gap-2 px-3 p-2 border-r border-border cursor-pointer text-sm min-w-0",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/50"
      )}
      onClick={onSelect}
    >
      <span className="truncate max-w-[120px]" title={name}>
        {name}
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
