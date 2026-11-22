import {
  CloseOutlined,
  EnvironmentOutlined,
  MessageOutlined,
  UndoOutlined
} from '@ant-design/icons'
import { useAiStore } from '@renderer/stores/ai'
import {
  buildDecisionPrompt,
  decisionCases,
  decisionSandboxIntro
} from '@renderer/thematic/decisionSandbox'
import { Button, Segmented, Switch } from 'antd'
import * as Cesium from 'cesium'
import { useMemo, useRef, useState } from 'react'

import styles from './LocationDecisionPanel.module.css'

export interface LocationDecisionPanelProps {
  viewer?: Cesium.Viewer
  onClose: () => void
}

const caseOptions = decisionCases.map(item => ({ label: item.name, value: item.id }))

export function LocationDecisionPanel({ viewer, onClose }: LocationDecisionPanelProps) {
  const setPanelOpen = useAiStore(state => state.setPanelOpen)
  const send = useAiStore(state => state.send)

  const [activeCaseId, setActiveCaseId] = useState(decisionCases[0].id)
  const [selectedFactorIds, setSelectedFactorIds] = useState<string[]>([])
  const flyingRef = useRef(false)

  const activeCase = useMemo(
    () => decisionCases.find(item => item.id === activeCaseId) ?? decisionCases[0],
    [activeCaseId]
  )

  function selectCase(id: string): void {
    setActiveCaseId(id)
    setSelectedFactorIds([])
  }

  function toggleFactor(factorId: string): void {
    setSelectedFactorIds(previous =>
      previous.includes(factorId) ? previous.filter(id => id !== factorId) : [...previous, factorId]
    )
  }

  function resetSelection(): void {
    setSelectedFactorIds([])
  }

  function requestCritique(): void {
    setPanelOpen(true)
    void send(buildDecisionPrompt(activeCase, selectedFactorIds))
  }

  function flyToPlace(): void {
    if (flyingRef.current) return
    if (!viewer || viewer.isDestroyed()) return
    flyingRef.current = true
    const settle = (): void => {
      flyingRef.current = false
    }
    try {
      const [lon, lat] = activeCase.placeLonLat
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 220000),
        duration: 1.5,
        complete: settle,
        cancel: settle
      })
    } catch {
      settle()
    }
  }

  return (
    <div className={styles.decisionPanel} role='group' aria-label='区位决策沙盘'>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>区位决策沙盘</span>
        <Button
          type='text'
          size='small'
          aria-label='关闭区位决策沙盘'
          icon={<CloseOutlined />}
          onClick={onClose}
        />
      </div>

      <Segmented
        value={activeCase.id}
        options={caseOptions}
        className={styles.casePicker}
        onChange={value => selectCase(String(value))}
      />

      <div className={styles.intro}>{decisionSandboxIntro}</div>

      <div className={styles.caseQuestion}>{activeCase.question}</div>
      <div className={styles.caseContext}>{activeCase.context}</div>

      <div className={styles.factorList}>
        {activeCase.factors.map(factor => {
          const selected = selectedFactorIds.includes(factor.id)
          return (
            <div
              key={factor.id}
              className={
                selected ? `${styles.factorRow} ${styles.factorRowSelected}` : styles.factorRow
              }
            >
              <div className={styles.factorMain}>
                <Switch
                  size='small'
                  checked={selected}
                  aria-label={`因素开关：${factor.name}`}
                  onChange={() => toggleFactor(factor.id)}
                />
                <span className={styles.factorName}>
                  {factor.name}
                  {factor.essential && (
                    <span className={styles.factorEssential} title='该情境的关键因素'>
                      ★
                    </span>
                  )}
                </span>
              </div>
              {selected && <p className={styles.factorHint}>{factor.hint}</p>}
            </div>
          )
        })}
      </div>

      <div className={styles.actionRow}>
        <Button
          type='text'
          size='small'
          className={styles.caseFly}
          aria-label='飞往该地'
          icon={<EnvironmentOutlined />}
          onClick={flyToPlace}
        >
          飞往该地
        </Button>
        <Button
          size='small'
          disabled={selectedFactorIds.length === 0}
          icon={<UndoOutlined />}
          onClick={resetSelection}
        >
          重置
        </Button>
        <Button
          type='primary'
          size='small'
          className={styles.critiqueButton}
          icon={<MessageOutlined />}
          onClick={requestCritique}
        >
          按高考答题结构请 AI 点评
        </Button>
      </div>
    </div>
  )
}

export default LocationDecisionPanel
