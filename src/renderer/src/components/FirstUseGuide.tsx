import { Checkbox, ConfigProvider, Tour, type ConfigProviderProps, type TourProps } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref
} from 'react'

export interface FirstUseGuideHandle {
  start: () => void
}

export interface FirstUseGuideProps {
  ready: boolean
  onStepChange?: (step: number) => void
  ref?: Ref<FirstUseGuideHandle>
}

const legacyCompletedKey = 'guearth.first-use-guide.completed.v1'

const guideLocale: NonNullable<ConfigProviderProps['locale']> = {
  ...zhCN,
  Tour: {
    Next: zhCN.Tour?.Next ?? '下一步',
    Previous: zhCN.Tour?.Previous ?? '上一步',
    Finish: '完成'
  }
}

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

function getTarget(name: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-guide-target="${name}"]`) ?? document.body
}

function waitNextFrame(): Promise<void> {
  return new Promise(resolve => {
    window.requestAnimationFrame(() => resolve())
  })
}

export function FirstUseGuide({ ready, onStepChange, ref }: FirstUseGuideProps) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(0)
  const [dontPromptAgain, setDontPromptAgain] = useState(true)

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

  const steps = useMemo<NonNullable<TourProps['steps']>>(
    () => [
      {
        title: '初始视角，重新认识地球🌏',
        description: '回到默认全球视角。',
        target: () => getTarget('home'),
        placement: 'top'
      },
      {
        title: '地图与地形图层🗺️',
        description: '切换地图样式、3D 地形与太阳光照。',
        target: () => getTarget('layers'),
        placement: 'top'
      },
      {
        title: '地理实验室🧪',
        description: '打开太阳、大气、水文、地貌等教学实验与专题图层。',
        target: () => getTarget('lab'),
        placement: 'top'
      },
      {
        title: '标注管理📌',
        description: '查看、编辑并定位已保存的标注。',
        target: () => getTarget('annotations'),
        placement: 'top'
      },
      {
        title: '绘制与清除✏️',
        description: '绘制点、线、面、箭头和文字，支持测距与测面积。',
        target: () => getTarget('drawing-tools'),
        placement: 'top'
      },
      {
        title: '搜索地点🔎',
        description: '输入地名快速定位并飞往目标位置。',
        target: () => getTarget('place-search'),
        placement: 'bottomLeft'
      },
      {
        title: '配置地图搜索密钥🔑',
        description: '在此填写高德或百度地图密钥并保存，即可启用地点搜索。',
        target: () => getTarget('map-credentials'),
        placement: 'left'
      },
      {
        title: 'EOQ 智能助手🤖',
        description: '点击打开 EOQ 地理教学助手。',
        target: () => getTarget('assistant'),
        placement: 'top'
      },
      {
        title: '配置 AI 模型🧠',
        description: (
          <div style={{ display: 'grid', gap: '12px' }}>
            <div>在这里添加 AI 服务商、密钥和模型并设为默认，即可开始对话。</div>
            <Checkbox
              checked={dontPromptAgain}
              onChange={event => {
                const checked = event.target.checked
                dontPromptAgainRef.current = checked
                setDontPromptAgain(checked)
              }}
            >
              下次不再提示
            </Checkbox>
          </div>
        ),
        target: () => getTarget('ai-provider-settings'),
        placement: 'bottom'
      }
    ],
    [dontPromptAgain]
  )

  async function handleChange(nextStep: number): Promise<void> {
    if (transitioningRef.current) return
    transitioningRef.current = true
    onStepChangeRef.current?.(nextStep)
    await waitNextFrame()
    if ([6, 7, 8].includes(nextStep) || [6, 7, 8].includes(currentRef.current)) {
      await new Promise(resolve => window.setTimeout(resolve, 320))
    }
    if (!unmountedRef.current) {
      currentRef.current = nextStep
      setCurrent(nextStep)
      await waitNextFrame()
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

  return (
    <ConfigProvider locale={guideLocale}>
      <Tour
        open={open}
        current={current}
        steps={steps}
        zIndex={1200}
        mask={{ color: 'rgba(0, 0, 0, 0.45)' }}
        onChange={nextStep => void handleChange(nextStep)}
        onClose={handleClose}
        onFinish={handleFinish}
      />
    </ConfigProvider>
  )
}

export default FirstUseGuide
