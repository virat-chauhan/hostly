import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useMeta } from '../hooks';
import RunFields from './RunFields';
import Copy from './Copy';

export default function SettingsTab({ project, onSaved }) {
  const navigate = useNavigate();
  const meta = useMeta();
  const [run, setRun] = useState({
    runtime: project.runtime,
    build_command: project.build_command,
    start_command: project.start_command,
    port: project.port,
  });
  const [branch, setBranch] = useState(project.repo_branch || '');
  const [memory, setMemory] = useState(project.memory_mb);
  const [hook, setHook] = useState(project.hook_path);
  const [notes, setNotes] = useState({});
  const [errors, setErrors] = useState({});

  const say = (key, text, bad = false) => {
    setNotes(n => ({ ...n, [key]: bad ? '' : text }));
    setErrors(e => ({ ...e, [key]: bad ? text : '' }));
  };

  async function saveRun(e) {
    e.preventDefault();
    try {
      await api(`/projects/${project.id}`, { method: 'PATCH', body: { ...run, repo_branch: branch } });
      say('run', 'Saved. Redeploy to use the new settings.');
      onSaved();
    } catch (err) {
      say('run', err.message, true);
    }
  }

  async function saveMemory(e) {
    e.preventDefault();
    try {
      const res = await api(`/projects/${project.id}/resources`, { method: 'PUT', body: { memory_mb: memory } });
      say('mem', res.applied ? 'Saved and applied to the running app.' : 'Saved. It applies the next time the app starts.');
      onSaved();
    } catch (err) {
      say('mem', err.message, true);
    }
  }

  async function regenerate() {
    if (!window.confirm('The old hook url will stop working. Continue?')) return;
    try {
      const res = await api(`/projects/${project.id}/hook/regenerate`, { method: 'POST' });
      setHook(res.hook_path);
    } catch (err) {
      say('hook', err.message, true);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${project.name}? The app, its image and its logs will be removed.`)) return;
    try {
      await api(`/projects/${project.id}`, { method: 'DELETE' });
      navigate('/');
    } catch (err) {
      say('del', err.message, true);
    }
  }

  const hookUrl = `${window.location.origin}${hook}`;
  const quota = meta ? meta.quota : null;

  return (
    <div className="narrow" style={{ maxWidth: 640 }}>
      <div className="section">
        <h3>Build and run</h3>
        <form onSubmit={saveRun}>
          {project.source_type === 'github' && (
            <>
              <label>Repository<input value={project.repo_url} disabled /></label>
              <label>Branch<input value={branch} onChange={e => setBranch(e.target.value)} placeholder="default branch" /></label>
            </>
          )}
          <RunFields value={run} onChange={setRun} runtimes={meta ? meta.runtimes : []} />
          {errors.run && <p className="error">{errors.run}</p>}
          {notes.run && <p className="muted">{notes.run}</p>}
          <div><button className="btn">Save changes</button></div>
        </form>
      </div>

      <div className="section">
        <h3>Resources</h3>
        <form onSubmit={saveMemory}>
          <label>
            Memory limit (MB)
            <input
              type="number"
              min={meta ? meta.minMemoryMb : 32}
              max={quota ? quota.ramMb : 512}
              value={memory}
              onChange={e => setMemory(e.target.value)}
            />
            <span className="hint">
              Your account has {quota ? quota.ramMb : '-'} MB of memory in total, shared by every running project. If the app goes over its limit it is restarted.
              CPU is shared equally between running projects, {quota ? quota.cpu : '-'} cores in total.
            </span>
          </label>
          {errors.mem && <p className="error">{errors.mem}</p>}
          {notes.mem && <p className="muted">{notes.mem}</p>}
          <div><button className="btn">Save memory limit</button></div>
        </form>
      </div>

      <div className="section">
        <h3>Deploy hook</h3>
        <p className="muted small">Send a POST request to this url to start a new deployment, for example from a GitHub webhook or a script.</p>
        <div className="codebox">{hookUrl}</div>
        <div className="actions">
          <Copy text={hookUrl} />
          <Copy text={`curl -X POST ${hookUrl}`} label="Copy curl command" />
          <button className="btn ghost small-btn" onClick={regenerate}>Regenerate url</button>
        </div>
        {errors.hook && <p className="error">{errors.hook}</p>}
      </div>

      <div className="danger">
        <strong>Delete project</strong>
        <p className="muted small">Stops the app and removes its deployments, logs, domains and environment variables.</p>
        {errors.del && <p className="error">{errors.del}</p>}
        <button className="btn danger-btn" onClick={remove}>Delete project</button>
      </div>
    </div>
  );
}
