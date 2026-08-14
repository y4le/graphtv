import tmdbLogoMarkup from '../assets/tmdb-blue-short.svg?raw'
import { getRatingSourceUrl } from '../data/ratingProviders.js'

const CREDITED_PROVIDERS = new Set(['omdb', 'tmdb', 'tvmaze'])

export function renderCreditsContent(page) {
  const context = page.getCreditsContext?.() ?? {}
  const providers = Array.from(
    new Set(
      (Array.isArray(context.providers) ? context.providers : []).filter(
        (provider) => CREDITED_PROVIDERS.has(provider)
      )
    )
  )
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
          providers.length > 0
            ? `<div class="credits-provider-list">${providers
                .map((provider) => renderProviderCredit(provider, show))
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

function renderProviderCredit(provider, show) {
  if (provider === 'tvmaze') {
    return `
      <article class="credits-provider" data-credit-provider="tvmaze">
        <h4><a href="https://www.tvmaze.com/">TVmaze</a></h4>
        <p>
          TV data and artwork provided by TVmaze. TVmaze API data is licensed under
          <a href="https://www.tvmaze.com/api#licensing">CC BY-SA</a>.
        </p>
        ${renderProviderSeriesLink(provider, show)}
      </article>
    `
  }

  if (provider === 'tmdb') {
    return `
      <article class="credits-provider credits-provider-tmdb" data-credit-provider="tmdb">
        <h4>
          <a class="credits-tmdb-logo" href="https://www.themoviedb.org/" aria-label="TMDB">
            <span aria-hidden="true">${tmdbLogoMarkup}</span>
          </a>
        </h4>
        <p>TV data and artwork provided by TMDB.</p>
        <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        ${renderProviderSeriesLink(provider, show)}
      </article>
    `
  }

  return `
    <article class="credits-provider" data-credit-provider="omdb">
      <h4><a href="https://www.omdbapi.com/">OMDb API</a></h4>
      <p>
        Episode metadata and IMDb ratings provided through the OMDb API. OMDb content is licensed under
        <a href="https://creativecommons.org/licenses/by-nc/4.0/">CC BY-NC 4.0</a>.
        OMDb is not endorsed by or affiliated with IMDb.com.
      </p>
      ${renderProviderSeriesLink(provider, show)}
    </article>
  `
}

function renderProviderSeriesLink(provider, show) {
  const url = getRatingSourceUrl(provider, { show })
  if (!url || !show?.title) {
    return ''
  }

  const destination =
    provider === 'omdb' ? 'IMDb' : provider === 'tmdb' ? 'TMDB' : 'TVmaze'
  return `<p class="credits-series-link"><a href="${escapeAttribute(url)}">View “${escapeHtml(show.title)}” on ${destination}</a></p>`
}

function renderRatingGraphLink(show) {
  if (!show?.title) {
    return '<a href="https://www.ratingraph.com/">Explore Rating Graph</a>, a more full-featured alternative.'
  }

  const title = String(show.title).trim()
  const url = `https://www.ratingraph.com/search-results/${encodeURIComponent(title)}/`
  return `<a href="${escapeAttribute(url)}">Find “${escapeHtml(title)}” on Rating Graph</a>, a more full-featured alternative.`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', '&quot;')
}
