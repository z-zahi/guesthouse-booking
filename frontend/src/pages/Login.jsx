import { Input } from '@base-ui/react/input';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useAction, formData } from '../hooks.jsx';
import { Icon } from '../ui.jsx';

const HOME = { guest: '/', staff: '/staff/requests', admin: '/admin' };

function AuthHead({ title, children }) {
  return (
    <div className="auth-head">
      <div className="auth-mark">
        <Icon name="house" size={28} />
      </div>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const action = useAction();

  if (user) {
    return <Navigate to={location.state?.from || HOME[user.role]} replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    const { email, password } = formData(e);
    const loggedInUser = await action.run(() => login(email.trim(), password));
    if (loggedInUser) {
      navigate(location.state?.from || HOME[loggedInUser.role], { replace: true });
    }
  };

  return (
    <div className="page narrow auth">
      <AuthHead title="Log In" />
      <form onSubmit={submit} className="panel stack">
        <label>
          Email
          <Input type="email" spellCheck={false} name="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <Input type="password" name="password" autoComplete="current-password" required />
        </label>
        {action.alert}
        <button type="submit" className="large" disabled={action.busy}>
          {action.busy ? 'Logging In…' : 'Log In'}
        </button>
      </form>
      <p className="auth-foot">
        New here?{' '}
        <Link to="/register" state={location.state}>
          Create a guest account
        </Link>
      </p>
    </div>
  );
}

export function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const action = useAction();

  if (user) {
    return <Navigate to={location.state?.from || HOME[user.role]} replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    const fields = formData(e);
    const createdUser = await action.run(async () => {
      if (fields.name.trim().length < 2) {
        throw new Error('Full name must be at least 2 characters.');
      }
      return register({
        name: fields.name.trim(),
        email: fields.email.trim(),
        password: fields.password,
      });
    });
    if (createdUser) {
      navigate(location.state?.from || '/', { replace: true });
    }
  };

  return (
    <div className="page narrow auth">
      <AuthHead title="Create Your Account" />
      <form onSubmit={submit} className="panel stack">
        <label>
          Full name
          <Input name="name" autoComplete="name" minLength="2" maxLength="100" required />
        </label>
        <label>
          Email
          <Input type="email" spellCheck={false} name="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <Input
            type="password"
            name="password"
            autoComplete="new-password"
            minLength="8"
            maxLength="72"
            aria-describedby="password-hint"
            required
          />
          <span id="password-hint" className="sub">
            Use at least 8 characters.
          </span>
        </label>
        {action.alert}
        <button type="submit" className="large" disabled={action.busy}>
          {action.busy ? 'Creating Account…' : 'Create Account'}
        </button>
      </form>
      <p className="auth-foot">
        Already have an account?{' '}
        <Link to="/login" state={location.state}>
          Log in
        </Link>
        . Staff accounts are created by the administrator.
      </p>
    </div>
  );
}
