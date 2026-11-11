const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { query, pool } = require('../db');
const docker = require('../utils/docker');
const proxy = require('../proxy');
const quota = require('./quota');

const WORKER = path.join(__dirname, '..', 'workers', 'build-worker.js');
const IN_PROGRESS = ['queued', 'building', 'starting'];
const KEEP_IMAGES = 2;

const waiting = [];
const active = new Map();
const recent = [];
let gate = Promise.resolve();

function exclusive(fn) {
  const run = gate.then(fn);
  gate = run.catch(() => {});
  return run;
}

function enqueue(id, skipBuild) {
  waiting.push({ id, skipBuild });
  pump();
}

function pump() {
  while (active.size < config.maxBuilds && waiting.length) {
    const job = waiting.shift();
    const state = {
      child: null, buf: [], timer: null, procs: [], finished: false, cancelled: false,
      startedAt: Date.now(), skipBuild: job.skipBuild, userId: null, projectId: null, imageTag: null,
    };
    active.set(job.id, state);
    startJob(job, state).catch(err => release(job.id, state, err.message));
  }
}

function release(id, state, failMessage) {
  clearInterval(state.timer);
  active.delete(id);
  const done = failMessage ? fail(id, state, failMessage) : Promise.resolve();
  done.catch(() => {}).then(pump);
}

function admit(project, dep, imageTag, skipBuild) {
  return exclusive(async () => {
    if (!skipBuild) {
      const usage = await quota.userUsage(project.user_id);
      if (usage.totals.storageMb >= config.quota.storageMb) {
        return `storage quota is full (${Math.round(usage.totals.storageMb)} of ${config.quota.storageMb} MB), delete a project or an old deployment first`;
      }
    }
    const reserved = await quota.reservedMb(project.user_id, project.id);
    if (reserved + project.memory_mb > config.quota.ramMb) {
      return `not enough memory quota: this project needs ${project.memory_mb} MB but only ${config.quota.ramMb - reserved} of ${config.quota.ramMb} MB is free, stop another project or lower its memory`;
    }
    await query('UPDATE deployments SET status = $2, image_tag = $3, started_at = now() WHERE id = $1', [
      dep.id,
      skipBuild ? 'starting' : 'building',
      imageTag,
    ]);
    return null;
  });
}

