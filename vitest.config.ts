import { defineConfig } from 'vitest/config'
import path from 'path'

const legacyV1Tests = [
  'tests/plan-builder.test.ts',
  'tests/plan-intake.test.ts',
  'tests/plan-simulator.test.ts',
  'tests/schemas.test.ts',
  'tests/plan-build-charge-route.test.ts',
  'tests/plan-simulate-route.test.ts'
]

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['node_modules', 'out', 'dist', ...legacyV1Tests]
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@components': path.resolve(__dirname, './components'),
      '@app': path.resolve(__dirname, './app'),
    }
  }
})
