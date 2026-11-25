import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { Duplex } from 'node:stream';
import { after, before, beforeEach, describe, test } from 'node:test';

const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const pg = requireBackend('pg');
const bcrypt = requireBackend('bcryptjs');

// Keep server.js from calling app.listen(3000) when imported in tests.
process.env.VERCEL = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

// Invoke the Express app directly in memory without binding a TCP port.
function callApp(app, path, { method = 'GET', body, token } = {}) {
  return new Promise((resolve, reject) => {
    const rawBody = body !== undefined ? Buffer.from(JSON.stringify(body)) : null;
    const socket = new Duplex({
      read() {},
      write(_chunk, _encoding, cb) {
        cb();
      },
    });
    socket.remoteAddress = '127.0.0.1';

    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = `/api${path}`;
    req.headers = {
      host: 'localhost',
      'content-type': 'application/json',
    };
    if (token) req.headers.authorization = `Bearer ${token}`;
    if (rawBody) {
      req.headers['content-length'] = String(rawBody.length);
      req.push(rawBody);
    }
    req.push(null);

    const res = new ServerResponse(req);
    const chunks = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = (chunk, encoding, cb) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      return origWrite(chunk, encoding, cb);
    };
    res.end = (chunk, encoding, cb) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      const result = origEnd(chunk, encoding, cb);
      const text = Buffer.concat(chunks).toString('utf8');
      let parsed = {};
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { raw: text };
        }
      }
      resolve({ status: res.statusCode, data: parsed });
      return result;
    };

    res.on('error', reject);
    app(req, res, (err) => {
      if (err) reject(err);
    });
  });
}

