import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, token } from '../api';
import Icon from '../components/Icons';

const perks = [
  ['upload', 'Deploy from GitHub or a zip', 'Add your commands and press deploy.'],
  ['globe', 'A free web address', 'Name it, rename it, or add your own domain.'],
  ['chart', 'Logs and live traffic', 'Watch builds and requests as they happen.'],
  ['gauge', 'Your own resource budget', '0.5 CPU, 512 MB memory and 1 GB storage.'],
];

export default function Login() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'signup' ? 'signup' : 'login';
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const switchTo = next => {
    setError('');
    setParams(next === 'signup' ? { mode: 'signup' } : {}, { replace: true });
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/signup';
      const data = await api(path, { method: 'POST', body: form });
      token.set(data.token);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="au">
      <aside className="au-side">
        <Link to="/" className="brand">Hostly</Link>
        <div className="au-pitch">
          <h1>Deploy your app and see how it runs.</h1>
          <ul>
            {perks.map(([icon, title, text]) => (
              <li key={title}>
                <span className="au-ic"><Icon name={icon} size={18} /></span>
                <div><strong>{title}</strong><span>{text}</span></div>
              </li>
            ))}
          </ul>
        </div>
        <div className="au-live" aria-hidden="true">
          <div><i />shop.hostly.localhost</div>
          <span>running, 112 MB memory, 38 requests in the last minute</span>
        </div>
      </aside>

      <main className="au-main">
        <Link to="/" className="au-back">Back to home</Link>
        <div className="au-card">
          <div className="au-switch" role="tablist" aria-label="Log in or sign up">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => switchTo('login')}>Log in</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => switchTo('signup')}>Sign up</button>
          </div>

          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="muted">{mode === 'login' ? 'Log in to manage your projects.' : 'It takes a minute. No card needed.'}</p>

          <form onSubmit={submit}>
            <label>
              Email
              <input type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            </label>
            <label>
              Password
              <span className="au-pass">
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'login' ? 'Your password' : 'At least 6 characters'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                  <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
                </button>
              </span>
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn big" disabled={busy}>
              {busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>

          <p className="au-alt small muted">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button type="button" className="link under" onClick={() => switchTo(mode === 'login' ? 'signup' : 'login')}>
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
