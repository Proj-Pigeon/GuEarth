import { useEffect, useMemo, useState } from 'react'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Button, Input, Popconfirm, Spinner, Switch, Tag, useToast } from '@renderer/components/ui'
import type { AgentMemory } from '../../../preload'
import { useAiStore } from '@renderer/stores/ai'
import styles from './MemorySettings.module.css'

export interface MemorySettingsProps {
  active: boolean
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' })
}

export function MemorySettings({ active }: MemorySettingsProps) {
  const toast = useToast()
  const memoryEnabled = useAiStore((state) => state.settings.memoryEnabled)
  const setMemoryEnabled = useAiStore((state) => state.setMemoryEnabled)

  const [memories, setMemories] = useState<AgentMemory[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [switchBusy, setSwitchBusy] = useState(false)

  const sortedMemories = useMemo(() => [...memories].reverse(), [memories])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setLoading(true)
    window.guEarth.ai.memory
      .list()
      .then((list) => {
        if (!cancelled) setMemories(list)
      })
      .catch(() => {
        if (!cancelled) toast.error('无法读取记忆列表，请重试')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active, toast])

  async function addMemory(): Promise<void> {
    const content = draft.trim()
    if (!content || adding) return
    setAdding(true)
    try {
      const next = await window.guEarth.ai.memory.add(content)
      setMemories(next)
      setDraft('')
      toast.success('已添加记忆')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '记忆添加失败')
    } finally {
      setAdding(false)
    }
  }

  async function removeMemory(memory: AgentMemory): Promise<void> {
    try {
      const next = await window.guEarth.ai.memory.delete(memory.id)
      setMemories(next)
      toast.success('已删除记忆')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '记忆删除失败')
    }
  }

  async function toggleEnabled(value: boolean): Promise<void> {
    if (switchBusy) return
    setSwitchBusy(true)
    try {
      await setMemoryEnabled(value)
      toast.success(value ? '记忆功能已开启' : '记忆功能已关闭')
    } catch {
      toast.error('设置保存失败，请重试')
    } finally {
      setSwitchBusy(false)
    }
  }

  return (
    <section className={styles.memorySettings}>
      <div className={styles.memoryToggle}>
        <div>
          <div className={styles.memoryToggleTitle}>记忆功能</div>
          <p className={styles.memoryToggleDesc}>自动记住你的个性偏好</p>
        </div>
        <Switch
          checked={memoryEnabled}
          loading={switchBusy}
          aria-label="记忆功能开关"
          onChange={(value) => void toggleEnabled(value)}
        />
      </div>

      <div className={styles.memoryAdd}>
        <Input
          value={draft}
          className={styles.memoryInput}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="添加偏好，如：我是高中地理老师，喜欢结合案例讲解"
          maxLength={300}
          onPressEnter={() => void addMemory()}
        />
        <Button
          variant="primary"
          loading={adding}
          disabled={!draft.trim()}
          icon={<PlusIcon className="size-3.5" />}
          onClick={() => void addMemory()}
        >
          添加
        </Button>
      </div>

      <Spinner spinning={loading}>
        {sortedMemories.length === 0 && !loading ? (
          <div className={styles.memoryEmpty}>暂无记录</div>
        ) : (
          <ul className={styles.memoryList}>
            {sortedMemories.map((memory) => (
              <li key={memory.id} className={styles.memoryItem}>
                <div className={styles.memoryItemBody}>
                  <p className={styles.memoryItemContent}>{memory.content}</p>
                  <div className={styles.memoryItemMeta}>
                    <Tag tone={memory.source === 'agent' ? 'info' : 'neutral'}>
                      {memory.source === 'agent' ? '助手保存' : '手动添加'}
                    </Tag>
                    <span className={styles.memoryItemTime}>{formatTime(memory.createdAt)}</span>
                  </div>
                </div>
                <Popconfirm
                  title="删除这条记忆？"
                  okText="删除"
                  okDanger
                  cancelText="取消"
                  onConfirm={() => void removeMemory(memory)}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    danger
                    icon={<Trash2Icon className="size-3.5" />}
                    aria-label={`删除记忆 ${memory.content.slice(0, 12)}`}
                  />
                </Popconfirm>
              </li>
            ))}
          </ul>
        )}
      </Spinner>
      {sortedMemories.length > 0 && (
        <div className={styles.memoryCount}>共 {sortedMemories.length} 条记忆，上限 100 条</div>
      )}
    </section>
  )
}

export default MemorySettings
