import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { AnnotationDocument, AnnotationEntry } from '../../../preload'
import { referencedShapeIds } from '@renderer/lib/annotationReferences'
import { logger } from '../../../common/logger'
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

export interface DrawingState {
  shapes: DrawnShape[]
  entries: AnnotationEntry[]
  activeTool: DrawTool | null
  selectedShapeId: string | null
  saveError: string
}

export interface DrawingActions {
  load: () => Promise<void>
  setActiveTool: (tool: DrawTool | null) => void
  setSelectedShapeId: (id: string | null) => void
  addShape: (shape: DrawnShape) => void
  addTransientShape: (shape: DrawnShape) => void
  updateShape: (
    id: string,
    changes: Partial<Pick<DrawnShape, 'annotation' | 'color' | 'textColor' | 'fontFamily' | 'fontSize' | 'textFrame' | 'lineWidth'>>
  ) => void
  removeShape: (id: string) => void
  clearAll: () => void
  addFolder: (name: string, parentId: string | null) => string | null
  renameFolder: (id: string, name: string) => boolean
  removeFolder: (id: string) => void
  moveEntry: (id: string, targetId: string | null, placement: 'inside' | 'before' | 'after') => boolean
}

export type DrawingStore = DrawingState & DrawingActions

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

function removeEntryById(entries: AnnotationEntry[], id: string): AnnotationEntry[] {
  return entries.flatMap<AnnotationEntry>((entry) => {
    if (entry.id === id) return []
    if (entry.type === 'folder') {
      return [{ ...entry, children: removeEntryById(entry.children, id) }]
    }
    return [entry]
  })
}

function appendToFolder(entries: AnnotationEntry[], parentId: string | null, item: AnnotationEntry): AnnotationEntry[] {
  if (!parentId) return [...entries, item]
  return entries.map((entry) => {
    if (entry.type !== 'folder') return entry
    if (entry.id === parentId) return { ...entry, children: [...entry.children, item] }
    return { ...entry, children: appendToFolder(entry.children, parentId, item) }
  })
}

function renameFolderEntry(entries: AnnotationEntry[], id: string, name: string): AnnotationEntry[] {
  return entries.map((entry) => {
    if (entry.type !== 'folder') return entry
    if (entry.id === id) return { ...entry, name }
    return { ...entry, children: renameFolderEntry(entry.children, id, name) }
  })
}

function unwrapFolderEntry(entries: AnnotationEntry[], id: string): AnnotationEntry[] {
  return entries.flatMap<AnnotationEntry>((entry) => {
    if (entry.id === id && entry.type === 'folder') return entry.children
    if (entry.type === 'folder') return [{ ...entry, children: unwrapFolderEntry(entry.children, id) }]
    return [entry]
  })
}

function insertRelativeToEntry(
  entries: AnnotationEntry[],
  targetId: string,
  placement: 'before' | 'after',
  item: AnnotationEntry
): AnnotationEntry[] {
  return entries.flatMap<AnnotationEntry>((entry) => {
    if (entry.id === targetId) {
      return placement === 'before' ? [item, entry] : [entry, item]
    }
    if (entry.type === 'folder') {
      return [{ ...entry, children: insertRelativeToEntry(entry.children, targetId, placement, item) }]
    }
    return [entry]
  })
}

export function createInitialDrawingState(): DrawingState {
  return {
    shapes: [],
    entries: [],
    activeTool: null,
    selectedShapeId: null,
    saveError: ''
  }
}

let pendingSave = Promise.resolve()
let saveTimer: ReturnType<typeof setTimeout> | undefined
const transientShapeIds = new Set<string>()

