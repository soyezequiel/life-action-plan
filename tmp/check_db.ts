
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './src/lib/db/schema';
import * as dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function main() {
  const allProfiles = await db.select().from(schema.profiles);
  const allPlans = await db.select().from(schema.plans);
  const allIntakes = await db.select().from(schema.profiles); // Same as profiles in this schema?

  console.log('Profiles count:', allProfiles.length);
  console.log('Plans count:', allPlans.length);
  
  if (allPlans.length > 0) {
    console.log('Latest Plan ID:', allPlans[allPlans.length - 1].id);
    console.log('Latest Plan Profile ID:', allPlans[allPlans.length - 1].profileId);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
