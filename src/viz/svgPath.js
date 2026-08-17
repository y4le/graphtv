export function createCirclePath(points, xAccessor, yAccessor, radius) {
  if (!Number.isFinite(radius) || radius <= 0) {
    return null
  }

  const diameter = radius * 2
  return points
    .map((point) => {
      const x = xAccessor(point)
      const y = yAccessor(point)
      return `M${x - radius},${y}a${radius},${radius} 0 1,0 ${diameter},0a${radius},${radius} 0 1,0 ${-diameter},0`
    })
    .join('')
}

export function createLineSegmentsPath(
  segments,
  x1Accessor,
  y1Accessor,
  x2Accessor,
  y2Accessor
) {
  return segments
    .map(
      (segment) =>
        `M${x1Accessor(segment)},${y1Accessor(segment)}L${x2Accessor(segment)},${y2Accessor(segment)}`
    )
    .join('')
}
