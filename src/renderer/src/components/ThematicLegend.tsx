import { useClimateStore } from '@renderer/stores/climate'
import { useOnlineDataStore, type TyphoonMode } from '@renderer/stores/onlineData'
import { useSettingsWindowStore } from '@renderer/stores/settingsWindow'
import { AGRI_CATEGORY_META } from '@renderer/thematic/agriculturalRegions'
import { climateZones } from '@renderer/thematic/climateZones'
import { industrialBases } from '@renderer/thematic/industrialBases'
import { koppenZones } from '@renderer/thematic/koppenZones'
import {
  formatOnlineTime,
  liveTyphoonIntensityStyles,
  unknownTyphoonIntensityStyle
} from '@renderer/thematic/liveTyphoons'
import { densityBins } from '@renderer/thematic/populationCensus'
import { typhoonIntensityStyles } from '@renderer/thematic/typhoonTracks'
import {
  CITY_TIER_META,
  FUNCTIONAL_ZONES,
  functionalZoneCities
} from '@renderer/thematic/urbanCities'
import { windRampStops } from '@renderer/thematic/windField'
import { Alert, Button, Segmented, Select, Spin } from 'antd'

import styles from './ThematicLegend.module.css'

export interface ThematicLegendProps {}

const windGradient = `linear-gradient(90deg, ${windRampStops.join(', ')})`
const historicalTyphoonEntries = Object.values(typhoonIntensityStyles)
const liveTyphoonEntries = [
  ...Object.entries(liveTyphoonIntensityStyles).map(([code, style]) => ({
    ...style,
    name: `${style.name}（${code}）`
  })),
  unknownTyphoonIntensityStyle
]
const typhoonModeOptions: Array<{ label: string; value: TyphoonMode }> = [
  { label: '实时台风', value: 'live' },
  { label: '历史案例', value: 'history' }
]
const zoneEntries = climateZones.map(zone => ({ name: zone.name, color: zone.color }))
const koppenEntries = koppenZones.map(zone => ({
  name: zone.name,
  color: zone.borderColor ?? zone.color
}))
const densityEntries = densityBins.map(bin => ({ label: bin.label, color: bin.color }))
const tierEntries = CITY_TIER_META.map(meta => ({ name: meta.name, color: meta.color }))
const functionalZoneEntries = FUNCTIONAL_ZONES.map(spec => ({
  name: spec.name,
  color: spec.color
}))
const functionalZoneCityOptions = functionalZoneCities.map(city => ({
  label: city.name,
  value: city.id
}))
const agriCategoryEntries = AGRI_CATEGORY_META.map(meta => ({
  name: meta.name,
  color: meta.color
}))
const industrialBaseEntries = industrialBases.map(base => ({
  name: base.name,
  color: base.color
}))

