import { useEffect, useRef, useState } from 'react';

const M = { top: 10, right: 12, bottom: 24, left: 44 };

function niceStep(value) {
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

function barPath(x, y, w, h, r) {
  const c = Math.min(r, h, w / 2);
  return `M${x} ${y + h}V${y + c}Q${x} ${y} ${x + c} ${y}H${x + w - c}Q${x + w} ${y} ${x + w} ${y + c}V${y + h}Z`;
}

function clock(t, span) {
  const d = new Date(t);
  if (span > 36 * 3600 * 1000) return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.getHours()}:00`;
  return d.toLocaleTimeString([], span < 600000 ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
}

export default function Chart({ points, series, kind = 'line', stacked = false, height = 200, integer = false, format = v => String(v), emptyText = 'No data in this period' }) {
  const wrap = useRef();
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrap.current;
    const grow = () => setWidth(Math.max(240, el.clientWidth));
    grow();
    const observer = new ResizeObserver(grow);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const w = width - M.left - M.right;
  const h = height - M.top - M.bottom;
  const n = points.length;
  const bars = kind === 'bars';
  const totalAt = p => (stacked ? series.reduce((s, x) => s + (p[x.key] || 0), 0) : Math.max(0, ...series.map(x => p[x.key] || 0)));
  const rawMax = Math.max(0, ...points.map(totalAt));
  let step = niceStep(Math.max(rawMax, integer ? 4 : 1e-6) / 4);
  if (integer) step = Math.max(1, step);
  const yMax = Math.max(step * 2, Math.ceil(rawMax / step) * step);
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);

  const slot = bars ? w / Math.max(n, 1) : n > 1 ? w / (n - 1) : 0;
  const x = i => (bars ? i * slot + slot / 2 : n > 1 ? i * slot : w / 2);
  const y = v => h - (v / yMax) * h;
  const span = n > 1 ? points[n - 1].t - points[0].t : 0;
  const labelAt = n > 1 ? [0, 1, 2, 3, 4].map(j => Math.round((j * (n - 1)) / 4)) : [0];

  function move(e) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left - M.left;
    const i = bars ? Math.floor(px / slot) : Math.round(px / (slot || 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  function keys(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setHover(cur => {
      const base = cur === null ? n - 1 : cur;
      return Math.min(n - 1, Math.max(0, base + (e.key === 'ArrowRight' ? 1 : -1)));
    });
  }

  const hp = hover !== null ? points[hover] : null;
  const barW = Math.max(1, Math.min(24, slot - 2));
  const flip = hover !== null && x(hover) > w * 0.6;

  return (
    <figure className="chart" ref={wrap}>
      {series.length > 1 && (
        <div className="legend">
          {series.map(s => (
            <span key={s.key}><i className={bars ? 'key-box' : 'key-line'} style={{ background: s.color }} />{s.label}</span>
          ))}
        </div>
      )}
      <div className="chart-body">
        <svg
          width={width}
          height={height}
          tabIndex={0}
          role="img"
          aria-label={series.map(s => s.label).join(', ') + ' over time'}
          onKeyDown={keys}
          onBlur={() => setHover(null)}
        >
          <g transform={`translate(${M.left},${M.top})`}>
            {ticks.map((v, ti) => (
              <g key={ti}>
                <line x1={0} x2={w} y1={y(v)} y2={y(v)} className="grid" />
                <text x={-8} y={y(v)} dy="0.32em" textAnchor="end" className="axis">{format(v)}</text>
              </g>
            ))}
            {labelAt.map((i, j) => points[i] && (
              <text key={i} x={x(i)} y={h + 16} textAnchor={j === 0 && n > 1 ? 'start' : j === labelAt.length - 1 && n > 1 ? 'end' : 'middle'} className="axis">
                {clock(points[i].t, span)}
              </text>
            ))}

            {rawMax === 0 && <text x={w / 2} y={h / 2} textAnchor="middle" className="axis">{emptyText}</text>}

            {bars && points.map((p, i) => {
              let acc = 0;
              const live = series.filter(s => (p[s.key] || 0) > 0);
              return live.map((s, k) => {
                const v = p[s.key];
                const top = y(acc + v);
                const bottom = y(acc);
                acc += v;
                const last = k === live.length - 1;
                const height = Math.max(1, bottom - top - (k > 0 ? 2 : 0));
                return (
                  <path key={`${i}-${s.key}`} d={barPath(x(i) - barW / 2, top, barW, height, last ? 4 : 0)} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.55} />
                );
              });
            })}

            {!bars && series.map(s => {
              const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p[s.key] || 0)}`).join('');
              const lastP = points[n - 1];
              return (
                <g key={s.key}>
                  {series.length === 1 && n > 1 && <path d={`${path}L${x(n - 1)} ${h}L${x(0)} ${h}Z`} fill={s.color} opacity={0.1} />}
                  <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {lastP && <circle cx={x(n - 1)} cy={y(lastP[s.key] || 0)} r={4} fill={s.color} className="ring" />}
                  {hp && <circle cx={x(hover)} cy={y(hp[s.key] || 0)} r={4} fill={s.color} className="ring" />}
                </g>
              );
            })}

            {hp && !bars && <line x1={x(hover)} x2={x(hover)} y1={0} y2={h} className="crosshair" />}
            <rect x={0} y={0} width={w} height={h} fill="transparent" onPointerMove={move} onPointerLeave={() => setHover(null)} />
          </g>
        </svg>

        {hp && (
          <div className="tip" style={{ left: M.left + x(hover), top: M.top, transform: flip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}>
            <div className="muted small">{new Date(hp.t).toLocaleString([], span > 36 * 3600 * 1000 ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit', second: n > 60 ? '2-digit' : undefined })}</div>
            {series.map(s => (
              <div key={s.key} className="tip-row">
                <i className="key-line" style={{ background: s.color }} />
                <strong>{format(hp[s.key] || 0)}</strong>
                <span className="muted">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="viz-table">
        <summary>View as table</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Time</th>{series.map(s => <th key={s.key}>{s.label}</th>)}</tr>
            </thead>
            <tbody>
              {[...points].reverse().map(p => (
                <tr key={p.t}>
                  <td>{new Date(p.t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  {series.map(s => <td key={s.key}>{format(p[s.key] || 0)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
