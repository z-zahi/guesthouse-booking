import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { seed } from './seed.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set, copy .env.example to .env first');
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(await readFile(new URL('schema.sql', import.meta.url), 'utf8'));
  console.log('Schema applied');
  if (process.argv.includes('--seed')) {
    const { rows } = await client.query('SELECT count(*)::int AS n FROM users');
    if (rows[0].n > 0) {
      console.log('Database already has users, seed skipped');
    } else {
      await seed(client);
      console.log('Demo data loaded, see db/seed.js for the demo accounts');
    }
  }
} finally {
  await client.end();
}