function createFakeDatabase() {
  const state = {
    guesthouses: [
      { id: 1, name: 'Nile View Guesthouse', city: 'Luxor', contact_email: 'hello@nileview.test' },
      { id: 2, name: 'Siwa Oasis Lodge', city: 'Siwa', contact_email: 'stay@siwa.test' },
    ],
    users: [],
    rooms: [
      {
        id: 1,
        guesthouse_id: 1,
        name: 'Room 1, Nile Balcony',
        type: 'Double',
        capacity: 2,
        base_price: 1200,
        description: 'Double room with a balcony facing the Nile.',
        photo_urls: [],
        is_active: true,
      },
      {
        id: 2,
        guesthouse_id: 1,
        name: 'Room 2, Garden',
        type: 'Twin',
        capacity: 2,
        base_price: 950,
        description: 'Garden view room.',
        photo_urls: [],
        is_active: true,
      },
      {
        id: 3,
        guesthouse_id: 2,
        name: 'Palm Hut',
        type: 'Double',
        capacity: 2,
        base_price: 800,
        description: 'Siwa palm hut.',
        photo_urls: [],
        is_active: true,
      },
    ],
    seasonal_rates: [],
    stay_discounts: [{ id: 1, room_id: 1, min_nights: 7, percent: 10 }],
    date_blocks: [],
    bookings: [],
    notifications: [],
    nextBookingId: 1,
    nextUserId: 10,
    nextNotificationId: 1,
  };

  function seedUsers() {
    const hash = bcrypt.hashSync('Demo12345', 4);
    state.users = [
      {
        id: 1,
        name: 'Mona Hassan',
        email: 'staff@nileview.test',
        password_hash: hash,
        role: 'staff',
        guesthouse_id: 1,
      },
      { id: 2, name: 'Karim Adel', email: 'staff@siwa.test', password_hash: hash, role: 'staff', guesthouse_id: 2 },
      {
        id: 3,
        name: 'Sara Guest',
        email: 'guest@guesthouse.test',
        password_hash: hash,
        role: 'guest',
        guesthouse_id: null,
      },
      {
        id: 4,
        name: 'Omar Guest',
        email: 'guest2@guesthouse.test',
        password_hash: hash,
        role: 'guest',
        guesthouse_id: null,
      },
    ];
  }

  function joinBooking(b) {
    const room = state.rooms.find((r) => r.id === b.room_id);
    const gh = state.guesthouses.find((g) => g.id === room.guesthouse_id);
    const guest = state.users.find((u) => u.id === b.guest_id);
    return {
      ...b,
      room_name: room.name,
      guesthouse_id: room.guesthouse_id,
      guesthouse_name: gh.name,
      guest_name: guest.name,
      guest_email: guest.email,
    };
  }

  function runQuery(sql, params = []) {
    const text = sql.replace(/\s+/g, ' ').trim();

    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
      return { rows: [] };
    }
    if (text.startsWith('SELECT id FROM rooms WHERE id = $1 FOR UPDATE')) {
      const room = state.rooms.find((r) => r.id === params[0]);
      return { rows: room ? [{ id: room.id }] : [] };
    }
    if (text.startsWith('SELECT * FROM users WHERE email = $1')) {
      const user = state.users.find((u) => u.email === params[0]);
      return { rows: user ? [user] : [] };
    }
    if (text.startsWith('SELECT * FROM users WHERE id = $1')) {
      const user = state.users.find((u) => u.id === params[0]);
      return { rows: user ? [user] : [] };
    }
    if (text.startsWith('INSERT INTO users')) {
      const [name, email, password_hash, role, guesthouse_id] = params;
      const user = { id: state.nextUserId++, name, email, password_hash, role, guesthouse_id };
      state.users.push(user);
      return { rows: [user] };
    }
    if (text.startsWith('SELECT r.*, g.name AS guesthouse_name, g.city FROM rooms r')) {
      const room = state.rooms.find((r) => r.id === params[0]);
      if (!room) return { rows: [] };
      const gh = state.guesthouses.find((g) => g.id === room.guesthouse_id);
      return { rows: [{ ...room, guesthouse_name: gh.name, city: gh.city }] };
    }
    if (text.startsWith('SELECT * FROM seasonal_rates WHERE room_id = $1')) {
      return { rows: state.seasonal_rates.filter((r) => r.room_id === params[0]) };
    }
    if (text.startsWith('SELECT * FROM stay_discounts WHERE room_id = $1')) {
      return { rows: state.stay_discounts.filter((d) => d.room_id === params[0]) };
    }
    if (text.startsWith("SELECT 'booking' AS type")) {
      const [roomIds, from, to] = params;
      const rows = state.bookings
        .filter((b) => roomIds.includes(b.room_id) && b.status === 'Confirmed' && b.check_in < to && b.check_out > from)
        .map((b) => ({
          type: 'booking',
          id: b.id,
          room_id: b.room_id,
          start_date: b.check_in,
          end_date: b.check_out,
        }));
      return { rows };
    }
    if (text.startsWith("SELECT 'block' AS type")) {
      const [roomIds, from, to] = params;
      const rows = state.date_blocks
        .filter((d) => roomIds.includes(d.room_id) && d.start_date < to && d.end_date >= from)
        .map((d) => ({
          type: 'block',
          id: d.id,
          room_id: d.room_id,
          start_date: d.start_date,
          end_date: d.end_date,
        }));
      return { rows };
    }
    if (text.startsWith('SELECT 1 FROM bookings WHERE guest_id = $1')) {
      const [guestId, roomId, checkIn, checkOut] = params;
      const match = state.bookings.find(
        (b) =>
          b.guest_id === guestId &&
          b.room_id === roomId &&
          ['Pending', 'Confirmed'].includes(b.status) &&
          b.check_in < checkOut &&
          b.check_out > checkIn,
      );
      return { rows: match ? [{ '?column?': 1 }] : [] };
    }
    if (text.startsWith('INSERT INTO bookings')) {
      const [room_id, guest_id, check_in, check_out, guests, note, total_price] = params;
      const booking = {
        id: state.nextBookingId++,
        room_id,
        guest_id,
        check_in,
        check_out,
        guests,
        note,
        total_price,
        status: 'Pending',
        reject_reason: null,
      };
      state.bookings.push(booking);
      return { rows: [{ id: booking.id }] };
    }
    if (text.includes('FROM bookings b') && text.includes('WHERE b.id = $1')) {
      const booking = state.bookings.find((b) => b.id === params[0]);
      return { rows: booking ? [joinBooking(booking)] : [] };
    }
    if (text.includes('FROM bookings b') && text.includes('ORDER BY')) {
      let rows = state.bookings.map(joinBooking);
      const matchParam = (pattern) => {
        const match = text.match(pattern);
        return match ? params[Number(match[1]) - 1] : undefined;
      };
      const guestId = matchParam(/b\.guest_id = \$(\d+)/);
      const guesthouseId = matchParam(/r\.guesthouse_id = \$(\d+)/);
      const roomId = matchParam(/b\.room_id = \$(\d+)/);
      const status = matchParam(/b\.status = \$(\d+)/);
      const from = matchParam(/b\.check_out > \$(\d+)/);
      const to = matchParam(/b\.check_in < \$(\d+)/);
      const guestSearch = matchParam(/u\.name ILIKE \$(\d+)/);

      if (guestId !== undefined) rows = rows.filter((r) => r.guest_id === guestId);
      if (guesthouseId !== undefined) rows = rows.filter((r) => r.guesthouse_id === guesthouseId);
      if (roomId !== undefined) rows = rows.filter((r) => r.room_id === roomId);
      if (status !== undefined) rows = rows.filter((r) => r.status === status);
      if (from !== undefined) rows = rows.filter((r) => r.check_out > from);
      if (to !== undefined) rows = rows.filter((r) => r.check_in < to);
      if (guestSearch !== undefined) {
        const needle = guestSearch.replace(/^%|%$/g, '').toLowerCase();
        rows = rows.filter(
          (r) => r.guest_name.toLowerCase().includes(needle) || r.guest_email.toLowerCase().includes(needle),
        );
      }

      rows.sort((a, b) => {
        if ((a.status === 'Pending') !== (b.status === 'Pending')) return a.status === 'Pending' ? -1 : 1;
        if (a.check_in !== b.check_in) return b.check_in.localeCompare(a.check_in);
        return b.id - a.id;
      });
      return { rows };
    }
    if (text.startsWith('UPDATE bookings SET status = $3')) {
      const [id, fromStatuses, toStatus, reason] = params;
      const booking = state.bookings.find((b) => b.id === id && fromStatuses.includes(b.status));
      if (!booking) return { rows: [] };
      booking.status = toStatus;
      if (reason !== null && reason !== undefined) booking.reject_reason = reason;
      return { rows: [{ id: booking.id }] };
    }
    if (text.startsWith("SELECT id FROM notifications WHERE booking_id = $1 AND type = $2 AND status = 'sent'")) {
      const [bookingId, type] = params;
      const match = state.notifications.find(
        (n) => n.booking_id === bookingId && n.type === type && n.status === 'sent',
      );
      return { rows: match ? [{ id: match.id }] : [] };
    }
    if (text.startsWith('INSERT INTO notifications')) {
      const [booking_id, type, resend_id, status, error] = params;
      state.notifications.push({
        id: state.nextNotificationId++,
        booking_id,
        type,
        resend_id,
        status,
        error,
      });
      return { rows: [] };
    }

    throw new Error(`Unhandled test SQL: ${text}`);
  }

  return { state, seedUsers, runQuery };
}

