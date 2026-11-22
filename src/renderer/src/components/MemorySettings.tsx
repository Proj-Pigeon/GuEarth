import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useAiStore } from '@renderer/stores/ai'
import { App as AntdApp, Button, Input, Popconfirm, Spin, Switch, Tag } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import type { AgentMemory } from '../../../preload'

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
  const { message } = AntdApp.useApp()
  const memoryEnabled = useAiStore(state => state.settings.memoryEnabled)
  const setMemoryEnabled = useAiStore(state => state.setMemoryEnabled)

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
      .then(list => {
        if (!cancelled) setMemories(list)
      })
      .catch(() => {
        if (!cancelled) message.error('无法读取记忆列表，请重试')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active, message])

  async function addMemory(): Promise<void> {
    const content = draft.trim()
    if (!content || adding) return
    setAdding(true)
    try {
      const next = await window.guEarth.ai.memory.add(content)
      setMemories(next)
      setDraft('')
      message.success('已添加记忆')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '记忆添加失败')
    } finally {
      setAdding(false)
    }
  }

  async function removeMemory(memory: AgentMemory): Promise<void> {
    try {
      const next = await window.guEarth.ai.memory.delete(memory.id)
      setMemories(next)
      message.success('已删除记忆')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '记忆删除失败')
    }
  }

  async function toggleEnabled(value: boolean): Promise<void> {
    if (switchBusy) return
    setSwitchBusy(true)
    try {
      await setMemoryEnabled(value)
      message.success(value ? '记忆功能已开启' : '记忆功能已关闭')
    } catch {
      message.error('设置保存失败，请重试')
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
          aria-label='记忆功能开关'
          onChange={value => void toggleEnabled(value)}
        />
      </div>

      <div className={styles.memoryAdd}>
        <Input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder='添加偏好，如：我是高中地理老师，喜欢结合案例讲解'
          maxLength={300}
          onPressEnter={() => void addMemory()}
        />
        <Button
          type='primary'
          loading={adding}
          disabled={!draft.trim()}
          icon={<PlusOutlined />}
          onClick={() => void addMemory()}
        >
          添加
        </Button>
      </div>

      <Spin spinning={loading}>
        {sortedMemories.length === 0 && !loading ? (
          <div className={styles.memoryEmpty}>暂无记录</div>
        ) : (
          <ul className={styles.memoryList}>
            {sortedMemories.map(memory => (
              <li key={memory.id} className={styles.memoryItem}>
                <div className={styles.memoryItemBody}>
                  <p className={styles.memoryItemContent}>{memory.content}</p>
                  <div className={styles.memoryItemMeta}>
                    <Tag
                      color={memory.source === 'agent' ? 'blue' : 'green'}
                      className={styles.memoryItemTag}
                    >
                      {memory.source === 'agent' ? '助手保存' : '手动添加'}
                    </Tag>
                    <span className={styles.memoryItemTime}>{formatTime(memory.createdAt)}</span>
                  </div>
                </div>
                <Popconfirm
                  title='删除这条记忆？'
                  okText='删除'
                  cancelText='取消'
                  onConfirm={() => void removeMemory(memory)}
                >
                  <Button
                    type='text'
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`删除记忆 ${memory.content.slice(0, 12)}`}
                  />
                </Popconfirm>
              </li>
            ))}
          </ul>
        )}
      </Spin>
      {sortedMemories.length > 0 && (
        <div className={styles.memoryCount}>共 {sortedMemories.length} 条记忆，上限 100 条</div>
      )}
    </section>
  )
}

export default MemorySettings
