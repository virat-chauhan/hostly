const { EventEmitter } = require('events');
const { query } = require('../db');

const bus = new EventEmitter();
bus.setMaxListeners(0);

let buffer = [];
let timers = [];

function record(entry) {
  buffer.push(entry);
  bus.emit(`p${entry.projectId}`, entry);
}

async function flush() {
  if (!buffer.length) return;
  const rows = buffer;
  buffer = [];
  try {
    await query(
      `INSERT INTO request_logs (project_id, method, path, status, duration_ms, wait_ms, ip, created_at)
       SELECT t.* FROM unnest($1::int[], $2::text[], $3::text[], $4::int[], $5::int[], $6::int[], $7::text[], $8::timestamptz[])
         AS t(project_id, method, path, status, duration_ms, wait_ms, ip, created_at)
       WHERE EXISTS (SELECT 1 FROM projects p WHERE p.id = t.project_id)`,
      [
        rows.map(r => r.projectId),
        rows.map(r => r.method),
        rows.map(r => r.path),
        rows.map(r => r.status),
        rows.map(r => r.durationMs),
        rows.map(r => r.waitMs),
        rows.map(r => r.ip),
        rows.map(r => r.at),
      ]
    );
  } catch (err) {
    console.error('could not save request logs:', err.message);
  }
}

async function prune() {
  await query(`DELETE FROM request_logs WHERE created_at < now() - interval '7 days'`).catch(() => {});
  await query(`DELETE FROM usage_samples WHERE created_at < now() - interval '3 hours'`).catch(() => {});
}

function start() {
  timers = [setInterval(flush, 1000), setInterval(prune, 3600000)];
  prune();
}

async function stop() {
  timers.forEach(clearInterval);
  await flush();
}

module.exports = { bus, record, start, stop };
