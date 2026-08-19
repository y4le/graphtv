// Rebuilds the .yalethomas project card from a real show's episode ratings.
//
// The card is the app's own chart, magnified: ratings come from the providers
// the app reads, run through the app's chart model and mark scaling, and are
// drawn in the monotone palette with one thing selected and no episode
// selected. The selection is the detected series breakpoint when the show has
// one the app would call high confidence, and a season otherwise. Swapping
// shows is a flag away.
//
//   node scripts/build-card-svg.mjs
//   node scripts/build-card-svg.mjs --show "The Wire"
//   node scripts/build-card-svg.mjs --season 4        # select a season instead
//
// TMDB_BEARER_TOKEN and OMDB_API_KEY (env or .env.local) add their ratings to
// TVMaze's; without them the card is built from TVMaze alone and no provider
// spread is drawn.

import fs from 'node:fs/promises'
import path from 'node:path'

import { mergeShowRecords } from '../src/data/merge.js'
import { getRatingSourceLabel } from '../src/data/ratingProviders.js'
import {
  createEpisode,
  createProviderRating,
  createSeason,
  createShow
} from '../src/data/schema.js'
import { isUsableRating } from '../src/data/stats.js'
import {
  MARK_DENSITY_CONFIG,
  scaleLineWidthForDensity,
  scalePointRadiusForDensity,
  scaleSelectedLineWidth
} from '../src/viz/pointSize.js'
import {
  buildChartModel,
  createSparklineScales,
  getMacroTrendline,
  getVisibleSeasonTrendlines,
  getVisibleSeriesBreakpoint
} from '../src/viz/scales.js'

const rootDir = process.cwd()
const DEFAULT_SHOW = 'Game of Thrones'
const DEFAULT_OUTPUT = '.yalethomas/card.svg'
const ENV_FILES = ['.env.local', '.env']

// Card geometry, in the 1618x1000 card units the wordmark is set in.
const CARD = {
  width: 1618,
  height: 1000,
  // Card units per app pixel. Mark sizes come from the app and are magnified
  // by this factor; the plot band is compressed to clear the wordmark.
  scale: 3.5,
  episodePitch: 120,
  seasonGap: 80,
  plotTop: 105,
  plotBottom: 390,
  seasonAxisY: 790,
  seasonLabelBaseline: 864,
  wordmarkBaseline: 585,
  // Seconds for one pass of the whole run, whatever its length: a longer show
  // scrolls faster rather than looping for longer.
  scrollDuration: 10
}

// Mark constants mirrored from src/viz/marks.js, in app pixels.
const APP = {
  pointRadius: 3,
  trendWidth: 2.2,
  macroDash: [5, 5],
  fallbackPointOpacity: 0.2,
  fallbackStrokeWidth: 1.25,
  spreadWidth: 1.25,
  minSpreadPixels: 3,
  clippedSpreadNubWidth: 4,
  axisTickSize: 5,
  axisLineWidth: 1,
  axisSelectionWidth: 2,
  axisFontSize: 12,
  axisLabelPadding: 12,
  axisLabelWidthRatio: 0.62,
  axisRailOpacity: 0.45,
  axisTickOpacity: 0.7,
  breakpointTrendWidth: 2.5,
  breakpointMarkerWidth: 1.5,
  breakpointMarkerDash: [3, 4],
  breakpointMarkerOpacity: 0.75
}

// The app draws provider disagreement at 0.16; the card lifts it because the
// hairlines are viewed at a fraction of the card's own scale.
const CARD_SPREAD_OPACITY = 0.4

const THEME_TOKENS = [
  ['card-ink', 'textPrimary'],
  ['card-muted', 'textSecondary'],
  ['card-trend-macro', 'trendMacro'],
  ['card-trend-micro', 'trendMicro'],
  ['card-spot', 'spotColor']
]

const WORDMARK_FONT_STACK = "Geist, Inter, 'Helvetica Neue', Arial, sans-serif"
// The app's --font-app, so the season axis reads as it does in the app.
const CHART_FONT_STACK =
  "'Geist Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace"

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const env = { ...(await readEnvFiles()), ...process.env }
  const record = await loadShowRecord(options.show, env)
  const model = buildChartModel(record.seasons)

  if (model.ratedPoints.length === 0) {
    throw new Error(`No rated episodes found for "${options.show}".`)
  }

  const selection = resolveSelection(model, options.season)
  const svg = renderCard(model, {
    show: record.show,
    providers: record.providers,
    selection,
    tokens: await readThemeTokens()
  })
  const outputFile = path.resolve(rootDir, options.out)

  await fs.writeFile(outputFile, svg)
  console.log(
    `${options.out}: ${record.show.title} — ${model.ratedPoints.length} rated of ${model.points.length} episodes, ${model.totalSeasons} seasons, ${describeSelection(selection)}, providers ${record.providers.join(' + ')}`
  )
}

