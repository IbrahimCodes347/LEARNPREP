import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/layout/ThemeToggle';
import { apiErrorMessage } from '../lib/utils';
import { config } from '../api/endpoints';

const EMPTY = {
  name: '',
  username: '',
  email: '',
  rollno: '',
  grade: '',
  password: '',
  confirmPassword: ''
};

const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: appConfig } = useQuery({
    queryKey: ['app', 'config'],
    queryFn: config.get,
    staleTime: Infinity
  });
  const gradeOptions = appConfig?.gradeOptions ?? [];

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await register({
        name: form.name,
        username: form.username,
        email: form.email || undefined,
        rollno: form.rollno || undefined,
        grade: form.grade || undefined,
        password: form.password
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
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
        <form className="card-body gap-3" onSubmit={onSubmit}>
          <h1 className="card-title text-2xl">Create a student account</h1>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Full name</legend>
            <input className="input input-bordered w-full" value={form.name} onChange={set('name')} required />
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Username*</legend>
            <input className="input input-bordered w-full" value={form.username} onChange={set('username')} required />
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Email*</legend>
            <input type="email" className="input input-bordered w-full" value={form.email} onChange={set('email')} />
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Roll number *</legend>
            <input className="input input-bordered w-full" value={form.rollno} onChange={set('rollno')} />
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Class</legend>
            <select className="select select-bordered w-full" value={form.grade} onChange={set('grade')}>
              <option value="">Unassigned</option>
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Password</legend>
            <input
              type="password"
              className="input input-bordered w-full"
              value={form.password}
              onChange={set('password')}
              autoComplete="new-password"
              required
            />
            <p className="label">At least 8 characters, with a letter and a number.</p>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Confirm password</legend>
            <input
              type="password"
              className="input input-bordered w-full"
              value={form.confirmPassword}
              onChange={set('confirmPassword')}
              autoComplete="new-password"
              required
            />
          </fieldset>

          {error && (
            <div role="alert" className="alert alert-error">
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <span className="loading loading-spinner loading-sm" />}
            Register
          </button>

          <p className="text-center text-sm opacity-70">
            Already registered?{' '}
            <Link className="link link-primary" to="/login">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;