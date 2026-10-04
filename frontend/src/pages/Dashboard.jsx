import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { usePoll } from '../hooks';
import { fmtMb } from '../format';
import StatusBadge from '../components/StatusBadge';
import UsageSummary from '../components/UsageSummary';

export default function Dashboard() {
  const [projects, error] = usePoll(() => api('/projects'), 4000);
  const [usage] = usePoll(() => api('/usage'), 4000);
  const [filter, setFilter] = useState('');

  const live = new Map(usage ? usage.projects.map(p => [p.id, p]) : []);
  const shown = projects ? projects.filter(p => `${p.name} ${p.domain}`.toLowerCase().includes(filter.toLowerCase())) : [];

  return (
    <>
      <div className="head">
        <h2>Projects</h2>
        <Link to="/new" className="btn">New project</Link>
      </div>
      <UsageSummary usage={usage} />
      <p className="small muted"><Link to="/usage">See usage per project</Link></p>
      {error && <p className="error">{error}</p>}
      {projects && projects.length === 0 && (
        <div className="empty">
          <p>No projects yet.</p>
          <p className="muted">Connect a GitHub repository or upload a zip to get a public URL.</p>
          <Link to="/new" className="btn">Deploy your first project</Link>
        </div>
      )}
      {projects && projects.length > 0 && (
        <>
          <div className="toolbar">
            <input placeholder="Search projects" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Search projects" />
          </div>
          <div className="list">
            {shown.length === 0 && <div className="row-item muted">No project matches that search.</div>}
            {shown.map(p => {
              const u = live.get(p.id);
              return (
                <Link key={p.id} to={`/projects/${p.id}`} className="row-item">
                  <div>
                    <strong>{p.name}</strong>
                    <div className="muted small">{p.domain}</div>
                  </div>
                  <div className="muted small">
                    {u && u.running ? `${fmtMb(u.memMb)} of ${fmtMb(u.memoryLimitMb)} memory` : `${fmtMb(p.memory_mb)} memory when running`}
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