function futureDay(daysAhead) {
  return new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
}

describe('Booking Service (Youssef)', () => {
  const db = createFakeDatabase();
  const originalQuery = pg.Pool.prototype.query;
  const originalConnect = pg.Pool.prototype.connect;
  const originalFetch = globalThis.fetch;

  let app;
  let notifyGuest;

  async function apiRequest(path, options) {
    return callApp(app, path, options);
  }

  async function loginAs(email) {
    const { status, data } = await apiRequest('/sessions', {
      method: 'POST',
      body: { email, password: 'Demo12345' },
    });
    assert.equal(status, 200);
    return data.token;
  }

  before(async () => {
    pg.Pool.prototype.query = async (sql, params) => db.runQuery(sql, params);
    pg.Pool.prototype.connect = async () => ({
      query: async (sql, params) => db.runQuery(sql, params),
      release: () => {},
    });

    ({ default: app } = await import('../backend/server.js'));
    ({ notifyGuest } = await import('../backend/services/emailService.js'));
  });

  beforeEach(() => {
    db.seedUsers();
    db.state.bookings = [];
    db.state.notifications = [];
    db.state.date_blocks = [];
    db.state.nextBookingId = 1;
    db.state.nextNotificationId = 1;
    delete process.env.RESEND_API_KEY;
    globalThis.fetch = originalFetch;
  });

  after(() => {
    pg.Pool.prototype.query = originalQuery;
    pg.Pool.prototype.connect = originalConnect;
    globalThis.fetch = originalFetch;
  });

  test('1-3. Guest creates, views, and cancels their own booking (with Resend skipped)', async () => {
    const guestToken = await loginAs('guest@guesthouse.test');

    // Scenario 1: Guest creates a booking request (2 nights * 1200 = 2400 EGP).
    const created = await apiRequest('/bookings', {
      method: 'POST',
      token: guestToken,
      body: {
        room_id: 1,
        check_in: futureDay(10),
        check_out: futureDay(12),
        guests: 2,
        note: 'Late arrival',
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.booking.status, 'Pending');
    assert.equal(created.data.booking.total_price, 2400);

    // Scenario 2: Guest views their bookings.
    const mine = await apiRequest('/bookings', { token: guestToken });
    assert.equal(mine.status, 200);
    assert.equal(mine.data.bookings.length, 1);
    assert.equal(mine.data.bookings[0].id, created.data.booking.id);

    // Scenario 3 & 10: Guest cancels their own booking when RESEND_API_KEY is not configured.
    const cancelled = await apiRequest(`/bookings/${created.data.booking.id}/status`, {
      method: 'PATCH',
      token: guestToken,
      body: { status: 'Cancelled' },
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.booking.status, 'Cancelled');
    assert.equal(cancelled.data.email, 'skipped');
    assert.equal(db.state.notifications[0].status, 'skipped');
  });

  test('4-7. Staff views, searches, confirms, and rejects booking requests', async () => {
    const guest1Token = await loginAs('guest@guesthouse.test');
    const guest2Token = await loginAs('guest2@guesthouse.test');
    const staffToken = await loginAs('staff@nileview.test');

    const b1 = await apiRequest('/bookings', {
      method: 'POST',
      token: guest1Token,
      body: { room_id: 1, check_in: futureDay(15), check_out: futureDay(17), guests: 2 },
    });
    const b2 = await apiRequest('/bookings', {
      method: 'POST',
      token: guest2Token,
      body: { room_id: 2, check_in: futureDay(20), check_out: futureDay(22), guests: 1 },
    });
    // Booking at another guesthouse (Siwa) must NOT appear for Nile View staff.
    await apiRequest('/bookings', {
      method: 'POST',
      token: guest1Token,
      body: { room_id: 3, check_in: futureDay(25), check_out: futureDay(27), guests: 1 },
    });

    // Scenario 4: Staff views their guesthouse's booking requests.
    const allNileView = await apiRequest('/bookings', { token: staffToken });
    assert.equal(allNileView.status, 200);
    assert.equal(allNileView.data.bookings.length, 2);

    // Scenario 5: Staff searches for a booking by guest name/email and room_id.
    const searchOmar = await apiRequest('/bookings?guest=omar', { token: staffToken });
    assert.equal(searchOmar.status, 200);
    assert.equal(searchOmar.data.bookings.length, 1);
    assert.equal(searchOmar.data.bookings[0].id, b2.data.booking.id);

    // Scenario 6: Staff confirms a booking.
    const confirmed = await apiRequest(`/bookings/${b1.data.booking.id}/status`, {
      method: 'PATCH',
      token: staffToken,
      body: { status: 'Confirmed' },
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.data.booking.status, 'Confirmed');

    // Scenario 7: Staff rejects a booking with a reason.
    const rejected = await apiRequest(`/bookings/${b2.data.booking.id}/status`, {
      method: 'PATCH',
      token: staffToken,
      body: { status: 'Rejected', reason: 'Room closed for maintenance.' },
    });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.data.booking.status, 'Rejected');
    assert.equal(rejected.data.booking.reject_reason, 'Room closed for maintenance.');
  });

  test('8. Unauthorized users cannot view or manage other bookings', async () => {
    const guest1Token = await loginAs('guest@guesthouse.test');
    const guest2Token = await loginAs('guest2@guesthouse.test');
    const otherStaffToken = await loginAs('staff@siwa.test');

    // Unauthenticated request fails with 401.
    const unauth = await apiRequest('/bookings');
    assert.equal(unauth.status, 401);

    const created = await apiRequest('/bookings', {
      method: 'POST',
      token: guest1Token,
      body: { room_id: 1, check_in: futureDay(30), check_out: futureDay(32), guests: 1 },
    });
    const bookingId = created.data.booking.id;

    // Guest cannot confirm or reject.
    const guestConfirm = await apiRequest(`/bookings/${bookingId}/status`, {
      method: 'PATCH',
      token: guest1Token,
      body: { status: 'Confirmed' },
    });
    assert.equal(guestConfirm.status, 403);

    // Another guest cannot view or cancel someone else's booking.
    const otherGuestView = await apiRequest(`/bookings/${bookingId}`, { token: guest2Token });
    assert.equal(otherGuestView.status, 403);

    const otherGuestCancel = await apiRequest(`/bookings/${bookingId}/status`, {
      method: 'PATCH',
      token: guest2Token,
      body: { status: 'Cancelled' },
    });
    assert.equal(otherGuestCancel.status, 403);

    // Staff of another guesthouse cannot confirm or reject.
    const otherStaffConfirm = await apiRequest(`/bookings/${bookingId}/status`, {
      method: 'PATCH',
      token: otherStaffToken,
      body: { status: 'Confirmed' },
    });
    assert.equal(otherStaffConfirm.status, 403);
  });

  test('9-10. Resend sends once per status change, handles failures safely, and skips duplicates', async () => {
    const guestToken = await loginAs('guest@guesthouse.test');
    const staffToken = await loginAs('staff@nileview.test');

    const created = await apiRequest('/bookings', {
      method: 'POST',
      token: guestToken,
      body: { room_id: 1, check_in: futureDay(40), check_out: futureDay(42), guests: 1 },
    });
    const bookingId = created.data.booking.id;

    process.env.RESEND_API_KEY = 're_test_dummy_key';
    process.env.MAIL_FROM = 'Nile View <bookings@example.test>';

    const sentEmails = [];
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith('https://api.resend.com/emails')) {
        sentEmails.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ id: 'email_123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url, init);
    };

    // Scenario 9: Email sent via Resend when configured.
    const confirmed = await apiRequest(`/bookings/${bookingId}/status`, {
      method: 'PATCH',
      token: staffToken,
      body: { status: 'Confirmed' },
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.data.email, 'sent');
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to[0], 'guest@guesthouse.test');

    // Duplicate notification guard: calling notifyGuest again for 'confirmed' does not send a second email.
    const duplicateResult = await notifyGuest(confirmed.data.booking, 'confirmed');
    assert.equal(duplicateResult, 'skipped');
    assert.equal(sentEmails.length, 1);

    // Email failure does not crash the booking cancellation.
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith('https://api.resend.com/emails')) {
        return new Response(JSON.stringify({ message: 'Resend rate limit' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url, init);
    };

    const cancelled = await apiRequest(`/bookings/${bookingId}/status`, {
      method: 'PATCH',
      token: guestToken,
      body: { status: 'Cancelled' },
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.booking.status, 'Cancelled');
    assert.equal(cancelled.data.email, 'failed');
  });

  test('Validation, duplicate requests, conflicts, and check-in rules are enforced', async () => {
    const reg = await apiRequest('/users', {
      method: 'POST',
      body: { name: 'New Guest', email: 'newguest@example.test', password: 'Password123' },
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.user.role, 'guest');

    const guest1Token = reg.data.token;
    const guest2Token = await loginAs('guest2@guesthouse.test');
    const staffToken = await loginAs('staff@nileview.test');

    // Long-stay discount applied through pricingService.quote (7 nights * 1200 * 0.9 = 7560).
    const b1 = await apiRequest('/bookings', {
      method: 'POST',
      token: guest1Token,
      body: { room_id: 1, check_in: futureDay(50), check_out: futureDay(57), guests: 2 },
    });
    assert.equal(b1.status, 201);
    assert.equal(b1.data.booking.total_price, 7560);

    // Same guest cannot submit an overlapping request on the same room.
    const dup = await apiRequest('/bookings', {
      method: 'POST',
      token: guest1Token,
      body: { room_id: 1, check_in: futureDay(52), check_out: futureDay(55), guests: 1 },
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.error.code, 'DUPLICATE_REQUEST');

    // Another guest can request overlapping dates while b1 is still Pending.
    const b2 = await apiRequest('/bookings', {
      method: 'POST',
      token: guest2Token,
      body: { room_id: 1, check_in: futureDay(52), check_out: futureDay(55), guests: 1 },
    });
    assert.equal(b2.status, 201);

    // Confirm b1 -> succeeds; confirming overlapping b2 -> 409 ROOM_UNAVAILABLE.
    const c1 = await apiRequest(`/bookings/${b1.data.booking.id}/status`, {
      method: 'PATCH',
      token: staffToken,
      body: { status: 'Confirmed' },
    });
    assert.equal(c1.status, 200);

    const c2 = await apiRequest(`/bookings/${b2.data.booking.id}/status`, {
      method: 'PATCH',
      token: staffToken,
      body: { status: 'Confirmed' },
    });
    assert.equal(c2.status, 409);
    assert.equal(c2.data.error.code, 'ROOM_UNAVAILABLE');

    // Rejecting without a reason fails validation.
    const badReject = await apiRequest(`/bookings/${b2.data.booking.id}/status`, {
      method: 'PATCH',
      token: staffToken,
      body: { status: 'Rejected' },
    });
    assert.equal(badReject.status, 400);
    assert.equal(badReject.data.error.code, 'VALIDATION_ERROR');

    // Cancelling on the check-in day itself fails with CHECK_IN_PASSED.
    const todayStay = await apiRequest('/bookings', {
      method: 'POST',
      token: guest2Token,
      body: { room_id: 2, check_in: futureDay(0), check_out: futureDay(1), guests: 1 },
    });
    assert.equal(todayStay.status, 201);
    const lateCancel = await apiRequest(`/bookings/${todayStay.data.booking.id}/status`, {
      method: 'PATCH',
      token: guest2Token,
      body: { status: 'Cancelled' },
    });
    assert.equal(lateCancel.status, 409);
    assert.equal(lateCancel.data.error.code, 'CHECK_IN_PASSED');

    // Staff filter by room_id and status.
    const filtered = await apiRequest('/bookings?status=Confirmed&room_id=1', { token: staffToken });
    assert.equal(filtered.status, 200);
    assert.equal(filtered.data.bookings.length, 1);
    assert.equal(filtered.data.bookings[0].id, b1.data.booking.id);
  });
});
