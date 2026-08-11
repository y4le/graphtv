const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1
})

export function formatCompactNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ''
  }

  return COMPACT_NUMBER_FORMATTER.format(value)
    .replaceAll('K', 'k')
    .replaceAll('M', 'm')
    .replaceAll('B', 'b')
    .replaceAll('T', 't')
}
