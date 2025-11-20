/** @type {import('next').NextConfig} */
const nextConfig = {
  // Always use static export for Electron-only build
  output: 'export',
  // Use relative paths for assets (critical for Electron file:// protocol)
  assetPrefix: '.',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig