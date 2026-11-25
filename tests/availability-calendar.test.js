import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { Duplex } from 'node:stream';
import { after, before, beforeEach, describe, test } from 'node:test';

const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const pg = requireBackend('pg');
const bcrypt = requireBackend('bcryptjs');

process.env.VERCEL = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

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
      { id: 1, guesthouse_id: 1, name: 'Room 1', type: 'Double', capacity: 2, base_price: 1200, is_active: true },
      { id: 2, guesthouse_id: 1, name: 'Room 2', type: 'Twin', capacity: 2, base_price: 950, is_active: true },
      { id: 3, guesthouse_id: 2, name: 'Palm Hut', type: 'Double', capacity: 2, base_price: 800, is_active: true },
    ],
    bookings: [],
    date_blocks: [],
    holidays: [],
    nextBlockId: 1,
  };

  function resetData() {
    const hash = bcrypt.hashSync('Demo12345', 4);
    state.users = [
      { id: 1, name: 'Mona Staff', email: 'staff@nileview.test', password_hash: hash, role: 'staff', guesthouse_id: 1 },
      { id: 2, name: 'Karim Staff', email: 'staff@siwa.test', password_hash: hash, role: 'staff', guesthouse_id: 2 },
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
        name: 'Platform Admin',
        email: 'admin@guesthouse.test',
        password_hash: hash,
        role: 'admin',
        guesthouse_id: null,
      },
    ];
    state.bookings = [];
    state.date_blocks = [];
    state.holidays = [];
    state.nextBlockId = 1;
  }

  function runQuery(sql, params = []) {
    const text = sql.replace(/\s+/g, ' ').trim();

    if (text === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
    if (text.startsWith('SELECT id FROM rooms WHERE id = $1 FOR UPDATE')) {
      const room = state.rooms.find((r) => r.id === params[0]);
      return { rows: room ? [{ id: room.id }] : [] };
    }
    if (text.startsWith('SELECT * FROM users WHERE email = $1')) {
      const user = state.users.find((u) => u.email === params[0]);
      return { rows: user ? [user] : [] };
    }
    if (text.startsWith('SELECT * FROM guesthouses WHERE id = $1')) {
      const gh = state.guesthouses.find((g) => g.id === params[0]);
      return { rows: gh ? [gh] : [] };
    }
    if (text.startsWith('SELECT r.*, g.name AS guesthouse_name, g.city FROM rooms r')) {
      const room = state.rooms.find((r) => r.id === params[0]);
      if (!room) return { rows: [] };
      const gh = state.guesthouses.find((g) => g.id === room.guesthouse_id);
      return { rows: [{ ...room, guesthouse_name: gh.name, city: gh.city }] };
    }
    if (text.startsWith('SELECT id FROM rooms WHERE guesthouse_id = $1 AND is_active')) {
      return {
        rows: state.rooms.filter((r) => r.guesthouse_id === params[0] && r.is_active).map((r) => ({ id: r.id })),
      };
    }
    if (text.startsWith('SELECT id, name, is_active FROM rooms WHERE guesthouse_id = $1')) {
      return {
        rows: state.rooms
          .filter((r) => r.guesthouse_id === params[0])
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((r) => ({ id: r.id, name: r.name, is_active: r.is_active })),
      };
    }
    if (text.startsWith("SELECT 'booking' AS type")) {
      const [roomIds, from, to] = params;
      return {
        rows: state.bookings
          .filter(
            (b) => roomIds.includes(b.room_id) && b.status === 'Confirmed' && b.check_in < to && b.check_out > from,
          )
          .map((b) => ({
            type: 'booking',
            id: b.id,
            room_id: b.room_id,
            start_date: b.check_in,
            end_date: b.check_out,
          })),
      };
    }
    if (text.startsWith("SELECT 'block' AS type")) {
      const [roomIds, from, to] = params;
      return {
        rows: state.date_blocks
          .filter((d) => roomIds.includes(d.room_id) && d.start_date < to && d.end_date >= from)
          .map((d) => ({
            type: 'block',
            id: d.id,
            room_id: d.room_id,
            start_date: d.start_date,
            end_date: d.end_date,
            reason: d.reason,
          })),
      };
    }
    if (text.startsWith('SELECT b.id, b.room_id, b.check_in, b.check_out, b.status, u.name AS guest_name')) {
      const [guesthouseId, start, end] = params;
      const roomIds = new Set(state.rooms.filter((r) => r.guesthouse_id === guesthouseId).map((r) => r.id));
      return {
        rows: state.bookings
          .filter(
            (b) =>
              roomIds.has(b.room_id) &&
              ['Pending', 'Confirmed'].includes(b.status) &&
              b.check_in < end &&
              b.check_out > start,
          )
          .map((b) => ({
            id: b.id,
            room_id: b.room_id,
            check_in: b.check_in,
            check_out: b.check_out,
            status: b.status,
            guest_name: state.users.find((u) => u.id === b.guest_id)?.name || 'Guest',
          })),
      };
    }
    if (text.startsWith('SELECT d.* FROM date_blocks d JOIN rooms r')) {
      const [guesthouseId, start, end] = params;
      const roomIds = new Set(state.rooms.filter((r) => r.guesthouse_id === guesthouseId).map((r) => r.id));
      return {
        rows: state.date_blocks.filter((d) => roomIds.has(d.room_id) && d.start_date < end && d.end_date >= start),
      };
    }
    if (text.startsWith('SELECT b.*, r.name AS room_name FROM date_blocks b')) {
      const [guesthouseId, from, roomId] = params;
      return {
        rows: state.date_blocks
          .filter((d) => {
            const room = state.rooms.find((r) => r.id === d.room_id);
            return room?.guesthouse_id === guesthouseId && d.end_date >= from && (!roomId || d.room_id === roomId);
          })
          .map((d) => ({ ...d, room_name: state.rooms.find((r) => r.id === d.room_id).name })),
      };
    }
    if (text.startsWith('SELECT * FROM date_blocks WHERE id = $1')) {
      const block = state.date_blocks.find((d) => d.id === params[0]);
      return { rows: block ? [block] : [] };
    }
    if (text.startsWith('INSERT INTO date_blocks')) {
      const [room_id, start_date, end_date, reason] = params;
      const block = { id: state.nextBlockId++, room_id, start_date, end_date, reason };
      state.date_blocks.push(block);
      return { rows: [block] };
    }
    if (text.startsWith('DELETE FROM date_blocks WHERE id = $1')) {
      state.date_blocks = state.date_blocks.filter((d) => d.id !== params[0]);
      return { rows: [] };
    }
    if (text.startsWith("SELECT 1 FROM holidays WHERE country_code = $1 AND to_char(date, 'YYYY') = $2")) {
      const [country, year] = params;
      const hit = state.holidays.find((h) => h.country_code === country && h.date.startsWith(year));
      return { rows: hit ? [{ '?column?': 1 }] : [] };
    }
    if (text.startsWith('INSERT INTO holidays')) {
      const [country, dates, names] = params;
      dates.forEach((date, i) => {
        if (!state.holidays.some((h) => h.date === date && h.country_code === country)) {
          state.holidays.push({ date, country_code: country, name: names[i] });
        }
      });
      return { rows: [] };
    }
    if (text.startsWith("SELECT date, name FROM holidays WHERE country_code = $1 AND to_char(date, 'YYYY-MM') = $2")) {
      const [country, month] = params;
      return {
        rows: state.holidays
          .filter((h) => h.country_code === country && h.date.startsWith(month))
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((h) => ({ date: h.date, name: h.name })),
      };
    }

    throw new Error(`Unhandled test SQL: ${text}`);
  }

  return { state, resetData, runQuery };
}

