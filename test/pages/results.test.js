import { describe, expect, it } from 'vitest'

import { renderResultsMasthead } from '../../src/pages/results.js'

describe('renderResultsMasthead', () => {
  it.each([false, true])('keeps the publisher signature first when interactive is %s', (interactive) => {
    const container = document.createElement('div')
    container.innerHTML = renderResultsMasthead({ interactive })

    const masthead = container.querySelector('.masthead')
    const navigation = masthead.firstElementChild

    expect(navigation.classList.contains('masthead-navigation')).toBe(true)
    expect(navigation.firstElementChild.classList.contains('publisher-brand')).toBe(true)
    expect(masthead.querySelector('.masthead-meta .publisher-brand')).toBeNull()
  })
})
