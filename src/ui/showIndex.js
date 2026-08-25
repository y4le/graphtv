import { getRatingSourceLabel } from '../data/ratingProviders.js'
import { SHOW_INDEX } from '../data/showIndexData.js'
import { escapeHtml } from '../lib/html.js'

const RATING_MIN = 5
const RATING_MAX = 10
const RATING_REFERENCE = 8

export const INDEX_SHAPE_LAYOUTS = Object.freeze({
  desktop: Object.freeze({
    className: 'show-index-shape-desktop',
    width: 192,
    height: 28,
    strokeWidth: 1.25,
    pointRadius: 1.4
  }),
  mobile: Object.freeze({
    className: 'show-index-shape-mobile',
    width: 120,
    height: 24,
    strokeWidth: 1.25,
    pointRadius: 1.5
  })
})

export function renderShowIndex({ buildHref, index = SHOW_INDEX } = {}) {
  if (typeof buildHref !== 'function') {
    throw new Error('The show index requires a link builder.')
  }

  const sourceLabel = getRatingSourceLabel(index.source)

  return `
    <section class="show-index" aria-labelledby="show-index-title">
      <h2 class="visually-hidden" id="show-index-title">Browse series by episode ratings</h2>
      ${index.sections
        .map((section) =>
          renderIndexSection(section, {
            buildHref,
            sourceLabel
          })
        )
        .join('')}
      <p class="show-index-footer">A hand-picked index. Search for anything else.</p>
    </section>
  `
}

function renderIndexSection(section, { buildHref, sourceLabel }) {
  const titleId = `show-index-${section.id}-title`

  return `
    <section class="show-index-section" aria-labelledby="${escapeHtml(titleId)}">
      <h3 class="visually-hidden" id="${escapeHtml(titleId)}">${escapeHtml(section.title)}</h3>
      <div class="show-index-columns" aria-hidden="true">
        <span>${escapeHtml(section.title)}</span>
        <span>Years</span>
        <span>Ep</span>
        <span>Ratings</span>
      </div>
      <ul class="show-index-list" role="list">
        ${section.rows
          .map((show) =>
            renderIndexRow(show, {
              href: buildHref(show.id),
              sourceLabel
            })
          )
          .join('')}
      </ul>
    </section>
  `
}

function renderIndexRow(show, { href, sourceLabel }) {
  const years = formatYears(show)
  const ratings = show.ratings.map((rating) => rating / 10)
  const minimum = Math.min(...ratings).toFixed(1)
  const maximum = Math.max(...ratings).toFixed(1)
  const accessibleLabel = `${show.title}, ${years}, ${show.episodes} episodes. ${sourceLabel} episode ratings range from ${minimum} to ${maximum}.`

  return `
    <li class="show-index-item">
      <a class="show-index-row" href="${escapeHtml(href)}" aria-label="${escapeHtml(accessibleLabel)}">
        <span class="show-index-series">${escapeHtml(show.title)}</span>
        <span class="show-index-years">${escapeHtml(years)}</span>
        <span class="show-index-episodes"><span class="show-index-mobile-unit">${show.episodes} ep</span><span class="show-index-desktop-unit">${show.episodes}</span></span>
        <span class="show-index-shapes">
          ${renderRatingShape(ratings, INDEX_SHAPE_LAYOUTS.desktop)}
          ${renderRatingShape(ratings, INDEX_SHAPE_LAYOUTS.mobile)}
        </span>
      </a>
    </li>
  `
}

export function renderRatingShape(ratings, layout) {
  const geometry = createRatingShapeGeometry(ratings, layout)
  const referenceY = placeRating(RATING_REFERENCE, layout)
  const referenceExtent = getShapeExtent(geometry, layout)
  const referenceRule =
    referenceExtent > 0
      ? `<line class="show-index-shape-rule" x1="0" x2="${number(referenceExtent)}" y1="${number(referenceY)}" y2="${number(referenceY)}" />`
      : ''
  const marks = renderShapeMarks(geometry, layout)

  return `<svg
    class="show-index-shape ${layout.className}"
    width="${layout.width}"
    height="${layout.height}"
    viewBox="0 0 ${layout.width} ${layout.height}"
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
    data-shape-regime="${geometry.regime}"
  >
    ${referenceRule}
    ${marks}
  </svg>`
}

