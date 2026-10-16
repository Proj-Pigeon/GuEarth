import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AnnotationDocument, AnnotationEntry } from '../../../preload'
import { referencedShapeIds } from '@renderer/lib/annotationReferences'
import { useFailureStore } from './failure'

export type ShapeKind = 'point' | 'polyline' | 'polygon' | 'arrow' | 'text'
export type DrawTool = 'point' | 'line' | 'polygon' | 'arrow' | 'text' | 'timezone'
export type DrawFontFamily = string

export const DEFAULT_DRAW_STYLE = {
  color: '#1677ff',
  textColor: '#1f1f1f',
  fontFamily: 'Arial' as DrawFontFamily,
  fontSize: 13,
  textFrame: false,
  lineWidth: 3
}

export interface GeoPosition {
  longitude: number
  latitude: number
  height: number
}

export interface DrawnShape extends Omit<import('../../../preload').StoredShape, 'kind' | 'positions'> {
  kind: ShapeKind
  positions: GeoPosition[]
}

function apiAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.guEarth?.annotations)
}

function findEntry(entries: AnnotationEntry[], id: string): AnnotationEntry | undefined {
  for (const entry of entries) {
    if (entry.id === id) return entry
    if (entry.type === 'folder') {
      const found = findEntry(entry.children, id)
      if (found) return found
    }
  }
  return undefined
}

function findParent(entries: AnnotationEntry[], id: string): AnnotationEntry[] | undefined {
  if (entries.some((entry) => entry.id === id)) return entries
  for (const entry of entries) {
    if (entry.type === 'folder') {
      const found = findParent(entry.children, id)
      if (found) return found
    }
  }
  return undefined
}

function folderDepth(entries: AnnotationEntry[], id: string, depth = 1): number {
  for (const entry of entries) {
    if (entry.id === id) return depth
    if (entry.type === 'folder') {
      const found = folderDepth(entry.children, id, depth + 1)
      if (found) return found
    }
  }
  return 0
}

function subtreeDepth(entry: AnnotationEntry): number {
  return entry.type === 'shape' ? 0 : 1 + Math.max(0, ...entry.children.map(subtreeDepth))
}

function containsEntry(entry: AnnotationEntry, id: string): boolean {
  return entry.id === id || (entry.type === 'folder' && entry.children.some((child) => containsEntry(child, id)))
}

