/** @type {import('next').NextConfig} */
const nextConfig = {
  // Always use static export for Electron-only build
  output: 'export',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig