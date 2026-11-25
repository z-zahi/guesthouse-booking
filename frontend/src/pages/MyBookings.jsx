import { Link } from 'react-router-dom';
import { api, money, today } from '../api.js';
import { Alert, Loading, Status } from '../components.jsx';
import { useLoad, useAction } from '../hooks.jsx';
import { ConfirmButton, Empty, PageHead } from '../ui.jsx';
import { fmtRange, plural } from '../format.js';

const EMAIL_STATUS_MESSAGE = {
  sent: 'A cancellation email was sent to your email address.',
  skipped: 'No email was sent because email notifications are not configured.',
  failed: 'The booking was cancelled, but the cancellation email could not be sent.',
};

function canCancelBooking(booking) {
  return ['Pending', 'Confirmed'].includes(booking.status) && booking.check_in > today();
}

export default function MyBookings() {
  const { data, error, loading, reload } = useLoad('/api/bookings');
  const action = useAction();

  const cancelBooking = async (booking) => {
    const res = await action.run(
      () => api(`/api/bookings/${booking.id}/status`, { method: 'PATCH', body: { status: 'Cancelled' } }),
      (result) => `Booking #${booking.id} cancelled. ${EMAIL_STATUS_MESSAGE[result.email] || ''}`.trim(),
    );
    if (res) {
      reload();
    }
  };

  return (
    <div className="page">
      <PageHead title="My bookings" lead="Requests stay pending until the guesthouse confirms or rejects them." />
      {action.alert}
      <Alert>{error}</Alert>
      {loading && !data && <Loading />}
      {data && data.bookings.length === 0 && (
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
          {data.bookings.map((booking) => (
            <div className="booking-row" key={booking.id}>
              <div>
                <Link to={`/rooms/${booking.room_id}`} className="title">
                  {booking.room_name}
                </Link>
                <div className="sub">{booking.guesthouse_name}</div>
                {booking.note && <div className="sub">Note: {booking.note}</div>}
              </div>
              <div className="when">
                <div>{fmtRange(booking.check_in, booking.check_out)}</div>
                <div className="sub">{plural(booking.guests, 'guest')}</div>
              </div>
              <div>
                <Status value={booking.status} />
                {booking.status === 'Rejected' && booking.reject_reason && (
                  <div className="sub">Reason: {booking.reject_reason}</div>
                )}
              </div>
              <div className="end">
                <span className="amount">{money(booking.total_price)}</span>
                {canCancelBooking(booking) && (
                  <ConfirmButton
                    className="danger small"
                    disabled={action.busy}
                    title="Cancel this stay?"
                    description={`${booking.room_name}, ${fmtRange(booking.check_in, booking.check_out)}. The guesthouse will be notified.`}
                    confirmLabel="Cancel stay"
                    cancelLabel="Keep"
                    onConfirm={() => cancelBooking(booking)}
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
