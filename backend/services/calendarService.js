import { query } from './db.js';
import { nights } from './dates.js';

export async function monthData(guesthouseId, month) {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const [rooms, bookings, blocks] = await Promise.all([
    query('SELECT id, name, is_active FROM rooms WHERE guesthouse_id = $1 ORDER BY name', [guesthouseId]),
    query(
      `SELECT b.id, b.room_id, b.check_in, b.check_out, b.status, u.name AS guest_name
       FROM bookings b JOIN rooms r ON r.id = b.room_id JOIN users u ON u.id = b.guest_id
       WHERE r.guesthouse_id = $1 AND b.status IN ('Pending', 'Confirmed') AND b.check_in < $3 AND b.check_out > $2`,
      [guesthouseId, start, end],
    ),
    query(
      `SELECT d.* FROM date_blocks d JOIN rooms r ON r.id = d.room_id
       WHERE r.guesthouse_id = $1 AND d.start_date < $3 AND d.end_date >= $2`,
      [guesthouseId, start, end],
    ),
  ]);
  return { days: nights(start, end), rooms, bookings, blocks };
}

const stayOn = (b, roomId, date) => b.room_id === roomId && b.check_in <= date && b.check_out > date;
const blockOn = (b, roomId, date) => b.room_id === roomId && b.start_date <= date && b.end_date >= date;

export function buildGrid({ days, rooms, bookings, blocks }) {
  return rooms.map((room) => ({
    ...room,
    nights: days.map((date) => {
      const stays = bookings.filter((b) => stayOn(b, room.id, date));
      const confirmed = stays.find((b) => b.status === 'Confirmed');
      if (confirmed) return { date, status: 'confirmed', booking_id: confirmed.id, guest: confirmed.guest_name };
      const block = blocks.find((b) => blockOn(b, room.id, date));
      if (block) return { date, status: 'blocked', block_id: block.id, reason: block.reason };
      if (stays.length) return { date, status: 'pending', requests: stays.length };
      return { date, status: 'free' };
    }),
  }));
}

export function occupancyReport({ days, rooms, bookings, blocks }) {
  const rate = (booked, available) => (available ? Math.round((booked / available) * 1000) / 10 : 0);
  const perRoom = rooms.map((room) => {
    const blocked = days.filter((d) => blocks.some((b) => blockOn(b, room.id, d))).length;
    const booked = days.filter((d) => bookings.some((b) => b.status === 'Confirmed' && stayOn(b, room.id, d))).length;
    const available = days.length - blocked;
    return {
      room_id: room.id,
      room_name: room.name,
      nights_in_month: days.length,
      blocked_nights: blocked,
      available_nights: available,
      booked_nights: booked,
      occupancy_rate: rate(booked, available),
    };
  });
  const total = (k) => perRoom.reduce((s, r) => s + r[k], 0);
  return {
    rooms: perRoom,
    overall: {
      available_nights: total('available_nights'),
      booked_nights: total('booked_nights'),
      occupancy_rate: rate(total('booked_nights'), total('available_nights')),
    },
  };
}
