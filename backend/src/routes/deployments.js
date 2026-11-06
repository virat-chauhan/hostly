const router = require('express').Router();
const { query } = require('../db');
const deployer = require('../services/deployer');
const docker = require('../utils/docker');
const { HttpError, bad, wrap } = require('../utils/http');

async function owned(req) {
  const id = Number(req.params.id);
  const { rows } = Number.isInteger(id)
    ? await query(
        `SELECT d.* FROM deployments d JOIN projects p ON p.id = d.project_id
         WHERE d.id = $1 AND p.user_id = $2`,
        [id, req.user.id]
      )
    : { rows: [] };
  if (!rows[0]) throw new HttpError(404, 'deployment not found');
  return rows[0];
}

router.get('/:id/logs', wrap(async (req, res) => {
  const dep = await owned(req);
  const after = Number(req.query.after) || 0;
  const { rows } = await query(
    'SELECT id, line FROM build_logs WHERE deployment_id = $1 AND id > $2 ORDER BY id LIMIT 2000',
    [dep.id, after]
  );
  res.json({ lines: rows });
}));

router.get('/:id/runtime-logs', wrap(async (req, res) => {
  const dep = await owned(req);
  const logs = dep.container_name ? await docker.containerLogs(dep.container_name, 200) : '';
  res.json({ logs });
}));

router.post('/:id/cancel', wrap(async (req, res) => {
  const dep = await owned(req);
  if (!deployer.IN_PROGRESS.includes(dep.status)) throw bad('this deployment is not in progress');
  deployer.cancelJob(dep.id);
  res.json({ cancelled: true });
}));

router.post('/:id/rollback', wrap(async (req, res) => {
  const dep = await owned(req);
  if (dep.status === 'running') throw bad('this deployment is already live');
  if (!dep.image_tag || !(await docker.imageExists(dep.image_tag))) {
    throw bad('the image for this deployment was cleaned up, redeploy instead');
  }
  res.status(201).json(await deployer.create(dep.project_id, dep.image_tag));
}));

module.exports = router;
