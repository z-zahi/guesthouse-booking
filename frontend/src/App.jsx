import { lazy, Suspense } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Loading, RequireRole } from './components.jsx';
import { Empty, Icon } from './ui.jsx';
import Search from './pages/Search.jsx';
import RoomPage from './pages/RoomPage.jsx';
import { Login, Register } from './pages/Login.jsx';
import MyBookings from './pages/MyBookings.jsx';
import Requests from './pages/staff/Requests.jsx';
import ManageRoom from './pages/staff/ManageRoom.jsx';
import Calendar from './pages/staff/Calendar.jsx';
import Report from './pages/staff/Report.jsx';
import Admin from './pages/Admin.jsx';

const StaffRooms = lazy(() => import('./pages/staff/StaffRooms.jsx'));

const LINKS = {
  guest: [
    ['/', 'Find Rooms'],
    ['/bookings', 'My Bookings'],
  ],
  staff: [
    ['/staff/requests', 'Requests'],
    ['/staff/calendar', 'Calendar'],
    ['/staff/rooms', 'Rooms'],
    ['/staff/report', 'Report'],
  ],
  admin: [
    ['/admin', 'Admin'],
    ['/', 'Find Rooms'],
  ],
  none: [['/', 'Find Rooms']],
};

function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="nav">
      <div className="nav-inner">
        <NavLink to="/" className="brand">
          <Icon name="house" size={19} />
          Guesthouse
        </NavLink>
        <nav className="nav-links" aria-label="Main">
          {LINKS[user?.role || 'none'].map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-user">
          {user ? (
            <>
              <span className="nav-name">
                {user.name}
                <span className="nav-role">{user.role}</span>
              </span>
              <button
                className="plain small"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                Log Out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="nav-login">
                Log In
              </NavLink>
              <NavLink to="/register" className="button small">
                Sign Up
              </NavLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

const staff = (page) => <RequireRole roles={['staff']}>{page}</RequireRole>;

export default function App() {
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content').focus();
        }}
      >
        Skip to Content
      </a>
      <NavBar />
      <main id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/rooms/:id" element={<RoomPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/bookings"
            element={
              <RequireRole roles={['guest']}>
                <MyBookings />
              </RequireRole>
            }
          />
          <Route path="/staff/requests" element={staff(<Requests />)} />
          <Route
            path="/staff/rooms"
            element={staff(
              <Suspense
                fallback={
                  <div className="page">
                    <Loading />
                  </div>
                }
              >
                <StaffRooms />
              </Suspense>,
            )}
          />
          <Route path="/staff/rooms/:id" element={staff(<ManageRoom />)} />
          <Route path="/staff/calendar" element={staff(<Calendar />)} />
          <Route path="/staff/report" element={staff(<Report />)} />
          <Route
            path="/admin"
            element={
              <RequireRole roles={['admin']}>
                <Admin />
              </RequireRole>
            }
          />
          <Route
            path="*"
            element={
              <div className="page narrow">
                <Empty icon="search" title="Page not found">
                  This page does not exist.
                </Empty>
              </div>
            }
          />
        </Routes>
      </main>
    </>
  );
}
