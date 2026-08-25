import { describe, expect, it } from 'vitest'

import {
  INDEX_SHAPE_LAYOUTS,
  createRatingShapeGeometry,
  renderRatingShape,
  renderShowIndex
} from '../../src/ui/showIndex.js'

describe('show index', () => {
  it('renders a complete, poster-free reference index', () => {
    const container = document.createElement('div')
    container.innerHTML = renderShowIndex({
      buildHref: (showId) => `/?show=${encodeURIComponent(showId)}`
    })

    expect(container.querySelectorAll('.show-index-row')).toHaveLength(20)
    expect(
      Array.from(
        container.querySelectorAll('.show-index-columns span:first-child')
      ).map((title) => title.textContent)
    ).toEqual(["Yale's picks", 'Long runs'])
    expect(container.querySelector('.show-index-caption')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelectorAll('.show-index-section > h3')).toHaveLength(
      2
    )

    const breakingBad = container.querySelector('.show-index-row')
    expect(new URL(breakingBad.href).searchParams.get('show')).toBe(
      'tvmaze:169'
    )
    expect(breakingBad.getAttribute('aria-label')).toContain(
      '62 episodes. TVmaze episode ratings range from'
    )
    expect(
      breakingBad.querySelector('.show-index-shape-desktop').dataset.shapeRegime
    ).toBe('line')
  })

  it('uses points, lines, and envelopes according to available pixel pitch', () => {
    const desktop = INDEX_SHAPE_LAYOUTS.desktop
    const mobile = INDEX_SHAPE_LAYOUTS.mobile

    expect(createRatingShapeGeometry(ratings(19), desktop).regime).toBe(
      'points'
    )
    expect(createRatingShapeGeometry(ratings(62), desktop).regime).toBe('line')
    expect(createRatingShapeGeometry(ratings(180), desktop).regime).toBe('line')
    expect(createRatingShapeGeometry(ratings(202), desktop).regime).toBe(
      'envelope'
    )
    expect(createRatingShapeGeometry(ratings(180), mobile).regime).toBe(
      'envelope'
    )
  })

  it('keeps short runs short instead of stretching them across the slot', () => {
    const geometry = createRatingShapeGeometry(
      ratings(5),
      INDEX_SHAPE_LAYOUTS.desktop
    )
    const first = geometry.points[0]
    const last = geometry.points.at(-1)

    expect(geometry.regime).toBe('points')
    expect(last.x - first.x).toBeCloseTo((192 / 20) * 4)
    expect(last.x).toBeLessThan(50)
  })

  it('uses one shared vertical scale and limits the rule to the data extent', () => {
    const layout = INDEX_SHAPE_LAYOUTS.desktop
    const low = createRatingShapeGeometry([6, 6, 6, 6, 6], layout)
    const high = createRatingShapeGeometry([9, 9, 9, 9, 9], layout)
    const container = document.createElement('div')
    container.innerHTML = `${renderRatingShape([6, 7, 8, 9, 10], layout)}${renderRatingShape([8, 8, 8, 8, 8], layout)}`
    const rules = container.querySelectorAll('.show-index-shape-rule')

    expect(low.points[0].y).toBeGreaterThan(high.points[0].y)
    expect(rules[0].getAttribute('y1')).toBe(rules[1].getAttribute('y1'))
    expect(Number(rules[0].getAttribute('x2'))).toBeCloseTo(
      low.points.at(-1).x + layout.pointRadius
    )
    expect(Number(rules[0].getAttribute('x2'))).toBeLessThan(layout.width)
  })

  it('renders a gap-free minimum-thickness envelope for dense runs', () => {
    const layout = INDEX_SHAPE_LAYOUTS.desktop
    const geometry = createRatingShapeGeometry(
      Array.from({ length: 801 }, () => 8),
      layout
    )

    expect(geometry.regime).toBe('envelope')
    expect(geometry.points).toHaveLength(layout.width)
    expect(geometry.points[0].x).toBe(0.5)
    expect(geometry.points.at(-1).x).toBe(layout.width - 0.5)
    expect(
      geometry.points.every(
        (point) => point.bottom - point.top >= layout.strokeWidth
      )
    ).toBe(true)
  })

  it('omits marks and the reference rule when there are too few ratings', () => {
    const container = document.createElement('div')
    container.innerHTML = renderRatingShape(
      [8, 8.2, 7.9, 8.4],
      INDEX_SHAPE_LAYOUTS.desktop
    )

    expect(container.querySelector('svg').dataset.shapeRegime).toBe('none')
    expect(container.querySelector('.show-index-shape-rule')).toBeNull()
    expect(container.querySelector('.show-index-shape-line')).toBeNull()
  })

  it('keeps the shape itself outside the accessibility tree', () => {
    const container = document.createElement('div')
    container.innerHTML = renderRatingShape(
      ratings(12),
      INDEX_SHAPE_LAYOUTS.desktop
    )
    const svg = container.querySelector('svg')

    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
  })
})

function ratings(count) {
  return Array.from({ length: count }, (_, index) => 7 + (index % 5) * 0.4)
}
