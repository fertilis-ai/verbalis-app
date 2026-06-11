/** Minimal shape required for tree traversal. */
export interface TreeNode {
  id: string;
  name: string;
  type: string;
  children?: TreeNode[];
}

/** Find a node by ID in a recursive tree. */
export function findNodeInTree<T extends TreeNode>(tree: T[], id: string): T | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeInTree(node.children as T[], id);
      if (found) return found;
    }
  }
  return null;
}

/** Walk a recursive tree depth-first, collecting the defined results of `visit`. */
export function collectFromTree<T extends { children?: T[] }, R>(
  nodes: T[],
  visit: (node: T) => R | undefined
): R[] {
  const results: R[] = [];
  for (const node of nodes) {
    const value = visit(node);
    if (value !== undefined) results.push(value);
    if (node.children) {
      results.push(...collectFromTree(node.children, visit));
    }
  }
  return results;
}

/** Return `baseName` if unique, otherwise append " 2", " 3", etc. */
export function getUniqueName(baseName: string, existingNames: string[]): string {
  if (!existingNames.includes(baseName)) return baseName;
  let counter = 2;
  let candidate = `${baseName} ${counter}`;
  while (existingNames.includes(candidate)) {
    counter += 1;
    candidate = `${baseName} ${counter}`;
  }
  return candidate;
}

/** Get the names of sibling folders under a parent (or at root level). */
export function getSiblingFolderNames<T extends TreeNode>(tree: T[], parentFolderId?: string): string[] {
  if (!parentFolderId) {
    return tree
      .filter((node) => node.type === "folder")
      .map((node) => node.name);
  }
  const parent = findNodeInTree(tree, parentFolderId);
  if (parent?.type === "folder" && parent.children) {
    return parent.children
      .filter((node) => node.type === "folder")
      .map((node) => node.name);
  }
  return [];
}
