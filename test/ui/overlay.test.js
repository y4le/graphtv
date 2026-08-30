import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createOverlayController,
  openCreditsOverlay,
  openDebugOverlay,
  openHelpOverlay,
  openViewOptionsOverlay
} from '../../src/ui/overlay.js'
import {
  getUiSettings,
  initializeTheme,
  updateUiSettings
} from '../../src/viz/theme.js'

beforeEach(() => {
  window.localStorage.clear()
  initializeTheme()
})

afterEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute('style')
})

describe('view options overlay', () => {
  it('makes the background inert and locks scrolling until close', () => {
    document.body.innerHTML = `
      <main id="app"><button type="button">Open</button></main>
    `
    document.body.style.overflow = 'clip'
    const app = document.querySelector('#app')
    const origin = app.querySelector('button')
    origin.focus()
    const overlayController = createOverlayController()

    overlayController.open({ id: 'test', title: 'Test', content: 'content' })

    expect(app.hasAttribute('inert')).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')

    overlayController.close()

    expect(app.hasAttribute('inert')).toBe(false)
    expect(document.body.style.overflow).toBe('clip')
    expect(document.activeElement).toBe(origin)
  })

  it('preserves a pre-existing inert background when destroyed', () => {
    document.body.innerHTML = '<main id="app" inert></main>'
    const app = document.querySelector('#app')
    const overlayController = createOverlayController()
    overlayController.open({ id: 'test', title: 'Test', content: 'content' })

    overlayController.destroy()

    expect(app.hasAttribute('inert')).toBe(true)
    expect(document.body.style.overflow).toBe('')
  })

  it('destroys its root and runs active overlay cleanup once', () => {
    const overlayController = createOverlayController()
    const onClose = vi.fn()
    overlayController.open({
      id: 'test',
      title: 'Test',
      content: 'content',
      onClose
    })

    overlayController.destroy()
    overlayController.destroy()

    expect(document.querySelector('.overlay-root')).toBeNull()
    expect(onClose).toHaveBeenCalledOnce()
    expect(() =>
      overlayController.open({ id: 'again', title: 'Again', content: '' })
    ).toThrow('destroyed overlay controller')
  })

  it('offers mouse, keyboard, and persisted control of the absolute y-axis', () => {
    const overlayController = createOverlayController()
    openViewOptionsOverlay(overlayController)

    const row = document.querySelector('[data-option="absolute-y-axis"]')
    const onButton = row.querySelector(
      '[data-view-toggle="absoluteYAxis"][data-view-toggle-value="true"]'
    )

    expect(row.textContent).toContain('Absolute y-axis (0–10)')
    expect(onButton.getAttribute('aria-pressed')).toBe('false')

    onButton.click()
    expect(getUiSettings().absoluteYAxis).toBe(true)
    expect(onButton.getAttribute('aria-pressed')).toBe('true')

    row.focus()
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true }))
    expect(getUiSettings().absoluteYAxis).toBe(false)
  })

  it('only lists the mark scaling row when a panel opener is available', () => {
    const overlayController = createOverlayController()
    openViewOptionsOverlay(overlayController)
    expect(document.querySelector('[data-option="mark-density"]')).toBeNull()
    overlayController.close()

    const onOpenMarkDensity = vi.fn()
    openViewOptionsOverlay(overlayController, { onOpenMarkDensity })
    const row = document.querySelector('[data-option="mark-density"]')
    expect(row.textContent).toContain('Mark scaling')
    row.querySelector('[data-view-mark-density]').click()
    expect(onOpenMarkDensity).toHaveBeenCalledTimes(1)

    row.focus()
    row.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    )
    expect(onOpenMarkDensity).toHaveBeenCalledTimes(2)
  })

  it('offers a default-on source spread control', () => {
    const overlayController = createOverlayController()
    openViewOptionsOverlay(overlayController)

    const row = document.querySelector('[data-option="source-spread"]')
    const offButton = row.querySelector(
      '[data-view-toggle="showSourceSpread"][data-view-toggle-value="false"]'
    )
    const infoButton = row.querySelector('[data-view-option-info]')
    const tooltip = row.querySelector('[role="tooltip"]')

    expect(row.textContent).toContain('Rating source spread')
    expect(infoButton.getAttribute('aria-describedby')).toBe(tooltip.id)
    expect(tooltip.textContent).toContain(
      'a vertical mark shows the range between their scores'
    )
    expect(tooltip.hidden).toBe(true)

    infoButton.click()
    expect(infoButton.getAttribute('aria-expanded')).toBe('true')
    expect(tooltip.hidden).toBe(false)
    infoButton.click()
    expect(infoButton.getAttribute('aria-expanded')).toBe('false')
    expect(tooltip.hidden).toBe(true)

    infoButton.focus()
    expect(tooltip.hidden).toBe(false)
    infoButton.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
    expect(tooltip.hidden).toBe(true)
    expect(overlayController.getActiveId()).toBe('view-options')

    expect(getUiSettings().showSourceSpread).toBe(true)
    expect(offButton.getAttribute('aria-pressed')).toBe('false')

    offButton.click()
    expect(getUiSettings().showSourceSpread).toBe(false)
    expect(offButton.getAttribute('aria-pressed')).toBe('true')

    row.focus()
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))
    expect(getUiSettings().showSourceSpread).toBe(true)
  })

  it('offers a persisted episode-density choice', () => {
    const overlayController = createOverlayController()
    openViewOptionsOverlay(overlayController)

    const row = document.querySelector('[data-option="episode-density"]')
    const values = Array.from(row.querySelectorAll('.view-value'))
    const denseButton = row.querySelector('[data-view-episode-density="dense"]')
    const infoButton = row.querySelector('[data-view-option-info]')
    const tooltip = row.querySelector('[role="tooltip"]')

    expect(values.map((value) => value.textContent)).toEqual([
      'Roomy',
      'Balanced',
      'Dense',
      'Full series'
    ])
    expect(infoButton.getAttribute('aria-describedby')).toBe(tooltip.id)
    expect(
      new Set(
        Array.from(
          document.querySelectorAll('.view-option-info-tooltip'),
          (candidate) => candidate.id
        )
      ).size
    ).toBe(2)
    expect(tooltip.textContent).toBe(
      'Sets how tightly episodes can be packed in the default view. Shows with only a few episodes are shown in full, so this setting will not affect them.'
    )
    expect(tooltip.hidden).toBe(true)

    infoButton.click()
    expect(tooltip.hidden).toBe(false)
    infoButton.click()
    expect(tooltip.hidden).toBe(true)

    expect(
      row
        .querySelector('[data-view-episode-density="balanced"]')
        .getAttribute('aria-pressed')
    ).toBe('true')

    denseButton.click()
    expect(getUiSettings().episodeDensity).toBe('dense')
    expect(denseButton.getAttribute('aria-pressed')).toBe('true')
    expect(
      JSON.parse(window.localStorage.getItem('graphtv-ui-settings'))
        .episodeDensity
    ).toBe('dense')

    row.focus()
    row.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
    )
    expect(getUiSettings().episodeDensity).toBe('balanced')

    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }))
    expect(getUiSettings().episodeDensity).toBe('dense')
  })

  it('supports spatial value editing and focused direct accelerators', () => {
    updateUiSettings({ theme: 'light', palette: 'monotone' })
    const overlayController = createOverlayController()
    openViewOptionsOverlay(overlayController)

    const themeRow = document.querySelector('[data-option="theme"]')
    const paletteRow = document.querySelector('[data-option="palette"]')
    const yAxisRow = document.querySelector('[data-option="absolute-y-axis"]')
    const yAxisValues = Array.from(yAxisRow.querySelectorAll('.view-value'))

    expect(
      Array.from(
        themeRow.querySelectorAll('.view-value'),
        (value) => value.textContent
      )
    ).toEqual(['System', 'Light', 'Dark'])

    expect(
      Array.from(
        paletteRow.querySelectorAll('.view-value'),
        (value) => value.textContent
      )
    ).toEqual(['Mono', 'Alternating', 'Rainbow', 'Zigzag', 'Maximin'])
    expect(yAxisValues.map((value) => value.textContent)).toEqual(['Off', 'On'])

    themeRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )
    expect(getUiSettings().theme).toBe('dark')

    themeRow.focus()
    themeRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 't', bubbles: true })
    )
    expect(getUiSettings().themeSource).toBe('system')

    themeRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
    )
    expect(getUiSettings()).toMatchObject({
      theme: 'dark',
      themeSource: 'user'
    })

    themeRow.querySelector('[data-view-theme="system"]').click()
    expect(getUiSettings().themeSource).toBe('system')
    expect(
      themeRow
        .querySelector('[data-view-theme="system"]')
        .getAttribute('aria-pressed')
    ).toBe('true')

    paletteRow.focus()
    paletteRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'l', bubbles: true })
    )
    expect(getUiSettings().palette).toBe('alternating')

    yAxisRow.focus()
    yAxisRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )
    expect(getUiSettings().absoluteYAxis).toBe(true)
    expect(yAxisValues[1].getAttribute('aria-pressed')).toBe('true')

    yAxisRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', bubbles: true })
    )
    expect(getUiSettings().absoluteYAxis).toBe(false)
    expect(yAxisValues[0].getAttribute('aria-pressed')).toBe('true')

    paletteRow.focus()
    paletteRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'y', bubbles: true })
    )
    expect(getUiSettings().absoluteYAxis).toBe(true)
    expect(document.activeElement).toBe(yAxisRow)

    yAxisRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'y', bubbles: true, repeat: true })
    )
    expect(getUiSettings().absoluteYAxis).toBe(true)

    yAxisRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'y', bubbles: true, ctrlKey: true })
    )
    expect(getUiSettings().absoluteYAxis).toBe(true)
  })

  it('lets legacy stored themes opt back into the system preference', () => {
    window.localStorage.setItem(
      'graphtv-ui-settings',
      JSON.stringify({ theme: 'dark', palette: 'monotone' })
    )
    expect(initializeTheme().themeSource).toBe('user')
    const overlayController = createOverlayController()
    openViewOptionsOverlay(overlayController)

    document.querySelector('[data-view-theme="system"]').click()

    expect(initializeTheme().themeSource).toBe('system')
    expect(
      JSON.parse(window.localStorage.getItem('graphtv-ui-settings')).themeSource
    ).toBe('system')
  })

  it('renders each shortcut hint as a shared keycap', () => {
    const overlayController = createOverlayController()
    openViewOptionsOverlay(overlayController)

    const keycaps = Array.from(document.querySelectorAll('.view-option-hint'))

    expect(keycaps.map((keycap) => keycap.tagName)).toEqual(
      Array(7).fill('KBD')
    )
    expect(keycaps.every((keycap) => keycap.classList.contains('keycap'))).toBe(
      true
    )
    expect(keycaps.map((keycap) => keycap.textContent)).toEqual([
      't',
      'c',
      'd',
      's',
      'f',
      'r',
      'y'
    ])
  })
})

