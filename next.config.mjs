/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only use static export for Electron builds, not for Vercel
  // Electron builds set ELECTRON_BUILD=true environment variable
  ...(process.env.ELECTRON_BUILD === 'true' && { output: 'export' }),
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig