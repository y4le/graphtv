import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTitleFitter } from '../../src/ui/titleFitter.js'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('createTitleFitter', () => {
  it('shrinks a title to its available single-line width', () => {
    const heading = document.createElement('header')
    const title = document.createElement('h1')
    heading.append(title)
    document.body.append(heading)

    let headingWidth = 240
    Object.defineProperty(heading, 'clientWidth', {
      configurable: true,
      get: () => headingWidth
    })
    Object.defineProperty(title, 'scrollWidth', {
      configurable: true,
      get: () => (480 * (parseFloat(title.style.fontSize) || 40)) / 40
    })
    mockComputedStyles({ heading, title, titleFontSize: 40 })

    const fitter = createTitleFitter(title)

    expect(parseFloat(title.style.fontSize)).toBeCloseTo(19.9, 1)

    headingWidth = 600
    fitter.refresh()

    expect(title.style.fontSize).toBe('')
    fitter.destroy()
  })

  it('keeps extremely long titles at a legible minimum size', () => {
    const heading = document.createElement('header')
    const title = document.createElement('h1')
    heading.append(title)
    document.body.append(heading)

    Object.defineProperty(heading, 'clientWidth', { value: 100 })
    Object.defineProperty(title, 'scrollWidth', { value: 800 })
    mockComputedStyles({ heading, title, titleFontSize: 40 })

    const fitter = createTitleFitter(title)

    expect(title.style.fontSize).toBe('14px')
    fitter.destroy()
    expect(title.style.fontSize).toBe('')
  })

  it('refits when the observed title content changes', async () => {
    const heading = document.createElement('header')
    const title = document.createElement('h1')
    title.textContent = 'Short'
    heading.append(title)
    document.body.append(heading)

    Object.defineProperty(heading, 'clientWidth', { value: 240 })
    Object.defineProperty(title, 'scrollWidth', {
      configurable: true,
      get: () =>
        (title.textContent === 'Short' ? 100 : 480) *
        ((parseFloat(title.style.fontSize) || 40) / 40)
    })
    mockComputedStyles({ heading, title, titleFontSize: 40 })

    const fitter = createTitleFitter(title)
    expect(title.style.fontSize).toBe('')

    title.textContent = 'A much longer title that needs fitting'

    await vi.waitFor(() =>
      expect(parseFloat(title.style.fontSize)).toBeCloseTo(19.9, 1)
    )
    fitter.destroy()
  })

  it('is a no-op without an attached title element', () => {
    const detachedTitle = document.createElement('h1')

    expect(() => createTitleFitter(null).refresh()).not.toThrow()
    expect(() => createTitleFitter(detachedTitle).refresh()).not.toThrow()
  })

  it('reserves room for title siblings such as a series year', () => {
    const heading = document.createElement('header')
    const title = document.createElement('h1')
    const year = document.createElement('p')
    heading.append(title, year)
    document.body.append(heading)

    Object.defineProperty(heading, 'clientWidth', { value: 300 })
    year.getBoundingClientRect = () => ({ width: 50 })
    Object.defineProperty(title, 'scrollWidth', {
      configurable: true,
      get: () => (480 * (parseFloat(title.style.fontSize) || 40)) / 40
    })
    mockComputedStyles({
      columnGap: 10,
      heading,
      title,
      titleFontSize: 40
    })

    const fitter = createTitleFitter(title, { reserveSiblingSpace: true })

    expect(parseFloat(title.style.fontSize)).toBeCloseTo(19.9, 1)
    fitter.destroy()
  })
})

function mockComputedStyles({ columnGap = 0, heading, title, titleFontSize }) {
  const getComputedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    if (element === heading) {
      return {
        columnGap: `${columnGap}px`,
        gap: `${columnGap}px`,
        paddingLeft: '0px',
        paddingRight: '0px'
      }
    }
    if (element === title) {
      return { fontSize: `${titleFontSize}px` }
    }
    return getComputedStyle(element)
  })
}
