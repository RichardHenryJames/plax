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

  // The Android app's update feed and the APK it points to are static files in public/ (see
  // android/README.md, "Publishing an update"). The app reads the feed with an exact JSON type and
  // a no-store request, so the feed must never be cached by anything between the site and the phone.
  // The APK is not cacheable either: on 10 October 2026 a request for its first two bytes (Range: bytes=0-1)
  // was stored by the shared cache in front of this site as if it were the whole file, and every later
  // download got those 2 bytes for an hour. Nothing that stores the answer to a ranged request may store this file.
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
      // TEMPORARY: probes for how the shared cache treats a ranged request that arrives first. Removed once measured.
      { source: '/probe-cached.bin', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, must-revalidate' }] },
      { source: '/probe-nostore.bin', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/probe-nostore2.bin', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/probe-rangerule.bin', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, must-revalidate' }] },
      { source: '/probe-rangerule.bin', has: [{ type: 'header', key: 'range' }], headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ]
  },
}

module.exports = nextConfig
