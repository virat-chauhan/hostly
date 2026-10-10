import { useRef, useState } from 'react';
import { api } from '../api';

const toRows = env => env.map(e => ({ key: e.key, value: e.value }));
const toText = rows => rows.filter(r => r.key.trim()).map(r => `${r.key.trim()}=${r.value}`).join('\n');

function parseFile(text) {
  return text
    .split(/\r?\n/)
    .map(l => l.trim().replace(/^export\s+/, ''))
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      let value = l.slice(i + 1).trim();
      if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
      return { key: l.slice(0, i).trim(), value };
    });
}

export default function EnvTab({ project, env, onRestart }) {
  const file = useRef();
  const [rows, setRows] = useState(() => toRows(env));
  const [saved, setSaved] = useState(() => toText(toRows(env)));
  const [reveal, setReveal] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const dirty = toText(rows) !== saved;
  const edit = (i, field) => e => setRows(rows.map((r, n) => (n === i ? { ...r, [field]: e.target.value } : r)));

  async function save(restart) {
    setError('');
    setMessage('');
    try {
      await api(`/projects/${project.id}/env`, { method: 'PUT', body: { env: toText(rows) } });
      setSaved(toText(rows));
      setMessage(restart ? 'Saved. Restarting with the new values.' : 'Saved. Restart or redeploy to apply.');
      if (restart) onRestart();
    } catch (err) {
      setError(err.message);
    }
  }

  async function importFile(e) {
    const chosen = e.target.files[0];
    e.target.value = '';
    if (!chosen) return;
    const incoming = parseFile(await chosen.text());
    const merged = new Map(rows.filter(r => r.key.trim()).map(r => [r.key.trim(), r.value]));
    for (const r of incoming) merged.set(r.key, r.value);
    setRows([...merged].map(([key, value]) => ({ key, value })));
  }

  return (
    <div className="narrow" style={{ maxWidth: 720 }}>
      <p className="muted small">
        Variables are available to the build and to the running app. Changes apply on the next restart or redeploy.
      </p>
      {rows.length === 0 && <p className="muted">No variables yet.</p>}
      {rows.map((r, i) => (
        <div className="env-row" key={i}>
          <input value={r.key} onChange={edit(i, 'key')} placeholder="KEY" aria-label="Variable name" />
          <input type={reveal ? 'text' : 'password'} value={r.value} onChange={edit(i, 'value')} placeholder="value" aria-label="Variable value" autoComplete="off" />
          <span />
          <button type="button" className="btn ghost small-btn" onClick={() => setRows(rows.filter((_, n) => n !== i))}>Remove</button>
        </div>
      ))}
      <div className="actions">
        <button type="button" className="btn ghost small-btn" onClick={() => setRows([...rows, { key: '', value: '' }])}>Add variable</button>
        <button type="button" className="btn ghost small-btn" onClick={() => file.current.click()}>Import .env file</button>
        <input ref={file} type="file" hidden onChange={importFile} />
        <button type="button" className="btn ghost small-btn" onClick={() => setReveal(v => !v)}>{reveal ? 'Hide values' : 'Show values'}</button>
      </div>
      {error && <p className="error">{error}</p>}
      {message && !dirty && <p className="muted">{message}</p>}
      {dirty && <p className="muted small">You have unsaved changes.</p>}
      <div className="actions">
        <button className="btn" disabled={!dirty} onClick={() => save(false)}>Save</button>
        <button className="btn ghost" onClick={() => save(true)}>Save and restart</button>
      </div>
    </div>
  );
}
