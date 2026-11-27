import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function hawdbBinaryFileName(platform: string = process.platform): string {
  if (platform === 'win32') {return 'hawdb_ffi.dll'}
  if (platform === 'darwin') {return 'libhawdb_ffi.dylib'}
  return 'libhawdb_ffi.so'
}

export function hawdbBinaryPathFor(
  appPath: string,
  resourcesPath: string,
  packaged: boolean,
  platform: string = process.platform
): string {
  const name = hawdbBinaryFileName(platform)
  return packaged ? join(resourcesPath, 'bin', name) : join(appPath, 'resources', 'bin', name)
}

export function findHawdbBinary(
  appPath: string,
  resourcesPath: string,
  packaged: boolean,
  platform: string = process.platform
): string | null {
  const envOverride = process.env.GUEARTH_HAWDB_LIB
  if (envOverride && existsSync(envOverride)) {return envOverride}
  const binary = hawdbBinaryPathFor(appPath, resourcesPath, packaged, platform)
  return existsSync(binary) ? binary : null
}

export function resolveHawdbBinary(
  appPath: string,
  resourcesPath: string,
  packaged: boolean,
  platform: string = process.platform
): string {
  const binary = findHawdbBinary(appPath, resourcesPath, packaged, platform)
  if (binary) {return binary}
  const expected = hawdbBinaryPathFor(appPath, resourcesPath, packaged, platform)
  throw new Error(
    packaged
      ? `内置 HawDB 数据引擎缺失：${expected}`
      : `内置 HawDB 数据引擎缺失：${expected}。请运行 npm run fetch:hawdb 获取`
  )
}
