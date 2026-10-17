import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const offscreenVideoEncoderArgs = ['-c:v', 'libopenh264', '-profile:v', 'high', '-b:v', '2M']

function binaryPathFor(appPath: string, resourcesPath: string, packaged: boolean): string {
  return packaged ? join(resourcesPath, 'bin', 'ffmpeg.exe') : join(appPath, 'resources', 'bin', 'ffmpeg.exe')
}

export function findFfmpegBinary(appPath: string, resourcesPath: string, packaged: boolean): string | null {
  const binary = binaryPathFor(appPath, resourcesPath, packaged)
  return existsSync(binary) ? binary : null
}

export function resolveFfmpegBinary(appPath: string, resourcesPath: string, packaged: boolean): string {
  const binary = binaryPathFor(appPath, resourcesPath, packaged)
  if (!existsSync(binary)) throw new Error(`内置视频编码器缺失：${binary}。开发环境可运行 npm run fetch:ffmpeg 获取（Windows x64）`)
  return binary
}
