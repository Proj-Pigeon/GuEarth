import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref
} from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from 'lucide-react'
import { Button, Checkbox } from '@renderer/components/ui'

export interface FirstUseGuideHandle {
  start: () => void
}

export interface FirstUseGuideProps {
  ready: boolean
  onStepChange?: (step: number) => void
  ref?: Ref<FirstUseGuideHandle>
}

interface GuideStep {
  title: string
  description: ReactNode
  targetName: string
  placement: 'top' | 'bottom' | 'bottomLeft' | 'left'
}

interface RectBox {
  top: number
  left: number
  width: number
  height: number
}

const legacyCompletedKey = 'guearth.first-use-guide.completed.v1'

function readLegacyCompletion(): boolean {
  try {
    return window.localStorage.getItem(legacyCompletedKey) === 'true'
  } catch {
    return false
  }
}

function clearLegacyCompletion(): void {
  try {
    window.localStorage.removeItem(legacyCompletedKey)
  } catch {
    return
  }
}

function getTargetElement(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-guide-target="${name}"]`)
}

function waitNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function FirstUseGuide({ ready, onStepChange, ref }: FirstUseGuideProps) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(0)
  const [dontPromptAgain, setDontPromptAgain] = useState(true)
  const [targetRect, setTargetRect] = useState<RectBox | null>(null)

  const openRef = useRef(open)
  openRef.current = open
  const currentRef = useRef(current)
  currentRef.current = current
  const dontPromptAgainRef = useRef(dontPromptAgain)
  dontPromptAgainRef.current = dontPromptAgain
  const readyRef = useRef(ready)
  readyRef.current = ready
  const onStepChangeRef = useRef(onStepChange)
  onStepChangeRef.current = onStepChange

  const transitioningRef = useRef(false)
  const autoPromptCheckedRef = useRef(false)
  const finishedThisCycleRef = useRef(false)
  const unmountedRef = useRef(false)

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
    }
  }, [])

  const start = useCallback((): void => {
    finishedThisCycleRef.current = false
    currentRef.current = 0
    openRef.current = true
    setCurrent(0)
    setOpen(true)
    onStepChangeRef.current?.(0)
  }, [])

  useImperativeHandle(ref, () => ({ start }), [start])

  const steps = useMemo<GuideStep[]>(
    () => [
      {
        title: '初始视角，重新认识地球',
        description: '回到默认全球视角。',
        targetName: 'home',
        placement: 'top'
      },
      {
        title: '地图与地形图层',
        description: '切换地图样式、3D 地形与太阳光照。',
        targetName: 'layers',
        placement: 'top'
      },
      {
        title: '地理实验室',
        description: '打开太阳、大气、水文、地貌等教学实验与专题图层。',
        targetName: 'lab',
        placement: 'top'
      },
      {
        title: '标注管理',
        description: '查看、编辑并定位已保存的标注。',
        targetName: 'annotations',
        placement: 'top'
      },
      {
        title: '绘制与清除',
        description: '绘制点、线、面、箭头和文字，支持测距与测面积。',
        targetName: 'drawing-tools',
        placement: 'top'
      },
      {
        title: '搜索地点',
        description: '输入地名快速定位并飞往目标位置。',
        targetName: 'place-search',
        placement: 'bottomLeft'
      },
      {
        title: '配置地图搜索密钥',
        description: '在此填写高德或百度地图密钥并保存，即可启用地点搜索。',
        targetName: 'map-credentials',
        placement: 'left'
      },
      {
        title: 'EOQ 智能助手',
        description: '点击打开 EOQ 地理教学助手。',
        targetName: 'assistant',
        placement: 'top'
      },
      {
        title: '配置 AI 模型',
        description: (
          <div className="grid gap-3">
            <div>在这里添加 AI 服务商、密钥和模型并设为默认，即可开始对话。</div>
            <Checkbox
              checked={dontPromptAgain}
              onChange={(checked) => {
                dontPromptAgainRef.current = checked
                setDontPromptAgain(checked)
              }}
            >
              下次不再提示
            </Checkbox>
          </div>
        ),
        targetName: 'ai-provider-settings',
        placement: 'bottom'
      }
    ],
    [dontPromptAgain]
  )

  const activeStep = steps[current] ?? steps[0]

  const measureTarget = useCallback(() => {
    if (!openRef.current) return
    const step = steps[currentRef.current]
    if (!step) return
    const element = getTargetElement(step.targetName)
    if (!element) {
      setTargetRect(null)
      return
    }
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      setTargetRect(null)
      return
    }
    setTargetRect({
      top: rect.top - 6,
      left: rect.left - 6,
      width: rect.width + 12,
      height: rect.height + 12
    })
  }, [steps])

  useEffect(() => {
    if (!open) return
    measureTarget()
    const timer = window.setTimeout(measureTarget, 220)
    window.addEventListener('resize', measureTarget)
    window.addEventListener('scroll', measureTarget, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', measureTarget)
      window.removeEventListener('scroll', measureTarget, true)
    }
  }, [open, current, measureTarget])

  async function handleChange(nextStep: number): Promise<void> {
    if (transitioningRef.current) return
    transitioningRef.current = true
    onStepChangeRef.current?.(nextStep)
    await waitNextFrame()
    if ([6, 7, 8].includes(nextStep) || [6, 7, 8].includes(currentRef.current)) {
      await new Promise((resolve) => window.setTimeout(resolve, 320))
    }
    if (!unmountedRef.current) {
      currentRef.current = nextStep
      setCurrent(nextStep)
      await waitNextFrame()
      measureTarget()
    }
    transitioningRef.current = false
  }

  function savePreference(value: boolean): void {
    dontPromptAgainRef.current = value
    setDontPromptAgain(value)
    void window.guEarth.settings.update({ setupGuideDismissed: value }).catch(() => undefined)
  }

  function handleClose(): void {
    openRef.current = false
    setOpen(false)
    queueMicrotask(() => {
      if (!unmountedRef.current && !finishedThisCycleRef.current) {
        savePreference(true)
      }
    })
  }

  function handleFinish(): void {
    finishedThisCycleRef.current = true
    openRef.current = false
    setOpen(false)
    savePreference(dontPromptAgainRef.current)
  }

  useEffect(() => {
    async function checkFirstUse(): Promise<void> {
      if (!readyRef.current || autoPromptCheckedRef.current) return
      autoPromptCheckedRef.current = true
      try {
        const settings = await window.guEarth.settings.get()
        if (unmountedRef.current) return
        if (settings.setupGuideDismissed !== null) {
          dontPromptAgainRef.current = settings.setupGuideDismissed
          setDontPromptAgain(settings.setupGuideDismissed)
          if (!settings.setupGuideDismissed && readyRef.current && !openRef.current) start()
          return
        }
        if (readLegacyCompletion()) {
          dontPromptAgainRef.current = true
          setDontPromptAgain(true)
          try {
            await window.guEarth.settings.update({ setupGuideDismissed: true })
          } catch {
            return
          }
          clearLegacyCompletion()
          return
        }
        dontPromptAgainRef.current = true
        setDontPromptAgain(true)
        if (readyRef.current && !openRef.current) start()
      } catch {
        if (unmountedRef.current) return
        dontPromptAgainRef.current = true
        setDontPromptAgain(true)
        if (readyRef.current && !openRef.current) start()
      }
    }

    void checkFirstUse()
  }, [ready, start])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const cardWidth = 340
  const cardHeight = 176
  const vw = window.innerWidth
  const vh = window.innerHeight

  let cardTop = Math.round((vh - cardHeight) / 2)
  let cardLeft = Math.round((vw - cardWidth) / 2)

  if (targetRect) {
    if (activeStep.placement === 'top') {
      cardTop = targetRect.top - cardHeight - 14
      cardLeft = targetRect.left + targetRect.width / 2 - cardWidth / 2
    } else if (activeStep.placement === 'bottomLeft') {
      cardTop = targetRect.top + targetRect.height + 14
      cardLeft = targetRect.left
    } else if (activeStep.placement === 'left') {
      cardTop = targetRect.top + targetRect.height / 2 - cardHeight / 2
      cardLeft = targetRect.left - cardWidth - 14
    } else {
      cardTop = targetRect.top + targetRect.height + 14
      cardLeft = targetRect.left + targetRect.width / 2 - cardWidth / 2
    }
    cardTop = clamp(cardTop, 16, Math.max(16, vh - cardHeight - 16))
    cardLeft = clamp(cardLeft, 16, Math.max(16, vw - cardWidth - 16))
  }

  const isLast = current >= steps.length - 1

  return createPortal(
    <div className="fixed inset-0 z-[1400]" role="dialog" aria-modal="true" aria-label={activeStep.title}>
      <svg className="pointer-events-auto fixed inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <mask id="guearth-guide-spotlight">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="10"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.48)"
          mask="url(#guearth-guide-spotlight)"
        />
      </svg>

      {targetRect && (
        <div
          aria-hidden="true"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height
          }}
          className="pointer-events-none fixed rounded-[10px] ring-2 ring-white/80"
        />
      )}

      <div
        style={{ top: cardTop, left: cardLeft, width: cardWidth }}
        className="fixed flex flex-col gap-3 rounded-2xl border border-hairline bg-elevated p-4 text-ink shadow-[var(--shadow-dialog)]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="text-[14px] leading-5 font-semibold text-ink">{activeStep.title}</div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="关闭引导"
            icon={<XIcon className="size-3.5" />}
            onClick={handleClose}
          />
        </div>
        <div className="text-[13px] leading-5 text-ink-secondary">{activeStep.description}</div>
        <div className="flex items-center justify-between pt-1">
          <span className="font-mono text-[12px] text-ink-tertiary">
            {current + 1} / {steps.length}
          </span>
          <div className="flex items-center gap-2">
            {current > 0 && (
              <Button size="sm" onClick={() => void handleChange(current - 1)}>
                上一步
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                if (isLast) handleFinish()
                else void handleChange(current + 1)
              }}
            >
              {isLast ? '完成' : '下一步'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default FirstUseGuide
