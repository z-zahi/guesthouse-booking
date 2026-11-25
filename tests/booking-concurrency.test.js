import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const base = process.env.TEST_API_URL || 'http://localhost:3000';
const password = 'Demo12345';

async function request(path, { method = 'GET', body, token, status } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}/api${path}`, { method, headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (status) assert.equal(res.status, status, JSON.stringify(data));
  return { ...data, status: res.status };
}

test('simultaneous confirmations and date blocks preserve room availability', async () => {
  const staff = await request('/sessions', {
    method: 'POST',
    body: { email: 'staff@nileview.test', password },
    status: 200,
  });
  const guests = await Promise.all(
    [1, 2].map(() =>
      request('/users', {
        method: 'POST',
        body: { name: 'Concurrency Guest', email: `${randomUUID()}@example.test`, password },
        status: 201,
      }),
    ),
  );
  const { room } = await request('/rooms', {
    method: 'POST',
    token: staff.token,
    body: { name: 'Concurrency Test Room', type: 'Double', capacity: 2, base_price: 500 },
    status: 201,
  });
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const stays = await Promise.all(
    guests.map((guest) =>
      request('/bookings', {
        method: 'POST',
        token: guest.token,
        body: { room_id: room.id, check_in: day(20), check_out: day(22), guests: 1 },
        status: 201,
      }),
    ),
  );
  const outcomes = await Promise.all(
    stays.map(({ booking }) =>
      request(`/bookings/${booking.id}/status`, {
        method: 'PATCH',
        token: staff.token,
        body: { status: 'Confirmed' },
      }),
    ),
  );
  assert.deepEqual(outcomes.map((result) => result.status).sort(), [200, 409]);

  const { booking } = await request('/bookings', {
    method: 'POST',
    token: guests[0].token,
    body: { room_id: room.id, check_in: day(25), check_out: day(27), guests: 1 },
    status: 201,
  });
  const [confirmation, block] = await Promise.all([
    request(`/bookings/${booking.id}/status`, { method: 'PATCH', token: staff.token, body: { status: 'Confirmed' } }),
    request('/blocks', {
      method: 'POST',
      token: staff.token,
      body: { room_id: room.id, start_date: day(25), end_date: day(26), reason: 'Test maintenance' },
    }),
  ]);
  assert.ok(
    (confirmation.status === 200 && block.status === 409) || (confirmation.status === 409 && block.status === 201),
  );
});

test('malformed and out-of-range stay dates return a validation error', async () => {
  for (const date of ['2026-13-01', '2026-02-30', '0000-01-01']) {
    await request(`/rooms?from=${date}&to=2027-01-01`, { status: 400 });
  }
  await request('/rooms/1/quote?from=2026-01-01&to=9998-01-01', { status: 400 });
});
