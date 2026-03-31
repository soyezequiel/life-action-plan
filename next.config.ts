import type { NextConfig } from 'next'
import { execSync } from 'node:child_process'

// Ejecutar Doctor en fase de build si estamos en Vercel
if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
  try {
    console.log('[NextConfig] Ejecutando chequeo de pre-vuelo...');
    execSync('node scripts/deploy-doctor.mjs', { stdio: 'inherit' });
  } catch (e) {
    console.warn('[NextConfig] Advertencia: El Doctor detectó problemas, pero intentaremos continuar.');
  }
}

const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
const nextDistDir = isVercel ? '.next' : '.next-build'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: nextDistDir,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
