import { Link } from 'react-router-dom';
import { api } from '../api';
import { usePoll } from '../hooks';
import { fmtMb } from '../format';
import UsageSummary from '../components/UsageSummary';
import Meter from '../components/Meter';
import Chart from '../components/Chart';
import StatusBadge from '../components/StatusBadge';

export default function Usage() {
  const [usage, error] = usePoll(() => api('/usage'), 2000);
  const [history] = usePoll(() => api('/usage/history?minutes=30'), 10000);

  if (!usage) return <p className="muted">{error || 'Loading...'}</p>;
  const { quota, projects, scheduler } = usage;
  const names = new Map(projects.map(p => [String(p.id), p.name]));
  const waiting = Object.entries(scheduler.queued);
  const queuedTotal = waiting.reduce((s, [, n]) => s + n, 0);

  return (
    <>
      <h2>Usage</h2>
      <p className="muted">
        Every account gets {quota.cpu} CPU cores, {fmtMb(quota.ramMb)} of memory and {fmtMb(quota.storageMb)} of storage. All your projects share it.
      </p>
      <UsageSummary usage={usage} />

      <div className="two">
        <div>
          <h3 className="small muted">Memory in use, last 30 minutes</h3>
          <Chart
            points={history || []}
            series={[{ key: 'mem', label: 'Memory', color: 'var(--series-1)' }]}
            height={170}
            format={v => `${v < 10 ? v.toFixed(1) : Math.round(v)} MB`}
            emptyText="No samples yet"
          />
        </div>
        <div>
          <h3 className="small muted">CPU in use, last 30 minutes</h3>
          <Chart
            points={history || []}
            series={[{ key: 'cpu', label: 'CPU cores', color: 'var(--series-1)' }]}
            height={170}
            format={v => v.toFixed(v < 0.1 ? 3 : 2)}
            emptyText="No samples yet"
          />
        </div>
      </div>

      <h3>By project</h3>
      <div className="table-scroll" style={{ maxHeight: 'none' }}>
        <table>
          <thead>
            <tr><th>Project</th><th>Status</th><th>CPU</th><th>Memory</th><th>Storage</th></tr>
          </thead>
          <tbody>
            {projects.length === 0 && <tr><td colSpan="5" className="muted">No projects yet.</td></tr>}
            {projects.map(p => (
              <tr key={p.id}>
                <td><Link to={`/projects/${p.id}`}>{p.name}</Link></td>
                <td><StatusBadge status={p.status} /></td>
                <td style={{ minWidth: 150 }}>
                  {p.running
                    ? <Meter compact value={p.cpuCores} max={p.cpuLimit} text={`${p.cpuCores.toFixed(2)} of ${p.cpuLimit.toFixed(2)} cores`} />
                    : <span className="muted">-</span>}
                </td>
                <td style={{ minWidth: 150 }}>
                  {p.running
                    ? <Meter compact value={p.memMb} max={p.memoryLimitMb} text={`${fmtMb(p.memMb)} of ${fmtMb(p.memoryLimitMb)}`} />
                    : <span className="muted">{fmtMb(p.memoryLimitMb)} when running</span>}
                </td>
                <td style={{ minWidth: 190 }}>
                  <Meter compact value={p.storage.totalMb} max={quota.storageMb} text={fmtMb(p.storage.totalMb)} />
                  <span className="muted small">
                    image {fmtMb(p.storage.imageMb)}, upload {fmtMb(p.storage.zipMb)}, files {fmtMb(p.storage.runtimeMb)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Request scheduler</h3>
      <div className="card">
        <p>
          Algorithm: <strong>round robin</strong>. Your {quota.cpu} CPU cores allow {scheduler.slots} requests to run at the same time.
          Extra requests wait in one queue per project. The scheduler gives every project a time quantum of {scheduler.quantumMs} ms in turn,
          so a busy project cannot starve the others.
        </p>
        <div className="slots" aria-label={`${scheduler.active} of ${scheduler.slots} slots busy`}>
          {Array.from({ length: scheduler.slots }, (_, i) => <i key={i} className={i < scheduler.active ? 'busy' : ''} />)}
        </div>
        <p className="small muted">
          {scheduler.active} of {scheduler.slots} slots busy, {queuedTotal} waiting. Served {scheduler.served} requests since the server started, rejected {scheduler.rejected}.
        </p>
        {scheduler.lastRound && (
          <>
            <h3 className="small muted" style={{ marginTop: 16 }}>Last scheduling round (quantum {scheduler.lastRound.quantum} ms)</h3>
            <div className="table-scroll" style={{ maxHeight: 'none' }}>
              <table>
                <thead>
                  <tr><th>Project</th><th className="num">BT</th><th className="num">CT</th><th className="num">WT</th><th className="num">TAT</th></tr>
                </thead>
                <tbody>
                  {scheduler.lastRound.rows.map(r => (
                    <tr key={r.projectId}>
                      <td>{names.get(String(r.projectId)) || `Project ${r.projectId}`}</td>
                      <td className="num">{r.bt}</td>
                      <td className="num">{r.ct}</td>
                      <td className="num">{r.wt}</td>
                      <td className="num">{r.tat}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">
              BT is the estimated burst time of the waiting requests, CT the completion time, WT the waiting time and TAT the turnaround time, all in ms.
              Average waiting time {scheduler.lastRound.avgWt} ms, average turnaround time {scheduler.lastRound.avgTat} ms.
            </p>
          </>
        )}
        {waiting.some(([, n]) => n > 0) && (
          <ul className="small">
            {waiting.filter(([, n]) => n > 0).map(([id, n]) => <li key={id}>{names.get(id) || `Project ${id}`}: {n} waiting</li>)}
          </ul>
        )}
      </div>
    </>
  );
}
