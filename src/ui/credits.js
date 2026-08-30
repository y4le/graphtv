import tmdbLogoMarkup from '../assets/tmdb-blue-short.svg?raw'
import {
  ATTRIBUTION_BY_SOURCE,
  ATTRIBUTION_SUBJECTS
} from '../data/attribution.js'
import {
  getRatingProvider,
  getRatingSourceUrl
} from '../data/ratingProviders.js'
import { escapeHtml } from '../lib/html.js'

export function renderCreditsContent(page) {
  const context = page.getCreditsContext?.() ?? {}
  const sources = Array.from(
    new Set(
      (Array.isArray(context.providers) ? context.providers : []).filter(
        (source) => typeof source === 'string' && source.length > 0
      )
    )
  ).sort(
    (left, right) =>
      getRatingProvider(left).order - getRatingProvider(right).order
  )
  const credits = getAttributionEntries(context.aggregator, sources)
  const show = context.show ?? null

  return `
    <button type="button" class="credits-back" data-credits-back>
      <span aria-hidden="true">←</span> Keyboard shortcuts
    </button>
    <div class="credits-sections">
      <div class="credits-overall-grid">
        <section class="credits-section" aria-labelledby="credits-project-title">
          <h3 id="credits-project-title">Project</h3>
          <p>This site was built by <a href="https://yalethom.as/">Yale Thomas</a> using Claude Code and Codex.</p>
          <p><a href="https://github.com/y4le/graphtv">Source code on GitHub</a></p>
        </section>

        <section class="credits-section" aria-labelledby="credits-lineage-title">
          <h3 id="credits-lineage-title">Inspiration and alternatives</h3>
          <p>
            Inspired by <a href="https://kevinformatics.com/">Kevin Wu’s original GraphTV</a>, now offline—the project that proved television arguments are better with regression lines.
          </p>
          <p>
            Looking for more rankings, histories, and discovery tools?
            ${renderRatingGraphLink(show)}
          </p>
        </section>
      </div>

      <section class="credits-section credits-current-data" aria-labelledby="credits-data-title">
        <h3 id="credits-data-title">Data on this page</h3>
        ${
          credits.length > 0
            ? `<div class="credits-provider-list">${credits
                .map((credit) =>
                  renderProviderCredit(credit, show, {
                    hasCombined: sources.includes('combined')
                  })
                )
                .join('')}</div>`
            : '<p class="credits-empty">No external TV data is currently displayed on this page.</p>'
        }
      </section>

      <section class="credits-section credits-dependencies" aria-labelledby="credits-dependencies-title">
        <h3 id="credits-dependencies-title">Under the hood</h3>
        <p>
          Visualizations powered by <a href="https://d3js.org/">D3</a> by Mike Bostock
          (<a href="https://github.com/d3/d3/blob/main/LICENSE">ISC license</a>).
        </p>
        <p>
          Built and tested with
          <a href="https://vite.dev/">Vite</a>,
          <a href="https://vitest.dev/">Vitest</a>,
          <a href="https://github.com/jsdom/jsdom">jsdom</a>,
          <a href="https://github.com/dumbmatter/fakeIndexedDB">fake-indexeddb</a>,
          <a href="https://eslint.org/">ESLint</a>, and
          <a href="https://prettier.io/">Prettier</a>.
        </p>
      </section>

      <p class="credits-signoff">No television shows were canceled in the making of this graph.</p>
    </div>
  `
}

function getAttributionEntries(aggregator, sources) {
  const credits = []
  const seen = new Set()

  function add(subject, source = null) {
    const descriptor = ATTRIBUTION_SUBJECTS[subject]
    if (!descriptor || seen.has(subject)) {
      return
    }
    seen.add(subject)
    credits.push({ subject, source, descriptor })
  }

  if (aggregator === 'ratingsdb') {
    add('ratingsdb')
  }
  for (const source of sources) {
    const subject = ATTRIBUTION_BY_SOURCE[source]
    if (subject) {
      add(subject, source)
    }
  }

  return credits
}

function renderProviderCredit(
  { subject, source, descriptor },
  show,
  { hasCombined }
) {
  const notices = [
    ...descriptor.notices,
    ...(hasCombined && descriptor.combinedNotice
      ? [descriptor.combinedNotice]
      : [])
  ]

  return `
    <article class="credits-provider${descriptor.logo ? ' credits-provider-tmdb' : ''}" data-credit-provider="${escapeHtml(subject)}">
      ${renderProviderHeading(descriptor)}
      ${notices.map((notice) => `<p>${escapeHtml(notice)}</p>`).join('')}
      ${renderProviderLicense(descriptor.license)}
      ${renderProviderSeriesLink(source, descriptor.linkLabel, show)}
    </article>
  `
}

function renderProviderHeading(descriptor) {
  if (descriptor.logo) {
    return `
      <h4>
        <a class="credits-tmdb-logo" href="${escapeHtml(descriptor.href)}" aria-label="${escapeHtml(descriptor.name)}">
          <span aria-hidden="true">${tmdbLogoMarkup}</span>
        </a>
      </h4>
    `
  }

  const name = escapeHtml(descriptor.name)
  const heading = descriptor.href
    ? `<a href="${escapeHtml(descriptor.href)}">${name}</a>`
    : name
  return `<h4>${heading}</h4>`
}

function renderProviderLicense(license) {
  if (!license) {
    return ''
  }
  return `<p>${escapeHtml(license.prefix)} <a href="${escapeHtml(license.href)}">${escapeHtml(license.label)}</a>.</p>`
}

function renderProviderSeriesLink(source, linkLabel, show) {
  const url = source ? getRatingSourceUrl(source, { show }) : null
  if (!url || !show?.title || !linkLabel) {
    return ''
  }

  return `<p class="credits-series-link"><a href="${escapeHtml(url)}">View “${escapeHtml(show.title)}” on ${escapeHtml(linkLabel)}</a></p>`
}

function renderRatingGraphLink(show) {
  if (!show?.title) {
    return '<a href="https://www.ratingraph.com/">Explore Rating Graph</a>, a more full-featured alternative.'
  }

  const title = String(show.title).trim()
  const url = `https://www.ratingraph.com/search-results/${encodeURIComponent(title)}/`
  return `<a href="${escapeHtml(url)}">Find “${escapeHtml(title)}” on Rating Graph</a>, a more full-featured alternative.`
}
