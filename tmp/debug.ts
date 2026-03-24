import { getDatabase } from '../src/lib/db/connection'
import { planWorkflows } from '../src/lib/db/schema'
import { flowStateSchema } from '../src/shared/schemas/flow'
import { desc, isNull, eq } from 'drizzle-orm'

async function debug() {
  const db = getDatabase()
  const rows = await db.select().from(planWorkflows).orderBy(desc(planWorkflows.updatedAt)).limit(5)
  for (const latest of rows) {
    if (!latest) continue
    const originalString = typeof latest.state === 'string' ? latest.state : JSON.stringify(latest.state)
    const parsedValue = JSON.parse(originalString)
    const result = flowStateSchema.safeParse(parsedValue)
    
    if (!result.success) {
      console.error(`WORKFLOW ${latest.id} FAILED VALIDATION:`)
      console.error(JSON.stringify(result.error.format(), null, 2))
    } else {
      console.log(`WORKFLOW ${latest.id} PASSED`)
    }
  }
  process.exit(0)
}

debug().catch(e => {
  console.error(e)
  process.exit(1)
})
