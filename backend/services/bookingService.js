import { query, queryOne } from './db.js';
import { today } from './dates.js';

const BOOKING_DETAILS_SQL = `
  SELECT b.*, r.name AS room_name, r.guesthouse_id, g.name AS guesthouse_name,
         u.name AS guest_name, u.email AS guest_email
  FROM bookings b
  JOIN rooms r ON r.id = b.room_id
  JOIN guesthouses g ON g.id = r.guesthouse_id
  JOIN users u ON u.id = b.guest_id`;

export async function findById(id) {
  return queryOne(`${BOOKING_DETAILS_SQL} WHERE b.id = $1`, [id]);
}

export async function list({ guestId, guesthouseId, room_id, status, from, to, guest }) {
  const conditions = [];
  const params = [];

  if (guestId) {
    params.push(guestId);
    conditions.push(`b.guest_id = $${params.length}`);
  }
  if (guesthouseId) {
    params.push(guesthouseId);
    conditions.push(`r.guesthouse_id = $${params.length}`);
  }
  if (room_id) {
    params.push(room_id);
    conditions.push(`b.room_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`b.status = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conditions.push(`b.check_out > $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`b.check_in < $${params.length}`);
  }
  if (guest) {
    params.push(`%${guest}%`);
    conditions.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return query(
    `${BOOKING_DETAILS_SQL} ${whereClause}
     ORDER BY (b.status = 'Pending') DESC, b.check_in DESC, b.id DESC
     LIMIT 200`,
    params,
  );
}

export async function create(guestId, bookingData, totalPrice) {
  const created = await queryOne(
    `INSERT INTO bookings (room_id, guest_id, check_in, check_out, guests, note, total_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      bookingData.room_id,
      guestId,
      bookingData.check_in,
      bookingData.check_out,
      bookingData.guests,
      bookingData.note,
      totalPrice,
    ],
  );
  return findById(created.id);
}

export async function guestHasOverlap(guestId, bookingData) {
  const existing = await queryOne(
    `SELECT 1 FROM bookings
     WHERE guest_id = $1 AND room_id = $2 AND status IN ('Pending', 'Confirmed')
       AND check_in < $4 AND check_out > $3`,
    [guestId, bookingData.room_id, bookingData.check_in, bookingData.check_out],
  );
  return Boolean(existing);
}

// Used by Room Catalogue before deactivating a room.
export async function countUpcomingConfirmed(roomId) {
  const row = await queryOne(
    "SELECT count(*)::int AS n FROM bookings WHERE room_id = $1 AND status = 'Confirmed' AND check_out > $2",
    [roomId, today()],
  );
  return row.n;
}

// Update status only if the booking is still in one of the allowed current statuses.
export async function moveStatus(id, fromStatuses, toStatus, reason = null) {
  const row = await queryOne(
    `UPDATE bookings
     SET status = $3,
         reject_reason = COALESCE($4, reject_reason),
         updated_at = now()
     WHERE id = $1 AND status = ANY($2)
     RETURNING id`,
    [id, fromStatuses, toStatus, reason],
  );
  if (!row) return null;
  return findById(id);
}
