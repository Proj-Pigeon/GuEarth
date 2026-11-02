---
version: alpha
name: GuEarth Design System
description: Ant Design–based visual language for the GuEarth desktop globe. UI panels float over a 3D CesiumJS viewport like instruments on an observation deck: flat, precise, tonal — never competing with the terrain below.
colors:
  primary:
    value: '#1677ff'
  primary-hover:
    value: '#4096ff'
  primary-active:
    value: '#0958d9'
  on-primary:
    value: '#ffffff'
  ink:
    value: 'rgba(0, 0, 0, 0.88)'
  ink-secondary:
    value: 'rgba(0, 0, 0, 0.65)'
  ink-tertiary:
    value: 'rgba(0, 0, 0, 0.45)'
  ink-disabled:
    value: 'rgba(0, 0, 0, 0.25)'
  canvas:
    value: '#f5f5f5'
  surface:
    value: '#ffffff'
  hairline:
    value: 'rgba(5, 5, 5, 0.06)'
  success:
    value: '#52c41a'
  warning:
    value: '#faad14'
  error:
    value: '#ff4d4f'
  info:
    value: '#1677ff'
typography:
  display-lg:
    fontFamily: '{fontFamily.base}'
    fontSize: '38px'
    fontWeight: 600
    lineHeight: '46px'
    letterSpacing: '0px'
  heading-xl:
    fontFamily: '{fontFamily.base}'
    fontSize: '30px'
    fontWeight: 600
    lineHeight: '38px'
    letterSpacing: '0px'
  heading-lg:
    fontFamily: '{fontFamily.base}'
    fontSize: '24px'
    fontWeight: 600
    lineHeight: '32px'
    letterSpacing: '0px'
  heading-md:
    fontFamily: '{fontFamily.base}'
    fontSize: '20px'
    fontWeight: 600
    lineHeight: '28px'
    letterSpacing: '0px'
  heading-sm:
    fontFamily: '{fontFamily.base}'
    fontSize: '16px'
    fontWeight: 600
    lineHeight: '24px'
    letterSpacing: '0px'
  body-md:
    fontFamily: '{fontFamily.base}'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: '22px'
    letterSpacing: '0px'
  body-sm:
    fontFamily: '{fontFamily.base}'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: '20px'
    letterSpacing: '0px'
  caption:
    fontFamily: '{fontFamily.base}'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: '20px'
    letterSpacing: '0px'
  button-md:
    fontFamily: '{fontFamily.base}'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: '22px'
    letterSpacing: '0px'
  code-md:
    fontFamily: '{fontFamily.mono}'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: '20px'
    letterSpacing: '0px'
rounded:
  none:
    value: '0px'
  xs:
    value: '2px'
  sm:
    value: '4px'
  md:
    value: '6px'
  lg:
    value: '8px'
  xl:
    value: '10px'
  full:
    value: '9999px'
