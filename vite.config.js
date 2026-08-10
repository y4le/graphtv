import { defineConfig } from 'vite'

const tailnetPath = process.env.GRAPHTV_DEV_PATH

export function restoreTailnetRequestUrl(requestUrl, path) {
  const base = `${path}/`
  const suffixIndex = requestUrl.search(/[?#]/)
  const pathname = suffixIndex === -1 ? requestUrl : requestUrl.slice(0, suffixIndex)
  const suffix = suffixIndex === -1 ? '' : requestUrl.slice(suffixIndex)

  if (pathname === path) {
    return `${base}${suffix}`
  }

  if (pathname.startsWith(base)) {
    return requestUrl
  }

  return `${path}${pathname.startsWith('/') ? '' : '/'}${pathname}${suffix}`
}

export function restoreTailnetPath(path) {
  return {
    name: 'restore-tailnet-path',
    configureServer(server) {
      server.httpServer?.prependListener('upgrade', (request) => {
        request.url = restoreTailnetRequestUrl(request.url ?? '/', path)
      })
      server.middlewares.use((request, _response, next) => {
        request.url = restoreTailnetRequestUrl(request.url ?? '/', path)

        next()
      })
    }
  }
}

export default defineConfig({
  base: tailnetPath ? `${tailnetPath}/` : './',
  plugins: tailnetPath ? [restoreTailnetPath(tailnetPath)] : [],
  build: {
    target: 'es2022',
    sourcemap: true
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.js']
  }
})
