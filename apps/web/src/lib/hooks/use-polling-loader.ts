import * as React from "react";

interface UsePollingLoaderOptions {
  /** Also call `loadFn` on mount, not just on each tick. Defaults to true. */
  immediate?: boolean;
}

export function usePollingLoader(
  loadFn: () => void,
  intervalMs = 5000,
  { immediate = true }: UsePollingLoaderOptions = {}
) {
  React.useEffect(() => {
    if (immediate) loadFn();

    const interval = setInterval(() => {
      loadFn();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [loadFn, intervalMs, immediate]);
}
