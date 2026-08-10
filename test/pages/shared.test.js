import { describe, expect, it } from 'vitest'

import { renderLoading, renderPublisherBrand } from '../../src/pages/shared.js'

describe('renderPublisherBrand', () => {
  it('renders the publisher signature as a root-home link with one accented period', () => {
    const markup = renderPublisherBrand()

    expect(markup).toContain('href="https://yalethom.as/"')
    expect(markup).toContain('aria-label="yalethom.as/graphtv, publisher home"')
    expect(markup).toContain('<span class="publisher-brand-period">.</span>')
    expect(markup).not.toContain('target=')
  })
})

describe('renderLoading', () => {
  it('can defer announcements to a containing live region', () => {
    expect(renderLoading('Searching…')).toContain('role="status"')
    expect(renderLoading('Searching…', { announce: false })).not.toContain('role="status"')
  })
})
