import express, { Router } from 'express';
import { z } from 'zod';
import { HttpError, date, id, idParam, isStaffOf, ordered, requireRole } from '../http.js';
import { withRoomLock } from '../services/db.js';
import * as availability from '../services/availabilityService.js';
import * as bookings from '../services/bookingService.js';
import * as pricing from '../services/pricingService.js';
import * as rooms from '../services/roomService.js';
import { savePhoto } from '../services/storageService.js';

const router = Router();
router.param('id', idParam);
router.param('rateId', idParam);

const MAX_PHOTOS = 8;
const guests = z.coerce.number().int().min(1).max(10);

const RoomFields = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.string().trim().min(2).max(50),
  capacity: z.int().min(1).max(10),
  base_price: z.number().positive().max(100000),
  description: z.string().trim().max(2000).default(''),
});
const Search = z
  .object({
    guests: guests.optional(),
    max_price: z.coerce.number().positive().optional(),
    city: z.string().trim().max(80).optional(),
    guesthouse_id: id.optional(),
    from: date.optional(),
    to: date.optional(),
  })
  .refine((q) => !q.from === !q.to, { path: ['to'], message: 'from and to must be given together' })
  .refine(...ordered('from', 'to'));
const Quote = z.object({ from: date, to: date, guests: guests.default(1) }).refine(...ordered('from', 'to'));
const Status = z.object({ status: z.enum(['Active', 'Inactive']) });
const Rate = z
  .object({
    start_date: date,
    end_date: date,
    nightly_price: z.number().positive().max(100000),
    min_nights: z.int().min(1).max(30).default(1),
  })
  .refine(...ordered('start_date', 'end_date', true));
const Discount = z.object({ min_nights: z.int().min(2).max(30), percent: z.int().min(1).max(50) });
const Photo = z.object({ url: z.string().max(1000) });

const SIGNATURES = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
};

async function findRoom(roomId) {
  const room = await rooms.findById(roomId);
  if (!room) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
  return room;
}

const ownRoom = [
  requireRole('staff'),
  async (req, res, next) => {
    req.room = await findRoom(req.params.id);
    if (!isStaffOf(req.user, req.room.guesthouse_id))
      throw new HttpError(403, 'FORBIDDEN', 'This room belongs to another guesthouse.');
    next();
  },
];

router.get(
  '/',
  (req, res, next) => next(req.query.mine === 'true' ? undefined : 'route'),
  requireRole('staff'),
  async (req, res) => {
    const list = await rooms.listByGuesthouse(req.user.guesthouseId);
    res.json({ rooms: await Promise.all(list.map(pricing.withPricing)) });
  },
);

router.get('/', async (req, res) => {
  const { from, to, ...filters } = Search.parse(req.query);
  let list = await rooms.search(filters);
  if (from && list.length) {
    const free = new Set(
      await availability.freeRoomIds(
        list.map((r) => r.id),
        from,
        to,
      ),
    );
    list = list.filter((r) => free.has(r.id));
  }
  res.json({ rooms: list });
});

router.post('/', requireRole('staff'), async (req, res) => {
  res.status(201).json({ room: await rooms.create(req.user.guesthouseId, RoomFields.parse(req.body)) });
});

router.get('/:id', async (req, res) => {
  const room = await findRoom(req.params.id);
  if (!room.is_active && !isStaffOf(req.user, room.guesthouse_id))
    throw new HttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
  res.json({ room: await pricing.withPricing(room) });
});

router.put('/:id', ownRoom, async (req, res) => {
  res.json({ room: await rooms.update(req.params.id, RoomFields.parse(req.body)) });
});

router.get('/:id/quote', async (req, res) => {
  const { from, to, guests: count } = Quote.parse(req.query);
  res.json(await pricing.quote(req.params.id, from, to, count));
});

router.post('/:id/photos', ownRoom, express.raw({ type: Object.keys(SIGNATURES), limit: '2mb' }), async (req, res) => {
  const type = req.get('content-type')?.split(';')[0].trim();
  if (!Object.hasOwn(SIGNATURES, type))
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Photos must be JPEG or PNG images.');
  if (!req.body?.length) throw new HttpError(400, 'VALIDATION_ERROR', 'The photo file is empty.');
  if (!SIGNATURES[type].every((byte, i) => req.body[i] === byte)) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The file content is not a valid JPEG or PNG image.');
  }
  if (req.room.photo_urls.length >= MAX_PHOTOS)
    throw new HttpError(409, 'PHOTO_LIMIT', `A room can have at most ${MAX_PHOTOS} photos.`);
  const url = await savePhoto(req.params.id, req.body, type);
  const { photo_urls } = await rooms.addPhoto(req.params.id, url);
  res.status(201).json({ url, photo_urls });
});

router.delete('/:id/photos', ownRoom, async (req, res) => {
  const { url } = Photo.parse(req.body);
  if (!req.room.photo_urls.includes(url)) throw new HttpError(404, 'PHOTO_NOT_FOUND', 'Photo not found on this room.');
  res.json(await rooms.removePhoto(req.params.id, url));
});

router.patch('/:id/status', ownRoom, async (req, res) => {
  const { status } = Status.parse(req.body);
  const roomId = req.params.id;
  if (status === 'Active') return res.json({ room: await rooms.setActive(roomId, true) });
  const room = await withRoomLock(roomId, async () => {
    const count = await bookings.countUpcomingConfirmed(roomId);
    if (count) {
      throw new HttpError(
        409,
        'ROOM_HAS_UPCOMING_STAYS',
        `This room has ${count} upcoming confirmed stay(s) and cannot be deactivated.`,
      );
    }
    return rooms.setActive(roomId, false);
  });
  res.json({ room });
});

router.post('/:id/rates', ownRoom, async (req, res) => {
  const rate = Rate.parse(req.body);
  const created = await withRoomLock(req.params.id, async () => {
    const clash = await pricing.findOverlap(req.params.id, rate.start_date, rate.end_date);
    if (clash) {
      throw new HttpError(
        409,
        'SEASON_OVERLAP',
        `This season overlaps the season from ${clash.start_date} to ${clash.end_date}.`,
      );
    }
    return pricing.createRate(req.params.id, rate);
  });
  res.status(201).json({ rate: created });
});

router.delete('/:id/rates/:rateId', ownRoom, async (req, res) => {
  const rate = await pricing.findRate(req.params.rateId);
  if (rate?.room_id !== req.params.id) throw new HttpError(404, 'RATE_NOT_FOUND', 'Seasonal rate not found.');
  await pricing.removeRate(rate.id);
  res.status(204).end();
});

router.put('/:id/discount', ownRoom, async (req, res) => {
  res.json({ discount: await pricing.upsertDiscount(req.params.id, Discount.parse(req.body)) });
});

router.delete('/:id/discount', ownRoom, async (req, res) => {
  await pricing.removeDiscount(req.params.id);
  res.status(204).end();
});

export default router;
