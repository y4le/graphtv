import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PLACEHOLDER_FADE_MS,
  PLACEHOLDER_ROTATION_MS,
  createPlaceholderRotation
} from '../../src/ui/placeholderRotation.js'

const TITLES = ['Alpha', 'Bravo', 'Charlie']
let originalVisibilityState

function createInput() {
  const input = document.createElement('input')
  input.type = 'search'
  document.body.replaceChildren(input)
  return input
}

function advanceOneCycle() {
  vi.advanceTimersByTime(PLACEHOLDER_ROTATION_MS)
  vi.advanceTimersByTime(PLACEHOLDER_FADE_MS)
}

function installMotionPreference(initialMatches = false) {
  const listeners = new Set()
  const motionQuery = {
    matches: initialMatches,
    addEventListener: vi.fn((_event, listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_event, listener) =>
      listeners.delete(listener)
    ),
    setMatches(matches) {
      this.matches = matches
      listeners.forEach((listener) => listener({ matches }))
    }
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => motionQuery)
  )
  return motionQuery
}

beforeEach(() => {
  vi.useFakeTimers()
  originalVisibilityState = Object.getOwnPropertyDescriptor(
    document,
    'visibilityState'
  )
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible'
  })
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.replaceChildren()
  if (originalVisibilityState) {
    Object.defineProperty(document, 'visibilityState', originalVisibilityState)
  } else {
    delete document.visibilityState
  }
})

