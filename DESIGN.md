---
version: 1.0
name: GuEarth Design System
description: Monochrome ChatGPT-inspired visual language built on Base UI (@base-ui/react), Tailwind CSS v4, and Lucide icons. UI panels float over the 3D CesiumJS viewport with crisp neutral contrast in both Light and Dark themes.
colors:
  light:
    background: '#ffffff'
    surface: '#ffffff'
    elevated: '#ffffff'
    canvas: '#f9f9f9'
    subtle: '#f9f9f9'
    primary: '#0d0d0d'
    primary-hover: '#262626'
    primary-active: '#000000'
    primary-foreground: '#ffffff'
    muted: '#f3f3f3'
    ink: '#0d0d0d'
    ink-secondary: '#5d5d5d'
    ink-tertiary: '#8f8f8f'
    ink-disabled: 'rgba(13, 13, 13, 0.28)'
    hairline: 'rgba(0, 0, 0, 0.08)'
    border-strong: 'rgba(0, 0, 0, 0.14)'
    hover-fill: 'rgba(0, 0, 0, 0.045)'
    active-fill: 'rgba(0, 0, 0, 0.07)'
    destructive: '#dc2626'
    warning: '#d97706'
    success: '#16a34a'
    info: '#2563eb'
  dark:
    background: '#171717'
    surface: '#171717'
    elevated: '#212121'
    canvas: '#141414'
    subtle: '#141414'
    primary: '#ffffff'
    primary-hover: '#e5e5e5'
    primary-active: '#d4d4d4'
    primary-foreground: '#0d0d0d'
    muted: '#2a2a2a'
    ink: '#ececec'
    ink-secondary: '#b4b4b4'
    ink-tertiary: '#7a7a7a'
    ink-disabled: 'rgba(255, 255, 255, 0.28)'
    hairline: 'rgba(255, 255, 255, 0.09)'
    border-strong: 'rgba(255, 255, 255, 0.16)'
    hover-fill: 'rgba(255, 255, 255, 0.06)'
    active-fill: 'rgba(255, 255, 255, 0.11)'
    destructive: '#ef4444'
    warning: '#f59e0b'
    success: '#22c55e'
    info: '#60a5fa'
typography:
  heading-lg:
    fontSize: '20px'
    fontWeight: 600
    lineHeight: '28px'
  heading-sm:
    fontSize: '15px'
    fontWeight: 600
    lineHeight: '22px'
  body-md:
    fontSize: '14px'
    fontWeight: 400
    lineHeight: '22px'
  body-sm:
    fontSize: '12px'
    fontWeight: 400
    lineHeight: '20px'
  code-md:
    fontSize: '13px'
    fontWeight: 400
    lineHeight: '20px'
rounded:
  sm: '6px'
  md: '8px'
  lg: '12px'
  xl: '16px'
  full: '9999px'
spacing:
  xxs: '4px'
  xs: '8px'
  sm: '12px'
  md: '16px'
  lg: '20px'
  xl: '24px'
---

# GuEarth Design System

## Overview

GuEarth is a desktop "digital earth" for geography teaching. Its interface floats over a full-screen 3D CesiumJS globe like calm, modern monochrome instruments — inspired by ChatGPT's restrained black-and-white aesthetic. The 3D terrain and scientific geography overlays are the visual focus; UI chrome stays quiet, crisp, and neutral.

The UI layer is built on **Base UI (`@base-ui/react`)**, **Tailwind CSS v4**, **`class-variance-authority`**, **CSS Modules**, and **`lucide-react`** icons. All interactive primitives live in `src/renderer/src/components/ui/` and are consumed consistently across the globe shell, drawers, settings, teaching lab panels, and EOQ assistant.

## Dual Theme Architecture

GuEarth supports three theme modes persisted in `settings.json` (`themeMode: 'light' | 'dark' | 'system'`, default `'light'`):

