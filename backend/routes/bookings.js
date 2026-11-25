import { Router } from 'express';
import { z } from 'zod';
import { HttpError, date, futureDate, id, idParam, isStaffOf, ordered, requireRole } from '../http.js';
import { withRoomLock } from '../services/db.js';
import { today } from '../services/dates.js';
import * as availability from '../services/availabilityService.js';
import * as bookings from '../services/bookingService.js';
import { notifyGuest } from '../services/emailService.js';
import * as pricing from '../services/pricingService.js';
import * as rooms from '../services/roomService.js';

const router = Router();
router.param('id', idParam);

const NewBooking = z
  .object({
    room_id: id,
    check_in: futureDate,
    check_out: date,
    guests: z.int().min(1).max(10),
    note: z.string().trim().max(500).default(''),
  })
  .refine(...ordered('check_in', 'check_out'));
const Filters = z
  .object({
    status: z.enum(['Pending', 'Confirmed', 'Rejected', 'Cancelled']).optional(),
    room_id: id.optional(),
    from: date.optional(),
    to: date.optional(),
    guest: z.string().trim().max(100).optional(),
  })
  .refine(...ordered('from', 'to'));
const StatusChange = z.discriminatedUnion('status', [
  z.object({ status: z.literal('Confirmed') }),
  z.object({ status: z.literal('Rejected'), reason: z.string().trim().min(3).max(500) }),
  z.object({ status: z.literal('Cancelled') }),
]);

const ALLOWED_FROM = { Confirmed: ['Pending'], Rejected: ['Pending'], Cancelled: ['Pending', 'Confirmed'] };

const isGuestOf = (user, b) => user.role === 'guest' && b.guest_id === user.id;

async function findBooking(bookingId) {
  const booking = await bookings.findById(bookingId);
  if (!booking) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
  return booking;
}

router.post('/', requireRole('guest'), async (req, res) => {
  const stay = NewBooking.parse(req.body);
  const result = await withRoomLock(stay.room_id, async () => {
    const quote = await pricing.quote(stay.room_id, stay.check_in, stay.check_out, stay.guests);
    if (await bookings.guestHasOverlap(req.user.id, stay)) {
      throw new HttpError(409, 'DUPLICATE_REQUEST', 'You already have a request for this room on these dates.');
    }
    return { booking: await bookings.create(req.user.id, stay, quote.total), quote };
  });
  res.status(201).json(result);
});

router.get('/', requireRole(), async (req, res) => {
  const filters = Filters.parse(req.query);
  res.json({
    bookings: await bookings.list({
      ...filters,
      guestId: req.user.role === 'guest' ? req.user.id : null,
      guesthouseId: req.user.role === 'staff' ? req.user.guesthouseId : null,
    }),
  });
});

router.get('/:id', requireRole(), async (req, res) => {
  const booking = await findBooking(req.params.id);
  if (req.user.role !== 'admin' && !isGuestOf(req.user, booking) && !isStaffOf(req.user, booking.guesthouse_id)) {
    throw new HttpError(403, 'FORBIDDEN', 'You cannot view this booking.');
  }
  res.json({ booking });
});

router.patch('/:id/status', requireRole(), async (req, res) => {
  const { status, reason } = StatusChange.parse(req.body);
  const booking = await findBooking(req.params.id);
  const staff = isStaffOf(req.user, booking.guesthouse_id);

  if (status === 'Cancelled' ? !staff && !isGuestOf(req.user, booking) : !staff) {
    throw new HttpError(403, 'FORBIDDEN', 'You cannot change this booking.');
  }
  if (!ALLOWED_FROM[status].includes(booking.status)) {
    throw new HttpError(409, 'INVALID_STATUS', `A ${booking.status} booking cannot become ${status}.`);
  }
  if (status === 'Confirmed' ? booking.check_in < today() : status === 'Cancelled' && booking.check_in <= today()) {
    throw new HttpError(409, 'CHECK_IN_PASSED', 'The check-in date has already passed.');
  }

  const move = async () => {
    const updated = await bookings.moveStatus(booking.id, ALLOWED_FROM[status], status, reason);
    if (!updated)
      throw new HttpError(409, 'BOOKING_CHANGED', 'This booking was changed by someone else, please reload.');
    return updated;
  };
  const updated =
    status !== 'Confirmed'
      ? await move()
      : await withRoomLock(booking.room_id, async () => {
          const [room, conflicts] = await Promise.all([
            rooms.findById(booking.room_id),
            availability.conflictsFor([booking.room_id], booking.check_in, booking.check_out),
          ]);
          if (!room.is_active)
            throw new HttpError(409, 'ROOM_UNAVAILABLE', 'Activate the room before confirming this booking.');
          if (conflicts.length) throw new HttpError(409, 'ROOM_UNAVAILABLE', 'These dates are no longer available.');
          return move();
        });

  res.json({ booking: updated, email: await notifyGuest(updated, status.toLowerCase()) });
});

export default router;
