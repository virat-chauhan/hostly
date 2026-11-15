// runtime, commands and port, used when creating a project and in its settings
export default function RunFields({ value, onChange, runtimes = [] }) {
  const set = key => e => onChange({ ...value, [key]: e.target.value });
  return (
    <>
      <label>
        Runtime
        <select value={value.runtime} onChange={set('runtime')}>
          {runtimes.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </label>
      <label>
        Build command
        <input value={value.build_command} onChange={set('build_command')} placeholder="npm install && npm run build" />
      </label>
      <label>
        Start command
        <input value={value.start_command} onChange={set('start_command')} placeholder="npm start" required />
      </label>
      <label>
        Port your app listens on
        <input type="number" value={value.port} onChange={set('port')} required />
        <span className="hint">Your app also receives this value as the PORT variable.</span>
      </label>
    </>
  );
}
