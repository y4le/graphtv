import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import viteConfig, {
  restoreTailnetPath,
  restoreTailnetRequestUrl
} from '../vite.config.js'

describe('production build', () => {
  it('does not publish source maps with production assets', () => {
    expect(viteConfig.build.sourcemap).toBe(false)
  })
})

describe('restoreTailnetRequestUrl', () => {
  it('restores the public base after a path-scoped proxy strips it', () => {
    expect(restoreTailnetRequestUrl('/', '/graphtv')).toBe('/graphtv/')
    expect(restoreTailnetRequestUrl('/@vite/client', '/graphtv')).toBe(
      '/graphtv/@vite/client'
    )
    expect(restoreTailnetRequestUrl('/src/main.js?q=1', '/graphtv')).toBe(
      '/graphtv/src/main.js?q=1'
    )
  })

  it('does not duplicate an intact public base', () => {
    expect(restoreTailnetRequestUrl('/graphtv', '/graphtv')).toBe('/graphtv/')
    expect(restoreTailnetRequestUrl('/graphtv?q=1', '/graphtv')).toBe(
      '/graphtv/?q=1'
    )
    expect(restoreTailnetRequestUrl('/graphtv/src/main.js', '/graphtv')).toBe(
      '/graphtv/src/main.js'
    )
  })

  it('restores the public base for websocket upgrades before Vite HMR handles them', () => {
    const httpServer = new EventEmitter()
    let urlObservedByExistingListener = null
    httpServer.on('upgrade', (request) => {
      urlObservedByExistingListener = request.url
    })
    const server = {
      httpServer,
      middlewares: { use: vi.fn() }
    }
    restoreTailnetPath('/graphtv').configureServer(server)
    const request = { url: '/?token=1' }

    httpServer.emit('upgrade', request)

    expect(request.url).toBe('/graphtv/?token=1')
    expect(urlObservedByExistingListener).toBe('/graphtv/?token=1')
  })
})
