import { query, queryOne } from './db.js';

const WITH_GUESTHOUSE = `
  SELECT r.*, g.name AS guesthouse_name, g.city
  FROM rooms r JOIN guesthouses g ON g.id = r.guesthouse_id`;

export const findById = (id) => queryOne(`${WITH_GUESTHOUSE} WHERE r.id = $1`, [id]);

export const listByGuesthouse = (guesthouseId) =>
  query(`${WITH_GUESTHOUSE} WHERE r.guesthouse_id = $1 ORDER BY r.is_active DESC, r.name`, [guesthouseId]);

export async function activeIds(guesthouseId) {
  const rows = await query('SELECT id FROM rooms WHERE guesthouse_id = $1 AND is_active', [guesthouseId]);
  return rows.map((r) => r.id);
}

export function search({ guests, max_price, city, guesthouse_id }) {
  const where = ['r.is_active'];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(`${sql} $${params.length}`);
  };
  if (guests) add('r.capacity >=', guests);
  if (max_price) add('r.base_price <=', max_price);
  if (city) add('g.city ILIKE', `%${city}%`);
  if (guesthouse_id) add('r.guesthouse_id =', guesthouse_id);
  return query(`${WITH_GUESTHOUSE} WHERE ${where.join(' AND ')} ORDER BY r.base_price, r.id`, params);
}

export const create = (guesthouseId, f) =>
  queryOne(
    `INSERT INTO rooms (guesthouse_id, name, type, capacity, base_price, description)
   VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [guesthouseId, f.name, f.type, f.capacity, f.base_price, f.description],
  );

export const update = (id, f) =>
  queryOne(
    `UPDATE rooms SET name = $2, type = $3, capacity = $4, base_price = $5, description = $6
   WHERE id = $1 RETURNING *`,
    [id, f.name, f.type, f.capacity, f.base_price, f.description],
  );

export const setActive = (id, active) =>
  queryOne('UPDATE rooms SET is_active = $2 WHERE id = $1 RETURNING *', [id, active]);

export const addPhoto = (id, url) =>
  queryOne('UPDATE rooms SET photo_urls = array_append(photo_urls, $2) WHERE id = $1 RETURNING photo_urls', [id, url]);

export const removePhoto = (id, url) =>
  queryOne('UPDATE rooms SET photo_urls = array_remove(photo_urls, $2) WHERE id = $1 RETURNING photo_urls', [id, url]);
