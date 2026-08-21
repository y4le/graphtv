import { afterEach, describe, expect, it, vi } from 'vitest'

import { createShowPicker } from '../../src/ui/showPicker.js'

let picker

afterEach(() => {
  picker?.destroy()
  picker = null
  document.body.replaceChildren()
})

describe('createShowPicker', () => {
  it('searches, excludes the current pair, and returns a selected show', async () => {
    const root = document.createElement('section')
    root.hidden = true
    document.body.append(root)
    const onSelect = vi.fn()
    const search = vi.fn(async () => [
      createShow('tvmaze:1', 'Current Show'),
      createShow('tvmaze:2', 'Next Show')
    ])
    picker = createShowPicker(root, {
      provider: 'tvmaze',
      excludedRefs: ['tvmaze:1'],
      onSelect,
      search
    })

    picker.open()
    const input = root.querySelector('input')
    expect(root.hidden).toBe(false)
    expect(document.activeElement).toBe(input)

    input.value = 'next'
    root
      .querySelector('form')
      .dispatchEvent(new SubmitEvent('submit', { bubbles: true }))
    await vi.waitFor(() =>
      expect(root.querySelectorAll('[data-show-ref]')).toHaveLength(1)
    )

    expect(search).toHaveBeenCalledWith(
      'next',
      'tvmaze',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(root.textContent).not.toContain('Current Show')
    root.querySelector('[data-show-ref]').click()
    expect(onSelect).toHaveBeenCalledWith('tvmaze:2')
  })

  it('closes on Escape and restores through its callback', () => {
    const root = document.createElement('section')
    document.body.append(root)
    const onClose = vi.fn()
    picker = createShowPicker(root, { onClose })
    picker.open()

    root.querySelector('input').dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      })
    )

    expect(root.hidden).toBe(true)
    expect(onClose).toHaveBeenCalledOnce()
  })
})

function createShow(id, title) {
  return {
    id,
    title,
    year: '2020',
    genres: ['Drama'],
    poster: null
  }
}
