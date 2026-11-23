import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { CloseOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { diagramColors as dc, diagramFont } from './diagram/diagramTheme'
import styles from './WaterCyclePanel.module.css'

export interface WaterCyclePanelProps {
  viewer?: Cesium.Viewer
  onClose: () => void
}

const STEPS = ['蒸发', '水汽输送', '降水', '径流与下渗']
const highlights = ['蒸发', '水汽输送', '降水', '地表径流', '下渗', '地下径流', '蒸腾']
const notes = [
  '太阳辐射使海洋表面水分蒸发，是水循环最主要的动力与起点。',
  '海面蒸发的水汽随季风与盛行风输送到陆地上空，沟通海洋与陆地。',
  '水汽在迎风坡抬升冷却凝结，形成地形雨，是陆地淡水的主要来源。',
  '降水一部分沿地表汇入江河回到海洋（地表径流），一部分下渗成为地下水（地下径流），最终也回到海洋，完成海陆间循环。'
]

export function WaterCyclePanel({ viewer, onClose }: WaterCyclePanelProps) {
  const [animationStep, setAnimationStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const playingRef = useRef(playing)
  playingRef.current = playing

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      setAnimationStep((prev) => (prev + 1) % (STEPS.length + 1))
    }, 1600)
    return () => {
      clearInterval(timer)
    }
  }, [playing])

  useEffect(() => {
    if (!playingRef.current) return
    if (viewer && !viewer.isDestroyed()) {
      viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(128, 22, 7200000), duration: 1.2 })
    }
  }, [viewer])

  function stepActive(step: number): boolean {
    if (animationStep === 0) return false
    if (animationStep === 4) return true
    return animationStep >= step
  }

  return (
    <div className={styles.waterCyclePanel} role="group" aria-label="水循环演示">
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>水循环（海陆间循环）</span>
        <Button size="small" onClick={() => setPlaying((prev) => !prev)}>
          {playing ? '暂停' : '播放'}
        </Button>
        <Button type="text" size="small" aria-label="关闭水循环演示" icon={<CloseOutlined />} onClick={onClose} />
      </div>
      <svg viewBox="0 0 340 200" className={styles.cycleSvg} role="img" aria-label="海陆间水循环环节示意图">
        <defs>
          <linearGradient id="wc-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e6f4ff" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
          <linearGradient id="wc-ocean" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={dc.oceanShallow} />
            <stop offset="100%" stopColor={dc.oceanDeep} />
          </linearGradient>
          <linearGradient id="wc-land" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={dc.landHigh} />
            <stop offset="100%" stopColor="#d9f7be" />
          </linearGradient>
          <marker id="cycle-head" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill={dc.neutralArrow} />
          </marker>
        </defs>
        <rect x="0" y="0" width="340" height="200" rx="8" fill="url(#wc-sky)" />
        <path d="M0 158 L150 158 L150 200 L0 200 Z" fill="url(#wc-ocean)" />
        <path d="M150 158 L206 158 L256 108 L340 66 L340 200 L150 200 Z" fill="url(#wc-land)" />
        <path d="M150 158 L206 158 L256 108 L340 66" fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="1.2" />
        <g className={stepActive(1) ? `${styles.stage} ${styles.stageOn}` : styles.stage}>
          <path
            d="M 66 148 C 62 122 70 102 82 90"
            fill="none"
            stroke={dc.rain}
            strokeWidth="2.5"
            markerEnd="url(#cycle-head)"
            className={styles.cycleArrow}
          />
          <path
            d="M 88 150 C 86 128 92 112 100 102"
            fill="none"
            stroke={dc.rain}
            strokeWidth="1.6"
            markerEnd="url(#cycle-head)"
            className={styles.cycleArrow}
            opacity="0.7"
          />
          <text x="52" y="106" className={styles.stageLabel} fill={dc.rain} textAnchor="middle">
            蒸发
          </text>
        </g>
        <g className={stepActive(2) ? `${styles.stage} ${styles.stageOn}` : styles.stage}>
          <path
            d="M 104 82 Q 172 40 244 60"
            fill="none"
            stroke={dc.vaporFlow}
            strokeWidth="2.5"
            markerEnd="url(#cycle-head)"
            className={styles.cycleArrow}
          />
          <text x="172" y="40" className={styles.stageLabel} fill={dc.vaporFlow} textAnchor="middle">
            水汽输送
          </text>
        </g>
        <g className={stepActive(3) ? `${styles.stage} ${styles.stageOn}` : styles.stage}>
          <path
            d="M 242 68 L 236 92 M 258 64 L 252 90 M 274 60 L 268 86"
            stroke={dc.rain}
            strokeWidth="2"
            strokeLinecap="round"
            className={styles.rainStreak}
          />
          <text x="290" y="70" className={styles.stageLabel} fill={dc.rain}>
            降水
          </text>
        </g>
        <g className={stepActive(4) ? `${styles.stage} ${styles.stageOn}` : styles.stage}>
          <path
            d="M 262 116 C 230 134 196 144 162 150"
            fill="none"
            stroke={dc.waterFlow}
            strokeWidth="2.5"
            markerEnd="url(#cycle-head)"
            className={styles.cycleArrow}
          />
          <text x="268" y="112" className={styles.stageLabel} fill={dc.waterFlow}>
            地表径流
          </text>
          <path
            d="M 268 136 C 258 156 220 170 184 174"
            fill="none"
            stroke={dc.waterFlow}
            strokeWidth="1.6"
            strokeDasharray="4 4"
            markerEnd="url(#cycle-head)"
            className={styles.cycleArrow}
          />
          <text x="246" y="166" className={styles.stageLabel} fill={dc.waterFlow}>
            下渗·地下径流
          </text>
        </g>
        <g fontSize="11" fontFamily={diagramFont}>
          <text x="70" y="184" fill="rgba(255,255,255,0.95)" textAnchor="middle" fontWeight="600">
            海洋
          </text>
          <text x="304" y="150" fill={dc.inkSecondary} textAnchor="middle">
            陆地（山地）
          </text>
        </g>
      </svg>
      <div className={styles.noteRow}>
        {notes.map((note, index) => (
          <span
            key={note}
            className={animationStep === 0 || animationStep === index + 1 ? `${styles.note} ${styles.noteOn}` : styles.note}
          >
            {note}
          </span>
        ))}
      </div>
      <div className={styles.chips}>
        {highlights.map((item) => (
          <span key={item} className={styles.chip}>
            {item}
          </span>
        ))}
      </div>
      <div className={styles.panelNote}>
        三类水循环：海陆间循环（图中所示，使陆地淡水不断更新）、陆地内循环、海上内循环。人类活动主要影响环节是地表径流（修建水库、跨流域调水、植树造林增加下渗等）。当前视角已飞往西太平洋—东亚，可对照地球观察海洋蒸发与季风水汽输送的真实尺度。
      </div>
    </div>
  )
}

export default WaterCyclePanel
