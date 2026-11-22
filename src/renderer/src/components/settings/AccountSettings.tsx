import {
  CheckCircleOutlined,
  CopyOutlined,
  ExportOutlined,
  LoginOutlined,
  LogoutOutlined
} from '@ant-design/icons'
import { useAccountStore } from '@renderer/stores/account'
import { Alert, App as AntdApp, Avatar, Button, Space, Tag } from 'antd'
import { useEffect, useRef, useState } from 'react'

import styles from './AccountSettings.module.css'

export interface AccountSettingsProps {}

export function AccountSettings(_props: AccountSettingsProps) {
  const { message, modal } = AntdApp.useApp()
  const phase = useAccountStore(state => state.phase)
  const profile = useAccountStore(state => state.profile)
  const userCode = useAccountStore(state => state.userCode)
  const verificationUri = useAccountStore(state => state.verificationUri)
  const challengeExpiresAt = useAccountStore(state => state.challengeExpiresAt)
  const error = useAccountStore(state => state.error)
  const pendingRemoteRevocation = useAccountStore(state => state.pendingRemoteRevocation)
  const busy = useAccountStore(state => state.busy)
  const canceling = useAccountStore(state => state.canceling)
  const signedIn = useAccountStore(state => state.signedIn)
  const storeDisplayName = useAccountStore(state => state.displayName)
  const login = useAccountStore(state => state.login)
  const cancelLogin = useAccountStore(state => state.cancelLogin)
  const signOut = useAccountStore(state => state.signOut)
  const dismissRevocationWarning = useAccountStore(state => state.dismissRevocationWarning)
  const openDeviceList = useAccountStore(state => state.openDeviceList)
  const openVerification = useAccountStore(state => state.openVerification)
  const clearError = useAccountStore(state => state.clearError)

  const [now, setNow] = useState(() => Date.now())
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const awaitingApproval = phase === 'awaiting-approval' || phase === 'finalizing'

  useEffect(() => {
    if (!awaitingApproval) return
    setNow(Date.now())
    const ticker = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(ticker)
  }, [awaitingApproval])

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== undefined) clearTimeout(copiedTimerRef.current)
    }
  }, [])

  const remainingSeconds = challengeExpiresAt
    ? Math.max(0, Math.ceil((challengeExpiresAt - now) / 1000))
    : 0
  const remainingText = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`
  const challengeExpired = phase === 'awaiting-approval' && remainingSeconds <= 0

  const displayName = storeDisplayName || '未命名账户'
  const avatarInitial = Array.from(displayName)[0]?.toUpperCase() || 'U'
  const emailText = profile?.email || profile?.username || ''
  const loginLoading = phase === 'creating' || phase === 'restoring'

  async function copyUserCode(): Promise<void> {
    if (!userCode) return
    try {
      await navigator.clipboard.writeText(userCode)
    } catch {
      message.error('复制失败，请手动记录验证码')
      return
    }
    setCopied(true)
    if (copiedTimerRef.current !== undefined) clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => {
      setCopied(false)
      copiedTimerRef.current = undefined
    }, 1600)
  }

  function confirmSignOut(): void {
    modal.confirm({
      title: '退出登录？',
      content: '退出后需要重新登录。',
      okText: '退出登录',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => signOut()
    })
  }

  return (
    <section className={styles.settingsSection} data-settings-section='' aria-label='账户'>
      <h3 className={styles.sectionTitle}>账户</h3>

      {error && (
        <Alert
          className={styles.accountAlert}
          type='error'
          showIcon
          title={error}
          closable={{ onClose: () => clearError() }}
        />
      )}

      {pendingRemoteRevocation && (
        <Alert
          className={styles.accountAlert}
          type='warning'
          showIcon
          title='本机已退出，请到账号中心手动移除此设备'
          action={
            <Space orientation='vertical' size={4}>
              <Button size='small' icon={<ExportOutlined />} onClick={() => void openDeviceList()}>
                打开设备列表
              </Button>
              <Button size='small' type='text' onClick={() => void dismissRevocationWarning()}>
                我知道了
              </Button>
            </Space>
          }
        />
      )}

      <div className={styles.settingsBlock}>
        {signedIn ? (
          <div className={`${styles.settingRow} ${styles.settingRowCenter}`}>
            <div className={styles.accountIdentity}>
              <Avatar className={styles.identityAvatar} size={40}>
                {avatarInitial}
              </Avatar>
              <div className={styles.identityCopy}>
                <div className={styles.identityName}>{displayName}</div>
                {emailText && <div className={styles.identityEmail}>{emailText}</div>}
              </div>
            </div>
            <Button
              danger
              loading={phase === 'signing-out'}
              disabled={busy}
              icon={<LogoutOutlined />}
              onClick={confirmSignOut}
            >
              退出登录
            </Button>
          </div>
        ) : awaitingApproval ? (
          <>
            <div className={styles.settingRow}>
              <div className={styles.settingCopy}>
                <div className={styles.settingTitleRow}>
                  <span className={styles.settingTitle}>
                    {phase === 'finalizing' ? '正在完成登录' : '等待浏览器确认'}
                  </span>
                  <Tag color={challengeExpired ? 'error' : 'processing'}>
                    {challengeExpired ? '已超时' : `剩余 ${remainingText}`}
                  </Tag>
                </div>
                <p className={styles.settingDesc}>
                  {challengeExpired
                    ? '登录已超时，请取消后重试'
                    : '请在浏览器中确认登录，并核对下方验证码'}
                </p>
              </div>
              <Button loading={canceling} onClick={() => void cancelLogin()}>
                取消登录
              </Button>
            </div>

            {userCode && (
              <div className={styles.challengeBar}>
                <div className={styles.challengeCode} aria-label='登录验证码'>
                  {userCode}
                </div>
                <Space size={8} wrap>
                  <Button
                    size='small'
                    icon={copied ? <CheckCircleOutlined /> : <CopyOutlined />}
                    onClick={() => void copyUserCode()}
                  >
                    {copied ? '已复制' : '复制验证码'}
                  </Button>
                  <Button
                    size='small'
                    disabled={!verificationUri}
                    icon={<ExportOutlined />}
                    onClick={() => void openVerification()}
                  >
                    打开确认页
                  </Button>
                </Space>
              </div>
            )}
          </>
        ) : (
          <div className={`${styles.settingRow} ${styles.settingRowCenter}`}>
            <div className={styles.settingCopy}>
              <div className={styles.settingTitle}>鸽巢通行证</div>
            </div>
            <Button
              type='primary'
              loading={loginLoading}
              disabled={busy || phase === 'restoring'}
              icon={<LoginOutlined />}
              onClick={() => void login()}
            >
              登录
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

export default AccountSettings
