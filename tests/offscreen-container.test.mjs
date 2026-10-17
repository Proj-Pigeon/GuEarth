import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { findFfmpegBinary } from '../src/main/ffmpeg.ts'
import { offscreenConcatPlaylist, offscreenFrameDurations } from '../src/main/offscreenTiming.ts'

const ffmpegPath = findFfmpegBinary(fileURLToPath(new URL('..', import.meta.url)), '', false)

function run(args, cwd) {
  const result = spawnSync(ffmpegPath, args, { cwd, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr || 'ffmpeg failed')
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

function probe(fileName, cwd) {
  return run(['-hide_banner', '-i', fileName, '-f', 'null', '-'], cwd)
}

function probeDurationSeconds(text) {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text)
  assert.ok(match, `未找到时长信息：${text.slice(0, 200)}`)
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

test('encoded container keeps the final frame duration', { skip: ffmpegPath ? false : '内置 ffmpeg 不可用（运行 npm run fetch:ffmpeg 获取）' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'guearth-container-'))
  try {
    run(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30', '-frames:v', '20', 'frame-%08d.jpg'], directory)

    const frames = Array.from({ length: 20 }, (_value, index) => `frame-${String(index + 1).padStart(8, '0')}.jpg`)
    const frameTimes = frames.map((_name, index) => index * (1000 / 30))
    const tailMs = 900
    const recordingElapsedMs = frameTimes[frameTimes.length - 1] + tailMs
    const durations = offscreenFrameDurations(frameTimes, recordingElapsedMs)
    const expected = durations.reduce((total, value) => total + value, 0)
    assert.ok(Math.abs(expected - 1.533) < 0.01, `逐帧时长合计应为 1.533 秒，实际 ${expected}`)

    writeFileSync(join(directory, 'frames.txt'), offscreenConcatPlaylist(frames, durations), 'utf8')
    run([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'concat', '-safe', '0', '-i', 'frames.txt',
      '-vf', 'scale=640:360:force_original_aspect_ratio=decrease:flags=lanczos,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black,fps=30',
      '-t', expected.toFixed(6),
      '-an', '-c:v', 'libopenh264', '-profile:v', 'high', '-b:v', '2M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-f', 'mp4', 'recording.mp4'
    ], directory)

    const info = probe('recording.mp4', directory)
    const encoded = probeDurationSeconds(info)
    assert.match(info, /Video: h264/)
    assert.ok(encoded >= expected - 0.05, `成片时长 ${encoded.toFixed(2)}s 短于逐帧时长合计 ${expected.toFixed(2)}s`)
    assert.ok(encoded <= expected + 0.2, `成片时长 ${encoded.toFixed(2)}s 明显长于逐帧时长合计 ${expected.toFixed(2)}s`)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('encoded container matches the requested output size', { skip: ffmpegPath ? false : '内置 ffmpeg 不可用（运行 npm run fetch:ffmpeg 获取）' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'guearth-size-'))
  try {
    run(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1237x776:rate=30', '-frames:v', '6', 'frame-%08d.jpg'], directory)
    const frames = Array.from({ length: 6 }, (_value, index) => `frame-${String(index + 1).padStart(8, '0')}.jpg`)
    const durations = frames.map(() => 1 / 30)
    const seconds = durations.reduce((total, value) => total + value, 0)
    writeFileSync(join(directory, 'frames.txt'), offscreenConcatPlaylist(frames, durations), 'utf8')
    run([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'concat', '-safe', '0', '-i', 'frames.txt',
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,fps=30',
      '-t', seconds.toFixed(6),
      '-an', '-c:v', 'libopenh264', '-profile:v', 'high', '-b:v', '2M', '-pix_fmt', 'yuv420p', '-f', 'mp4', 'recording.mp4'
    ], directory)
    const info = probe('recording.mp4', directory)
    assert.match(info, /1920x1080/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
