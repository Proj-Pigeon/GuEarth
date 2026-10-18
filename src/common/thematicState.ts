export const ENSO_PHASES = ['normal', 'el-nino', 'la-nina'] as const
export type EnsoPhase = (typeof ENSO_PHASES)[number]
export const ENSO_PHASE_SET: ReadonlySet<string> = new Set(ENSO_PHASES)

export const SEA_LEVEL_SCENARIOS = [0.5, 1, 2, 5] as const
export type SeaLevelScenario = (typeof SEA_LEVEL_SCENARIOS)[number]

export const HSR_START_YEAR = 2008
export const HSR_END_YEAR = 2025
