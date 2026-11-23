import { useMemo, useState, type ReactNode } from 'react'
import { Alert, App, Button, Drawer, Empty, Input, Modal, Tag, Tooltip, Tree, type TreeProps } from 'antd'
import type { DataNode } from 'antd/es/tree'
import {
  ArrowRightOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FontSizeOutlined,
  FolderAddOutlined,
  FolderOutlined,
  GatewayOutlined,
  NodeIndexOutlined
} from '@ant-design/icons'
import type { AnnotationEntry } from '../../../preload'
import { useDrawingStore, type DrawnShape } from '@renderer/stores/drawing'
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

interface AnnotationTreeNode extends DataNode {
  key: string
  title: string
  nodeType: 'folder' | 'shape'
  entryId: string
  shapeKind?: DrawnShape['kind']
  children?: AnnotationTreeNode[]
}

const kindLabels: Record<DrawnShape['kind'], string> = {
  point: '点',
  polyline: '线',
  polygon: '面',
  arrow: '箭头',
  text: '文本框'
}

function renderKindIcon(kind: DrawnShape['kind']): ReactNode {
  if (kind === 'point') return <EnvironmentOutlined className={styles.rowIcon} />
  if (kind === 'polyline') return <NodeIndexOutlined className={styles.rowIcon} />
  if (kind === 'polygon') return <GatewayOutlined className={styles.rowIcon} />
  if (kind === 'arrow') return <ArrowRightOutlined className={styles.rowIcon} />
  return <FontSizeOutlined className={styles.rowIcon} />
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
  const { message, modal } = App.useApp()
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
  const [draggingId, setDraggingId] = useState<string | null>(null)

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
        shapeKind: kind,
        isLeaf: true
      }
    }
    return entries.map(toTreeNode)
  }, [entries, shapes])

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
    if (!name) return
    if (folderDialogMode === 'create') {
      const id = addFolder(name, folderTargetId)
      if (!id) {
        void message.warning('文件夹最多嵌套 5 层')
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
    modal.confirm({
      title: `删除文件夹「${name}」？`,
      content: '其中的标注和子文件夹会移到上一级',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        removeFolder(id)
        setSelectedEntryKey((current) => (current === `folder:${id}` ? null : current))
      }
    })
  }

  function confirmRemoveShape(id: string, name: string): void {
    modal.confirm({
      title: `删除标注「${name}」？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        onRemove(id)
        setSelectedEntryKey((current) => (current === `shape:${id}` ? null : current))
      }
    })
  }

  const allowDrop: TreeProps<AnnotationTreeNode>['allowDrop'] = ({
    dragNode,
    dropNode,
    dropPosition
  }) => {
    if (String(dragNode.key) === String(dropNode.key)) return false
    return dropPosition !== 0 || dropNode.nodeType === 'folder'
  }

  const handleDrop: TreeProps<AnnotationTreeNode>['onDrop'] = (info) => {
    setDraggingId(null)
    const sourceKey = String(info.dragNode.key)
    const targetKey = String(info.node.key)
    const sourceId = sourceKey.slice(sourceKey.indexOf(':') + 1)
    const targetId = targetKey.slice(targetKey.indexOf(':') + 1)
    const relativePosition = info.dropPosition - Number(info.node.pos.split('-').at(-1) ?? 0)
    const placement = !info.dropToGap ? 'inside' : relativePosition < 0 ? 'before' : 'after'
    if (!moveEntry(sourceId, targetId, placement)) {
      void message.warning('无法移动到这里，文件夹最多嵌套 5 层')
      return
    }
    if (placement === 'inside') {
      setExpandedKeys((previous) => [...new Set([...previous, targetKey])])
    }
  }

  const handleDragStart: TreeProps<AnnotationTreeNode>['onDragStart'] = (info) => {
    const key = String(info.node.key)
    setDraggingId(key.slice(key.indexOf(':') + 1))
  }

  function dropAtTopLevel(): void {
    if (draggingId) moveEntry(draggingId, null, 'inside')
    setDraggingId(null)
  }

  const handleSelect: TreeProps<AnnotationTreeNode>['onSelect'] = (_keys, info) => {
    const key = String(info.node.key)
    setSelectedEntryKey(key)
    if (key.startsWith('shape:')) onFly(key.slice(6))
  }

  const selectedKeys = selectedEntryKey
    ? [selectedEntryKey]
    : selectedShapeId
      ? [`shape:${selectedShapeId}`]
      : []

  return (
    <>
      <Drawer
        open={open}
        placement="left"
        size={380}
        mask={false}
        closable={false}
        styles={{ body: { padding: '16px', position: 'relative' } }}
        title={
          <div className={styles.panelTitle}>
            <div>
              <div className={styles.panelKicker}>ANNOTATIONS</div>
              <h2 className={styles.panelHeading}>标注</h2>
            </div>
            <Button type="text" aria-label="关闭标注面板" icon={<CloseOutlined />} onClick={onClose} />
          </div>
        }
        onClose={onClose}
      >
        <div className={styles.panelActions}>
          <Button icon={<FolderAddOutlined />} onClick={() => openCreate(null)}>
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
          <div className={styles.treeWrap}>
            <Tree<AnnotationTreeNode>
              treeData={treeData}
              selectedKeys={selectedKeys}
              expandedKeys={expandedKeys}
              allowDrop={allowDrop}
              draggable
              blockNode
              onExpand={(keys) => setExpandedKeys(keys.map(String))}
              onSelect={handleSelect}
              onDragStart={handleDragStart}
              onDragEnd={() => setDraggingId(null)}
              onDrop={handleDrop}
              titleRender={(node) => {
                const actionsClass =
                  selectedEntryKey === node.key
                    ? `${styles.rowActions} ${styles.rowActionsVisible}`
                    : styles.rowActions
                if (node.nodeType === 'folder') {
                  return (
                    <div className={styles.treeRow}>
                      <FolderOutlined className={styles.rowIcon} />
                      <span className={styles.rowName} title={node.title}>
                        {node.title}
                      </span>
                      <span className={actionsClass}>
                        <Tooltip title="新建子文件夹">
                          <Button
                            type="text"
                            size="small"
                            className={styles.rowAction}
                            aria-label={`在 ${node.title} 中新建文件夹`}
                            icon={<FolderAddOutlined />}
                            onClick={(event) => {
                              event.stopPropagation()
                              openCreate(node.entryId)
                            }}
                          />
                        </Tooltip>
                        <Tooltip title="重命名文件夹">
                          <Button
                            type="text"
                            size="small"
                            className={styles.rowAction}
                            aria-label={`重命名 ${node.title}`}
                            icon={<EditOutlined />}
                            onClick={(event) => {
                              event.stopPropagation()
                              openRename(node.entryId, node.title)
                            }}
                          />
                        </Tooltip>
                        <Tooltip title="删除文件夹">
                          <Button
                            type="text"
                            size="small"
                            danger
                            className={styles.rowAction}
                            aria-label={`删除 ${node.title}`}
                            icon={<DeleteOutlined />}
                            onClick={(event) => {
                              event.stopPropagation()
                              confirmRemoveFolder(node.entryId, node.title)
                            }}
                          />
                        </Tooltip>
                      </span>
                    </div>
                  )
                }
                const shapeKind = node.shapeKind ?? 'point'
                return (
                  <div className={styles.treeRow}>
                    {renderKindIcon(shapeKind)}
                    <span className={styles.rowName} title={node.title}>
                      {node.title}
                    </span>
                    <Tag className={styles.shapeTag}>{kindLabels[shapeKind]}</Tag>
                    <span className={actionsClass}>
                      <Tooltip title="编辑标注">
                        <Button
                          type="text"
                          size="small"
                          className={styles.rowAction}
                          aria-label={`编辑 ${node.title}`}
                          icon={<EditOutlined />}
                          onClick={(event) => {
                            event.stopPropagation()
                            onEdit(node.entryId)
                          }}
                        />
                      </Tooltip>
                      <Tooltip title="删除标注">
                        <Button
                          type="text"
                          size="small"
                          danger
                          className={styles.rowAction}
                          aria-label={`删除 ${node.title}`}
                          icon={<DeleteOutlined />}
                          onClick={(event) => {
                            event.stopPropagation()
                            confirmRemoveShape(node.entryId, node.title)
                          }}
                        />
                      </Tooltip>
                    </span>
                  </div>
                )
              }}
            />
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
        okButtonProps={{ disabled: !folderName.trim() }}
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
