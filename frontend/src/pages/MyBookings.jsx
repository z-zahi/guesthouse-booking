import { Link } from 'react-router-dom';
import { api, money, today } from '../api.js';
import { Alert, Loading, Status } from '../components.jsx';
import { useLoad, useAction } from '../hooks.jsx';
import { ConfirmButton, Empty, PageHead } from '../ui.jsx';
import { fmtRange, plural } from '../format.js';

const EMAIL = {
  sent: 'A confirmation email was sent.',
  skipped: 'No email was sent because email is not set up.',
  failed: 'The confirmation email could not be sent.',
};

const canCancel = (b) => ['Pending', 'Confirmed'].includes(b.status) && b.check_in > today();

export default function MyBookings() {
  const { data, error, loading, reload } = useLoad('/api/bookings');
  const action = useAction();

  const cancel = async (b) => {
    const res = await action.run(
      () => api(`/api/bookings/${b.id}/status`, { method: 'PATCH', body: { status: 'Cancelled' } }),
      (r) => `Booking cancelled. ${EMAIL[r.email] || ''}`,
    );
    if (res) reload();
  };

  return (
    <div className="page">
      <PageHead title="My bookings" lead="Requests stay pending until the guesthouse confirms or rejects them." />
      {action.alert}
      <Alert>{error}</Alert>
      {loading && !data && <Loading />}
      {data && !data.bookings.length && (
        <div className="list">
          <Empty icon="calendar" title="No bookings yet">
            <span>When you request a stay, it shows up here.</span>
            <Link to="/" className="button">
              Find a room
            </Link>
          </Empty>
        </div>
      )}
      {data && data.bookings.length > 0 && (
        <div className="list">
          {data.bookings.map((b) => (
            <div className="booking-row" key={b.id}>
              <div>
                <Link to={`/rooms/${b.room_id}`} className="title">
                  {b.room_name}
                </Link>
                <div className="sub">{b.guesthouse_name}</div>
              </div>
              <div className="when">
                <div>{fmtRange(b.check_in, b.check_out)}</div>
                <div className="sub">{plural(b.guests, 'guest')}</div>
              </div>
              <div>
                <Status value={b.status} />
                {b.status === 'Rejected' && b.reject_reason && <div className="sub">{b.reject_reason}</div>}
              </div>
              <div className="end">
                <span className="amount">{money(b.total_price)}</span>
                {canCancel(b) && (
                  <ConfirmButton
                    className="danger small"
                    disabled={action.busy}
                    title="Cancel this stay?"
                    description={`${b.room_name}, ${fmtRange(b.check_in, b.check_out)}. The guesthouse will be told.`}
                    confirmLabel="Cancel stay"
                    cancelLabel="Keep"
                    onConfirm={() => cancel(b)}
                  >
                    Cancel
                  </ConfirmButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
