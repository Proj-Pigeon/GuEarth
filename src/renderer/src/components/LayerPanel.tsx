import {
  Accordion,
  Alert,
  Button,
  Drawer,
  Modal,
  RadioDot,
  RadioGroup,
  RadioItem,
  Select,
  Slider,
  Switch,
  Tooltip
} from '@renderer/components/ui'
import { basemapCategories, providerCatalog, terrainCatalog } from '@renderer/stores/globe'
import type { LayerMeta, ProviderMeta } from '@renderer/stores/globe'
import { MoreHorizontalIcon, RotateCwIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MouseEvent } from 'react'

import styles from './LayerPanel.module.css'

export interface LayerPanelProps {
  open: boolean
  layers: LayerMeta[]
  selectedLayerId: string
  error: string
  terrainError: string
  terrainProviderId: string
  activeTerrainId: string
  terrainExaggeration: number
  terrainLighting: boolean
  onClose: () => void
  onSelect: (id: string) => void
  onOpacity: (id: string, opacity: number) => void
  onRetry: () => void
  onTerrain: (id: string) => void
  onTerrainExaggeration: (value: number) => void
  onTerrainLighting: (value: boolean) => void
}

interface BasemapOption {
  id: string
  name: string
  selected: boolean
  providers: ProviderMeta[]
  activeProviderId: string
  activeProviderName: string
  activeLayer?: LayerMeta
}

const terrainSelectOptions = terrainCatalog.map(option => ({
  value: option.id,
  label: option.name,
  title: option.description
}))

const exaggerationMarks = { 1: '1×', 3: '3×', 5: '5×' }

