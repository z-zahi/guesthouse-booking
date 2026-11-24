import { useState } from 'react';
import { DateInput, NumberInput, Textarea } from '../../fields.jsx';
import { Input } from '@base-ui/react/input';
import { Link, useParams } from 'react-router-dom';
import { api, money, photoUrl, today } from '../../api.js';
import { Alert, Loading } from '../../components.jsx';
import { useLoad, useAction, formData } from '../../hooks.jsx';
import { ConfirmButton, Icon } from '../../ui.jsx';
import { fmtRange, plural } from '../../format.js';
import '../../staff.css';

const MAX_PHOTO = 2 * 1024 * 1024;

export default function ManageRoom() {
  const { id } = useParams();
  const { data, error, loading, reload } = useLoad(`/api/rooms/${id}`);
  const details = useAction();
  const photos = useAction();
  const [rateForm, setRateForm] = useState(0);
  const rates = useAction();
  const discount = useAction();
  const status = useAction();

  if (!data) {
    return (
      <div className="page narrow">
        {loading ? <Loading /> : <Alert>{error}</Alert>}
        <Link to="/staff/rooms" className="back">
          ‹ Rooms
        </Link>
      </div>
    );
  }
  const room = data.room;
  const base = `/api/rooms/${room.id}`;

  const saveDetails = (e) => {
    e.preventDefault();
    const f = formData(e);
    details
      .run(
        () =>
          api(base, { method: 'PUT', body: { ...f, capacity: Number(f.capacity), base_price: Number(f.base_price) } }),
        'Room details saved.',
      )
      .then((r) => r && reload());
  };

  const upload = async (e) => {
    const input = e.target;
    const file = input.files[0];
    if (!file) return;
    const res = await photos.run(() => {
      if (file.size > MAX_PHOTO) throw new Error('Photos must be 2 MB or smaller');
      return api(`${base}/photos`, { method: 'POST', file });
    }, 'Photo uploaded.');
    input.value = '';
    if (res) reload();
  };

  const removePhoto = (url) => {
    photos
      .run(() => api(`${base}/photos`, { method: 'DELETE', body: { url } }), 'Photo removed.')
      .then((r) => r && reload());
  };

  const addRate = (e) => {
    e.preventDefault();
    const f = formData(e);
    rates
      .run(
        () =>
          api(`${base}/rates`, {
            method: 'POST',
            body: { ...f, nightly_price: Number(f.nightly_price), min_nights: Number(f.min_nights) },
          }),
        'Season added.',
      )
      .then((r) => {
        if (r) {
          setRateForm((version) => version + 1);
          reload();
        }
      });
  };

  const deleteRate = (rate) => {
    rates.run(() => api(`${base}/rates/${rate.id}`, { method: 'DELETE' }), 'Season deleted.').then(() => reload());
  };

  const saveDiscount = (e) => {
    e.preventDefault();
    const f = formData(e);
    discount
      .run(
        () =>
          api(`${base}/discount`, {
            method: 'PUT',
            body: { min_nights: Number(f.min_nights), percent: Number(f.percent) },
          }),
        'Long-stay discount saved.',
      )
      .then((r) => r && reload());
  };

  const removeDiscount = () => {
    discount
      .run(() => api(`${base}/discount`, { method: 'DELETE' }), 'Long-stay discount removed.')
      .then(() => reload());
  };

  const toggleActive = () => {
    status
      .run(
        () => api(`${base}/status`, { method: 'PATCH', body: { status: room.is_active ? 'Inactive' : 'Active' } }),
        room.is_active ? 'Room deactivated, guests no longer see it.' : 'Room activated, guests can find it again.',
      )
      .then((r) => r && reload());
  };

  return (
    <div className="page">
      <Link to="/staff/rooms" className="back">
        ‹ Rooms
      </Link>
      <header className="page-head">
        <div>
          <h1>{room.name}</h1>
          <p className="room-meta">
            <span>
              {room.guesthouse_name}, {room.city}
            </span>
            <span className={`badge ${room.is_active ? 'badge-active' : 'badge-inactive'}`}>
              {room.is_active ? 'Active' : 'Inactive'}
            </span>
          </p>
        </div>
        {room.is_active && (
          <div className="page-head-actions">
            <Link to={`/rooms/${room.id}`} className="button secondary">
              View as guest
            </Link>
          </div>
        )}
      </header>

      <div className="manage-grid">
        <div className="manage-col">
          <section className="panel">
            <h2 className="section-title">Details</h2>
            <form className="stack" autoComplete="off" onSubmit={saveDetails}>
              <label>
                Name
                <Input name="name" defaultValue={room.name} minLength="2" maxLength="100" required />
              </label>
              <div className="row">
                <label>
                  Type
                  <Input name="type" defaultValue={room.type} minLength="2" maxLength="50" required />
                </label>
                <NumberInput label="Sleeps" name="capacity" min={1} max={10} defaultValue={room.capacity} required />
              </div>
              <NumberInput
                label="Base price per night (EGP)"
                name="base_price"
                min={1}
                step={0.01}
                defaultValue={room.base_price}
                required
              />
              <Textarea
                label="Description"
                name="description"
                rows="4"
                maxLength="2000"
                defaultValue={room.description}
              />
              {details.alert}
              <div className="actions">
                <button type="submit" disabled={details.busy}>
                  Save details
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <h2 className="section-title">Photos</h2>
            <p className="hint">JPEG or PNG, up to 2 MB. The first photo is the cover.</p>
            {room.photo_urls.length > 0 && (
              <div className="photo-grid">
                {room.photo_urls.map((url) => (
                  <figure key={url}>
                    <img src={photoUrl(url)} alt={room.name} width="400" height="300" loading="lazy" />
                    <ConfirmButton
                      className="remove"
                      disabled={photos.busy}
                      title="Remove Photo"
                      confirmLabel="Remove Photo"
                      description="The photo will disappear from this room’s listing."
                      onConfirm={() => removePhoto(url)}
                    >
                      ×
                    </ConfirmButton>
                  </figure>
                ))}
              </div>
            )}
            <label className="file-button">
              <Icon name="photo" size={18} />
              Add photo
              <Input type="file" name="photo" accept="image/jpeg,image/png" onChange={upload} disabled={photos.busy} />
            </label>
            {photos.alert}
          </section>

          <section className="panel">
            <h2 className="section-title">Availability to guests</h2>
            <p className="hint">
              {room.is_active
                ? 'Deactivating hides the room from search. Rooms with upcoming confirmed stays cannot be deactivated.'
                : 'This room is hidden from guests.'}
            </p>
            {status.alert}
            {room.is_active ? (
              <ConfirmButton
                className="danger"
                disabled={status.busy}
                title="Deactivate this room?"
                description="Guests will no longer find it in search."
                confirmLabel="Deactivate"
                onConfirm={toggleActive}
              >
                Deactivate room
              </ConfirmButton>
            ) : (
              <button disabled={status.busy} onClick={toggleActive}>
                Activate room
              </button>
            )}
          </section>
        </div>

        <div className="manage-col">
          <section className="panel">
            <h2 className="section-title">Seasonal prices</h2>
            <p className="hint">Nights outside every season use the base price of {money(room.base_price)}.</p>
            {room.rates.length > 0 && (
              <div className="list">
                {room.rates.map((r) => (
                  <div className="list-row" key={r.id}>
                    <div className="grow">
                      <div className="title">{fmtRange(r.start_date, r.end_date)}</div>
                      <div className="sub">
                        {money(r.nightly_price)} a night · minimum {plural(r.min_nights, 'night')}
                      </div>
                    </div>
                    <ConfirmButton
                      className="plain small"
                      disabled={rates.busy}
                      title="Delete this season?"
                      description={`${fmtRange(r.start_date, r.end_date)} at ${money(r.nightly_price)} a night.`}
                      confirmLabel="Delete"
                      onConfirm={() => deleteRate(r)}
                    >
                      Delete
                    </ConfirmButton>
                  </div>
                ))}
              </div>
            )}
            <form className="stack" autoComplete="off" key={rateForm} onSubmit={addRate}>
              <div className="row">
                <DateInput label="From" name="start_date" min={today()} required />
                <DateInput label="To" name="end_date" min={today()} required />
              </div>
              <div className="row">
                <NumberInput label="Price per night (EGP)" name="nightly_price" min={1} step={0.01} required />
                <NumberInput label="Minimum nights" name="min_nights" min={1} max={30} defaultValue="1" required />
              </div>
              {rates.alert}
              <div className="actions">
                <button type="submit" className="secondary" disabled={rates.busy}>
                  Add season
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <h2 className="section-title">Long-stay discount</h2>
            <p className="hint">
              {room.discount
                ? `Currently ${room.discount.percent}% off stays of ${room.discount.min_nights} nights or more.`
                : 'No discount at the moment.'}
            </p>
            <form
              className="stack"
              autoComplete="off"
              onSubmit={saveDiscount}
              key={room.discount ? `${room.discount.min_nights}-${room.discount.percent}` : 'none'}
            >
              <div className="row">
                <NumberInput
                  label="From this many nights"
                  name="min_nights"
                  min={2}
                  max={30}
                  defaultValue={room.discount?.min_nights ?? 7}
                  required
                />
                <NumberInput
                  label="Discount (%)"
                  name="percent"
                  min={1}
                  max={50}
                  defaultValue={room.discount?.percent ?? 10}
                  required
                />
              </div>
              {discount.alert}
              <div className="actions">
                <button type="submit" className="secondary" disabled={discount.busy}>
                  Save discount
                </button>
                {room.discount && (
                  <ConfirmButton
                    className="plain"
                    disabled={discount.busy}
                    title="Remove Long-Stay Discount?"
                    description="New quotes will use the regular nightly prices."
                    confirmLabel="Remove Discount"
                    onConfirm={removeDiscount}
                  >
                    Remove
                  </ConfirmButton>
                )}
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
