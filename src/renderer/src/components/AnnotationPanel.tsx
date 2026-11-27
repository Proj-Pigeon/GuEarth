import { useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import {
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  MapPinIcon,
  MoveUpRightIcon,
  PencilIcon,
  PentagonIcon,
  Trash2Icon,
  TypeIcon,
  WaypointsIcon,
  XIcon
} from 'lucide-react'
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  Modal,
  Tag,
  Tooltip,
  useConfirm,
  useToast
} from '@renderer/components/ui'
import { flattenVisibleTree, resolveTreeKeyAction } from '@renderer/lib/treeNavigation';
import type { TreeNavNode } from '@renderer/lib/treeNavigation';
import type { AnnotationEntry } from '../../../preload'
import { useDrawingStore } from '@renderer/stores/drawing';
import type { DrawnShape } from '@renderer/stores/drawing';
import styles from './AnnotationPanel.module.css'

export interface AnnotationPanelProps {
  open: boolean
  shapes: DrawnShape[]
  entries: AnnotationEntry[]
  selectedShapeId: string | null
  saveError: string
  onClose: () => void
  onEdit: (id: string) => void
  onFly: (id: string) => void
  onRemove: (id: string) => void
}

interface AnnotationTreeNode {
  key: string
  title: string
  nodeType: 'folder' | 'shape'
  entryId: string
  shapeKind?: DrawnShape['kind']
  children?: AnnotationTreeNode[]
}

type DropPlacement = 'before' | 'inside' | 'after'

const kindLabels: Record<DrawnShape['kind'], string> = {
  point: '点',
  polyline: '线',
  polygon: '面',
  arrow: '箭头',
  text: '文本框'
}

function renderKindIcon(kind: DrawnShape['kind']): ReactNode {
  if (kind === 'point') {return <MapPinIcon className={styles.rowIcon} />}
  if (kind === 'polyline') {return <WaypointsIcon className={styles.rowIcon} />}
  if (kind === 'polygon') {return <PentagonIcon className={styles.rowIcon} />}
  if (kind === 'arrow') {return <MoveUpRightIcon className={styles.rowIcon} />}
  return <TypeIcon className={styles.rowIcon} />
}

