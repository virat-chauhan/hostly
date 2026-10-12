import StatusBadge from './StatusBadge';
import DeploymentPanel from './DeploymentPanel';

export default function DeploymentsTab({ deployments, selected, onSelect, onChanged }) {
  const current = deployments.find(d => d.id === selected) || deployments[0];
  return (
    <div className="split">
      <div className="dep-list">
        {deployments.length === 0 && <p className="muted small">No deployments yet.</p>}
        {deployments.map(d => (
          <button key={d.id} className={`dep ${current && current.id === d.id ? 'on' : ''}`} onClick={() => onSelect(d.id)}>
            <span>#{d.id}</span>
            <StatusBadge status={d.status} />
            <span className="muted small">{new Date(d.created_at).toLocaleTimeString()}</span>
          </button>
        ))}
      </div>
      {current && <DeploymentPanel key={current.id} dep={current} onChanged={onChanged} />}
    </div>
  );
}
