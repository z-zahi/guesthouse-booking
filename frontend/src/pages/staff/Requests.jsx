import { DateInput, Textarea } from '../../fields.jsx';
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
const EMAIL = {
  sent: 'the guest was emailed',
  skipped: 'no email was sent because email is not configured',
  failed: 'the email to the guest failed',
};

export default function Requests() {
  const [params, setParams] = useSearchParams();
  const form = useRef(null);
  const status = params.get('status') ?? 'Pending';
  const filters = {
    status: status === 'All' ? '' : status,
    guest: params.get('guest'),
    from: params.get('from'),
    to: params.get('to'),
  };
  const { data, error, loading, reload } = useLoad(`/api/bookings${query(filters)}`);
  const action = useAction();
  const [rejecting, setRejecting] = useState(null);

  const applyFilters = (e) => {
    e.preventDefault();
    setParams({ ...formData(e), status });
  };

  const act = async (booking, status, extra) => {
    const res = await action.run(
      () => api(`/api/bookings/${booking.id}/status`, { method: 'PATCH', body: { status, ...extra } }),
      (r) =>
        `Booking #${booking.id} for ${booking.guest_name} is now ${r.booking.status}, ${EMAIL[r.email] || 'email status unknown'}.`,
    );
    if (res) {
      setRejecting(null);
      reload();
    }
  };

  return (
    <div className="page">
      <PageHead title="Requests" lead="Confirm or reject stay requests. Confirming checks the dates again." />

      <form key={params.toString()} ref={form} className="toolbar" onSubmit={applyFilters} autoComplete="off">
        <div className="toolbar-status">
          <RadioGroup
            className="segmented"
            aria-label="Booking status"
            value={status}
            onValueChange={(value) => setParams({ ...Object.fromEntries(new FormData(form.current)), status: value })}
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
        <DateInput label="From" name="from" defaultValue={filters.from} />
        <DateInput label="To" name="to" defaultValue={filters.to} />
        <button type="submit" className="secondary">
          {loading ? 'Filtering…' : 'Apply Filters'}
        </button>
      </form>

      {!rejecting && action.alert}
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
                {data.bookings.map((b) => (
                  <tr key={b.id}>
                    <td className="guest-cell">
                      {b.guest_name}
                      <div className="sub">{b.guest_email}</div>
                    </td>
                    <td>{b.room_name}</td>
                    <td className="nowrap">
                      {fmtRange(b.check_in, b.check_out)}
                      <div className="sub">{plural(b.guests, 'guest')}</div>
                    </td>
                    <td className="nowrap">{money(b.total_price)}</td>
                    <td>
                      <Status value={b.status} />
                      {b.reject_reason && <div className="sub">{b.reject_reason}</div>}
                    </td>
                    <td className="note-cell">{b.note || '—'}</td>
                    <td>
                      {b.status === 'Pending' && (
                        <div className="actions">
                          <button className="small" disabled={action.busy} onClick={() => act(b, 'Confirmed')}>
                            Confirm
                          </button>
                          <Dialog.Root
                            open={rejecting === b.id}
                            onOpenChange={(open) => {
                              if (action.busy) return;
                              action.clear();
                              setRejecting(open ? b.id : null);
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
                                  {b.guest_name} · {fmtRange(b.check_in, b.check_out)}
                                </Dialog.Description>
                                <form
                                  className="stack"
                                  autoComplete="off"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    act(b, 'Rejected', { reason: formData(event).reason });
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
                      {b.status === 'Confirmed' && b.check_in > today() && (
                        <ConfirmButton
                          className="danger small"
                          disabled={action.busy}
                          title="Cancel this stay?"
                          description={`${b.guest_name}, ${fmtRange(b.check_in, b.check_out)}. The guest will be emailed.`}
                          confirmLabel="Cancel stay"
                          cancelLabel="Keep"
                          onConfirm={() => act(b, 'Cancelled')}
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
