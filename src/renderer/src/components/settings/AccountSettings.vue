<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { CheckCircleOutlined, CopyOutlined, ExportOutlined, LoginOutlined, LogoutOutlined } from '@ant-design/icons-vue'
import { useAccountStore } from '@renderer/stores/account'

const account = useAccountStore()

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined

function startTicker(): void {
  if (ticker !== undefined) return
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 1000)
}

function stopTicker(): void {
  if (ticker === undefined) return
  clearInterval(ticker)
  ticker = undefined
}

const awaitingApproval = computed(() => account.phase === 'awaiting-approval' || account.phase === 'finalizing')

watch(
  () => awaitingApproval.value,
  (active) => {
    if (active) startTicker()
    else stopTicker()
  },
  { immediate: true }
)

const remainingSeconds = computed(() => {
  if (!account.challengeExpiresAt) return 0
  return Math.max(0, Math.ceil((account.challengeExpiresAt - now.value) / 1000))
})

const remainingText = computed(() => {
  const total = remainingSeconds.value
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
})

const challengeExpired = computed(() => account.phase === 'awaiting-approval' && remainingSeconds.value <= 0)

const displayName = computed(() => account.displayName || '未命名账户')
const avatarInitial = computed(() => Array.from(displayName.value)[0]?.toUpperCase() || 'U')
const emailText = computed(() => account.profile?.email || account.profile?.username || '')

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyUserCode(): Promise<void> {
  if (!account.userCode) return
  try {
    await navigator.clipboard.writeText(account.userCode)
  } catch {
    message.error('复制失败，请手动记录验证码')
    return
  }
  copied.value = true
  if (copiedTimer !== undefined) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
    copiedTimer = undefined
  }, 1600)
}

onBeforeUnmount(() => {
  stopTicker()
  if (copiedTimer !== undefined) clearTimeout(copiedTimer)
})

const loginLoading = computed(() => account.phase === 'creating' || account.phase === 'restoring')

function confirmSignOut(): void {
  Modal.confirm({
    title: '退出登录？',
    content: '为保证账户安全，退出后需要重新登录。',
    okText: '退出登录',
    okButtonProps: { danger: true },
    cancelText: '取消',
    onOk: () => account.signOut()
  })
}
</script>

<template>
  <section class="settings-section" aria-label="账户">
    <h3 class="section-title">账户</h3>

    <a-alert
      v-if="account.error"
      class="account-alert"
      type="error"
      show-icon
      :message="account.error"
      closable
      @close="account.clearError()"
    />

    <a-alert
      v-if="account.pendingRemoteRevocation"
      class="account-alert"
      type="warning"
      show-icon
      message="本机已退出，但鸽巢通行证端的设备授权未能撤销"
      description="请到账号页的设备列表手动撤销此设备，避免旧令牌继续有效。"
    >
      <template #action>
        <a-space direction="vertical" :size="4">
          <a-button size="small" @click="account.openDeviceList()"><ExportOutlined />打开设备列表</a-button>
          <a-button size="small" type="text" @click="account.dismissRevocationWarning()">我知道了</a-button>
        </a-space>
      </template>
    </a-alert>

    <div class="settings-block">
      <div v-if="account.signedIn" class="setting-row setting-row-center">
        <div class="account-identity">
          <a-avatar class="identity-avatar" :size="40">{{ avatarInitial }}</a-avatar>
          <div class="identity-copy">
            <div class="identity-name">{{ displayName }}</div>
            <div v-if="emailText" class="identity-email">{{ emailText }}</div>
          </div>
        </div>
        <a-button danger :loading="account.phase === 'signing-out'" :disabled="account.busy" @click="confirmSignOut">
          <LogoutOutlined />退出登录
        </a-button>
      </div>

      <template v-else-if="awaitingApproval">
        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-title-row">
              <span class="setting-title">{{ account.phase === 'finalizing' ? '正在完成登录' : '等待浏览器确认' }}</span>
              <a-tag :color="challengeExpired ? 'error' : 'processing'">
                {{ challengeExpired ? '已超时' : `剩余 ${remainingText}` }}
              </a-tag>
            </div>
            <p class="setting-desc">
              {{
                challengeExpired
                  ? '本次登录确认已超时，请取消后重新发起登录。'
                  : '已打开浏览器确认页；若未自动跳转，请打开确认页并核对下方验证码。'
              }}
            </p>
          </div>
          <a-button :loading="account.canceling" @click="account.cancelLogin()">取消登录</a-button>
        </div>

        <div v-if="account.userCode" class="challenge-bar">
          <div class="challenge-code" aria-label="登录验证码">{{ account.userCode }}</div>
          <a-space :size="8" wrap>
            <a-button size="small" @click="copyUserCode">
              <CheckCircleOutlined v-if="copied" />
              <CopyOutlined v-else />
              {{ copied ? '已复制' : '复制验证码' }}
            </a-button>
            <a-button size="small" :disabled="!account.verificationUri" @click="account.openVerification()">
              <ExportOutlined />打开确认页
            </a-button>
          </a-space>
        </div>
      </template>

      <div v-else class="setting-row">
        <div class="setting-copy">
          <div class="setting-title">登录</div>
          <p class="setting-desc">
            通过 鸽巢通行证 登录咕咕地球。
          </p>
        </div>
        <a-button
          type="primary"
          :loading="loginLoading"
          :disabled="account.busy || account.phase === 'restoring'"
          @click="account.login()"
        >
          <LoginOutlined v-if="!loginLoading" />登录
        </a-button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-section{height:100%;overflow-y:auto;padding:24px;box-sizing:border-box}
.section-title{margin:0;color:rgba(0,0,0,0.88);font-size:20px;font-weight:600;line-height:28px}
.account-alert{margin-top:16px}
.settings-block{padding:16px 0;margin-top:16px;border-bottom:1px solid rgba(5,5,5,0.06)}
.settings-block:last-child{border-bottom:none}
.setting-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.setting-row-center{align-items:center}
.setting-copy{flex:1;min-width:0}
.setting-title-row{display:flex;align-items:center;gap:8px}
.setting-title{color:rgba(0,0,0,0.88);font-size:14px;line-height:22px}
.setting-desc{margin:4px 0 0;color:rgba(0,0,0,0.45);font-size:12px;line-height:20px}
.account-identity{display:flex;align-items:center;gap:12px;flex:1;min-width:0}
.identity-avatar{flex:none;background:#1677ff;color:#ffffff;font-size:16px;font-weight:600}
.identity-copy{min-width:0}
.identity-name{color:rgba(0,0,0,0.88);font-size:14px;font-weight:600;line-height:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.identity-email{margin-top:0;color:rgba(0,0,0,0.45);font-size:12px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.challenge-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:12px;padding:12px 16px;border:1px solid rgba(5,5,5,0.06);border-radius:6px;background:rgba(0,0,0,0.02)}
.challenge-code{color:rgba(0,0,0,0.88);font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:20px;font-weight:600;letter-spacing:2px;line-height:28px;user-select:all}
</style>
