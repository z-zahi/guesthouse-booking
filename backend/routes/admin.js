import { Router } from 'express';
import { z } from 'zod';
import { HttpError, email, id, requireRole } from '../http.js';
import * as guesthouses from '../services/guesthouseService.js';
import * as users from '../services/userService.js';

const router = Router();
router.use(requireRole('admin'));

const NewGuesthouse = z.object({
  name: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(80),
  contact_email: email,
});
const NewStaff = z.object({
  name: z.string().trim().min(2).max(100),
  email,
  password: z.string().min(8).max(72),
  guesthouse_id: id,
});

router.get('/guesthouses', async (req, res) => {
  res.json({ guesthouses: await guesthouses.list() });
});

router.post('/guesthouses', async (req, res) => {
  res.status(201).json({ guesthouse: await guesthouses.create(NewGuesthouse.parse(req.body)) });
});

router.get('/staff', async (req, res) => {
  res.json({ staff: await users.listStaff() });
});

router.post('/staff', async (req, res) => {
  const fields = NewStaff.parse(req.body);
  if (!(await guesthouses.findById(fields.guesthouse_id)))
    throw new HttpError(404, 'GUESTHOUSE_NOT_FOUND', 'Guesthouse not found.');
  if (await users.findByEmail(fields.email))
    throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
  const user = await users.create({ ...fields, role: 'staff', guesthouseId: fields.guesthouse_id });
  res.status(201).json({ user: users.publicUser(user) });
});

export default router;
