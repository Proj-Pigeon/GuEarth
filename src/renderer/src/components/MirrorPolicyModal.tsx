import { useGlobeStore } from '@renderer/stores/globe'
import { renderMarkdown } from '@renderer/utils/markdown'
import { Button, Modal, Tabs, type TabsProps } from 'antd'
import { useEffect, useMemo, useRef } from 'react'

import acceptableUseMarkdown from '../../../../docs/policies/ACCEPTABLE-USE-POLICY.md?raw'
import agreementMarkdown from '../../../../docs/policies/MIRROR-SERVICE-AGREEMENT.md?raw'
import {
  MIRROR_POLICY_FALLBACK_TITLES,
  parsePolicyMarkdown,
  type MirrorPolicyId,
  type ParsedPolicyMarkdown
} from '../../../common/mirrorPolicies'

import styles from './MirrorPolicyModal.module.css'

export interface MirrorPolicyModalProps {}

const policies: Record<MirrorPolicyId, ParsedPolicyMarkdown> = {
  agreement: parsePolicyMarkdown(agreementMarkdown, MIRROR_POLICY_FALLBACK_TITLES.agreement),
  'acceptable-use': parsePolicyMarkdown(
    acceptableUseMarkdown,
    MIRROR_POLICY_FALLBACK_TITLES['acceptable-use']
  )
}

const tabItems: TabsProps['items'] = [
  { key: 'agreement', label: policies.agreement.title },
  { key: 'acceptable-use', label: policies['acceptable-use'].title }
]

export function MirrorPolicyModal(_props: MirrorPolicyModalProps) {
  const mirrorPolicyOpen = useGlobeStore(state => state.mirrorPolicyOpen)
  const mirrorPolicyActiveId = useGlobeStore(state => state.mirrorPolicyActiveId)
  const openMirrorPolicy = useGlobeStore(state => state.openMirrorPolicy)
  const closeMirrorPolicy = useGlobeStore(state => state.closeMirrorPolicy)

  const policyBodyRef = useRef<HTMLDivElement | null>(null)

  const activePolicy = policies[mirrorPolicyActiveId] ?? policies.agreement
  const renderedNodes = useMemo(() => renderMarkdown(activePolicy.body), [activePolicy.body])

  useEffect(() => {
    if (!mirrorPolicyOpen) return
    if (policyBodyRef.current) policyBodyRef.current.scrollTop = 0
  }, [mirrorPolicyOpen, mirrorPolicyActiveId])

  function handleTabChange(key: string): void {
    if (key === 'agreement' || key === 'acceptable-use') {
      openMirrorPolicy(key)
    }
  }

  return (
    <Modal
      open={mirrorPolicyOpen}
      title={activePolicy.title}
      width={680}
      zIndex={1350}
      centered
      onCancel={closeMirrorPolicy}
      footer={
        <Button type='primary' onClick={closeMirrorPolicy}>
          关闭
        </Button>
      }
    >
      <Tabs
        activeKey={mirrorPolicyActiveId}
        size='small'
        items={tabItems}
        onChange={handleTabChange}
      />
      <div ref={policyBodyRef} className={`${styles.policyBody} ${styles.policyMarkdown}`}>
        {renderedNodes}
      </div>
    </Modal>
  )
}

export default MirrorPolicyModal
