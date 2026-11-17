<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { MirrorPolicyId } from '../../../common/mirrorPolicies'
import { useGlobeStore } from '@renderer/stores/globe'

const globeStore = useGlobeStore()
const { mirrorConsentOpen, mirrorConsentReason } = storeToRefs(globeStore)

const agreed = ref(false)

watch(mirrorConsentOpen, (open) => {
  if (open) agreed.value = false
})

const detectionNotice = computed(() => {
  if (mirrorConsentReason.value === 'slow') {
    return '检测到您当前网络访问海外地图资源受限或加载时间过长，可能会影响底图、三维地形与教学数据的显示。'
  }
  if (mirrorConsentReason.value === 'china') {
    return '您似乎位于中国大陆，直接访问海外地图与地理数据服务可能会遇到连接缓慢或无法加载的情况。'
  }
  return ''
})

function openPolicy(policyId: MirrorPolicyId): void {
  globeStore.openMirrorPolicy(policyId)
}

function handleDecline(): void {
  globeStore.declineMirrorConsent()
}

function handleAccept(): void {
  if (!agreed.value) return
  globeStore.acceptMirrorConsent()
}
</script>

<template>
  <a-modal
    :open="mirrorConsentOpen"
    title="海外资源镜像服务"
    :width="480"
    :z-index="1300"
    :closable="false"
    :mask-closable="false"
    :keyboard="false"
    centered
  >
    <div class="consent-content">
      <p v-if="detectionNotice" class="consent-paragraph">{{ detectionNotice }}</p>
      <p class="consent-paragraph">
        咕咕地球携手奈索星联团队，为中国境内用户提供海外资源镜像服务。您需要遵守<button type="button" class="policy-link" @click="openPolicy('agreement')">《咕咕地球镜像服务使用协议》</button>与<button type="button" class="policy-link" @click="openPolicy('acceptable-use')">《可接受使用政策》</button>。
      </p>
      <div class="consent-checkbox-row">
        <a-checkbox v-model:checked="agreed">
          <span class="checkbox-label">
            我已阅读并同意<button type="button" class="policy-link" @click.stop="openPolicy('agreement')">《咕咕地球镜像服务使用协议》</button>与<button type="button" class="policy-link" @click.stop="openPolicy('acceptable-use')">《可接受使用政策》</button>
          </span>
        </a-checkbox>
      </div>
    </div>
    <template #footer>
      <div class="consent-footer">
        <a-button @click="handleDecline">不需要</a-button>
        <a-button type="primary" :disabled="!agreed" @click="handleAccept">同意并启用</a-button>
      </div>
    </template>
  </a-modal>
</template>

<style scoped>
.consent-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.consent-paragraph {
  margin: 0;
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  line-height: 22px;
}

.consent-domain {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 20px;
}

.consent-checkbox-row {
  margin-top: 4px;
  padding: 12px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(5, 5, 5, 0.06);
}

.checkbox-label {
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  line-height: 22px;
}

.policy-link {
  padding: 0;
  border: none;
  background: transparent;
  color: #1677ff;
  font-size: inherit;
  font-family: inherit;
  line-height: inherit;
  cursor: pointer;
}

.policy-link:hover {
  color: #4096ff;
}

.policy-link:focus-visible {
  outline: 2px solid #1677ff;
  outline-offset: 1px;
  border-radius: 2px;
}

.consent-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
