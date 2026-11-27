export interface TreeNavNode {
  key: string
  isFolder: boolean
  children?: TreeNavNode[]
}

export interface VisibleTreeItem {
  key: string
  isFolder: boolean
  hasChildren: boolean
  parentKey: string | null
  depth: number
}

export type TreeKeyAction =
  | { type: 'focus'; key: string }
  | { type: 'expand'; key: string }
  | { type: 'collapse'; key: string }
  | { type: 'activate'; key: string }
  | null

export function flattenVisibleTree(
  nodes: readonly TreeNavNode[],
  expandedKeys: ReadonlySet<string>,
  parentKey: string | null = null,
  depth = 0
): VisibleTreeItem[] {
  const result: VisibleTreeItem[] = []
  for (const node of nodes) {
    const children = node.children ?? []
    result.push({
      key: node.key,
      isFolder: node.isFolder,
      hasChildren: children.length > 0,
      parentKey,
      depth
    })
    if (node.isFolder && expandedKeys.has(node.key) && children.length > 0) {
      result.push(...flattenVisibleTree(children, expandedKeys, node.key, depth + 1))
    }
  }
  return result
}

export function resolveTreeKeyAction(
  key: string,
  currentKey: string,
  visibleItems: readonly VisibleTreeItem[],
  expandedKeys: ReadonlySet<string>
): TreeKeyAction {
  const index = visibleItems.findIndex((item) => item.key === currentKey)
  if (index === -1) {return null}
  const current = visibleItems[index]

  if (key === 'ArrowDown') {
    const next = visibleItems[index + 1]
    return next ? { type: 'focus', key: next.key } : null
  }
  if (key === 'ArrowUp') {
    const previous = visibleItems[index - 1]
    return previous ? { type: 'focus', key: previous.key } : null
  }
  if (key === 'Home') {
    const first = visibleItems[0]
    return first && first.key !== currentKey ? { type: 'focus', key: first.key } : null
  }
  if (key === 'End') {
    const last = visibleItems[visibleItems.length - 1]
    return last && last.key !== currentKey ? { type: 'focus', key: last.key } : null
  }
  if (key === 'ArrowRight') {
    if (!current.isFolder) {return null}
    if (!expandedKeys.has(current.key)) {return { type: 'expand', key: current.key }}
    const firstChild = visibleItems[index + 1]
    if (firstChild && firstChild.parentKey === current.key) {
      return { type: 'focus', key: firstChild.key }
    }
    return null
  }
  if (key === 'ArrowLeft') {
    if (current.isFolder && expandedKeys.has(current.key)) {
      return { type: 'collapse', key: current.key }
    }
    if (current.parentKey) {
      return { type: 'focus', key: current.parentKey }
    }
    return null
  }
  if (key === 'Enter' || key === ' ') {
    return { type: 'activate', key: current.key }
  }
  return null
}
