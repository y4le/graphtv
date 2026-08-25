const FIT_SAFETY_RATIO = 0.995
const MINIMUM_TITLE_FONT_SIZE = 14

const NOOP_FITTER = { destroy() {}, refresh() {} }

export function createTitleFitter(
  element,
  { reserveSiblingSpace = false } = {}
) {
  const parent = element?.parentElement
  if (!element || !parent) {
    return NOOP_FITTER
  }

  const view = element.ownerDocument.defaultView
  let destroyed = false
  let frame = null

  function getAvailableWidth() {
    const parentStyle = view.getComputedStyle(parent)
    let available =
      parent.clientWidth -
      parsePixelValue(parentStyle.paddingLeft) -
      parsePixelValue(parentStyle.paddingRight)

    if (!reserveSiblingSpace) {
      return available
    }

    const siblings = Array.from(parent.children).filter(
      (child) => child !== element && !child.hidden
    )
    const siblingWidth = siblings.reduce(
      (total, sibling) =>
        total + (sibling.getBoundingClientRect().width || sibling.offsetWidth),
      0
    )
    const gap = parsePixelValue(parentStyle.columnGap || parentStyle.gap)
    available -= siblingWidth + gap * siblings.length
    return available
  }

  function fit() {
    if (destroyed || !element.isConnected) {
      return
    }

    element.style.removeProperty('font-size')
    const availableWidth = getAvailableWidth()
    const maximumFontSize = parsePixelValue(
      view.getComputedStyle(element).fontSize
    )
    const naturalWidth = element.scrollWidth

    if (
      availableWidth <= 0 ||
      maximumFontSize <= 0 ||
      naturalWidth <= availableWidth
    ) {
      return
    }

    const fittedFontSize =
      maximumFontSize * (availableWidth / naturalWidth) * FIT_SAFETY_RATIO
    element.style.fontSize = `${Math.max(
      MINIMUM_TITLE_FONT_SIZE,
      fittedFontSize
    )}px`
  }

  function scheduleFit() {
    if (destroyed || frame !== null) {
      return
    }
    frame = requestFrame(view, () => {
      frame = null
      fit()
    })
  }

  const mutationObserver = new MutationObserver(scheduleFit)
  mutationObserver.observe(element, {
    characterData: true,
    childList: true,
    subtree: true
  })

  const ResizeObserverImpl = view.ResizeObserver
  const resizeObserver = ResizeObserverImpl
    ? new ResizeObserverImpl(scheduleFit)
    : null
  resizeObserver?.observe(parent)
  if (!resizeObserver) {
    view.addEventListener('resize', scheduleFit)
  }

  element.ownerDocument.fonts?.ready.then(scheduleFit)
  fit()

  return {
    destroy() {
      destroyed = true
      mutationObserver.disconnect()
      resizeObserver?.disconnect()
      if (!resizeObserver) {
        view.removeEventListener('resize', scheduleFit)
      }
      if (frame !== null) {
        cancelFrame(view, frame)
        frame = null
      }
      element.style.removeProperty('font-size')
    },
    refresh: fit
  }
}

function parsePixelValue(value) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function requestFrame(view, callback) {
  return typeof view.requestAnimationFrame === 'function'
    ? view.requestAnimationFrame(callback)
    : view.setTimeout(callback, 0)
}

function cancelFrame(view, frame) {
  if (typeof view.cancelAnimationFrame === 'function') {
    view.cancelAnimationFrame(frame)
    return
  }
  view.clearTimeout(frame)
}
