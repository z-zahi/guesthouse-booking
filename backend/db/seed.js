import bcrypt from 'bcryptjs';

const DEMO_PASSWORD = 'Demo12345';

export async function seed(client) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await client.query('BEGIN');
  try {
    const gh = await client.query(
      `INSERT INTO guesthouses (name, city, contact_email) VALUES
         ('Nile View Guesthouse', 'Luxor', 'hello@nileview.test'),
         ('Siwa Oasis Lodge', 'Siwa', 'stay@siwa.test')
       RETURNING id`,
    );
    const [nile, siwa] = gh.rows.map((r) => r.id);

    await client.query(
      `INSERT INTO users (name, email, password_hash, role, guesthouse_id) VALUES
         ('Platform Admin', 'admin@guesthouse.test', $1, 'admin', NULL),
         ('Mona Hassan', 'staff@nileview.test', $1, 'staff', $2),
         ('Karim Adel', 'staff@siwa.test', $1, 'staff', $3),
         ('Sara Guest', 'guest@guesthouse.test', $1, 'guest', NULL)`,
      [hash, nile, siwa],
    );

    const rooms = await client.query(
      `INSERT INTO rooms (guesthouse_id, name, type, capacity, base_price, description) VALUES
         ($1, 'Room 1, Nile Balcony', 'Double', 2, 1200, 'Double room with a balcony facing the Nile.'),
         ($1, 'Room 2, Garden', 'Twin', 2, 950, 'Two single beds, opens onto the garden.'),
         ($1, 'Family Suite', 'Suite', 4, 2200, 'Two bedrooms and a lounge, ideal for families.'),
         ($2, 'Palm Hut', 'Double', 2, 800, 'Mud-brick hut among the palm trees.'),
         ($2, 'Desert Room', 'Triple', 3, 1100, 'Three beds and a terrace with desert views.')
       RETURNING id`,
      [nile, siwa],
    );
    const ids = rooms.rows.map((r) => r.id);
    const year = new Date().getUTCFullYear();

    for (const id of ids.slice(0, 3)) {
      await client.query(
        `INSERT INTO seasonal_rates (room_id, start_date, end_date, nightly_price, min_nights) VALUES
           ($1, $2, $3, (SELECT base_price * 1.4 FROM rooms WHERE id = $1), 2),
           ($1, $4, $5, (SELECT base_price * 0.8 FROM rooms WHERE id = $1), 1)`,
        [id, `${year}-12-15`, `${year + 1}-01-15`, `${year + 1}-06-01`, `${year + 1}-08-31`],
      );
      await client.query('INSERT INTO stay_discounts (room_id, min_nights, percent) VALUES ($1, 7, 10)', [id]);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
  await client.query('COMMIT');
}