function parseArguments(argv) {
  const options = { show: DEFAULT_SHOW, season: null, out: DEFAULT_OUTPUT }

  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inlineValue] = splitFlag(argv[index])
    const value = inlineValue ?? argv[(index += 1)]

    if (flag === '--show') {
      options.show = value
    } else if (flag === '--season') {
      options.season = Number(value)
    } else if (flag === '--out') {
      options.out = value
    } else {
      throw new Error(
        `Unknown option "${flag}". Usage: node scripts/build-card-svg.mjs [--show "Title"] [--season N] [--out path]`
      )
    }
  }

  if (options.season !== null && !Number.isInteger(options.season)) {
    throw new Error('--season expects a season number.')
  }

  return options
}

function splitFlag(argument) {
  const separatorIndex = argument.indexOf('=')
  return separatorIndex === -1
    ? [argument, null]
    : [argument.slice(0, separatorIndex), argument.slice(separatorIndex + 1)]
}

// The card carries one selection, as the app does. A high-confidence series
// breakpoint takes it — that is the reading of the show worth pointing at, and
// it is what the app selects when its shark-jump control is used. Shows without
// one fall back to the season whose trendline moves the most, and --season
// always wins.
function resolveSelection(model, requestedSeason) {
  if (requestedSeason === null && model.seriesBreakpoint?.highConfidence) {
    return { kind: 'breakpoint', breakpoint: model.seriesBreakpoint }
  }

  const trendlines = model.seasonTrendlines
  if (trendlines.length === 0) {
    throw new Error('No season has enough rated episodes for a trendline.')
  }

  if (requestedSeason !== null) {
    const match = trendlines.find(
      (trendline) => trendline.seasonNumber === requestedSeason
    )
    if (!match) {
      throw new Error(
        `Season ${requestedSeason} has no trendline. Seasons with one: ${trendlines
          .map((trendline) => trendline.seasonNumber)
          .join(', ')}.`
      )
    }
    return { kind: 'season', seasonNumber: match.seasonNumber }
  }

  return {
    kind: 'season',
    seasonNumber: trendlines.reduce((steepest, trendline) =>
      Math.abs(trendline.regression.slope) > Math.abs(steepest.regression.slope)
        ? trendline
        : steepest
    ).seasonNumber
  }
}

function describeSelection(selection) {
  return selection.kind === 'breakpoint'
    ? `series breakpoint at ${formatEpisodeLabel(selection.breakpoint.breakpointPoint)} selected (${formatBreakpointChange(selection.breakpoint).toLowerCase()}, ${formatBreakpointConfidence(selection.breakpoint).toLowerCase()})`
    : `Season ${selection.seasonNumber} selected`
}

// The app's own sidenote wording for a breakpoint.
function formatEpisodeLabel(point) {
  return `S${String(point.season).padStart(2, '0')}E${String(point.episode ?? point.number).padStart(2, '0')}`
}

function formatBreakpointChange(breakpoint) {
  return breakpoint.drop >= 0
    ? `Ratings dropped ${breakpoint.drop.toFixed(1)} points`
    : `Ratings rose ${Math.abs(breakpoint.drop).toFixed(1)} points`
}

function formatBreakpointConfidence(breakpoint) {
  return breakpoint.confidence === 'high'
    ? `High confidence ${Math.round(breakpoint.score)}/100`
    : `Confidence below threshold ${Math.round(breakpoint.score)}/100`
}

async function loadShowRecord(query, env) {
  const tvmaze = await fetchTvmazeRecord(query)
  const imdbId = tvmaze.show.externalIds.imdb
  const seasonNumbers = tvmaze.seasons.map((season) => season.number)
  const supplemental = (
    await Promise.all([
      fetchTmdbRecord(imdbId, seasonNumbers, env.TMDB_BEARER_TOKEN),
      fetchOmdbRecord(imdbId, seasonNumbers, env.OMDB_API_KEY)
    ])
  ).filter(Boolean)
  const merged = mergeShowRecords(tvmaze, supplemental)

  return {
    show: merged.show,
    seasons: merged.seasons,
    providers: [tvmaze.provider, ...supplemental.map((it) => it.provider)]
  }
}

