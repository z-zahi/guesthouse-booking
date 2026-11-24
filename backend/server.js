import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import serverless from 'serverless-http';
import { z } from 'zod';
import { HttpError, authenticate } from './middleware.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import availabilityRoutes from './routes/availability.js';
import bookingRoutes from './routes/bookings.js';
import roomRoutes from './routes/rooms.js';
import { UPLOADS_DIR } from './services/storageService.js';

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  next();
});
app.use(cors({ origin: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((o) => o.trim()) }));
app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json') && !req.path.endsWith('/photos')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
  }
  next();
});
app.use(authenticate);

app.get('/', (req, res) => {
  res.json({ name: 'Guesthouse Room Booking API', health: '/api/health' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', environment: process.env.NODE_ENV || 'development' });
});

app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api', availabilityRoutes);
app.use('/uploads', express.static(UPLOADS_DIR));

app.use((req, res) => {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found.' } });
});

app.use((err, req, res, _next) => {
  const send = (status, code, message, details) => res.status(status).json({ error: { code, message, details } });
  if (err instanceof z.ZodError) {
    const message = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join(', ');
    return send(400, 'VALIDATION_ERROR', `${message}.`, z.flattenError(err).fieldErrors);
  }
  if (err instanceof HttpError) return send(err.status, err.code, err.message);
  if (err.type === 'entity.parse.failed') return send(400, 'VALIDATION_ERROR', 'Request body is not valid JSON.');
  if (err.type === 'entity.too.large') return send(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  console.error(err);
  send(500, 'INTERNAL_ERROR', 'An unexpected server error occurred.');
});

export default app;
export const handler = serverless(app);

if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Guesthouse API on http://localhost:${port}`));
}
