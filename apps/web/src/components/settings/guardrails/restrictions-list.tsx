import * as React from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RestrictionsListProps {
  title: string;
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
}

/** A collapsible allow/block list of patterns. */
export function RestrictionsList({
  title,
  items,
  placeholder,
  onChange,
}: RestrictionsListProps) {
  const [newItem, setNewItem] = React.useState("");
  const [isExpanded, setIsExpanded] = React.useState(false);

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
      setNewItem("");
    }
  };

  const handleRemove = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    onChange(newItems);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="font-medium text-sm">{title}</span>
        <span className="text-xs text-muted-foreground">
          ({items.length} items)
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Existing items */}
          {items.length > 0 && (
            <div className="space-y-1">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1"
                >
                  <code className="flex-1 text-xs">{item}</code>
                  <button
                    onClick={() => handleRemove(index)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new item */}
          <div className="flex gap-2">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder={placeholder}
              className="text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
            <Button size="sm" variant="outline" onClick={handleAdd}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