describe('keyboard help overlay', () => {
  it('renders shortcuts as keycaps and uses glyphs for arrow keys', () => {
    const overlayController = createOverlayController()
    openHelpOverlay(overlayController, {
      kind: 'results',
      debugEnabled: true
    })

    const keycaps = Array.from(document.querySelectorAll('.help-key'))
    const keycapLabels = keycaps.map((keycap) => keycap.textContent)

    expect(document.querySelector('.overlay-title').textContent).toBe(
      'Keyboard shortcuts'
    )
    expect(document.querySelector('.overlay-help-results')).not.toBeNull()
    expect(document.querySelector('.help-sections-results')).not.toBeNull()
    expect(document.querySelector('[data-overlay-close]').textContent).toBe('×')
    expect(keycaps.every((keycap) => keycap.classList.contains('keycap'))).toBe(
      true
    )
    expect(keycapLabels).toEqual(
      expect.arrayContaining(['←', '→', '↑', '↓', 'Home', 'End'])
    )
    expect(document.querySelector('.help-sections').textContent).not.toMatch(
      /Arrow(?:Left|Right|Up|Down)/
    )
    expect(
      document.querySelector('.help-key[aria-label="Left arrow"]').textContent
    ).toBe('←')
    expect(keycapLabels).toEqual(
      expect.arrayContaining([
        'o',
        'Ctrl-U',
        'Ctrl-D',
        'f',
        'r',
        '-',
        '=',
        '+',
        'p',
        't',
        'b',
        'T',
        'v',
        'Enter',
        'Escape'
      ])
    )
    expect(keycapLabels).not.toEqual(
      expect.arrayContaining(['w', '0', '$', 'd', 'a', 'c'])
    )
    expect(document.querySelector('.help-sections').textContent).toContain(
      'Select best breakpoint (ignores confidence threshold)'
    )
    expect(document.querySelector('.help-sections').textContent).toContain(
      'Cycle primary rating provider'
    )
    expect(document.querySelector('.help-sections').textContent).toContain(
      'Compare with previewed episode'
    )
    expect(document.querySelector('[data-help-action="debug"]')).toMatchObject({
      tagName: 'BUTTON'
    })
    expect(
      document
        .querySelector('[data-help-action="debug"]')
        .classList.contains('shortcut-action')
    ).toBe(true)
  })

  it('opens the debug menu when the D keycap is pressed', () => {
    const overlayController = createOverlayController()
    const page = {
      kind: 'results',
      debugEnabled: true,
      getDebugSections: () => []
    }
    openHelpOverlay(overlayController, page)

    expect(overlayController.getActiveId()).toBe('help')

    document.querySelector('[data-help-action="debug"]').click()

    expect(overlayController.getActiveId()).toBe('debug')
    expect(document.querySelector('[data-debug-clear-caches]')).not.toBeNull()
  })

  it('keeps the D keycap non-interactive when debug data is unavailable', () => {
    const overlayController = createOverlayController()
    openHelpOverlay(overlayController, {
      kind: 'results',
      debugEnabled: false
    })

    expect(document.querySelector('[data-help-action="debug"]')).toBeNull()
    expect(
      Array.from(document.querySelectorAll('.help-key')).find(
        (keycap) => keycap.textContent === 'D'
      ).tagName
    ).toBe('KBD')
  })

  it('keeps collection navigation out of the search-page help menu', () => {
    const overlayController = createOverlayController()
    openHelpOverlay(overlayController, { kind: 'search' })

    const helpText = document.querySelector('.help-sections').textContent

    expect(document.querySelector('.overlay-help-search')).not.toBeNull()
    expect(document.querySelector('.help-sections-search')).not.toBeNull()
    expect(document.querySelectorAll('.help-section')).toHaveLength(2)
    expect(helpText).not.toContain('Browse collections')
    expect(helpText).not.toContain('Scroll collection backward')
    expect(helpText).not.toContain('Scroll collection forward')
  })

  it('opens contextual credits from help and returns focus to the entry', () => {
    const origin = document.createElement('button')
    origin.textContent = 'Help'
    document.body.appendChild(origin)
    origin.focus()
    const overlayController = createOverlayController()
    const page = {
      kind: 'results',
      debugEnabled: true,
      getCreditsContext: () => ({
        providers: ['tvmaze', 'omdb', 'tmdb', 'tvmaze', 'unknown'],
        show: {
          title: 'Example & Friends',
          externalIds: { imdb: 'tt1234567', tmdb: 1438, tvmaze: 1 }
        }
      })
    }

    openHelpOverlay(overlayController, page)
    document.querySelector('[data-help-action="credits"]').click()

    expect(overlayController.getActiveId()).toBe('credits')
    expect(document.querySelector('.overlay-title').textContent).toBe(
      'Credits & attribution'
    )
    expect(document.activeElement).toBe(
      document.querySelector('[data-credits-back]')
    )
    expect(
      Array.from(
        document.querySelectorAll('[data-credit-provider]'),
        (item) => item.dataset.creditProvider
      )
    ).toEqual(['tvmaze', 'tmdb', 'omdb'])

    document.querySelector('[data-credits-back]').click()

    expect(overlayController.getActiveId()).toBe('help')
    expect(document.activeElement).toBe(
      document.querySelector('[data-help-action="credits"]')
    )

    document.querySelector('[data-help-action="credits"]').click()
    document.querySelector('[data-overlay-close]').click()
    expect(document.activeElement).toBe(origin)
  })

  it.each(['a', 'c'])(
    'opens credits with the undocumented %s shortcut',
    (key) => {
      const overlayController = createOverlayController()
      openHelpOverlay(overlayController, {
        kind: 'search',
        getCreditsContext: () => ({ providers: [], show: null })
      })
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true
      })

      document.activeElement.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expect(overlayController.getActiveId()).toBe('credits')
      expect(document.querySelector('.overlay-title').textContent).toBe(
        'Credits & attribution'
      )
    }
  )
})

