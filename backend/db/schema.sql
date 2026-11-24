CREATE TABLE IF NOT EXISTS guesthouses (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  city          VARCHAR(80)  NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(10)  NOT NULL CHECK (role IN ('guest', 'staff', 'admin')),
  guesthouse_id INT REFERENCES guesthouses (id),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (role <> 'staff' OR guesthouse_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS rooms (
  id            SERIAL PRIMARY KEY,
  guesthouse_id INT           NOT NULL REFERENCES guesthouses (id),
  name          VARCHAR(100)  NOT NULL,
  type          VARCHAR(50)   NOT NULL,
  capacity      INT           NOT NULL CHECK (capacity BETWEEN 1 AND 10),
  base_price    NUMERIC(10,2) NOT NULL CHECK (base_price > 0),
  description   TEXT          NOT NULL DEFAULT '',
  photo_urls    TEXT[]        NOT NULL DEFAULT '{}',
  is_active     BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seasonal_rates (
  id            SERIAL PRIMARY KEY,
  room_id       INT           NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  start_date    DATE          NOT NULL,
  end_date      DATE          NOT NULL,
  nightly_price NUMERIC(10,2) NOT NULL CHECK (nightly_price > 0),
  min_nights    INT           NOT NULL DEFAULT 1 CHECK (min_nights BETWEEN 1 AND 30),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS stay_discounts (
  id         SERIAL PRIMARY KEY,
  room_id    INT NOT NULL UNIQUE REFERENCES rooms (id) ON DELETE CASCADE,
  min_nights INT NOT NULL CHECK (min_nights >= 2),
  percent    INT NOT NULL CHECK (percent BETWEEN 1 AND 50)
);

CREATE TABLE IF NOT EXISTS bookings (
  id            SERIAL PRIMARY KEY,
  room_id       INT           NOT NULL REFERENCES rooms (id),
  guest_id      INT           NOT NULL REFERENCES users (id),
  check_in      DATE          NOT NULL,
  check_out     DATE          NOT NULL,
  guests        INT           NOT NULL CHECK (guests >= 1),
  note          TEXT          NOT NULL DEFAULT '',
  total_price   NUMERIC(10,2) NOT NULL,
  status        VARCHAR(10)   NOT NULL DEFAULT 'Pending'
                CHECK (status IN ('Pending', 'Confirmed', 'Rejected', 'Cancelled')),
  reject_reason TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);
CREATE INDEX IF NOT EXISTS bookings_room_dates ON bookings (room_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS bookings_guest ON bookings (guest_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  booking_id INT         NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL,
  resend_id  TEXT,
  status     VARCHAR(10) NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error      TEXT,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS date_blocks (
  id         SERIAL PRIMARY KEY,
  room_id    INT          NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  start_date DATE         NOT NULL,
  end_date   DATE         NOT NULL,
  reason     VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS date_blocks_room_dates ON date_blocks (room_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS holidays (
  date         DATE         NOT NULL,
  country_code CHAR(2)      NOT NULL,
  name         VARCHAR(150) NOT NULL,
  PRIMARY KEY (date, country_code)
);
