import assert from 'node:assert/strict'
import { test } from 'node:test'

import { offscreenCaptureSize, offscreenConcatPlaylist, offscreenFrameDurations, offscreenFrameRate, offscreenScriptDurationMs } from '../src/main/offscreenTiming.ts'

test('script duration excludes the first scene flight and clamps negative timings', () => {
  const duration = offscreenScriptDurationMs([
    { dwellMs: 6000, flyDurationMs: 3500 },
    { dwellMs: 4000, flyDurationMs: 2000 },
    { dwellMs: -1000, flyDurationMs: -500 }
  ])
  assert.equal(duration, 12000)
})

test('script duration keeps a one second floor', () => {
  assert.equal(offscreenScriptDurationMs([]), 1000)
  assert.equal(offscreenScriptDurationMs([{ dwellMs: 0, flyDurationMs: 0 }]), 1000)
})

test('encoded frame rate preserves wall clock duration when capture drops frames', () => {
  const fullRate = offscreenFrameRate(300, 10000)
  const throttledRate = offscreenFrameRate(150, 10000)
  assert.equal(Math.round(fullRate), 30)
  assert.equal(Math.round(throttledRate), 15)
  assert.ok(Math.abs(300 / fullRate * 1000 - 10000) < 1)
  assert.ok(Math.abs(150 / throttledRate * 1000 - 10000) < 1)
})

test('encoded frame rate never returns zero or a non-finite value', () => {
  assert.equal(offscreenFrameRate(0, 10000), 1)
  assert.equal(offscreenFrameRate(100, 0), 1)
  assert.equal(offscreenFrameRate(Number.NaN, 10000), 1)
  assert.equal(offscreenFrameRate(100, Number.POSITIVE_INFINITY), 1)
})

test('capture size keeps the requested aspect inside a smaller work area', () => {
  const clamped = offscreenCaptureSize(1920, 1080, 1235, 775)
  assert.deepEqual(clamped, { width: 1233, height: 694 })
  assert.ok(Math.abs(clamped.width / clamped.height - 16 / 9) < 0.005)
  assert.ok(clamped.width <= 1233 && clamped.height <= 773)
})

test('capture size uses the full request when the work area allows it', () => {
  assert.deepEqual(offscreenCaptureSize(1920, 1080, 2560, 1440), { width: 1920, height: 1080 })
  assert.deepEqual(offscreenCaptureSize(1280, 720, 3840, 2160), { width: 1280, height: 720 })
})

test('capture size shrinks width when only the height is constrained', () => {
  const narrow = offscreenCaptureSize(1920, 1080, 4000, 500)
  assert.equal(narrow.height, 498)
  assert.ok(Math.abs(narrow.width / narrow.height - 16 / 9) < 0.01)
})

test('frame durations follow the real capture timeline instead of an average rate', () => {
  const frameTimes = [0, 500, 1000, 2000]
  const durations = offscreenFrameDurations(frameTimes, 2600)
  assert.deepEqual(durations, [0.5, 0.5, 1, 0.6])
  assert.equal(durations.reduce((total, value) => total + value, 0), 2.6)
})

test('frame durations never collapse below the minimum step', () => {
  const durations = offscreenFrameDurations([0, 0, 10], 10)
  assert.ok(durations.every((value) => value >= 1 / 240))
})

test('concat playlist lists every frame with its own duration', () => {
  const playlist = offscreenConcatPlaylist(['frame-00000000.jpg', 'frame-00000001.jpg'], [0.5, 0.25])
  assert.equal(playlist, "ffconcat version 1.0\nfile 'frame-00000000.jpg'\noption framerate 1000\nduration 0.500000\nfile 'frame-00000001.jpg'\noption framerate 1000\nduration 0.250000\nfile 'frame-00000001.jpg'\noption framerate 1000\n")
})

test('concat playlist pins a fine sub-file timebase so short capture gaps survive', () => {
  const playlist = offscreenConcatPlaylist(['a.jpg', 'b.jpg'], [0.05, 0.1])
  const lines = playlist.trim().split('\n')
  const fileIndexes = lines.map((line, index) => (line.startsWith('file') ? index : -1)).filter((index) => index >= 0)
  assert.equal(fileIndexes.length, 3)
  for (const index of fileIndexes) assert.equal(lines[index + 1], 'option framerate 1000')
})

test('concat playlist repeats the final frame so its duration is honoured', () => {
  const playlist = offscreenConcatPlaylist(['only.jpg'], [1.5])
  const entries = playlist.trim().split('\n').filter((line) => line.startsWith('file'))
  assert.equal(entries.length, 2)
  assert.equal(entries[1], "file 'only.jpg'")
  assert.equal(playlist.match(/option framerate 1000/g).length, 2)
})

test('concat playlist stays empty without frames', () => {
  assert.equal(offscreenConcatPlaylist([], []), 'ffconcat version 1.0\n')
})
