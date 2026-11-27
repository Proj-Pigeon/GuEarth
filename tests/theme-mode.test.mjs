import assert from 'node:assert/strict'
import { test } from 'vitest'
import { isThemeMode, normalizeThemeMode, resolveTheme, themeModes } from '../src/common/themeMode.ts'

test('isThemeMode accepts only light, dark, and system', () => {
  assert.deepEqual([...themeModes], ['light', 'dark', 'system'])
  assert.equal(isThemeMode('light'), true)
  assert.equal(isThemeMode('dark'), true)
  assert.equal(isThemeMode('system'), true)
  assert.equal(isThemeMode('auto'), false)
  assert.equal(isThemeMode(''), false)
  assert.equal(isThemeMode(null), false)
  assert.equal(isThemeMode(undefined), false)
})

test('normalizeThemeMode falls back to light for unknown values', () => {
  assert.equal(normalizeThemeMode('dark'), 'dark')
  assert.equal(normalizeThemeMode('system'), 'system')
  assert.equal(normalizeThemeMode('light'), 'light')
  assert.equal(normalizeThemeMode('sepia'), 'light')
  assert.equal(normalizeThemeMode(42), 'light')
})

test('resolveTheme maps explicit modes directly and follows system preference for system mode', () => {
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('light', false), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
  assert.equal(resolveTheme('dark', true), 'dark')
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
})
