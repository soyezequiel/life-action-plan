import type { NextConfig } from 'next'

const nextDistDir = process.env.NEXT_DIST_DIR?.trim()

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(nextDistDir ? { distDir: nextDistDir } : {}),
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
