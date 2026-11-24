import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';

const ALERT_ICONS = { error: '!', success: '✓', info: 'i' };

export function Alert({ type = 'error', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span className="alert-icon" aria-hidden="true">
        {ALERT_ICONS[type]}
      </span>
      <span className="alert-text">{children}</span>
      {onClose && (
        <button className="alert-close" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

export function Status({ value }) {
  return <span className={`badge badge-${value.toLowerCase()}`}>{value}</span>;
}

export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      Loading…
    </div>
  );
}

export function RequireRole({ roles, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) {
    return (
      <div className="page narrow">
        <Alert>This page is only for {roles.join(' or ')} accounts.</Alert>
        <Link to="/" className="back">
          ‹ Back to room search
        </Link>
      </div>
    );
  }
  return children;
}
