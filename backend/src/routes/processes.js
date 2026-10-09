const os = require('os');
const router = require('express').Router();
const { query } = require('../db');
const deployer = require('../services/deployer');
const monitor = require('../services/monitor');
const docker = require('../utils/docker');
const { wrap } = require('../utils/http');

router.get('/', wrap(async (req, res) => {
  const running = (await query(
    `SELECT d.id, d.container_name, p.id AS project_id, p.name
     FROM deployments d JOIN projects p ON p.id = d.project_id
     WHERE p.user_id = $1 AND d.status = 'running' ORDER BY p.id`,
    [req.user.id]
  )).rows;

  const containers = await Promise.all(running.map(async r => ({
    deploymentId: r.id,
    projectId: r.project_id,
    project: r.name,
    container: r.container_name,
    processes: await docker.top(r.container_name).catch(() => []),
  })));

  res.json({
    server: {
      pid: process.pid,
      ppid: process.ppid,
      title: process.title,
      node: process.version,
      platform: process.platform,
      uptimeSeconds: Math.round(process.uptime()),
      rssMb: Math.round(process.memoryUsage().rss / 1048576),
      cpus: os.cpus().length,
      load: os.loadavg().map(n => Number(n.toFixed(2))),
      monitorThreadId: monitor.threadId(),
    },
    ...deployer.processes(req.user.id),
    containers,
  });
}));

module.exports = router;