export const useDrawingStore = defineStore('drawing', () => {
  const failureStore = useFailureStore()
  const shapes = ref<DrawnShape[]>([])
  const entries = ref<AnnotationEntry[]>([])
  const activeTool = ref<DrawTool | null>(null)
  const selectedShapeId = ref<string | null>(null)
  const saveError = ref('')
  let pendingSave = Promise.resolve()
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  function referencedShapeIds(items: AnnotationEntry[]): Set<string> {
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

  function persist(): void {
    if (!apiAvailable()) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      const persistedIds = referencedShapeIds(entries.value)
      const snapshot: AnnotationDocument = {
        shapes: JSON.parse(JSON.stringify(shapes.value.filter((shape) => persistedIds.has(shape.id)))) as DrawnShape[],
        entries: JSON.parse(JSON.stringify(entries.value)) as AnnotationEntry[]
      }
      pendingSave = pendingSave.catch(() => undefined).then(async () => {
        await window.guEarth.annotations.save(snapshot)
        saveError.value = ''
      }).catch(() => {
        saveError.value = '标注保存失败，请重试'
      })
    }, 120)
  }

  async function load(): Promise<void> {
    if (!apiAvailable()) return
    try {
      const document = await window.guEarth.annotations.load()
      shapes.value = document.shapes
      entries.value = document.entries
      failureStore.clearFailure('annotations')
    } catch {
      failureStore.reportFailure({ scope: 'annotations', message: '标注读取失败，暂时无法显示已保存的标注', retryable: true })
    }
  }

  function setActiveTool(tool: DrawTool | null): void {
    activeTool.value = tool
  }

  function setSelectedShapeId(id: string | null): void {
    selectedShapeId.value = id
  }

  function addShape(shape: DrawnShape): void {
    shapes.value = [...shapes.value, shape]
    entries.value = [...entries.value, { type: 'shape', id: shape.id }]
    persist()
  }

  function addTransientShape(shape: DrawnShape): void {
    shapes.value = [...shapes.value, shape]
  }

  function updateShape(id: string, changes: Partial<Pick<DrawnShape, 'annotation' | 'color' | 'textColor' | 'fontFamily' | 'fontSize' | 'textFrame' | 'lineWidth'>>): void {
    const shape = shapes.value.find((item) => item.id === id)
    if (!shape) return
    Object.assign(shape, changes)
    persist()
  }

  function removeShape(id: string): void {
    if (!shapes.value.some((item) => item.id === id)) return
    shapes.value = shapes.value.filter((item) => item.id !== id)
    const siblings = findParent(entries.value, id)
    if (siblings) siblings.splice(siblings.findIndex((item) => item.id === id), 1)
    entries.value = [...entries.value]
    if (selectedShapeId.value === id) selectedShapeId.value = null
    persist()
  }

  function clearAll(): void {
    shapes.value = []
    entries.value = []
    selectedShapeId.value = null
    persist()
  }

  function addFolder(name: string, parentId: string | null): string | null {
    const trimmed = name.trim().slice(0, 80)
    if (!trimmed) return null
    const parent = parentId ? findEntry(entries.value, parentId) : undefined
    if (parentId && (!parent || parent.type !== 'folder' || folderDepth(entries.value, parentId) >= 5)) return null
    const id = crypto.randomUUID()
    const children = parent?.type === 'folder' ? parent.children : entries.value
    children.push({ type: 'folder', id, name: trimmed, children: [] })
    entries.value = [...entries.value]
    persist()
    return id
  }

  function renameFolder(id: string, name: string): boolean {
    const entry = findEntry(entries.value, id)
    const trimmed = name.trim().slice(0, 80)
    if (!entry || entry.type !== 'folder' || !trimmed) return false
    entry.name = trimmed
    entries.value = [...entries.value]
    persist()
    return true
  }

  function removeFolder(id: string): void {
    const siblings = findParent(entries.value, id)
    if (!siblings) return
    const index = siblings.findIndex((entry) => entry.id === id)
    const folder = siblings[index]
    if (folder.type !== 'folder') return
    siblings.splice(index, 1, ...folder.children)
    entries.value = [...entries.value]
    persist()
  }

  function moveEntry(id: string, targetId: string | null, placement: 'inside' | 'before' | 'after'): boolean {
    const source = findEntry(entries.value, id)
    if (!source || (targetId && containsEntry(source, targetId))) return false
    const target = targetId ? findEntry(entries.value, targetId) : undefined
    if (targetId && !target) return false
    if (placement === 'inside' && targetId && target?.type !== 'folder') return false
    const destinationDepth = !targetId ? 0 : placement === 'inside'
      ? folderDepth(entries.value, targetId)
      : folderDepth(entries.value, targetId) - 1
    if (destinationDepth + subtreeDepth(source) > 5) return false
    const from = findParent(entries.value, id)
    if (!from) return false
    from.splice(from.findIndex((entry) => entry.id === id), 1)
    const to = !targetId ? entries.value : placement === 'inside' && target?.type === 'folder'
      ? target.children : findParent(entries.value, targetId)
    if (!to) return false
    const targetIndex = targetId && placement !== 'inside' ? to.findIndex((entry) => entry.id === targetId) : to.length
    to.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, source)
    entries.value = [...entries.value]
    persist()
    return true
  }

  failureStore.registerRetry('annotations', load)

  return { shapes, entries, activeTool, selectedShapeId, saveError, load, setActiveTool, setSelectedShapeId, addShape, addTransientShape, updateShape, removeShape, clearAll, addFolder, renameFolder, removeFolder, moveEntry }
})
