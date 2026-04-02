import type { NextConfig } from 'next'
import { execSync } from 'node:child_process'

const shouldRunDeployDoctor = process.env.VERCEL === '1'
  || process.env.LAP_RUN_DEPLOY_DOCTOR === '1'

// Ejecutar el doctor de deploy solo cuando realmente validamos entorno Vercel.
if (shouldRunDeployDoctor) {
  try {
    console.log('[NextConfig] Ejecutando chequeo de pre-vuelo...');
    execSync('node scripts/deploy-doctor.mjs', { stdio: 'inherit' });
  } catch (e) {
    console.warn('[NextConfig] Advertencia: El Doctor detectó problemas, pero intentaremos continuar.');
  }
}

const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
const nextDistDir = process.env.NEXT_DIST_DIR
  || (isVercel ? '.next' : '.next-build')

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
