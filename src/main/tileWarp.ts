import { nativeImage } from 'electron'
import { endianness } from 'os'
import { tileCenter, wgs84ToGcj02 } from './geo'

const TILE_SIZE = 256
const NATIVE_BITMAP_IS_BGRA = endianness() === 'LE'

export interface WarpSourceTile {
  buffer: ArrayBuffer
  contentType: string
}

export type WarpSourceFetcher = (level: number, x: number, y: number) => Promise<WarpSourceTile | null>

export interface WarpedTile {
  data: ArrayBuffer
  contentType: string
}

function mercatorYFromLatitude(latitude: number, worldPixels: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude))
  const radians = (clamped * Math.PI) / 180
  return (0.5 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / (2 * Math.PI)) * worldPixels
}

export function tileWgs84ShiftPixels(level: number, x: number, y: number): { dx: number; dy: number } | null {
  const [longitude, latitude] = tileCenter(level, x, y)
  const [gcjLongitude, gcjLatitude] = wgs84ToGcj02(longitude, latitude)
  const deltaLongitude = gcjLongitude - longitude
  const deltaLatitude = gcjLatitude - latitude
  if (deltaLongitude === 0 && deltaLatitude === 0) return null
  const worldPixels = TILE_SIZE * 2 ** level
  const dx = (deltaLongitude / 360) * worldPixels
  const dy = mercatorYFromLatitude(latitude + deltaLatitude, worldPixels) - mercatorYFromLatitude(latitude, worldPixels)
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null
  return { dx, dy }
}

function swapRedBlueChannels(pixels: Buffer): void {
  if (!NATIVE_BITMAP_IS_BGRA) return
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const first = pixels[offset]
    pixels[offset] = pixels[offset + 2]
    pixels[offset + 2] = first
  }
}

function decodeTilePixels(tile: WarpSourceTile): Buffer | null {
  const image = nativeImage.createFromBuffer(Buffer.from(tile.buffer))
  if (image.isEmpty()) return null
  const size = image.getSize()
  if (size.width !== TILE_SIZE || size.height !== TILE_SIZE) return null
  const pixels = image.toBitmap()
  swapRedBlueChannels(pixels)
  return pixels
}

function bufferToArrayBuffer(data: Buffer): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

