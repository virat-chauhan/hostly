import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { usePoll } from '../hooks';
import StatusBadge from '../components/StatusBadge';
import OverviewTab from '../components/OverviewTab';
import DeploymentsTab from '../components/DeploymentsTab';
import TrafficTab from '../components/TrafficTab';
import EnvTab from '../components/EnvTab';
import DomainsTab from '../components/DomainsTab';
import SettingsTab from '../components/SettingsTab';

const TABS = ['overview', 'deployments', 'traffic', 'environment', 'domains', 'settings'];

export default function Project() {
  const { id } = useParams();
  const fileRef = useRef();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview';
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [data, error, reload] = usePoll(() => api(`/projects/${id}`), 3000, [id]);

  const latestId = data && data.deployments[0] ? data.deployments[0].id : null;
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    if (latestId) setSelected(latestId);
  }, [latestId]);

  if (!data) return <p className="muted">{error || 'Loading...'}</p>;
  const { project, deployments, live, env, domains } = data;

  async function act(path, opts = {}) {
    setBusy(true);
    setMessage('');
    try {
      await api(`/projects/${id}/${path}`, { method: 'POST', ...opts });
      reload();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  function deployZip(e) {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('zip', file);
    act('deploy', { form });
    e.target.value = '';
  }

  return (
    <>
      <div className="head">
        <div>
          <h2>{project.name}</h2>
          {live ? <a href={project.url} target="_blank" rel="noreferrer">{project.domain}</a> : <span className="muted">{project.domain}</span>}
        </div>
        <StatusBadge status={deployments[0] && deployments[0].status} />
      </div>

      <div className="actions">
        <button className="btn" disabled={busy} onClick={() => act('deploy')}>Redeploy</button>
        {project.source_type === 'upload' && (
          <>
            <button className="btn ghost" disabled={busy} onClick={() => fileRef.current.click()}>Upload new zip</button>
            <input ref={fileRef} type="file" accept=".zip" hidden onChange={deployZip} />
          </>
        )}
        <button className="btn ghost" disabled={busy || !deployments.length} onClick={() => act('restart')}>Restart</button>
        {live && <button className="btn ghost" disabled={busy} onClick={() => act('stop')}>Stop</button>}
      </div>
      {message && <p className="error">{message}</p>}

      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setParams({ tab: t })}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab project={project} deployments={deployments} live={live} onTab={t => setParams({ tab: t })} />}
      {tab === 'deployments' && (
        <DeploymentsTab deployments={deployments} selected={selected} onSelect={setSelected} onChanged={reload} />
      )}
      {tab === 'traffic' && <TrafficTab project={project} />}
      {tab === 'environment' && <EnvTab key={project.id} project={project} env={env} onRestart={() => act('restart')} />}
      {tab === 'domains' && <DomainsTab project={project} domains={domains} onChanged={reload} />}
      {tab === 'settings' && <SettingsTab project={project} onSaved={reload} />}
    </>
  );
}
