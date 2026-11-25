import { Router } from 'express';
import { z } from 'zod';
import { HttpError, email, requireRole } from '../http.js';
import * as users from '../services/userService.js';

const router = Router();

const SignUp = z.object({
  name: z.string().trim().min(2).max(100),
  email,
  password: z.string().min(8).max(72),
});
const Login = z.object({ email, password: z.string().min(1).max(72) });

router.post('/users', async (req, res) => {
  const fields = SignUp.parse(req.body);
  if (await users.findByEmail(fields.email))
    throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
  const user = await users.create({ ...fields, role: 'guest' });
  res.status(201).json({ user: users.publicUser(user), token: users.signToken(user) });
});

router.get('/users/me', requireRole(), async (req, res) => {
  const user = await users.findById(req.user.id);
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found.');
  res.json({ user: users.publicUser(user) });
});

router.post('/sessions', async (req, res) => {
  const { email, password } = Login.parse(req.body);
  const user = await users.findByEmail(email);
  if (!user || !(await users.checkPassword(password, user))) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Email or password is incorrect.');
  }
  res.json({ user: users.publicUser(user), token: users.signToken(user) });
});

export default router;
