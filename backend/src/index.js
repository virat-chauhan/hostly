const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./config');
const auth = require('./middleware/auth');
const proxy = require('./proxy');
const deployer = require('./services/deployer');
const monitor = require('./services/monitor');
const docker = require('./utils/docker');
const traffic = require('./services/traffic');
const { query } = require('./db');

for (const dir of ['tmp', 'uploads', 'workspaces']) {
  fs.mkdirSync(path.join(config.dataDir, dir), { recursive: true });
}

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/meta', (req, res) => {
  res.json({
    baseDomain: config.baseDomain,
    proxyPort: config.proxyPort,
    runtimes: Object.entries(config.runtimes).map(([key, r]) => ({ key, label: r.label })),
    quota: config.quota,
    minMemoryMb: config.project.minMemoryMb,
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/hooks', require('./routes/hooks'));
app.use('/api/projects', auth, require('./routes/projects'));
app.use('/api/deployments', auth, require('./routes/deployments'));
app.use('/api/system', auth, require('./routes/system'));
app.use('/api/usage', auth, require('./routes/usage'));
app.use('/api/traffic', auth, require('./routes/traffic'));
app.use('/api/processes', auth, require('./routes/processes'));

app.use((err, req, res, next) => {
  const status = err.name === 'MulterError' ? 400 : err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'something went wrong on our side' : err.message });
});

const api = app.listen(config.port, () => console.log(`api listening on :${config.port} (pid ${process.pid})`));
const edge = proxy.start();
monitor.start();
traffic.start();

async function bindDomains() {
  const projects = (await query('SELECT id, slug FROM projects')).rows;
  for (const p of projects) proxy.bindHost(proxy.slugHost(p.slug), p.id);
  const custom = (await query('SELECT host, project_id FROM domains')).rows;
  for (const d of custom) proxy.bindHost(d.host, d.project_id);
}

bindDomains()
  .then(() => deployer.reconcile())
  .catch(err => console.error('startup failed:', err.message || err.code || err));
docker.docker(['version', '--format', '{{.Server.Version}}'])
  .then(v => console.log(`docker engine ${v}`))
  .catch(() => console.warn('docker is not reachable, start docker before deploying'));

function shutdown() {
  deployer.stopWorkers();
  monitor.stop();
  traffic.stop();
  api.close();
  edge.close();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
