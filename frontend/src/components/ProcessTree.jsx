function Node({ node }) {
  return (
    <li>
      <div className="proc">
        <i className={`dot ${node.state}`} />
        <code className="pid">{node.tag || node.pid || '-'}</code>
        <span>{node.label}</span>
        {node.note && <span className="muted small">{node.note}</span>}
      </div>
      {node.children && node.children.length > 0 && (
        <ul>{node.children.map(c => <Node key={c.key} node={c} />)}</ul>
      )}
    </li>
  );
}

export default function ProcessTree({ nodes }) {
  return <ul className="tree">{nodes.map(n => <Node key={n.key} node={n} />)}</ul>;
}

const exitText = e => (e.signal ? `killed by ${e.signal}` : `exit code ${e.code}`);

export function workerNode(w) {
  const done = Boolean(w.exit);
  return {
    key: `worker-${w.deploymentId}`,
    pid: w.pid,
    label: `build worker for deployment #${w.deploymentId}`,
    note: done ? `finished, ${exitText(w.exit)}` : 'forked child, talks to the server over ipc',
    state: done ? 'exited' : 'running',
    children: w.procs.map(p => ({
      key: `proc-${p.pid}`,
      pid: p.pid,
      label: p.cmd,
      note: p.state === 'exited' ? `finished, ${exitText(p)}` : 'spawned by the worker',
      state: p.state,
    })),
  };
}

export function serverNode(server, children) {
  return {
    key: 'server',
    pid: server.pid,
    label: 'hostly server',
    note: `parent process, its own parent is ${server.ppid}`,
    state: 'running',
    children,
  };
}

export function nestByParent(list) {
  const ids = new Set(list.map(p => p.pid));
  const build = parent =>
    list
      .filter(p => p.ppid === parent)
      .map(p => ({ key: `c-${p.pid}`, pid: p.pid, label: p.cmd, note: `${p.rssMb} MB, state ${p.stat}`, state: 'running', children: build(p.pid) }));
  return list
    .filter(p => !ids.has(p.ppid))
    .map(p => ({ key: `c-${p.pid}`, pid: p.pid, label: p.cmd, note: `${p.rssMb} MB, state ${p.stat}`, state: 'running', children: build(p.pid) }));
}
