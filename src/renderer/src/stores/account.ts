import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { AccountPhase, AccountProfile, AccountState } from '../../../preload'
import { accountPhaseLabel } from '../../../common/passport'
import { ipcErrorMessage } from '../lib/ipcError'
import { isTelemetryEnabled, onPrivacySettingsChange } from '../lib/privacyRuntime'
import { identifyTelemetryUser, isTelemetryUserIdentified, resetTelemetryIdentity } from '../posthog'

export interface AccountStoreState {
  phase: AccountPhase
  profile: AccountProfile | null
  userCode: string
  verificationUri: string
  challengeExpiresAt: number
  signedInAt: number
  error: string
  pendingRemoteRevocation: boolean
  deviceListUrl: string
  hydrated: boolean
  busy: boolean
  canceling: boolean
  signedIn: boolean
  loginInProgress: boolean
  remainingSeconds: number
  displayName: string
  phaseLabel: string
}

export interface AccountStoreActions {
  hydrate: () => Promise<void>
  login: () => Promise<void>
  cancelLogin: () => Promise<void>
  signOut: () => Promise<void>
  dismissRevocationWarning: () => Promise<void>
  openDeviceList: () => Promise<void>
  openVerification: () => Promise<void>
  clearError: () => void
}

export type AccountStore = AccountStoreState & AccountStoreActions

export function selectAccountSignedIn(state: Pick<AccountStoreState, 'phase' | 'profile'>): boolean {
  return state.phase === 'signed-in' && state.profile !== null
}

export function selectAccountLoginInProgress(state: Pick<AccountStoreState, 'phase'>): boolean {
  return state.phase === 'creating' || state.phase === 'awaiting-approval' || state.phase === 'finalizing'
}

export function selectAccountRemainingSeconds(state: Pick<AccountStoreState, 'challengeExpiresAt'>): number {
  if (!state.challengeExpiresAt) {return 0}
  return Math.max(0, Math.ceil((state.challengeExpiresAt - Date.now()) / 1000))
}

export function selectAccountDisplayName(state: Pick<AccountStoreState, 'profile'>): string {
  const current = state.profile
  if (!current) {return ''}
  return current.name || current.username || current.sub
}

export function selectAccountPhaseLabel(state: Pick<AccountStoreState, 'phase'>): string {
  return accountPhaseLabel(state.phase)
}

function deriveAccountFields(
  phase: AccountPhase,
  profile: AccountProfile | null,
  challengeExpiresAt: number
): Pick<AccountStoreState, 'signedIn' | 'loginInProgress' | 'remainingSeconds' | 'displayName' | 'phaseLabel'> {
  return {
    signedIn: selectAccountSignedIn({ phase, profile }),
    loginInProgress: selectAccountLoginInProgress({ phase }),
    remainingSeconds: selectAccountRemainingSeconds({ challengeExpiresAt }),
    displayName: selectAccountDisplayName({ profile }),
    phaseLabel: selectAccountPhaseLabel({ phase })
  }
}

export function createInitialAccountState(): AccountStoreState {
  const phase: AccountPhase = 'signed-out'
  const profile: AccountProfile | null = null
  const challengeExpiresAt = 0
  return {
    phase,
    profile,
    userCode: '',
    verificationUri: '',
    challengeExpiresAt,
    signedInAt: 0,
    error: '',
    pendingRemoteRevocation: false,
    deviceListUrl: '',
    hydrated: false,
    busy: false,
    canceling: false,
    ...deriveAccountFields(phase, profile, challengeExpiresAt)
  }
}

let bound = false
let identifiedSub: string | null = null
let unsubscribePrivacy: (() => void) | null = null
let unsubscribeAccountState: (() => void) | null = null

