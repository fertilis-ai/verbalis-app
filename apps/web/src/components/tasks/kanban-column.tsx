import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
  title: string;
  count: number;
  children: React.ReactNode;
  className?: string;
  loading?: boolean;
}

export function KanbanColumn({ title, count, children, className, loading }: KanbanColumnProps) {
  return (
    <div
      className={cn(
        "flex h-full w-72 flex-shrink-0 flex-col rounded-lg border border-border bg-muted/30",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-medium">{title}</h3>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-auto p-2">
        {children}
      </div>
    </div>
  );
}
