export interface GuideRectBox {
  top: number
  left: number
  width: number
  height: number
}

export type GuidePlacement = 'top' | 'bottom' | 'bottomLeft' | 'left'

export interface GuideCardPosition {
  top: number
  left: number
}

const VIEWPORT_MARGIN = 16
const TARGET_GAP = 14

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function computeGuideCardPosition(
  targetRect: GuideRectBox | null,
  placement: GuidePlacement,
  cardWidth: number,
  cardHeight: number,
  viewportWidth: number,
  viewportHeight: number
): GuideCardPosition {
  const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - cardHeight - VIEWPORT_MARGIN)
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - cardWidth - VIEWPORT_MARGIN)

  if (!targetRect) {
    return {
      top: clamp(Math.round((viewportHeight - cardHeight) / 2), VIEWPORT_MARGIN, maxTop),
      left: clamp(Math.round((viewportWidth - cardWidth) / 2), VIEWPORT_MARGIN, maxLeft)
    }
  }

  const spaceAbove = targetRect.top - VIEWPORT_MARGIN - TARGET_GAP
  const spaceBelow =
    viewportHeight - (targetRect.top + targetRect.height) - VIEWPORT_MARGIN - TARGET_GAP
  const spaceLeft = targetRect.left - VIEWPORT_MARGIN - TARGET_GAP
  const spaceRight =
    viewportWidth - (targetRect.left + targetRect.width) - VIEWPORT_MARGIN - TARGET_GAP

  let top: number
  let left: number

  if (placement === 'top') {
    const placeBelow = spaceAbove < cardHeight && spaceBelow > spaceAbove
    top = placeBelow
      ? targetRect.top + targetRect.height + TARGET_GAP
      : targetRect.top - cardHeight - TARGET_GAP
    left = targetRect.left + targetRect.width / 2 - cardWidth / 2
  } else if (placement === 'bottomLeft') {
    const placeAbove = spaceBelow < cardHeight && spaceAbove > spaceBelow
    top = placeAbove
      ? targetRect.top - cardHeight - TARGET_GAP
      : targetRect.top + targetRect.height + TARGET_GAP
    left = targetRect.left
  } else if (placement === 'left') {
    const placeRight = spaceLeft < cardWidth && spaceRight > spaceLeft
    top = targetRect.top + targetRect.height / 2 - cardHeight / 2
    left = placeRight
      ? targetRect.left + targetRect.width + TARGET_GAP
      : targetRect.left - cardWidth - TARGET_GAP
  } else {
    const placeAbove = spaceBelow < cardHeight && spaceAbove > spaceBelow
    top = placeAbove
      ? targetRect.top - cardHeight - TARGET_GAP
      : targetRect.top + targetRect.height + TARGET_GAP
    left = targetRect.left + targetRect.width / 2 - cardWidth / 2
  }

  return {
    top: Math.round(clamp(top, VIEWPORT_MARGIN, maxTop)),
    left: Math.round(clamp(left, VIEWPORT_MARGIN, maxLeft))
  }
}