async function fetchTvmazeRecord(query) {
  const data = await fetchJson(
    `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(query)}&embed=episodes`
  )
  const seasons = new Map()

  for (const episode of data._embedded?.episodes ?? []) {
    if (!seasons.has(episode.season)) {
      seasons.set(
        episode.season,
        createSeason({
          number: episode.season,
          title: `Season ${episode.season}`,
          episodes: []
        })
      )
    }

    seasons.get(episode.season).episodes.push(
      createEpisode({
        id: `tvmaze:episode:${episode.id}`,
        title: episode.name,
        season: episode.season,
        episode: episode.number,
        date: episode.airdate ?? null,
        ratings: [createProviderRating('tvmaze', episode.rating?.average)],
        sourceIds: { tvmaze: String(episode.id) }
      })
    )
  }

  return {
    provider: 'tvmaze',
    show: createShow({
      id: `tvmaze:${data.id}`,
      title: data.name,
      year: String(data.premiered ?? '').slice(0, 4),
      totalSeasons: seasons.size,
      externalIds: { imdb: data.externals?.imdb, tvmaze: data.id }
    }),
    seasons: Array.from(seasons.values()).sort(
      (left, right) => left.number - right.number
    )
  }
}

async function fetchTmdbRecord(imdbId, seasonNumbers, bearerToken) {
  if (!imdbId || !bearerToken) {
    return null
  }

  const init = { headers: { Authorization: `Bearer ${bearerToken}` } }
  const found = await fetchJson(
    `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id`,
    init
  )
  const show = found.tv_results?.[0]
  if (!show) {
    return null
  }

  const seasons = await Promise.all(
    seasonNumbers.map(async (seasonNumber) => {
      const season = await fetchJson(
        `https://api.themoviedb.org/3/tv/${show.id}/season/${seasonNumber}`,
        init,
        { optional: true }
      )

      return createSeason({
        number: seasonNumber,
        title: season?.name ?? `Season ${seasonNumber}`,
        episodes: (season?.episodes ?? []).map((episode) =>
          createEpisode({
            id: `tmdb:episode:${episode.id}`,
            title: episode.name,
            season: seasonNumber,
            episode: episode.episode_number,
            date: episode.air_date || null,
            ratings: [
              createProviderRating(
                'tmdb',
                episode.vote_average,
                episode.vote_count
              )
            ],
            sourceIds: { tmdb: String(episode.id) }
          })
        )
      })
    })
  )

  return {
    provider: 'tmdb',
    show: createShow({
      id: `tmdb:${show.id}`,
      title: show.name,
      year: String(show.first_air_date ?? '').slice(0, 4),
      externalIds: { imdb: imdbId, tmdb: show.id }
    }),
    seasons
  }
}

async function fetchOmdbRecord(imdbId, seasonNumbers, apiKey) {
  if (!imdbId || !apiKey) {
    return null
  }

  const seasons = await Promise.all(
    seasonNumbers.map(async (seasonNumber) => {
      const season = await fetchJson(
        `https://www.omdbapi.com/?apikey=${apiKey}&i=${imdbId}&Season=${seasonNumber}`,
        {},
        { optional: true }
      )

      return createSeason({
        number: seasonNumber,
        title: `Season ${seasonNumber}`,
        episodes: (season?.Episodes ?? []).map((episode) =>
          createEpisode({
            id: `omdb:episode:${episode.imdbID}`,
            title: episode.Title,
            season: seasonNumber,
            episode: Number(episode.Episode),
            date: parseOmdbReleased(episode.Released),
            ratings: [
              createProviderRating('omdb', parseOmdbNumber(episode.imdbRating))
            ],
            sourceIds: { omdb: episode.imdbID }
          })
        )
      })
    })
  )

  return {
    provider: 'omdb',
    show: createShow({
      id: `omdb:${imdbId}`,
      title: '',
      year: '',
      externalIds: { imdb: imdbId }
    }),
    seasons
  }
}

const OMDB_MONTHS = new Map(
  [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec'
  ].map((month, index) => [month, String(index + 1).padStart(2, '0')])
)

