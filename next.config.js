/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Served at plaxlabs.com/news, behind the website-builder app that owns the
  // domain root. This prefixes every route and the /_next assets, so the
  // parent zone only needs to forward /news and /news/*.
  // Keep in step with BASE_PATH in src/lib/base-path.ts.
  basePath: '/news',
  // Pin the workspace root so Turbopack resolves modules from this project's
  // node_modules (avoids picking up a stray lockfile in a parent directory).
  turbopack: {
    root: __dirname,
  },
}

module.exports = nextConfig
