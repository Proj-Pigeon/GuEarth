<script setup lang="ts">
import { computed, nextTick, ref, watch, type VNodeChild } from 'vue'
import { storeToRefs } from 'pinia'
import agreementMarkdown from '../../../../docs/policies/MIRROR-SERVICE-AGREEMENT.md?raw'
import acceptableUseMarkdown from '../../../../docs/policies/ACCEPTABLE-USE-POLICY.md?raw'
import {
  MIRROR_POLICY_FALLBACK_TITLES,
  parsePolicyMarkdown,
  type MirrorPolicyId,
  type ParsedPolicyMarkdown
} from '../../../common/mirrorPolicies'
import { useGlobeStore } from '@renderer/stores/globe'
import { renderMarkdown } from '@renderer/utils/markdown'

const globeStore = useGlobeStore()
const { mirrorPolicyOpen, mirrorPolicyActiveId } = storeToRefs(globeStore)
const policyBodyRef = ref<HTMLElement | null>(null)

const policies = computed<Record<MirrorPolicyId, ParsedPolicyMarkdown>>(() => ({
  agreement: parsePolicyMarkdown(agreementMarkdown, MIRROR_POLICY_FALLBACK_TITLES.agreement),
  'acceptable-use': parsePolicyMarkdown(acceptableUseMarkdown, MIRROR_POLICY_FALLBACK_TITLES['acceptable-use'])
}))

const activePolicy = computed(() => policies.value[mirrorPolicyActiveId.value] ?? policies.value.agreement)
const renderedNodes = computed(() => renderMarkdown(activePolicy.value.body))
const PolicyMarkdown = (): VNodeChild[] => renderedNodes.value

watch([mirrorPolicyOpen, mirrorPolicyActiveId], async ([open]) => {
  if (!open) return
  await nextTick()
  if (policyBodyRef.value) policyBodyRef.value.scrollTop = 0
})

function handleTabChange(key: string | number): void {
  if (key === 'agreement' || key === 'acceptable-use') {
    globeStore.openMirrorPolicy(key as MirrorPolicyId)
  }
}

function handleClose(): void {
  globeStore.closeMirrorPolicy()
}
</script>

<template>
  <a-modal
    :open="mirrorPolicyOpen"
    :title="activePolicy.title"
    :width="680"
    :z-index="1350"
    centered
    @cancel="handleClose"
  >
    <a-tabs :active-key="mirrorPolicyActiveId" size="small" @change="handleTabChange">
      <a-tab-pane key="agreement" :tab="policies.agreement.title" />
      <a-tab-pane key="acceptable-use" :tab="policies['acceptable-use'].title" />
    </a-tabs>
    <div ref="policyBodyRef" class="policy-body policy-markdown">
      <PolicyMarkdown />
    </div>
    <template #footer>
      <a-button type="primary" @click="handleClose">关闭</a-button>
    </template>
  </a-modal>
</template>

<style scoped>
.policy-body {
  max-height: min(460px, calc(100vh - 260px));
  overflow-y: auto;
  padding-right: 8px;
}

.policy-markdown {
  color: rgba(0, 0, 0, 0.65);
  font-size: 14px;
  line-height: 22px;
  word-break: break-word;
}

.policy-markdown :deep(p) {
  margin: 0 0 8px;
}

.policy-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.policy-markdown :deep(strong) {
  color: rgba(0, 0, 0, 0.88);
  font-weight: 600;
}

.policy-markdown :deep(h1),
.policy-markdown :deep(h2) {
  margin: 16px 0 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(5, 5, 5, 0.06);
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.policy-markdown :deep(h3),
.policy-markdown :deep(h4),
.policy-markdown :deep(h5),
.policy-markdown :deep(h6) {
  margin: 12px 0 6px;
  color: rgba(0, 0, 0, 0.88);
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.policy-markdown :deep(ul),
.policy-markdown :deep(ol) {
  margin: 0 0 8px;
  padding-left: 20px;
}

.policy-markdown :deep(li + li) {
  margin-top: 4px;
}

.policy-markdown :deep(blockquote) {
  margin: 8px 0;
  padding: 8px 12px;
  border-radius: 6px;
  border-left: 3px solid rgba(5, 5, 5, 0.12);
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.65);
  font-size: 12px;
  line-height: 20px;
}

.policy-markdown :deep(blockquote p:last-child) {
  margin-bottom: 0;
}

.policy-markdown :deep(code) {
  padding: 2px 4px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 20px;
}

.policy-markdown :deep(pre) {
  margin: 0 0 8px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 6px;
  overflow-x: auto;
}

.policy-markdown :deep(pre code) {
  padding: 0;
  background: none;
  border-radius: 0;
}

.policy-markdown :deep(table) {
  display: block;
  width: max-content;
  max-width: 100%;
  margin: 0 0 8px;
  overflow-x: auto;
  border-collapse: collapse;
}

.policy-markdown :deep(th),
.policy-markdown :deep(td) {
  padding: 4px 8px;
  border: 1px solid rgba(5, 5, 5, 0.06);
}

.policy-markdown :deep(th) {
  font-weight: 600;
  color: rgba(0, 0, 0, 0.88);
}

.policy-markdown :deep(a) {
  color: #1677ff;
}

.policy-markdown :deep(hr) {
  margin: 12px 0;
  border: 0;
  border-top: 1px solid rgba(5, 5, 5, 0.06);
}
</style>
