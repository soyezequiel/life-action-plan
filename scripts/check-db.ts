import { getDatabase } from '../src/lib/db/connection';
import { sql } from 'drizzle-orm';

async function checkCols() {
  const db = getDatabase();
  try {
    const res = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'plans'`);
    console.log('Columns in plans table:', res.map((r: any) => r.column_name));
    process.exit(0);
  } catch (err) {
    console.error('Error checking columns:', err);
    process.exit(1);
  }
}

checkCols();
