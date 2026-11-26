import type { AnnotationEntry } from '../../../preload'
import { useAiStore } from '@renderer/stores/ai'
import { DEFAULT_DRAW_STYLE, useDrawingStore } from '@renderer/stores/drawing';
import type { DrawnShape, GeoPosition } from '@renderer/stores/drawing';
import { measureShape } from '@renderer/composables/useDrawing'

type FolderEntry = Extract<AnnotationEntry, { type: 'folder' }>

const MAX_MARKER_BATCH = 20
const MAX_FOLDER_OPERATIONS = 20
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export function parsePositions(raw: unknown, minCount: number): GeoPosition[] | null {
  if (!Array.isArray(raw)) {return null}
  const positions: GeoPosition[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {continue}
    const record = item as Record<string, unknown>
    const longitude = Number(record.longitude)
    const latitude = Number(record.latitude)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {continue}
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {continue}
    if (!positions.some((existing) => existing.longitude === longitude && existing.latitude === latitude)) {positions.push({ longitude, latitude, height: 0 })}
  }
  return positions.length >= minCount && positions.length <= 500 ? positions : null
}

export function collectStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) {return []}
  return raw.flatMap((item) => (typeof item === 'string' && item.trim() ? [item.trim()] : []))
}

function entryById(entries: AnnotationEntry[], id: string): AnnotationEntry | undefined {
  for (const entry of entries) {
    if (entry.id === id) {return entry}
    if (entry.type === 'folder') {
      const found = entryById(entry.children, id)
      if (found) {return found}
    }
  }
  return undefined
}

function folderSegments(path: string): string[] {
  return path.split('/').map((segment) => segment.trim()).filter(Boolean)
}

function folderByPath(entries: AnnotationEntry[], segments: string[]): FolderEntry | undefined {
  if (segments.length === 0) {return undefined}
  const [head, ...rest] = segments
  const child = entries.find((entry) => entry.type === 'folder' && entry.name === head)
  if (child?.type !== 'folder') {return undefined}
  return rest.length > 0 ? folderByPath(child.children, rest) : child
}

function countShapes(entries: AnnotationEntry[]): number {
  return entries.reduce((total, entry) => total + (entry.type === 'shape' ? 1 : countShapes(entry.children)), 0)
}

function folderRefId(ref: string): string | null {
  const trimmed = ref.trim()
  if (!trimmed) {return null}
  const { entries } = useDrawingStore.getState()
  const byId = entryById(entries, trimmed)
  if (byId) {return byId.type === 'folder' ? byId.id : null}
  return folderByPath(entries, folderSegments(trimmed))?.id ?? null
}

function folderPathOf(id: string): string {
  const walk = (entries: AnnotationEntry[], prefix: string): string => {
    for (const entry of entries) {
      if (entry.type !== 'folder') {continue}
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id === id) {return path}
      const found = walk(entry.children, path)
      if (found) {return found}
    }
    return ''
  }
  return walk(useDrawingStore.getState().entries, '')
}

function ensureFolderPath(segments: string[]): string | null {
  if (segments.length === 0) {return null}
  let parentId: string | null = null
  for (const segment of segments) {
    const drawingStore = useDrawingStore.getState()
    const parent: AnnotationEntry | undefined = parentId ? entryById(drawingStore.entries, parentId) : undefined
    const siblings: AnnotationEntry[] = parent?.type === 'folder' ? parent.children : drawingStore.entries
    const existing: AnnotationEntry | undefined = siblings.find((entry) => entry.type === 'folder' && entry.name === segment)
    parentId = existing?.id ?? drawingStore.addFolder(segment, parentId)
    if (!parentId) {return null}
  }
  return parentId
}

