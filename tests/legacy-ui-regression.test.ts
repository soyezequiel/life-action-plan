import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ACTIVE_PATHS = [
  'app/auth',
  'app/settings/page.tsx',
  'app/tasks/page.tsx',
  'app/plan/page.tsx',
  'app/plan/v5/page.tsx',
  'components/workspace',
  'components/layout/AppShell.tsx',
  'components/layout/PageSidebar.tsx',
  'components/plan-viewer/PlanificadorPage.tsx'
]

function collectFiles(targetPath: string): string[] {
  const absolutePath = path.join(process.cwd(), targetPath)
  const stats = statSync(absolutePath)

  if (stats.isFile()) {
    return [absolutePath]
  }

  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const relativeEntryPath = path.join(targetPath, entry.name)
    return entry.isDirectory() ? collectFiles(relativeEntryPath) : [path.join(process.cwd(), relativeEntryPath)]
  })
}

describe('legacy ui regression', () => {
  it('mantiene las rutas activas fuera de mockups y symbols Mockup', () => {
    const files = ACTIVE_PATHS.flatMap((targetPath) => collectFiles(targetPath))

    for (const file of files) {
      const source = readFileSync(file, 'utf8')

      expect(source, file).not.toMatch(/components[\\/]+mockups/)
      expect(source, file).not.toMatch(/mockups\./)
      expect(source, file).not.toMatch(/\bMockup[A-Za-z0-9_]*/)
    }
  })
})
