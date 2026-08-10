import { describe, expect, it } from 'vitest'

import { renderSearchMasthead } from '../../src/pages/search.js'

describe('renderSearchMasthead', () => {
  it('keeps the publisher signature first and outside the right-aligned metadata', () => {
    const container = document.createElement('div')
    container.innerHTML = renderSearchMasthead()

    const masthead = container.querySelector('.masthead')

    expect(masthead.firstElementChild.classList.contains('publisher-brand')).toBe(true)
    expect(masthead.querySelector('.masthead-meta .publisher-brand')).toBeNull()
  })
})
