import { DateInput, NumberInput } from '../fields.jsx';
import { Input } from '@base-ui/react/input';
import { Button } from '@base-ui/react/button';
import { Link, useSearchParams } from 'react-router-dom';
import { query, money, today } from '../api.js';
import { Alert, Loading } from '../components.jsx';
import { useLoad, formData } from '../hooks.jsx';
import { Empty, Icon, RoomImage } from '../ui.jsx';
import { fmtRange, plural } from '../format.js';

const FIELDS = ['city', 'guests', 'from', 'to', 'max_price'];

export default function Search() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FIELDS.map((f) => [f, params.get(f) || '']));
  const { data, error, loading } = useLoad(`/api/rooms${query(filters)}`);

  const submit = (e) => {
    e.preventDefault();
    setParams(Object.fromEntries(Object.entries(formData(e)).filter(([, v]) => v)));
  };

  const stay = query({ from: filters.from, to: filters.to, guests: filters.guests });
  const dated = filters.from && filters.to;

  return (
    <div className="page search-page">
      <section className="hero">
        <h1>Find Your Stay</h1>
        <p className="lead">Browse guesthouses, check prices for your dates, and request a room.</p>
        <form key={params.toString()} className="searchbar" onSubmit={submit} role="search" autoComplete="off">
          <label className="label-city">
            Where
            <Input name="city" defaultValue={filters.city} placeholder="Try Luxor…" maxLength="80" />
          </label>
          <DateInput label="Check-in" name="from" min={today()} defaultValue={filters.from} />
          <DateInput label="Check-out" name="to" min={today()} defaultValue={filters.to} />
          <NumberInput
            className="label-small"
            label="Guests"
            name="guests"
            min={1}
            max={10}
            defaultValue={filters.guests}
          />
          <NumberInput
            className="label-small"
            label="Max per Night (EGP)"
            name="max_price"
            min={0.01}
            step={0.01}
            defaultValue={filters.max_price}
          />
          <Button type="submit" disabled={loading && Boolean(data)}>
            <Icon name="search" size={18} />
            {loading && data ? 'Searching…' : 'Search Rooms'}
          </Button>
        </form>
      </section>

      <Alert>{error}</Alert>
      {loading && <Loading />}
      {data && (
        <>
          <div className="results-head">
            <h2>{dated ? 'Available Rooms' : 'Rooms'}</h2>
            <p role="status">
              {plural(data.rooms.length, 'room')}
              {dated ? ` · ${fmtRange(filters.from, filters.to)}` : ''}
            </p>
          </div>
          {data.rooms.length ? (
            <div className="cards">
              {data.rooms.map((room, index) => (
                <Link
                  key={room.id}
                  to={`/rooms/${room.id}${stay}`}
                  state={{ search: params.toString() }}
                  className="room-card"
                >
                  <div className="media">
                    <RoomImage room={room} priority={index === 0} />
                  </div>
                  <div className="card-body">
                    <h3>{room.name}</h3>
                    <p className="meta">
                      {room.guesthouse_name}, {room.city}
                    </p>
                    <p className="meta">
                      {room.type} · sleeps {room.capacity}
                    </p>
                    <p className="price">
                      Base rate <strong>{money(room.base_price)}</strong> <span className="muted">/ night</span>
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Empty icon="search" title="No rooms match">
              Try other dates or fewer filters.
            </Empty>
          )}
        </>
      )}
    </div>
  );
}