function futureDay(daysAhead) {
  return new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
}

describe('Availability & Calendar Service (Omar)', () => {
  const db = createFakeDatabase();
  const originalQuery = pg.Pool.prototype.query;
  const originalConnect = pg.Pool.prototype.connect;
  const originalFetch = globalThis.fetch;

  let app;

  async function loginAs(email) {
    const res = await callApp(app, '/sessions', {
      method: 'POST',
      body: { email, password: 'Demo12345' },
    });
    assert.equal(res.status, 200);
    return res.data.token;
  }

  before(async () => {
    pg.Pool.prototype.query = async (sql, params) => db.runQuery(sql, params);
    pg.Pool.prototype.connect = async () => ({
      query: async (sql, params) => db.runQuery(sql, params),
      release: () => {},
    });
    ({ default: app } = await import('../backend/server.js'));
  });

  beforeEach(() => {
    db.resetData();
    globalThis.fetch = originalFetch;
  });

  after(() => {
    pg.Pool.prototype.query = originalQuery;
    pg.Pool.prototype.connect = originalConnect;
    globalThis.fetch = originalFetch;
  });

  test('Availability checks handle free rooms, confirmed bookings, pending stays, blocks, and validation', async () => {
    const d10 = futureDay(10);
    const d12 = futureDay(12);
    const d11 = futureDay(11);
    const d14 = futureDay(14);
    const d20 = futureDay(20);
    const d22 = futureDay(22);

    // Available room
    const freeRes = await callApp(app, `/availability?room_id=1&from=${d10}&to=${d12}`);
    assert.equal(freeRes.status, 200);
    assert.equal(freeRes.data.available, true);

    // Pending booking should NOT block availability
    db.state.bookings.push({ id: 1, room_id: 1, guest_id: 3, check_in: d10, check_out: d12, status: 'Pending' });
    const pendingRes = await callApp(app, `/availability?room_id=1&from=${d10}&to=${d12}`);
    assert.equal(pendingRes.status, 200);
    assert.equal(pendingRes.data.available, true);

    // Confirmed booking blocks overlapping dates
    db.state.bookings.push({ id: 2, room_id: 1, guest_id: 3, check_in: d10, check_out: d12, status: 'Confirmed' });
    const overlapRes = await callApp(app, `/availability?room_id=1&from=${d11}&to=${d14}`);
    assert.equal(overlapRes.status, 200);
    assert.equal(overlapRes.data.available, false);
    assert.equal(overlapRes.data.conflicts[0].type, 'booking');

    // Blocked dates block availability
    db.state.date_blocks.push({ id: 1, room_id: 2, start_date: d20, end_date: d20, reason: 'Painting' });
    const blockedRes = await callApp(app, `/availability?room_id=2&from=${d20}&to=${d22}`);
    assert.equal(blockedRes.status, 200);
    assert.equal(blockedRes.data.available, false);
    assert.equal(blockedRes.data.conflicts[0].type, 'block');

    // Invalid date range & past dates & unknown room
    const invalidRange = await callApp(app, `/availability?room_id=1&from=${d12}&to=${d10}`);
    assert.equal(invalidRange.status, 400);

    const pastDate = await callApp(app, '/availability?room_id=1&from=2020-01-01&to=2020-01-03');
    assert.equal(pastDate.status, 400);

    const unknownRoom = await callApp(app, `/availability?room_id=999&from=${d10}&to=${d12}`);
    assert.equal(unknownRoom.status, 404);
  });

  test('Date blocking creates, validates conflicts, enforces authorization, and deletes blocks', async () => {
    const staffToken = await loginAs('staff@nileview.test');
    const otherStaffToken = await loginAs('staff@siwa.test');
    const guestToken = await loginAs('guest@guesthouse.test');

    const d15 = futureDay(15);
    const d16 = futureDay(16);
    const d30 = futureDay(30);
    const d32 = futureDay(32);

    // Valid block
    const created = await callApp(app, '/blocks', {
      method: 'POST',
      token: staffToken,
      body: { room_id: 1, start_date: d30, end_date: d32, reason: 'AC repair' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.block.reason, 'AC repair');

    // Invalid date range (start_date > end_date)
    const badDates = await callApp(app, '/blocks', {
      method: 'POST',
      token: staffToken,
      body: { room_id: 1, start_date: d32, end_date: d30, reason: 'Invalid' },
    });
    assert.equal(badDates.status, 400);

    // Conflict with confirmed booking
    db.state.bookings.push({
      id: 5,
      room_id: 2,
      guest_id: 3,
      check_in: d15,
      check_out: futureDay(17),
      status: 'Confirmed',
    });
    const clash = await callApp(app, '/blocks', {
      method: 'POST',
      token: staffToken,
      body: { room_id: 2, start_date: d16, end_date: d16, reason: 'Cleaning' },
    });
    assert.equal(clash.status, 409);
    assert.equal(clash.data.error.code, 'ROOM_UNAVAILABLE');

    // Unauthorized users (guest & staff of other guesthouse)
    const guestAttempt = await callApp(app, '/blocks', {
      method: 'POST',
      token: guestToken,
      body: { room_id: 1, start_date: d30, end_date: d30, reason: 'Nope' },
    });
    assert.equal(guestAttempt.status, 403);

    const crossGuesthouse = await callApp(app, '/blocks', {
      method: 'POST',
      token: otherStaffToken,
      body: { room_id: 1, start_date: d30, end_date: d30, reason: 'Wrong house' },
    });
    assert.equal(crossGuesthouse.status, 403);

    // Delete existing block
    const del = await callApp(app, `/blocks/${created.data.block.id}`, {
      method: 'DELETE',
      token: staffToken,
    });
    assert.equal(del.status, 204);
  });

  test('Calendar and Nager.Date holidays work, cache duplicate requests, and handle API failure gracefully', async () => {
    const staffToken = await loginAs('staff@nileview.test');
    const guestToken = await loginAs('guest@guesthouse.test');

    // Guest cannot access calendar
    const guestCal = await callApp(app, '/calendar?month=2027-01', { token: guestToken });
    assert.equal(guestCal.status, 403);

    // Confirmed booking + block in 2027-01
    db.state.bookings.push({
      id: 1,
      room_id: 1,
      guest_id: 3,
      check_in: '2027-01-10',
      check_out: '2027-01-13',
      status: 'Confirmed',
    });
    db.state.date_blocks.push({
      id: 1,
      room_id: 2,
      start_date: '2027-01-15',
      end_date: '2027-01-16',
      reason: 'Painting',
    });

    let nagerCalls = 0;
    globalThis.fetch = async (url) => {
      if (String(url).includes('date.nager.at')) {
        nagerCalls += 1;
        return new Response(JSON.stringify([{ date: '2027-01-07', name: 'Coptic Christmas' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url);
    };

    const cal1 = await callApp(app, '/calendar?month=2027-01', { token: staffToken });
    assert.equal(cal1.status, 200);
    assert.equal(cal1.data.holidays.length, 1);
    assert.equal(cal1.data.holidays[0].name, 'Coptic Christmas');
    assert.equal(nagerCalls, 1);

    // Second request in same year uses cached holidays without calling Nager.Date again
    const cal2 = await callApp(app, '/calendar?month=2027-02', { token: staffToken });
    assert.equal(cal2.status, 200);
    assert.equal(nagerCalls, 1);

    // Nager.Date unavailable for a different year -> calendar still returns 200 with holiday_warning
    globalThis.fetch = async () => {
      throw new Error('Network unreachable');
    };
    const calDown = await callApp(app, '/calendar?month=2028-03', { token: staffToken });
    assert.equal(calDown.status, 200);
    assert.deepEqual(calDown.data.holidays, []);
    assert.ok(calDown.data.holiday_warning);
  });

  test('Occupancy report calculates rates excluding blocked nights and handles zero available nights', async () => {
    const staffToken = await loginAs('staff@nileview.test');

    // Empty month (no bookings, all rooms available) -> 0%
    const emptyReport = await callApp(app, '/reports/occupancy?month=2027-02', { token: staffToken });
    assert.equal(emptyReport.status, 200);
    assert.equal(emptyReport.data.overall.occupancy_rate, 0);
    assert.equal(emptyReport.data.overall.total_rooms, 2);
    assert.equal(emptyReport.data.overall.occupied_rooms, 0);

    // Room 1: 28 days, 8 blocked -> 20 available, 10 booked -> 50%
    // Room 2: 28 days, all 28 blocked -> 0 available -> 0% (no division by zero)
    db.state.date_blocks.push({
      id: 1,
      room_id: 1,
      start_date: '2027-02-01',
      end_date: '2027-02-08',
      reason: 'Renovation',
    });
    db.state.date_blocks.push({
      id: 2,
      room_id: 2,
      start_date: '2027-02-01',
      end_date: '2027-02-28',
      reason: 'Closed',
    });
    db.state.bookings.push({
      id: 1,
      room_id: 1,
      guest_id: 3,
      check_in: '2027-02-10',
      check_out: '2027-02-20',
      status: 'Confirmed',
    });

    const report = await callApp(app, '/reports/occupancy?month=2027-02', { token: staffToken });
    assert.equal(report.status, 200);
    assert.equal(report.data.overall.available_nights, 20);
    assert.equal(report.data.overall.booked_nights, 10);
    assert.equal(report.data.overall.occupancy_rate, 50);
    assert.equal(report.data.overall.occupied_rooms, 1);
    assert.equal(report.data.overall.blocked_rooms, 2);
    assert.equal(report.data.overall.confirmed_bookings, 1);

    const room2 = report.data.rooms.find((r) => r.room_id === 2);
    assert.equal(room2.available_nights, 0);
    assert.equal(room2.occupancy_rate, 0);
  });

  test('Health endpoint returns app status, database connection status, and timestamp', async () => {
    const health = await callApp(app, '/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'ok');
    assert.equal(health.data.database, 'connected');
    assert.ok(health.data.timestamp);
  });
});
