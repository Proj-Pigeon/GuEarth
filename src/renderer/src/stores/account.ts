import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AccountPhase, AccountProfile, AccountState } from '../../../preload'
import { accountPhaseLabel } from '../../../common/passport'

let bound = false

function stripIpcErrorPrefix(value: unknown): string {
  if (value instanceof Error) return value.message.replace(/^Error invoking remote method '[^']+':?\s*(Error:\s*)?/i, '')
  return '未知错误'
}

export const useAccountStore = defineStore('account', () => {
  const phase = ref<AccountPhase>('signed-out')
  const profile = ref<AccountProfile | null>(null)
  const userCode = ref('')
  const verificationUri = ref('')
  const challengeExpiresAt = ref(0)
  const signedInAt = ref(0)
  const error = ref('')
  const pendingRemoteRevocation = ref(false)
  const deviceListUrl = ref('')
  const hydrated = ref(false)
  const busy = ref(false)
  const canceling = ref(false)

  const signedIn = computed(() => phase.value === 'signed-in' && profile.value !== null)
  const loginInProgress = computed(() => phase.value === 'creating' || phase.value === 'awaiting-approval' || phase.value === 'finalizing')
  const remainingSeconds = computed(() => {
    if (!challengeExpiresAt.value) return 0
    return Math.max(0, Math.ceil((challengeExpiresAt.value - Date.now()) / 1000))
  })
  const displayName = computed(() => {
    const current = profile.value
    if (!current) return ''
    return current.name || current.username || current.sub
  })
  const phaseLabel = computed(() => accountPhaseLabel(phase.value))

  function applyState(state: AccountState): void {
    phase.value = state.phase
    profile.value = state.profile
    userCode.value = state.challenge?.userCode ?? ''
    verificationUri.value = state.challenge?.verificationUri ?? ''
    challengeExpiresAt.value = state.challenge?.expiresAt ?? 0
    signedInAt.value = state.signedInAt
    error.value = state.error
    pendingRemoteRevocation.value = state.pendingRemoteRevocation
    deviceListUrl.value = state.deviceListUrl
    hydrated.value = true
  }

  async function hydrate(): Promise<void> {
    if (bound) return
    bound = true
    window.guEarth.account.onState(applyState)
    try {
      applyState(await window.guEarth.account.getState())
    } catch {
      hydrated.value = true
    }
  }

  async function run(task: () => Promise<AccountState>): Promise<void> {
    if (busy.value) return
    busy.value = true
    try {
      applyState(await task())
    } catch (caught) {
      error.value = stripIpcErrorPrefix(caught)
    } finally {
      busy.value = false
    }
  }

  async function login(): Promise<void> {
    if (loginInProgress.value) return
    await run(() => window.guEarth.account.login())
  }

  async function cancelLogin(): Promise<void> {
    if (canceling.value) return
    canceling.value = true
    try {
      applyState(await window.guEarth.account.cancelLogin())
    } catch (caught) {
      error.value = stripIpcErrorPrefix(caught)
    } finally {
      canceling.value = false
    }
  }

  async function signOut(): Promise<void> {
    await run(() => window.guEarth.account.signOut())
  }

  async function dismissRevocationWarning(): Promise<void> {
    await run(() => window.guEarth.account.dismissRevocationWarning())
  }

  async function openDeviceList(): Promise<void> {
    try {
      await window.guEarth.account.openDeviceList()
    } catch {
      error.value = '无法打开账号页设备列表'
    }
  }

  async function openVerification(): Promise<void> {
    try {
      await window.guEarth.account.openVerification()
    } catch {
      error.value = '无法打开登录确认页，请重新发起登录'
    }
  }

  function clearError(): void {
    error.value = ''
  }

  return {
    phase,
    profile,
    userCode,
    verificationUri,
    challengeExpiresAt,
    signedInAt,
    error,
    pendingRemoteRevocation,
    deviceListUrl,
    hydrated,
    busy,
    canceling,
    signedIn,
    loginInProgress,
    remainingSeconds,
    displayName,
    phaseLabel,
    hydrate,
    login,
    cancelLogin,
    signOut,
    dismissRevocationWarning,
    openDeviceList,
    openVerification,
    clearError
  }
})
