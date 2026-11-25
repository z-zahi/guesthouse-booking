import { useState } from 'react';
import { ChoiceField, DateInput, MonthNavigation } from '../../fields.jsx';
import { Input } from '@base-ui/react/input';
import { useSearchParams } from 'react-router-dom';
import { api, query, today, thisMonth } from '../../api.js';
import { Alert, Loading } from '../../components.jsx';
import { useLoad, useAction, formData } from '../../hooks.jsx';
import { ConfirmButton, Empty, PageHead } from '../../ui.jsx';
import { fmtDate, fmtRange } from '../../format.js';
import '../../staff.css';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const LEGEND = [
  ['confirmed', 'Confirmed'],
  ['pending', 'Pending request'],
  ['blocked', 'Blocked'],
  ['free', 'Free'],
  ['holiday', 'Public holiday'],
];

function cellTitle(n, holiday) {
  let text = `${fmtDate(n.date)}, `;
  if (n.status === 'confirmed') text += `confirmed, ${n.guest}`;
  else if (n.status === 'blocked') text += `blocked${n.reason ? `, ${n.reason}` : ''}`;
  else if (n.status === 'pending') text += `${n.requests} pending request${n.requests > 1 ? 's' : ''}`;
  else text += 'free';
  return holiday ? `${text} (${holiday})` : text;
}

export default function Calendar() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('month') || '';
  const month = /^20\d{2}-(0[1-9]|1[0-2])$/.test(requested) ? requested : thisMonth();
  const setMonth = (month) => setParams({ month });
  const cal = useLoad(`/api/calendar${query({ month })}`);
  const blocks = useLoad('/api/blocks');
  const [blockForm, setBlockForm] = useState(0);
  const action = useAction();

  const reloadAll = () => {
    cal.reload();
    blocks.reload();
  };

  const addBlock = (e) => {
    e.preventDefault();
    const f = formData(e);
    action
      .run(
        () => api('/api/blocks', { method: 'POST', body: { ...f, room_id: Number(f.room_id) } }),
        (r) => `Blocked ${r.block.start_date} to ${r.block.end_date}.`,
      )
      .then((r) => {
        if (r) {
          setBlockForm((version) => version + 1);
          reloadAll();
        }
      });
  };

  const removeBlock = (b) => {
    action.run(() => api(`/api/blocks/${b.id}`, { method: 'DELETE' }), 'Block removed.').then(reloadAll);
  };

  const data = cal.data;
  const holidays = Object.fromEntries((data?.holidays || []).map((h) => [h.date, h.name]));
  const now = today();

  return (
    <div className="page">
      <PageHead title="Calendar" lead="Every room, every night of the month.">
        <MonthNavigation month={month} onChange={setMonth} />
        <button className="plain" onClick={() => setMonth(thisMonth())} disabled={month === thisMonth()}>
          Today
        </button>
      </PageHead>

      <div className="legend">
        {LEGEND.map(([key, label]) => (
          <span key={key}>
            <span className={`swatch swatch-${key}`} />
            {label}
          </span>
        ))}
      </div>

      <Alert>{cal.error}</Alert>
      {data?.holiday_warning && <Alert type="info">{data.holiday_warning}</Alert>}
      {cal.loading && !data && <Loading />}
      {data &&
        (data.rooms.length === 0 ? (
          <div className="list">
            <Empty icon="calendar" title="No rooms yet">
              Add rooms to see them here.
            </Empty>
          </div>
        ) : (
          <div className="card calendar-card">
            <div className="calendar-scroll" tabIndex={0} role="region" aria-label="Calendar grid">
              <table className="calendar">
                <caption className="sr-only">Nightly room occupancy</caption>
                <thead>
                  <tr>
                    <th className="room-col">Room</th>
                    {data.days.map((d) => {
                      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
                      const cls = [
                        holidays[d] && 'holiday',
                        (dow === 5 || dow === 6) && 'weekend',
                        d === now && 'is-today',
                      ]
                        .filter(Boolean)
                        .join(' ');
                      return (
                        <th key={d} className={cls} title={holidays[d] || undefined}>
                          {Number(d.slice(8))}
                          <span className="dow">{DOW[dow]}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {data.rooms.map((room) => (
                    <tr key={room.id}>
                      <th className="room-col" title={room.name}>
                        {room.name}
                        {!room.is_active && <span className="muted small"> (inactive)</span>}
                      </th>
                      {room.nights.map((n) => (
                        <td
                          key={n.date}
                          className={`cell cell-${n.status}${holidays[n.date] ? ' holiday' : ''}`}
                          title={cellTitle(n, holidays[n.date])}
                        >
                          <span className="sr-only">{cellTitle(n, holidays[n.date])}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="calendar-foot">
              {data.holidays.length
                ? `Public holidays, ${data.holidays.map((h) => `${Number(h.date.slice(8))} ${h.name}`).join(', ')}.`
                : 'No public holidays this month.'}
            </p>
          </div>
        ))}

      <div className="calendar-forms">
        <section className="panel">
          <h2 className="section-title">Block dates</h2>
          <p className="hint">Blocked nights cannot be booked. Nights with a confirmed stay cannot be blocked.</p>
          <form className="stack" autoComplete="off" key={blockForm} onSubmit={addBlock}>
            <ChoiceField
              label="Room"
              name="room_id"
              placeholder="Choose a room"
              required
              disabled={!data?.rooms.length}
              items={(data?.rooms || []).map((room) => ({ value: String(room.id), label: room.name }))}
            />
            <div className="row">
              <DateInput label="First night" name="start_date" min={today()} required />
              <DateInput label="Last night" name="end_date" min={today()} required />
            </div>
            <label>
              Reason
              <Input name="reason" maxLength="200" placeholder="Example: maintenance…" />
            </label>
            {action.alert}
            <div className="actions">
              <button type="submit" disabled={action.busy || !data?.rooms.length}>
                Block dates
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <h2 className="section-title">Upcoming blocks</h2>
          <Alert>{blocks.error}</Alert>
          {blocks.loading && !blocks.data && <Loading />}
          {blocks.data &&
            (blocks.data.blocks.length === 0 ? (
              <Empty icon="calendar" title="No upcoming blocks">
                Blocked dates will be listed here.
              </Empty>
            ) : (
              <div className="list" style={{ marginTop: 16 }}>
                {blocks.data.blocks.map((b) => (
                  <div className="list-row" key={b.id}>
                    <div className="grow">
                      <div className="title">{b.room_name}</div>
                      <div className="sub">
                        {fmtRange(b.start_date, b.end_date)}
                        {b.reason ? ` · ${b.reason}` : ''}
                      </div>
                    </div>
                    <ConfirmButton
                      className="plain small"
                      disabled={action.busy}
                      title="Remove this block?"
                      description={`${b.room_name}, ${fmtRange(b.start_date, b.end_date)}. The nights become bookable again.`}
                      confirmLabel="Remove"
                      onConfirm={() => removeBlock(b)}
                    >
                      Remove
                    </ConfirmButton>
                  </div>
                ))}
              </div>
            ))}
        </section>
      </div>
    </div>
  );
}
