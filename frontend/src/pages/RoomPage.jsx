import { DateInput, NumberInput, Textarea } from '../fields.jsx';
import { useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { api, query, money, today } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Loading } from '../components.jsx';
import { useLoad, useAction, formData } from '../hooks.jsx';
import { RoomImage } from '../ui.jsx';
import { fmtRange, plural } from '../format.js';

export default function RoomPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const returnTo = location.state?.search ? `/?${location.state.search}` : '/';
  const { user } = useAuth();
  const { data, error, loading } = useLoad(`/api/rooms/${id}`);
  const stay = { from: params.get('from') || '', to: params.get('to') || '', guests: params.get('guests') || '1' };
  const quoting = useLoad(params.has('quote') ? `/api/rooms/${id}/quote${query(stay)}` : null);
  const quote = quoting.data;
  const [booked, setBooked] = useState(null);
  const booking = useAction();

  if (loading)
    return (
      <div className="page">
        <Loading />
      </div>
    );
  if (error || !data)
    return (
      <div className="page narrow">
        <Alert>{error}</Alert>
        <Link to={returnTo} className="back">
          ‹ Back to search
        </Link>
      </div>
    );
  const room = data.room;
  const photos = room.photo_urls.slice(0, 3);

  const getQuote = (e) => {
    e.preventDefault();
    const fields = formData(e);
    booking.clear();
    setBooked(null);
    if (query(fields) === query(stay) && params.has('quote')) quoting.reload();
    else setParams({ ...fields, quote: '1' }, { state: location.state });
  };

  const requestStay = (e) => {
    e.preventDefault();
    const { note } = formData(e);
    booking.run(async () => {
      const res = await api('/api/bookings', {
        method: 'POST',
        body: { room_id: room.id, check_in: stay.from, check_out: stay.to, guests: Number(stay.guests), note },
      });
      setBooked(res.booking);
    });
  };

  return (
    <div className="page">
      <Link to={returnTo} className="back">
        ‹ Search
      </Link>
      <header className="room-head">
        <h1>{room.name}</h1>
        <p className="room-meta">
          {room.guesthouse_name}, {room.city} · {room.type} · Sleeps {room.capacity}
        </p>
      </header>
      {!room.is_active && <Alert type="info">This room is deactivated and hidden from guests.</Alert>}

      {photos.length > 0 && (
        <div
          className={`gallery count-${photos.length}`}
          tabIndex={photos.length > 1 ? 0 : undefined}
          aria-label="Room photos"
          role="region"
        >
          {photos.map((url, index) => (
            <RoomImage key={url} room={room} url={url} priority={index === 0} />
          ))}
        </div>
      )}

      <div className="room-layout">
        <div className="room-content">
          <section>
            <h2>About this room</h2>
            <p className="room-description">{room.description || 'No description yet.'}</p>
          </section>

          <section>
            <h2>Prices</h2>
            <div className="list">
              <div className="list-row">
                <div className="grow">
                  <div className="title">Base price</div>
                  <div className="sub">Any night outside a season</div>
                </div>
                <div className="value">{money(room.base_price)}</div>
              </div>
              {room.rates.map((r) => (
                <div className="list-row" key={r.id}>
                  <div className="grow">
                    <div className="title">{fmtRange(r.start_date, r.end_date)}</div>
                    <div className="sub">Minimum stay {plural(r.min_nights, 'night')}</div>
                  </div>
                  <div className="value">{money(r.nightly_price)}</div>
                </div>
              ))}
            </div>
            {room.discount && (
              <p style={{ marginTop: 14 }}>
                <span className="tag">
                  {room.discount.percent}% off stays of {room.discount.min_nights} nights or more
                </span>
              </p>
            )}
          </section>
        </div>

        <aside className="panel booking-panel">
          <h2>Check your price</h2>
          <p className="hint">Paid at the guesthouse on arrival.</p>
          <form key={query(stay)} onSubmit={getQuote} className="stack" autoComplete="off">
            <div className="row">
              <DateInput label="Check-in" name="from" min={today()} defaultValue={stay.from} required />
              <DateInput label="Check-out" name="to" min={today()} defaultValue={stay.to} required />
            </div>
            <NumberInput label="Guests" name="guests" min={1} max={room.capacity} defaultValue={stay.guests} required />
            <button type="submit" className={quote ? 'secondary' : ''} disabled={quoting.loading}>
              {quoting.loading ? 'Checking Dates…' : quote ? 'Update Quote' : 'Check Price & Availability'}
            </button>
          </form>
          <Alert>{quoting.error}</Alert>

          {quote && !quoting.loading && !quoting.error && (
            <div className="quote">
              <p className="hint" role="status">
                {fmtRange(stay.from, stay.to)} · {plural(Number(stay.guests), 'guest')}
              </p>
              <div className="list">
                <div className="list-row">
                  <div className="grow">{plural(quote.nights, 'night')}</div>
                  <div className="value">{money(quote.subtotal)}</div>
                </div>
                {quote.discount_percent > 0 && (
                  <div className="list-row">
                    <div className="grow success-text">Long-stay discount {quote.discount_percent}%</div>
                    <div className="value success-text">−{money(quote.discount_amount)}</div>
                  </div>
                )}
                <div className="list-row total">
                  <div className="grow">Total</div>
                  <div className="value">{money(quote.total)}</div>
                </div>
              </div>

              {booked ? (
                <Alert type="success">
                  Booking request #{booked.id} sent for {fmtRange(booked.check_in, booked.check_out)} (
                  {money(booked.total_price)}). Status is Pending. <Link to="/bookings">See my bookings</Link>
                </Alert>
              ) : user?.role === 'guest' ? (
                <form onSubmit={requestStay} className="stack" autoComplete="off">
                  <Textarea
                    label="Note for the guesthouse (optional)"
                    name="note"
                    maxLength="500"
                    rows="2"
                    placeholder="Example: arriving after 8 pm…"
                  />
                  <button type="submit" className="large" disabled={booking.busy}>
                    {booking.busy ? 'Sending Request…' : 'Request This Stay'}
                  </button>
                </form>
              ) : user ? (
                <p className="note">Only guest accounts can request stays.</p>
              ) : (
                <p className="note">
                  <Link to="/login" state={{ from: location.pathname + location.search }}>
                    Log in
                  </Link>{' '}
                  or{' '}
                  <Link to="/register" state={{ from: location.pathname + location.search }}>
                    sign up
                  </Link>{' '}
                  to request this stay.
                </p>
              )}
              {booking.alert}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
