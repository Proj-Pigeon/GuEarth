import { useMemo } from 'react'
import { Trash2Icon } from 'lucide-react'
import { Button, Input, NumberInput, Select, Switch, Tooltip } from '@renderer/components/ui'
import type { DrawnShape } from '@renderer/stores/drawing'
import { useFlightStopsStore } from '@renderer/stores/flightStops'
import styles from './DrawingEditToolbar.module.css'

export type DrawnShapeStylePatch = Partial<
  Pick<
    DrawnShape,
    'annotation' | 'color' | 'textColor' | 'fontFamily' | 'fontSize' | 'textFrame' | 'lineWidth'
  >
>

export interface DrawingEditToolbarProps {
  shape: DrawnShape
  fonts: string[]
  onChange: (value: DrawnShapeStylePatch) => void
  onRemove: () => void
}

export function DrawingEditToolbar({ shape, fonts, onChange, onRemove }: DrawingEditToolbarProps) {
  const flightStopsVisible = useFlightStopsStore((state) => state.visible)

  const fontOptions = useMemo(
    () => fonts.map((font) => ({ label: font, value: font })),
    [fonts]
  )

  return (
    <div
      className={
        flightStopsVisible
          ? `${styles.drawingEditToolbar} ${styles.drawingEditToolbarStacked}`
          : styles.drawingEditToolbar
      }
      role="toolbar"
      aria-label="绘图样式"
    >
      {shape.kind !== 'text' && (
        <Input
          value={shape.annotation}
          className={styles.annotationInput}
          maxLength={200}
          placeholder="标注名称"
          aria-label="标注名称"
          onChange={(event) => onChange({ annotation: event.target.value })}
        />
      )}
      <label className={styles.styleControl}>
        <span>{shape.kind === 'text' ? '边框色' : '颜色'}</span>
        <input
          value={shape.color}
          type="color"
          aria-label="绘图颜色"
          className={styles.colorInput}
          onChange={(event) => onChange({ color: event.target.value })}
        />
      </label>
      {(shape.kind === 'polyline' || shape.kind === 'polygon' || shape.kind === 'arrow') && (
        <label className={styles.styleControl}>
          <span>线宽</span>
          <NumberInput
            value={shape.lineWidth}
            min={1}
            max={12}
            step={1}
            className={styles.numberControl}
            aria-label="线宽"
            onChange={(value) => {
              if (typeof value === 'number') {onChange({ lineWidth: value })}
            }}
          />
        </label>
      )}
      {shape.kind === 'text' && (
        <>
          <label className={styles.styleControl}>
            <span>文字色</span>
            <input
              value={shape.textColor}
              type="color"
              aria-label="文字颜色"
              className={styles.colorInput}
              onChange={(event) => onChange({ textColor: event.target.value })}
            />
          </label>
          <label className={`${styles.styleControl} ${styles.fontControl}`}>
            <span>字体</span>
            <Select
              value={shape.fontFamily}
              options={fontOptions}
              searchable
              className={styles.fontSelect}
              aria-label="系统字体"
              onChange={(value) => {
                if (value) {onChange({ fontFamily: value })}
              }}
            />
          </label>
          <label className={styles.styleControl}>
            <span>字号</span>
            <NumberInput
              value={shape.fontSize}
              min={8}
              max={72}
              step={1}
              className={styles.numberControl}
              aria-label="字号"
              onChange={(value) => {
                if (typeof value === 'number') {onChange({ fontSize: value })}
              }}
            />
          </label>
          <label className={`${styles.styleControl} ${styles.frameControl}`}>
            <span>边框</span>
            <Switch
              checked={shape.textFrame}
              aria-label="显示边框"
              onChange={(checked) => onChange({ textFrame: checked })}
            />
          </label>
        </>
      )}
      <Tooltip title="删除标注">
        <Button
          variant="ghost"
          danger
          aria-label="删除标注"
          icon={<Trash2Icon className="size-4" />}
          onClick={onRemove}
        />
      </Tooltip>
    </div>
  )
}

export default DrawingEditToolbar
