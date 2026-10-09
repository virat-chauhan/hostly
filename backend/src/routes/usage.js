const router = require('express').Router();
const { query } = require('../db');
const quota = require('../services/quota');
const scheduler = require('../services/scheduler');
const owns = require('../middleware/owns');
const { wrap } = require('../utils/http');

const minutes = req => Math.min(180, Math.max(5, Number(req.query.minutes) || 30));

router.get('/', wrap(async (req, res) => {
  const usage = await quota.userUsage(req.user.id);
  res.json({ ...usage, scheduler: scheduler.stats(req.user.id) });
}));

router.get('/history', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT extract(epoch FROM s.created_at) * 1000 AS t, SUM(s.cpu_cores)::float AS cpu, SUM(s.mem_mb)::float AS mem
     FROM usage_samples s JOIN projects p ON p.id = s.project_id
     WHERE p.user_id = $1 AND s.created_at > now() - make_interval(mins => $2::int)
     GROUP BY s.created_at ORDER BY s.created_at`,
    [req.user.id, minutes(req)]
  );
  res.json(rows.map(r => ({ t: Number(r.t), cpu: r.cpu, mem: r.mem })));
}));

router.get('/projects/:id', owns, wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT extract(epoch FROM created_at) * 1000 AS t, cpu_cores::float AS cpu, mem_mb::float AS mem
     FROM usage_samples WHERE project_id = $1 AND created_at > now() - make_interval(mins => $2::int)
     ORDER BY created_at`,
    [req.project.id, minutes(req)]
  );
  res.json(rows.map(r => ({ t: Number(r.t), cpu: r.cpu, mem: r.mem })));
}));

module.exports = router;
