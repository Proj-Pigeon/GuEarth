import type { UpdatePackageKind } from '../../../preload'

export function updateInstallContent(kind: UpdatePackageKind | ''): string {
  if (kind === 'deb') return '应用将退出，并请求系统授权以安装更新，完成后重新打开咕咕地球。'
  if (kind === 'appimage') return '应用将退出并用新版本替换当前 AppImage，然后重新打开。'
  return '应用将退出并启动安装程序，完成后可重新打开咕咕地球。'
}

export function updateReadyHint(kind: UpdatePackageKind | ''): string {
  if (kind === 'deb') return '可点击底部的下载按钮，授权后安装并重新打开'
  if (kind === 'appimage') return '可点击底部的下载按钮替换 AppImage 并重新打开'
  return '可点击底部的下载按钮重启安装'
}
