/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root so Turbopack resolves modules from this project's
  // node_modules (avoids picking up a stray lockfile in a parent directory).
  turbopack: {
    root: __dirname,
  },
}

module.exports = nextConfig
