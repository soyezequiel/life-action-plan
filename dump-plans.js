const { Client } = require('pg');
require('dotenv').config();

async function dumpPlans() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query('SELECT id, profile_id as "profileId", nombre, created_at as "createdAt" FROM plans ORDER BY created_at DESC LIMIT 10');
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

dumpPlans().catch(console.error);
