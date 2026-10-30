/**
 * The news app is served under /news of its own domain (see site.ts). It was first a Next.js multi-zone behind
 * another app that owned the domain root, which is why everything sits under a prefix.
 *
 * `basePath` in next.config.js prefixes routes, <Link>, router.push and the
 * /_next assets automatically. It does NOT touch fetch() — a bare
 * fetch('/api/feed') would not be found, because the routes only exist under
 * the prefix. Anything hand-written therefore goes through here.
 */
export const BASE_PATH = '/news'

/**
 * Prefix an app-absolute path so it stays inside this zone. Idempotent, so
 * wrapping a value that already carries the prefix is harmless.
 */
export const withBase = (path: string) =>
  path === BASE_PATH || path.startsWith(`${BASE_PATH}/`) ? path : `${BASE_PATH}${path === '/' ? '' : path}`
