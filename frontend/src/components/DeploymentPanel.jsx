import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { usePoll } from '../hooks';
import { fmtMb } from '../format';
import ProcessTree, { serverNode, workerNode } from './ProcessTree';

const IN_PROGRESS = ['queued', 'building', 'starting'];

function Processes({ dep }) {
  const [info] = usePoll(() => api('/processes'), 1500, [dep.id]);
  if (!info) return <p className="muted">Loading...</p>;
  const worker = info.workers.find(w => w.deploymentId === dep.id) || info.recent.find(w => w.deploymentId === dep.id);
  if (!worker) {
    return <p className="muted">No worker process is kept for this deployment. Start a new deployment and watch this tab while it builds.</p>;
  }
  const tree = [serverNode(info.server, [workerNode(worker)])];
  return (
    <div>
      <ProcessTree nodes={tree} />
      <p className="muted small" style={{ marginTop: 12 }}>
        The server forked one worker for this deployment. The worker spawned git and docker as its own children and sent logs back over ipc.
      </p>
    </div>
  );
}

export default function DeploymentPanel({ dep, onChanged }) {
  const [lines, setLines] = useState([]);
  const [view, setView] = useState('build');
  const [runtimeLogs, setRuntimeLogs] = useState('');
  const [message, setMessage] = useState('');
  const lastId = useRef(0);
  const box = useRef();

  useEffect(() => {
    let stopped = false;
    let timer;
    const pull = async () => {
      try {
        const res = await api(`/deployments/${dep.id}/logs?after=${lastId.current}`);
        if (res.lines.length && !stopped) {
          lastId.current = res.lines[res.lines.length - 1].id;
          setLines(prev => {
            const seen = prev.length ? prev[prev.length - 1].id : 0;
            return [...prev, ...res.lines.filter(l => l.id > seen)];
          });
        }
      } catch {}
      if (!stopped && IN_PROGRESS.includes(dep.status)) timer = setTimeout(pull, 1500);
    };
    pull();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [dep.status]);

  useEffect(() => {
    if (view !== 'runtime') return;
    let stopped = false;
    let timer;
    const pull = async () => {
      try {
        const res = await api(`/deployments/${dep.id}/runtime-logs`);
        if (!stopped) setRuntimeLogs(res.logs);
      } catch {}
      if (!stopped) timer = setTimeout(pull, 3000);
    };
    pull();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [view, dep.id]);

  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines, runtimeLogs, view]);

  async function call(path) {
    setMessage('');
    try {
      await api(`/deployments/${dep.id}/${path}`, { method: 'POST' });
      onChanged();
    } catch (err) {
      setMessage(err.message);
    }
  }

  const facts = [
    ['Worker PID', dep.worker_pid || '-'],
    ['Container', dep.container_id ? dep.container_id.slice(0, 12) : '-'],
    ['Host port', dep.host_port || '-'],
    ['CPU', dep.cpu_percent != null ? `${(dep.cpu_percent / 100).toFixed(2)} cores` : '-'],
    ['Memory', dep.mem_mb != null ? fmtMb(dep.mem_mb) : '-'],
    ['Image size', dep.image_mb ? fmtMb(dep.image_mb) : '-'],
  ];
  const canRollback = dep.status !== 'running' && dep.image_tag && !IN_PROGRESS.includes(dep.status);

  return (
    <div className="panel">
      <div className="facts">
        {facts.map(([k, v]) => (
          <div key={k}><span className="muted small">{k}</span><div>{v}</div></div>
        ))}
      </div>
      {dep.error && <p className="error">{dep.error}</p>}
      {message && <p className="error">{message}</p>}
      {canRollback && (
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="btn ghost small-btn" onClick={() => call('rollback')}>Roll back to this deployment</button>
        </div>
      )}
      <div className="tabs small-tabs">
        <button className={view === 'build' ? 'on' : ''} onClick={() => setView('build')}>Build logs</button>
        <button className={view === 'runtime' ? 'on' : ''} onClick={() => setView('runtime')}>App logs</button>
        <button className={view === 'procs' ? 'on' : ''} onClick={() => setView('procs')}>Processes</button>
        {IN_PROGRESS.includes(dep.status) && <button className="danger-link" onClick={() => call('cancel')}>Cancel deployment</button>}
      </div>
      {view === 'procs' ? (
        <Processes dep={dep} />
      ) : (
        <pre className="logs" ref={box}>
          {view === 'build'
            ? lines.map(l => l.line).join('\n') || 'Waiting for output...'
            : runtimeLogs || (dep.container_name ? 'No output yet.' : 'The app has not started.')}
        </pre>
      )}
    </div>
  );
}
