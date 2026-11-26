import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { datePartsOf, formatClock, presetDate, shiftDate } from '@renderer/thematic/solarMath';
import type { DateParts, SolarPreset } from '@renderer/thematic/solarMath';

const BEIJING_OFFSET_HOURS = 8
const HOURS_PER_SECOND = 1.5
const DAYS_PER_SECOND = 12

export type MotionPanel = 'solar-path' | 'obliquity' | 'rotation-speed'

function beijingNow(): { date: string; hour: number } {
  const ms = Date.now() + BEIJING_OFFSET_HOURS * 3_600_000
  return { date: new Date(ms).toISOString().slice(0, 10), hour: (ms % 86_400_000) / 3_600_000 }
}

export interface SolarState {
  active: boolean
  date: string
  hour: number
  isPlaying: boolean
  isAnnualPlaying: boolean
  motionPanel: MotionPanel | null
  utcMs: number
  utcHour: number
  parts: DateParts
  beijingClock: string
  utcClock: string
}

export interface SolarActions {
  setActive: (value: boolean) => void
  setMotionPanel: (panel: MotionPanel | null) => void
  setDate: (value: string) => void
  setHour: (value: number) => void
  setPreset: (preset: SolarPreset) => void
  togglePlaying: () => void
  toggleAnnualPlaying: () => void
  advance: (dtSeconds: number) => void
}

export type SolarStore = SolarState & SolarActions

export function selectSolarUtcMs(state: Pick<SolarState, 'date' | 'hour'>): number {
  return Date.parse(`${state.date}T00:00:00Z`) + (state.hour - BEIJING_OFFSET_HOURS) * 3_600_000
}

export function selectSolarUtcHour(state: Pick<SolarState, 'hour'>): number {
  return (((state.hour - BEIJING_OFFSET_HOURS) % 24) + 24) % 24
}

export function selectSolarParts(state: Pick<SolarState, 'date'>): DateParts {
  return datePartsOf(state.date)
}

export function selectBeijingClock(state: Pick<SolarState, 'hour'>): string {
  return formatClock(state.hour)
}

export function selectUtcClock(state: Pick<SolarState, 'hour'>): string {
  return formatClock(selectSolarUtcHour(state))
}

function deriveSolarFields(date: string, hour: number): Pick<SolarState, 'utcMs' | 'utcHour' | 'parts' | 'beijingClock' | 'utcClock'> {
  const utcHour = selectSolarUtcHour({ hour })
  return {
    utcMs: selectSolarUtcMs({ date, hour }),
    utcHour,
    parts: selectSolarParts({ date }),
    beijingClock: formatClock(hour),
    utcClock: formatClock(utcHour)
  }
}

export function createInitialSolarState(): SolarState {
  const initial = beijingNow()
  const date = initial.date
  const hour = Math.round(initial.hour * 4) / 4
  return {
    active: false,
    date,
    hour,
    isPlaying: false,
    isAnnualPlaying: false,
    motionPanel: null,
    ...deriveSolarFields(date, hour)
  }
}

export const useSolarStore = create<SolarStore>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialSolarState(),
    setActive(value: boolean): void {
      if (!value) {
        set({ active: false, isPlaying: false, isAnnualPlaying: false })
        return
      }
      set({ active: true })
    },
    setMotionPanel(panel: MotionPanel | null): void {
      set({ motionPanel: panel })
    },
    setDate(value: string): void {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {return}
      set((state) => ({ date: value, ...deriveSolarFields(value, state.hour) }))
    },
    setHour(value: number): void {
      if (!Number.isFinite(value)) {return}
      const hour = Math.min(24, Math.max(0, value))
      set((state) => ({ hour, ...deriveSolarFields(state.date, hour) }))
    },
    setPreset(preset: SolarPreset): void {
      const state = get()
      const year = Number(state.date.slice(0, 4))
      if (!Number.isFinite(year)) {return}
      const date = presetDate(preset, year)
      set({ date, ...deriveSolarFields(date, state.hour) })
    },
    togglePlaying(): void {
      set((state) => {
        const isPlaying = !state.isPlaying
        return {
          isPlaying,
          isAnnualPlaying: isPlaying ? false : state.isAnnualPlaying
        }
      })
    },
    toggleAnnualPlaying(): void {
      set((state) => {
        const isAnnualPlaying = !state.isAnnualPlaying
        return {
          isAnnualPlaying,
          isPlaying: isAnnualPlaying ? false : state.isPlaying
        }
      })
    },
    advance(dtSeconds: number): void {
      const state = get()
      if (state.isAnnualPlaying) {
        const year = Number(state.date.slice(0, 4))
        const startOfYear = Number.isFinite(year) ? Date.parse(`${year}-01-01T00:00:00Z`) : 0
        const span = Date.parse(`${(Number.isFinite(year) ? year : 2024) + 1}-01-01T00:00:00Z`) - startOfYear
        const ms = Date.parse(`${state.date}T00:00:00Z`) + dtSeconds * DAYS_PER_SECOND * 86_400_000
        const date = new Date(startOfYear + (((ms - startOfYear) % span) + span) % span).toISOString().slice(0, 10)
        set({ date, ...deriveSolarFields(date, state.hour) })
        return
      }
      if (!state.isPlaying) {return}
      const next = state.hour + dtSeconds * HOURS_PER_SECOND
      if (next >= 24) {
        const hour = next - 24
        const date = shiftDate(state.date, 1)
        set({ date, hour, ...deriveSolarFields(date, hour) })
      } else {
        set({ hour: next, ...deriveSolarFields(state.date, next) })
      }
    }
  }))
)

export function resetSolarStore(): void {
  useSolarStore.setState(createInitialSolarState())
}
