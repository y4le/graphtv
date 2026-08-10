import { POPULAR_SHOW_TITLES } from '../data/popularShows.js'

export const PLACEHOLDER_ROTATION_MS = 3000
export const PLACEHOLDER_FADE_MS = 220
export const PLACEHOLDER_MAX_CYCLES = 12

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const SWAPPING_CLASS = 'is-placeholder-swapping'

export function createPlaceholderRotation(input, options = {}) {
  const {
    titles = POPULAR_SHOW_TITLES,
    intervalMs = PLACEHOLDER_ROTATION_MS,
    fadeMs = PLACEHOLDER_FADE_MS,
    maxCycles = PLACEHOLDER_MAX_CYCLES,
    random = Math.random,
    startIndex = Math.floor(random() * titles.length)
  } = options
  const titleCount = titles.length
  let index = titleCount ? ((startIndex % titleCount) + titleCount) % titleCount : 0
  let completedCycles = 0
  let cycleTimer = null
  let fadeTimer = null
  let destroyed = false

  const motionQuery =
    typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : null

  function canRotate() {
    return (
      !destroyed &&
      titleCount > 1 &&
      input.value === '' &&
      completedCycles < maxCycles &&
      !motionQuery?.matches &&
      document.visibilityState !== 'hidden'
    )
  }

  function stop() {
    if (cycleTimer !== null) {
      window.clearTimeout(cycleTimer)
      cycleTimer = null
    }
    if (fadeTimer !== null) {
      window.clearTimeout(fadeTimer)
      fadeTimer = null
    }
    input.classList.remove(SWAPPING_CLASS)
  }

  function schedule() {
    if (!canRotate() || cycleTimer !== null || fadeTimer !== null) {
      return
    }

    cycleTimer = window.setTimeout(beginSwap, intervalMs)
  }

  function beginSwap() {
    cycleTimer = null
    if (!canRotate()) {
      stop()
      return
    }

    input.classList.add(SWAPPING_CLASS)
    fadeTimer = window.setTimeout(finishSwap, fadeMs)
  }

  function finishSwap() {
    fadeTimer = null
    if (!canRotate()) {
      stop()
      return
    }

    index = (index + 1) % titleCount
    input.placeholder = titles[index]
    input.classList.remove(SWAPPING_CLASS)
    completedCycles += 1
    schedule()
  }

  function sync() {
    stop()
    schedule()
  }

  function destroy() {
    destroyed = true
    stop()
    input.removeEventListener('input', sync)
    input.removeEventListener('search', sync)
    document.removeEventListener('visibilitychange', sync)
    motionQuery?.removeEventListener('change', sync)
    input.style.removeProperty('--placeholderFadeDuration')
  }

  function restart() {
    completedCycles = 0
    sync()
  }

  if (titleCount) {
    input.placeholder = titles[index]
  }
  input.style.setProperty('--placeholderFadeDuration', `${fadeMs}ms`)
  input.addEventListener('input', sync)
  input.addEventListener('search', sync)
  document.addEventListener('visibilitychange', sync)
  motionQuery?.addEventListener('change', sync)
  sync()

  return { destroy, restart }
}
