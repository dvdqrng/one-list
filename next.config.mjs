import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER
  const lifecycleEvent = process.env.npm_lifecycle_event ?? ""
  const isElectronBuild =
    process.env.BUILD_TARGET === "electron" || lifecycleEvent.startsWith("electron:")
  const shouldUseStaticExport = !isDev && isElectronBuild

  return {
    ...(shouldUseStaticExport
      ? {
          output: "export",
          assetPrefix: ".",
        }
      : {}),
    typescript: {
      ignoreBuildErrors: true,
    },
    images: {
      unoptimized: true,
    },
    turbopack: {
      root: __dirname,
    },
  }
}

export default nextConfig
