/**
 * The news app is served at plaxlabs.com/news as a Next.js multi-zone, behind
 * the website-builder app that owns the domain root.
 *
 * `basePath` in next.config.js prefixes routes, <Link>, router.push and the
 * /_next assets automatically. It does NOT touch fetch() — a bare
 * fetch('/api/feed') would leave this zone and hit the builder app, which has
 * no such route. Anything hand-written therefore goes through here.
 */
export const BASE_PATH = '/news'

/** Prefix an app-absolute path so it stays inside this zone. */
export const withBase = (path: string) => `${BASE_PATH}${path}`