async function startJob(job, state) {
  const dep = (await query('SELECT * FROM deployments WHERE id = $1', [job.id])).rows[0];
  if (!dep) return release(job.id, state);
  if (state.cancelled) {
    await setCancelled(job.id);
    return release(job.id, state);
  }

  const project = (await query('SELECT * FROM projects WHERE id = $1', [dep.project_id])).rows[0];
  const envRows = (await query('SELECT key, value FROM env_vars WHERE project_id = $1', [project.id])).rows;
  const imageTag = job.skipBuild ? dep.image_tag : `hostly/${project.slug}:d${dep.id}`;
  Object.assign(state, { userId: project.user_id, projectId: project.id, imageTag });

  const problem = await admit(project, dep, imageTag, job.skipBuild);
  if (problem) return release(job.id, state, problem);
  if (state.cancelled) {
    await setCancelled(job.id);
    return release(job.id, state);
  }

  const cpus = quota.cpuShare((await quota.runningCount(project.user_id, project.id)) + 1);
  const child = fork(WORKER, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  state.child = child;
  state.timer = setInterval(() => flush(job.id, state), 500);
  child.on('message', msg => onMessage(job.id, project, state, msg));
  child.on('exit', (code, signal) => onExit(job.id, state, code, signal));
  child.on('error', err => console.error('worker error:', err.message));

  await query('UPDATE deployments SET worker_pid = $2 WHERE id = $1', [dep.id, child.pid]);
  if (state.cancelled) return child.kill('SIGTERM');

  const runtime = config.runtimes[project.runtime] || config.runtimes.node20;
  child.send({
    job: {
      deploymentId: dep.id,
      dataDir: config.dataDir,
      sourceType: project.source_type,
      repoUrl: project.repo_url,
      branch: project.repo_branch,
      zipPath: project.zip_path,
      baseImage: runtime.image,
      buildCommand: project.build_command,
      startCommand: project.start_command,
      port: project.port,
      env: Object.fromEntries(envRows.map(r => [r.key, r.value])),
      imageTag,
      skipBuild: job.skipBuild,
      containerName: `hostly-d${dep.id}`,
      memory: `${project.memory_mb}m`,
      cpus,
      buildTimeout: config.buildTimeout,
      startTimeout: config.startTimeout,
    },
  });
}

async function flush(id, state) {
  if (!state.buf.length) return;
  const lines = state.buf.splice(0);
  try {
    await query('INSERT INTO build_logs (deployment_id, line) SELECT $1::int, unnest($2::text[])', [id, lines]);
  } catch {}
}

function trackProc(state, msg) {
  if (msg.event === 'start') {
    state.procs.push({ pid: msg.pid, ppid: msg.ppid, cmd: msg.cmd, startedAt: Date.now(), state: 'running' });
    return;
  }
  const proc = state.procs.find(p => p.pid === msg.pid);
  if (proc) Object.assign(proc, { state: 'exited', code: msg.code, signal: msg.signal, endedAt: Date.now() });
}

async function storageProblem(userId) {
  const usage = await quota.userUsage(userId);
  const used = Math.round(usage.totals.storageMb);
  return used > config.quota.storageMb ? `storage quota exceeded (${used} of ${config.quota.storageMb} MB)` : null;
}

async function onMessage(id, project, state, msg) {
  try {
    if (msg.type === 'log') {
      state.buf.push(msg.line);
    } else if (msg.type === 'proc') {
      trackProc(state, msg);
    } else if (msg.type === 'status') {
      await query('UPDATE deployments SET status = $2 WHERE id = $1', [id, msg.status]);
    } else if (msg.type === 'done') {
      state.finished = true;
      await flush(id, state);
      await query('UPDATE deployments SET image_mb = $2 WHERE id = $1', [id, msg.imageMb]);
      const problem = state.skipBuild ? null : await storageProblem(project.user_id);
      if (problem) {
        await fail(id, state, problem);
        await docker.removeContainer(msg.containerName);
        return;
      }
      try {
        await markRunning(id, project, msg);
      } catch (err) {
        await fail(id, state, `could not save deployment: ${err.message}`);
        await docker.removeContainer(msg.containerName);
      }
    } else if (msg.type === 'fail') {
      state.finished = true;
      await flush(id, state);
      await fail(id, state, msg.message);
    }
  } catch (err) {
    console.error('worker message error:', err.message);
  }
}

async function onExit(id, state, code, signal) {
  clearInterval(state.timer);
  await flush(id, state);
  if (!state.finished) {
    if (state.cancelled) await setCancelled(id);
    else await fail(id, state, `worker exited unexpectedly (code ${code}, signal ${signal})`);
  }
  await query('UPDATE deployments SET worker_pid = NULL WHERE id = $1', [id]).catch(() => {});
  remember(id, state, code, signal);
  active.delete(id);
  pump();
}

function remember(id, state, code, signal) {
  recent.unshift({
    deploymentId: id,
    userId: state.userId,
    projectId: state.projectId,
    pid: state.child ? state.child.pid : null,
    ppid: process.pid,
    startedAt: state.startedAt,
    endedAt: Date.now(),
    procs: state.procs,
    exit: { code, signal },
  });
  recent.length = Math.min(recent.length, 6);
}

const setCancelled = id =>
  query(
    `UPDATE deployments SET status = 'cancelled', finished_at = now(), worker_pid = NULL, image_tag = NULL, image_mb = 0
     WHERE id = $1`,
    [id]
  );

const markFailed = (id, message, dropImage) =>
  query(
    `UPDATE deployments SET status = 'failed', error = $2, finished_at = now(), worker_pid = NULL,
       image_tag = CASE WHEN $3::boolean THEN NULL ELSE image_tag END,
       image_mb = CASE WHEN $3::boolean THEN 0 ELSE image_mb END
     WHERE id = $1 AND status <> 'cancelled'`,
    [id, message, dropImage]
  );

async function fail(id, state, message) {
  await markFailed(id, message, !state.skipBuild);
  if (!state.skipBuild && state.imageTag) await docker.removeImage(state.imageTag);
}

async function markRunning(id, project, msg) {
  const client = await pool.connect();
  let old;
  try {
    await client.query('BEGIN');
    old = (await client.query(
      `SELECT container_name FROM deployments WHERE project_id = $1 AND status = 'running' AND id <> $2`,
      [project.id, id]
    )).rows;
    await client.query(
      `UPDATE deployments SET status = 'stopped', finished_at = now(), host_port = NULL, cpu_percent = NULL, mem_mb = NULL, disk_mb = NULL
       WHERE project_id = $1 AND status = 'running' AND id <> $2`,
      [project.id, id]
    );
    await client.query(
      `UPDATE deployments SET status = 'running', container_id = $2, container_name = $3, host_port = $4, error = NULL
       WHERE id = $1`,
      [id, msg.containerId, msg.containerName, msg.hostPort]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  proxy.setTarget(project.id, { port: msg.hostPort, userId: project.user_id });
  for (const o of old) await docker.removeContainer(o.container_name);
  await pruneImages(project.id);
  await quota.rebalanceCpu(project.user_id);
}

async function pruneImages(projectId) {
  const { rows } = await query(
    `SELECT image_tag FROM (
       SELECT image_tag, MAX(id) AS last FROM deployments
       WHERE project_id = $1 AND image_tag IS NOT NULL GROUP BY image_tag) t
     ORDER BY last DESC OFFSET $2`,
    [projectId, KEEP_IMAGES]
  );
  for (const { image_tag: tag } of rows) {
    await docker.removeImage(tag);
    await query('UPDATE deployments SET image_tag = NULL, image_mb = 0 WHERE project_id = $1 AND image_tag = $2', [projectId, tag]);
  }
}

async function create(projectId, imageTag = null) {
  const { rows } = await query('INSERT INTO deployments (project_id, image_tag) VALUES ($1, $2) RETURNING *', [
    projectId,
    imageTag,
  ]);
  enqueue(rows[0].id, Boolean(imageTag));
  return rows[0];
}

function cancelJob(id) {
  const i = waiting.findIndex(j => j.id === id);
  if (i >= 0) {
    waiting.splice(i, 1);
    setCancelled(id).catch(() => {});
    return true;
  }
  const state = active.get(id);
  if (!state) return false;
  state.cancelled = true;
  if (state.child) state.child.kill('SIGTERM');
  return true;
}

async function stopProject(project) {
  const { rows } = await query(
    `UPDATE deployments SET status = 'stopped', finished_at = now(), host_port = NULL, cpu_percent = NULL, mem_mb = NULL, disk_mb = NULL
     WHERE project_id = $1 AND status = 'running' RETURNING container_name`,
    [project.id]
  );
  proxy.removeTarget(project.id);
  for (const r of rows) await docker.removeContainer(r.container_name);
  await quota.rebalanceCpu(project.user_id);
}

async function purgeProject(project) {
  const { rows } = await query(
    'SELECT id, status, container_name, image_tag FROM deployments WHERE project_id = $1',
    [project.id]
  );
  for (const d of rows) if (IN_PROGRESS.includes(d.status)) cancelJob(d.id);
  proxy.removeTarget(project.id);
  for (const name of new Set(rows.map(d => d.container_name).filter(Boolean))) await docker.removeContainer(name);
  for (const tag of new Set(rows.map(d => d.image_tag).filter(Boolean))) await docker.removeImage(tag);
  if (project.zip_path) fs.rmSync(project.zip_path, { force: true });
}

async function reconcile() {
  await query(
    `UPDATE deployments SET status = 'failed', error = 'server restarted while deploying', finished_at = now(), worker_pid = NULL
     WHERE status IN ('queued', 'building', 'starting')`
  );
  const { rows } = await query(
    `SELECT d.id, d.container_name, p.id AS project_id, p.user_id
     FROM deployments d JOIN projects p ON p.id = d.project_id
     WHERE d.status = 'running'`
  );
  const users = new Set();
  for (const d of rows) {
    if (await docker.isRunning(d.container_name)) {
      const port = await docker.hostPort(d.container_name).catch(() => null);
      if (port) {
        proxy.setTarget(d.project_id, { port, userId: d.user_id });
        await query('UPDATE deployments SET host_port = $2 WHERE id = $1', [d.id, port]);
        users.add(d.user_id);
        continue;
      }
    }
    await query(
      `UPDATE deployments SET status = 'failed', error = 'container was not running after a server restart', finished_at = now()
       WHERE id = $1`,
      [d.id]
    );
  }
  for (const userId of users) await quota.rebalanceCpu(userId);
}

function stopWorkers() {
  for (const state of active.values()) if (state.child) state.child.kill('SIGTERM');
}

function snapshot() {
  return {
    maxConcurrent: config.maxBuilds,
    waiting: waiting.map(j => j.id),
    workers: [...active].map(([id, s]) => ({
      deploymentId: id,
      pid: s.child ? s.child.pid : null,
      ppid: process.pid,
      runningSeconds: Math.round((Date.now() - s.startedAt) / 1000),
    })),
  };
}

function processes(userId) {
  return {
    queued: waiting.length,
    maxConcurrent: config.maxBuilds,
    workers: [...active]
      .filter(([, s]) => s.userId === userId)
      .map(([id, s]) => ({
        deploymentId: id,
        projectId: s.projectId,
        pid: s.child ? s.child.pid : null,
        ppid: process.pid,
        startedAt: s.startedAt,
        procs: s.procs,
      })),
    recent: recent.filter(r => r.userId === userId),
  };
}

module.exports = { create, cancelJob, stopProject, purgeProject, reconcile, stopWorkers, snapshot, processes, IN_PROGRESS };
