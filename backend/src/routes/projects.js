const fs = require('fs');
const path = require('path');
const router = require('express').Router();
const multer = require('multer');
const config = require('../config');
const { query, pool } = require('../db');
const deployer = require('../services/deployer');
const quota = require('../services/quota');
const proxy = require('../proxy');
const docker = require('../utils/docker');
const { HttpError, bad, wrap } = require('../utils/http');
const { parseEnv } = require('../utils/env');
const { toSlug, isReserved, checkSlug, checkHost } = require('../utils/slug');

const upload = multer({
  dest: path.join(config.dataDir, 'tmp'),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.zip$/i.test(file.originalname)),
});

const dropTmp = req => {
  if (req.file) fs.rmSync(req.file.path, { force: true });
};

const decorate = ({ zip_path, hook_token, ...project }) => ({
  ...project,
  domain: config.domainFor(project.slug),
  url: config.urlFor(project.slug),
  hook_path: hook_token ? `/api/hooks/${hook_token}` : null,
});

async function owned(req) {
  const id = Number(req.params.id);
  const { rows } = Number.isInteger(id)
    ? await query('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [id, req.user.id])
    : { rows: [] };
  if (!rows[0]) throw new HttpError(404, 'project not found');
  return rows[0];
}

function readSettings(body) {
  const runtime = body.runtime || 'node20';
  if (!config.runtimes[runtime]) throw bad('unknown runtime');
  const port = parseInt(body.port, 10);
  if (!(port > 0 && port < 65536)) throw bad('port must be between 1 and 65535');
  const build = String(body.build_command || '').trim();
  const start = String(body.start_command || '').trim();
  if (!start) throw bad('start command is required');
  if (/[\r\n]/.test(build + start)) throw bad('commands must be a single line');
  return { runtime, port, build, start };
}

function readBranch(value) {
  const branch = String(value || '').trim();
  if (!branch) return null;
  if (!/^[A-Za-z0-9][\w./-]*$/.test(branch)) throw bad('invalid branch name');
  return branch;
}

async function insertProject(fields) {
  const base = toSlug(fields.name);
  for (let n = isReserved(base) ? 2 : 1; n < 500; n++) {
    const slug = n === 1 ? base : base + n;
    try {
      const { rows } = await query(
        `INSERT INTO projects (user_id, name, slug, source_type, repo_url, repo_branch, runtime, build_command, start_command, port)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [fields.userId, fields.name, slug, fields.sourceType, fields.repoUrl, fields.branch,
         fields.runtime, fields.build, fields.start, fields.port]
      );
      return rows[0];
    } catch (err) {
      if (err.code !== '23505') throw err;
    }
  }
  throw new HttpError(409, 'could not find a free subdomain, try another name');
}

function saveZip(tmpPath, projectId) {
  const dest = path.join(config.dataDir, 'uploads', `${projectId}.zip`);
  fs.renameSync(tmpPath, dest);
  return dest;
}

async function replaceEnv(client, projectId, vars) {
  await client.query('DELETE FROM env_vars WHERE project_id = $1', [projectId]);
  if (!vars.length) return;
  await client.query(
    'INSERT INTO env_vars (project_id, key, value) SELECT $1::int, unnest($2::text[]), unnest($3::text[])',
    [projectId, vars.map(v => v.key), vars.map(v => v.value)]
  );
}

router.get('/', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.name, p.slug, p.source_type, p.repo_url, p.memory_mb, p.created_at,
       (SELECT status FROM deployments d WHERE d.project_id = p.id ORDER BY d.id DESC LIMIT 1) AS status,
       EXISTS (SELECT 1 FROM deployments d WHERE d.project_id = p.id AND d.status = 'running') AS live
     FROM projects p WHERE p.user_id = $1 ORDER BY p.id DESC`,
    [req.user.id]
  );
  res.json(rows.map(decorate));
}));

router.get('/check-slug', wrap(async (req, res) => {
  const { slug, error } = checkSlug(req.query.slug);
  if (error) return res.json({ slug, available: false, reason: error });
  const { rows } = await query('SELECT id FROM projects WHERE slug = $1 AND id <> $2', [slug, Number(req.query.project) || 0]);
  res.json({ slug, available: !rows.length, reason: rows.length ? 'that subdomain is taken' : null });
}));

router.post('/', upload.single('zip'), wrap(async (req, res) => {
  try {
    const b = req.body;
    const name = String(b.name || '').trim();
    if (!name || name.length > 60) throw bad('give the project a name (60 characters max)');

    const sourceType = b.source_type;
    let repoUrl = null;
    if (sourceType === 'github') {
      repoUrl = String(b.repo_url || '').trim();
      if (!/^https:\/\/\S+$/.test(repoUrl) || repoUrl.length > 300) throw bad('enter a public https repository url');
    } else if (sourceType === 'upload') {
      if (!req.file) throw bad('upload a .zip file');
    } else {
      throw bad('choose github or upload');
    }

    const settings = readSettings(b);
    const branch = sourceType === 'github' ? readBranch(b.repo_branch) : null;
    const env = parseEnv(b.env);

    const project = await insertProject({ userId: req.user.id, name, sourceType, repoUrl, branch, ...settings });
    proxy.bindHost(proxy.slugHost(project.slug), project.id);
    if (req.file) {
      const zipPath = saveZip(req.file.path, project.id);
      await query('UPDATE projects SET zip_path = $2 WHERE id = $1', [project.id, zipPath]);
    }

    const client = await pool.connect();
    try {
      await replaceEnv(client, project.id, env);
    } finally {
      client.release();
    }

    await deployer.create(project.id);
    res.status(201).json(decorate(project));
  } catch (err) {
    dropTmp(req);
    throw err;
  }
}));

router.get('/:id', wrap(async (req, res) => {
  const project = await owned(req);
  const env = (await query('SELECT key, value FROM env_vars WHERE project_id = $1 ORDER BY key', [project.id])).rows;
  const domains = (await query('SELECT id, host, created_at FROM domains WHERE project_id = $1 ORDER BY id', [project.id])).rows;
  const deployments = (await query(
    `SELECT id, status, image_tag, container_id, host_port, worker_pid, cpu_percent, mem_mb, disk_mb, image_mb, error,
            created_at, started_at, finished_at
     FROM deployments WHERE project_id = $1 ORDER BY id DESC LIMIT 20`,
    [project.id]
  )).rows;
  res.json({
    project: decorate(project),
    env,
    domains,
    deployments,
    live: deployments.some(d => d.status === 'running'),
  });
}));

router.patch('/:id', wrap(async (req, res) => {
  const project = await owned(req);
  const s = readSettings(req.body);
  const branch = project.source_type === 'github' ? readBranch(req.body.repo_branch) : null;
  const { rows } = await query(
    `UPDATE projects SET runtime = $2, build_command = $3, start_command = $4, port = $5, repo_branch = $6
     WHERE id = $1 RETURNING *`,
    [project.id, s.runtime, s.build, s.start, s.port, branch]
  );
  res.json(decorate(rows[0]));
}));

router.put('/:id/resources', wrap(async (req, res) => {
  const project = await owned(req);
  const mb = parseInt(req.body.memory_mb, 10);
  const { minMemoryMb } = config.project;
  if (!(mb >= minMemoryMb && mb <= config.quota.ramMb)) {
    throw bad(`memory must be between ${minMemoryMb} and ${config.quota.ramMb} MB`);
  }
  const reserved = await quota.reservedMb(req.user.id, project.id);
  if (reserved + mb > config.quota.ramMb) {
    throw bad(`only ${config.quota.ramMb - reserved} MB are free in your memory quota, other projects use the rest`);
  }
  await query('UPDATE projects SET memory_mb = $2 WHERE id = $1', [project.id, mb]);
  const live = (await query(
    `SELECT container_name FROM deployments WHERE project_id = $1 AND status = 'running'`,
    [project.id]
  )).rows[0];
  let applied = false;
  if (live) applied = await docker.update(live.container_name, { memoryMb: mb }).then(() => true).catch(() => false);
  res.json({ memory_mb: mb, applied });
}));

router.put('/:id/domain', wrap(async (req, res) => {
  const project = await owned(req);
  const { slug, error } = checkSlug(req.body.slug);
  if (error) throw bad(error);
  if (slug === project.slug) return res.json(decorate(project));
  try {
    const { rows } = await query('UPDATE projects SET slug = $2 WHERE id = $1 RETURNING *', [project.id, slug]);
    proxy.unbindHost(proxy.slugHost(project.slug));
    proxy.bindHost(proxy.slugHost(slug), project.id);
    res.json(decorate(rows[0]));
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'that subdomain is taken');
    throw err;
  }
}));

