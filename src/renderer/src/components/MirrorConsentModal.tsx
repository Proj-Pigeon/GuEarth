import { useEffect, useState, type MouseEvent } from 'react'
import { Button, Checkbox, Modal } from '@renderer/components/ui'
import type { MirrorPolicyId } from '../../../common/mirrorPolicies'
import { useGlobeStore } from '@renderer/stores/globe'
import styles from './MirrorConsentModal.module.css'

export interface MirrorConsentModalProps {}

export function MirrorConsentModal(_props: MirrorConsentModalProps) {
  const mirrorConsentOpen = useGlobeStore((state) => state.mirrorConsentOpen)
  const mirrorConsentReason = useGlobeStore((state) => state.mirrorConsentReason)
  const openMirrorPolicy = useGlobeStore((state) => state.openMirrorPolicy)
  const declineMirrorConsent = useGlobeStore((state) => state.declineMirrorConsent)
  const acceptMirrorConsent = useGlobeStore((state) => state.acceptMirrorConsent)

  const [agreed, setAgreed] = useState(false)

  useEffect(() => {
    if (mirrorConsentOpen) setAgreed(false)
  }, [mirrorConsentOpen])

  const detectionNotice =
    mirrorConsentReason === 'slow'
      ? '检测到您当前网络访问海外地图资源受限或加载时间过长，可能会影响底图、三维地形与教学数据的显示。'
      : mirrorConsentReason === 'china'
        ? '您似乎位于中国大陆，直接访问海外地图与地理数据服务可能会遇到连接缓慢或无法加载的情况。'
        : ''

  function openPolicy(policyId: MirrorPolicyId): void {
    openMirrorPolicy(policyId)
  }

  function handleCheckboxPolicyClick(event: MouseEvent<HTMLElement>, policyId: MirrorPolicyId): void {
    event.preventDefault()
    event.stopPropagation()
    openPolicy(policyId)
  }

  function handleDecline(): void {
    declineMirrorConsent()
  }

  function handleAccept(): void {
    if (!agreed) return
    acceptMirrorConsent()
  }

  return (
    <Modal
      open={mirrorConsentOpen}
      title="海外资源镜像服务"
      width={480}
      zIndex={1300}
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={
        <div className={styles.consentFooter}>
          <Button onClick={handleDecline}>不需要</Button>
          <Button variant="primary" disabled={!agreed} onClick={handleAccept}>
            同意并启用
          </Button>
        </div>
      }
    >
      <div className={styles.consentContent}>
        {detectionNotice && <p className={styles.consentParagraph}>{detectionNotice}</p>}
        <p className={styles.consentParagraph}>
          咕咕地球携手奈索星联团队，为中国境内用户提供海外资源镜像服务。您需要遵守
          <Button variant="link" className={styles.policyLink} onClick={() => openPolicy('agreement')}>
            《咕咕地球镜像服务使用协议》
          </Button>
          与
          <Button variant="link" className={styles.policyLink} onClick={() => openPolicy('acceptable-use')}>
            《可接受使用政策》
          </Button>
          。
        </p>
        <div className={styles.consentCheckboxRow}>
          <Checkbox checked={agreed} onChange={(checked) => setAgreed(checked)}>
            <span className={styles.checkboxLabel}>
              我已阅读并同意
              <Button
                variant="link"
                className={styles.policyLink}
                onClick={(event) => handleCheckboxPolicyClick(event, 'agreement')}
              >
                《咕咕地球镜像服务使用协议》
              </Button>
              与
              <Button
                variant="link"
                className={styles.policyLink}
                onClick={(event) => handleCheckboxPolicyClick(event, 'acceptable-use')}
              >
                《可接受使用政策》
              </Button>
            </span>
          </Checkbox>
        </div>
      </div>
    </Modal>
  )
}

export default MirrorConsentModal
