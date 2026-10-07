const fs = require('fs');
const config = require('../config');
const { query } = require('../db');
const docker = require('../utils/docker');

const toMb = bytes => bytes / 1048576;

async function reservedMb(userId, exceptProjectId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(p.memory_mb), 0)::int AS mb FROM projects p
     WHERE p.user_id = $1 AND p.id <> $2 AND EXISTS (
       SELECT 1 FROM deployments d WHERE d.project_id = p.id AND d.status IN ('running', 'building', 'starting'))`,
    [userId, exceptProjectId]
  );
  return rows[0].mb;
}

async function runningCount(userId, exceptProjectId) {
  const { rows } = await query(
    `SELECT count(DISTINCT d.project_id)::int AS n FROM deployments d JOIN projects p ON p.id = d.project_id
     WHERE p.user_id = $1 AND p.id <> $2 AND d.status = 'running'`,
    [userId, exceptProjectId]
  );
  return rows[0].n;
}

const cpuShare = count => Math.max(0.01, Math.floor((config.quota.cpu / Math.max(1, count)) * 100) / 100);

async function rebalanceCpu(userId) {
  const { rows } = await query(
    `SELECT d.container_name FROM deployments d JOIN projects p ON p.id = d.project_id
     WHERE p.user_id = $1 AND d.status = 'running'`,
    [userId]
  );
  if (!rows.length) return;
  const cpus = cpuShare(rows.length);
  await Promise.all(rows.map(r => docker.update(r.container_name, { cpus }).catch(() => {})));
}

async function userUsage(userId) {
  const projects = (await query(
    `SELECT p.id, p.name, p.slug, p.memory_mb, p.zip_path,
       (SELECT status FROM deployments d WHERE d.project_id = p.id ORDER BY d.id DESC LIMIT 1) AS status
     FROM projects p WHERE p.user_id = $1 ORDER BY p.id`,
    [userId]
  )).rows;

  const live = new Map((await query(
    `SELECT d.project_id, d.cpu_percent, d.mem_mb, d.disk_mb FROM deployments d
     JOIN projects p ON p.id = d.project_id WHERE p.user_id = $1 AND d.status = 'running'`,
    [userId]
  )).rows.map(r => [r.project_id, r]));

  const images = new Map((await query(
    `SELECT project_id, COALESCE(SUM(image_mb), 0)::float AS mb FROM (
       SELECT DISTINCT ON (d.project_id, d.image_tag) d.project_id, d.image_mb
       FROM deployments d JOIN projects p ON p.id = d.project_id
       WHERE p.user_id = $1 AND d.image_tag IS NOT NULL
       ORDER BY d.project_id, d.image_tag, d.id DESC) t
     GROUP BY project_id`,
    [userId]
  )).rows.map(r => [r.project_id, r.mb]));

  const cpuLimit = live.size ? cpuShare(live.size) : 0;
  const rows = projects.map(p => {
    const now = live.get(p.id);
    const zipMb = p.zip_path && fs.existsSync(p.zip_path) ? toMb(fs.statSync(p.zip_path).size) : 0;
    const imageMb = images.get(p.id) || 0;
    const runtimeMb = now ? now.disk_mb || 0 : 0;
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      status: p.status,
      running: Boolean(now),
      memoryLimitMb: p.memory_mb,
      cpuLimit: now ? cpuLimit : 0,
      cpuCores: now ? (now.cpu_percent || 0) / 100 : 0,
      memMb: now ? now.mem_mb || 0 : 0,
      storage: { imageMb, zipMb, runtimeMb, totalMb: imageMb + zipMb + runtimeMb },
    };
  });

  const sum = pick => rows.reduce((total, r) => total + pick(r), 0);
  return {
    quota: config.quota,
    projects: rows,
    totals: {
      cpuCores: sum(r => r.cpuCores),
      memMb: sum(r => r.memMb),
      allocatedMb: sum(r => (r.running ? r.memoryLimitMb : 0)),
      storageMb: sum(r => r.storage.totalMb),
    },
  };
}

module.exports = { reservedMb, runningCount, cpuShare, rebalanceCpu, userUsage };
