import { useEffect, useRef, useState } from 'react';
import { api, stream } from '../api';
import { usePoll } from '../hooks';
import { fmtClock, fmtCount } from '../format';
import Chart from './Chart';

const RANGES = [['1h', 'Last hour'], ['24h', 'Last 24 hours'], ['7d', 'Last 7 days']];
const SERIES = [
  { key: 'get', label: 'GET', color: 'var(--series-1)' },
  { key: 'post', label: 'POST', color: 'var(--series-2)' },
  { key: 'other', label: 'Other', color: 'var(--series-other)' },
];

const fromRow = r => ({ key: `r${r.id}`, at: r.created_at, method: r.method, path: r.path, status: r.status, ms: r.duration_ms, wait: r.wait_ms, ip: r.ip });
let counter = 0;
const fromEntry = e => ({ key: `s${++counter}`, at: e.at, method: e.method, path: e.path, status: e.status, ms: e.durationMs, wait: e.waitMs, ip: e.ip });

function Tile({ label, value }) {
  return <div className="tile"><div className="value">{value}</div><div className="label">{label}</div></div>;
}

function Line({ r }) {
  return (
    <div className="line">
      <span className="muted">{fmtClock(r.at)}</span>
      <strong>{r.method}</strong>
      <span><i className={`dot s${Math.floor(r.status / 100)}`} /> {r.status}</span>
      <span className="path" title={r.path}>{r.path}</span>
      <span className="muted">{r.ms} ms{r.wait > 5 ? `, queued ${r.wait} ms` : ''}</span>
    </div>
  );
}

function LiveConsole({ project }) {
  const [lines, setLines] = useState([]);
  const [paused, setPaused] = useState(false);
  const [state, setState] = useState('connecting');
  const pausedRef = useRef(false);
  const stick = useRef(true);
  const box = useRef();

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const abort = new AbortController();
    let alive = true;
    api(`/traffic/${project.id}/requests?limit=30`)
      .then(rows => alive && setLines(rows.reverse().map(fromRow)))
      .catch(() => {});
    (async () => {
      while (alive) {
        try {
          setState('live');
          await stream(`/traffic/${project.id}/stream`, entry => {
            if (pausedRef.current) return;
            setLines(prev => [...prev, fromEntry(entry)].slice(-300));
          }, abort.signal);
        } catch {}
        if (!alive) return;
        setState('reconnecting');
        await new Promise(r => setTimeout(r, 2000));
      }
    })();
    return () => {
      alive = false;
      abort.abort();
    };
  }, [project.id]);

  useEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines]);

  function onScroll() {
    const el = box.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  }

  return (
    <>
      <div className="live-head">
        <h3>Live requests</h3>
        <div className="actions" style={{ margin: 0, alignItems: 'center' }}>
          <span className="live-tag"><i className={`dot ${state === 'live' && !paused ? 'running' : 'stopped'}`} />{paused ? 'Paused' : state === 'live' ? 'Streaming' : state}</span>
          <button className="btn ghost small-btn" onClick={() => setPaused(p => !p)}>{paused ? 'Resume' : 'Pause'}</button>
          <button className="btn ghost small-btn" onClick={() => setLines([])}>Clear</button>
        </div>
      </div>
      <div className="console" ref={box} onScroll={onScroll} aria-live="off">
        {lines.length === 0 && <div className="empty-line">Waiting for requests. Open your app URL and they show up here.</div>}
        {lines.map(r => <Line key={r.key} r={r} />)}
      </div>
    </>
  );
}

function History({ project }) {
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [rows] = usePoll(
    () => api(`/traffic/${project.id}/requests?limit=50&method=${method}&status=${status}`),
    5000,
    [project.id, method, status]
  );

  return (
    <>
      <div className="live-head">
        <h3>Request history</h3>
        <div className="filters">
          <select value={method} onChange={e => setMethod(e.target.value)} aria-label="Filter by method">
            <option value="">All methods</option>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m}>{m}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {['2xx', '3xx', '4xx', '5xx'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="table-scroll" style={{ maxHeight: 360 }}>
        <table>
          <thead>
            <tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th className="num">Duration</th><th className="num">Queued</th><th>IP</th></tr>
          </thead>
          <tbody>
            {rows && rows.length === 0 && <tr><td colSpan="7" className="muted">No requests match.</td></tr>}
            {rows && rows.map(r => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.method}</td>
                <td style={{ wordBreak: 'break-all' }}>{r.path}</td>
                <td><i className={`dot s${Math.floor(r.status / 100)}`} /> {r.status}</td>
                <td className="num">{r.duration_ms} ms</td>
                <td className="num">{r.wait_ms} ms</td>
                <td>{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function TrafficTab({ project }) {
  const [range, setRange] = useState('1h');
  const [data] = usePoll(() => api(`/traffic/${project.id}/analytics?range=${range}`), 5000, [project.id, range]);
  const t = data && data.range === range ? data.totals : null;
  const classes = t ? [['s2', '2xx', t.s2xx], ['s3', '3xx', t.s3xx], ['s4', '4xx', t.s4xx], ['s5', '5xx', t.s5xx]] : [];

  return (
    <>
      <div className="filters">
        {RANGES.map(([key, label]) => (
          <button key={key} className={range === key ? 'on' : ''} onClick={() => setRange(key)}>{label}</button>
        ))}
      </div>

      <div className="tiles">
        <Tile label="Requests" value={t ? fmtCount(t.total) : '-'} />
        <Tile label="GET" value={t ? fmtCount(t.gets) : '-'} />
        <Tile label="POST" value={t ? fmtCount(t.posts) : '-'} />
        <Tile label="Average response" value={t ? `${t.avg_ms} ms` : '-'} />
        <Tile label="Slowest 5%" value={t ? `${t.p95_ms} ms` : '-'} />
        <Tile label="Average queue wait" value={t ? `${t.avg_wait_ms} ms` : '-'} />
      </div>

      <div className="card" style={{ opacity: data && data.range === range ? 1 : 0.6 }}>
        <h3>Requests over time</h3>
        <Chart
          kind="bars"
          stacked
          integer
          points={data && data.range === range ? data.points : []}
          series={SERIES}
          height={220}
          format={v => String(Math.round(v))}
          emptyText="No requests in this period"
        />
      </div>

      <div className="two">
        <div className="card">
          <h3>Responses by status</h3>
          {t && t.total > 0 ? (
            <>
              <div className="statusbar">
                {classes.filter(c => c[2] > 0).map(([cls, , n]) => <i key={cls} className={cls} style={{ flex: n }} />)}
              </div>
              <div className="status-legend">
                {classes.map(([cls, label, n]) => <span key={cls}><i className={`dot ${cls}`} />{label} {n}</span>)}
              </div>
            </>
          ) : <p className="muted small">No responses yet.</p>}
        </div>
        <div className="card">
          <h3>Most requested paths</h3>
          {data && data.paths.length > 0 ? (
            <table>
              <tbody>
                {data.paths.map(p => (
                  <tr key={`${p.method} ${p.path}`}>
                    <td style={{ wordBreak: 'break-all' }}><strong>{p.method}</strong> {p.path}</td>
                    <td className="num">{p.hits}</td>
                    <td className="num muted">{p.avg_ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted small">No requests yet.</p>}
        </div>
      </div>

      <LiveConsole project={project} />
      <History project={project} />
    </>
  );
}