spacing:
  xxs:
    value: '4px'
  xs:
    value: '8px'
  sm:
    value: '12px'
  md:
    value: '16px'
  lg:
    value: '20px'
  xl:
    value: '24px'
  xxl:
    value: '32px'
  section:
    value: '48px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.button-md}'
    rounded: '{rounded.md}'
    height: '32px'
    padding: '7px 16px'
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
    textColor: '{colors.on-primary}'
    typography: '{typography.button-md}'
    rounded: '{rounded.md}'
    height: '32px'
    padding: '7px 16px'
  button-primary-active:
    backgroundColor: '{colors.primary-active}'
    textColor: '{colors.on-primary}'
    typography: '{typography.button-md}'
    rounded: '{rounded.md}'
    height: '32px'
    padding: '7px 16px'
  button-primary-disabled:
    backgroundColor: 'rgba(0, 0, 0, 0.04)'
    textColor: '{colors.ink-disabled}'
    typography: '{typography.button-md}'
    rounded: '{rounded.md}'
    height: '32px'
    padding: '7px 16px'
  button-default:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.button-md}'
    rounded: '{rounded.md}'
    height: '32px'
    padding: '4px 15px'
  button-default-hover:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.primary-hover}'
    typography: '{typography.button-md}'
    rounded: '{rounded.md}'
    height: '32px'
    padding: '4px 15px'
  text-input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body-md}'
    rounded: '{rounded.md}'
    height: '32px'
    padding: '4px 11px'
  text-input-focused:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body-md}'
    rounded: '{rounded.md}'
    height: '32px'
    padding: '4px 11px'
  text-input-error:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.error}'
    typography: '{typography.body-md}'
    rounded: '{rounded.md}'
    height: '32px'
    padding: '4px 11px'
  panel-floating:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.lg}'
    padding: '{spacing.md}'
  toolbar-item:
    backgroundColor: 'transparent'
    textColor: '{colors.ink-secondary}'
    rounded: '{rounded.sm}'
    size: '32px'
  toolbar-item-hover:
    backgroundColor: 'rgba(0, 0, 0, 0.04)'
    textColor: '{colors.ink}'
    rounded: '{rounded.sm}'
    size: '32px'
  list-item:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    typography: '{typography.body-md}'
    padding: '{spacing.xs} {spacing.sm}'
  list-item-selected:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.body-md}'
    padding: '{spacing.xs} {spacing.sm}'
  badge-error:
    backgroundColor: '{colors.error}'
    textColor: '{colors.on-primary}'
    rounded: '{rounded.full}'
  badge-success:
    backgroundColor: '{colors.success}'
    textColor: '{colors.on-primary}'
    rounded: '{rounded.full}'
  tag-terrain:
    backgroundColor: 'rgba(0, 0, 0, 0.04)'
    textColor: '{colors.ink-secondary}'
    rounded: '{rounded.sm}'
    padding: '0px 7px'
  tooltip:
    backgroundColor: 'rgba(0, 0, 0, 0.85)'
    textColor: '{colors.surface}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.sm}'
    padding: '{spacing.xxs} {spacing.xs}'
---

# GuEarth Design System

## Overview

GuEarth is a desktop "digital earth" for geography teaching. Its interface is a thin layer of
instrument panels floating over a full-screen 3D globe (CesiumJS). The product should feel like a
well-made field instrument: calm, precise, and deferential to the content — the terrain is the
hero, chrome is the exception.

The visual language is **Ant Design** (spec follows the current v6 docs; the Vue port
`ant-design-vue@4.x` implements the same token system):

- **Natural** — rely on platform and Ant conventions; no exotic controls without necessity.
- **Certain** — every state is explicit (hover, active, disabled, loading, error); nothing is
  implied.
- **Meaningful** — color and emphasis signal actions and status, never decoration.
- **Growing** — scales from a single globe window to dense teaching tools without redesign.

Base rule: use **Ant Design Vue components as-is**. Introduce a custom component only when Ant
Design has no equivalent (for example globe-anchored overlays), and build it from these tokens.

## Colors

Ant Design derives everything from one seed: **`{colors.primary}` `#1677FF`**.

Semantic roles:

| Token | Value | Use |
| --- | --- | --- |
| `colors.primary` | `#1677FF` | Primary actions, links, selection, focus ring |
| `colors.on-primary` | `#FFFFFF` | Text/icons on primary fills |
| `colors.ink` | `rgba(0,0,0,0.88)` | Primary text |
| `colors.ink-secondary` | `rgba(0,0,0,0.65)` | Secondary text, labels |
| `colors.ink-tertiary` | `rgba(0,0,0,0.45)` | Hints, placeholders, map credits |
| `colors.ink-disabled` | `rgba(0,0,0,0.25)` | Disabled text |
| `colors.canvas` | `#F5F5F5` | Ambient app background behind panels |
| `colors.surface` | `#FFFFFF` | Panels, cards, inputs — floating layers |
| `colors.hairline` | `rgba(5,5,5,0.06)` | Dividers, panel borders |
| `colors.success` / `colors.warning` / `colors.error` / `colors.info` | `#52C41A` / `#FAAD14` / `#FF4D4F` / `#1677FF` | Status only |

