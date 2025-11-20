/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Required for Electron - generates static files in out/
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig