import { searchShows } from '../data/provider.js'
import { escapeHtml } from '../lib/html.js'
import { renderEmpty, renderError, renderLoading } from '../pages/shared.js'

export function createShowPicker(
  root,
  {
    provider = 'tvmaze',
    excludedRefs = [],
    onSelect,
    onClose,
    search = searchShows
  } = {}
) {
  const excluded = new Set(excludedRefs)
  let requestId = 0
  let abortController = null
  let destroyed = false

  root.innerHTML = `
    <div class="show-picker-heading">
      <div>
        <p class="eyebrow">Choose another show</p>
        <h2>Compare with…</h2>
      </div>
      <button type="button" class="show-picker-close" aria-label="Close show picker">Close</button>
    </div>
    <form class="show-picker-form" role="search">
      <label for="comparison-show-query">Show title</label>
      <div class="show-picker-search-row">
        <input id="comparison-show-query" name="q" type="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
        <button type="submit">Search</button>
      </div>
    </form>
    <p class="show-picker-status" role="status" aria-live="polite"></p>
    <ol class="show-picker-results" aria-label="Comparison show results"></ol>
  `

  const form = root.querySelector('.show-picker-form')
  const input = root.querySelector('input')
  const status = root.querySelector('.show-picker-status')
  const resultsRoot = root.querySelector('.show-picker-results')

  function close() {
    abortController?.abort()
    abortController = null
    root.hidden = true
    onClose?.()
  }

  function open({ focus = true } = {}) {
    root.hidden = false
    if (focus) {
      input.focus({ preventScroll: true })
      input.select()
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const query = input.value.trim()
    if (!query) {
      status.innerHTML = renderEmpty('Enter a show title to compare.')
      resultsRoot.replaceChildren()
      return
    }

    abortController?.abort()
    abortController = new AbortController()
    const currentRequest = ++requestId
    status.innerHTML = renderLoading(`Searching for “${query}”…`, {
      announce: false
    })
    resultsRoot.replaceChildren()

    try {
      const results = (
        await search(query, provider, {
          signal: abortController.signal
        })
      ).filter((show) => !excluded.has(show.id))
      if (destroyed || currentRequest !== requestId) {
        return
      }
      status.replaceChildren()
      if (results.length === 0) {
        status.innerHTML = renderEmpty(`No other shows found for “${query}”.`)
        return
      }
      resultsRoot.innerHTML = results.map(renderPickerResult).join('')
    } catch (error) {
      if (
        !destroyed &&
        currentRequest === requestId &&
        error?.name !== 'AbortError'
      ) {
        status.innerHTML = renderError(
          error?.message || 'Search failed. Try again.'
        )
      }
    } finally {
      if (currentRequest === requestId) {
        abortController = null
      }
    }
  }

  function handleClick(event) {
    const result = event.target.closest?.('[data-show-ref]')
    if (result) {
      onSelect?.(result.dataset.showRef)
      return
    }
    if (event.target.closest?.('.show-picker-close')) {
      close()
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  form.addEventListener('submit', handleSubmit)
  root.addEventListener('click', handleClick)
  root.addEventListener('keydown', handleKeyDown)

  return {
    open,
    close,
    focus: () => input.focus({ preventScroll: true }),
    destroy() {
      destroyed = true
      requestId += 1
      abortController?.abort()
      form.removeEventListener('submit', handleSubmit)
      root.removeEventListener('click', handleClick)
      root.removeEventListener('keydown', handleKeyDown)
      root.replaceChildren()
    }
  }
}

function renderPickerResult(show) {
  const meta = [show.year || 'Unknown year', ...(show.genres ?? []).slice(0, 2)]
    .filter(Boolean)
    .join(' · ')
  return `
    <li class="show-picker-result">
      <button type="button" class="show-picker-result-action" data-show-ref="${escapeHtml(show.id)}">
        ${
          show.poster
            ? `<img src="${escapeHtml(show.poster)}" alt="" loading="lazy" decoding="async" />`
            : '<span class="show-picker-result-rule" aria-hidden="true"></span>'
        }
        <span>
          <strong>${escapeHtml(show.title)}</strong>
          <small>${escapeHtml(meta)}</small>
        </span>
      </button>
    </li>
  `
}
