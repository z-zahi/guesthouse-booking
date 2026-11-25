import { query, queryOne } from './db.js';

export async function conflictsFor(roomIds, from, to) {
  const [stays, blocks] = await Promise.all([
    query(
      `SELECT 'booking' AS type, id, room_id, check_in AS start_date, check_out AS end_date
       FROM bookings WHERE room_id = ANY($1) AND status = 'Confirmed' AND check_in < $3 AND check_out > $2`,
      [roomIds, from, to],
    ),
    query(
      `SELECT 'block' AS type, id, room_id, start_date, end_date
       FROM date_blocks WHERE room_id = ANY($1) AND start_date < $3 AND end_date >= $2`,
      [roomIds, from, to],
    ),
  ]);
  return [...stays, ...blocks].sort((a, b) => a.start_date.localeCompare(b.start_date));
}

export async function freeRoomIds(roomIds, from, to) {
  if (!roomIds.length) return [];
  const busy = new Set((await conflictsFor(roomIds, from, to)).map((c) => c.room_id));
  return roomIds.filter((id) => !busy.has(id));
}

export const listBlocks = (guesthouseId, from, roomId) =>
  query(
    `SELECT b.*, r.name AS room_name FROM date_blocks b JOIN rooms r ON r.id = b.room_id
   WHERE r.guesthouse_id = $1 AND b.end_date >= $2 AND ($3::int IS NULL OR b.room_id = $3)
   ORDER BY b.start_date`,
    [guesthouseId, from, roomId ?? null],
  );

export const findBlock = (id) => queryOne('SELECT * FROM date_blocks WHERE id = $1', [id]);

export const createBlock = ({ room_id, start_date, end_date, reason }) =>
  queryOne('INSERT INTO date_blocks (room_id, start_date, end_date, reason) VALUES ($1, $2, $3, $4) RETURNING *', [
    room_id,
    start_date,
    end_date,
    reason,
  ]);

export const removeBlock = (id) => query('DELETE FROM date_blocks WHERE id = $1', [id]);
