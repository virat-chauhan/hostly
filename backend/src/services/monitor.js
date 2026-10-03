const path = require('path');
const { Worker } = require('worker_threads');
const { query } = require('../db');
const docker = require('../utils/docker');
const proxy = require('../proxy');
const quota = require('./quota');

const SAMPLE_EVERY = 10000;

let thread = null;
let threadId = null;
let lastSample = 0;
const misses = new Map();

async function onStats({ threadId: id, stats }) {
  threadId = id;
  const seen = new Map(stats.map(s => [s.name, s]));
  const { rows } = await query(
    `SELECT d.id, d.project_id, d.container_name, p.user_id
     FROM deployments d JOIN projects p ON p.id = d.project_id
     WHERE d.status = 'running'`
  );

  const takeSample = Date.now() - lastSample >= SAMPLE_EVERY;
  const sampleTime = new Date();
  if (takeSample) lastSample = Date.now();

  for (const d of rows) {
    const stat = seen.get(d.container_name);
    if (stat) {
      misses.delete(d.id);
      await query(
        'UPDATE deployments SET cpu_percent = $2, mem_mb = $3, disk_mb = COALESCE($4, disk_mb) WHERE id = $1',
        [d.id, stat.cpu, stat.memMb, stat.diskMb]
      );
      if (takeSample) {
        await query('INSERT INTO usage_samples (project_id, cpu_cores, mem_mb, created_at) VALUES ($1, $2, $3, $4)', [
          d.project_id,
          stat.cpu / 100,
          stat.memMb,
          sampleTime,
        ]);
      }
      continue;
    }

    const count = (misses.get(d.id) || 0) + 1;
    misses.set(d.id, count);
    if (count < 3) continue;

    misses.delete(d.id);
    proxy.removeTarget(d.project_id);
    await query(
      `UPDATE deployments SET status = 'failed', error = 'container stopped unexpectedly', finished_at = now(),
       host_port = NULL, cpu_percent = NULL, mem_mb = NULL, disk_mb = NULL WHERE id = $1`,
      [d.id]
    );
    await query('INSERT INTO build_logs (deployment_id, line) VALUES ($1, $2)', [d.id, 'container stopped unexpectedly']);
    await docker.removeContainer(d.container_name);
    await quota.rebalanceCpu(d.user_id);
  }
}

function start() {
  thread = new Worker(path.join(__dirname, '..', 'workers', 'monitor-thread.js'));
  thread.on('message', msg => onStats(msg).catch(err => console.error('monitor:', err.message || err.code || err)));
  thread.on('error', err => console.error('monitor thread crashed:', err.message));
}

function stop() {
  if (thread) thread.terminate();
}

module.exports = { start, stop, threadId: () => threadId };
