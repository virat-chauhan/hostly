const router = require('express').Router();
const { query } = require('../db');
const deployer = require('../services/deployer');
const { HttpError, bad, wrap } = require('../utils/http');

router.post('/:token', wrap(async (req, res) => {
  const { rows } = await query('SELECT id, source_type, zip_path FROM projects WHERE hook_token = $1', [req.params.token]);
  const project = rows[0];
  if (!project) throw new HttpError(404, 'unknown deploy hook');
  if (project.source_type === 'upload' && !project.zip_path) throw bad('this project has no uploaded zip yet');

  const busy = await query(
    `SELECT 1 FROM deployments WHERE project_id = $1 AND status IN ('queued', 'building', 'starting') LIMIT 1`,
    [project.id]
  );
  if (busy.rowCount) return res.status(202).json({ queued: false, reason: 'a deployment is already in progress' });

  const dep = await deployer.create(project.id);
  res.status(201).json({ queued: true, deployment: dep.id });
}));

module.exports = router;
