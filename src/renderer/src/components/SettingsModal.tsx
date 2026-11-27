import { useCallback, useRef, useState } from 'react'
import { BotIcon, FlaskConicalIcon, GlobeIcon, InfoIcon, ShieldCheckIcon, SlidersHorizontalIcon, UserIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Modal } from '@renderer/components/ui'
import { useSettingsWindowStore } from '@renderer/stores/settingsWindow';
import type { SettingsSection } from '@renderer/stores/settingsWindow';
import AccountSettings from './settings/AccountSettings'
import GeneralSettings from './settings/GeneralSettings'
import MapSettings from './settings/MapSettings'
import AiSettingsSection from './settings/AiSettingsSection';
import type { AiSettingsSectionHandle } from './settings/AiSettingsSection';
import PrivacySettings from './settings/PrivacySettings'
import LaboratorySettings from './settings/LaboratorySettings'
import AboutSettings from './settings/AboutSettings'
import UnsavedChangesBar from './settings/UnsavedChangesBar'
import styles from './SettingsModal.module.css'

export interface SettingsModalProps {
  onRestartGuide?: () => void
}

type PendingAction = { kind: 'navigate'; section: SettingsSection } | { kind: 'close' }

interface NavItem {
  id: SettingsSection
  label: string
  icon: LucideIcon
}

interface NavGroup {
  caption: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    caption: '常规',
    items: [
      { id: 'account', label: '账户', icon: UserIcon },
      { id: 'general', label: '通用', icon: SlidersHorizontalIcon },
      { id: 'map', label: '地图', icon: GlobeIcon }
    ]
  },
  { caption: 'EOQ 助手', items: [{ id: 'ai', label: 'AI', icon: BotIcon }] },
  {
    caption: '系统',
    items: [
      { id: 'privacy', label: '隐私', icon: ShieldCheckIcon },
      { id: 'laboratory', label: '实验室', icon: FlaskConicalIcon },
      { id: 'about', label: '关于', icon: InfoIcon }
    ]
  }
]

function slotClass(visible: boolean): string {
  return visible ? styles.sectionSlot : `${styles.sectionSlot} ${styles.sectionSlotHidden}`
}