Rules:

- Text neutrals are **transparent black overlays**, never solid gray hex — they blend correctly
  over any panel background.
- Status colors (success/warning/error/info) appear **only** in status contexts: alerts, badges,
  validation, toasts. Never use red or green decoratively.
- The globe viewport itself is the app canvas; `colors.canvas` applies to non-fullscreen panel
  backgrounds and docked sidebars.

## Typography

System font stack, 14px base, weights 400 and 600 only. No italics, no thin weights.

```
fontFamily.base = -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
                  'Noto Sans', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC',
                  'Noto Sans SC', 'WenQuanYi Micro Hei', sans-serif
fontFamily.mono = 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace
```

| Level | Size/Line | Weight | Use |
| --- | --- | --- | --- |
| `typography.display-lg` | 38/46 | 600 | Onboarding/empty states only |
| `typography.heading-xl` | 30/38 | 600 | Full-screen dialog titles |
| `typography.heading-lg` | 24/32 | 600 | Major panel titles |
| `typography.heading-md` | 20/28 | 600 | Section titles |
| `typography.heading-sm` | 16/24 | 600 | Card/panel titles |
| `typography.body-md` | 14/22 | 400 | Default UI text |
| `typography.body-sm` | 12/20 | 400 | Dense lists, secondary text |
| `typography.caption` | 12/20 | 400 | Map credits, coordinates, hints |
| `typography.button-md` | 14/22 | 400 | Buttons |
| `typography.code-md` | 13/20 | 400 | Coordinates, measurements, data readouts |

All coordinates, lat/lng values, distances and areas use `typography.code-md` — numeric teaching
data must be tabular and monospaced.

## Layout

- **4px grid.** Every margin, padding, and gap is a multiple of `{spacing.xxs}` (4px). The scale
  runs `{spacing.xxs}` 4 → `{spacing.section}` 48. No odd values, no `15px`.
- **The globe fills the window.** It is always full-viewport; panels float above it. Never place a
  solid background behind the whole window.
- **Panel placement.** Floating panels anchor to window edges with `{spacing.md}` (16px) inset.
  Toolbars dock top or left; the AI assistant docks right; status/credits sit bottom, right of
  Ant's built-in credit line.
- **Density.** Desktop-first: default control height 32px, compact lists use `{spacing.xs}` 8px
  row padding. Do not shrink controls below 32px to fit more tools — group into menus instead.
- Panels over bright terrain imagery keep `colors.surface` backgrounds and `colors.hairline`
  borders; do not use transparent or "glass" fills (`needs-design-decision` if demanded later).

## Elevation & Depth

Depth comes from **tone and borders first**, shadows second:

- Flat panels sit on `colors.surface` with a `1px` `colors.hairline` border — no shadow.
- Shadows are reserved for genuinely floating layers, using Ant's programmatic shadows:
  - `boxShadowSecondary` — dropdowns, tooltips, small popovers
  - `boxShadowTertiary` — right-docked AI assistant panel
  - `boxShadow` — modal dialogs
- Never stack multiple shadows or invent custom shadow values.

Motion — three durations only, with Ant's standard easings:

| Duration | Easing | Use |
| --- | --- | --- |
| `0.1s` | ease-out | Hover/active state changes |
| `0.2s` | ease-in-out | Panel transitions, hover reveals |
| `0.3s` | ease-in-out | Surface changes: dialog in/out, drawer slide |

Camera fly-to animations are scene content (Cesium), not UI motion; they follow their own
curves and are exempt from the table above.

## Shapes

