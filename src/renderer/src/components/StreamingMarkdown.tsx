import {
  createStreamingDelayState,
  renderMarkdown,
  renderStreamingMarkdown,
  resetStreamingDelayState,
  settleStreamingDelayState,
  type StreamingDelayState
} from '@renderer/utils/markdown'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import styles from './StreamingMarkdown.module.css'

const STREAM_RENDER_INTERVAL_MS = 50
const STREAM_IDLE_SETTLE_MS = 260

export interface StreamingMarkdownProps {
  text: string
  streaming?: boolean
  onRendered?: () => void
}

export function StreamingMarkdown({ text, streaming = false, onRendered }: StreamingMarkdownProps) {
  const delayStateRef = useRef<StreamingDelayState | null>(null)
  if (delayStateRef.current === null) {
    delayStateRef.current = createStreamingDelayState()
  }

  const latestPropsRef = useRef({ text, streaming })
  latestPropsRef.current = { text, streaming }

  const onRenderedRef = useRef(onRendered)
  onRenderedRef.current = onRendered

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const settledRef = useRef(false)
  const prevPropsRef = useRef<{ text: string; streaming: boolean } | null>(null)

  const [nodes, setNodes] = useState<ReactNode[]>(() => {
    const delayState = delayStateRef.current!
    return streaming ? renderStreamingMarkdown(text, delayState) : renderMarkdown(text)
  })
  const hasNodesRef = useRef(nodes.length > 0)

  function clearTimers(): void {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
    if (settleTimerRef.current !== undefined) {
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = undefined
    }
  }

  function settle(): void {
    settleTimerRef.current = undefined
    const current = latestPropsRef.current
    if (!current.streaming) return
    settledRef.current = true
    settleStreamingDelayState(delayStateRef.current!, current.text)
    const nextNodes = renderMarkdown(current.text)
    hasNodesRef.current = nextNodes.length > 0
    setNodes(nextNodes)
  }

  function renderNow(): void {
    clearTimers()
    settledRef.current = false
    const current = latestPropsRef.current
    const delayState = delayStateRef.current!
    if (!current.streaming) {
      resetStreamingDelayState(delayState)
      const nextNodes = renderMarkdown(current.text)
      hasNodesRef.current = nextNodes.length > 0
      setNodes(nextNodes)
    } else {
      const nextNodes = renderStreamingMarkdown(current.text, delayState)
      hasNodesRef.current = nextNodes.length > 0
      setNodes(nextNodes)
      if (current.text) {
        settleTimerRef.current = setTimeout(settle, STREAM_IDLE_SETTLE_MS)
      }
    }
    onRenderedRef.current?.()
  }

  useLayoutEffect(() => {
    const previous = prevPropsRef.current
    if (previous === null) {
      prevPropsRef.current = { text, streaming }
      if (streaming && text) {
        settleTimerRef.current = setTimeout(settle, STREAM_IDLE_SETTLE_MS)
      }
      onRenderedRef.current?.()
      return
    }
    if (previous.text === text && previous.streaming === streaming) {
      if (streaming && text && !settledRef.current && settleTimerRef.current === undefined) {
        settleTimerRef.current = setTimeout(settle, STREAM_IDLE_SETTLE_MS)
      }
      return
    }
    prevPropsRef.current = { text, streaming }
    if (!streaming || !hasNodesRef.current || settledRef.current) {
      renderNow()
    } else if (timerRef.current === undefined) {
      timerRef.current = setTimeout(renderNow, STREAM_RENDER_INTERVAL_MS)
    }
  }, [text, streaming])

  useLayoutEffect(() => {
    return () => {
      clearTimers()
    }
  }, [])

  return <div className={`answer-text ${styles.answerText}`}>{nodes}</div>
}

export default StreamingMarkdown