export async function warpTileToWgs84(level: number, x: number, y: number, fetchSourceTile: WarpSourceFetcher): Promise<WarpedTile | null> {
  const shift = tileWgs84ShiftPixels(level, x, y)
  if (!shift) return null
  const worldTiles = 2 ** level
  const baseX = x * TILE_SIZE
  const baseY = y * TILE_SIZE
  const tileLeft = Math.floor((baseX + shift.dx) / TILE_SIZE)
  const tileTop = Math.floor((baseY + shift.dy) / TILE_SIZE)
  const tileRight = Math.floor((baseX + shift.dx + TILE_SIZE - 1) / TILE_SIZE)
  const tileBottom = Math.floor((baseY + shift.dy + TILE_SIZE - 1) / TILE_SIZE)
  const columns = tileRight - tileLeft + 1
  const rows = tileBottom - tileTop + 1
  const canvasWidth = columns * TILE_SIZE
  const canvasHeight = rows * TILE_SIZE
  const sources: Promise<WarpSourceTile | null>[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sourceX = tileLeft + column
      const sourceY = tileTop + row
      const withinWorld = sourceX >= 0 && sourceX < worldTiles && sourceY >= 0 && sourceY < worldTiles
      sources.push(withinWorld ? fetchSourceTile(level, sourceX, sourceY) : Promise.resolve(null))
    }
  }
  const fetched = await Promise.all(sources)
  const canvas = Buffer.alloc(canvasWidth * canvasHeight * 4)
  let contentType: string | null = null
  for (let index = 0; index < fetched.length; index += 1) {
    const tile = fetched[index]
    if (!tile) return null
    const pixels = decodeTilePixels(tile)
    if (!pixels) return null
    if (tile.contentType.includes('png')) contentType = 'image/png'
    else if (contentType === null) contentType = 'image/jpeg'
    const canvasX = (index % columns) * TILE_SIZE
    const canvasY = Math.floor(index / columns) * TILE_SIZE
    for (let line = 0; line < TILE_SIZE; line += 1) {
      const sourceStart = line * TILE_SIZE * 4
      pixels.copy(canvas, (canvasY + line) * canvasWidth * 4 + canvasX * 4, sourceStart, sourceStart + TILE_SIZE * 4)
    }
  }
  const columnOrigins: number[] = []
  const columnStrides: number[] = []
  const columnFracs: number[] = []
  for (let px = 0; px < TILE_SIZE; px += 1) {
    const sx = Math.max(0, Math.min(canvasWidth - 1, baseX + px + shift.dx - tileLeft * TILE_SIZE))
    const x0 = Math.floor(sx)
    columnOrigins.push(x0)
    columnStrides.push((Math.min(canvasWidth - 1, x0 + 1) - x0) * 4)
    columnFracs.push(sx - x0)
  }
  const rowOrigins: number[] = []
  const rowStrides: number[] = []
  const rowFracs: number[] = []
  for (let py = 0; py < TILE_SIZE; py += 1) {
    const sy = Math.max(0, Math.min(canvasHeight - 1, baseY + py + shift.dy - tileTop * TILE_SIZE))
    const y0 = Math.floor(sy)
    rowOrigins.push(y0)
    rowStrides.push((Math.min(canvasHeight - 1, y0 + 1) - y0) * canvasWidth * 4)
    rowFracs.push(sy - y0)
  }
  const output = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4)
  let outOffset = 0
  for (let py = 0; py < TILE_SIZE; py += 1) {
    const rowA = rowOrigins[py] * canvasWidth * 4
    const rowStride = rowStrides[py]
    const rowWeightA = 1 - rowFracs[py]
    const rowWeightB = rowFracs[py]
    for (let px = 0; px < TILE_SIZE; px += 1) {
      const columnA = columnOrigins[px] * 4
      const columnStride = columnStrides[px]
      const fx = columnFracs[px]
      const weightA = rowWeightA * (1 - fx)
      const weightB = rowWeightA * fx
      const weightC = rowWeightB * (1 - fx)
      const weightD = rowWeightB * fx
      const o00 = rowA + columnA
      const o01 = o00 + columnStride
      const o10 = o00 + rowStride
      const o11 = o01 + rowStride
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0
      let weightSum = 0
      if (canvas[o00 + 3] !== 0) {
        red += canvas[o00] * weightA
        green += canvas[o00 + 1] * weightA
        blue += canvas[o00 + 2] * weightA
        alpha += canvas[o00 + 3] * weightA
        weightSum += weightA
      }
      if (canvas[o01 + 3] !== 0) {
        red += canvas[o01] * weightB
        green += canvas[o01 + 1] * weightB
        blue += canvas[o01 + 2] * weightB
        alpha += canvas[o01 + 3] * weightB
        weightSum += weightB
      }
      if (canvas[o10 + 3] !== 0) {
        red += canvas[o10] * weightC
        green += canvas[o10 + 1] * weightC
        blue += canvas[o10 + 2] * weightC
        alpha += canvas[o10 + 3] * weightC
        weightSum += weightC
      }
      if (canvas[o11 + 3] !== 0) {
        red += canvas[o11] * weightD
        green += canvas[o11 + 1] * weightD
        blue += canvas[o11 + 2] * weightD
        alpha += canvas[o11 + 3] * weightD
        weightSum += weightD
      }
      if (weightSum > 0) {
        output[outOffset] = Math.round(red / weightSum)
        output[outOffset + 1] = Math.round(green / weightSum)
        output[outOffset + 2] = Math.round(blue / weightSum)
        output[outOffset + 3] = Math.round(alpha / weightSum)
      }
      outOffset += 4
    }
  }
  swapRedBlueChannels(output)
  const image = nativeImage.createFromBitmap(output, { width: TILE_SIZE, height: TILE_SIZE })
  if (image.isEmpty()) return null
  const data = contentType === 'image/png' ? image.toPNG() : image.toJPEG(92)
  return { data: bufferToArrayBuffer(data), contentType: contentType ?? 'image/png' }
}
