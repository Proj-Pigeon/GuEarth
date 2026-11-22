import type { CameraReadout } from '@renderer/stores/globe'

import styles from './CameraStatus.module.css'

export interface CameraStatusProps {
  camera: CameraReadout
}

function formatCoordinate(value: number, isLongitude: boolean): string {
  const abs = Math.abs(value)
  const direction = isLongitude ? (value >= 0 ? 'E' : 'W') : value >= 0 ? 'N' : 'S'
  return `${abs.toFixed(4)}°${direction}`
}

function formatHeight(height: number): string {
  if (height > 1000000) return `${(height / 1000000).toFixed(2)} Mm`
  if (height > 1000) return `${(height / 1000).toFixed(2)} km`
  return `${height.toFixed(0)} m`
}

function formatAngle(angle: number): string {
  return `${angle.toFixed(1)}°`
}

export function CameraStatus({ camera }: CameraStatusProps) {
  return (
    <div className={styles.cameraStatus}>
      <div className={styles.statusItem}>
        <span className={styles.label}>Lon</span>
        <span className={styles.value}>{formatCoordinate(camera.longitude, true)}</span>
      </div>
      <div className={styles.statusItem}>
        <span className={styles.label}>Lat</span>
        <span className={styles.value}>{formatCoordinate(camera.latitude, false)}</span>
      </div>
      <div className={styles.statusItem}>
        <span className={styles.label}>Alt</span>
        <span className={styles.value}>{formatHeight(camera.height)}</span>
      </div>
      <div className={styles.statusItem}>
        <span className={styles.label}>Heading</span>
        <span className={styles.value}>{formatAngle(camera.heading)}</span>
      </div>
      <div className={styles.statusItem}>
        <span className={styles.label}>Pitch</span>
        <span className={styles.value}>{formatAngle(camera.pitch)}</span>
      </div>
    </div>
  )
}

export default CameraStatus
