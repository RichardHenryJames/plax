/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Served under /news of its own domain (see src/lib/site.ts). This prefixes every route and the /_next assets.
  // It once sat behind another app that owned the domain root, which is why the prefix exists.
  // Keep in step with BASE_PATH in src/lib/base-path.ts.
  basePath: '/news',
  // Pin the workspace root so Turbopack resolves modules from this project's
  // node_modules (avoids picking up a stray lockfile in a parent directory).
  turbopack: {
    root: __dirname,
  },

  // Nothing else is served at the root of the domain, so the bare address, and the two files that crawlers look for
  // at the root of a host, are sent to where they really are. (Not permanent: the prefix may change one day.)
  async redirects() {
    return [
      { source: '/', destination: '/news', basePath: false, permanent: false },
      { source: '/robots.txt', destination: '/news/robots.txt', basePath: false, permanent: false },
      { source: '/sitemap.xml', destination: '/news/sitemap.xml', basePath: false, permanent: false },
    ]
  },

  // The Android app's update feed and the APK it points to are static files in public/ (see
  // android/README.md, "Publishing an update"). The app reads the feed with an exact JSON type and
  // a no-store request, so the feed must never be cached by anything between the site and the phone.
  // The APK is not cacheable either: on 10 October 2026 a request for its first two bytes (Range: bytes=0-1)
  // was stored by the shared cache in front of this site as if it were the whole file, and every later
  // download got those 2 bytes for an hour. Probe files showed that with "public, max-age" a ranged request
  // arriving first poisons later plain downloads, and that with no-store it does not (two samples).
  async headers() {
    return [
      {
        source: '/updates.json',
        headers: [
          { key: 'Content-Type', value: 'application/json; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
      {
        source: '/:file(plax-\\d+\\.\\d+\\.\\d+\\.apk)',
        headers: [
          { key: 'Content-Type', value: 'application/vnd.android.package-archive' },
          { key: 'Content-Disposition', value: 'attachment; filename=:file' },
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
