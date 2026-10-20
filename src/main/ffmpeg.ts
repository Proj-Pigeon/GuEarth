import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const offscreenVideoEncoderArgs = ['-c:v', 'libopenh264', '-profile:v', 'high', '-b:v', '2M']

function binaryPathFor(appPath: string, resourcesPath: string, packaged: boolean): string {
  return packaged ? join(resourcesPath, 'bin', 'ffmpeg.exe') : join(appPath, 'resources', 'bin', 'ffmpeg.exe')
}

export function assertOffscreenRecordingSupported(platform: string): void {
  if (platform !== 'win32') throw new Error(`离屏视频录制目前仅提供 Windows x64 构建，当前平台 ${platform} 暂不支持录制`)
}

export function findFfmpegBinary(appPath: string, resourcesPath: string, packaged: boolean): string | null {
  const binary = binaryPathFor(appPath, resourcesPath, packaged)
  return existsSync(binary) ? binary : null
}

function missingEncoderMessage(binary: string, packaged: boolean): string {
  return packaged
    ? '内置视频编码器缺失，教学视频录制暂不可用，请重新安装咕咕地球修复（Windows x64）'
    : `内置视频编码器缺失：${binary}。运行 npm run fetch:ffmpeg 获取（Windows x64）`
}

export function resolveFfmpegBinary(appPath: string, resourcesPath: string, packaged: boolean, platform: string = process.platform): string {
  assertOffscreenRecordingSupported(platform)
  const binary = binaryPathFor(appPath, resourcesPath, packaged)
  if (!existsSync(binary)) throw new Error(missingEncoderMessage(binary, packaged))
  return binary
}