router.post('/:id/domains', wrap(async (req, res) => {
  const project = await owned(req);
  const { host, error } = checkHost(req.body.host, config.baseDomain);
  if (error) throw bad(error);
  const count = (await query('SELECT count(*)::int AS n FROM domains WHERE project_id = $1', [project.id])).rows[0].n;
  if (count >= 5) throw bad('you can connect up to 5 custom domains per project');
  try {
    const { rows } = await query('INSERT INTO domains (project_id, host) VALUES ($1, $2) RETURNING id, host, created_at', [project.id, host]);
    proxy.bindHost(host, project.id);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'that domain is already connected to a project');
    throw err;
  }
}));

router.delete('/:id/domains/:domainId', wrap(async (req, res) => {
  const project = await owned(req);
  const { rows } = await query('DELETE FROM domains WHERE id = $1 AND project_id = $2 RETURNING host', [
    Number(req.params.domainId) || 0,
    project.id,
  ]);
  if (!rows[0]) throw new HttpError(404, 'domain not found');
  proxy.unbindHost(rows[0].host);
  res.json({ removed: true });
}));

router.post('/:id/hook/regenerate', wrap(async (req, res) => {
  const project = await owned(req);
  const { rows } = await query(
    `UPDATE projects SET hook_token = replace(gen_random_uuid()::text, '-', '') WHERE id = $1 RETURNING hook_token`,
    [project.id]
  );
  res.json({ hook_path: `/api/hooks/${rows[0].hook_token}` });
}));

