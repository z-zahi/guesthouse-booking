import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, queryOne } from './db.js';

export const publicUser = ({ id, name, email, role, guesthouse_id }) => ({ id, name, email, role, guesthouse_id });

export const signToken = (u) =>
  jwt.sign(
    { sub: u.id, name: u.name, email: u.email, role: u.role, guesthouseId: u.guesthouse_id ?? null },
    process.env.JWT_SECRET,
    { expiresIn: '8h' },
  );

export const findById = (id) => queryOne('SELECT * FROM users WHERE id = $1', [id]);

export const findByEmail = (email) => queryOne('SELECT * FROM users WHERE email = $1', [email]);

export const checkPassword = (password, user) => bcrypt.compare(password, user.password_hash);

export async function create({ name, email, password, role, guesthouseId = null }) {
  return queryOne(
    `INSERT INTO users (name, email, password_hash, role, guesthouse_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, email, await bcrypt.hash(password, 10), role, guesthouseId],
  );
}

export const listStaff = () =>
  query(
    `SELECT u.id, u.name, u.email, u.guesthouse_id, g.name AS guesthouse_name
   FROM users u JOIN guesthouses g ON g.id = u.guesthouse_id
   WHERE u.role = 'staff' ORDER BY g.name, u.name`,
  );
