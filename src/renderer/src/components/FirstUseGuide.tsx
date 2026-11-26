import { Button, Checkbox } from '@renderer/components/ui'
import { computeGuideCardPosition } from '@renderer/lib/guidePosition'
import type { GuidePlacement, GuideRectBox } from '@renderer/lib/guidePosition'
import { XIcon } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { ReactNode, Ref } from 'react'
import { createPortal } from 'react-dom'

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
  placement: GuidePlacement
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const DEFAULT_CARD_WIDTH = 340
const DEFAULT_CARD_HEIGHT = 176

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
    // Best effort, so the failure is ignored.
  }
}

function getTargetElement(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-guide-target="${name}"]`)
}

function waitNextFrame(): Promise<void> {
  return new Promise(resolve => {
    window.requestAnimationFrame(() => resolve())
  })
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    element => element.getClientRects().length > 0
  )
}

export function FirstUseGuide({ ready, onStepChange, ref }: FirstUseGuideProps) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(0)
  const [dontPromptAgain, setDontPromptAgain] = useState(true)
  const [targetRect, setTargetRect] = useState<GuideRectBox | null>(null)
  const [cardSize, setCardSize] = useState({
    width: DEFAULT_CARD_WIDTH,
    height: DEFAULT_CARD_HEIGHT
  })
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight
  }))

  const cardRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
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
          <div className='grid gap-3'>
            <div>在这里添加 AI 服务商、密钥和模型并设为默认，即可开始对话。</div>
            <Checkbox
              checked={dontPromptAgain}
              onChange={checked => {
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
    if (!openRef.current) {
      return
    }
    const step = steps[currentRef.current]
    if (!step) {
      return
    }
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
    if (!open) {
      return
    }
    const handleViewportResize = (): void => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      measureTarget()
    }
    handleViewportResize()
    const timer = window.setTimeout(measureTarget, 220)
    window.addEventListener('resize', handleViewportResize)
    window.addEventListener('scroll', measureTarget, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', handleViewportResize)
      window.removeEventListener('scroll', measureTarget, true)
    }
  }, [open, current, measureTarget])

  useLayoutEffect(() => {
    if (!open) {
      return
    }
    const card = cardRef.current
    if (!card) {
      return
    }
    const measureCard = (): void => {
      const rect = card.getBoundingClientRect()
      const nextWidth = Math.round(rect.width) || DEFAULT_CARD_WIDTH
      const nextHeight = Math.round(rect.height) || DEFAULT_CARD_HEIGHT
      setCardSize(previous =>
        previous.width === nextWidth && previous.height === nextHeight
          ? previous
          : { width: nextWidth, height: nextHeight }
      )
    }
    measureCard()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measureCard)
    observer.observe(card)
    return () => observer.disconnect()
  }, [open, current])

  async function handleChange(nextStep: number): Promise<void> {
    if (transitioningRef.current) {
      return
    }
    transitioningRef.current = true
    onStepChangeRef.current?.(nextStep)
    await waitNextFrame()
    if ([6, 7, 8].includes(nextStep) || [6, 7, 8].includes(currentRef.current)) {
      await new Promise(resolve => {
        window.setTimeout(resolve, 320)
      })
    }
    if (!unmountedRef.current) {
      currentRef.current = nextStep
      setCurrent(nextStep)
      await waitNextFrame()
      measureTarget()
    }
    transitioningRef.current = false
  }

  const savePreference = useCallback((value: boolean): void => {
    dontPromptAgainRef.current = value
    setDontPromptAgain(value)
    void window.guEarth.settings.update({ setupGuideDismissed: value }).catch(() => {})
  }, [])

  const handleClose = useCallback((): void => {
    openRef.current = false
    setOpen(false)
    queueMicrotask(() => {
      if (!unmountedRef.current && !finishedThisCycleRef.current) {
        savePreference(true)
      }
    })
  }, [savePreference])

  const handleFinish = useCallback((): void => {
    finishedThisCycleRef.current = true
    openRef.current = false
    setOpen(false)
    savePreference(dontPromptAgainRef.current)
  }, [savePreference])

  useEffect(() => {
    async function checkFirstUse(): Promise<void> {
      if (!readyRef.current || autoPromptCheckedRef.current) {
        return
      }
      autoPromptCheckedRef.current = true
      try {
        const settings = await window.guEarth.settings.get()
        if (unmountedRef.current) {
          return
        }
        if (settings.setupGuideDismissed !== null) {
          dontPromptAgainRef.current = settings.setupGuideDismissed
          setDontPromptAgain(settings.setupGuideDismissed)
          if (!settings.setupGuideDismissed && readyRef.current && !openRef.current) {
            start()
          }
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
        if (readyRef.current && !openRef.current) {
          start()
        }
      } catch {
        if (unmountedRef.current) {
          return
        }
        dontPromptAgainRef.current = true
        setDontPromptAgain(true)
        if (readyRef.current && !openRef.current) {
          start()
        }
      }
    }

    void checkFirstUse()
  }, [ready, start])

  useEffect(() => {
    if (!open) {
      return
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    cardRef.current?.focus({ preventScroll: true })
    return () => {
      const previous = previousFocusRef.current
      previousFocusRef.current = null
      if (previous?.isConnected) {
        previous.focus({ preventScroll: true })
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const card = cardRef.current
    if (!card) {
      return
    }
    if (!card.contains(document.activeElement)) {
      card.focus({ preventScroll: true })
    }
  }, [open, current])

  useEffect(() => {
    if (!open) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
        return
      }
      if (event.key !== 'Tab') {
        return
      }
      const card = cardRef.current
      if (!card) {
        return
      }
      const focusables = getFocusableElements(card)
      if (focusables.length === 0) {
        event.preventDefault()
        card.focus({ preventScroll: true })
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (!(active instanceof HTMLElement) || !card.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus({ preventScroll: true })
        return
      }
      if (event.shiftKey) {
        if (active === first || active === card) {
          event.preventDefault()
          last.focus({ preventScroll: true })
        }
      } else if (active === last) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleClose])

  if (!open || typeof document === 'undefined') {
    return null
  }

  const { top: cardTop, left: cardLeft } = computeGuideCardPosition(
    targetRect,
    activeStep.placement,
    cardSize.width,
    cardSize.height,
    viewport.width,
    viewport.height
  )

  const isLast = current >= steps.length - 1

  return createPortal(
    <div
      className='fixed inset-0 z-[1400]'
      role='dialog'
      aria-modal='true'
      aria-label={activeStep.title}
    >
      <svg className='pointer-events-auto fixed inset-0 h-full w-full' aria-hidden='true'>
        <defs>
          <mask id='guearth-guide-spotlight'>
            <rect x='0' y='0' width='100%' height='100%' fill='white' />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx='10'
                fill='black'
              />
            )}
          </mask>
        </defs>
        <rect
          x='0'
          y='0'
          width='100%'
          height='100%'
          fill='rgba(0, 0, 0, 0.48)'
          mask='url(#guearth-guide-spotlight)'
        />
      </svg>

      {targetRect && (
        <div
          aria-hidden='true'
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height
          }}
          className='pointer-events-none fixed rounded-[10px] ring-2 ring-white/80'
        />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        style={{ top: cardTop, left: cardLeft, width: DEFAULT_CARD_WIDTH }}
        className='border-hairline bg-elevated text-ink fixed flex flex-col gap-3 rounded-2xl border p-4 shadow-[var(--shadow-dialog)] outline-none'
      >
        <div className='flex items-start justify-between gap-2'>
          <div className='text-ink text-[14px] leading-5 font-semibold'>{activeStep.title}</div>
          <Button
            variant='ghost'
            size='sm'
            aria-label='关闭引导'
            icon={<XIcon className='size-3.5' />}
            onClick={handleClose}
          />
        </div>
        <div className='text-ink-secondary text-[13px] leading-5'>{activeStep.description}</div>
        <div className='flex items-center justify-between pt-1'>
          <span className='text-ink-tertiary font-mono text-[12px]'>
            {current + 1} / {steps.length}
          </span>
          <div className='flex items-center gap-2'>
            {current > 0 && (
              <Button size='sm' onClick={() => void handleChange(current - 1)}>
                上一步
              </Button>
            )}
            <Button
              size='sm'
              variant='primary'
              onClick={() => {
                if (isLast) {
                  handleFinish()
                } else {
                  void handleChange(current + 1)
                }
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