router.put('/:id/env', wrap(async (req, res) => {
  const project = await owned(req);
  const vars = parseEnv(req.body.env);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await replaceEnv(client, project.id, vars);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ saved: vars.length });
}));

router.post('/:id/deploy', upload.single('zip'), wrap(async (req, res) => {
  try {
    const project = await owned(req);
    if (req.file) {
      if (project.source_type !== 'upload') throw bad('this project deploys from github');
      const zipPath = saveZip(req.file.path, project.id);
      await query('UPDATE projects SET zip_path = $2 WHERE id = $1', [project.id, zipPath]);
    } else if (project.source_type === 'upload' && !project.zip_path) {
      throw bad('upload a .zip file first');
    }
    res.status(201).json(await deployer.create(project.id));
  } catch (err) {
    dropTmp(req);
    throw err;
  }
}));

router.post('/:id/restart', wrap(async (req, res) => {
  const project = await owned(req);
  const { rows } = await query(
    `SELECT image_tag FROM deployments
     WHERE project_id = $1 AND image_tag IS NOT NULL AND status IN ('running', 'stopped', 'failed')
     ORDER BY id DESC LIMIT 1`,
    [project.id]
  );
  if (!rows[0] || !(await docker.imageExists(rows[0].image_tag))) throw bad('nothing to restart yet, deploy first');
  res.status(201).json(await deployer.create(project.id, rows[0].image_tag));
}));

router.post('/:id/stop', wrap(async (req, res) => {
  await deployer.stopProject(await owned(req));
  res.json({ stopped: true });
}));

router.delete('/:id', wrap(async (req, res) => {
  const project = await owned(req);
  const domains = (await query('SELECT host FROM domains WHERE project_id = $1', [project.id])).rows;
  await deployer.purgeProject(project);
  await query('DELETE FROM projects WHERE id = $1', [project.id]);
  proxy.unbindHost(proxy.slugHost(project.slug));
  for (const d of domains) proxy.unbindHost(d.host);
  res.json({ deleted: true });
}));

module.exports = router;
