import { Router } from 'express';
import { z } from 'zod';
import { HttpError, date, futureDate, id, idParam, isStaffOf, month, ordered, requireRole } from '../http.js';
import { withRoomLock } from '../services/db.js';
import { addDays, today } from '../services/dates.js';
import * as availability from '../services/availabilityService.js';
import * as calendar from '../services/calendarService.js';
import * as guesthouses from '../services/guesthouseService.js';
import { holidaysForMonth } from '../services/holidayService.js';
import * as rooms from '../services/roomService.js';

const router = Router();
router.param('id', idParam);

const Check = z
  .object({ from: futureDate, to: date, room_id: id.optional(), guesthouse_id: id.optional() })
  .refine((q) => q.room_id || q.guesthouse_id, { path: ['room_id'], message: 'room_id or guesthouse_id is required' })
  .refine(...ordered('from', 'to'));
const BlockFilters = z.object({ room_id: id.optional(), from: date.optional() });
const NewBlock = z
  .object({
    room_id: id,
    start_date: futureDate,
    end_date: date,
    reason: z.string().trim().max(200).default(''),
  })
  .refine(...ordered('start_date', 'end_date', true));
const Month = z.object({ month, guesthouse_id: id.optional() });

const staff = requireRole('staff');
const staffOrAdmin = requireRole('staff', 'admin');

async function ownRoom(user, roomId) {
  const room = await rooms.findById(roomId);
  if (!room) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
  if (!isStaffOf(user, room.guesthouse_id))
    throw new HttpError(403, 'FORBIDDEN', 'This room belongs to another guesthouse.');
}

function monthQuery(req) {
  const q = Month.parse(req.query);
  if (req.user.role === 'admin') {
    if (!q.guesthouse_id) throw new HttpError(400, 'VALIDATION_ERROR', 'guesthouse_id is required for administrators.');
    return q;
  }
  if (q.guesthouse_id && q.guesthouse_id !== req.user.guesthouseId)
    throw new HttpError(403, 'FORBIDDEN', 'This is another guesthouse.');
  return { month: q.month, guesthouse_id: req.user.guesthouseId };
}

router.get('/availability', async (req, res) => {
  const { from, to, room_id, guesthouse_id } = Check.parse(req.query);
  if (room_id) {
    const [room, conflicts] = await Promise.all([
      rooms.findById(room_id),
      availability.conflictsFor([room_id], from, to),
    ]);
    if (!room) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Room not found.');
    return res.json({ room_id, from, to, available: !conflicts.length, conflicts });
  }
  if (!(await guesthouses.findById(guesthouse_id)))
    throw new HttpError(404, 'GUESTHOUSE_NOT_FOUND', 'Guesthouse not found.');
  res.json({ from, to, free_room_ids: await availability.freeRoomIds(await rooms.activeIds(guesthouse_id), from, to) });
});

router.get('/blocks', staff, async (req, res) => {
  const { room_id, from = today() } = BlockFilters.parse(req.query);
  res.json({ blocks: await availability.listBlocks(req.user.guesthouseId, from, room_id) });
});

router.post('/blocks', staff, async (req, res) => {
  const block = NewBlock.parse(req.body);
  await ownRoom(req.user, block.room_id);
  const created = await withRoomLock(block.room_id, async () => {
    // bn3mel check 3ala el confirmed bookings 3ashan man7salsh double booking
    const clashes = await availability.conflictsFor([block.room_id], block.start_date, addDays(block.end_date, 1));
    const stay = clashes.find((c) => c.type === 'booking');
    if (stay)
      throw new HttpError(
        409,
        'ROOM_UNAVAILABLE',
        `A confirmed stay from ${stay.start_date} to ${stay.end_date} overlaps these dates.`,
      );
    const existing = clashes.find((c) => c.type === 'block');
    if (existing) {
      throw new HttpError(
        409,
        'BLOCK_OVERLAP',
        `These dates overlap an existing block from ${existing.start_date} to ${existing.end_date}.`,
      );
    }
    return availability.createBlock(block);
  });
  console.log(
    `[blocks] Created block #${created.id} for room ${block.room_id} (${block.start_date} to ${block.end_date})`,
  );
  res.status(201).json({ block: created });
});

router.delete('/blocks/:id', staff, async (req, res) => {
  const block = await availability.findBlock(req.params.id);
  if (!block) throw new HttpError(404, 'BLOCK_NOT_FOUND', 'Block not found.');
  await ownRoom(req.user, block.room_id);
  await availability.removeBlock(block.id);
  console.log(`[blocks] Deleted block #${block.id} for room ${block.room_id}`);
  res.status(204).end();
});

router.get('/calendar', staffOrAdmin, async (req, res) => {
  const { month: m, guesthouse_id } = monthQuery(req);
  const [data, { holidays, warning }] = await Promise.all([calendar.monthData(guesthouse_id, m), holidaysForMonth(m)]);
  res.json({
    guesthouse_id,
    month: m,
    days: data.days,
    holidays,
    holiday_warning: warning,
    rooms: calendar.buildGrid(data),
  });
});

router.get('/reports/occupancy', staffOrAdmin, async (req, res) => {
  const { month: m, guesthouse_id } = monthQuery(req);
  res.json({ guesthouse_id, month: m, ...calendar.occupancyReport(await calendar.monthData(guesthouse_id, m)) });
});

export default router;
