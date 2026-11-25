import { useState } from 'react';
import { ChoiceField } from '../fields.jsx';
import { Input } from '@base-ui/react/input';
import { api } from '../api.js';
import { Alert, Loading } from '../components.jsx';
import { useLoad, useAction, formData } from '../hooks.jsx';
import { Empty, PageHead } from '../ui.jsx';
import '../staff.css';

export default function Admin() {
  const houses = useLoad('/api/admin/guesthouses');
  const staff = useLoad('/api/admin/staff');
  const addHouse = useAction();
  const addStaff = useAction();
  const [staffForm, setStaffForm] = useState(0);

  const createHouse = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    addHouse
      .run(
        () => api('/api/admin/guesthouses', { method: 'POST', body: formData(e) }),
        (r) => `${r.guesthouse.name} was registered.`,
      )
      .then((r) => {
        if (r) {
          form.reset();
          houses.reload();
        }
      });
  };

  const createStaff = (e) => {
    e.preventDefault();
    const f = formData(e);
    addStaff
      .run(
        () => api('/api/admin/staff', { method: 'POST', body: { ...f, guesthouse_id: Number(f.guesthouse_id) } }),
        (r) => `Staff account for ${r.user.name} was created.`,
      )
      .then((r) => {
        if (r) {
          setStaffForm((version) => version + 1);
          staff.reload();
          houses.reload();
        }
      });
  };

  const guesthouses = houses.data?.guesthouses || [];

  return (
    <div className="page">
      <PageHead title="Administration" lead="Guesthouses on the platform and the staff who run them." />
      <div className="admin-grid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="section-title">Guesthouses</h2>
            {houses.data && <span className="count-pill">{guesthouses.length}</span>}
          </div>
          <Alert>{houses.error}</Alert>
          {houses.loading && !houses.data && <Loading />}
          {houses.data &&
            (guesthouses.length === 0 ? (
              <Empty icon="house" title="No guesthouses yet">
                Register the first one below.
              </Empty>
            ) : (
              <div className="list">
                {guesthouses.map((g) => (
                  <div className="list-row" key={g.id}>
                    <div className="grow">
                      <div className="title">{g.name}</div>
                      <div className="sub">
                        {g.city} · {g.contact_email}
                      </div>
                    </div>
                    <div className="value small">{g.staff_count} staff</div>
                  </div>
                ))}
              </div>
            ))}
          <hr className="divider" />
          <form className="stack" autoComplete="off" onSubmit={createHouse}>
            <h3>Register a guesthouse</h3>
            <label>
              Name
              <Input name="name" minLength="2" maxLength="100" required />
            </label>
            <div className="row">
              <label>
                City
                <Input name="city" minLength="2" maxLength="80" required />
              </label>
              <label>
                Contact email
                <Input type="email" spellCheck={false} name="contact_email" required />
              </label>
            </div>
            {addHouse.alert}
            <div className="actions">
              <button type="submit" disabled={addHouse.busy}>
                Register guesthouse
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="section-title">Staff accounts</h2>
            {staff.data && <span className="count-pill">{staff.data.staff.length}</span>}
          </div>
          <Alert>{staff.error}</Alert>
          {staff.loading && !staff.data && <Loading />}
          {staff.data &&
            (staff.data.staff.length === 0 ? (
              <Empty icon="people" title="No staff accounts yet">
                Create one below.
              </Empty>
            ) : (
              <div className="list">
                {staff.data.staff.map((s) => (
                  <div className="list-row" key={s.id}>
                    <div className="grow">
                      <div className="title">{s.name}</div>
                      <div className="sub">{s.email}</div>
                    </div>
                    <div className="value small">{s.guesthouse_name}</div>
                  </div>
                ))}
              </div>
            ))}
          <hr className="divider" />
          <form className="stack" autoComplete="off" key={staffForm} onSubmit={createStaff}>
            <h3>Create a staff account</h3>
            <ChoiceField
              label="Guesthouse"
              name="guesthouse_id"
              placeholder="Choose a guesthouse"
              required
              disabled={!guesthouses.length}
              items={guesthouses.map((house) => ({ value: String(house.id), label: house.name }))}
            />
            <div className="row">
              <label>
                Full name
                <Input name="name" minLength="2" maxLength="100" required />
              </label>
              <label>
                Email
                <Input type="email" spellCheck={false} name="email" required />
              </label>
            </div>
            <label>
              Temporary password
              <Input type="password" name="password" minLength="8" autoComplete="new-password" required />
            </label>
            {addStaff.alert}
            <div className="actions">
              <button type="submit" disabled={addStaff.busy || !guesthouses.length}>
                Create staff account
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
