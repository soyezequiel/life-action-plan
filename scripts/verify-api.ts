import fs from 'fs';

async function testApi() {
  const env = fs.readFileSync('.env.local', 'utf8');
  const baseUrl = 'http://localhost:3000'; // Assuming local dev

  try {
    const res = await fetch(`${baseUrl}/api/profile/latest`);
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Data:', data);
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Fetch failed (is server running?):', message);
    process.exit(1);
  }
}

testApi();
