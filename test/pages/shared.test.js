import { describe, expect, it } from 'vitest'

import { renderPublisherBrand } from '../../src/pages/shared.js'

describe('renderPublisherBrand', () => {
  it('renders the publisher signature as a root-home link with one accented period', () => {
    const markup = renderPublisherBrand()

    expect(markup).toContain('href="https://yalethom.as/"')
    expect(markup).toContain('aria-label="yalethom.as/graphtv, publisher home"')
    expect(markup).toContain('<span class="publisher-brand-period">.</span>')
    expect(markup).not.toContain('target=')
  })
})