export function registerAnnotationTools(): void {
  const aiStore = useAiStore.getState()

  aiStore.registerTool({
    label: '添加标记',
    definition: {
      name: 'add_marker',
      description: '在地图上添加带名称的标记点，持久保存并可在标注面板中管理。单个标记传 name/longitude/latitude；多个标记传 markers 数组一次批量添加（单次最多 20 个）。返回标记 id，可用于后续删除或移动。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '标记名称，将显示在地图上（如“珠穆朗玛峰”）' },
          longitude: { type: 'number', description: '经度（WGS-84，-180 到 180）' },
          latitude: { type: 'number', description: '纬度（WGS-84，-90 到 90）' },
          markers: {
            type: 'array',
            description: '批量添加：标记对象数组，单项含 name、longitude、latitude；与单个 name/longitude/latitude 二选一',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '标记名称' },
                longitude: { type: 'number', description: '经度（WGS-84）' },
                latitude: { type: 'number', description: '纬度（WGS-84）' }
              },
              required: ['name', 'longitude', 'latitude']
            }
          }
        }
      }
    },
    execute: async (args) => {
      const entries: unknown[] = Array.isArray(args.markers) ? args.markers : [args]
      if (entries.length > MAX_MARKER_BATCH) {return { error: `单次最多添加 ${MAX_MARKER_BATCH} 个标记，请分批调用` }}
      const added: { id: string; name: string; longitude: number; latitude: number }[] = []
      let skipped = 0
      for (const entry of entries) {
        const record = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {}
        const name = typeof record.name === 'string' ? record.name.trim().slice(0, 200) : ''
        const positions = parsePositions([record], 1)
        if (!name || !positions) { skipped += 1; continue }
        const id = crypto.randomUUID()
        useDrawingStore.getState().addShape({ ...DEFAULT_DRAW_STYLE, id, kind: 'point', positions, annotation: name, createdAt: Date.now() })
        added.push({ id, name, longitude: positions[0].longitude, latitude: positions[0].latitude })
      }
      if (added.length === 0) {return { error: '没有有效标记：需要名称与 WGS-84 经纬度坐标' }}
      if (entries.length === 1) {return { status: 'ok', id: added[0].id, kind: 'point', name: added[0].name, longitude: added[0].longitude, latitude: added[0].latitude }}
      return { status: 'ok', added: added.length, skipped: skipped || undefined, markers: added }
    }
  })

  aiStore.registerTool({
    label: '添加文本标注',
    definition: {
      name: 'add_text_marker',
      description: '在指定 WGS-84 经纬度位置添加文本标注：在地图上显示一段文字，适合放置地名说明、教学提示或成因注释。持久保存并可在标注面板中管理。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要显示的文字内容（如「板块碰撞挤压边界」）' },
          longitude: { type: 'number', description: '经度（WGS-84，-180 到 180）' },
          latitude: { type: 'number', description: '纬度（WGS-84，-90 到 90）' },
          fontSize: { type: 'number', description: '字号（像素，8-48），省略时为 13' },
          color: { type: 'string', description: '文字颜色（#RRGGBB），省略时为白色' }
        },
        required: ['text', 'longitude', 'latitude']
      }
    },
    execute: async (args) => {
      const text = typeof args.text === 'string' ? args.text.trim().slice(0, 200) : ''
      if (!text) {return { error: 'text 不能为空' }}
      const positions = parsePositions([args], 1)
      if (!positions) {return { error: '坐标无效，需要 WGS-84 经纬度' }}
      let fontSize = DEFAULT_DRAW_STYLE.fontSize
      if (args.fontSize !== undefined) {
        const value = Number(args.fontSize)
        if (!Number.isFinite(value) || value < 8 || value > 48) {return { error: 'fontSize 需为 8-48 的数字' }}
        fontSize = Math.round(value)
      }
      let textColor = DEFAULT_DRAW_STYLE.textColor
      if (args.color !== undefined) {
        if (typeof args.color !== 'string' || !COLOR_PATTERN.test(args.color)) {return { error: 'color 需为 #RRGGBB 格式' }}
        textColor = args.color
      }
      const id = crypto.randomUUID()
      useDrawingStore.getState().addShape({ ...DEFAULT_DRAW_STYLE, id, kind: 'text', positions, annotation: text, textColor, fontSize, textFrame: true, createdAt: Date.now() })
      return { status: 'ok', id, kind: 'text', text, longitude: positions[0].longitude, latitude: positions[0].latitude, message: `已添加文本「${text.slice(0, 30)}」` }
    }
  })

  aiStore.registerTool({
    label: '添加箭头标注',
    definition: {
      name: 'add_arrow',
      description: '在地图上添加箭头标注：从起点指向终点，适合表示板块运动方向、洋流流向、风向、行进路线等。可选 name 显示在箭头末端。',
      parameters: {
        type: 'object',
        properties: {
          fromLongitude: { type: 'number', description: '起点经度（WGS-84，-180 到 180）' },
          fromLatitude: { type: 'number', description: '起点纬度（WGS-84，-90 到 90）' },
          toLongitude: { type: 'number', description: '终点经度（WGS-84，-180 到 180）' },
          toLatitude: { type: 'number', description: '终点纬度（WGS-84，-90 到 90）' },
          name: { type: 'string', description: '可选名称，显示在箭头末端' },
          color: { type: 'string', description: '箭头颜色（#RRGGBB），省略时为蓝色 #1677ff' },
          lineWidth: { type: 'number', description: '箭头线宽（像素，1-10），省略时为 3' }
        },
        required: ['fromLongitude', 'fromLatitude', 'toLongitude', 'toLatitude']
      }
    },
    execute: async (args) => {
      const positions = parsePositions([
        { longitude: args.fromLongitude, latitude: args.fromLatitude },
        { longitude: args.toLongitude, latitude: args.toLatitude }
      ], 2)
      if (!positions) {return { error: '坐标无效：箭头需要起点与终点两个不同位置的 WGS-84 经纬度' }}
      const name = typeof args.name === 'string' ? args.name.trim().slice(0, 200) : ''
      let color = DEFAULT_DRAW_STYLE.color
      if (args.color !== undefined) {
        if (typeof args.color !== 'string' || !COLOR_PATTERN.test(args.color)) {return { error: 'color 需为 #RRGGBB 格式' }}
        color = args.color
      }
      let lineWidth = DEFAULT_DRAW_STYLE.lineWidth
      if (args.lineWidth !== undefined) {
        const value = Number(args.lineWidth)
        if (!Number.isFinite(value) || value < 1 || value > 10) {return { error: 'lineWidth 需为 1-10 的数字' }}
        lineWidth = Math.round(value)
      }
      const id = crypto.randomUUID()
      useDrawingStore.getState().addShape({ ...DEFAULT_DRAW_STYLE, id, kind: 'arrow', positions, annotation: name, color, lineWidth, createdAt: Date.now() })
      return { status: 'ok', id, kind: 'arrow', name: name || undefined, message: name ? `已添加箭头「${name}」` : '已添加箭头' }
    }
  })

  aiStore.registerTool({
    label: '绘制图形',
    definition: {
      name: 'draw_shape',
      description: '在地图上绘制线或闭合多边形，持久保存。线自动标注总长度、多边形自动标注面积，适合测距、测面、展示边界或路线；传入 name 则显示名称替代测量值。',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['polyline', 'polygon'], description: 'polyline 为线（至少 2 个顶点），polygon 为多边形（至少 3 个顶点）' },
          points: {
            type: 'array',
            description: '顶点坐标数组，按绘制顺序排列',
            items: {
              type: 'object',
              properties: {
                longitude: { type: 'number', description: '经度（WGS-84）' },
                latitude: { type: 'number', description: '纬度（WGS-84）' }
              },
              required: ['longitude', 'latitude']
            }
          },
          name: { type: 'string', description: '可选名称；省略时图上显示自动测量的长度或面积' }
        },
        required: ['kind', 'points']
      }
    },
    execute: async (args) => {
      let kind: 'polyline' | 'polygon' | null = null
      if (args.kind === 'polygon') {kind = 'polygon'}
      else if (args.kind === 'polyline') {kind = 'polyline'}
      if (!kind) {return { error: 'kind 必须为 polyline 或 polygon' }}
      const positions = parsePositions(args.points, kind === 'polygon' ? 3 : 2)
      if (!positions) {return { error: `坐标无效：${kind === 'polygon' ? '多边形需要至少 3 个' : '线需要至少 2 个'}有效且不重复的经纬度顶点` }}
      const name = typeof args.name === 'string' ? args.name.trim().slice(0, 200) : ''
      const shape: DrawnShape = { ...DEFAULT_DRAW_STYLE, id: crypto.randomUUID(), kind, positions, annotation: name, createdAt: Date.now() }
      useDrawingStore.getState().addShape(shape)
      const measurement = measureShape(shape)
      return { status: 'ok', id: shape.id, kind, name: name || undefined, vertices: positions.length, measurement: measurement || undefined }
    }
  })

  aiStore.registerTool({
    label: '标注列表',
    definition: {
      name: 'list_shapes',
      description: '列出地图上现有的全部标注与文件夹结构：每个标注含 id、名称、类型、所在文件夹路径、首个顶点坐标与测量值；folders 为文件夹列表（id、名称、路径、包含的标注数，含子文件夹）。删除、移动标注或管理文件夹前使用。',
      parameters: { type: 'object', properties: {} }
    },
    execute: async () => {
      const folders: { id: string; name: string; path: string; shapes: number }[] = []
      const shapeFolder = new Map<string, string>()
      const walk = (entries: AnnotationEntry[], prefix: string): void => {
        for (const entry of entries) {
          if (entry.type === 'folder') {
            const path = prefix ? `${prefix}/${entry.name}` : entry.name
            folders.push({ id: entry.id, name: entry.name, path, shapes: countShapes(entry.children) })
            walk(entry.children, path)
          } else {shapeFolder.set(entry.id, prefix)}
        }
      }
      const { entries, shapes } = useDrawingStore.getState()
      walk(entries, '')
      return {
        shapes: shapes.map((shape) => ({
          id: shape.id,
          kind: shape.kind,
          name: shape.annotation || undefined,
          folder: shapeFolder.get(shape.id) || undefined,
          vertices: shape.positions.length,
          longitude: shape.positions.length > 0 ? Math.round(shape.positions[0].longitude * 10_000) / 10_000 : undefined,
          latitude: shape.positions.length > 0 ? Math.round(shape.positions[0].latitude * 10_000) / 10_000 : undefined,
          measurement: measureShape(shape) || undefined
        })),
        folders: folders.length > 0 ? folders : undefined
      }
    }
  })

  aiStore.registerTool({
    label: '删除标注',
    definition: {
      name: 'remove_shape',
      description: '删除地图上的标注：按 id 精确删除（id 来自 add_marker/draw_shape 返回值或 list_shapes）或按名称精确匹配删除（同名标注全部删除）；ids/names 数组为批量形式，可与单个 id/name 混用。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '标注 id' },
          ids: { type: 'array', description: '批量删除：标注 id 数组', items: { type: 'string' } },
          name: { type: 'string', description: '标注名称（精确匹配）' },
          names: { type: 'array', description: '批量删除：标注名称数组（精确匹配，同名全部删除）', items: { type: 'string' } }
        }
      }
    },
    execute: async (args) => {
      const ids = new Set(collectStrings(args.ids))
      if (typeof args.id === 'string' && args.id.trim()) {ids.add(args.id.trim())}
      const names = new Set(collectStrings(args.names))
      if (typeof args.name === 'string' && args.name.trim()) {names.add(args.name.trim())}
      if (ids.size === 0 && names.size === 0) {return { error: '需要提供 id/ids 或 name/names' }}
      const missingIds: string[] = []
      const missingNames: string[] = []
      let removed = 0
      for (const id of ids) {
        const drawingStore = useDrawingStore.getState()
        if (!drawingStore.shapes.some((shape) => shape.id === id)) { missingIds.push(id); continue }
        drawingStore.removeShape(id)
        removed += 1
      }
      for (const name of names) {
        const drawingStore = useDrawingStore.getState()
        const matched = drawingStore.shapes.filter((shape) => shape.annotation === name)
        if (matched.length === 0) { missingNames.push(name); continue }
        for (const shape of matched) {useDrawingStore.getState().removeShape(shape.id)}
        removed += matched.length
      }
      if (!removed) {
        const target = missingIds[0] ?? missingNames[0]
        return { error: `未找到标注「${target}」，可先调用 list_shapes 查看` }
      }
      return {
        status: 'ok',
        removed,
        message: `已删除 ${removed} 个标注`,
        missingIds: missingIds.length > 0 ? missingIds : undefined,
        missingNames: missingNames.length > 0 ? missingNames : undefined
      }
    }
  })

  aiStore.registerTool({
    label: '管理标注文件夹',
    definition: {
      name: 'manage_folders',
      description: '批量管理标注面板中的文件夹：创建、重命名、删除。单个操作直接传 action/name/parent/folder，多个操作传 operations 数组按顺序执行（单次最多 20 个）。文件夹引用支持 id 或「/」分隔路径（如「世界地形/山脉」，也接受单层名称）；文件夹最多嵌套 5 层；删除文件夹后其中的标注与子文件夹会上移到其父文件夹，不会被删除。先用 list_shapes 查看现有结构。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'rename', 'remove'], description: 'create 创建、rename 重命名、remove 删除文件夹' },
          name: { type: 'string', description: 'create：新文件夹名称；rename：新名称' },
          parent: { type: 'string', description: 'create：父文件夹 id 或路径，省略时创建在根目录' },
          folder: { type: 'string', description: 'rename/remove：目标文件夹 id 或路径' },
          operations: {
            type: 'array',
            description: '批量操作数组，按顺序执行，单项字段同上',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['create', 'rename', 'remove'], description: 'create 创建、rename 重命名、remove 删除文件夹' },
                name: { type: 'string', description: 'create：新文件夹名称；rename：新名称' },
                parent: { type: 'string', description: 'create：父文件夹 id 或路径，省略时创建在根目录' },
                folder: { type: 'string', description: 'rename/remove：目标文件夹 id 或路径' }
              },
              required: ['action']
            }
          }
        }
      }
    },
    execute: async (args) => {
      const operations = Array.isArray(args.operations) && args.operations.length > 0 ? args.operations : [args]
      if (operations.length > MAX_FOLDER_OPERATIONS) {return { error: `单次最多 ${MAX_FOLDER_OPERATIONS} 个操作，请分批调用` }}
      const created: { id: string; name: string; path: string }[] = []
      let renamed = 0
      let removed = 0
      const errors: string[] = []
      for (const operation of operations) {
        const record = typeof operation === 'object' && operation !== null ? operation as Record<string, unknown> : {}
        if (record.action === 'create') {
          const name = typeof record.name === 'string' ? record.name.trim().slice(0, 80) : ''
          if (!name) { errors.push('create 操作缺少 name'); continue }
          const parentRef = typeof record.parent === 'string' ? record.parent.trim() : ''
          const parentId = parentRef ? folderRefId(parentRef) : null
          if (parentRef && !parentId) { errors.push(`未找到父文件夹「${parentRef}」`); continue }
          const id = useDrawingStore.getState().addFolder(name, parentId)
          if (!id) { errors.push(`无法创建「${name}」：文件夹最多嵌套 5 层`); continue }
          created.push({ id, name, path: parentId ? `${folderPathOf(parentId)}/${name}` : name })
        } else if (record.action === 'rename') {
          const folderRef = typeof record.folder === 'string' ? record.folder.trim() : ''
          const name = typeof record.name === 'string' ? record.name.trim().slice(0, 80) : ''
          if (!folderRef || !name) { errors.push('rename 操作需要 folder 与 name'); continue }
          const id = folderRefId(folderRef)
          if (!id) { errors.push(`未找到文件夹「${folderRef}」`); continue }
          if (useDrawingStore.getState().renameFolder(id, name)) {renamed += 1}
          else {errors.push(`无法重命名「${folderRef}」`)}
        } else if (record.action === 'remove') {
          const folderRef = typeof record.folder === 'string' ? record.folder.trim() : ''
          if (!folderRef) { errors.push('remove 操作需要 folder'); continue }
          const id = folderRefId(folderRef)
          if (!id) { errors.push(`未找到文件夹「${folderRef}」`); continue }
          useDrawingStore.getState().removeFolder(id)
          removed += 1
        } else {errors.push(`未知 action「${String(record.action)}」，需为 create、rename 或 remove`)}
      }
      if (created.length === 0 && !renamed && !removed) {return { error: errors[0] ?? '没有有效操作' }}
      const parts: string[] = []
      if (created.length === 1) {parts.push(`已创建文件夹「${created[0].name}」`)}
      else if (created.length > 1) {parts.push(`已创建 ${created.length} 个文件夹`)}
      if (renamed === 1) {parts.push('已重命名 1 个文件夹')}
      else if (renamed > 1) {parts.push(`已重命名 ${renamed} 个文件夹`)}
      if (removed === 1) {parts.push('已删除 1 个文件夹（其中标注上移一级）')}
      else if (removed > 1) {parts.push(`已删除 ${removed} 个文件夹（其中标注上移一级）`)}
      return { status: 'ok', created, renamed, removed, message: parts.join('，'), errors: errors.length > 0 ? errors : undefined }
    }
  })

  aiStore.registerTool({
    label: '移动标注',
    definition: {
      name: 'move_markers',
      description: '批量把标注（点、文本、箭头、线、面）移动到指定文件夹，或移回根目录。folder 为目标文件夹 id 或「/」分隔路径；createFolder 为 true 时路径中不存在的文件夹会自动创建。目标标注用 id（来自添加类工具返回值或 list_shapes）或名称精确匹配（同名全部移动），支持 ids/names 批量。',
      parameters: {
        type: 'object',
        properties: {
          ids: { type: 'array', description: '标注 id 数组', items: { type: 'string' } },
          names: { type: 'array', description: '标注名称数组（精确匹配，同名全部移动）', items: { type: 'string' } },
          id: { type: 'string', description: '单个标注 id' },
          name: { type: 'string', description: '单个标注名称（精确匹配）' },
          folder: { type: 'string', description: '目标文件夹 id 或路径；省略或传空字符串表示移回根目录' },
          createFolder: { type: 'boolean', description: 'true 时自动创建路径中不存在的文件夹' }
        }
      }
    },
    execute: async (args) => {
      const ids = new Set(collectStrings(args.ids))
      if (typeof args.id === 'string' && args.id.trim()) {ids.add(args.id.trim())}
      const names = new Set(collectStrings(args.names))
      if (typeof args.name === 'string' && args.name.trim()) {names.add(args.name.trim())}
      if (ids.size === 0 && names.size === 0) {return { error: '需要提供 id/ids 或 name/names' }}
      const missingIds: string[] = []
      const missingNames: string[] = []
      const seen = new Set<string>()
      const targets: DrawnShape[] = []
      const { shapes } = useDrawingStore.getState()
      for (const id of ids) {
        const shape = shapes.find((item) => item.id === id)
        if (!shape) { missingIds.push(id); continue }
        if (!seen.has(shape.id)) { seen.add(shape.id); targets.push(shape) }
      }
      for (const name of names) {
        const matched = shapes.filter((item) => item.annotation === name)
        if (matched.length === 0) { missingNames.push(name); continue }
        for (const shape of matched) {
          if (!seen.has(shape.id)) { seen.add(shape.id); targets.push(shape) }
        }
      }
      if (targets.length === 0) {return { error: `未找到标注「${missingIds[0] ?? missingNames[0]}」，可先调用 list_shapes 查看` }}
      const folderRef = typeof args.folder === 'string' ? args.folder.trim() : ''
      let folderId: string | null = null
      if (folderRef) {
        folderId = folderRefId(folderRef)
        if (!folderId && args.createFolder === true) {folderId = ensureFolderPath(folderSegments(folderRef))}
        if (!folderId) {return { error: `未找到文件夹「${folderRef}」：可先用 manage_folders 创建，或设置 createFolder 为 true 自动创建` }}
      }
      let moved = 0
      for (const shape of targets) {
        if (useDrawingStore.getState().moveEntry(shape.id, folderId, 'inside')) {moved += 1}
      }
      const targetLabel = folderId ? folderPathOf(folderId) : '根目录'
      return {
        status: 'ok',
        moved,
        folder: targetLabel,
        message: `已移动 ${moved} 个标注到「${targetLabel}」`,
        missingIds: missingIds.length > 0 ? missingIds : undefined,
        missingNames: missingNames.length > 0 ? missingNames : undefined
      }
    }
  })
}
