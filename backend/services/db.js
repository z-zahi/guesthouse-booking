import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, Number);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000 });
pool.on('error', (err) => console.error('Idle database connection closed:', err.message));

const transaction = new AsyncLocalStorage();

export async function query(text, params = []) {
  const { rows } = await (transaction.getStore() ?? pool).query(text, params);
  return rows;
}

export const queryOne = async (text, params) => (await query(text, params))[0] ?? null;

export async function withRoomLock(roomId, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [roomId]);
    const result = await transaction.run(client, work);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
