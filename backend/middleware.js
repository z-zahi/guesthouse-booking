// Auth checks, the error type every route throws, and the zod pieces the routes share.
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { today } from './services/dates.js';

// Shorter messages for a missing field or a wrong type, zod's own messages for the rest.
z.config({
  customError: (iss) =>
    iss.code === 'invalid_type' ? (iss.input === undefined ? 'is required' : `must be a ${iss.expected}`) : undefined,
});

// Turned into { "error": { "code", "message" } } by the error handler in server.js.
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Reads the bearer token when there is one. Each route decides who may call it.
export function authenticate(req, res, next) {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return next();
  let p;
  try {
    p = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'UNAUTHORIZED', 'Your session has expired, please log in again.');
  }
  req.user = { id: p.sub, name: p.name, email: p.email, role: p.role, guesthouseId: p.guesthouseId };
  next();
}

// requireRole() lets in any logged-in user, requireRole('staff') only staff accounts.
export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Please log in first.');
    if (roles.length && !roles.includes(req.user.role)) {
      throw new HttpError(403, 'FORBIDDEN', `Only ${roles.join(' or ')} accounts can do this.`);
    }
    next();
  };

// Staff may only manage their own guesthouse.
export const isStaffOf = (user, guesthouseId) => user?.role === 'staff' && user.guesthouseId === guesthouseId;

export const id = z.coerce.number().int().min(1).max(2147483647);
export const date = z.iso
  .date({ error: 'must be a date in YYYY-MM-DD format' })
  .refine((d) => d >= '2000-01-01' && d <= '2100-12-31', 'must be between 2000 and 2100');
export const futureDate = date.refine((d) => d >= today(), 'cannot be in the past');
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be a month in YYYY-MM format');
export const email = z.string().trim().toLowerCase().max(255).pipe(z.email('must be a valid email address'));

// router.param('id', idParam): every :id in a URL is a positive whole number.
export function idParam(req, res, next, value, name) {
  const parsed = id.safeParse(value);
  if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', `${name} must be a positive whole number.`);
  req.params[name] = parsed.data;
  next();
}

// Object refinement: the end date comes after the start date (or the same day when allowed).
export const ordered = (start, end, sameDay = false) => [
  (v) => !v[start] || !v[end] || (sameDay ? v[end] >= v[start] : v[end] > v[start]),
  { path: [end], message: `must be ${sameDay ? 'on or ' : ''}after ${start}` },
];
