import 'dotenv/config'
import { db } from '../src/lib/db'
import { planes } from '../src/lib/db/schema'
import { desc } from 'drizzle-orm'

async function main() {
  const lastPlans = await db.select().from(planes).orderBy(desc(planes.creado)).limit(1)
  console.log(JSON.stringify(lastPlans, null, 2))
  process.exit(0)
}

main()