export function AnnotationPanel({
  open,
  shapes,
  entries,
  selectedShapeId,
  saveError,
  onClose,
  onEdit,
  onFly,
  onRemove
}: AnnotationPanelProps) {
  const toast = useToast()
  const confirm = useConfirm()
  const addFolder = useDrawingStore((state) => state.addFolder)
  const renameFolder = useDrawingStore((state) => state.renameFolder)
  const removeFolder = useDrawingStore((state) => state.removeFolder)
  const moveEntry = useDrawingStore((state) => state.moveEntry)

  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [folderDialogMode, setFolderDialogMode] = useState<'create' | 'rename'>('create')
  const [folderTargetId, setFolderTargetId] = useState<string | null>(null)
  const [folderName, setFolderName] = useState('')
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ key: string; placement: DropPlacement } | null>(null)
  const treeItemRefs = useRef(new Map<string, HTMLDivElement>())

  const treeData = useMemo<AnnotationTreeNode[]>(() => {
    const shapesById = new Map(shapes.map((shape, index) => [shape.id, { shape, index }]))
    const toTreeNode = (entry: AnnotationEntry): AnnotationTreeNode => {
      if (entry.type === 'folder') {
        return {
          key: `folder:${entry.id}`,
          title: entry.name,
          nodeType: 'folder',
          entryId: entry.id,
          children: entry.children.map(toTreeNode)
        }
      }
      const item = shapesById.get(entry.id)
      const kind = item?.shape.kind ?? 'point'
      return {
        key: `shape:${entry.id}`,
        title: item?.shape.annotation || `${kindLabels[kind]} ${(item?.index ?? 0) + 1}`,
        nodeType: 'shape',
        entryId: entry.id,
        shapeKind: kind
      }
    }
    return entries.map(toTreeNode)
  }, [entries, shapes])

  const expandedSet = useMemo(() => new Set(expandedKeys), [expandedKeys])
  const activeKey = selectedEntryKey ?? (selectedShapeId ? `shape:${selectedShapeId}` : null)

  const visibleItems = useMemo(() => {
    const toNavNode = (node: AnnotationTreeNode): TreeNavNode => ({
      key: node.key,
      isFolder: node.nodeType === 'folder',
      children: node.children?.map(toNavNode)
    })
    return flattenVisibleTree(treeData.map(toNavNode), expandedSet)
  }, [treeData, expandedSet])

  const visibleKeySet = useMemo(() => new Set(visibleItems.map((item) => item.key)), [visibleItems])
  const rovingKey =
    (focusedKey && visibleKeySet.has(focusedKey) ? focusedKey : null) ??
    (activeKey && visibleKeySet.has(activeKey) ? activeKey : null) ??
    visibleItems[0]?.key ??
    null

  function focusTreeItem(key: string): void {
    setFocusedKey(key)
    treeItemRefs.current.get(key)?.focus()
  }

  function expandKey(key: string): void {
    setExpandedKeys((previous) => (previous.includes(key) ? previous : [...previous, key]))
  }

  function collapseKey(key: string): void {
    setExpandedKeys((previous) => previous.filter((item) => item !== key))
  }

  function toggleExpand(key: string): void {
    setExpandedKeys((previous) =>
      previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key]
    )
  }

  function openCreate(parentId: string | null): void {
    setFolderDialogMode('create')
    setFolderTargetId(parentId)
    setFolderName('')
    setFolderDialogOpen(true)
  }

  function openRename(id: string, name: string): void {
    setFolderDialogMode('rename')
    setFolderTargetId(id)
    setFolderName(name)
    setFolderDialogOpen(true)
  }

  function saveFolder(): void {
    const name = folderName.trim()
    if (!name) {return}
    if (folderDialogMode === 'create') {
      const id = addFolder(name, folderTargetId)
      if (!id) {
        toast.warning('文件夹最多嵌套 5 层')
        return
      }
      setExpandedKeys((previous) => [
        ...new Set([
          ...previous,
          ...(folderTargetId ? [`folder:${folderTargetId}`] : []),
          `folder:${id}`
        ])
      ])
    } else if (folderTargetId) {
      renameFolder(folderTargetId, name)
    }
    setFolderDialogOpen(false)
  }

  function confirmRemoveFolder(id: string, name: string): void {
    confirm({
      title: `删除文件夹「${name}」？`,
      content: '其中的标注和子文件夹会移到上一级',
      okText: '删除',
      danger: true,
      cancelText: '取消',
      onOk: () => {
        removeFolder(id)
        setSelectedEntryKey((current) => (current === `folder:${id}` ? null : current))
      }
    })
  }

  function confirmRemoveShape(id: string, name: string): void {
    confirm({
      title: `删除标注「${name}」？`,
      okText: '删除',
      danger: true,
      cancelText: '取消',
      onOk: () => {
        onRemove(id)
        setSelectedEntryKey((current) => (current === `shape:${id}` ? null : current))
      }
    })
  }

  function resolvePlacement(event: DragEvent<HTMLDivElement>, node: AnnotationTreeNode): DropPlacement {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientY - rect.top) / Math.max(1, rect.height)
    if (node.nodeType === 'folder') {
      if (ratio < 0.28) {return 'before'}
      if (ratio > 0.72) {return 'after'}
      return 'inside'
    }
    return ratio < 0.5 ? 'before' : 'after'
  }

  function handleNodeDrop(event: DragEvent<HTMLDivElement>, node: AnnotationTreeNode): void {
    event.preventDefault()
    event.stopPropagation()
    const sourceId = draggingId
    const placement = resolvePlacement(event, node)
    setDraggingId(null)
    setDropHint(null)
    if (!sourceId || sourceId === node.entryId) {return}
    if (!moveEntry(sourceId, node.entryId, placement)) {
      toast.warning('无法移动到这里，文件夹最多嵌套 5 层')
      return
    }
    if (placement === 'inside') {
      setExpandedKeys((previous) => [...new Set([...previous, node.key])])
    }
  }

  function dropAtTopLevel(): void {
    if (draggingId) {moveEntry(draggingId, null, 'inside')}
    setDraggingId(null)
    setDropHint(null)
  }

  function selectNode(node: AnnotationTreeNode): void {
    setSelectedEntryKey(node.key)
    setFocusedKey(node.key)
    if (node.nodeType === 'shape') {onFly(node.entryId)}
    else {toggleExpand(node.key)}
  }

  function handleTreeKeyDown(event: KeyboardEvent<HTMLDivElement>, node: AnnotationTreeNode): void {
    if (event.target !== event.currentTarget) {return}
    const action = resolveTreeKeyAction(event.key, node.key, visibleItems, expandedSet)
    if (
      action ||
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowLeft' ||
      event.key === 'Home' ||
      event.key === 'End'
    ) {
      event.preventDefault()
    }
    if (!action) {return}
    if (action.type === 'focus') {
      focusTreeItem(action.key)
    } else if (action.type === 'expand') {
      expandKey(action.key)
    } else if (action.type === 'collapse') {
      collapseKey(action.key)
    } else if (action.type === 'activate') {
      selectNode(node)
    }
  }

  function renderNodes(nodes: AnnotationTreeNode[], depth: number): ReactNode {
    return nodes.map((node, index) => {
      const expanded = node.nodeType === 'folder' && expandedSet.has(node.key)
      const selected = activeKey === node.key
      const hint = dropHint?.key === node.key ? dropHint.placement : null
      const actionsClass = selected
        ? `${styles.rowActions} ${styles.rowActionsVisible}`
        : styles.rowActions

      return (
        <div
          key={node.key}
          ref={(element) => {
            if (element) {treeItemRefs.current.set(node.key, element)}
            else {treeItemRefs.current.delete(node.key)}
          }}
          role="treeitem"
          aria-level={depth + 1}
          aria-setsize={nodes.length}
          aria-posinset={index + 1}
          aria-selected={selected}
          aria-expanded={node.nodeType === 'folder' ? expanded : undefined}
          aria-label={node.title}
          tabIndex={node.key === rovingKey ? 0 : -1}
          className={styles.treeNodeWrap}
          onFocus={(event) => {
            if (event.target === event.currentTarget) {setFocusedKey(node.key)}
          }}
          onKeyDown={(event) => handleTreeKeyDown(event, node)}
        >
          <div
            draggable
            style={{ paddingLeft: `${8 + depth * 18}px` }}
            className={[
              styles.treeRow,
              selected ? styles.treeRowSelected : '',
              hint === 'before' ? styles.dropBefore : '',
              hint === 'after' ? styles.dropAfter : '',
              hint === 'inside' ? styles.dropInside : ''
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => selectNode(node)}
            onDragStart={(event) => {
              event.stopPropagation()
              event.dataTransfer.effectAllowed = 'move'
              setDraggingId(node.entryId)
            }}
            onDragEnd={() => {
              setDraggingId(null)
              setDropHint(null)
            }}
            onDragOver={(event) => {
              if (!draggingId || draggingId === node.entryId) {return}
              event.preventDefault()
              event.stopPropagation()
              setDropHint({ key: node.key, placement: resolvePlacement(event, node) })
            }}
            onDragLeave={() => {
              setDropHint((current) => (current?.key === node.key ? null : current))
            }}
            onDrop={(event) => handleNodeDrop(event, node)}
          >
            {node.nodeType === 'folder' ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label={expanded ? '收起文件夹' : '展开文件夹'}
                className={styles.expandToggle}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleExpand(node.key)
                }}
              >
                <ChevronRightIcon
                  className={expanded ? `${styles.expandChevron} ${styles.expandChevronOpen}` : styles.expandChevron}
                />
              </button>
            ) : (
              <span className={styles.expandSpacer} aria-hidden="true" />
            )}

            {node.nodeType === 'folder' ? (
              <>
                <FolderIcon className={styles.rowIcon} />
                <span className={styles.rowName} title={node.title}>
                  {node.title}
                </span>
                <span className={actionsClass}>
                  <Tooltip title="新建子文件夹">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={styles.rowAction}
                      aria-label={`在 ${node.title} 中新建文件夹`}
                      icon={<FolderPlusIcon className="size-3.5" />}
                      onClick={(event) => {
                        event.stopPropagation()
                        openCreate(node.entryId)
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="重命名文件夹">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={styles.rowAction}
                      aria-label={`重命名 ${node.title}`}
                      icon={<PencilIcon className="size-3.5" />}
                      onClick={(event) => {
                        event.stopPropagation()
                        openRename(node.entryId, node.title)
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="删除文件夹">
                    <Button
                      variant="ghost"
                      size="sm"
                      danger
                      className={styles.rowAction}
                      aria-label={`删除 ${node.title}`}
                      icon={<Trash2Icon className="size-3.5" />}
                      onClick={(event) => {
                        event.stopPropagation()
                        confirmRemoveFolder(node.entryId, node.title)
                      }}
                    />
                  </Tooltip>
                </span>
              </>
            ) : (
              <>
                {renderKindIcon(node.shapeKind ?? 'point')}
                <span className={styles.rowName} title={node.title}>
                  {node.title}
                </span>
                <Tag className={styles.shapeTag}>{kindLabels[node.shapeKind ?? 'point']}</Tag>
                <span className={actionsClass}>
                  <Tooltip title="编辑标注">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={styles.rowAction}
                      aria-label={`编辑 ${node.title}`}
                      icon={<PencilIcon className="size-3.5" />}
                      onClick={(event) => {
                        event.stopPropagation()
                        onEdit(node.entryId)
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="删除标注">
                    <Button
                      variant="ghost"
                      size="sm"
                      danger
                      className={styles.rowAction}
                      aria-label={`删除 ${node.title}`}
                      icon={<Trash2Icon className="size-3.5" />}
                      onClick={(event) => {
                        event.stopPropagation()
                        confirmRemoveShape(node.entryId, node.title)
                      }}
                    />
                  </Tooltip>
                </span>
              </>
            )}
          </div>
          {expanded && node.children && node.children.length > 0 && (
            <div role="group">{renderNodes(node.children, depth + 1)}</div>
          )}
        </div>
      )
    })
  }

  return (
    <>
      <Drawer
        open={open}
        placement="left"
        size={380}
        bodyStyle={{ position: 'relative' }}
        title={
          <div className={styles.panelTitle}>
            <div>
              <div className={styles.panelKicker}>ANNOTATIONS</div>
              <h2 className={styles.panelHeading}>标注</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="关闭标注面板"
              icon={<XIcon className="size-4" />}
              onClick={onClose}
            />
          </div>
        }
        onClose={onClose}
      >
        <div className={styles.panelActions}>
          <Button icon={<FolderPlusIcon className="size-4" />} onClick={() => openCreate(null)}>
            新建文件夹
          </Button>
          <span className={styles.shapeCount}>{shapes.length} 个标注</span>
        </div>
        {saveError && <Alert type="error" title={saveError} showIcon className={styles.saveError} />}
        {draggingId && (
          <div
            className={styles.topLevelDrop}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              dropAtTopLevel()
            }}
          >
            移至顶层
          </div>
        )}
        {entries.length > 0 ? (
          <div className={styles.treeWrap} role="tree" aria-label="标注列表">
            {renderNodes(treeData, 0)}
          </div>
        ) : (
          <Empty description="暂无标注" />
        )}
      </Drawer>
      <Modal
        open={folderDialogOpen}
        title={folderDialogMode === 'create' ? '新建文件夹' : '重命名文件夹'}
        width={360}
        okText="保存"
        cancelText="取消"
        okDisabled={!folderName.trim()}
        onOk={saveFolder}
        onCancel={() => setFolderDialogOpen(false)}
      >
        <Input
          value={folderName}
          maxLength={80}
          placeholder="文件夹名称"
          onChange={(event) => setFolderName(event.target.value)}
          onPressEnter={saveFolder}
        />
      </Modal>
    </>
  )
}

export default AnnotationPanel
