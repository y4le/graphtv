import { createProviderRating } from '../data/schema.js'

export function cleanHtmlSummary(value) {
  if (!value) {
    return null
  }

  return value.replace(/<[^>]*>/g, '').trim() || null
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

export function createRatings(source, rating, votes = null) {
  return [createProviderRating(source, parseNumericValue(rating), parseNumericValue(votes))]
}

export function buildImageUrl(path, baseUrl) {
  if (!path) {
    return null
  }

  return `${baseUrl}${path}`
}

export async function fetchJson(url, init = {}) {
  const response = await fetch(url, init)

  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`)
    error.status = response.status
    error.url = url
    throw error
  }

  return response.json()
}
