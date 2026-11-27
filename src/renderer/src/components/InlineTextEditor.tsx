import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import * as Cesium from 'cesium'
import type { DrawnShape } from '@renderer/stores/drawing'
import styles from './InlineTextEditor.module.css'

export interface InlineTextEditorProps {
  viewer: Cesium.Viewer | undefined
  shape: DrawnShape | null
  onUpdate: (value: string) => void
}

function editorTextShadow(color: string, framed: boolean): string {
  if (framed) {return 'none'}
  const match = /^#([\da-f]{6})$/i.exec(color)
  if (!match) {return '0 0 3px rgba(0, 0, 0, 0.9)'}
  const red = Number.parseInt(match[1].slice(0, 2), 16)
  const green = Number.parseInt(match[1].slice(2, 4), 16)
  const blue = Number.parseInt(match[1].slice(4, 6), 16)
  const luminance = (red * 0.299 + green * 0.587 + blue * 0.114) / 255
  const halo = luminance > 0.55 ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.96)'
  return `0 0 2px ${halo}, 0 0 4px ${halo}`
}

export function InlineTextEditor({ viewer, shape, onUpdate }: InlineTextEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const shapeRef = useRef<DrawnShape | null>(shape)
  const viewerRef = useRef<Cesium.Viewer | undefined>(viewer)

  shapeRef.current = shape
  viewerRef.current = viewer

  const updatePosition = useCallback((): void => {
    const currentViewer = viewerRef.current
    const currentShape = shapeRef.current
    const root = rootRef.current
    const editor = editorRef.current
    if (!editor) {return}
    if (!currentViewer || currentViewer.isDestroyed() || !root || !currentShape || currentShape.kind !== 'text') {
      editor.style.visibility = 'hidden'
      return
    }
    const anchor = currentShape.positions[0]
    if (!anchor) {
      editor.style.visibility = 'hidden'
      return
    }
    const worldPosition = Cesium.Cartesian3.fromDegrees(
      anchor.longitude,
      anchor.latitude,
      anchor.height
    )
    const screenPosition = Cesium.SceneTransforms.worldToWindowCoordinates(
      currentViewer.scene,
      worldPosition
    )
    if (!screenPosition) {
      editor.style.visibility = 'hidden'
      return
    }
    const canvasRect = currentViewer.scene.canvas.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    editor.style.left = `${canvasRect.left - rootRect.left + screenPosition.x}px`
    editor.style.top = `${canvasRect.top - rootRect.top + screenPosition.y - 12}px`
    editor.style.visibility = 'visible'
  }, [])

  const resizeEditor = useCallback((): void => {
    const editor = editorRef.current
    if (!editor) {return}
    editor.style.height = 'auto'
    editor.style.height = `${Math.max(32, editor.scrollHeight)}px`
  }, [])

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) {
      updatePosition()
      return
    }
    updatePosition()
    const removePreRender = viewer.scene.preRender.addEventListener(updatePosition)
    return () => {
      removePreRender()
    }
  }, [viewer, updatePosition])

  useLayoutEffect(() => {
    if (shape?.kind !== 'text') {return}
    const editor = editorRef.current
    if (editor) {
      editor.focus()
      editor.setSelectionRange(editor.value.length, editor.value.length)
    }
    resizeEditor()
    updatePosition()
  }, [shape?.id, shape?.kind, resizeEditor, updatePosition])

  useLayoutEffect(() => {
    if (shape?.kind !== 'text') {return}
    resizeEditor()
    updatePosition()
  }, [shape?.annotation, shape?.positions, shape?.fontSize, shape?.fontFamily, shape?.textFrame, shape?.kind, resizeEditor, updatePosition])

  const editorStyle = useMemo<CSSProperties>(() => {
    if (shape?.kind !== 'text') {return {}}
    return {
      color: shape.textColor,
      fontFamily: `"${shape.fontFamily}", sans-serif`,
      fontSize: `${shape.fontSize}px`,
      textShadow: editorTextShadow(shape.textColor, shape.textFrame),
      backgroundColor: shape.textFrame ? 'rgba(255, 255, 255, 0.96)' : 'transparent',
      borderColor: shape.textFrame ? shape.color : 'transparent'
    }
  }, [shape])

  return (
    <div ref={rootRef} className={styles.textEditorOverlay}>
      {shape?.kind === 'text' && (
        <textarea
          ref={editorRef}
          value={shape.annotation}
          style={editorStyle}
          className={styles.textEditor}
          rows={1}
          maxLength={200}
          aria-label="编辑文本框"
          placeholder="输入文本"
          onChange={(event) => {
            onUpdate(event.target.value)
            resizeEditor()
          }}
        />
      )}
    </div>
  )
}

export default InlineTextEditor
