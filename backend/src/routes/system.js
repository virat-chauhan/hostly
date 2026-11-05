const os = require('os');
const router = require('express').Router();
const deployer = require('../services/deployer');
const monitor = require('../services/monitor');

// a live look at the processes and threads behind the platform
router.get('/', (req, res) => {
  res.json({
    server: {
      pid: process.pid,
      ppid: process.ppid,
      node: process.version,
      platform: process.platform,
      uptimeSeconds: Math.round(process.uptime()),
      rssMb: Math.round(process.memoryUsage().rss / 1048576),
      load: os.loadavg().map(n => Number(n.toFixed(2))),
      cpus: os.cpus().length,
    },
    monitorThreadId: monitor.threadId(),
    ...deployer.snapshot(),
  });
});

module.exports = router;