- **Light** (default): pure white surfaces (`#ffffff`), subtle `#f9f9f9` secondary backgrounds, `#0d0d0d` primary ink & buttons.
- **Dark**: charcoal `#171717` surfaces, `#212121` elevated popups, `#ececec` primary ink, `#ffffff` primary buttons with `#0d0d0d` text.
- **System**: follows OS `prefers-color-scheme` and syncs Electron `nativeTheme.themeSource`.

The active resolved theme toggles `.dark` on `document.documentElement`. All CSS Modules and Base UI primitives consume CSS variables (`var(--surface)`, `var(--elevated)`, `var(--subtle)`, `var(--muted)`, `var(--ink)`, `var(--ink-secondary)`, `var(--ink-tertiary)`, `var(--hairline)`, `var(--border-strong)`, `var(--primary)`, `var(--primary-foreground)`, `var(--hover-fill)`, `var(--active-fill)`, `var(--shadow-panel)`, `var(--shadow-popup)`, `var(--shadow-dialog)`).

## Scientific Color Boundary

UI chrome is strictly monochrome. Semantic colors appear **only** in two places:

1. **Status feedback**: `--destructive` (errors, destructive confirmations), `--warning` (degraded terrain/cache notices, unsaved changes, mirror fallbacks), `--success` (verified credentials, active mirror acceleration, saved indicators), and `--info` (active toggles, in-progress states, live informational notices) — always paired with text or icons. Passive helper notices (`Alert type="neutral"`) and static category tags (`Tag tone="neutral"`) stay monochrome.
2. **Scientific geography encodings**: Cesium thematic layers, legends, SVG physics diagrams (`diagramTheme.ts`), and ECharts data series (warm/cold fronts, ocean currents, Köppen zones, SST anomalies, elevation/population ramps, age pyramids). Neutral diagram axes, strokes, gridlines, and ECharts tooltips adapt dynamically to Light and Dark themes.

## Base UI Primitives (`src/renderer/src/components/ui/`)

- **Root setup**: `main.tsx` wraps `<App />` with `CSPProvider disableStyleElements` (for strict Electron CSP), `TooltipProvider`, `ToastProvider`, and `ConfirmDialogProvider`. `#app` uses `isolation: isolate` and `body` uses `position: relative` so Base UI portals stack cleanly above the Cesium canvas.
- **Non-modal drawers**: `Drawer` uses Base UI Dialog with `modal={false}` and `disablePointerDismissal` so the 3D globe remains interactive while Layer, Annotation, Bookmarks, or EOQ drawers are open.
- **Buttons**: `Button` supports `variant` (`primary | default | ghost | dashed | link`), `size` (`sm | md | lg`), `shape` (`default | circle`), `danger`, `block`, `loading`, and `icon`. Every `<Button loading={...}>` MUST pass its icon via the `icon` prop so the loading spinner cleanly replaces it (enforced by `tests/button-loading-icon.test.mjs`).
- **Form controls**: `Input`, `PasswordInput`, `TextArea`, `NumberInput`, `Select` (plus Base UI `Combobox` when `searchable`), `Switch`, `Slider` (with `marks`), `Checkbox`, `RadioGroup`, `Segmented`, and `MonthDayPicker`.
- **Overlays & feedback**: `Modal`, `useConfirm()`, `Tooltip`, `Popover`, `Popconfirm`, `DropdownMenu`, `Tabs`, `Accordion`, `Pagination`, `Alert`, `Tag`, `Badge`, `Spinner`, `Progress`, `Empty`, `Avatar`, `Separator`, and `appToast` (`Toast.createToastManager()`).

## Accessibility & Touch Mode

- Every interactive control displays a `:focus-visible` ring using `var(--ring)` and respects `prefers-reduced-motion`.
- Touch mode (`html.touch-ui` in `touch.css`) enlarges controls via `[data-slot]` selectors (`button`, `input`, `select-trigger`, `segmented`, `switch`) for classroom touchscreens.
- Icon-only buttons always carry `aria-label` and tooltips.
