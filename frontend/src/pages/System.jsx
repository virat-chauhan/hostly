import { api } from '../api';
import { usePoll } from '../hooks';
import { fmtAge } from '../format';
import ProcessTree, { serverNode, workerNode, nestByParent } from '../components/ProcessTree';

export default function System() {
  const [info, error] = usePoll(() => api('/processes'), 1500);
  if (!info) return <p className="muted">{error || 'Loading...'}</p>;
  const s = info.server;

  const children = [
    {
      key: 'monitor',
      tag: `thread ${s.monitorThreadId ?? '-'}`,
      label: 'resource monitor',
      note: 'a thread inside the server, polls docker for cpu, memory and disk',
      state: 'running',
    },
    ...info.workers.map(workerNode),
    ...info.recent.map(workerNode),
  ];

  const facts = [
    ['Server PID', s.pid],
    ['Parent PID', s.ppid],
    ['Process name', s.title],
    ['Uptime', fmtAge(s.uptimeSeconds * 1000)],
    ['Memory (RSS)', `${s.rssMb} MB`],
    ['CPU cores', s.cpus],
    ['Load average', s.load.join(' / ')],
    ['Runtime', `Node ${s.node} on ${s.platform}`],
  ];

  return (
    <>
      <h2>Processes</h2>
      <p className="muted">The real processes and threads behind your deployments, updated every second and a half.</p>

      <div className="facts" style={{ marginTop: 16 }}>
        {facts.map(([k, v]) => <div key={k}><span className="muted small">{k}</span><div>{v}</div></div>)}
      </div>

      <h3>Process tree</h3>
      <div className="card">
        <ProcessTree nodes={[serverNode(s, children)]} />
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>
        The server is the parent. Each deployment forks a worker, and the worker spawns git and docker as its children.
        Up to {info.maxConcurrent} workers run at once, {info.queued} deployment{info.queued === 1 ? ' is' : 's are'} waiting in the queue.
      </p>

      <h3>Inside your running apps</h3>
      {info.containers.length === 0 && <p className="muted">No app is running right now.</p>}
      {info.containers.map(c => (
        <div className="card" key={c.deploymentId} style={{ marginBottom: 12 }}>
          <h3>{c.project} <span className="muted small">container {c.container}</span></h3>
          {c.processes.length ? <ProcessTree nodes={nestByParent(c.processes)} /> : <p className="muted small">No process information available.</p>}
        </div>
      ))}
    </>
  );
}