describe('createPlaceholderRotation', () => {
  it('sets the initial title synchronously and advances after a full hold and fade', () => {
    const input = createInput()
    const controller = createPlaceholderRotation(input, {
      titles: TITLES,
      startIndex: 0
    })

    expect(input.placeholder).toBe('Alpha')
    vi.advanceTimersByTime(PLACEHOLDER_ROTATION_MS)
    expect(input.placeholder).toBe('Alpha')
    expect(input.classList.contains('is-placeholder-swapping')).toBe(true)

    vi.advanceTimersByTime(PLACEHOLDER_FADE_MS)
    expect(input.placeholder).toBe('Bravo')
    expect(input.classList.contains('is-placeholder-swapping')).toBe(false)

    controller.destroy()
  })

  it('wraps from the final title to the first', () => {
    const input = createInput()
    const controller = createPlaceholderRotation(input, {
      titles: TITLES,
      startIndex: 2
    })

    advanceOneCycle()

    expect(input.placeholder).toBe('Alpha')
    controller.destroy()
  })

  it('derives and normalizes the starting index without mutating the title list', () => {
    const input = createInput()
    const controller = createPlaceholderRotation(input, {
      titles: TITLES,
      random: () => 0.5
    })

    expect(input.placeholder).toBe('Bravo')
    expect(TITLES).toEqual(['Alpha', 'Bravo', 'Charlie'])
    controller.destroy()

    const wrappedInput = createInput()
    const wrappedController = createPlaceholderRotation(wrappedInput, {
      titles: TITLES,
      startIndex: -1
    })
    expect(wrappedInput.placeholder).toBe('Charlie')
    wrappedController.destroy()
  })

  it('honors custom cadence and fade durations', () => {
    const input = createInput()
    const controller = createPlaceholderRotation(input, {
      titles: TITLES,
      startIndex: 0,
      intervalMs: 500,
      fadeMs: 50
    })

    expect(input.style.getPropertyValue('--placeholderFadeDuration')).toBe(
      '50ms'
    )
    vi.advanceTimersByTime(499)
    expect(input.classList.contains('is-placeholder-swapping')).toBe(false)
    vi.advanceTimersByTime(1)
    expect(input.classList.contains('is-placeholder-swapping')).toBe(true)
    vi.advanceTimersByTime(50)
    expect(input.placeholder).toBe('Bravo')

    controller.destroy()
  })

  it('pauses while the input has a value and resumes from the next title when cleared', () => {
    const input = createInput()
    const controller = createPlaceholderRotation(input, {
      titles: TITLES,
      startIndex: 0
    })

    input.value = 'br'
    input.dispatchEvent(new Event('input'))
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime((PLACEHOLDER_ROTATION_MS + PLACEHOLDER_FADE_MS) * 2)
    expect(input.placeholder).toBe('Alpha')

    input.value = ''
    input.dispatchEvent(new Event('search'))
    advanceOneCycle()
    expect(input.placeholder).toBe('Bravo')

    controller.destroy()
  })

  it('does not mutate the input value or focus', () => {
    const input = createInput()
    input.focus()
    const controller = createPlaceholderRotation(input, {
      titles: TITLES,
      startIndex: 0
    })

    advanceOneCycle()
    advanceOneCycle()

    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    controller.destroy()
  })

  it('stays static and timer-free when reduced motion is preferred', () => {
    installMotionPreference(true)
    const input = createInput()
    const controller = createPlaceholderRotation(input, {
      titles: TITLES,
      startIndex: 0
    })

    vi.advanceTimersByTime((PLACEHOLDER_ROTATION_MS + PLACEHOLDER_FADE_MS) * 3)

    expect(input.placeholder).toBe('Alpha')
    expect(vi.getTimerCount()).toBe(0)
    controller.destroy()
  })

  it('responds to live reduced-motion and page-visibility changes', () => {
    const motionQuery = installMotionPreference(false)
    const input = createInput()
    const controller = createPlaceholderRotation(input, {
      titles: TITLES,
      startIndex: 0
    })

    motionQuery.setMatches(true)
    expect(vi.getTimerCount()).toBe(0)
    motionQuery.setMatches(false)
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(vi.getTimerCount()).toBe(0)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    })
    document.dispatchEvent(new Event('visibilitychange'))
    advanceOneCycle()
    expect(input.placeholder).toBe('Bravo')

    controller.destroy()
  })

  it('stops after the configured motion budget', () => {
    const input = createInput()
    const controller = createPlaceholderRotation(input, {
      titles: TITLES,
      startIndex: 0,
      maxCycles: 2
    })

    advanceOneCycle()
    advanceOneCycle()
    advanceOneCycle()

    expect(input.placeholder).toBe('Charlie')
    expect(vi.getTimerCount()).toBe(0)
    controller.destroy()
  })

  it('restarts its motion budget after an explicit reset', () => {
    const input = createInput()
    const controller = createPlaceholderRotation(input, {
      titles: TITLES,
      startIndex: 0,
      maxCycles: 1
    })

    advanceOneCycle()
    expect(vi.getTimerCount()).toBe(0)

    controller.restart()
    advanceOneCycle()
    expect(input.placeholder).toBe('Charlie')

    controller.destroy()
  })

  it('cleans up timers, listeners, transition state, and its custom property', () => {
    const motionQuery = installMotionPreference(false)
    const input = createInput()
    const inputRemoveListener = vi.spyOn(input, 'removeEventListener')
    const documentRemoveListener = vi.spyOn(document, 'removeEventListener')
    const controller = createPlaceholderRotation(input, {
      titles: TITLES,
      startIndex: 0
    })

    vi.advanceTimersByTime(PLACEHOLDER_ROTATION_MS)
    controller.destroy()
    vi.advanceTimersByTime(PLACEHOLDER_FADE_MS)

    expect(input.placeholder).toBe('Alpha')
    expect(input.classList.contains('is-placeholder-swapping')).toBe(false)
    expect(input.style.getPropertyValue('--placeholderFadeDuration')).toBe('')
    expect(motionQuery.removeEventListener).toHaveBeenCalledOnce()
    expect(inputRemoveListener).toHaveBeenCalledWith(
      'input',
      expect.any(Function)
    )
    expect(inputRemoveListener).toHaveBeenCalledWith(
      'search',
      expect.any(Function)
    )
    expect(documentRemoveListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('handles empty and single-title lists without scheduling rotation', () => {
    const emptyInput = createInput()
    emptyInput.placeholder = 'Fallback'
    const emptyController = createPlaceholderRotation(emptyInput, {
      titles: [],
      startIndex: 0
    })
    expect(emptyInput.placeholder).toBe('Fallback')
    expect(vi.getTimerCount()).toBe(0)
    emptyController.destroy()

    const singleInput = createInput()
    const singleController = createPlaceholderRotation(singleInput, {
      titles: ['Only'],
      startIndex: 0
    })
    expect(singleInput.placeholder).toBe('Only')
    expect(vi.getTimerCount()).toBe(0)
    singleController.destroy()
  })
})