export const useDrawingStore = create<DrawingStore>()(
  subscribeWithSelector((set, get) => {
    function persist(): void {
      if (!apiAvailable()) return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        saveTimer = undefined
        const state = get()
        const persistedIds = referencedShapeIds(state.entries)
        const persisted = state.shapes.filter((shape) => persistedIds.has(shape.id))
        const dropped = state.shapes.filter((shape) => !persistedIds.has(shape.id) && !transientShapeIds.has(shape.id))
        if (dropped.length) {
          logger.warn('annotations', `${dropped.length} 个标注图形没有目录引用，本次保存已跳过`, dropped.map((shape) => shape.id))
        }
        const snapshot: AnnotationDocument = {
          shapes: JSON.parse(JSON.stringify(persisted)) as DrawnShape[],
          entries: JSON.parse(JSON.stringify(state.entries)) as AnnotationEntry[]
        }
        pendingSave = pendingSave.catch(() => undefined).then(async () => {
          await window.guEarth.annotations.save(snapshot)
          set({ saveError: '' })
        }).catch(() => {
          set({ saveError: '标注保存失败，请重试' })
        })
      }, 120)
    }

    return {
      ...createInitialDrawingState(),
      async load(): Promise<void> {
        if (!apiAvailable()) return
        try {
          const document = await window.guEarth.annotations.load()
          set({
            shapes: [...document.shapes],
            entries: [...document.entries]
          })
          useFailureStore.getState().clearFailure('annotations')
        } catch {
          useFailureStore.getState().reportFailure({ scope: 'annotations', message: '标注读取失败，暂时无法显示已保存的标注', retryable: true })
        }
      },
      setActiveTool(tool: DrawTool | null): void {
        set({ activeTool: tool })
      },
      setSelectedShapeId(id: string | null): void {
        set({ selectedShapeId: id })
      },
      addShape(shape: DrawnShape): void {
        set((state) => ({
          shapes: [...state.shapes, shape],
          entries: [...state.entries, { type: 'shape', id: shape.id }]
        }))
        persist()
      },
      addTransientShape(shape: DrawnShape): void {
        transientShapeIds.add(shape.id)
        set((state) => ({
          shapes: [...state.shapes, shape]
        }))
      },
      updateShape(
        id: string,
        changes: Partial<Pick<DrawnShape, 'annotation' | 'color' | 'textColor' | 'fontFamily' | 'fontSize' | 'textFrame' | 'lineWidth'>>
      ): void {
        if (!get().shapes.some((item) => item.id === id)) return
        set((state) => ({
          shapes: state.shapes.map((item) => (item.id === id ? { ...item, ...changes } : item))
        }))
        persist()
      },
      removeShape(id: string): void {
        if (!get().shapes.some((item) => item.id === id)) return
        const transient = transientShapeIds.delete(id)
        set((state) => ({
          shapes: state.shapes.filter((item) => item.id !== id),
          entries: removeEntryById(state.entries, id),
          selectedShapeId: state.selectedShapeId === id ? null : state.selectedShapeId
        }))
        if (transient) return
        persist()
      },
      clearAll(): void {
        transientShapeIds.clear()
        set({
          shapes: [],
          entries: [],
          selectedShapeId: null
        })
        persist()
      },
      addFolder(name: string, parentId: string | null): string | null {
        const trimmed = name.trim().slice(0, 80)
        if (!trimmed) return null
        const currentEntries = get().entries
        const parent = parentId ? findEntry(currentEntries, parentId) : undefined
        if (parentId && (!parent || parent.type !== 'folder' || folderDepth(currentEntries, parentId) >= 5)) return null
        const id = crypto.randomUUID()
        const folder: AnnotationEntry = { type: 'folder', id, name: trimmed, children: [] }
        set((state) => ({
          entries: appendToFolder(state.entries, parentId, folder)
        }))
        persist()
        return id
      },
      renameFolder(id: string, name: string): boolean {
        const entry = findEntry(get().entries, id)
        const trimmed = name.trim().slice(0, 80)
        if (!entry || entry.type !== 'folder' || !trimmed) return false
        set((state) => ({
          entries: renameFolderEntry(state.entries, id, trimmed)
        }))
        persist()
        return true
      },
      removeFolder(id: string): void {
        const folder = findEntry(get().entries, id)
        if (!folder || folder.type !== 'folder') return
        set((state) => ({
          entries: unwrapFolderEntry(state.entries, id)
        }))
        persist()
      },
      moveEntry(id: string, targetId: string | null, placement: 'inside' | 'before' | 'after'): boolean {
        const currentEntries = get().entries
        const source = findEntry(currentEntries, id)
        if (!source || (targetId && containsEntry(source, targetId))) return false
        const target = targetId ? findEntry(currentEntries, targetId) : undefined
        if (targetId && !target) return false
        if (placement === 'inside' && targetId && target?.type !== 'folder') return false
        const destinationDepth = !targetId
          ? 0
          : placement === 'inside'
            ? folderDepth(currentEntries, targetId)
            : folderDepth(currentEntries, targetId) - 1
        if (destinationDepth + subtreeDepth(source) > 5) return false
        const withoutSource = removeEntryById(currentEntries, id)
        const nextEntries = !targetId
          ? [...withoutSource, source]
          : placement === 'inside'
            ? appendToFolder(withoutSource, targetId, source)
            : insertRelativeToEntry(withoutSource, targetId, placement, source)
        set({ entries: nextEntries })
        persist()
        return true
      }
    }
  })
)

if (typeof useFailureStore.getState === 'function') {
  useFailureStore.getState().registerRetry('annotations', () => useDrawingStore.getState().load())
}

export function resetDrawingStore(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  pendingSave = Promise.resolve()
  transientShapeIds.clear()
  useDrawingStore.setState(createInitialDrawingState())
}
