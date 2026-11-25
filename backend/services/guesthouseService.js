import { query, queryOne } from './db.js';

export const list = () =>
  query(
    `SELECT g.*, (SELECT count(*)::int FROM users u WHERE u.guesthouse_id = g.id) AS staff_count
   FROM guesthouses g ORDER BY g.name`,
  );

export const findById = (id) => queryOne('SELECT * FROM guesthouses WHERE id = $1', [id]);

export const create = ({ name, city, contact_email }) =>
  queryOne('INSERT INTO guesthouses (name, city, contact_email) VALUES ($1, $2, $3) RETURNING *', [
    name,
    city,
    contact_email,
  ]);
