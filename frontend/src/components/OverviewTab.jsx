import { api } from '../api';
import { usePoll } from '../hooks';
import { fmtMb, fmtCount } from '../format';
import Meter from './Meter';
import Chart from './Chart';
import Copy from './Copy';

const ago = value => (value ? new Date(value).toLocaleString() : '-');

export default function OverviewTab({ project, deployments, live, onTab }) {
  const [usage] = usePoll(() => api('/usage'), 3000);
  const [history] = usePoll(() => api(`/usage/projects/${project.id}?minutes=30`), 10000, [project.id]);
  const [stats] = usePoll(() => api(`/traffic/${project.id}/analytics?range=24h`), 10000, [project.id]);

  const mine = usage ? usage.projects.find(p => p.id === project.id) : null;
  const quota = usage ? usage.quota : null;
  const latest = deployments[0];
  const totals = stats ? stats.totals : null;
  const errors = totals ? totals.s4xx + totals.s5xx : 0;

  return (
    <>
      <div className="section">
        <h3>Live URL</h3>
        {live ? (
          <div className="actions" style={{ margin: 0 }}>
            <a href={project.url} target="_blank" rel="noreferrer">{project.url}</a>
            <Copy text={project.url} />
          </div>
        ) : (
          <p className="muted">Not running. {latest ? 'Redeploy or restart to bring it back.' : 'Deploy to get a URL.'}</p>
        )}
      </div>

      <div className="section">
        <h3>Resources</h3>
        {mine && quota && (
          <div className="summary">
            <Meter
              label="Memory"
              value={mine.memMb}
              max={mine.memoryLimitMb}
              text={`${fmtMb(mine.memMb)} of ${fmtMb(mine.memoryLimitMb)}`}
              sub="Limit for this project, change it in settings"
            />
            <Meter
              label="CPU"
              value={mine.cpuCores}
              max={mine.cpuLimit || quota.cpu}
              text={`${mine.cpuCores.toFixed(2)} of ${(mine.cpuLimit || quota.cpu).toFixed(2)} cores`}
              sub="Equal share of your CPU between running projects"
            />
            <Meter
              label="Storage"
              value={mine.storage.totalMb}
              max={quota.storageMb}
              text={`${fmtMb(mine.storage.totalMb)} of ${fmtMb(quota.storageMb)}`}
              sub="Out of your whole account storage"
            />
          </div>
        )}
        <div className="two">
          <div>
            <h3 className="small muted">Memory, last 30 minutes</h3>
            <Chart
              points={history || []}
              series={[{ key: 'mem', label: 'Memory', color: 'var(--series-1)' }]}
              height={170}
              format={v => `${v < 10 ? v.toFixed(1) : Math.round(v)} MB`}
              emptyText="No samples yet, the app has to be running"
            />
          </div>
          <div>
            <h3 className="small muted">CPU, last 30 minutes</h3>
            <Chart
              points={history || []}
              series={[{ key: 'cpu', label: 'CPU', color: 'var(--series-1)' }]}
              height={170}
              format={v => v.toFixed(v < 0.1 ? 3 : 2)}
              emptyText="No samples yet, the app has to be running"
            />
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Traffic, last 24 hours</h3>
        <div className="tiles">
          <div className="tile"><div className="value">{totals ? fmtCount(totals.total) : '-'}</div><div className="label">Requests</div></div>
          <div className="tile"><div className="value">{totals ? `${totals.avg_ms} ms` : '-'}</div><div className="label">Average response</div></div>
          <div className="tile"><div className="value">{totals ? fmtCount(errors) : '-'}</div><div className="label">Client or server errors</div></div>
        </div>
        <button className="link under" onClick={() => onTab('traffic')}>Open traffic and live requests</button>
      </div>

      <div className="section">
        <h3>Details</h3>
        <div className="facts">
          <div><span className="muted small">Source</span><div>{project.source_type === 'github' ? project.repo_url.replace('https://', '') : 'Zip upload'}</div></div>
          <div><span className="muted small">Runtime</span><div>{project.runtime}</div></div>
          <div><span className="muted small">Start command</span><div>{project.start_command}</div></div>
          <div><span className="muted small">Port</span><div>{project.port}</div></div>
          <div><span className="muted small">Created</span><div>{ago(project.created_at)}</div></div>
          <div><span className="muted small">Last deploy</span><div>{latest ? ago(latest.created_at) : '-'}</div></div>
        </div>
      </div>
    </>
  );
}
