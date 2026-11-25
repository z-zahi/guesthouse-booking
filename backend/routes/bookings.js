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

const NewBookingSchema = z
  .object({
    room_id: id,
    check_in: futureDate,
    check_out: date,
    guests: z.int().min(1).max(10),
    note: z.string().trim().max(500).default(''),
  })
  .refine(...ordered('check_in', 'check_out'));

const BookingFiltersSchema = z
  .object({
    status: z.enum(['Pending', 'Confirmed', 'Rejected', 'Cancelled']).optional(),
    room_id: id.optional(),
    from: date.optional(),
    to: date.optional(),
    guest: z.string().trim().max(100).optional(),
  })
  .refine(...ordered('from', 'to'));

const StatusChangeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('Confirmed') }),
  z.object({ status: z.literal('Rejected'), reason: z.string().trim().min(3).max(500) }),
  z.object({ status: z.literal('Cancelled') }),
]);

const ALLOWED_TRANSITIONS = {
  Confirmed: ['Pending'],
  Rejected: ['Pending'],
  Cancelled: ['Pending', 'Confirmed'],
};

function isBookingGuest(user, booking) {
  return user?.role === 'guest' && booking.guest_id === user.id;
}

async function getBookingOrFail(bookingId) {
  const booking = await bookings.findById(bookingId);
  if (!booking) {
    throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
  }
  return booking;
}

function canChangeStatus(user, booking, newStatus) {
  const isStaff = isStaffOf(user, booking.guesthouse_id);
  if (newStatus === 'Cancelled') {
    return isStaff || isBookingGuest(user, booking);
  }
  // Only guesthouse staff can confirm or reject a booking request.
  return isStaff;
}

function validateStatusChange(booking, newStatus) {
  const allowedFrom = ALLOWED_TRANSITIONS[newStatus];
  if (!allowedFrom.includes(booking.status)) {
    throw new HttpError(409, 'INVALID_STATUS', `A ${booking.status} booking cannot become ${newStatus}.`);
  }

  const currentDate = today();
  if (newStatus === 'Confirmed' && booking.check_in < currentDate) {
    throw new HttpError(409, 'CHECK_IN_PASSED', 'The check-in date has already passed.');
  }
  if (newStatus === 'Cancelled' && booking.check_in <= currentDate) {
    throw new HttpError(409, 'CHECK_IN_PASSED', 'The check-in date has already passed.');
  }
}

// Guest creates a booking request; pricingService.quote validates dates, capacity, and availability.
router.post('/', requireRole('guest'), async (req, res) => {
  const stay = NewBookingSchema.parse(req.body);

  const result = await withRoomLock(stay.room_id, async () => {
    const quote = await pricing.quote(stay.room_id, stay.check_in, stay.check_out, stay.guests);
    const alreadyRequested = await bookings.guestHasOverlap(req.user.id, stay);
    if (alreadyRequested) {
      throw new HttpError(409, 'DUPLICATE_REQUEST', 'You already have a request for this room on these dates.');
    }
    const booking = await bookings.create(req.user.id, stay, quote.total);
    return { booking, quote };
  });

  res.status(201).json(result);
});

// Guests see only their own bookings; staff see bookings for their guesthouse.
router.get('/', requireRole(), async (req, res) => {
  const filters = BookingFiltersSchema.parse(req.query);
  const list = await bookings.list({
    ...filters,
    guestId: req.user.role === 'guest' ? req.user.id : null,
    guesthouseId: req.user.role === 'staff' ? req.user.guesthouseId : null,
  });
  res.json({ bookings: list });
});

router.get('/:id', requireRole(), async (req, res) => {
  const booking = await getBookingOrFail(req.params.id);
  const allowed =
    req.user.role === 'admin' || isBookingGuest(req.user, booking) || isStaffOf(req.user, booking.guesthouse_id);
  if (!allowed) {
    throw new HttpError(403, 'FORBIDDEN', 'You cannot view this booking.');
  }
  res.json({ booking });
});

// Staff confirm or reject requests; staff or the booking's guest can cancel.
router.patch('/:id/status', requireRole(), async (req, res) => {
  const { status, reason } = StatusChangeSchema.parse(req.body);
  const booking = await getBookingOrFail(req.params.id);

  if (!canChangeStatus(req.user, booking, status)) {
    throw new HttpError(403, 'FORBIDDEN', 'You cannot change this booking.');
  }
  validateStatusChange(booking, status);

  const allowedFrom = ALLOWED_TRANSITIONS[status];
  let updated;

  if (status === 'Confirmed') {
    updated = await withRoomLock(booking.room_id, async () => {
      const [room, conflicts] = await Promise.all([
        rooms.findById(booking.room_id),
        availability.conflictsFor([booking.room_id], booking.check_in, booking.check_out),
      ]);
      if (!room || !room.is_active) {
        throw new HttpError(409, 'ROOM_UNAVAILABLE', 'Activate the room before confirming this booking.');
      }
      if (conflicts.length > 0) {
        throw new HttpError(409, 'ROOM_UNAVAILABLE', 'These dates are no longer available.');
      }
      return bookings.moveStatus(booking.id, allowedFrom, status, reason);
    });
  } else {
    updated = await bookings.moveStatus(booking.id, allowedFrom, status, reason);
  }

  if (!updated) {
    throw new HttpError(409, 'BOOKING_CHANGED', 'This booking was changed by someone else, please reload.');
  }

  const email = await notifyGuest(updated, status.toLowerCase());
  res.json({ booking: updated, email });
});

export default router;
