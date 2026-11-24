import { useRef, useState } from 'react';
import { Button } from '@base-ui/react/button';
import { NumberInput, Textarea } from '../../fields.jsx';
import { Input } from '@base-ui/react/input';
import { Autocomplete } from '@base-ui/react/autocomplete';
import { Link } from 'react-router-dom';
import { api, money } from '../../api.js';
import { Alert, Loading } from '../../components.jsx';
import { useLoad, useAction, formData } from '../../hooks.jsx';
import { Empty, PageHead, RoomImage } from '../../ui.jsx';
import { plural } from '../../format.js';
import '../../staff.css';

const TYPES = ['Single', 'Double', 'Twin', 'Triple', 'Family', 'Suite'];

export default function StaffRooms() {
  const { data, error, loading, reload } = useLoad('/api/rooms?mine=true');
  const [roomForm, setRoomForm] = useState(0);
  const roomName = useRef(null);
  const action = useAction();

  const add = async (e) => {
    e.preventDefault();
    const f = formData(e);
    const res = await action.run(
      () =>
        api('/api/rooms', {
          method: 'POST',
          body: { ...f, capacity: Number(f.capacity), base_price: Number(f.base_price) },
        }),
      (r) => `${r.room.name} was added. Open it to add photos and seasonal prices.`,
    );
    if (res) {
      setRoomForm((version) => version + 1);
      reload();
    }
  };

  return (
    <div className="page">
      <PageHead title="Rooms" lead="Everything guests see, from photos to seasonal prices.">
        <Button className="secondary" onClick={() => roomName.current?.focus()}>
          Add Room
        </Button>
      </PageHead>

      <Alert>{error}</Alert>
      {loading && !data && <Loading />}
      {data &&
        (data.rooms.length === 0 ? (
          <div className="list">
            <Empty icon="bed" title="No rooms yet">
              Add the first one below.
            </Empty>
          </div>
        ) : (
          <div className="room-tiles">
            {data.rooms.map((r) => (
              <Link key={r.id} to={`/staff/rooms/${r.id}`} className={`room-tile${r.is_active ? '' : ' inactive'}`}>
                <div className="media">
                  <RoomImage room={r} />
                </div>
                <div className="tile-body">
                  <div className="tile-top">
                    <h3>{r.name}</h3>
                    <span className={`badge ${r.is_active ? 'badge-active' : 'badge-inactive'}`}>
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="facts">
                    {r.type} · sleeps {r.capacity}
                  </p>
                  <p className="facts">
                    {r.rates.length ? plural(r.rates.length, 'season') : 'No seasons'}
                    {r.discount ? ` · ${r.discount.percent}% off from ${r.discount.min_nights} nights` : ''}
                  </p>
                  <p className="price">
                    <strong>{money(r.base_price)}</strong> <span className="muted">/ night</span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ))}

      <section className="panel section" id="add-room">
        <h2 className="section-title">Add a room</h2>
        <p className="hint">You can add photos, seasons and a long-stay discount after saving.</p>
        <form className="stack" autoComplete="off" key={roomForm} onSubmit={add}>
          <div className="row">
            <label>
              Name
              <Input ref={roomName} name="name" minLength="2" maxLength="100" placeholder="Garden Room…" required />
            </label>
            <label>
              Type
              <Autocomplete.Root items={TYPES} openOnInputClick>
                <Autocomplete.Input
                  name="type"
                  minLength="2"
                  maxLength="50"
                  placeholder="Double…"
                  autoComplete="off"
                  required
                />
                <Autocomplete.Portal>
                  <Autocomplete.Positioner className="field-positioner" align="start" sideOffset={6}>
                    <Autocomplete.Popup className="field-popup">
                      <Autocomplete.Empty className="field-option">Enter a custom room type.</Autocomplete.Empty>
                      <Autocomplete.List className="field-options">
                        {(type) => (
                          <Autocomplete.Item key={type} value={type} className="field-option">
                            {type}
                          </Autocomplete.Item>
                        )}
                      </Autocomplete.List>
                    </Autocomplete.Popup>
                  </Autocomplete.Positioner>
                </Autocomplete.Portal>
              </Autocomplete.Root>
            </label>
            <NumberInput label="Sleeps" name="capacity" min={1} max={10} defaultValue="2" required />
            <NumberInput label="Base price per night (EGP)" name="base_price" min={1} step={0.01} required />
          </div>
          <Textarea
            label="Description"
            name="description"
            rows="3"
            maxLength="2000"
            placeholder="Garden view, 2 beds…"
          />
          {action.alert}
          <div className="actions">
            <button type="submit" disabled={action.busy}>
              {action.busy ? 'Adding Room…' : 'Add Room'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
