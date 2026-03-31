import fs from 'fs';
import postgres from 'postgres';

async function run() {
  const env = fs.readFileSync('.env.local', 'utf8');
  const dbUrl = env.match(/DATABASE_URL=["']?(.+?)["']?(\s|$)/)?.[1];

  if (!dbUrl) {
    console.error('Could not find DATABASE_URL in .env.local');
    process.exit(1);
  }

  const sql = postgres(dbUrl);

  try {
    console.log('Adding deleted_at column to plans table...');
    await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`;
    console.log('Column added successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Failed to update database:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
