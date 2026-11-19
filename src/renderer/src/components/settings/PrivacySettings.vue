<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { PRIVACY_DISCLOSURES, privacyDisclosureFor, type PrivacySettingKey } from '../../../../common/privacy'
import { usePrivacyStore } from '@renderer/stores/privacy'

const privacyStore = usePrivacyStore()

const savingKey = ref<PrivacySettingKey | null>(null)
const pendingKey = ref<PrivacySettingKey | null>(null)
const confirmLoading = ref(false)

const pendingDisclosure = computed(() => (pendingKey.value ? privacyDisclosureFor(pendingKey.value) : null))

onMounted(() => {
  void privacyStore.hydrate()
})

function isEnabled(key: PrivacySettingKey): boolean {
  if (key === 'errorReportingEnabled') return privacyStore.errorReportingEnabled
  if (key === 'telemetryEnabled') return privacyStore.telemetryEnabled
  return privacyStore.aiTelemetryEnabled
}

async function handleSwitchChange(key: PrivacySettingKey, checked: string | number | boolean): Promise<void> {
  if (!privacyStore.hydrated || savingKey.value || confirmLoading.value) return
  if (checked === true) {
    pendingKey.value = key
    return
  }
  savingKey.value = key
  try {
    const saved = await privacyStore.setPrivacySetting(key, false)
    if (saved) message.success(`已关闭“${privacyDisclosureFor(key).title}”`)
    else message.error('隐私设置保存失败，请重试')
  } finally {
    savingKey.value = null
  }
}

function cancelEnable(): void {
  if (confirmLoading.value) return
  pendingKey.value = null
}

async function confirmEnable(): Promise<void> {
  const key = pendingKey.value
  if (!key || confirmLoading.value) return
  confirmLoading.value = true
  try {
    const saved = await privacyStore.setPrivacySetting(key, true)
    if (saved) {
      pendingKey.value = null
      message.success(`已开启“${privacyDisclosureFor(key).title}”`)
    } else {
      message.error('隐私设置保存失败，请重试')
    }
  } finally {
    confirmLoading.value = false
  }
}
</script>

<template>
  <section class="settings-section" aria-label="隐私设置">
    <h3 class="section-title">隐私</h3>

    <div v-for="item in PRIVACY_DISCLOSURES" :key="item.key" class="settings-block">
      <div class="setting-row">
        <div class="setting-copy">
          <div class="setting-title-row">
            <span class="setting-title">{{ item.title }}</span>
            <a-tag :color="isEnabled(item.key) ? 'blue' : undefined">
              {{ isEnabled(item.key) ? '已开启' : '已关闭' }}
            </a-tag>
          </div>
          <p class="setting-desc">{{ item.summary }}</p>
        </div>
        <a-switch
          :checked="isEnabled(item.key)"
          :loading="savingKey === item.key"
          :disabled="!privacyStore.hydrated || confirmLoading"
          :aria-label="item.title"
          @change="(checked: string | number | boolean) => handleSwitchChange(item.key, checked)"
        />
      </div>
    </div>

    <a-modal
      :open="pendingDisclosure !== null"
      :title="pendingDisclosure?.confirmTitle"
      :width="520"
      :z-index="1300"
      :mask-closable="false"
      :closable="!confirmLoading"
      :keyboard="!confirmLoading"
      centered
      @cancel="cancelEnable"
    >
      <div v-if="pendingDisclosure" class="disclosure-body">
        <p class="disclosure-intro">{{ pendingDisclosure.confirmIntro }}</p>
        <div class="disclosure-card">
          <div class="disclosure-card-title">可能会收集、处理并上传的数据项</div>
          <ul class="disclosure-list">
            <li v-for="(entry, index) in pendingDisclosure.collectedItems" :key="index">{{ entry }}</li>
          </ul>
        </div>
        <p class="disclosure-destination">{{ pendingDisclosure.destinations }}</p>
        <p class="disclosure-notice">{{ pendingDisclosure.notice }}</p>
      </div>
      <template #footer>
        <div class="disclosure-footer">
          <a-button :disabled="confirmLoading" @click="cancelEnable">取消</a-button>
          <a-button type="primary" :loading="confirmLoading" @click="confirmEnable">已知晓并开启</a-button>
        </div>
      </template>
    </a-modal>
  </section>
</template>

<style scoped>
.settings-section{height:100%;overflow-y:auto;padding:24px;box-sizing:border-box}
.section-title{margin:0;color:rgba(0,0,0,0.88);font-size:20px;font-weight:600;line-height:28px}
.settings-block{padding:16px 0;margin-top:16px;border-bottom:1px solid rgba(5,5,5,0.06)}
.settings-block:last-child{border-bottom:none}
.setting-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.setting-copy{flex:1;min-width:0}
.setting-title-row{display:flex;align-items:center;gap:8px}
.setting-title{color:rgba(0,0,0,0.88);font-size:14px;line-height:22px}
.setting-desc{margin:4px 0 0;color:rgba(0,0,0,0.45);font-size:12px;line-height:20px}
.disclosure-body{display:flex;flex-direction:column;gap:12px}
.disclosure-intro{margin:0;color:rgba(0,0,0,0.88);font-size:14px;line-height:22px}
.disclosure-card{padding:12px 16px;border:1px solid rgba(5,5,5,0.06);border-radius:6px;background:rgba(0,0,0,0.02)}
.disclosure-card-title{margin-bottom:8px;color:rgba(0,0,0,0.88);font-size:13px;font-weight:600;line-height:20px}
.disclosure-list{margin:0;padding-left:18px;color:rgba(0,0,0,0.65);font-size:13px;line-height:21px;display:flex;flex-direction:column;gap:6px}
.disclosure-destination{margin:0;color:rgba(0,0,0,0.65);font-size:13px;line-height:20px}
.disclosure-notice{margin:0;color:rgba(0,0,0,0.45);font-size:12px;line-height:20px}
.disclosure-footer{display:flex;justify-content:flex-end;gap:8px}
</style>
