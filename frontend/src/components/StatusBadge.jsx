const labels = { running: 'Live' };

export default function StatusBadge({ status }) {
  if (!status) return <span className="badge none"><i />Not deployed</span>;
  const text = labels[status] || status[0].toUpperCase() + status.slice(1);
  return <span className={`badge ${status}`}><i />{text}</span>;
}
