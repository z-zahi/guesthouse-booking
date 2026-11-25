import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { ChoiceField, DateInput, MonthNavigation } from '../../fields.jsx';
import { Input } from '@base-ui/react/input';
import { Link, useSearchParams } from 'react-router-dom';
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
  const selectedRoom = params.get('room') || 'all';
  const setMonth = (nextMonth) =>
    setParams(selectedRoom !== 'all' ? { month: nextMonth, room: selectedRoom } : { month: nextMonth });
  const setRoom = (nextRoom) => setParams(nextRoom !== 'all' ? { month, room: nextRoom } : { month });

  const cal = useLoad(`/api/calendar${query({ month })}`);
  const blocks = useLoad('/api/blocks');
  const [blockForm, setBlockForm] = useState(0);
  const [selectedCell, setSelectedCell] = useState(null);
  const [editingBlock, setEditingBlock] = useState(null);
  const action = useAction();
  const editAction = useAction();

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
    action
      .run(() => api(`/api/blocks/${b.id}`, { method: 'DELETE' }), 'Block removed.')
      .then((r) => {
        if (r !== undefined) reloadAll();
      });
  };

  const saveBlockEdit = (e) => {
    e.preventDefault();
    const f = formData(e);
    editAction
      .run(
        () => api(`/api/blocks/${editingBlock.id}`, { method: 'PUT', body: f }),
        (r) => `Updated block to ${r.block.start_date} – ${r.block.end_date}.`,
      )
      .then((r) => {
        if (r) {
          setEditingBlock(null);
          reloadAll();
        }
      });
  };

  const data = cal.data;
  const holidays = Object.fromEntries((data?.holidays || []).map((h) => [h.date, h.name]));
  const now = today();
  const allRooms = data?.rooms || [];
  const visibleRooms = selectedRoom === 'all' ? allRooms : allRooms.filter((r) => String(r.id) === selectedRoom);
  const roomFilterItems = [
    { value: 'all', label: 'All rooms' },
    ...allRooms.map((room) => ({ value: String(room.id), label: room.name })),
  ];

  return (
    <div className="page">
      <PageHead title="Calendar" lead="Every room, every night of the month.">
        {allRooms.length > 0 && (
          <div className="calendar-room-filter">
            <ChoiceField
              label="Room"
              items={roomFilterItems}
              value={selectedRoom}
              onValueChange={(value) => {
                setSelectedCell(null);
                setRoom(value || 'all');
              }}
            />
          </div>
        )}
        <MonthNavigation
          month={month}
          onChange={(m) => {
            setSelectedCell(null);
            setMonth(m);
          }}
        />
        <button
          className="plain"
          onClick={() => {
            setSelectedCell(null);
            setMonth(thisMonth());
          }}
          disabled={month === thisMonth()}
        >
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
        (visibleRooms.length === 0 ? (
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
                  {visibleRooms.map((room) => (
                    <tr key={room.id}>
                      <th className="room-col" title={room.name}>
                        {room.name}
                        {!room.is_active && <span className="muted small"> (inactive)</span>}
                      </th>
                      {room.nights.map((n) => {
                        const isSelected = selectedCell?.room.id === room.id && selectedCell?.night.date === n.date;
                        return (
                          <td
                            key={n.date}
                            className={`cell cell-${n.status}${holidays[n.date] ? ' holiday' : ''}${isSelected ? ' selected' : ''}`}
                          >
                            <button
                              type="button"
                              className="cell-btn"
                              title={cellTitle(n, holidays[n.date])}
                              aria-label={`${room.name}, ${cellTitle(n, holidays[n.date])}`}
                              aria-pressed={isSelected}
                              onClick={() => setSelectedCell({ room, night: n })}
                            />
                          </td>
                        );
                      })}
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

      {selectedCell && (
        <section className="panel calendar-detail" aria-live="polite">
          <div className="panel-head">
            <div>
              <h2 className="section-title">
                {selectedCell.room.name} · {fmtDate(selectedCell.night.date)}
              </h2>
              {holidays[selectedCell.night.date] && (
                <p className="sub">Public holiday: {holidays[selectedCell.night.date]}</p>
              )}
            </div>
            <button type="button" className="plain small" onClick={() => setSelectedCell(null)}>
              Close
            </button>
          </div>
          {selectedCell.night.status === 'confirmed' && (
            <p className="calendar-detail-text">
              Confirmed booking #{selectedCell.night.booking_id} for <strong>{selectedCell.night.guest}</strong> (
              {fmtRange(selectedCell.night.check_in, selectedCell.night.check_out)}).{' '}
              <Link to="/staff/requests?status=Confirmed">View in Requests</Link>
            </p>
          )}
          {selectedCell.night.status === 'blocked' && (
            <p className="calendar-detail-text">
              Blocked ({fmtRange(selectedCell.night.start_date, selectedCell.night.end_date)}):{' '}
              {selectedCell.night.reason || 'No reason provided.'}
            </p>
          )}
          {selectedCell.night.status === 'pending' && (
            <p className="calendar-detail-text">
              {selectedCell.night.requests} pending booking request(s) for this night.{' '}
              <Link to="/staff/requests?status=Pending">Review requests</Link>
            </p>
          )}
          {selectedCell.night.status === 'free' && (
            <p className="calendar-detail-text">This night is free and available for booking.</p>
          )}
        </section>
      )}

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
              disabled={!allRooms.length}
              items={allRooms.map((room) => ({ value: String(room.id), label: room.name }))}
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
              <button type="submit" disabled={action.busy || !allRooms.length}>
                Block dates
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <h2 className="section-title">Upcoming blocks</h2>
          {!editingBlock && editAction.alert}
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
                    <div className="actions">
                      <button
                        type="button"
                        className="plain small"
                        disabled={action.busy || editAction.busy}
                        onClick={() => {
                          editAction.clear();
                          setEditingBlock(b);
                        }}
                      >
                        Edit
                      </button>
                      <ConfirmButton
                        className="plain small"
                        disabled={action.busy || editAction.busy}
                        title="Remove this block?"
                        description={`${b.room_name}, ${fmtRange(b.start_date, b.end_date)}. The nights become bookable again.`}
                        confirmLabel="Remove"
                        onConfirm={() => removeBlock(b)}
                      >
                        Remove
                      </ConfirmButton>
                    </div>
                  </div>
                ))}
              </div>
            ))}
        </section>
      </div>

      <Dialog.Root
        open={Boolean(editingBlock)}
        onOpenChange={(open) => {
          if (editAction.busy) return;
          if (!open) setEditingBlock(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Popup className="dialog">
            <Dialog.Title className="dialog-title">Edit Date Block</Dialog.Title>
            {editingBlock && (
              <>
                <Dialog.Description className="dialog-text">{editingBlock.room_name}</Dialog.Description>
                <form className="stack" autoComplete="off" key={editingBlock.id} onSubmit={saveBlockEdit}>
                  <div className="row">
                    <DateInput
                      label="First night"
                      name="start_date"
                      min={today()}
                      defaultValue={editingBlock.start_date}
                      required
                    />
                    <DateInput
                      label="Last night"
                      name="end_date"
                      min={today()}
                      defaultValue={editingBlock.end_date}
                      required
                    />
                  </div>
                  <label>
                    Reason
                    <Input name="reason" maxLength="200" defaultValue={editingBlock.reason} />
                  </label>
                  {editAction.alert}
                  <div className="dialog-actions">
                    <Dialog.Close className="secondary" disabled={editAction.busy}>
                      Cancel
                    </Dialog.Close>
                    <button type="submit" disabled={editAction.busy}>
                      {editAction.busy ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