describe('credits overlay', () => {
  it('puts page data first and renders the required credits and links', () => {
    const overlayController = createOverlayController()
    openCreditsOverlay(overlayController, {
      kind: 'results',
      getCreditsContext: () => ({
        providers: ['tvmaze', 'omdb', 'tmdb'],
        show: {
          title: 'Example & Friends',
          externalIds: { imdb: 'tt1234567', tmdb: 1438, tvmaze: 1 }
        }
      })
    })

    const content = document.querySelector('.overlay-content')
    const headings = Array.from(content.querySelectorAll('h3'), (heading) =>
      heading.textContent.trim()
    )
    const links = Array.from(content.querySelectorAll('a'))
    const linkByText = (text) =>
      links.find((link) => link.textContent.includes(text))

    expect(headings).toEqual([
      'Project',
      'Inspiration and alternatives',
      'Data on this page',
      'Under the hood'
    ])
    expect(content.textContent).toContain(
      'This product uses the TMDB API but is not endorsed or certified by TMDB.'
    )
    const tmdbLogo = document.querySelector('.credits-tmdb-logo')
    expect(tmdbLogo.getAttribute('aria-label')).toBe('TMDB')
    expect(tmdbLogo.querySelector('svg').getAttribute('viewBox')).toBe(
      '0 0 273.42 35.52'
    )
    expect(linkByText('View “Example & Friends” on TVmaze').href).toBe(
      'https://www.tvmaze.com/shows/1'
    )
    expect(linkByText('View “Example & Friends” on IMDb').href).toBe(
      'https://www.imdb.com/title/tt1234567/'
    )
    expect(linkByText('View “Example & Friends” on TMDB').href).toBe(
      'https://www.themoviedb.org/tv/1438'
    )
    expect(linkByText('Find “Example & Friends” on Rating Graph').href).toBe(
      'https://www.ratingraph.com/search-results/Example%20%26%20Friends/'
    )
    expect(content.textContent).toContain(
      'This site was built by Yale Thomas using Claude Code and Codex.'
    )
    expect(linkByText('Source code on GitHub').href).toBe(
      'https://github.com/y4le/graphtv'
    )
    expect(content.textContent).toContain(
      'No television shows were canceled in the making of this graph.'
    )
    expect(content.textContent).not.toContain('Self-rating')
  })

  it('credits RatingsDB and only the visible sources in its chart', () => {
    const overlayController = createOverlayController()
    openCreditsOverlay(overlayController, {
      kind: 'results',
      getCreditsContext: () => ({
        aggregator: 'ratingsdb',
        providers: ['combined', 'imdb', 'tmdb'],
        show: {
          title: 'Contract Show',
          externalIds: { imdb: 'tt9000001', tmdb: '9001' }
        }
      })
    })

    expect(
      Array.from(
        document.querySelectorAll('[data-credit-provider]'),
        (item) => item.dataset.creditProvider
      )
    ).toStrictEqual(['ratingsdb', 'imdb', 'tmdb'])
    const text = document.querySelector('.credits-current-data').textContent
    expect(text).toContain('Chart data assembled by RatingsDB.')
    expect(text).toContain(
      'The combined rating is computed by RatingsDB from the sources listed here.'
    )
    expect(text).not.toContain('Used with permission')
    expect(document.querySelector('[data-credit-provider="tvmaze"]')).toBeNull()
    expect(document.querySelector('[data-credit-provider="omdb"]')).toBeNull()
  })

  it('deduplicates hidden source families without inventing notices', () => {
    const overlayController = createOverlayController()
    openCreditsOverlay(overlayController, {
      kind: 'results',
      getCreditsContext: () => ({
        providers: ['rtAudience', 'mcAudience', 'rtCritics', 'mcCritics'],
        show: { title: 'Hidden Sources', externalIds: {} }
      })
    })

    const credits = Array.from(
      document.querySelectorAll('[data-credit-provider]')
    )
    expect(credits.map((item) => item.dataset.creditProvider)).toStrictEqual([
      'rottentomatoes',
      'metacritic'
    ])
    expect(credits.every((item) => item.querySelector('p') === null)).toBe(true)
  })

  it('states when the current page has no external data', () => {
    const overlayController = createOverlayController()
    openCreditsOverlay(overlayController, {
      kind: 'search',
      getCreditsContext: () => ({ providers: [], show: null })
    })

    expect(
      document.querySelector('.credits-current-data').textContent
    ).toContain('No external TV data is currently displayed on this page.')
    expect(document.querySelector('[data-credit-provider]')).toBeNull()
    expect(
      Array.from(document.querySelectorAll('a')).find((link) =>
        link.textContent.includes('Explore Rating Graph')
      ).href
    ).toBe('https://www.ratingraph.com/')
  })
})

