import type { ReactNode } from 'react'
import {
  AimOutlined,
  AppstoreOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClearOutlined,
  DownloadOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  EyeOutlined,
  FontSizeOutlined,
  GatewayOutlined,
  HomeOutlined,
  NodeIndexOutlined,
  PlaySquareOutlined,
  RobotOutlined,
  SettingOutlined,
  TagsOutlined
} from '@ant-design/icons'
import { Badge, Button, Progress, Tooltip } from 'antd'
import type { DrawTool } from '@renderer/stores/drawing'
import type { UpdateStatus } from '@renderer/stores/updater'
import styles from './GlobeToolbar.module.css'

export interface GlobeToolbarProps {
  activeTool: DrawTool | null
  shapeCount: number
  levelViewActive: boolean
  levelViewVisible: boolean
  labActive: boolean
  nightBasemapActive: boolean
  updateStatus: UpdateStatus
  updateVersion: string
  updatePercent: number
  onOpenLayers: () => void
  onOpenAnnotations: () => void
  onOpenAssistant: () => void
  onOpenSettings: () => void
  onOpenScenes: () => void
  onHome: () => void
  onTool: (tool: DrawTool) => void
  onClearShapes: () => void
  onToggleLevelView: () => void
  onToggleLab: () => void
  onUpdateClick: () => void
}

const tools: Array<{ id: DrawTool; label: string; icon: ReactNode }> = [
  { id: 'point', label: '绘制点', icon: <EnvironmentOutlined /> },
  { id: 'line', label: '绘制线', icon: <NodeIndexOutlined /> },
  { id: 'polygon', label: '绘制多边形', icon: <GatewayOutlined /> },
  { id: 'arrow', label: '绘制箭头', icon: <ArrowRightOutlined /> },
  { id: 'text', label: '添加文本框', icon: <FontSizeOutlined /> }
]

export function GlobeToolbar({
  activeTool,
  shapeCount,
  levelViewActive,
  levelViewVisible,
  labActive,
  nightBasemapActive,
  updateStatus,
  updateVersion,
  updatePercent,
  onOpenLayers,
  onOpenAnnotations,
  onOpenAssistant,
  onOpenSettings,
  onOpenScenes,
  onHome,
  onTool,
  onClearShapes,
  onToggleLevelView,
  onToggleLab,
  onUpdateClick
}: GlobeToolbarProps) {
  const levelViewIcon = levelViewActive ? <EyeOutlined /> : <AimOutlined />
  const levelViewTooltip = levelViewActive ? '恢复俯视视角' : '平视 3D 地形'
  const labTooltip = nightBasemapActive
    ? '夜光模式下地理实验室不可用，切换回其他底图后恢复'
    : '地理实验室'
  const updateVisible = updateStatus !== 'idle'
  const updateTooltip =
    updateStatus === 'downloading'
      ? updatePercent > 0
        ? `正在下载新版本 ${updatePercent}%`
        : '正在下载新版本…'
      : updateStatus === 'ready'
        ? '新版本已就绪，点击重启安装'
        : `发现新版本 v${updateVersion}，点击下载`

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarGroup}>
        <Tooltip title="回到初始视角" placement="top">
          <Button
            type="text"
            className={styles.toolbarBtn}
            aria-label="回到初始视角"
            data-guide-target="home"
            icon={<HomeOutlined />}
            onClick={onHome}
          />
        </Tooltip>
        <Tooltip title="图层管理" placement="top">
          <Button
            type="text"
            className={styles.toolbarBtn}
            aria-label="图层管理"
            data-guide-target="layers"
            icon={<AppstoreOutlined />}
            onClick={onOpenLayers}
          />
        </Tooltip>
        <Tooltip title={labTooltip} placement="top">
          <Button
            type="text"
            className={labActive ? `${styles.toolbarBtn} ${styles.toolbarBtnActive}` : styles.toolbarBtn}
            disabled={nightBasemapActive}
            aria-label="地理实验室"
            data-guide-target="lab"
            icon={<ExperimentOutlined />}
            onClick={onToggleLab}
          />
        </Tooltip>
        <Tooltip title="教学场景" placement="top">
          <Button
            type="text"
            className={styles.toolbarBtn}
            aria-label="教学场景"
            icon={<PlaySquareOutlined />}
            onClick={onOpenScenes}
          />
        </Tooltip>
      </div>
      <div className={styles.toolbarGroup}>
        <Tooltip title="标注管理" placement="top">
          <Button
            type="text"
            className={styles.toolbarBtn}
            aria-label="标注管理"
            data-guide-target="annotations"
            icon={<TagsOutlined />}
            onClick={onOpenAnnotations}
          />
        </Tooltip>
        <div className={styles.toolbarTools} data-guide-target="drawing-tools">
          {tools.map((item) => (
            <Tooltip key={item.id} title={item.label} placement="top">
              <Button
                type="text"
                className={
                  activeTool === item.id
                    ? `${styles.toolbarBtn} ${styles.toolbarBtnActive}`
                    : styles.toolbarBtn
                }
                aria-label={item.label}
                icon={item.icon}
                onClick={() => onTool(item.id)}
              />
            </Tooltip>
          ))}
          <Tooltip title="清除全部标注" placement="top">
            <Button
              type="text"
              className={styles.toolbarBtn}
              disabled={!shapeCount}
              aria-label="清除全部标注"
              icon={<ClearOutlined />}
              onClick={onClearShapes}
            />
          </Tooltip>
        </div>
      </div>
      <div className={styles.toolbarFloating}>
        {levelViewVisible && (
          <Tooltip title={levelViewTooltip} placement="top">
            <Button
              className={styles.toolbarCircle}
              type={levelViewActive ? 'primary' : 'default'}
              shape="circle"
              aria-label={levelViewTooltip}
              icon={levelViewIcon}
              onClick={onToggleLevelView}
            />
          </Tooltip>
        )}
        {updateVisible && (
          <Tooltip title={updateTooltip} placement="top">
            {updateStatus === 'available' ? (
              <Badge dot color="#1677ff" offset={[-6, 6]}>
                <Button
                  className={styles.toolbarCircle}
                  type="default"
                  shape="circle"
                  aria-label={updateTooltip}
                  icon={<DownloadOutlined />}
                  onClick={onUpdateClick}
                />
              </Badge>
            ) : updateStatus === 'downloading' ? (
              <Button
                className={styles.toolbarCircle}
                type="default"
                shape="circle"
                aria-label={updateTooltip}
                onClick={onUpdateClick}
              >
                <Progress
                  type="circle"
                  percent={updatePercent}
                  size={22}
                  strokeWidth={3}
                  showInfo={false}
                />
              </Button>
            ) : (
              <Button
                className={styles.toolbarCircle}
                type="primary"
                shape="circle"
                aria-label={updateTooltip}
                icon={<CheckCircleOutlined />}
                onClick={onUpdateClick}
              />
            )}
          </Tooltip>
        )}
        <Tooltip title="EOQ 智能助手" placement="top">
          <Button
            type="default"
            shape="circle"
            className={styles.toolbarCircle}
            aria-label="EOQ 智能助手"
            data-guide-target="assistant"
            icon={<RobotOutlined />}
            onClick={onOpenAssistant}
          />
        </Tooltip>
        <Tooltip title="设置" placement="top">
          <Button
            type="default"
            shape="circle"
            className={styles.toolbarCircle}
            aria-label="设置"
            data-guide-target="settings"
            icon={<SettingOutlined />}
            onClick={onOpenSettings}
          />
        </Tooltip>
      </div>
    </div>
  )
}

export default GlobeToolbar
