import { createProviderRating } from '../data/schema.js'

const htmlParser = new DOMParser()

export function cleanHtmlSummary(value) {
  if (!value) {
    return null
  }

  const document = htmlParser.parseFromString(String(value), 'text/html')
  return document.body.textContent.trim() || null
}

export function getYear(value) {
  if (!value) {
    return ''
  }

  return String(value).slice(0, 4)
}

export function parseNumericValue(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function createRatings(source, rating, votes = null, metadata = {}) {
  return [
    createProviderRating(
      source,
      parseNumericValue(rating),
      parseNumericValue(votes),
      metadata
    )
  ]
}

export function buildImageUrl(path, baseUrl) {
  if (!path) {
    return null
  }

  return `${baseUrl}${path}`
}
