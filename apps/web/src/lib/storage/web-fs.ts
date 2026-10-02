import { dirname } from "@/lib/path-resolution";

// LocalStorage-based fallback for web browser (non-Tauri)

const STORAGE_PREFIX = "verbalis:";

// Virtual file system stored in localStorage
// Structure: { [path: string]: { isDir: boolean, content?: string } }
function getVirtualFS(): Record<string, { isDir: boolean; content?: string }> {
  const stored = localStorage.getItem(`${STORAGE_PREFIX}vfs`);
  return stored ? JSON.parse(stored) : {};
}

function setVirtualFS(vfs: Record<string, { isDir: boolean; content?: string }>): void {
  localStorage.setItem(`${STORAGE_PREFIX}vfs`, JSON.stringify(vfs));
}

export function webCreateDirectory(path: string): void {
  const vfs = getVirtualFS();
  // Create all parent directories
  const parts = path.split("/").filter(Boolean);
  let currentPath = "";
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
    if (!vfs[currentPath]) {
      vfs[currentPath] = { isDir: true };
    }
  }
  setVirtualFS(vfs);
}

export function webWriteFile(path: string, content: string): void {
  const vfs = getVirtualFS();
  // Ensure parent directory exists
  const parentPath = dirname(path);
  if (parentPath && !vfs[parentPath]) {
    webCreateDirectory(parentPath);
  }
  const updatedVfs = getVirtualFS(); // Re-read after creating dirs
  updatedVfs[path] = { isDir: false, content };
  setVirtualFS(updatedVfs);
}

export function webReadFile(path: string): string {
  const vfs = getVirtualFS();
  const entry = vfs[path];
  if (!entry || entry.isDir) {
    throw new Error(`File not found: ${path}`);
  }
  return entry.content ?? "";
}

export function webPathExists(path: string): boolean {
  const vfs = getVirtualFS();
  return !!vfs[path];
}

export function webDeletePath(path: string): void {
  const vfs = getVirtualFS();
  // Delete the path and all children (for directories)
  const keysToDelete = Object.keys(vfs).filter(
    (key) => key === path || key.startsWith(`${path}/`)
  );
  for (const key of keysToDelete) {
    delete vfs[key];
  }
  setVirtualFS(vfs);
}

export function webRenamePath(oldPath: string, newPath: string): void {
  const vfs = getVirtualFS();
  // Find all entries that start with oldPath
  const entries = Object.entries(vfs).filter(
    ([key]) => key === oldPath || key.startsWith(`${oldPath}/`)
  );

  for (const [key, value] of entries) {
    const newKey = key === oldPath ? newPath : key.replace(oldPath, newPath);
    vfs[newKey] = value;
    delete vfs[key];
  }
  setVirtualFS(vfs);
}

interface WebFileNode {
  name: string;
  path: string;
  is_directory: boolean;
}

export function webReadDirectory(dirPath: string): WebFileNode[] {
  const vfs = getVirtualFS();
  const normalizedDir = dirPath.endsWith("/") ? dirPath.slice(0, -1) : dirPath;
  const results: WebFileNode[] = [];
  const seen = new Set<string>();

  for (const [path, entry] of Object.entries(vfs)) {
    // Check if this path is a direct child of dirPath
    if (path.startsWith(`${normalizedDir}/`)) {
      const relativePath = path.substring(normalizedDir.length + 1);
      const firstSlash = relativePath.indexOf("/");
      const childName = firstSlash === -1 ? relativePath : relativePath.substring(0, firstSlash);
      const childPath = `${normalizedDir}/${childName}`;

      if (!seen.has(childPath)) {
        seen.add(childPath);
        // Determine if it's a directory by checking if the exact path entry is a dir
        // or if there are deeper paths
        const isDir = vfs[childPath]?.isDir || firstSlash !== -1;
        results.push({
          name: childName,
          path: childPath,
          is_directory: isDir,
        });
      }
    }
  }

  return results;
}

export function webListFiles(dir: string, extension?: string): string[] {
  const entries = webReadDirectory(dir);
  return entries
    .filter((e) => !e.is_directory && (!extension || e.name.endsWith(`.${extension}`)))
    .map((e) => e.name.replace(`.${extension}`, ""));
}
