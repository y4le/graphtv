const SKELETON_CARD_COUNT = 8
const SCROLL_END_TOLERANCE = 1

export function renderCollectionRailsShell(collections) {
  return `
    <section class="collection-rails" aria-label="Browse show collections">
      ${collections.map(renderCollectionRailShell).join('')}
      <p class="collection-attribution">
        TV data and artwork from <a href="https://www.themoviedb.org/">TMDB</a>.
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </section>
  `
}

export function createShowCarousel(
  root,
  { collection, buildHref, getMetrics = readScrollMetrics } = {}
) {
  if (!root || !collection) {
    throw new Error('A collection rail root and collection are required.')
  }

  const { shows, title } = collection
  const titleId = `collection-${collection.id}-title`
  root.hidden = false
  root.setAttribute('aria-labelledby', titleId)
  root.setAttribute('aria-busy', 'false')
  root.innerHTML = `
    <div class="collection-rail-head">
      <h2 class="collection-rail-title" id="${escapeHtml(titleId)}">${escapeHtml(title)}</h2>
      <div class="collection-rail-controls">
        <button type="button" class="collection-step" data-collection-step="-1" aria-label="Scroll ${escapeHtml(title)} backward">←</button>
        <button type="button" class="collection-step" data-collection-step="1" aria-label="Scroll ${escapeHtml(title)} forward">→</button>
      </div>
    </div>
    <ul class="collection-track" role="list" tabindex="0" data-keyboard-local aria-label="${escapeHtml(title)}, ${shows.length} ${shows.length === 1 ? 'show' : 'shows'}">
      ${shows.map((show) => renderShowCard(show, buildHref)).join('')}
    </ul>
  `

  const track = root.querySelector('.collection-track')
  const controls = root.querySelector('.collection-rail-controls')
  const previousButton = root.querySelector('[data-collection-step="-1"]')
  const nextButton = root.querySelector('[data-collection-step="1"]')
  const view = root.ownerDocument.defaultView
  const requestFrame =
    view?.requestAnimationFrame?.bind(view) ??
    ((callback) => setTimeout(callback, 0))
  const cancelFrame =
    view?.cancelAnimationFrame?.bind(view) ?? ((frame) => clearTimeout(frame))
  let frame = null

  function updateControls() {
    frame = null
    const { clientWidth, scrollLeft, scrollWidth } = getMetrics(track)
    const maxScrollLeft = Math.max(0, scrollWidth - clientWidth)
    const hasOverflow = maxScrollLeft > SCROLL_END_TOLERANCE
    controls.hidden = !hasOverflow
    setControlDisabled(
      previousButton,
      !hasOverflow || scrollLeft <= SCROLL_END_TOLERANCE
    )
    setControlDisabled(
      nextButton,
      !hasOverflow || scrollLeft >= maxScrollLeft - SCROLL_END_TOLERANCE
    )
  }

  function scheduleControlUpdate() {
    if (frame === null) {
      frame = requestFrame(updateControls)
    }
  }

  function scrollByPage(direction) {
    const { clientWidth } = getMetrics(track)
    const left = direction * Math.max(160, clientWidth * 0.8)
    const behavior = prefersReducedMotion(view) ? 'auto' : 'smooth'
    if (typeof track.scrollBy === 'function') {
      track.scrollBy({ left, behavior })
    } else {
      track.scrollLeft += left
    }
    scheduleControlUpdate()
  }

  function onControlClick(event) {
    const button = event.target.closest('[data-collection-step]')
    if (button && button.getAttribute('aria-disabled') !== 'true') {
      scrollByPage(Number(button.dataset.collectionStep))
    }
  }

  function onTrackKeyDown(event) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      scrollByPage(event.key === 'ArrowLeft' ? -1 : 1)
      return
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const { clientWidth, scrollWidth } = getMetrics(track)
      const left =
        event.key === 'Home' ? 0 : Math.max(0, scrollWidth - clientWidth)
      if (typeof track.scrollTo === 'function') {
        track.scrollTo({
          left,
          behavior: prefersReducedMotion(view) ? 'auto' : 'smooth'
        })
      } else {
        track.scrollLeft = left
      }
      scheduleControlUpdate()
    }
  }

  function onArtworkError(event) {
    const image = event.target.closest?.('.collection-card-poster')
    if (!image) {
      return
    }
    const fallback = image.parentElement.querySelector(
      '.collection-card-artwork-fallback'
    )
    image.remove()
    if (fallback) {
      fallback.hidden = false
    }
  }

  controls.addEventListener('click', onControlClick)
  track.addEventListener('scroll', scheduleControlUpdate, { passive: true })
  track.addEventListener('keydown', onTrackKeyDown)
  track.addEventListener('error', onArtworkError, true)

  const ResizeObserverImpl = view?.ResizeObserver
  const resizeObserver = ResizeObserverImpl
    ? new ResizeObserverImpl(scheduleControlUpdate)
    : null
  resizeObserver?.observe(track)
  if (!resizeObserver) {
    view?.addEventListener('resize', scheduleControlUpdate)
  }
  updateControls()

  return {
    destroy() {
      if (frame !== null) {
        cancelFrame(frame)
      }
      controls.removeEventListener('click', onControlClick)
      track.removeEventListener('scroll', scheduleControlUpdate)
      track.removeEventListener('keydown', onTrackKeyDown)
      track.removeEventListener('error', onArtworkError, true)
      resizeObserver?.disconnect()
      if (!resizeObserver) {
        view?.removeEventListener('resize', scheduleControlUpdate)
      }
    },
    updateControls
  }
}

