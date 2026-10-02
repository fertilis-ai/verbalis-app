import type * as React from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const SETTINGS_SELECT_CLASS =
  "w-full rounded-md border border-input bg-transparent dark:bg-input/30 h-8 px-2.5 py-1 text-sm text-foreground";

interface ModelDiscoveryHeaderProps {
  label: string;
  onRefresh: () => void;
  isFetching: boolean;
  error: string | null | undefined;
  canFetch: boolean;
  /** Spell out why Refresh is disabled outside the desktop app. */
  showDesktopHint?: boolean;
}

/** A label with a Refresh button, its spinner, and the last fetch error. */
export function ModelDiscoveryHeader({
  label,
  onRefresh,
  isFetching,
  error,
  canFetch,
  showDesktopHint = false,
}: ModelDiscoveryHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium">{label}</label>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onRefresh()}
        disabled={!canFetch || isFetching}
        title={!canFetch ? "Model fetching requires the desktop app" : undefined}
        className="gap-2 h-6 text-xs"
      >
        {isFetching ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
        Refresh
      </Button>
      {showDesktopHint && !canFetch && (
        <span className="text-xs text-muted-foreground">Desktop app required</span>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

interface DiscoverableModelSelectProps
  extends Omit<ModelDiscoveryHeaderProps, "showDesktopHint"> {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string }>;
  /** Shown under the select until the first successful fetch. */
  emptyHint: string;
  /** Shown under the select once models have been fetched. */
  hint: string;
  hasFetched: boolean;
  /** Extra controls between the select and the hint (e.g. a voice picker). */
  children?: React.ReactNode;
}

/** A model select whose options come from a provider's discovery endpoint. */
export function DiscoverableModelSelect({
  value,
  onChange,
  options,
  emptyHint,
  hint,
  hasFetched,
  children,
  ...header
}: DiscoverableModelSelectProps) {
  return (
    <div>
      <ModelDiscoveryHeader {...header} />
      <div className="mt-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={SETTINGS_SELECT_CLASS}
        >
          <option value="">None (disabled)</option>
          {options.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </div>
      {children}
      <p className="mt-2 text-xs text-muted-foreground">{hasFetched ? hint : emptyHint}</p>
    </div>
  );
}
