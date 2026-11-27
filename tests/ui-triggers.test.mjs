import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { resolve } from 'node:path'
import { test } from 'vitest'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from '@typescript/typescript6'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.SVGElement = dom.window.SVGElement
globalThis.Element = dom.window.Element
globalThis.Node = dom.window.Node
globalThis.MutationObserver = dom.window.MutationObserver
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@renderer/')) {
      const target = resolve('src/renderer/src', specifier.slice(10))
      if (/\.[a-z]+$/i.test(target)) return nextResolve(pathToFileURL(target).href, context)
      try {
        return nextResolve(pathToFileURL(`${target}.ts`).href, context)
      } catch {
        return nextResolve(pathToFileURL(`${target}.tsx`).href, context)
      }
    }
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
        try {
          return nextResolve(`${specifier}.ts`, context)
        } catch {
          return nextResolve(`${specifier}.tsx`, context)
        }
      }
      throw error
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.tsx')) {
      const source = transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: {
          jsx: JsxEmit.ReactJSX,
          module: ModuleKind.ESNext,
          target: ScriptTarget.ES2022
        }
      }).outputText
      return { format: 'module', source, shortCircuit: true }
    }
    return nextLoad(url, context)
  }
})

const { Button } = await import('../src/renderer/src/components/ui/button.tsx')
const { Tooltip, TooltipProvider } = await import('../src/renderer/src/components/ui/tooltip.tsx')
const { Popover } = await import('../src/renderer/src/components/ui/popover.tsx')
const { DropdownMenu } = await import('../src/renderer/src/components/ui/dropdown-menu.tsx')

test('Tooltip, Popover, and DropdownMenu preserve child Button onClick handlers via Base UI render prop', (t) => {
  const container = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  t.onTestFinished(() => {
    act(() => root.unmount())
    container.remove()
  })

  let tooltipClicks = 0
  let popoverClicks = 0
  let dropdownClicks = 0

  act(() => {
    root.render(
      createElement(
        TooltipProvider,
        null,
        createElement(
          Tooltip,
          { title: '提示' },
          createElement(Button, { 'aria-label': 'tooltip-btn', onClick: () => { tooltipClicks += 1 } }, 'A')
        ),
        createElement(
          Popover,
          { content: '浮层' },
          createElement(Button, { 'aria-label': 'popover-btn', onClick: () => { popoverClicks += 1 } }, 'B')
        ),
        createElement(
          DropdownMenu,
          { items: [{ key: 'one', label: '选项一' }] },
          createElement(Button, { 'aria-label': 'dropdown-btn', onClick: () => { dropdownClicks += 1 } }, 'C')
        )
      )
    )
  })

  const tooltipBtn = container.querySelector('[aria-label="tooltip-btn"]')
  const popoverBtn = container.querySelector('[aria-label="popover-btn"]')
  const dropdownBtn = container.querySelector('[aria-label="dropdown-btn"]')
  assert.ok(tooltipBtn)
  assert.ok(popoverBtn)
  assert.ok(dropdownBtn)

  act(() => {
    tooltipBtn.click()
    popoverBtn.click()
    dropdownBtn.click()
  })

  assert.equal(tooltipClicks, 1)
  assert.equal(popoverClicks, 1)
  assert.equal(dropdownClicks, 1)
})
