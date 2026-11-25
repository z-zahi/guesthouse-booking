import { query, queryOne } from './db.js';
import { today } from './dates.js';

const DETAILS = `
  SELECT b.*, r.name AS room_name, r.guesthouse_id, g.name AS guesthouse_name,
         u.name AS guest_name, u.email AS guest_email
  FROM bookings b
  JOIN rooms r ON r.id = b.room_id
  JOIN guesthouses g ON g.id = r.guesthouse_id
  JOIN users u ON u.id = b.guest_id`;

export const findById = (id) => queryOne(`${DETAILS} WHERE b.id = $1`, [id]);

export function list({ guestId, guesthouseId, room_id, status, from, to, guest }) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (guestId) add('b.guest_id = ?', guestId);
  if (guesthouseId) add('r.guesthouse_id = ?', guesthouseId);
  if (room_id) add('b.room_id = ?', room_id);
  if (status) add('b.status = ?', status);
  if (from) add('b.check_out > ?', from);
  if (to) add('b.check_in < ?', to);
  if (guest) add('(u.name ILIKE ? OR u.email ILIKE ?)', `%${guest}%`);
  return query(
    `${DETAILS} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY (b.status = 'Pending') DESC, b.check_in DESC, b.id DESC LIMIT 200`,
    params,
  );
}

export async function create(guestId, b, totalPrice) {
  const { id } = await queryOne(
    `INSERT INTO bookings (room_id, guest_id, check_in, check_out, guests, note, total_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [b.room_id, guestId, b.check_in, b.check_out, b.guests, b.note, totalPrice],
  );
  return findById(id);
}

export const guestHasOverlap = async (guestId, b) =>
  Boolean(
    await queryOne(
      `SELECT 1 FROM bookings WHERE guest_id = $1 AND room_id = $2 AND status IN ('Pending', 'Confirmed')
   AND check_in < $4 AND check_out > $3`,
      [guestId, b.room_id, b.check_in, b.check_out],
    ),
  );

export async function countUpcomingConfirmed(roomId) {
  const { n } = await queryOne(
    "SELECT count(*)::int AS n FROM bookings WHERE room_id = $1 AND status = 'Confirmed' AND check_out > $2",
    [roomId, today()],
  );
  return n;
}

export async function moveStatus(id, from, to, reason = null) {
  const row = await queryOne(
    `UPDATE bookings SET status = $3, reject_reason = COALESCE($4, reject_reason), updated_at = now()
     WHERE id = $1 AND status = ANY($2) RETURNING id`,
    [id, from, to, reason],
  );
  return row && findById(id);
}
