import { MonthNavigation } from '../../fields.jsx';
import { useSearchParams } from 'react-router-dom';
import { query, thisMonth } from '../../api.js';
import { Alert, Loading } from '../../components.jsx';
import { useLoad } from '../../hooks.jsx';
import { Empty, PageHead } from '../../ui.jsx';
import '../../staff.css';

function Rate({ value }) {
  return (
    <span className="bar-cell">
      <span className="bar">
        <span style={{ width: `${Math.min(100, value)}%` }} />
      </span>
      <span className="bar-value">{value}%</span>
    </span>
  );
}

export default function Report() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('month') || '';
  const month = /^20\d{2}-(0[1-9]|1[0-2])$/.test(requested) ? requested : thisMonth();
  const setMonth = (nextMonth) => setParams({ month: nextMonth });
  const { data, error, loading } = useLoad(`/api/reports/occupancy${query({ month })}`);

  return (
    <div className="page">
      <PageHead
        title="Occupancy"
        lead="Booked nights divided by available nights. Blocked nights do not count as available."
      >
        <MonthNavigation month={month} onChange={setMonth} />
      </PageHead>

      <Alert>{error}</Alert>
      {loading && !data && <Loading />}
      {data &&
        (data.rooms.length === 0 ? (
          <div className="list">
            <Empty icon="chart" title="No rooms yet">
              Add rooms to see their occupancy.
            </Empty>
          </div>
        ) : (
          <>
            <div className="stats">
              <div className="stat">
                <div className="stat-label">Occupancy rate</div>
                <div className="stat-value">
                  {data.overall.occupancy_rate}
                  <small>%</small>
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">Booked nights</div>
                <div className="stat-value">{data.overall.booked_nights}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Available nights</div>
                <div className="stat-value">{data.overall.available_nights}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Total rooms</div>
                <div className="stat-value">{data.overall.total_rooms}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Occupied rooms</div>
                <div className="stat-value">{data.overall.occupied_rooms}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Confirmed bookings</div>
                <div className="stat-value">{data.overall.confirmed_bookings}</div>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Nights</th>
                    <th>Blocked</th>
                    <th>Available</th>
                    <th>Booked</th>
                    <th>Occupancy</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rooms.map((r) => (
                    <tr key={r.room_id}>
                      <td>{r.room_name}</td>
                      <td>{r.nights_in_month}</td>
                      <td>{r.blocked_nights}</td>
                      <td>{r.available_nights}</td>
                      <td>{r.booked_nights}</td>
                      <td>
                        <Rate value={r.occupancy_rate} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>
                      All rooms ({data.overall.available_rooms} available · {data.overall.blocked_rooms} with blocks)
                    </td>
                    <td></td>
                    <td></td>
                    <td>{data.overall.available_nights}</td>
                    <td>{data.overall.booked_nights}</td>
                    <td>
                      <Rate value={data.overall.occupancy_rate} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        ))}
    </div>
  );
}
