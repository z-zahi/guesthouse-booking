import { query } from './db.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const MESSAGES = {
  confirmed: (b) => [
    `Your stay at ${b.guesthouse_name} is confirmed`,
    `Good news, your stay in <b>${esc(b.room_name)}</b> from ${b.check_in} to ${b.check_out} is confirmed.
     The total is ${b.total_price} EGP, paid at the guesthouse on arrival.`,
  ],
  rejected: (b) => [
    `Your request at ${b.guesthouse_name} was not accepted`,
    `Sorry, your request for <b>${esc(b.room_name)}</b> from ${b.check_in} to ${b.check_out} was not accepted.
     Reason given by the guesthouse, ${esc(b.reject_reason)}.`,
  ],
  cancelled: (b) => [
    `Your booking at ${b.guesthouse_name} was cancelled`,
    `Your booking for <b>${esc(b.room_name)}</b> from ${b.check_in} to ${b.check_out} has been cancelled.`,
  ],
};

async function record(bookingId, type, status, resendId = null, error = null) {
  await query('INSERT INTO notifications (booking_id, type, resend_id, status, error) VALUES ($1, $2, $3, $4, $5)', [
    bookingId,
    type,
    resendId,
    status,
    error,
  ]);
  console.log(JSON.stringify({ event: 'email', booking: bookingId, type, status, error }));
  return status;
}

export async function notifyGuest(booking, type) {
  if (!process.env.RESEND_API_KEY) return record(booking.id, type, 'skipped', null, 'RESEND_API_KEY is not set');
  const [subject, body] = MESSAGES[type](booking);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'Guesthouse Booking <onboarding@resend.dev>',
        to: [booking.guest_email],
        subject,
        html: `<p>Hello ${esc(booking.guest_name)},</p><p>${body}</p><p>Guesthouse Room Booking</p>`,
      }),
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return record(booking.id, type, 'failed', null, data.message || `Resend returned ${res.status}`);
    return record(booking.id, type, 'sent', data.id);
  } catch (error) {
    return record(booking.id, type, 'failed', null, error.message);
  }
}
