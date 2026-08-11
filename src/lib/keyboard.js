const CHORD_TIMEOUT_MS = 400

export function createChordTracker(chords = { g: { g: 'gg' } }) {
  let pendingPrefix = null
  let deadline = 0

  return {
    press(key, now = Date.now()) {
      if (pendingPrefix && now > deadline) {
        pendingPrefix = null
      }

      if (pendingPrefix) {
        const completion = chords[pendingPrefix]?.[key]
        pendingPrefix = null
        deadline = 0
        return completion ?? null
      }

      if (chords[key]) {
        pendingPrefix = key
        deadline = now + CHORD_TIMEOUT_MS
        return 'pending'
      }

      return null
    },
    reset() {
      pendingPrefix = null
      deadline = 0
    },
    hasPendingPrefix() {
      return Boolean(pendingPrefix)
    }
  }
}

export function isEditableElement(element) {
  if (!(element instanceof HTMLElement)) {
    return false
  }

  if (element.isContentEditable) {
    return true
  }

  const tagName = element.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

export function isSuppressedInteractiveElement(element) {
  if (!(element instanceof HTMLElement)) {
    return false
  }

  if (isEditableElement(element)) {
    return true
  }

  const tagName = element.tagName.toLowerCase()
  return tagName === 'a' || tagName === 'button' || tagName === 'summary'
}

export function hasCommandModifier(event) {
  return Boolean(event.altKey || event.ctrlKey || event.metaKey)
}