export function SettingsModal({ onRestartGuide }: SettingsModalProps) {
  const isOpen = useSettingsWindowStore((state) => state.isOpen)
  const activeSection = useSettingsWindowStore((state) => state.activeSection)
  const setActiveSection = useSettingsWindowStore((state) => state.setActiveSection)
  const closeWindow = useSettingsWindowStore((state) => state.close)

  const [laboratoryBusy, setLaboratoryBusy] = useState(false)
  const [aiDirty, setAiDirty] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmSaving, setConfirmSaving] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [barSaving, setBarSaving] = useState(false)

  const aiSectionRef = useRef<AiSettingsSectionHandle>(null)

  const settingsInteractive = !laboratoryBusy && !confirmOpen
  const unsavedBarOpen = activeSection === 'ai' && aiDirty && !confirmOpen

  const handleBarSave = useCallback(async () => {
    if (barSaving) {return}
    setBarSaving(true)
    try {
      await aiSectionRef.current?.saveDrafts()
    } finally {
      setBarSaving(false)
    }
  }, [barSaving])

  const handleBarDiscard = useCallback(() => {
    aiSectionRef.current?.discardDrafts()
  }, [])

  const runPendingAction = useCallback(
    (action: PendingAction | null) => {
      if (!action) {return}
      if (action.kind === 'navigate') {setActiveSection(action.section)}
      else {closeWindow()}
    },
    [closeWindow, setActiveSection]
  )

  const requestNavigate = useCallback(
    (section: SettingsSection) => {
      if (!settingsInteractive || section === activeSection) {return}
      const dirty = aiSectionRef.current?.isDirty() ?? aiDirty
      if (activeSection === 'ai' && dirty) {
        setPendingAction({ kind: 'navigate', section })
        setConfirmOpen(true)
        return
      }
      setActiveSection(section)
    },
    [activeSection, aiDirty, setActiveSection, settingsInteractive]
  )

  const requestClose = useCallback(() => {
    if (!settingsInteractive) {return}
    const dirty = aiSectionRef.current?.isDirty() ?? aiDirty
    if (dirty) {
      setPendingAction({ kind: 'close' })
      setConfirmOpen(true)
      return
    }
    closeWindow()
  }, [aiDirty, closeWindow, settingsInteractive])

  const handleConfirmIgnore = useCallback(() => {
    if (confirmSaving) {return}
    aiSectionRef.current?.discardDrafts()
    const action = pendingAction
    setPendingAction(null)
    setConfirmOpen(false)
    runPendingAction(action)
  }, [confirmSaving, pendingAction, runPendingAction])

  const handleConfirmSave = useCallback(async () => {
    if (confirmSaving) {return}
    setConfirmSaving(true)
    try {
      const saved = await (aiSectionRef.current?.saveDrafts() ?? Promise.resolve(false))
      const action = pendingAction
      setPendingAction(null)
      setConfirmOpen(false)
      if (saved) {runPendingAction(action)}
    } finally {
      setConfirmSaving(false)
    }
  }, [confirmSaving, pendingAction, runPendingAction])

  return (
    <>
      <Modal
        open={isOpen}
        title="设置"
        width={960}
        footer={null}
        closable={!laboratoryBusy}
        maskClosable={settingsInteractive}
        keyboard={settingsInteractive}
        bodyStyle={{
          padding: 0,
          display: 'flex',
          overflow: 'hidden',
          height: 'min(680px, calc(100vh - 120px))'
        }}
        onCancel={requestClose}
      >
        {isOpen && (
          <>
            <nav className={styles.settingsNav} aria-label="设置分区">
              {NAV_GROUPS.map((group) => (
                <div key={group.caption} className={styles.navGroup}>
                  <div className={styles.navCaption}>{group.caption}</div>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const selected = activeSection === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={selected ? `${styles.navItem} ${styles.navItemSelected}` : styles.navItem}
                        aria-current={selected ? 'true' : undefined}
                        disabled={laboratoryBusy}
                        onClick={() => requestNavigate(item.id)}
                      >
                        <Icon className={styles.navItemIcon} aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </nav>
            <div
              className={
                unsavedBarOpen
                  ? `${styles.settingsPane} ${styles.hasUnsavedBar}`
                  : styles.settingsPane
              }
            >
              <div className={slotClass(activeSection === 'account')}>
                <AccountSettings />
              </div>
              <div className={slotClass(activeSection === 'general')}>
                <GeneralSettings onRestartGuide={onRestartGuide} />
              </div>
              <div className={slotClass(activeSection === 'map')}>
                <MapSettings />
              </div>
              <div className={slotClass(activeSection === 'ai')}>
                <AiSettingsSection
                  ref={aiSectionRef}
                  active={activeSection === 'ai'}
                  onRequestClose={requestClose}
                  onDirtyChange={setAiDirty}
                />
              </div>
              <div className={slotClass(activeSection === 'privacy')}>
                <PrivacySettings />
              </div>
              <div className={slotClass(activeSection === 'laboratory')}>
                <LaboratorySettings
                  active={activeSection === 'laboratory'}
                  onBusyChange={setLaboratoryBusy}
                />
              </div>
              <div className={slotClass(activeSection === 'about')}>
                <AboutSettings />
              </div>
              <UnsavedChangesBar
                open={unsavedBarOpen}
                saving={barSaving}
                onSave={() => void handleBarSave()}
                onDiscard={handleBarDiscard}
              />
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={confirmOpen}
        title="AI 设置尚未保存"
        width={420}
        zIndex={1360}
        okText="保存设置"
        cancelText="忽略"
        confirmLoading={confirmSaving}
        closable={false}
        maskClosable={false}
        keyboard={false}
        onOk={() => void handleConfirmSave()}
        onCancel={handleConfirmIgnore}
      >
        <p className={styles.unsavedConfirmText}>修改尚未保存，离开后将丢失。</p>
      </Modal>
    </>
  )
}

export default SettingsModal
