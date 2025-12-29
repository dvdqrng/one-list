import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js"

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER

  return {
    ...(isDev
      ? {}
      : {
          // Use static export when building for Electron distribution
          output: "export",
          // Use relative paths for assets (critical for Electron file:// protocol)
          assetPrefix: ".",
        }),
    typescript: {
      ignoreBuildErrors: true,
    },
    images: {
      unoptimized: true,
    },
  }
}

export default nextConfig
