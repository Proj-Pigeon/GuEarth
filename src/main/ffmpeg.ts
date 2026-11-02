import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const offscreenVideoEncoderArgs = ['-c:v', 'libopenh264', '-profile:v', 'high', '-b:v', '2M']

function binaryFileName(platform: string): string {
  return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

function binaryPathFor(appPath: string, resourcesPath: string, packaged: boolean, platform: string): string {
  const name = binaryFileName(platform)
  return packaged ? join(resourcesPath, 'bin', name) : join(appPath, 'resources', 'bin', name)
}

function platformLabel(platform: string): string {
  if (platform === 'win32') return 'Windows x64'
  if (platform === 'linux') return 'Linux x64/arm64'
  return platform
}

export function assertOffscreenRecordingSupported(platform: string): void {
  if (platform === 'win32' || platform === 'linux') return
  throw new Error(`离屏视频录制目前提供 Windows x64 与 Linux x64/arm64 构建，当前平台 ${platform} 暂不支持录制`)
}

export function findFfmpegBinary(appPath: string, resourcesPath: string, packaged: boolean, platform: string = process.platform): string | null {
  const binary = binaryPathFor(appPath, resourcesPath, packaged, platform)
  return existsSync(binary) ? binary : null
}

function missingEncoderMessage(binary: string, packaged: boolean, platform: string): string {
  const label = platformLabel(platform)
  return packaged
    ? `内置视频编码器缺失，教学视频录制暂不可用，请重新安装咕咕地球修复（${label}）`
    : `内置视频编码器缺失：${binary}。运行 npm run fetch:ffmpeg 获取（${label}）`
}

export function resolveFfmpegBinary(appPath: string, resourcesPath: string, packaged: boolean, platform: string = process.platform): string {
  assertOffscreenRecordingSupported(platform)
  const binary = binaryPathFor(appPath, resourcesPath, packaged, platform)
  if (!existsSync(binary)) throw new Error(missingEncoderMessage(binary, packaged, platform))
  return binary
}
