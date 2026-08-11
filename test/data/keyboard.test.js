import { describe, expect, it } from 'vitest'

import {
  createChordTracker,
  hasCommandModifier
} from '../../src/lib/keyboard.js'

describe('lib/keyboard', () => {
  it('tracks the gg chord without delaying unrelated keys', () => {
    const tracker = createChordTracker()

    expect(tracker.press('g', 1000)).toBe('pending')
    expect(tracker.press('g', 1100)).toBe('gg')
    expect(tracker.press('j', 1200)).toBeNull()
  })

  it('clears pending chord state after timeout', () => {
    const tracker = createChordTracker()

    expect(tracker.press('g', 1000)).toBe('pending')
    expect(tracker.press('x', 1500)).toBeNull()
    expect(tracker.hasPendingPrefix()).toBe(false)
  })

  it('distinguishes command modifiers from Shift-produced shortcut keys', () => {
    expect(hasCommandModifier({ shiftKey: true })).toBe(false)
    expect(hasCommandModifier({ altKey: true })).toBe(true)
    expect(hasCommandModifier({ ctrlKey: true })).toBe(true)
    expect(hasCommandModifier({ metaKey: true })).toBe(true)
  })
})