export function createRatingShapeGeometry(ratings, layout) {
  const values = ratings.filter(Number.isFinite)
  if (values.length < 5) {
    return { regime: 'none', points: [] }
  }

  const pitch = layout.width / Math.max(values.length - 1, 1)
  if (pitch >= 4) {
    return {
      regime: 'points',
      points: createLinePoints(values, layout, layout.pointRadius)
    }
  }
  if (pitch >= 1) {
    return {
      regime: 'line',
      points: createLinePoints(values, layout, layout.strokeWidth / 2)
    }
  }

  return {
    regime: 'envelope',
    points: createEnvelopePoints(values, layout)
  }
}

function createLinePoints(ratings, layout, inset) {
  const availableWidth = layout.width - inset * 2
  const naturalPitch = availableWidth / Math.max(ratings.length - 1, 1)
  const pitch = Math.min(naturalPitch, layout.width / 20)

  return ratings.map((rating, index) => ({
    x: inset + index * pitch,
    y: placeRating(rating, layout)
  }))
}

function createEnvelopePoints(ratings, layout) {
  const buckets = Array.from({ length: layout.width }, () => [])
  ratings.forEach((rating, index) => {
    const x = (index / Math.max(ratings.length - 1, 1)) * (layout.width - 1)
    buckets[Math.round(x)].push(rating)
  })

  return buckets.flatMap((bucket, x) => {
    if (bucket.length === 0) {
      return []
    }

    let top = placeRating(Math.max(...bucket), layout)
    let bottom = placeRating(Math.min(...bucket), layout)
    const minimumThickness = layout.strokeWidth
    if (bottom - top < minimumThickness) {
      const center = (top + bottom) / 2
      top = Math.max(layout.strokeWidth / 2, center - minimumThickness / 2)
      bottom = Math.min(
        layout.height - layout.strokeWidth / 2,
        center + minimumThickness / 2
      )
    }

    return [{ x: x + 0.5, top, bottom }]
  })
}

function getShapeExtent(geometry, layout) {
  const lastPoint = geometry.points.at(-1)
  if (!lastPoint) {
    return 0
  }
  if (geometry.regime === 'envelope') {
    return layout.width
  }

  const markInset =
    geometry.regime === 'points' ? layout.pointRadius : layout.strokeWidth / 2
  return Math.min(layout.width, lastPoint.x + markInset)
}

function renderShapeMarks(geometry, layout) {
  if (geometry.regime === 'none') {
    return ''
  }

  if (geometry.regime === 'envelope') {
    const top = geometry.points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${number(point.x)},${number(point.top)}`
      )
      .join('')
    const bottom = [...geometry.points]
      .reverse()
      .map((point) => `L${number(point.x)},${number(point.bottom)}`)
      .join('')

    return `<path class="show-index-shape-envelope" d="${top}${bottom}Z" />`
  }

  const path = geometry.points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${number(point.x)},${number(point.y)}`
    )
    .join('')
  const circles =
    geometry.regime === 'points'
      ? geometry.points
          .map(
            (point) =>
              `<circle class="show-index-shape-point" cx="${number(point.x)}" cy="${number(point.y)}" r="${layout.pointRadius}" />`
          )
          .join('')
      : ''

  return `<path class="show-index-shape-line" d="${path}" />${circles}`
}

function placeRating(rating, layout) {
  const inset = layout.strokeWidth / 2
  const value = clamp(rating, RATING_MIN, RATING_MAX)
  return (
    inset +
    ((RATING_MAX - value) / (RATING_MAX - RATING_MIN)) *
      (layout.height - layout.strokeWidth)
  )
}

function formatYears(show) {
  if (!show.startYear) {
    return 'Unknown'
  }
  if (show.running) {
    return `${show.startYear}–`
  }
  if (!show.endYear || show.startYear === show.endYear) {
    return String(show.startYear)
  }
  return `${show.startYear}–${show.endYear}`
}

function number(value) {
  return Number(value.toFixed(2))
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
