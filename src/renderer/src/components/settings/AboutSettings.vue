<script setup lang="ts">
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { useUpdaterStore } from '@renderer/stores/updater'
import { logger } from '../../../../common/logger'

const updaterStore = useUpdaterStore()
const copying = ref(false)

const versionText = computed(() => (updaterStore.currentVersion ? `v${updaterStore.currentVersion}` : '未知'))

async function copyDiagnostics(): Promise<void> {
  if (copying.value) return
  copying.value = true
  try {
    await window.guEarth.logs.copy(logger.dump())
    message.success('诊断日志已复制到剪贴板')
  } catch {
    message.error('复制失败，请重试')
  } finally {
    copying.value = false
  }
}
</script>

<template>
  <section class="settings-section" aria-label="关于">
    <h3 class="section-title">关于</h3>

    <div class="settings-block">
      <div class="setting-row">
        <div class="setting-copy">
          <div class="setting-title">当前版本</div>
          <p class="setting-desc version-text">{{ versionText }}</p>
        </div>
        <a-button :loading="updaterStore.checking" @click="updaterStore.checkNow()"><ReloadOutlined />检查更新</a-button>
      </div>
    </div>

    <div class="settings-block">
      <div class="setting-row">
        <div class="setting-copy">
          <div class="setting-title">复制诊断信息</div>
          <p class="setting-desc">若需要反馈问题，请复制诊断信息给开发者参考</p>
        </div>
        <a-button :loading="copying" @click="copyDiagnostics"><CopyOutlined />复制</a-button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-section{height:100%;overflow-y:auto;padding:24px;box-sizing:border-box}
.section-title{margin:0;color:rgba(0,0,0,0.88);font-size:20px;font-weight:600;line-height:28px}
.section-desc{margin:4px 0 0;color:rgba(0,0,0,0.45);font-size:12px;line-height:20px}
.settings-block{padding:16px 0;margin-top:16px;border-bottom:1px solid rgba(5,5,5,0.06)}
.settings-block:last-child{border-bottom:none}
.setting-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.setting-copy{flex:1;min-width:0}
.setting-title{color:rgba(0,0,0,0.88);font-size:14px;line-height:22px}
.setting-desc{margin:4px 0 0;color:rgba(0,0,0,0.45);font-size:12px;line-height:20px}
.version-text{color:rgba(0,0,0,0.65);font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:13px;line-height:20px}
</style>
