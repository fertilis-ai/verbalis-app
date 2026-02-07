interface TreeNode {
  type: string;
  id: string;
  isPinned?: boolean;
  children?: TreeNode[];
}

export function splitByPinned<T extends TreeNode>(tree: T[]) {
  const pinned = tree.filter((n) => n.type === "folder" && n.isPinned) as T[];
  const unpinned = tree.filter((n) => !(n.type === "folder" && n.isPinned)) as T[];
  return { pinned, unpinned };
}

export function collectTreeIds(nodes: TreeNode[], type: string): Set<string> {
  const ids = new Set<string>();
  const walk = (items: TreeNode[]) => {
    for (const node of items) {
      if (node.type === type) {
        ids.add(node.id);
      } else if (node.children) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}