export function renderCollectionError(root, collection) {
  const titleId = `collection-${collection.id}-title`
  root.hidden = false
  root.setAttribute('aria-labelledby', titleId)
  root.setAttribute('aria-busy', 'false')
  root.innerHTML = `
    <div class="collection-rail-head">
      <h2 class="collection-rail-title" id="${escapeHtml(titleId)}">${escapeHtml(collection.title)}</h2>
    </div>
    <p class="state-copy error-state">${escapeHtml(collection.title)} is unavailable right now.</p>
  `
}

function renderCollectionRailShell(collection) {
  const titleId = `collection-${collection.id}-title`
  return `
    <section class="collection-rail" data-collection-id="${escapeHtml(collection.id)}" aria-labelledby="${escapeHtml(titleId)}" aria-busy="true">
      <div class="collection-rail-head">
        <h2 class="collection-rail-title" id="${escapeHtml(titleId)}">${escapeHtml(collection.title)}</h2>
        <div class="collection-rail-controls collection-rail-controls-loading" aria-hidden="true">
          <span class="collection-step collection-step-skeleton"></span>
          <span class="collection-step collection-step-skeleton"></span>
        </div>
      </div>
      <ul class="collection-track collection-track-loading" role="list" aria-hidden="true">
        ${Array.from({ length: SKELETON_CARD_COUNT }, renderSkeletonCard).join('')}
      </ul>
    </section>
  `
}

function renderSkeletonCard() {
  return `
    <li class="collection-card collection-card-skeleton">
      <span class="collection-card-artwork"></span>
      <span class="collection-skeleton-line"></span>
      <span class="collection-skeleton-line"></span>
    </li>
  `
}

function renderShowCard(show, buildHref) {
  const href = buildHref(show.id)
  const sources = getResponsiveArtwork(show.poster)
  const image = show.poster
    ? `<img
        class="collection-card-poster"
        src="${escapeHtml(show.poster)}"
        ${sources ? `srcset="${escapeHtml(sources)}"` : ''}
        sizes="(max-width: 560px) 7rem, (max-width: 860px) 20vw, 10.5rem"
        alt=""
        loading="lazy"
        decoding="async"
        fetchpriority="low"
      />`
    : ''

  return `
    <li class="collection-card">
      <a class="collection-card-link" href="${escapeHtml(href)}">
        <span class="collection-card-artwork">
          ${image}
          <span class="collection-card-artwork-fallback" ${image ? 'hidden' : ''}>No art</span>
        </span>
        <span class="collection-card-title">${escapeHtml(show.title)}</span>
        ${show.year ? `<span class="collection-card-meta">${escapeHtml(show.year)}</span>` : ''}
      </a>
    </li>
  `
}

function getResponsiveArtwork(url) {
  if (!url || !/\/t\/p\/w\d+\//u.test(url)) {
    return ''
  }

  return [185, 342, 500]
    .map(
      (width) =>
        `${url.replace(/\/t\/p\/w\d+\//u, `/t/p/w${width}/`)} ${width}w`
    )
    .join(', ')
}

function readScrollMetrics(track) {
  return {
    clientWidth: track.clientWidth,
    scrollLeft: track.scrollLeft,
    scrollWidth: track.scrollWidth
  }
}

function setControlDisabled(control, disabled) {
  control.setAttribute('aria-disabled', String(disabled))
}

function prefersReducedMotion(view) {
  return Boolean(
    typeof view?.matchMedia === 'function' &&
      view.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
