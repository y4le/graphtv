import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createShowCarousel,
  renderCollectionError,
  renderCollectionRailsShell
} from '../../src/ui/showCarousel.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('show carousel', () => {
  it('renders stable loading shells before collection data arrives', () => {
    const container = document.createElement('div')
    container.innerHTML = renderCollectionRailsShell([
      { id: 'trending', title: 'Trending this week' },
      { id: 'popular', title: 'Popular' }
    ])

    expect(container.querySelectorAll('.collection-rail')).toHaveLength(2)
    expect(
      container.querySelectorAll('.collection-card-skeleton')
    ).toHaveLength(16)
    expect(
      Array.from(container.querySelectorAll('.collection-rail')).every(
        (rail) => rail.getAttribute('aria-busy') === 'true'
      )
    ).toBe(true)
  })

  it('renders an accessible horizontal show list with responsive artwork', () => {
    const { root } = createRailRoot()
    const controller = createShowCarousel(root, {
      collection: createCollection(),
      buildHref: (showId) => `/?show=${showId}`
    })

    const title = root.querySelector('.collection-rail-title')
    const track = root.querySelector('.collection-track')
    const link = root.querySelector('.collection-card-link')
    const image = root.querySelector('.collection-card-poster')

    expect(root.getAttribute('aria-labelledby')).toBe(title.id)
    expect(root.getAttribute('aria-busy')).toBe('false')
    expect(track.getAttribute('role')).toBe('list')
    expect(track.tabIndex).toBe(0)
    expect(track.hasAttribute('data-keyboard-local')).toBe(true)
    expect(track.getAttribute('aria-label')).toBe('Trending this week, 2 shows')
    expect(link.getAttribute('href')).toContain('show=tmdb:108978')
    expect(image.alt).toBe('')
    expect(image.getAttribute('loading')).toBe('lazy')
    expect(image.getAttribute('fetchpriority')).toBe('low')
    expect(image.getAttribute('srcset')).toContain('/w185/reacher.jpg 185w')
    expect(image.getAttribute('srcset')).toContain('/w500/reacher.jpg 500w')

    controller.destroy()
  })

  it('uses singular wording for a one-show collection', () => {
    const { root } = createRailRoot()
    const collection = createCollection()
    collection.shows = collection.shows.slice(0, 1)
    const controller = createShowCarousel(root, {
      collection,
      buildHref: (showId) => `/?show=${showId}`
    })

    expect(
      root.querySelector('.collection-track').getAttribute('aria-label')
    ).toBe('Trending this week, 1 show')
    controller.destroy()
  })

  it('steps by viewport, updates edge controls, and detaches on destroy', () => {
    const { root } = createRailRoot()
    const metrics = { clientWidth: 500, scrollLeft: 0, scrollWidth: 1200 }
    const controller = createShowCarousel(root, {
      collection: createCollection(),
      buildHref: (showId) => `/?show=${showId}`,
      getMetrics: () => metrics
    })
    const track = root.querySelector('.collection-track')
    const previous = root.querySelector('[data-collection-step="-1"]')
    const next = root.querySelector('[data-collection-step="1"]')
    track.scrollBy = vi.fn(({ left }) => {
      metrics.scrollLeft += left
    })

    expect(previous.getAttribute('aria-disabled')).toBe('true')
    expect(next.getAttribute('aria-disabled')).toBe('false')

    next.click()
    expect(track.scrollBy).toHaveBeenCalledWith({
      left: 400,
      behavior: 'smooth'
    })
    controller.updateControls()
    expect(previous.getAttribute('aria-disabled')).toBe('false')

    metrics.scrollLeft = 700
    next.focus()
    controller.updateControls()
    expect(next.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(next)

    track.scrollBy.mockClear()
    next.click()
    expect(track.scrollBy).not.toHaveBeenCalled()

    controller.destroy()
    metrics.scrollLeft = 0
    next.click()
    expect(track.scrollBy).not.toHaveBeenCalled()
  })

  it('handles rail navigation keys without relying on the global controller', () => {
    const { root } = createRailRoot()
    const metrics = { clientWidth: 500, scrollLeft: 200, scrollWidth: 1200 }
    const controller = createShowCarousel(root, {
      collection: createCollection(),
      buildHref: (showId) => `/?show=${showId}`,
      getMetrics: () => metrics
    })
    const track = root.querySelector('.collection-track')
    track.scrollBy = vi.fn()
    track.scrollTo = vi.fn()

    const left = pressTrackKey(track, 'ArrowLeft')
    const right = pressTrackKey(track, 'ArrowRight')
    const home = pressTrackKey(track, 'Home')
    const end = pressTrackKey(track, 'End')

    expect(track.scrollBy.mock.calls).toEqual([
      [{ left: -400, behavior: 'smooth' }],
      [{ left: 400, behavior: 'smooth' }]
    ])
    expect(track.scrollTo.mock.calls).toEqual([
      [{ left: 0, behavior: 'smooth' }],
      [{ left: 700, behavior: 'smooth' }]
    ])
    expect(
      [left, right, home, end].every((event) => event.defaultPrevented)
    ).toBe(true)

    controller.destroy()
  })

  it('uses instant scrolling when reduced motion is preferred', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true }))
    )
    const { root } = createRailRoot()
    const controller = createShowCarousel(root, {
      collection: createCollection(),
      buildHref: (showId) => `/?show=${showId}`,
      getMetrics: () => ({
        clientWidth: 500,
        scrollLeft: 0,
        scrollWidth: 1200
      })
    })
    const track = root.querySelector('.collection-track')
    track.scrollBy = vi.fn()

    root.querySelector('[data-collection-step="1"]').click()

    expect(track.scrollBy).toHaveBeenCalledWith({
      left: 400,
      behavior: 'auto'
    })
    controller.destroy()
  })

  it('renders an editorial error state with labelled spacing', () => {
    const { root } = createRailRoot()
    renderCollectionError(root, {
      id: 'trending',
      title: 'Trending this week'
    })

    const title = root.querySelector('.collection-rail-title')
    expect(root.getAttribute('aria-labelledby')).toBe(title.id)
    expect(title.closest('.collection-rail-head')).not.toBeNull()
    expect(root.querySelector('.error-state').textContent).toBe(
      'Trending this week is unavailable right now.'
    )
  })

  it('reveals the artwork fallback after an image error', () => {
    const { root } = createRailRoot()
    const controller = createShowCarousel(root, {
      collection: createCollection(),
      buildHref: (showId) => `/?show=${showId}`
    })
    const image = root.querySelector('.collection-card-poster')
    const fallback = root.querySelector('.collection-card-artwork-fallback')

    image.dispatchEvent(new Event('error'))

    expect(image.isConnected).toBe(false)
    expect(
      fallback.parentElement.querySelector('.collection-card-poster')
    ).toBeNull()
    expect(fallback.hidden).toBe(false)
    controller.destroy()
  })
})

function createRailRoot() {
  const container = document.createElement('div')
  container.innerHTML = renderCollectionRailsShell([
    { id: 'trending', title: 'Trending this week' }
  ])
  document.body.replaceChildren(container)
  return { container, root: container.querySelector('.collection-rail') }
}

function createCollection() {
  return {
    id: 'trending',
    title: 'Trending this week',
    status: 'ready',
    shows: [
      {
        id: 'tmdb:108978',
        title: 'Reacher',
        year: '2022',
        poster: 'https://image.tmdb.org/t/p/w342/reacher.jpg'
      },
      {
        id: 'tmdb:2',
        title: 'Second Show',
        year: '2024',
        poster: 'https://image.tmdb.org/t/p/w342/second.jpg'
      }
    ]
  }
}

function pressTrackKey(track, key) {
  const event = new window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true
  })
  track.dispatchEvent(event)
  return event
}
