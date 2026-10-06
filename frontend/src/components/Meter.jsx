export default function Meter({ label, value, max, text, sub, compact }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const level = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warn' : 'ok';
  return (
    <div className={`meter ${level} ${compact ? 'compact' : ''}`}>
      {label && <div className="meter-head"><span>{label}</span><span className="muted">{text}</span></div>}
      {!label && text && <div className="meter-text">{text}</div>}
      <div className="meter-track" role="meter" aria-valuenow={Math.round(value * 100) / 100} aria-valuemin={0} aria-valuemax={max}>
        <i style={{ width: `${ratio * 100}%` }} />
      </div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}
