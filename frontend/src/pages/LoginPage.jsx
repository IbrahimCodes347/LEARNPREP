import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/layout/ThemeToggle';
import { apiErrorMessage } from '../lib/utils';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ identifier: '', password: '', grade: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = { identifier: form.identifier, password: form.password };
      if (form.grade.trim()) payload.grade = form.grade.trim();
      await login(payload);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      // Server returns one generic 401 for every failure mode (no enumeration).
      setError(apiErrorMessage(err, 'Invalid username or password'));
    } finally {
      setBusy(false);
    }
  };

  return (
    // pt-16 reserves a band so the absolute toggle never sits on the form.
    <div className="relative flex min-h-[80vh] items-center justify-center px-4 pt-16 pb-8">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="card w-full max-w-md bg-base-100 shadow">
        <form className="card-body gap-4" onSubmit={onSubmit}>
          <h1 className="card-title text-2xl">Log in to LearnPrep</h1>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Username, email or roll number</legend>
            <input
              className="input input-bordered w-full"
              value={form.identifier}
              onChange={set('identifier')}
              autoComplete="username"
              required
            />
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Password</legend>
            <input
              type="password"
              className="input input-bordered w-full"
              value={form.password}
              onChange={set('password')}
              autoComplete="current-password"
              required
            />
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Class (optional)</legend>
            <input
              className="input input-bordered w-full"
              value={form.grade}
              onChange={set('grade')}
              placeholder="TYCS Sem V"
            />
          </fieldset>

          {error && (
            <div role="alert" className="alert alert-error">
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <span className="loading loading-spinner loading-sm" />}
            Log in
          </button>

          <p className="text-center text-sm opacity-70">
            No account?{' '}
            <Link className="link link-primary" to="/register">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;