import { useMemo, useState, type MouseEvent } from 'react'
import { Alert, Button, Collapse, Drawer, Modal, Radio, Select, Slider, Switch, Tooltip } from 'antd'
import { CloseOutlined, MoreOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  basemapCategories,
  providerCatalog,
  terrainCatalog,
  type LayerMeta,
  type ProviderMeta
} from '@renderer/stores/globe'
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

const terrainSelectOptions = terrainCatalog.map((option) => ({
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
      basemapCategories.map((category) => {
        const providers = category.providerIds
          .map((id) => providerCatalog.find((provider) => provider.id === id))
          .filter((provider): provider is ProviderMeta => Boolean(provider))
        const activeProviderId = providers.some((provider) => provider.id === selectedLayerId)
          ? selectedLayerId
          : (providers[0]?.id ?? '')
        return {
          id: category.id,
          name: category.name,
          selected: category.providerIds.includes(selectedLayerId),
          providers,
          activeProviderId,
          activeProviderName: providers.find((provider) => provider.id === activeProviderId)?.name ?? '',
          activeLayer: layers.find((layer) => layer.id === activeProviderId)
        }
      }),
    [layers, selectedLayerId]
  )

  const activeTerrainName =
    terrainCatalog.find((terrain) => terrain.id === activeTerrainId)?.name ?? ''
  const terrainDegraded = Boolean(activeTerrainId) && activeTerrainId !== terrainProviderId
  const settingsCategory = basemapOptions.find((option) => option.id === settingsCategoryId)
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
    if (layer) onOpacity(layer.id, value / 100)
  }

  return (
    <Drawer
      open={open}
      placement="right"
      size={360}
      mask={false}
      closable={false}
      styles={{ body: { padding: '16px' } }}
      title={
        <div className={styles.panelTitle}>
          <h2 className={styles.panelHeading}>图层管理</h2>
          <Button type="text" aria-label="关闭图层管理" icon={<CloseOutlined />} onClick={onClose} />
        </div>
      }
      onClose={onClose}
    >
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          className={styles.panelAlert}
          action={
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onRetry}>
              重试
            </Button>
          }
        />
      )}
      <div className={styles.layerSpin}>
        <section className={styles.panelSection}>
          <div>
            {basemapOptions.map((option) => (
              <div
                key={option.id}
                className={
                  option.selected
                    ? `${styles.basemapItem} ${styles.basemapItemSelected}`
                    : styles.basemapItem
                }
                onClick={() => onSelect(option.activeProviderId)}
              >
                <Radio
                  checked={option.selected}
                  aria-label={`选择${option.name}底图`}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => onSelect(option.activeProviderId)}
                />
                <div className={styles.basemapCopy}>
                  <div className={styles.basemapName}>{option.name}</div>
                  <div className={styles.basemapDescription}>{option.activeProviderName}</div>
                </div>
                <Tooltip title={`${option.name}设置`}>
                  <Button
                    type="text"
                    size="small"
                    className={styles.moreButton}
                    aria-label={`${option.name}设置`}
                    icon={<MoreOutlined />}
                    onClick={(event) => openSettings(option.id, event)}
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
            onChange={(value: string) => onTerrain(value)}
          />
          {terrainDegraded && (
            <div className={styles.terrainActiveHint}>当前实际使用「{activeTerrainName}」</div>
          )}
          <div className={styles.terrainSliderHead}>
            <span>垂直夸张</span>
            <span>{terrainExaggeration}×</span>
          </div>
          <Slider
            value={terrainExaggeration}
            min={1}
            max={5}
            step={0.5}
            marks={exaggerationMarks}
            ariaLabelForHandle="地形垂直夸张倍数"
            onChange={(value: number) => onTerrainExaggeration(value)}
          />
          <div className={styles.terrainLightingRow}>
            <span>太阳光照</span>
            <Switch
              size="small"
              checked={terrainLighting}
              onChange={(value: boolean) => onTerrainLighting(value)}
            />
          </div>
          {terrainError && (
            <Alert type="warning" title={terrainError} showIcon className={styles.terrainAlert} />
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
                <span>{settingsOpacity}%</span>
              </div>
              <Slider
                value={settingsOpacity}
                min={0}
                max={100}
                step={5}
                ariaLabelForHandle={`${settingsCategory.name}不透明度`}
                onChange={handleSettingsOpacity}
              />
            </div>
            <Collapse
              items={[
                {
                  key: 'advanced',
                  label: '高级设置',
                  children: (
                    <>
                      <div className={styles.settingHead}>
                        <span>供应商</span>
                      </div>
                      <Radio.Group
                        value={settingsCategory.activeProviderId}
                        className={styles.providerGroup}
                        onChange={(event) => onSelect(String(event.target.value))}
                      >
                        {settingsCategory.providers.map((provider) => (
                          <Radio key={provider.id} value={provider.id} className={styles.providerRadio}>
                            <div className={styles.providerCopy}>
                              <div className={styles.providerName}>{provider.name}</div>
                              <div className={styles.providerDescription}>{provider.description}</div>
                            </div>
                          </Radio>
                        ))}
                      </Radio.Group>
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