describe('debug overlay', () => {
  it('persists the hidden-rating preference and reloads', () => {
    const setShowHiddenRatings = vi.fn()
    const reloadPage = vi.fn()
    const overlayController = createOverlayController()

    openDebugOverlay(
      overlayController,
      {
        debugEnabled: true,
        getDebugSections: () => []
      },
      {
        getShowHiddenRatings: () => false,
        setShowHiddenRatings,
        reloadPage
      }
    )

    const button = document.querySelector('[data-debug-toggle-hidden-ratings]')
    expect(button.textContent).toBe('Show hidden rating sources')

    button.click()

    expect(setShowHiddenRatings).toHaveBeenCalledWith(true)
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('clears provider caches and reloads the page', async () => {
    let finishClearing
    const clearCaches = vi.fn(
      () =>
        new Promise((resolve) => {
          finishClearing = resolve
        })
    )
    const reloadPage = vi.fn()
    const overlayController = createOverlayController()

    openDebugOverlay(
      overlayController,
      {
        debugEnabled: true,
        getDebugSections: () => []
      },
      { clearCaches, reloadPage }
    )

    const button = document.querySelector('[data-debug-clear-caches]')
    const status = document.querySelector('[data-debug-cache-status]')

    expect(document.querySelector('.debug-data-actions h3')).toBeNull()
    expect(button.nextElementSibling.textContent).toContain(
      'View settings are kept'
    )
    expect(
      document.querySelector('[data-debug-full-reset]').nextElementSibling
        .textContent
    ).toContain('Requires confirmation')

    button.click()

    expect(clearCaches).toHaveBeenCalledTimes(1)
    expect(button.disabled).toBe(true)
    expect(document.querySelector('[data-debug-full-reset]').disabled).toBe(
      true
    )
    expect(button.textContent).toBe('Clearing…')
    expect(status.textContent).toContain('Clearing cached provider responses')

    finishClearing()
    await vi.waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1))

    expect(button.textContent).toBe('Caches cleared')
    expect(status.textContent).toBe('Caches cleared. Reloading…')
  })

  it('reports cache clearing failures and allows retrying', async () => {
    const clearCaches = vi.fn().mockRejectedValue(new Error('Storage blocked'))
    const reloadPage = vi.fn()
    const overlayController = createOverlayController()

    openDebugOverlay(
      overlayController,
      {
        debugEnabled: true,
        getDebugSections: () => []
      },
      { clearCaches, reloadPage }
    )

    const button = document.querySelector('[data-debug-clear-caches]')
    const status = document.querySelector('[data-debug-cache-status]')
    button.click()

    await vi.waitFor(() => expect(button.disabled).toBe(false))

    expect(button.textContent).toBe('Clear caches')
    expect(status.textContent).toBe(
      'Could not clear browser data: Storage blocked'
    )
    expect(status.dataset.state).toBe('error')
    expect(reloadPage).not.toHaveBeenCalled()
  })

  it('confirms a full reset before clearing all app data and reloading', async () => {
    const confirmFullReset = vi.fn().mockReturnValue(true)
    const fullReset = vi.fn().mockResolvedValue()
    const reloadPage = vi.fn()
    const overlayController = createOverlayController()

    openDebugOverlay(
      overlayController,
      {
        debugEnabled: true,
        getDebugSections: () => []
      },
      { confirmFullReset, fullReset, reloadPage }
    )

    const resetButton = document.querySelector('[data-debug-full-reset]')
    const status = document.querySelector('[data-debug-cache-status]')
    resetButton.click()

    expect(confirmFullReset).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1))

    expect(fullReset).toHaveBeenCalledTimes(1)
    expect(resetButton.textContent).toBe('Full reset complete')
    expect(status.textContent).toBe('Full reset complete. Reloading…')
  })

  it('leaves browser data untouched when a full reset is cancelled', () => {
    const confirmFullReset = vi.fn().mockReturnValue(false)
    const fullReset = vi.fn()
    const reloadPage = vi.fn()
    const overlayController = createOverlayController()

    openDebugOverlay(
      overlayController,
      {
        debugEnabled: true,
        getDebugSections: () => []
      },
      { confirmFullReset, fullReset, reloadPage }
    )

    document.querySelector('[data-debug-full-reset]').click()

    expect(confirmFullReset).toHaveBeenCalledTimes(1)
    expect(fullReset).not.toHaveBeenCalled()
    expect(reloadPage).not.toHaveBeenCalled()
  })
})