export function LayerPanel({
  open,
  layers,
  selectedLayerId,
  error,
  terrainError,
  terrainProviderId,
  activeTerrainId,
  terrainExaggeration,
  terrainLighting,
  onClose,
  onSelect,
  onOpacity,
  onRetry,
  onTerrain,
  onTerrainExaggeration,
  onTerrainLighting
}: LayerPanelProps) {
  const [settingsCategoryId, setSettingsCategoryId] = useState('')

  const basemapOptions = useMemo<BasemapOption[]>(
    () =>
      basemapCategories.map(category => {
        const providers = category.providerIds
          .map(id => providerCatalog.find(provider => provider.id === id))
          .filter((provider): provider is ProviderMeta => Boolean(provider))
        const activeProviderId = providers.some(provider => provider.id === selectedLayerId)
          ? selectedLayerId
          : (providers[0]?.id ?? '')
        return {
          id: category.id,
          name: category.name,
          selected: category.providerIds.includes(selectedLayerId),
          providers,
          activeProviderId,
          activeProviderName:
            providers.find(provider => provider.id === activeProviderId)?.name ?? '',
          activeLayer: layers.find(layer => layer.id === activeProviderId)
        }
      }),
    [layers, selectedLayerId]
  )

  const activeTerrainName =
    terrainCatalog.find(terrain => terrain.id === activeTerrainId)?.name ?? ''
  const terrainDegraded = Boolean(activeTerrainId) && activeTerrainId !== terrainProviderId
  const settingsCategory = basemapOptions.find(option => option.id === settingsCategoryId)
  const settingsOpacity = Math.round((settingsCategory?.activeLayer?.opacity ?? 1) * 100)

  function openSettings(id: string, event: MouseEvent): void {
    event.stopPropagation()
    setSettingsCategoryId(id)
  }

  function closeSettings(): void {
    setSettingsCategoryId('')
  }

  function handleSettingsOpacity(value: number): void {
    const layer = settingsCategory?.activeLayer
    if (layer) {
      onOpacity(layer.id, value / 100)
    }
  }

  return (
    <Drawer
      open={open}
      placement='right'
      size={360}
      title={
        <div className={styles.panelTitle}>
          <h2 className={styles.panelHeading}>图层管理</h2>
          <Button
            variant='ghost'
            size='sm'
            aria-label='关闭图层管理'
            icon={<XIcon className='size-4' />}
            onClick={onClose}
          />
        </div>
      }
      onClose={onClose}
    >
      {error && (
        <Alert
          type='error'
          showIcon
          title={error}
          className={styles.panelAlert}
          action={
            <Button
              variant='ghost'
              size='sm'
              icon={<RotateCwIcon className='size-3.5' />}
              onClick={onRetry}
            >
              重试
            </Button>
          }
        />
      )}
      <div className={styles.layerSpin}>
        <section className={styles.panelSection}>
          <div className={styles.basemapList}>
            {basemapOptions.map(option => (
              <div
                key={option.id}
                className={
                  option.selected
                    ? `${styles.basemapItem} ${styles.basemapItemSelected}`
                    : styles.basemapItem
                }
                onClick={() => onSelect(option.activeProviderId)}
              >
                <RadioDot
                  checked={option.selected}
                  aria-label={`选择${option.name}底图`}
                  onClick={event => event.stopPropagation()}
                  onChange={() => onSelect(option.activeProviderId)}
                />
                <div className={styles.basemapCopy}>
                  <div className={styles.basemapName}>{option.name}</div>
                  <div className={styles.basemapDescription}>{option.activeProviderName}</div>
                </div>
                <Tooltip title={`${option.name}设置`}>
                  <Button
                    variant='ghost'
                    size='sm'
                    className={styles.moreButton}
                    aria-label={`${option.name}设置`}
                    icon={<MoreHorizontalIcon className='size-4' />}
                    onClick={event => openSettings(option.id, event)}
                  />
                </Tooltip>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panelSection}>
          <div className={styles.sectionHeading}>
            <span>3D 地形</span>
          </div>
          <Select
            value={terrainProviderId}
            className={styles.fullSelect}
            options={terrainSelectOptions}
            aria-label='选择 3D 地形'
            onChange={value => {
              if (value) {
                onTerrain(value)
              }
            }}
          />
          {terrainDegraded && (
            <div className={styles.terrainActiveHint}>当前实际使用「{activeTerrainName}」</div>
          )}
          <div className={styles.terrainSliderHead}>
            <span>垂直夸张</span>
            <span className='font-mono'>{terrainExaggeration}×</span>
          </div>
          <Slider
            value={terrainExaggeration}
            min={1}
            max={5}
            step={0.5}
            marks={exaggerationMarks}
            aria-label='地形垂直夸张倍数'
            onChange={value => onTerrainExaggeration(value)}
          />
          <div className={styles.terrainLightingRow}>
            <span>太阳光照</span>
            <Switch
              size='sm'
              checked={terrainLighting}
              aria-label='太阳光照'
              onChange={value => onTerrainLighting(value)}
            />
          </div>
          {terrainError && (
            <Alert type='warning' title={terrainError} showIcon className={styles.terrainAlert} />
          )}
        </section>
      </div>

      <Modal
        open={settingsCategory !== undefined}
        title={settingsCategory ? `${settingsCategory.name}设置` : ''}
        footer={null}
        width={420}
        onCancel={closeSettings}
      >
        {settingsCategory && (
          <>
            <div className={styles.modalBlock}>
              <div className={styles.settingHead}>
                <span>不透明度</span>
                <span className='font-mono'>{settingsOpacity}%</span>
              </div>
              <Slider
                value={settingsOpacity}
                min={0}
                max={100}
                step={5}
                aria-label={`${settingsCategory.name}不透明度`}
                onChange={handleSettingsOpacity}
              />
            </div>
            <Accordion
              items={[
                {
                  key: 'advanced',
                  label: '高级设置',
                  children: (
                    <>
                      <div className={styles.settingHead}>
                        <span>供应商</span>
                      </div>
                      <RadioGroup
                        value={settingsCategory.activeProviderId}
                        className={styles.providerGroup}
                        aria-label='底图供应商'
                        onChange={value => onSelect(value)}
                      >
                        {settingsCategory.providers.map(provider => (
                          <RadioItem
                            key={provider.id}
                            value={provider.id}
                            className={styles.providerRadio}
                          >
                            <div className={styles.providerCopy}>
                              <div className={styles.providerName}>{provider.name}</div>
                              <div className={styles.providerDescription}>
                                {provider.description}
                              </div>
                            </div>
                          </RadioItem>
                        ))}
                      </RadioGroup>
                    </>
                  )
                }
              ]}
            />
          </>
        )}
      </Modal>
    </Drawer>
  )
}

export default LayerPanel
