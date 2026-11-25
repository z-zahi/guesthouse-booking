import { ChoiceField, DateInput, Textarea } from '../../fields.jsx';
import { Input } from '@base-ui/react/input';
import { useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { useSearchParams } from 'react-router-dom';
import { api, query, money, today } from '../../api.js';
import { Alert, Loading, Status } from '../../components.jsx';
import { useLoad, useAction, formData } from '../../hooks.jsx';
import { ConfirmButton, Empty, PageHead } from '../../ui.jsx';
import { fmtRange, plural } from '../../format.js';
import '../../staff.css';

const STATUSES = ['Pending', 'Confirmed', 'Rejected', 'Cancelled'];
const EMAIL_STATUS_MESSAGE = {
  sent: 'and the guest was emailed',
  skipped: 'but no email was sent because email is not configured',
  failed: 'but the email to the guest failed',
};

function cleanSearchParams(values) {
  const cleaned = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== '' && value !== undefined && value !== null) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export default function Requests() {
  const [params, setParams] = useSearchParams();
  const formRef = useRef(null);

  const status = params.get('status') ?? 'Pending';
  const filters = {
    status: status === 'All' ? '' : status,
    guest: params.get('guest') || '',
    room_id: params.get('room_id') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
  };

  const { data, error, loading, reload } = useLoad(`/api/bookings${query(filters)}`);
  const roomsLoad = useLoad('/api/rooms?mine=true');
  const action = useAction();
  const [rejectingId, setRejectingId] = useState(null);

  const roomItems = [
    { value: 'all', label: 'All rooms' },
    ...(roomsLoad.data?.rooms || []).map((room) => ({ value: String(room.id), label: room.name })),
  ];

  const hasExtraFilters = Boolean(filters.guest || filters.room_id || filters.from || filters.to);

  const readFormFilters = () => {
    const raw = formRef.current ? Object.fromEntries(new FormData(formRef.current)) : {};
    return {
      guest: raw.guest?.trim() || '',
      room_id: raw.room_id && raw.room_id !== 'all' ? raw.room_id : '',
      from: raw.from || '',
      to: raw.to || '',
    };
  };

  const applyFilters = (e) => {
    e.preventDefault();
    setParams(cleanSearchParams({ ...readFormFilters(), status }));
  };

  const handleStatusChange = (nextStatus) => {
    setParams(cleanSearchParams({ ...readFormFilters(), status: nextStatus }));
  };

  const clearFilters = () => {
    setParams(cleanSearchParams({ status }));
  };

  const updateStatus = async (booking, nextStatus, extra = {}) => {
    const result = await action.run(
      () => api(`/api/bookings/${booking.id}/status`, { method: 'PATCH', body: { status: nextStatus, ...extra } }),
      (res) => {
        const emailNote = EMAIL_STATUS_MESSAGE[res.email] || 'email status unknown';
        return `Booking #${booking.id} for ${booking.guest_name} is now ${res.booking.status}, ${emailNote}.`;
      },
    );
    if (result) {
      setRejectingId(null);
      reload();
    }
  };

  return (
    <div className="page">
      <PageHead title="Requests" lead="Confirm or reject stay requests. Confirming checks the dates again." />

      <form key={params.toString()} ref={formRef} className="toolbar" onSubmit={applyFilters} autoComplete="off">
        <div className="toolbar-status">
          <RadioGroup
            className="segmented"
            aria-label="Booking status"
            value={status}
            onValueChange={handleStatusChange}
          >
            {['All', ...STATUSES].map((value) => (
              <Radio.Root key={value} className="segment" value={value}>
                {value}
              </Radio.Root>
            ))}
          </RadioGroup>
        </div>
        <label>
          Guest
          <Input name="guest" defaultValue={filters.guest} placeholder="Name or email…" />
        </label>
        <ChoiceField label="Room" name="room_id" defaultValue={filters.room_id || 'all'} items={roomItems} />
        <DateInput label="From" name="from" defaultValue={filters.from} />
        <DateInput label="To" name="to" defaultValue={filters.to} />
        <button type="submit" className="secondary">
          {loading ? 'Filtering…' : 'Apply Filters'}
        </button>
        {hasExtraFilters && (
          <button type="button" className="plain" onClick={clearFilters}>
            Clear
          </button>
        )}
      </form>

      {!rejectingId && action.alert}
      <Alert>{error}</Alert>
      {loading && !data && <Loading />}
      {data &&
        (data.bookings.length === 0 ? (
          <div className="list">
            <Empty icon="list" title="Nothing here">
              No bookings match these filters.
            </Empty>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Room</th>
                  <th>Stay</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data.bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td className="guest-cell">
                      {booking.guest_name}
                      <div className="sub">{booking.guest_email}</div>
                    </td>
                    <td>{booking.room_name}</td>
                    <td className="nowrap">
                      {fmtRange(booking.check_in, booking.check_out)}
                      <div className="sub">{plural(booking.guests, 'guest')}</div>
                    </td>
                    <td className="nowrap">{money(booking.total_price)}</td>
                    <td>
                      <Status value={booking.status} />
                      {booking.reject_reason && <div className="sub">{booking.reject_reason}</div>}
                    </td>
                    <td className="note-cell">{booking.note || '—'}</td>
                    <td>
                      {booking.status === 'Pending' && (
                        <div className="actions">
                          <button
                            className="small"
                            disabled={action.busy}
                            onClick={() => updateStatus(booking, 'Confirmed')}
                          >
                            Confirm
                          </button>
                          <Dialog.Root
                            open={rejectingId === booking.id}
                            onOpenChange={(open) => {
                              if (action.busy) return;
                              action.clear();
                              setRejectingId(open ? booking.id : null);
                            }}
                          >
                            <Dialog.Trigger className="danger small" disabled={action.busy}>
                              Reject
                            </Dialog.Trigger>
                            <Dialog.Portal>
                              <Dialog.Backdrop className="dialog-backdrop" />
                              <Dialog.Popup className="dialog">
                                <Dialog.Title className="dialog-title">Reject This Request?</Dialog.Title>
                                <Dialog.Description className="dialog-text">
                                  {booking.guest_name} · {fmtRange(booking.check_in, booking.check_out)}
                                </Dialog.Description>
                                <form
                                  className="stack"
                                  autoComplete="off"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    updateStatus(booking, 'Rejected', { reason: formData(event).reason });
                                  }}
                                >
                                  <Textarea
                                    label="Reason for the Guest"
                                    name="reason"
                                    minLength="3"
                                    maxLength="500"
                                    required
                                    rows="3"
                                  />
                                  {action.alert}
                                  <div className="dialog-actions">
                                    <Dialog.Close className="secondary" disabled={action.busy}>
                                      Keep Request
                                    </Dialog.Close>
                                    <button type="submit" className="destructive" disabled={action.busy}>
                                      {action.busy ? 'Rejecting…' : 'Reject Request'}
                                    </button>
                                  </div>
                                </form>
                              </Dialog.Popup>
                            </Dialog.Portal>
                          </Dialog.Root>
                        </div>
                      )}
                      {booking.status === 'Confirmed' && booking.check_in > today() && (
                        <ConfirmButton
                          className="danger small"
                          disabled={action.busy}
                          title="Cancel this stay?"
                          description={`${booking.guest_name}, ${fmtRange(booking.check_in, booking.check_out)}. The guest will be emailed.`}
                          confirmLabel="Cancel stay"
                          cancelLabel="Keep"
                          onConfirm={() => updateStatus(booking, 'Cancelled')}
                        >
                          Cancel stay
                        </ConfirmButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