| Token | Value | Use |
| --- | --- | --- |
| `rounded.none` | `0px` | Full-bleed surfaces flush to window edges |
| `rounded.xs` | `2px` | Checkboxes, tiny indicators |
| `rounded.sm` | `4px` | Tags, tooltips, toolbar items, inner chips |
| `rounded.md` | `6px` | **Default**: buttons, inputs, selects, menus |
| `rounded.lg` | `8px` | Cards, floating panels, drawers |
| `rounded.xl` | `10px` | Modals, large dialogs |
| `rounded.full` | `9999px` | Badges, avatars, pill toggles |

Interactive state changes (hover/focus/active) are expressed through **color shifts and border
color/thickness**, never size or weight changes.

## Components

Model every state as a related frontmatter token (`button-primary` → `button-primary-hover` …).

### Buttons

- `button-primary` — one per view: execute/fly-to/apply. `button-primary-hover` and
  `button-primary-active` continue the seed ramp; `button-primary-disabled` drops to the neutral
  fill.
- `button-default` — all other actions. Do not create additional button variants; use
  `type="text"` only inside toolbars and table rows.
- Destructive actions use `danger` styling (Ant `#FF4D4F` border/text), never custom red.

### Inputs

- `text-input` default; `text-input-focused` adds the Ant focus ring (`2px` `colors.primary`
  outline at 10% offset); `text-input-error` pairs the red border with a validation message —
  error color is never the only signal.
- Map/coordinate inputs display values in `typography.code-md`.

### Panels & toolbar

- `panel-floating` is the standard teaching panel container (surface + hairline border +
  `{rounded.lg}`).
- `toolbar-item` / `toolbar-item-hover` are 32px icon buttons for the globe toolbar; selected
  tool keeps `button-primary` colors.
- The EOQ AI assistant is a docked `panel-floating`; streaming text uses `typography.body-md`,
  tool-call chips use `tag-terrain`.

### Lists, tags & status

- `list-item` / `list-item-selected` for layers, bookmarks, lesson items; selection uses primary
  fill, not bold text.
- `tag-terrain` is the default neutral tag; category colors from the Ant preset palettes are
  allowed **only** on tags and charts.
- Status feedback: `badge-error`, `badge-success` on list rows; alerts/toasts use Ant semantic
  components. Every semantic state also carries text or an icon (color-not-alone rule).

### Empty, loading & error states

Every panel and list must define: empty state (icon + one sentence + one action), loading state
(Ant `Spin`/`Skeleton`, never frozen UI), and error state (alert + retry). A panel without these
three states is incomplete.

## Do's and Don'ts

**Do**

- Use Ant Design Vue components and these tokens before inventing anything.
- Keep the globe full-bleed; float every piece of chrome.
- Express state through color/border changes within the 0.1/0.2/0.3s motion tiers.
- Use `typography.code-md` for all measurements and coordinates.

**Don't**

- Don't put solid background layers over more than ~40% of the viewport; panels stay compact.
- Don't use status colors (red/green/yellow) decoratively.
- Don't add shadows to bordered, non-floating surfaces.
- Don't introduce custom fonts, weights (400/600 only), italics, or off-scale radii/spacing.
- Don't build a second UI kit in `src/renderer/src` — extend through Ant `theme` config instead.

## Accessibility

- Body text on `colors.surface` meets WCAG AA (4.5:1) via the 0.88/0.65 ink alphas; 0.45 tertiary
  text is for hints ≥12px only, never for actions.
- All interactive elements show a visible `:focus-visible` ring (`2px` `colors.primary`); never
  remove outlines without replacing them.
- Semantic states are never color-only — pair with icon or text.
- Respect `prefers-reduced-motion`: collapse 0.2s/0.3s UI transitions to near-instant; globe
  fly-to remains but may shorten.
- Icon-only toolbar buttons require `aria-label` and tooltip.

## Known Gaps

- Dark theme for night-classroom use: `needs-design-decision`.
- Max panel width / multi-panel tiling rules: `needs-design-decision`.
- Styling of map-provider attribution alongside Ant credits: `needs-design-decision`.
