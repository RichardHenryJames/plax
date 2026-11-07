// The mock website the test build talks to (10.0.2.2:8787 from the emulator): the same routes and answers as the real site for what the app uses,
// with fixed stories and settings, and a way for a test to change what it answers (an error, a slow answer, a dropped connection, new stories,
// another settings file, a feed that gives no more than `cap` stories at a time) and to see what the app asked for.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATEGORIES, imageFor, pool } from './fixtures.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(here, '..', '..', '..')
const BASE = '/news'

export function createMockServer({ port = 8787 } = {}) {
  const state = {
    now: Date.now(),
    feed: { mode: 'ok', delayMs: 0 },
    deeper: { mode: 'ok', delayMs: 0 },
    share: { mode: 'ok', delayMs: 0 },
    config: { mode: 'file', body: null },
    updates: { mode: 'none', body: null },
    fresh: new Map(),
    log: [],
    extra: new Map(),
  }
  let freshCounter = 0

  const reset = () => {
    state.now = Date.now()
    state.feed = { mode: 'ok', delayMs: 0 }
    state.deeper = { mode: 'ok', delayMs: 0 }
    state.share = { mode: 'ok', delayMs: 0 }
    state.config = { mode: 'file', body: null }
    state.updates = { mode: 'none', body: null }
    state.fresh.clear()
    state.log.length = 0
    freshCounter = 0
  }

  /** New stories at the top of a category, newer than anything the app has. */
  function inject(category, lang, count) {
    const key = `${category}/${lang}`
    const list = state.fresh.get(key) ?? []
    for (let i = 0; i < count; i++) {
      const n = ++freshCounter
      list.unshift({
        id: `e2e-fresh-${category}-${lang}-${String(n).padStart(3, '0')}`,
        title: lang === 'hi' ? `ताज़ा ख़बर ${n}` : `Fresh story ${n} just in`,
        content: lang === 'hi' ? 'यह एक ताज़ा ख़बर है जो अभी आई है।' : 'This story arrived after the reader opened the app, and it is newer than everything else on the page.',
        category,
        section: category === 'news' ? 'india' : '',
        source: 'The Hindu',
        sourceUrl: `https://e2e.plax.test/article/fresh-${n}`,
        image: '',
        readTime: '12s',
        ...(category === 'news' ? { publishedAt: Date.now() - 1000 * n } : {}),
      })
    }
    state.fresh.set(key, list)
  }

  const configFile = () => fs.readFileSync(path.join(REPO, 'public', 'app-config.json'), 'utf8')

  function cardsFor(url) {
    const categories = (url.searchParams.get('categories') ?? 'news').split(',').filter((c) => CATEGORIES.includes(c))
    const lang = url.searchParams.get('lang') === 'hi' ? 'hi' : 'en'
    const limit = Math.max(1, Math.min(state.feed.cap ?? 60, Math.min(60, Number(url.searchParams.get('limit') ?? 30))))
    const exclude = new Set((url.searchParams.get('exclude') ?? '').split(',').filter(Boolean))
    let cards = []
    for (const category of categories) cards.push(...(state.fresh.get(`${category}/${lang}`) ?? []), ...pool(category, lang, state.now))
    // A personalised mix interleaves its topics, as the real feed does.
    if (categories.length > 1) {
      const byCategory = categories.map((category) => cards.filter((card) => card.category === category))
      cards = []
      for (let i = 0; byCategory.some((list) => i < list.length); i++) for (const list of byCategory) if (i < list.length) cards.push(list[i])
    }
    return cards.filter((card) => !exclude.has(card.id)).slice(0, limit)
  }

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const send = (response, status, body, type = 'application/json; charset=utf-8', extra = {}) => {
    const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra })
    response.end(data)
  }
  const readBody = (request) => new Promise((resolve) => {
    const chunks = []
    request.on('data', (c) => chunks.push(c))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })

  async function handle(request, response) {
    const url = new URL(request.url, `http://localhost:${port}`)
    const route = url.pathname
    const entry = { method: request.method, path: route, query: Object.fromEntries(url.searchParams), headers: { ...request.headers }, body: '' }
    if (request.method !== 'GET' && request.method !== 'HEAD') entry.body = await readBody(request)
    if (!route.startsWith('/__control')) state.log.push(entry)

    if (route.startsWith('/__control')) return control(request, response, url, entry)

    if (route === `${BASE}/api/feed`) {
      const mode = state.feed.mode
      if (state.feed.delayMs) await delay(state.feed.delayMs)
      if (mode === 'drop') return request.socket.destroy()
      if (mode === 'hang') return undefined
      if (mode === 'error500') return send(response, 500, { cards: [], error: 'Server error' })
      if (mode === 'error429') return send(response, 429, { cards: [], error: 'Too many requests' })
      if (mode === 'serviceError') return send(response, 200, { cards: [], error: 'Feed unavailable' })
      if (mode === 'invalid') return send(response, 200, 'this is not json', 'text/html')
      if (mode === 'empty') return send(response, 200, { cards: [] })
      return send(response, 200, { cards: cardsFor(url), cached: false })
    }
    if (route === `${BASE}/app-config.json`) {
      if (state.config.mode === 'error') return send(response, 500, 'nope', 'text/plain')
      if (state.config.mode === 'drop') return request.socket.destroy()
      if (state.config.mode === 'raw') return send(response, 200, state.config.body)
      return send(response, 200, state.config.mode === 'object' ? JSON.stringify(state.config.body) : configFile())
    }
    if (route === `${BASE}/updates.json`) {
      if (state.updates.mode === 'none') return send(response, 404, { error: 'none' })
      return send(response, 200, state.updates.body)
    }
    if (route === `${BASE}/api/deeper` && request.method === 'POST') {
      if (state.deeper.delayMs) await delay(state.deeper.delayMs)
      if (state.deeper.mode === 'error') return send(response, 500, { error: 'No' })
      if (state.deeper.mode === 'rate') return send(response, 429, { error: 'Slow down' })
      const body = JSON.parse(entry.body || '{}')
      return send(response, 200, { insights: [`First, the **${String(body.title ?? '').slice(0, 30)}** story in context.`, 'Second, what it changes for readers.', 'Third, what to watch next.'] })
    }
    if (route === `${BASE}/api/share` && request.method === 'POST') {
      if (state.share.delayMs) await delay(state.share.delayMs)
      if (state.share.mode === 'error') return send(response, 500, { error: 'No' })
      const body = JSON.parse(entry.body || '{}')
      return send(response, 200, { id: String(body.id), url: `http://10.0.2.2:${port}${BASE}/s/${encodeURIComponent(String(body.id))}` })
    }
    if (route.startsWith(`${BASE}/e2e-img/`)) {
      const image = imageFor(route.slice(`${BASE}/e2e-img/`.length))
      return image ? send(response, 200, image, 'image/png', { 'Cache-Control': 'public, max-age=3600' }) : send(response, 404, 'missing', 'text/plain')
    }
    if (route === `${BASE}/privacy` || route === `${BASE}/contact` || route.startsWith(`${BASE}/s/`)) {
      return send(response, 200, `<!doctype html><title>Plax</title><h1>${route}</h1>`, 'text/html; charset=utf-8')
    }
    if (mockExtensions.has(route)) return mockExtensions.get(route)(request, response, url, entry, state)
    return send(response, 404, { error: 'No such route', route })
  }

  /** Routes other test files add (the sign-in stack, for one). */
  const mockExtensions = new Map()

  async function control(request, response, url, entry) {
    const action = url.pathname.replace('/__control', '') || '/'
    const body = entry.body ? JSON.parse(entry.body) : {}
    if (action === '/state' && request.method === 'POST') {
      for (const key of ['feed', 'deeper', 'share', 'config', 'updates']) if (body[key]) Object.assign(state[key], body[key])
      return send(response, 200, { ok: true })
    }
    if (action === '/reset') return (reset(), send(response, 200, { ok: true }))
    if (action === '/inject') return (inject(body.category ?? 'news', body.lang ?? 'en', body.count ?? 1), send(response, 200, { ok: true }))
    if (action === '/log') return send(response, 200, state.log)
    if (action === '/log/clear') return (state.log.length = 0, send(response, 200, { ok: true }))
    return send(response, 404, { error: 'No such control' })
  }

  const server = http.createServer((request, response) => {
    handle(request, response).catch((failure) => {
      send(response, 500, { error: String(failure?.message ?? failure) })
    })
  })

  return {
    state,
    reset,
    inject,
    mockExtensions,
    /** What the app asked for (a copy), newest last. Filter by path prefix. */
    requests: (prefix = '') => state.log.filter((entry) => entry.path.startsWith(prefix)),
    clearLog: () => void (state.log.length = 0),
    setFeed: (patch) => void Object.assign(state.feed, patch),
    setConfig: (config) => void (Object.assign(state.config, typeof config === 'string' ? { mode: 'raw', body: config } : config === null ? { mode: 'file', body: null } : { mode: 'object', body: config })),
    start: () => new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '0.0.0.0', () => resolve({ port }))
    }),
    stop: () => new Promise((resolve) => {
      server.closeAllConnections?.()
      server.close(() => resolve())
    }),
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createMockServer({ port: Number(process.env.PORT ?? 8787) })
  const { port } = await server.start()
  console.log(`The mock website listens on ${port}`)
}
