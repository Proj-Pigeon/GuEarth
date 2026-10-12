<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { FolderOpenOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue'
import { useSettingsWindowStore } from '@renderer/stores/settingsWindow'

const emit = defineEmits<{ restartGuide: [] }>()
const settingsWindow = useSettingsWindowStore()

const directory = ref<string | null>(null)
const choosing = ref(false)

onMounted(() => {
  window.guEarth.recordings.getDirectory().then((value) => {
    directory.value = value
  }).catch(() => undefined)
})

async function chooseDirectory(): Promise<void> {
  if (choosing.value) return
  choosing.value = true
  try {
    const next = await window.guEarth.recordings.chooseDirectory()
    if (next) {
      directory.value = next
      message.success('保存目录已更新')
    }
  } catch {
    message.error('选择目录失败，请重试')
  } finally {
    choosing.value = false
  }
}

async function restartGuide(): Promise<void> {
  await window.guEarth.settings.update({ setupGuideDismissed: false }).catch(() => undefined)
  settingsWindow.close()
  emit('restartGuide')
}
</script>

<template>
  <section class="settings-section" aria-label="通用设置">
    <h3 class="section-title">通用</h3>

    <div class="settings-block">
      <div class="setting-row">
        <div class="setting-copy">
          <div class="setting-title">录制保存目录</div>
          <p class="setting-desc">教学场景视频录制默认保存的位置。</p>
        </div>
        <a-button :loading="choosing" @click="chooseDirectory"><FolderOpenOutlined />更改目录</a-button>
      </div>
      <div v-if="directory" class="directory-path">{{ directory }}</div>
      <div v-else class="directory-path directory-empty">未设置</div>
    </div>

    <div class="settings-block">
      <div class="setting-row">
        <div class="setting-copy">
          <div class="setting-title">新手引导</div>
          <p class="setting-desc">从头开始进行新手引导</p>
        </div>
        <a-button @click="restartGuide"><QuestionCircleOutlined />重新运行引导</a-button>
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
.directory-path{margin-top:12px;padding:8px 12px;border:1px solid rgba(5,5,5,0.06);border-radius:6px;background:rgba(0,0,0,0.02);color:rgba(0,0,0,0.65);font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:13px;line-height:20px;word-break:break-all}
.directory-empty{font-family:inherit;color:rgba(0,0,0,0.45)}
</style>
