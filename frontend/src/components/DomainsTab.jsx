import { useEffect, useState } from 'react';
import { api } from '../api';
import { useMeta } from '../hooks';

export default function DomainsTab({ project, domains, onChanged }) {
  const meta = useMeta();
  const [slug, setSlug] = useState(project.slug);
  const [check, setCheck] = useState(null);
  const [host, setHost] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const base = meta ? meta.baseDomain : 'hostly.localhost';
  const port = meta && meta.proxyPort !== 80 ? `:${meta.proxyPort}` : '';
  const changed = slug.trim().toLowerCase() !== project.slug;

  useEffect(() => {
    if (!changed) return setCheck(null);
    setCheck(null);
    const timer = setTimeout(() => {
      api(`/projects/check-slug?slug=${encodeURIComponent(slug)}&project=${project.id}`).then(setCheck).catch(() => {});
    }, 350);
    return () => clearTimeout(timer);
  }, [slug, project.slug]);

  async function saveSlug(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api(`/projects/${project.id}/domain`, { method: 'PUT', body: { slug } });
      setMessage('Domain changed. The old one stops working right away.');
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addHost(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api(`/projects/${project.id}/domains`, { method: 'POST', body: { host } });
      setHost('');
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeHost(id) {
    setError('');
    try {
      await api(`/projects/${project.id}/domains/${id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="narrow" style={{ maxWidth: 640 }}>
      <div className="section">
        <h3>Hostly domain</h3>
        <form onSubmit={saveSlug}>
          <label>
            Subdomain
            <div className="slug-row">
              <input value={slug} onChange={e => setSlug(e.target.value)} maxLength={40} aria-label="Subdomain" />
              <span className="muted">.{base}</span>
            </div>
            {changed && check && (check.available
              ? <span className="ok-text">{check.slug}.{base} is available</span>
              : <span className="error small">{check.reason}</span>)}
            {!changed && <span className="hint">Current address: {project.slug}.{base}{port}</span>}
          </label>
          <div><button className="btn" disabled={!changed || !check || !check.available}>Change domain</button></div>
        </form>
      </div>

      <div className="section">
        <h3>Custom domains</h3>
        <p className="muted small">
          Any domain you add here is routed to this project. Point its DNS at this server. For local testing, add
          {' '}<code>127.0.0.1 your.domain</code> to your hosts file and open <code>http://your.domain{port}</code>.
        </p>
        {domains.length === 0 && <p className="muted">No custom domains yet.</p>}
        {domains.map(d => (
          <div key={d.id} className="head" style={{ marginBottom: 6, alignItems: 'center' }}>
            <span>{d.host}</span>
            <button className="btn ghost small-btn" onClick={() => removeHost(d.id)}>Remove</button>
          </div>
        ))}
        <form onSubmit={addHost} style={{ flexDirection: 'row', marginTop: 12 }}>
          <input value={host} onChange={e => setHost(e.target.value)} placeholder="www.example.com" aria-label="Custom domain" />
          <button className="btn" disabled={!host.trim()}>Add</button>
        </form>
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}
    </div>
  );
}
