import { query, queryOne } from './db.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function buildEmailContent(booking, type) {
  const room = escapeHtml(booking.room_name);
  const guesthouse = escapeHtml(booking.guesthouse_name);
  const guest = escapeHtml(booking.guest_name);

  let subject = '';
  let body = '';

  if (type === 'confirmed') {
    subject = `Your stay at ${booking.guesthouse_name} is confirmed`;
    body = `Good news, your stay in <b>${room}</b> at ${guesthouse} from ${booking.check_in} to ${booking.check_out} is confirmed. The total is ${booking.total_price} EGP, paid at the guesthouse on arrival.`;
  } else if (type === 'rejected') {
    const reason = escapeHtml(booking.reject_reason || 'No reason provided');
    subject = `Your request at ${booking.guesthouse_name} was not accepted`;
    body = `Sorry, your request for <b>${room}</b> at ${guesthouse} from ${booking.check_in} to ${booking.check_out} was not accepted. Reason given by the guesthouse: ${reason}.`;
  } else if (type === 'cancelled') {
    subject = `Your booking at ${booking.guesthouse_name} was cancelled`;
    body = `Your booking for <b>${room}</b> at ${guesthouse} from ${booking.check_in} to ${booking.check_out} has been cancelled.`;
  } else {
    throw new Error(`Unsupported email notification type: ${type}`);
  }

  return {
    subject,
    html: `<p>Hello ${guest},</p><p>${body}</p><p>Guesthouse Room Booking</p>`,
  };
}

async function recordNotification(bookingId, type, status, resendId = null, error = null) {
  try {
    await query('INSERT INTO notifications (booking_id, type, resend_id, status, error) VALUES ($1, $2, $3, $4, $5)', [
      bookingId,
      type,
      resendId,
      status,
      error,
    ]);
  } catch (dbErr) {
    // Email logging should never break a completed booking status change.
    console.error(`[email] Could not save notification log for booking #${bookingId}: ${dbErr.message}`);
  }
  return status;
}

export async function notifyGuest(booking, type) {
  // Guard against sending a duplicate email for the same status change.
  try {
    const alreadySent = await queryOne(
      "SELECT id FROM notifications WHERE booking_id = $1 AND type = $2 AND status = 'sent' LIMIT 1",
      [booking.id, type],
    );
    if (alreadySent) {
      console.log(`[email] Skipping duplicate ${type} email for booking #${booking.id}.`);
      return 'skipped';
    }
  } catch (dbErr) {
    console.error(`[email] Could not check notification history for booking #${booking.id}: ${dbErr.message}`);
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY is not configured. Skipping ${type} email for booking #${booking.id}.`);
    return recordNotification(booking.id, type, 'skipped', null, 'RESEND_API_KEY is not set');
  }

  if (!booking.guest_email) {
    console.warn(`[email] Guest email missing for booking #${booking.id}. Skipping ${type} email.`);
    return recordNotification(booking.id, type, 'skipped', null, 'Guest email is missing');
  }

  const from = process.env.MAIL_FROM?.trim() || 'Guesthouse Booking <onboarding@resend.dev>';
  const { subject, html } = buildEmailContent(booking, type);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [booking.guest_email],
        subject,
        html,
      }),
      signal: AbortSignal.timeout(6000),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = data.message || `Resend returned status ${response.status}`;
      console.error(`[email] Failed to send ${type} email for booking #${booking.id}: ${reason}`);
      return recordNotification(booking.id, type, 'failed', null, reason);
    }

    console.log(`[email] Sent ${type} email for booking #${booking.id} (Resend ID: ${data.id || 'n/a'}).`);
    return recordNotification(booking.id, type, 'sent', data.id || null);
  } catch (err) {
    console.error(`[email] Error sending ${type} email for booking #${booking.id}: ${err.message}`);
    return recordNotification(booking.id, type, 'failed', null, err.message);
  }
}
