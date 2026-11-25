import { useState } from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  XIcon
} from 'lucide-react'
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  Modal,
  NumberInput,
  Popconfirm,
  TextArea,
  Tooltip
} from '@renderer/components/ui'
import { thematicLayerCatalog } from '@renderer/stores/climate'
import type { TeachingScene } from '../../../preload'
import styles from './SceneBookmarksPanel.module.css'

export interface SceneEditPayload {
  name: string
  narration: string
  dwellSeconds: number
}

export interface SceneBookmarksPanelProps {
  open: boolean
  scenes: TeachingScene[]
  saveError: string
  onClose: () => void
  onSave: (name: string, narration: string) => void
  onPreview: (id: string) => void
  onUpdate: (id: string, changes: SceneEditPayload) => void
  onRemove: (id: string) => void
  onMove: (id: string, offset: -1 | 1) => void
  onPlay: (mode: 'manual' | 'auto') => void
}

const layerNameOf = (id: string): string =>
  thematicLayerCatalog.find((layer) => layer.id === id)?.name ?? id

const narrationPreview = (scene: TeachingScene): string =>
  scene.narration.length > 42 ? `${scene.narration.slice(0, 42)}…` : scene.narration

const sceneTags = (scene: TeachingScene): string[] => {
  const names = scene.snapshot.overlays.slice(0, 2).map(layerNameOf)
  if (scene.snapshot.overlays.length > 2) names.push(`+${scene.snapshot.overlays.length - 2}`)
  return names
}

