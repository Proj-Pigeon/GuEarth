import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { RecordingSaveResult, TeachingScene } from '../../../preload'

export type RecordingStateValue = 'idle' | 'preparing' | 'recording' | 'saving' | 'done' | 'error'
export type RecordingPrewarmQuality = 'standard' | 'high' | 'ultra'

export interface RecordingSessionState {
  state: RecordingStateValue
  title: string
  currentStep: number
  totalSteps: number
  prewarmStep: number
  prewarmTotal: number
  prewarmMessage: string
  prewarmTimedOut: boolean
  skipPrewarm: boolean
  prewarmQuality: RecordingPrewarmQuality
  videoPath: string
  bytes: number
  error: string
  cancelled: boolean
}

const idleRecording: RecordingSessionState = { state: 'idle', title: '', currentStep: 0, totalSteps: 0, prewarmStep: 0, prewarmTotal: 0, prewarmMessage: '', prewarmTimedOut: false, skipPrewarm: false, prewarmQuality: 'high', videoPath: '', bytes: 0, error: '', cancelled: false }

export const useScenesStore = defineStore('scenes', () => {
  const scenes = ref<TeachingScene[]>([])
  const hydrated = ref(false)
  const saveError = ref('')
  const isPresenting = ref(false)
  const recording = ref<RecordingSessionState>({ ...idleRecording })

  async function hydrate(): Promise<void> {
    if (hydrated.value || !window.guEarth?.scenes) return
    hydrated.value = true
    try {
      const document = await window.guEarth.scenes.load()
      scenes.value = document.scenes
    } catch {
      scenes.value = []
    }
  }

  async function persist(): Promise<void> {
    saveError.value = ''
    try {
      const plain = JSON.parse(JSON.stringify({ scenes: scenes.value })) as { scenes: TeachingScene[] }
      await window.guEarth.scenes.save(plain)
    } catch (error) {
      saveError.value = error instanceof Error ? error.message.replace(/^Error invoking remote method 'scenes:save':\s*/, '') : '场景保存失败，请重试'
    }
  }

  async function addScene(scene: Omit<TeachingScene, 'createdAt'>): Promise<TeachingScene> {
    await hydrate()
    const record: TeachingScene = { ...scene, createdAt: Date.now() }
    scenes.value = [...scenes.value, record]
    await persist()
    return record
  }

  async function updateScene(id: string, changes: Partial<Pick<TeachingScene, 'name' | 'narration' | 'dwellMs' | 'flyDurationMs'>>): Promise<void> {
    scenes.value = scenes.value.map((scene) => (scene.id === id ? { ...scene, ...changes } : scene))
    await persist()
  }

  async function removeScene(id: string): Promise<void> {
    scenes.value = scenes.value.filter((scene) => scene.id !== id)
    await persist()
  }

  async function moveScene(id: string, offset: -1 | 1): Promise<void> {
    const index = scenes.value.findIndex((scene) => scene.id === id)
    const target = index + offset
    if (index < 0 || target < 0 || target >= scenes.value.length) return
    const next = [...scenes.value]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    scenes.value = next
    await persist()
  }

  function setPresenting(value: boolean): void {
    isPresenting.value = value
  }

  function setRecording(patch: Partial<RecordingSessionState>): void {
    recording.value = { ...recording.value, ...patch }
  }

  function skipRecordingPrewarm(): void {
    recording.value = { ...recording.value, skipPrewarm: true }
  }

  function applyRecordingResult(result: RecordingSaveResult): void {
    recording.value = { ...recording.value, state: 'done', videoPath: result.path, bytes: result.bytes }
  }

  return {
    scenes, hydrated, saveError, isPresenting, recording,
    hydrate, persist, addScene, updateScene, removeScene, moveScene, setPresenting, setRecording, skipRecordingPrewarm, applyRecordingResult
  }
})
