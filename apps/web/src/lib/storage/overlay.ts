import { listFiles } from "./fs";

// ---------------------------------------------------------------------------
// Settings-directory overlay
//
// The user's Settings Directory mirrors the Toolbox layout
// (<settingsDir>/<category>/*.<ext>) as a second, read-mostly source for
// every category (agents included). The canonical app-data store always wins
// on name clashes; writes go to the canonical store (shadowing an overlay
// file), and deletes remove both copies so an item doesn't resurrect from
// the overlay.
// ---------------------------------------------------------------------------

let settingsStorePromise: Promise<typeof import("@/stores/settings-store")> | null = null;

/** The configured settings directory, or null when unset. Imported lazily so
 * this low-level module doesn't statically depend on a zustand store. */
export async function getSettingsOverlayDir(): Promise<string | null> {
  try {
    if (!settingsStorePromise) {
      settingsStorePromise = import("@/stores/settings-store");
    }
    const { useSettingsStore } = await settingsStorePromise;
    const dir = useSettingsStore.getState().settingsDirectory?.trim();
    return dir || null;
  } catch {
    return null;
  }
}

/** List overlay files, tolerating a missing directory. */
export async function listOverlayFiles(dir: string, ext: string): Promise<string[]> {
  try {
    return await listFiles(dir, ext);
  } catch {
    return [];
  }
}
