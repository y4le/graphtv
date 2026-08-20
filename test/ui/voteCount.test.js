import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  bindVoteCountTooltips,
  renderVoteCount
} from '../../src/ui/voteCount.js'

afterEach(() => {
  document.body.replaceChildren()
})

describe('renderVoteCount', () => {
  it('renders compact visible copy and a precise explanation', () => {
    const root = renderVoteCountMarkup(17_700)

    expect(root.querySelector('.vote-count-trigger').textContent).toBe(
      '(17.7k)'
    )
    expect(root.querySelector('.vote-count-tooltip').textContent).toBe(
      '17,700 votes were submitted for this score.'
    )
    expect(
      root.querySelector('.vote-count-trigger').getAttribute('aria-label')
    ).toBe('17.7k votes. 17,700 votes were submitted for this score.')
  })

  it('omits unavailable counts and handles a singular vote', () => {
    expect(renderVoteCount(null)).toBe('')
    expect(renderVoteCount(Number.NaN)).toBe('')

    const root = renderVoteCountMarkup(1)
    expect(root.querySelector('.vote-count-trigger').textContent).toBe('(1)')
    expect(root.querySelector('.vote-count-tooltip').textContent).toBe(
      '1 vote was submitted for this score.'
    )
  })
})

describe('bindVoteCountTooltips', () => {
  it('supports hover, focus, tap, Escape, and outside dismissal', () => {
    const root = document.createElement('div')
    root.innerHTML = `${renderVoteCount(17_700)}${renderVoteCount(42)}`
    document.body.appendChild(root)
    const stop = bindVoteCountTooltips(root)
    const [first, second] = root.querySelectorAll('[data-vote-count-control]')
    const firstTrigger = first.querySelector('.vote-count-trigger')
    const secondTrigger = second.querySelector('.vote-count-trigger')

    first.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(first.querySelector('.vote-count-tooltip').hidden).toBe(false)
    first.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    expect(first.querySelector('.vote-count-tooltip').hidden).toBe(true)

    firstTrigger.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(firstTrigger.getAttribute('aria-expanded')).toBe('true')
    firstTrigger.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))

    firstTrigger.click()
    expect(first.querySelector('.vote-count-tooltip').hidden).toBe(false)
    secondTrigger.click()
    expect(first.querySelector('.vote-count-tooltip').hidden).toBe(true)
    expect(second.querySelector('.vote-count-tooltip').hidden).toBe(false)

    const onDocumentEscape = vi.fn()
    document.addEventListener('keydown', onDocumentEscape)
    secondTrigger.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
    )
    expect(second.querySelector('.vote-count-tooltip').hidden).toBe(true)
    expect(onDocumentEscape).not.toHaveBeenCalled()

    secondTrigger.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
    )
    expect(onDocumentEscape).toHaveBeenCalledOnce()
    document.removeEventListener('keydown', onDocumentEscape)

    firstTrigger.click()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(first.querySelector('.vote-count-tooltip').hidden).toBe(true)

    stop()
  })

  it('stops a vote-count tap from activating a containing rating control', () => {
    const root = document.createElement('div')
    root.innerHTML = `<button type="button" data-rating>${renderVoteCount(42, {
      interactive: false
    })}</button>`
    document.body.appendChild(root)
    const onRating = vi.fn()
    root.addEventListener('click', (event) => {
      if (
        !event.target.closest('[data-vote-count-trigger]') &&
        event.target.closest('[data-rating]')
      ) {
        onRating()
      }
    })
    const stop = bindVoteCountTooltips(root)

    root.querySelector('.vote-count-trigger').click()

    expect(onRating).not.toHaveBeenCalled()
    expect(root.querySelector('.vote-count-tooltip').hidden).toBe(false)
    stop()
  })

  it('removes root and document listeners when stopped', () => {
    const root = document.createElement('div')
    root.innerHTML = renderVoteCount(42)
    document.body.appendChild(root)
    const stop = bindVoteCountTooltips(root)
    const trigger = root.querySelector('.vote-count-trigger')
    const tooltip = root.querySelector('.vote-count-tooltip')

    trigger.click()
    expect(tooltip.hidden).toBe(false)

    stop()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(tooltip.hidden).toBe(false)

    trigger.click()
    expect(tooltip.hidden).toBe(false)
  })
})

function renderVoteCountMarkup(votes) {
  const root = document.createElement('div')
  root.innerHTML = renderVoteCount(votes)
  return root
}