export function SceneBookmarksPanel({
  open,
  scenes,
  saveError,
  onClose,
  onSave,
  onPreview,
  onUpdate,
  onRemove,
  onMove,
  onPlay
}: SceneBookmarksPanelProps) {
  const [saveVisible, setSaveVisible] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveNarration, setSaveNarration] = useState('')
  const [editVisible, setEditVisible] = useState(false)
  const [editId, setEditId] = useState('')
  const [editName, setEditName] = useState('')
  const [editNarration, setEditNarration] = useState('')
  const [editDwellSeconds, setEditDwellSeconds] = useState<number>(6)

  const canPlay = scenes.length > 0

  function openSave(): void {
    setSaveName(`场景 ${scenes.length + 1}`)
    setSaveNarration('')
    setSaveVisible(true)
  }

  function confirmSave(): void {
    const name = saveName.trim()
    if (!name) return
    setSaveVisible(false)
    onSave(name, saveNarration.trim())
  }

  function openEdit(scene: TeachingScene): void {
    setEditId(scene.id)
    setEditName(scene.name)
    setEditNarration(scene.narration)
    setEditDwellSeconds(Math.round(scene.dwellMs / 1000))
    setEditVisible(true)
  }

  function confirmEdit(): void {
    const name = editName.trim()
    if (!name) return
    setEditVisible(false)
    onUpdate(editId, {
      name,
      narration: editNarration.trim(),
      dwellSeconds: Math.min(60, Math.max(1, editDwellSeconds ?? 6))
    })
  }

  return (
    <>
      <Drawer
        open={open}
        placement="right"
        size={360}
        bodyStyle={{ display: 'flex', flexDirection: 'column' }}
        title={
          <div className={styles.panelTitle}>
            <h2>教学场景</h2>
            <Button
              variant="ghost"
              size="sm"
              aria-label="关闭教学场景"
              icon={<XIcon className="size-4" />}
              onClick={onClose}
            />
          </div>
        }
        onClose={onClose}
      >
        <div className={styles.panelToolbar}>
          <Button variant="primary" block icon={<PlusIcon className="size-4" />} onClick={openSave}>
            保存当前画面为场景
          </Button>
          {saveError && <Alert type="error" showIcon title={saveError} className={styles.panelAlert} />}
        </div>
        <div className={styles.sceneList}>
          {!scenes.length ? (
            <div className={styles.sceneEmpty}>
              <Empty description="还没有教学场景">
                <span className={styles.sceneEmptyHint}>将当前视角与图层保存为场景，方便课堂播放。</span>
              </Empty>
            </div>
          ) : (
            scenes.map((scene, index) => {
              const tags = sceneTags(scene)
              return (
                <div key={scene.id} className={styles.sceneItem}>
                  <div className={styles.sceneItemMain} onDoubleClick={() => openEdit(scene)}>
                    <div className={styles.sceneItemTitle}>
                      <span className={styles.sceneOrder}>{index + 1}</span>
                      <span className={styles.sceneName}>{scene.name}</span>
                    </div>
                    {tags.length > 0 && (
                      <div className={styles.sceneTags}>
                        {tags.map((tag) => (
                          <span key={tag} className={styles.sceneTag}>
                            {tag}
                          </span>
                        ))}
                        {scene.snapshot.simTime && <span className={styles.sceneTagTime}>昼夜模拟</span>}
                      </div>
                    )}
                    {scene.narration && <div className={styles.sceneNarration}>{narrationPreview(scene)}</div>}
                    <div className={styles.sceneMeta}>
                      停留 {Math.round(scene.dwellMs / 1000)} 秒 · {Math.round(scene.flyDurationMs / 1000)} 秒飞行
                    </div>
                  </div>
                  <div className={styles.sceneItemActions}>
                    <Tooltip title="预览此场景">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={styles.sceneAction}
                        aria-label="预览此场景"
                        icon={<EyeIcon className="size-3.5" />}
                        onClick={() => onPreview(scene.id)}
                      />
                    </Tooltip>
                    <Tooltip title="编辑">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={styles.sceneAction}
                        aria-label="编辑场景"
                        icon={<PencilIcon className="size-3.5" />}
                        onClick={() => openEdit(scene)}
                      />
                    </Tooltip>
                    <Tooltip title="上移">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={styles.sceneAction}
                        disabled={index === 0}
                        aria-label="上移场景"
                        icon={<ArrowUpIcon className="size-3.5" />}
                        onClick={() => onMove(scene.id, -1)}
                      />
                    </Tooltip>
                    <Tooltip title="下移">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={styles.sceneAction}
                        disabled={index === scenes.length - 1}
                        aria-label="下移场景"
                        icon={<ArrowDownIcon className="size-3.5" />}
                        onClick={() => onMove(scene.id, 1)}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="删除此场景？"
                      okText="删除"
                      okDanger
                      cancelText="取消"
                      onConfirm={() => onRemove(scene.id)}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className={styles.sceneAction}
                        aria-label="删除场景"
                        icon={<XIcon className="size-3.5" />}
                      />
                    </Popconfirm>
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div className={styles.panelFooter}>
          <Button
            variant="primary"
            className={styles.footerButton}
            disabled={!canPlay}
            icon={<PlayIcon className="size-4" />}
            onClick={() => onPlay('manual')}
          >
            逐幕播放
          </Button>
          <Button className={styles.footerButton} disabled={!canPlay} onClick={() => onPlay('auto')}>
            自动播放
          </Button>
        </div>
      </Drawer>
      <Modal
        open={saveVisible}
        title="保存教学场景"
        okText="保存"
        cancelText="取消"
        onOk={confirmSave}
        onCancel={() => setSaveVisible(false)}
      >
        <div className={styles.field}>
          <span className={styles.fieldLabel}>场景名称</span>
          <Input
            value={saveName}
            placeholder="如：全球气压带与风带"
            maxLength={80}
            onChange={(event) => setSaveName(event.target.value)}
            onPressEnter={confirmSave}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>旁白字幕（可选）</span>
          <TextArea
            value={saveNarration}
            placeholder="播放时显示在画面下方的讲解词"
            rows={3}
            maxLength={500}
            showCount
            onChange={(event) => setSaveNarration(event.target.value)}
          />
        </div>
      </Modal>
      <Modal
        open={editVisible}
        title="编辑场景"
        okText="保存"
        cancelText="取消"
        onOk={confirmEdit}
        onCancel={() => setEditVisible(false)}
      >
        <div className={styles.field}>
          <span className={styles.fieldLabel}>场景名称</span>
          <Input
            value={editName}
            maxLength={80}
            onChange={(event) => setEditName(event.target.value)}
            onPressEnter={confirmEdit}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>旁白字幕</span>
          <TextArea
            value={editNarration}
            rows={3}
            maxLength={500}
            showCount
            onChange={(event) => setEditNarration(event.target.value)}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>每幕停留（秒）</span>
          <NumberInput
            value={editDwellSeconds}
            min={1}
            max={60}
            className={styles.dwellInput}
            aria-label="每幕停留秒数"
            onChange={(value) => setEditDwellSeconds(typeof value === 'number' ? value : 6)}
          />
        </div>
      </Modal>
    </>
  )
}

export default SceneBookmarksPanel
