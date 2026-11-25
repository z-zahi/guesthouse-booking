import { HttpError } from '../http.js';
import { query, queryOne } from './db.js';
import { addDays, nights } from './dates.js';
import * as availability from './availabilityService.js';
import * as rooms from './roomService.js';

const MAX_STAY = 60;

export const listRates = (roomId) =>
  query('SELECT * FROM seasonal_rates WHERE room_id = $1 ORDER BY start_date', [roomId]);

export const findRate = (id) => queryOne('SELECT * FROM seasonal_rates WHERE id = $1', [id]);

export const findOverlap = (roomId, start, end) =>
  queryOne(
    'SELECT start_date, end_date FROM seasonal_rates WHERE room_id = $1 AND start_date <= $3 AND end_date >= $2',
    [roomId, start, end],
  );

export const createRate = (roomId, r) =>
  queryOne(
    `INSERT INTO seasonal_rates (room_id, start_date, end_date, nightly_price, min_nights)
   VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [roomId, r.start_date, r.end_date, r.nightly_price, r.min_nights],
  );

export const removeRate = (id) => query('DELETE FROM seasonal_rates WHERE id = $1', [id]);

export const findDiscount = (roomId) => queryOne('SELECT * FROM stay_discounts WHERE room_id = $1', [roomId]);

export const upsertDiscount = (roomId, { min_nights, percent }) =>
  queryOne(
    `INSERT INTO stay_discounts (room_id, min_nights, percent) VALUES ($1, $2, $3)
   ON CONFLICT (room_id) DO UPDATE SET min_nights = $2, percent = $3 RETURNING *`,
    [roomId, min_nights, percent],
  );

export const removeDiscount = (roomId) => query('DELETE FROM stay_discounts WHERE room_id = $1', [roomId]);

export async function withPricing(room) {
  const [rates, discount] = await Promise.all([listRates(room.id), findDiscount(room.id)]);
  return { ...room, rates, discount };
}

function priceStay(room, rates, discount, from, to) {
  const dates = nights(from, to);
  const seasons = dates.map((date) => rates.find((r) => r.start_date <= date && r.end_date >= date));
  const breakdown = dates.map((date, i) => ({
    date,
    price: seasons[i]?.nightly_price ?? room.base_price,
    season_id: seasons[i]?.id ?? null,
  }));
  const minNights = Math.max(1, ...seasons.map((s) => s?.min_nights ?? 1));
  const cents = breakdown.reduce((sum, n) => sum + Math.round(n.price * 100), 0);
  const discountPercent = discount && dates.length >= discount.min_nights ? discount.percent : 0;
  const discountCents = Math.round((cents * discountPercent) / 100);
  return {
    nights: dates.length,
    min_nights: minNights,
    breakdown,
    subtotal: cents / 100,
    discount_percent: discountPercent,
    discount_amount: discountCents / 100,
    total: (cents - discountCents) / 100,
  };
}

export async function quote(roomId, from, to, guests) {
  if (to > addDays(from, MAX_STAY))
    throw new HttpError(400, 'VALIDATION_ERROR', `Stays can be at most ${MAX_STAY} nights.`);
  const room = await rooms.findById(roomId);
  if (!room?.is_active) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
  if (guests > room.capacity) {
    throw new HttpError(400, 'VALIDATION_ERROR', `This room sleeps at most ${room.capacity} guest(s).`);
  }
  const [rates, discount, conflicts] = await Promise.all([
    listRates(roomId),
    findDiscount(roomId),
    availability.conflictsFor([roomId], from, to),
  ]);
  const price = priceStay(room, rates, discount, from, to);
  if (price.nights < price.min_nights) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `This stay needs at least ${price.min_nights} nights in the selected season.`,
    );
  }
  if (conflicts.length) throw new HttpError(409, 'ROOM_UNAVAILABLE', 'The room is not available for these dates.');
  return { room_id: roomId, from, to, guests, ...price };
}