export function ThematicLegend(_props: ThematicLegendProps) {
  const hasActiveOverlay = useClimateStore(state => state.hasActiveOverlay)
  const overlays = useClimateStore(state => state.overlays)
  const functionalZoneCityId = useClimateStore(state => state.functionalZoneCityId)
  const seaLevelRise = useClimateStore(state => state.seaLevelRise)
  const setFunctionalZoneCity = useClimateStore(state => state.setFunctionalZoneCity)

  const snapshot = useOnlineDataStore(state => state.snapshot)
  const loading = useOnlineDataStore(state => state.loading)
  const typhoonMode = useOnlineDataStore(state => state.typhoonMode)
  const typhoonLoading = useOnlineDataStore(state => state.typhoonLoading)
  const setTyphoonMode = useOnlineDataStore(state => state.setTyphoonMode)
  const ensureTyphoons = useOnlineDataStore(state => state.ensureTyphoons)

  const openSettingsWindow = useSettingsWindowStore(state => state.open)

  if (!hasActiveOverlay) return null

  const typhoonFeed = snapshot?.typhoons
  const typhoonHistory = snapshot?.typhoonConfigured === false || typhoonMode === 'history'
  const typhoonCached = Boolean(typhoonFeed && snapshot?.typhoonError)
  const activeStormCount = typhoonFeed?.storms.filter(storm => storm.active).length ?? 0
  const forecastErrors =
    typhoonFeed?.storms
      .filter(storm => storm.forecastError)
      .map(storm => `${storm.name}：${storm.forecastError}`)
      .join('；') ?? ''

  return (
    <div className={styles.thematicLegend} aria-label='专题图层图例'>
      <div className={styles.legendTitle}>图例</div>
      {overlays['wind-particles'] && (
        <div className={styles.legendGroup}>
          <div className={styles.windRamp} style={{ background: windGradient }} />
          <div className={styles.legendRow}>
            <span>风弱</span>
            <span>风强</span>
          </div>
        </div>
      )}
      {overlays['rain-belt'] && (
        <div className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: '#1677ff' }} />
          <span>降水雨带</span>
        </div>
      )}
      {overlays['summer-monsoon'] && (
        <div className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: '#f5222d' }} />
          <span>夏季风（偏南气流）</span>
        </div>
      )}
      {overlays['winter-monsoon'] && (
        <div className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: '#1677ff' }} />
          <span>冬季风（偏北气流）</span>
        </div>
      )}
      {overlays['pressure-belts'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#1677ff' }} />
            <span>低压带</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#f5222d' }} />
            <span>高压带</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#722ed1' }} />
            <span>风带箭头</span>
          </div>
        </div>
      )}
      {overlays['koppen-zones'] && (
        <div className={styles.legendGroup}>
          {koppenEntries.map(zone => (
            <div key={zone.name} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: zone.color }} />
              <span>{zone.name}</span>
            </div>
          ))}
        </div>
      )}
      {overlays['enso'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#1677ff' }} />
            <span>海温距平 ≤ -1.5℃</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#bae7ff' }} />
            <span>接近正常</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#fa8c16' }} />
            <span>距平 +0.5~+2℃</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#fa541c' }} />
            <span>距平 ≥ +2℃</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#531dab' }} />
            <span>Niño3.4 关键监测区</span>
          </div>
        </div>
      )}
      {overlays['frontal-cyclone'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#f5222d' }} />
            <span>暖锋</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#1677ff' }} />
            <span>冷锋</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#69b1ff' }} />
            <span>雨区</span>
          </div>
        </div>
      )}
      {overlays['typhoon'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendHeading}>台风（热带气旋）</div>
          {snapshot?.typhoonConfigured && (
            <Segmented<TyphoonMode>
              value={typhoonMode}
              options={typhoonModeOptions}
              block
              aria-label='台风数据模式'
              onChange={value => setTyphoonMode(value)}
            />
          )}
          {snapshot?.typhoonConfigured === false && (
            <Alert type='info' showIcon title='尚未配置实时数据源，当前显示历史案例' />
          )}
          {typhoonHistory ? (
            <>
              {historicalTyphoonEntries.map(entry => (
                <div key={entry.name} className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: entry.color }} />
                  <span>{entry.name}</span>
                </div>
              ))}
              <div className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: '#fa541c' }} />
                <span>历史台风路径与结构锚点</span>
              </div>
            </>
          ) : (
            <>
              {(loading || typhoonLoading) && (
                <div className={styles.legendItem} role='status'>
                  <Spin size='small' />
                  <span>正在加载台风数据…</span>
                </div>
              )}
              {snapshot?.typhoonError ? (
                <Alert
                  type={typhoonFeed ? 'warning' : 'error'}
                  showIcon
                  title={typhoonFeed ? '更新失败，暂显示上次数据' : '暂无法获取台风数据'}
                  description={snapshot.typhoonError}
                />
              ) : !loading && !typhoonLoading && !typhoonFeed ? (
                <Alert type='error' showIcon title='暂无法获取台风数据' />
              ) : null}
              {typhoonFeed && (
                <>
                  <p className={styles.legendCopy}>
                    更新时间：
                    <span className={styles.legendTime}>
                      {formatOnlineTime(typhoonFeed.fetchedAt)}
                    </span>
                  </p>
                  {!activeStormCount ? (
                    <Alert
                      type='info'
                      showIcon
                      title={typhoonCached ? '当前暂无活跃台风（历史缓存）' : '当前暂无活跃台风'}
                    />
                  ) : (
                    <p className={styles.legendCopy}>
                      当前有 {activeStormCount} 个活跃台风，点击路径点查看详情
                    </p>
                  )}
                  {forecastErrors && (
                    <Alert
                      type='warning'
                      showIcon
                      title='部分台风预报暂不可用'
                      description={forecastErrors}
                    />
                  )}
                  {liveTyphoonEntries.map(entry => (
                    <div key={entry.name} className={styles.legendItem}>
                      <span className={styles.swatch} style={{ background: entry.color }} />
                      <span>{entry.name}</span>
                    </div>
                  ))}
                  <div className={styles.legendItem}>
                    <span className={`${styles.swatch} ${styles.swatchObserved}`} />
                    <span>实线：实况路径</span>
                  </div>
                  <div className={styles.legendItem}>
                    <span className={`${styles.swatch} ${styles.swatchDashed}`} />
                    <span>虚线：预报路径</span>
                  </div>
                  <p className={styles.legendCopy}>实心大点：当前中心 · 空心点：预报位置</p>
                  <p className={styles.legendCopy}>
                    数据来源：和风天气
                    {typhoonFeed.sources.length > 0 && (
                      <span>（{typhoonFeed.sources.join('、')}）</span>
                    )}
                  </p>
                </>
              )}
              {snapshot?.typhoonStatus === 'error' && (
                <Button onClick={() => void ensureTyphoons(true)}>重试</Button>
              )}
            </>
          )}
          <Button onClick={() => openSettingsWindow('laboratory')}>配置数据源</Button>
        </div>
      )}
      {overlays['ocean-currents'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#f5222d' }} />
            <span>暖流</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#1677ff' }} />
            <span>寒流</span>
          </div>
        </div>
      )}
      {overlays['climate-zones'] && (
        <div className={styles.legendGroup}>
          {zoneEntries.map(zone => (
            <div key={zone.name} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: zone.color }} />
              <span>{zone.name}</span>
            </div>
          ))}
        </div>
      )}
      {overlays['coriolis-demo'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.swatchDashed}`} />
            <span>惯性直线（不偏转）</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#1677ff' }} />
            <span>北半球轨迹 · 右偏</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#fa8c16' }} />
            <span>南半球轨迹 · 左偏</span>
          </div>
        </div>
      )}
      {overlays['temperature-zones'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#fa8c16' }} />
            <span>热带（有直射）</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#52c41a' }} />
            <span>温带（四季分明）</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#1677ff' }} />
            <span>寒带（极昼极夜）</span>
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.swatchDashed}`} />
            <span>回归线 / 极圈</span>
          </div>
          <div className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: '#fa8c16', height: 8, borderRadius: '50%' }}
            />
            <span>太阳直射点</span>
          </div>
        </div>
      )}
      {overlays['plate-tectonics'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#f5222d' }} />
            <span>消亡边界（碰撞/俯冲）</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#1677ff' }} />
            <span>生长边界（张裂）</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#fa8c16' }} />
            <span>转换边界（错断）</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#fa541c' }} />
            <span>典型火山</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#faad14' }} />
            <span>地震 M4.5+</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#fa8c16' }} />
            <span>地震 M5.5+</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#f5222d' }} />
            <span>地震 M7+</span>
          </div>
          {snapshot?.earthquakes && (
            <p className={styles.legendCopy}>
              地震更新时间：
              <span className={styles.legendTime}>
                {formatOnlineTime(snapshot.earthquakes.fetchedAt)}
              </span>
            </p>
          )}
          {snapshot?.earthquakeError && (
            <Alert
              type={snapshot.earthquakes ? 'warning' : 'error'}
              showIcon
              title={snapshot.earthquakes ? '地震更新失败，暂显示上次数据' : '暂无法获取地震数据'}
              description={snapshot.earthquakeError}
            />
          )}
        </div>
      )}
      {overlays['province-population'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendHeading}>人口密度（人/km²）</div>
          {densityEntries.map(bin => (
            <div key={bin.label} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: bin.color }} />
              <span>{bin.label}</span>
            </div>
          ))}
        </div>
      )}
      {overlays['hu-line'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.swatchDashed}`} />
            <span>胡焕庸线（黑河—腾冲）</span>
          </div>
        </div>
      )}
      {overlays['migration-flows'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ height: 5, background: '#fa8c16' }} />
            <span>主要迁移流向</span>
          </div>
          <div className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ height: 3, background: 'rgba(250, 140, 22, 0.72)' }}
            />
            <span>次要迁移流向</span>
          </div>
        </div>
      )}
      {overlays['city-tiers'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendHeading}>城市等级（服务半径示意）</div>
          {tierEntries.map(tier => (
            <div key={tier.name} className={styles.legendItem}>
              <span
                className={`${styles.swatch} ${styles.swatchDot}`}
                style={{ background: tier.color }}
              />
              <span>{tier.name}</span>
            </div>
          ))}
        </div>
      )}
      {overlays['functional-zones'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendHeading}>城市功能分区</div>
          <Select
            size='small'
            value={functionalZoneCityId}
            options={functionalZoneCityOptions}
            className={styles.citySelect}
            aria-label='选择功能分区城市'
            onChange={(value: string) => setFunctionalZoneCity(value)}
          />
          {functionalZoneEntries.map(zone => (
            <div key={zone.name} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: zone.color }} />
              <span>{zone.name}</span>
            </div>
          ))}
        </div>
      )}
      {overlays['agri-regions'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendHeading}>农业区划</div>
          {agriCategoryEntries.map(category => (
            <div key={category.name} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: category.color }} />
              <span>{category.name}</span>
            </div>
          ))}
        </div>
      )}
      {overlays['industrial-bases'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendHeading}>四大工业基地</div>
          {industrialBaseEntries.map(base => (
            <div key={base.name} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: base.color }} />
              <span>{base.name}</span>
            </div>
          ))}
        </div>
      )}
      {overlays['industrial-transfers'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendHeading}>产业转移流向</div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ height: 5, background: '#722ed1' }} />
            <span>主要转移方向</span>
          </div>
          <div className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ height: 3, background: 'rgba(114, 46, 209, 0.72)' }}
            />
            <span>次要转移方向</span>
          </div>
        </div>
      )}
      {overlays['hsr-network'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendHeading}>高铁网络</div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ height: 5, background: '#d4380d' }} />
            <span>已开通高铁干线</span>
          </div>
        </div>
      )}
      {overlays['sea-level-rise'] && (
        <div className={styles.legendGroup}>
          <div className={styles.legendHeading}>海平面上升淹没模拟</div>
          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: '#1677ff' }} />
            <span>预计淹没区域（+{seaLevelRise} m）</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default ThematicLegend