function syncIdentity(currentPhase: AccountPhase, currentProfile: AccountProfile | null): void {
  const nextSub = currentPhase === 'signed-in' ? currentProfile?.sub.trim() ?? '' : ''

  if (!isTelemetryEnabled()) {
    if (identifiedSub || isTelemetryUserIdentified()) {resetTelemetryIdentity()}
    identifiedSub = null
    return
  }

  if (nextSub) {
    if (identifiedSub && nextSub !== identifiedSub) {resetTelemetryIdentity()}
    if (nextSub !== identifiedSub || !isTelemetryUserIdentified()) {
      const personProperties: Record<string, string> = {}
      if (currentProfile?.email) {personProperties.email = currentProfile.email}
      if (currentProfile?.name) {personProperties.name = currentProfile.name}
      identifyTelemetryUser(nextSub, personProperties)
      identifiedSub = nextSub
    }
    return
  }

  if (identifiedSub || isTelemetryUserIdentified()) {
    resetTelemetryIdentity()
    identifiedSub = null
  }
}

function applyAccountSnapshot(state: AccountState): void {
  syncIdentity(state.phase, state.profile)
  const challengeExpiresAt = state.challenge?.expiresAt ?? 0
  useAccountStore.setState({
    phase: state.phase,
    profile: state.profile,
    userCode: state.challenge?.userCode ?? '',
    verificationUri: state.challenge?.verificationUri ?? '',
    challengeExpiresAt,
    signedInAt: state.signedInAt,
    error: state.error,
    pendingRemoteRevocation: state.pendingRemoteRevocation,
    deviceListUrl: state.deviceListUrl,
    hydrated: true,
    ...deriveAccountFields(state.phase, state.profile, challengeExpiresAt)
  })
}

export const useAccountStore = create<AccountStore>()(
  subscribeWithSelector((set, get) => {
    async function run(task: () => Promise<AccountState>): Promise<void> {
      if (get().busy) {return}
      set({ busy: true })
      try {
        applyAccountSnapshot(await task())
      } catch (error) {
        set({ error: ipcErrorMessage(error) })
      } finally {
        set({ busy: false })
      }
    }

    return {
      ...createInitialAccountState(),
      async hydrate(): Promise<void> {
        if (bound) {return}
        bound = true
        unsubscribePrivacy = onPrivacySettingsChange(() => {
          const current = get()
          syncIdentity(current.phase, current.profile)
        })
        unsubscribeAccountState = window.guEarth.account.onState(applyAccountSnapshot)
        try {
          applyAccountSnapshot(await window.guEarth.account.getState())
        } catch {
          set({ hydrated: true })
        }
      },
      async login(): Promise<void> {
        if (get().loginInProgress) {return}
        await run(() => window.guEarth.account.login())
      },
      async cancelLogin(): Promise<void> {
        if (get().canceling) {return}
        set({ canceling: true })
        try {
          applyAccountSnapshot(await window.guEarth.account.cancelLogin())
        } catch (error) {
          set({ error: ipcErrorMessage(error) })
        } finally {
          set({ canceling: false })
        }
      },
      async signOut(): Promise<void> {
        await run(() => window.guEarth.account.signOut())
      },
      async dismissRevocationWarning(): Promise<void> {
        await run(() => window.guEarth.account.dismissRevocationWarning())
      },
      async openDeviceList(): Promise<void> {
        try {
          await window.guEarth.account.openDeviceList()
        } catch {
          set({ error: '无法打开账号页设备列表' })
        }
      },
      async openVerification(): Promise<void> {
        try {
          await window.guEarth.account.openVerification()
        } catch {
          set({ error: '无法打开登录确认页，请重新发起登录' })
        }
      },
      clearError(): void {
        set({ error: '' })
      }
    }
  })
)

export function resetAccountStore(): void {
  if (unsubscribePrivacy) {
    unsubscribePrivacy()
    unsubscribePrivacy = null
  }
  if (unsubscribeAccountState) {
    unsubscribeAccountState()
    unsubscribeAccountState = null
  }
  bound = false
  identifiedSub = null
  useAccountStore.setState(createInitialAccountState())
}
