import type { AnnotationEntry } from '../../../preload'

export function referencedShapeIds(items: AnnotationEntry[]): Set<string> {
  const ids = new Set<string>()
  const walk = (list: AnnotationEntry[]): void => {
    for (const entry of list) {
      if (entry.type === 'shape') ids.add(entry.id)
      else walk(entry.children)
    }
  }
  walk(items)
  return ids
}
