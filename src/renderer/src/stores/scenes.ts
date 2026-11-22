import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

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
  fps: number
  error: string
  cancelled: boolean
}

export interface ScenesState {
  scenes: TeachingScene[]
  hydrated: boolean
  saveError: string
  isPresenting: boolean
  recording: RecordingSessionState
}

export interface ScenesActions {
  hydrate: () => Promise<void>
  persist: () => Promise<void>
  addScene: (scene: Omit<TeachingScene, 'createdAt'>) => Promise<TeachingScene>
  updateScene: (
    id: string,
    changes: Partial<Pick<TeachingScene, 'name' | 'narration' | 'dwellMs' | 'flyDurationMs'>>
  ) => Promise<void>
  removeScene: (id: string) => Promise<void>
  moveScene: (id: string, offset: -1 | 1) => Promise<void>
  setPresenting: (value: boolean) => void
  setRecording: (patch: Partial<RecordingSessionState>) => void
  skipRecordingPrewarm: () => void
  applyRecordingResult: (result: RecordingSaveResult) => void
}

export type ScenesStore = ScenesState & ScenesActions

const idleRecording: RecordingSessionState = {
  state: 'idle',
  title: '',
  currentStep: 0,
  totalSteps: 0,
  prewarmStep: 0,
  prewarmTotal: 0,
  prewarmMessage: '',
  prewarmTimedOut: false,
  skipPrewarm: false,
  prewarmQuality: 'high',
  videoPath: '',
  bytes: 0,
  fps: 0,
  error: '',
  cancelled: false
}

export function createInitialScenesState(): ScenesState {
  return {
    scenes: [],
    hydrated: false,
    saveError: '',
    isPresenting: false,
    recording: { ...idleRecording }
  }
}

export const useScenesStore = create<ScenesStore>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialScenesState(),
    async hydrate(): Promise<void> {
      if (get().hydrated || typeof window === 'undefined' || !window.guEarth?.scenes) return
      set({ hydrated: true })
      try {
        const document = await window.guEarth.scenes.load()
        set({ scenes: [...document.scenes] })
      } catch {
        set({ scenes: [] })
      }
    },
    async persist(): Promise<void> {
      set({ saveError: '' })
      try {
        const plain = JSON.parse(JSON.stringify({ scenes: get().scenes })) as {
          scenes: TeachingScene[]
        }
        await window.guEarth.scenes.save(plain)
      } catch (error) {
        set({
          saveError:
            error instanceof Error
              ? error.message.replace(/^Error invoking remote method 'scenes:save':\s*/, '')
              : '场景保存失败，请重试'
        })
      }
    },
    async addScene(scene: Omit<TeachingScene, 'createdAt'>): Promise<TeachingScene> {
      await get().hydrate()
      const record: TeachingScene = { ...scene, createdAt: Date.now() }
      set(state => ({ scenes: [...state.scenes, record] }))
      await get().persist()
      return record
    },
    async updateScene(
      id: string,
      changes: Partial<Pick<TeachingScene, 'name' | 'narration' | 'dwellMs' | 'flyDurationMs'>>
    ): Promise<void> {
      set(state => ({
        scenes: state.scenes.map(scene => (scene.id === id ? { ...scene, ...changes } : scene))
      }))
      await get().persist()
    },
    async removeScene(id: string): Promise<void> {
      set(state => ({
        scenes: state.scenes.filter(scene => scene.id !== id)
      }))
      await get().persist()
    },
    async moveScene(id: string, offset: -1 | 1): Promise<void> {
      const current = get().scenes
      const index = current.findIndex(scene => scene.id === id)
      const target = index + offset
      if (index < 0 || target < 0 || target >= current.length) return
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      set({ scenes: next })
      await get().persist()
    },
    setPresenting(value: boolean): void {
      set({ isPresenting: value })
    },
    setRecording(patch: Partial<RecordingSessionState>): void {
      set(state => ({ recording: { ...state.recording, ...patch } }))
    },
    skipRecordingPrewarm(): void {
      set(state => ({ recording: { ...state.recording, skipPrewarm: true } }))
    },
    applyRecordingResult(result: RecordingSaveResult): void {
      set(state => ({
        recording: {
          ...state.recording,
          state: 'done',
          videoPath: result.path,
          bytes: result.bytes,
          fps: result.fps ?? 0
        }
      }))
    }
  }))
)

export function resetScenesStore(): void {
  useScenesStore.setState(createInitialScenesState())
}
