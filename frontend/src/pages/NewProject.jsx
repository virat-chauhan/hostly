import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useMeta } from '../hooks';
import RunFields from '../components/RunFields';

const slugify = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';

export default function NewProject() {
  const navigate = useNavigate();
  const meta = useMeta();
  const fileInput = useRef();
  const [name, setName] = useState('');
  const [source, setSource] = useState('github');
  const [repo, setRepo] = useState({ url: '', branch: '' });
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [run, setRun] = useState({ runtime: 'node20', build_command: '', start_command: '', port: 3000 });
  const [env, setEnv] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function drop(e) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (source === 'upload' && !file) return setError('Choose a .zip file to upload.');

    const form = new FormData();
    form.append('name', name);
    form.append('source_type', source);
    form.append('runtime', run.runtime);
    form.append('build_command', run.build_command);
    form.append('start_command', run.start_command);
    form.append('port', run.port);
    form.append('env', env);
    if (source === 'github') {
      form.append('repo_url', repo.url);
      form.append('repo_branch', repo.branch);
    } else {
      form.append('zip', file);
    }

    setBusy(true);
    try {
      const project = await api('/projects', { method: 'POST', form });
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <h2>New project</h2>
      <form onSubmit={submit}>
        <label>
          Project name
          <input value={name} onChange={e => setName(e.target.value)} required maxLength={60} />
          <span className="hint">
            Your URL will be {slugify(name)}.{meta ? meta.baseDomain : 'hostly.com'}. A number is added if the name is taken.
          </span>
        </label>

        <div className="tabs small-tabs">
          <button type="button" className={source === 'github' ? 'on' : ''} onClick={() => setSource('github')}>GitHub</button>
          <button type="button" className={source === 'upload' ? 'on' : ''} onClick={() => setSource('upload')}>Upload zip</button>
        </div>

        {source === 'github' ? (
          <>
            <label>
              Repository URL
              <input value={repo.url} onChange={e => setRepo({ ...repo, url: e.target.value })} placeholder="https://github.com/user/repo" required />
              <span className="hint">Public repositories only.</span>
            </label>
            <label>
              Branch
              <input value={repo.branch} onChange={e => setRepo({ ...repo, branch: e.target.value })} placeholder="default branch" />
            </label>
          </>
        ) : (
          <div
            className={`drop ${dragging ? 'over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            onClick={() => fileInput.current.click()}
          >
            {file ? file.name : 'Drag and drop your project .zip here, or click to browse'}
            <input ref={fileInput} type="file" accept=".zip" hidden onChange={e => setFile(e.target.files[0] || null)} />
          </div>
        )}

        <RunFields value={run} onChange={setRun} runtimes={meta ? meta.runtimes : []} />

        <label>
          Environment variables
          <textarea rows={5} value={env} onChange={e => setEnv(e.target.value)} placeholder={'DATABASE_URL=postgres://...\nAPI_KEY=secret'} />
          <span className="hint">One KEY=value per line.</span>
        </label>

        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Creating...' : 'Deploy'}</button>
      </form>
    </div>
  );
}