// OMDb returns either an ISO date or "14 Apr 2019", depending on the title.
function parseOmdbReleased(value) {
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/u.test(raw)) {
    return raw
  }

  const match = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/u)
  const month = match ? OMDB_MONTHS.get(match[2].toLowerCase()) : null
  return match && month
    ? `${match[3]}-${month}-${match[1].padStart(2, '0')}`
    : null
}

function parseOmdbNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function fetchJson(url, init = {}, { optional = false } = {}) {
  const response = await fetch(url, init)

  if (!response.ok) {
    if (optional) {
      return null
    }
    throw new Error(`${response.status} ${response.statusText} for ${url}`)
  }

  const data = await response.json()
  if (data?.Response === 'False') {
    return optional ? null : Promise.reject(new Error(data.Error ?? url))
  }

  return data
}

async function readEnvFiles() {
  const merged = {}

  for (const name of ENV_FILES) {
    try {
      const raw = await fs.readFile(path.join(rootDir, name), 'utf8')
      for (const line of raw.split(/\r?\n/u)) {
        const trimmed = line.trim()
        const separatorIndex = trimmed.indexOf('=')
        if (trimmed.startsWith('#') || separatorIndex === -1) {
          continue
        }
        merged[trimmed.slice(0, separatorIndex).trim()] = trimmed
          .slice(separatorIndex + 1)
          .trim()
          .replace(/^['"]|['"]$/gu, '')
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }

  return merged
}

async function readThemeTokens() {
  const css = await fs.readFile(path.join(rootDir, 'css/styles.css'), 'utf8')
  const light = readCustomProperties(css, ':root {')
  const dark = readCustomProperties(css, ":root[data-theme='dark'] {")

  return THEME_TOKENS.map(([cardToken, appToken]) => ({
    cardToken,
    appToken,
    light: light[appToken],
    dark: dark[appToken]
  }))
}

function readCustomProperties(css, header) {
  const start = css.indexOf(header)
  if (start === -1) {
    throw new Error(`Could not find "${header}" in css/styles.css.`)
  }

  const block = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries(
    Array.from(block.matchAll(/--([\w-]+):\s*([^;]+);/gu), (match) => [
      match[1],
      match[2].trim()
    ])
  )
}

function createLayout(model) {
  const plotHeight = CARD.plotBottom - CARD.plotTop
  const scales = createSparklineScales(
    model,
    { width: CARD.width, height: plotHeight },
    { showSourceSpread: true }
  )
  const [domainMin, domainMax] = scales.yDomain
  // Each season boundary stretches the episode before it by one season gap,
  // so ticks and trendline ends land in the middle of the gap as they do in
  // the app's continuous x scale.
  const gapStarts = model.seasonSpans.slice(1).map((span) => span.start - 1)
  const placeX = (x) =>
    (x - 1) * CARD.episodePitch +
    gapStarts.reduce(
      (total, start) => total + clamp(x - start, 0, 1) * CARD.seasonGap,
      0
    )
  const placeY = (rating) =>
    CARD.plotTop + scales.yScale(clamp(rating, domainMin, domainMax))
  const spans = model.seasonSpans.map((span, index, all) => {
    const startBoundary = index === 0 ? span.start : span.start - 0.5
    const endBoundary = index === all.length - 1 ? span.end : span.end + 0.5
    const startX = placeX(startBoundary)
    const endX = placeX(endBoundary)

    return {
      ...span,
      startBoundary,
      endBoundary,
      startX,
      endX,
      centerX: (startX + endX) / 2,
      availableWidth: endX - startX
    }
  })
  // The card scales marks at the sparse end of the app's density ramp, where
  // points are largest against thin trendlines, then magnifies them.
  const sparseScale = {
    range: () => [
      0,
      MARK_DENSITY_CONFIG.ramp.sparseSlotWidth * model.ratedPoints.length
    ]
  }
  const trendWidth = scaleLineWidthForDensity(
    APP.trendWidth,
    model.ratedPoints.length,
    sparseScale
  )

  return {
    scales,
    domainMin,
    domainMax,
    placeX,
    placeY,
    spans,
    boundaries: [
      spans[0].start,
      ...spans.slice(1).map((span) => span.start - 0.5),
      spans.at(-1).end
    ],
    // A full episode pitch plus a season gap of empty rail closes the loop, so
    // the last episode never crowds the first of the next pass. A short run
    // gets more, keeping the period wider than the card: the selected season
    // can then never be on screen twice at once.
    periodWidth: Math.max(
      placeX(model.xMax) + CARD.episodePitch + CARD.seasonGap,
      CARD.width + CARD.episodePitch
    ),
    marks: {
      pointRadius: toCardUnits(
        scalePointRadiusForDensity(
          APP.pointRadius,
          model.ratedPoints.length,
          sparseScale
        )
      ),
      trendWidth: toCardUnits(trendWidth),
      selectedTrendWidth: toCardUnits(scaleSelectedLineWidth(trendWidth)),
      spreadWidth: toCardUnits(APP.spreadWidth),
      minSpread: toCardUnits(APP.minSpreadPixels),
      clippedNubWidth: toCardUnits(APP.clippedSpreadNubWidth),
      fallbackStrokeWidth: toCardUnits(APP.fallbackStrokeWidth),
      axisLineWidth: toCardUnits(APP.axisLineWidth),
      axisSelectionWidth: toCardUnits(APP.axisSelectionWidth),
      axisTickSize: toCardUnits(APP.axisTickSize),
      axisFontSize: toCardUnits(APP.axisFontSize),
      axisLabelPadding: toCardUnits(APP.axisLabelPadding),
      macroDash: APP.macroDash.map(toCardUnits).join(' '),
      breakpointTrendWidth: toCardUnits(APP.breakpointTrendWidth),
      breakpointMarkerWidth: toCardUnits(APP.breakpointMarkerWidth),
      breakpointMarkerDash: APP.breakpointMarkerDash.map(toCardUnits).join(' ')
    }
  }
}

function renderCard(model, { show, providers, selection, tokens }) {
  const layout = createLayout(model)
  const providerLabels = providers.map(getRatingSourceLabel)

  return `<svg
  xmlns="http://www.w3.org/2000/svg"
  id="graphtv-card"
  viewBox="0 0 ${CARD.width} ${CARD.height}"
  role="img"
  aria-labelledby="graphtv-card-title graphtv-card-description"
>
  <title id="graphtv-card-title">graphtv</title>
  <desc id="graphtv-card-description">
    ${renderDescription(model, { show, providerLabels, selection })}
  </desc>
  <style>
    :root {
      color-scheme: light dark;
${tokens
  .map(
    ({ cardToken, appToken, light, dark }) =>
      `      --${cardToken}: light-dark(${light}, ${dark}); /* --${appToken} */`
  )
  .join('\n')}
    }

    :root[data-color-scheme="light"] {
      color-scheme: only light;
    }

    :root[data-color-scheme="dark"] {
      color-scheme: only dark;
    }

    #graphtv-card .gtv-wordmark {
      fill: var(--card-ink);
      font-family: ${WORDMARK_FONT_STACK};
      font-size: 236px;
      font-weight: 720;
      letter-spacing: -0.06em;
    }

    #graphtv-card .gtv-scroll {
      animation: gtv-scroll ${CARD.scrollDuration}s linear infinite;
    }

    @keyframes gtv-scroll {
      to {
        transform: translateX(-${n(layout.periodWidth)}px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      #graphtv-card .gtv-scroll {
        animation: none;
      }
    }
  </style>
  <defs>
    <clipPath id="graphtv-card-frame">
      <rect width="${CARD.width}" height="${CARD.height}" />
    </clipPath>

    <!--
      ${renderPeriodComment(model, { show, providerLabels })}

      Referenced content is painted with presentation attributes: document CSS
      rules do not reach into a <use> shadow tree, but custom properties
      inherit into it.
    -->
    <g id="graphtv-card-period">
${renderPeriod(model, layout, selection)}
    </g>
  </defs>

  <g clip-path="url(#graphtv-card-frame)" aria-hidden="true">
    <g class="gtv-scroll">
      <use href="#graphtv-card-period" />
      <use href="#graphtv-card-period" x="${n(layout.periodWidth)}" />
    </g>
  </g>

  <text class="gtv-wordmark" x="809" y="${CARD.wordmarkBaseline}" text-anchor="middle">graphtv</text>
</svg>
`
}

function renderDescription(model, { show, providerLabels, selection }) {
  const providerSpreadCopy =
    providerLabels.length > 1
      ? `hairlines where ${formatList(providerLabels)} disagree, `
      : 'no provider spread available, '
  const selectionCopy =
    selection.kind === 'breakpoint'
      ? `and the detected series breakpoint selected: the run splits into two ` +
        `spot-colored regimes either side of a dashed marker at ` +
        `${formatEpisodeLabel(selection.breakpoint.breakpointPoint)}, where the median rating ` +
        `moves from ${selection.breakpoint.beforeMedian.toFixed(1)} to ` +
        `${selection.breakpoint.afterMedian.toFixed(1)} — a ` +
        `${Math.abs(selection.breakpoint.drop).toFixed(1)}-point ` +
        `${selection.breakpoint.drop >= 0 ? 'drop' : 'rise'} the app scores ` +
        `${Math.round(selection.breakpoint.score)} out of 100.`
      : `and Season ${selection.seasonNumber} of ${model.totalSeasons} selected — its ` +
        `trendline and its stretch of the axis picked out in the spot color.`

  return wrapText(
    `The graphtv wordmark over ${escapeXml(show.title)}: every episode of the run ` +
      `scrolling past in one ink tone on a season axis, ${providerSpreadCopy}` +
      `season trendlines under a dashed ` +
      `full-series trendline, ${selectionCopy} No episode is selected.`,
    4
  )
}

function renderPeriodComment(model, { show, providerLabels }) {
  return wrapText(
    `One scroll period: ${escapeXml(show.title)}${show.year ? ` (${show.year})` : ''}, ` +
      `${model.ratedPoints.length} rated of ${model.points.length} episodes across ` +
      `${model.totalSeasons} seasons, rated by ${formatList(providerLabels)} and plotted ` +
      `on ${getRatingSourceLabel(model.primaryRatingSource)}. The period is wider than ` +
      `the ${CARD.width} viewBox, so the one selection can never appear twice in the ` +
      `card at once, and plotted marks stay above y=${CARD.plotBottom} to clear the ` +
      `wordmark. ` +
      `Rebuild it, or rebuild it around another show, with scripts/build-card-svg.mjs.`,
    6,
    72
  )
}

function renderPeriod(model, layout, selection) {
  return [
    renderSeasonAxis(layout, selection),
    renderMacroTrendline(model, layout),
    renderSeasonTrendlines(model, layout, selection),
    renderSourceSpreads(model, layout),
    renderPoints(model, layout),
    // The app raises the breakpoint layer over everything else it draws.
    renderSeriesBreakpoint(model, layout, selection)
  ]
    .filter(Boolean)
    .join('\n\n')
}

function renderSeasonAxis(layout, selection) {
  const { marks, placeX } = layout
  // A selected breakpoint leaves the season axis unmarked, as it does in the
  // app: the selection is the split, not a season.
  const selectedSpan =
    selection.kind === 'season'
      ? layout.spans.find(
          (span) => span.seasonNumber === selection.seasonNumber
        )
      : null
  const activeBoundaries = new Set(
    selectedSpan ? [selectedSpan.startBoundary, selectedSpan.endBoundary] : []
  )
  const ticks = layout.boundaries.map((boundary) => {
    const isActive = activeBoundaries.has(boundary)
    return indent(
      8,
      `<line x1="${n(placeX(boundary))}" y1="${CARD.seasonAxisY}" x2="${n(placeX(boundary))}" y2="${n(CARD.seasonAxisY - marks.axisTickSize)}" stroke="${isActive ? 'var(--card-spot)' : 'var(--card-muted)'}" stroke-opacity="${isActive ? 1 : APP.axisTickOpacity}" stroke-width="${isActive ? marks.axisSelectionWidth : marks.axisLineWidth}" />`
    )
  })

  return [
    indent(
      6,
      selectedSpan
        ? '<!-- Season axis: rail, boundary ticks, and the selected season. -->'
        : '<!-- Season axis: rail and season boundary ticks. -->'
    ),
    indent(6, '<g>'),
    indent(
      8,
      `<line x1="0" y1="${CARD.seasonAxisY}" x2="${n(layout.periodWidth)}" y2="${CARD.seasonAxisY}" stroke="var(--card-muted)" stroke-opacity="${APP.axisRailOpacity}" stroke-width="${marks.axisLineWidth}" />`
    ),
    ...ticks,
    ...(selectedSpan
      ? [
          indent(
            8,
            `<line x1="${n(selectedSpan.startX)}" y1="${CARD.seasonAxisY}" x2="${n(selectedSpan.endX)}" y2="${CARD.seasonAxisY}" stroke="var(--card-spot)" stroke-width="${marks.axisSelectionWidth}" />`
          )
        ]
      : []),
    indent(6, '</g>'),
    '',
    indent(
      6,
      `<g font-family="${escapeXml(CHART_FONT_STACK)}" font-size="${marks.axisFontSize}" text-anchor="middle">`
    ),
    ...layout.spans.map((span) => {
      const isSelected = span.seasonNumber === selectedSpan?.seasonNumber
      return indent(
        8,
        `<text x="${n(span.centerX)}" y="${CARD.seasonLabelBaseline}" fill="${isSelected ? 'var(--card-spot)' : 'var(--card-muted)'}">${escapeXml(seasonAxisLabel(span, layout))}</text>`
      )
    }),
    indent(6, '</g>')
  ].join('\n')
}

// The app writes out "Season N" when it fits and falls back to the bare
// number; without text measurement it estimates the width the same way.
function seasonAxisLabel(span, layout) {
  const fullLabel = `Season ${span.seasonNumber}`
  const estimatedWidth =
    fullLabel.length * layout.marks.axisFontSize * APP.axisLabelWidthRatio

  return estimatedWidth + layout.marks.axisLabelPadding <= span.availableWidth
    ? fullLabel
    : String(span.seasonNumber)
}

function renderMacroTrendline(model, layout) {
  const macroTrendline = getMacroTrendline(model, {
    start: 1,
    end: model.xMax
  })
  if (!macroTrendline) {
    return null
  }

  return [
    indent(
      6,
      '<!-- Full-series trendline, fitted across every rated episode. -->'
    ),
    indent(
      6,
      `<line ${renderSegment(macroTrendline.points, layout)} stroke="var(--card-trend-macro)" stroke-width="${layout.marks.trendWidth}" stroke-dasharray="${layout.marks.macroDash}" />`
    )
  ].join('\n')
}

function renderSeasonTrendlines(model, layout, selection) {
  const trendlines = getVisibleSeasonTrendlines(model, {
    start: 1,
    end: model.xMax
  })
  if (trendlines.length === 0) {
    return null
  }

  const selectedSeasonNumber =
    selection.kind === 'season' ? selection.seasonNumber : null
  const resting = trendlines.filter(
    (trendline) => trendline.seasonNumber !== selectedSeasonNumber
  )
  const selected = trendlines.find(
    (trendline) => trendline.seasonNumber === selectedSeasonNumber
  )

  return [
    indent(
      6,
      "<!-- Season trendlines, fitted to each season's own episodes. -->"
    ),
    indent(
      6,
      `<g stroke="var(--card-trend-micro)" stroke-width="${layout.marks.trendWidth}">`
    ),
    ...resting.map((trendline) =>
      indent(8, `<line ${renderSegment(trendline.points, layout)} />`)
    ),
    indent(6, '</g>'),
    ...(selected
      ? [
          '',
          indent(
            6,
            '<!-- The selected season carries the spot color, grown as in the app. -->'
          ),
          indent(
            6,
            `<line ${renderSegment(selected.points, layout)} stroke="var(--card-spot)" stroke-width="${layout.marks.selectedTrendWidth}" />`
          )
        ]
      : [])
  ].join('\n')
}

// The app's breakpoint layer: the two regimes either side of the split, and a
// dashed marker where it falls. The numbers behind it stay in the description.
function renderSeriesBreakpoint(model, layout, selection) {
  if (selection.kind !== 'breakpoint') {
    return null
  }

  const { marks } = layout
  const breakpoint = getVisibleSeriesBreakpoint(model, {
    start: 1,
    end: model.xMax
  })
  const markerX = layout.placeX(breakpoint.breakpointX)

  return [
    indent(
      6,
      '<!-- Detected series breakpoint: the marker and the two regimes. -->'
    ),
    indent(
      6,
      `<line x1="${n(markerX)}" y1="${CARD.plotTop}" x2="${n(markerX)}" y2="${CARD.plotBottom}" stroke="var(--card-spot)" stroke-width="${marks.breakpointMarkerWidth}" stroke-dasharray="${marks.breakpointMarkerDash}" opacity="${APP.breakpointMarkerOpacity}" />`
    ),
    indent(
      6,
      `<g stroke="var(--card-spot)" stroke-width="${marks.breakpointTrendWidth}" stroke-linecap="round">`
    ),
    ...breakpoint.segments.map((segment) =>
      indent(8, `<line ${renderSegment(segment.points, layout)} />`)
    ),
    indent(6, '</g>')
  ].join('\n')
}

function renderSegment(points, layout) {
  const [start, end] = points
  return `x1="${n(layout.placeX(start.x))}" y1="${n(layout.placeY(start.y))}" x2="${n(layout.placeX(end.x))}" y2="${n(layout.placeY(end.y))}"`
}

function renderSourceSpreads(model, layout) {
  const { marks } = layout
  const spreads = model.ratedPoints
    .map((point) => createSpreadMark(point, layout))
    .filter(Boolean)
  if (spreads.length === 0) {
    return null
  }

  const nubs = spreads.flatMap((spread) => [
    ...(spread.clippedMin
      ? [{ x: spread.x, y: layout.placeY(layout.domainMin) }]
      : []),
    ...(spread.clippedMax
      ? [{ x: spread.x, y: layout.placeY(layout.domainMax) }]
      : [])
  ])

  return [
    indent(
      6,
      '<!-- Provider disagreement, drawn as a spread hairline through the point. -->'
    ),
    indent(
      6,
      `<g stroke="var(--card-muted)" stroke-opacity="${CARD_SPREAD_OPACITY}" stroke-width="${marks.spreadWidth}" stroke-linecap="round">`
    ),
    ...spreads.map((spread) =>
      indent(
        8,
        `<line x1="${n(spread.x)}" y1="${n(spread.y1)}" x2="${n(spread.x)}" y2="${n(spread.y2)}" />`
      )
    ),
    ...nubs.map((nub) =>
      indent(
        8,
        `<line x1="${n(nub.x - marks.clippedNubWidth / 2)}" y1="${n(nub.y)}" x2="${n(nub.x + marks.clippedNubWidth / 2)}" y2="${n(nub.y)}" />`
      )
    ),
    indent(6, '</g>')
  ].join('\n')
}

function createSpreadMark(point, layout) {
  if (!point.ratingSpread) {
    return null
  }

  const spread = {
    x: layout.placeX(point.x),
    y1: layout.placeY(point.ratingSpread.min),
    y2: layout.placeY(point.ratingSpread.max),
    clippedMin: point.ratingSpread.min < layout.domainMin,
    clippedMax: point.ratingSpread.max > layout.domainMax
  }

  return Math.abs(spread.y2 - spread.y1) >= layout.marks.minSpread ||
    spread.clippedMin ||
    spread.clippedMax
    ? spread
    : null
}

function renderPoints(model, layout) {
  const { marks } = layout
  const plotted = model.points.filter((point) => isUsableRating(point.rating))
  const rated = plotted.filter((point) => !point.isFallbackRating)
  const fallback = plotted.filter((point) => point.isFallbackRating)
  const circle = (point) =>
    `<circle cx="${n(layout.placeX(point.x))}" cy="${n(layout.placeY(point.rating))}" r="${marks.pointRadius}" />`

  return [
    indent(
      6,
      '<!-- Episodes in the monotone palette: one ink tone for every season. -->'
    ),
    indent(6, '<g fill="var(--card-ink)">'),
    ...rated.map((point) => indent(8, circle(point))),
    indent(6, '</g>'),
    ...(fallback.length === 0
      ? []
      : [
          '',
          indent(
            6,
            '<!-- Episodes carrying a season-level fallback rating, hollowed out. -->'
          ),
          indent(
            6,
            `<g fill="var(--card-ink)" fill-opacity="${APP.fallbackPointOpacity}" stroke="var(--card-ink)" stroke-width="${marks.fallbackStrokeWidth}">`
          ),
          ...fallback.map((point) => indent(8, circle(point))),
          indent(6, '</g>')
        ])
  ].join('\n')
}

function toCardUnits(appPixels) {
  return round(appPixels * CARD.scale, 2)
}

function indent(depth, line) {
  return `${' '.repeat(depth)}${line}`
}

function wrapText(text, depth, width = 76) {
  const lines = []
  let current = ''

  for (const word of text.split(' ')) {
    if (current && current.length + word.length + 1 > width) {
      lines.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }

  lines.push(current)
  return lines
    .map((line, index) => (index === 0 ? line : indent(depth, line)))
    .join('\n')
}

function formatList(values) {
  return values.length < 2
    ? (values[0] ?? '')
    : `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`
}

function escapeXml(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
}

function n(value) {
  return String(round(value, 2))
}

function round(value, decimals) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
