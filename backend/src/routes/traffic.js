const router = require('express').Router();
const { query } = require('../db');
const traffic = require('../services/traffic');
const owns = require('../middleware/owns');
const { wrap } = require('../utils/http');

const RANGES = {
  '1h': { seconds: 3600, bucket: 60 },
  '24h': { seconds: 86400, bucket: 900 },
  '7d': { seconds: 604800, bucket: 3600 },
};

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'WS'];
const CLASSES = { '2xx': [200, 299], '3xx': [300, 399], '4xx': [400, 499], '5xx': [500, 599] };

router.get('/:id/analytics', owns, wrap(async (req, res) => {
  const range = RANGES[req.query.range] ? req.query.range : '1h';
  const { seconds, bucket } = RANGES[range];
  const id = req.project.id;

  const series = (await query(
    `SELECT floor(extract(epoch FROM created_at) / $2::int)::bigint * $2::int AS bucket,
       count(*) FILTER (WHERE method = 'GET')::int AS get,
       count(*) FILTER (WHERE method = 'POST')::int AS post,
       count(*) FILTER (WHERE method NOT IN ('GET', 'POST'))::int AS other
     FROM request_logs
     WHERE project_id = $1 AND created_at > now() - make_interval(secs => $3::int)
     GROUP BY 1 ORDER BY 1`,
    [id, bucket, seconds]
  )).rows;

  const byBucket = new Map(series.map(r => [Number(r.bucket), r]));
  const end = Math.floor(Date.now() / 1000 / bucket) * bucket;
  const points = [];
  for (let t = end - seconds + bucket; t <= end; t += bucket) {
    const r = byBucket.get(t);
    points.push({ t: t * 1000, get: r ? r.get : 0, post: r ? r.post : 0, other: r ? r.other : 0 });
  }

  const totals = (await query(
    `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE method = 'GET')::int AS gets,
       count(*) FILTER (WHERE method = 'POST')::int AS posts,
       count(*) FILTER (WHERE status BETWEEN 200 AND 299)::int AS s2xx,
       count(*) FILTER (WHERE status BETWEEN 300 AND 399)::int AS s3xx,
       count(*) FILTER (WHERE status BETWEEN 400 AND 499)::int AS s4xx,
       count(*) FILTER (WHERE status >= 500)::int AS s5xx,
       COALESCE(avg(duration_ms), 0)::int AS avg_ms,
       COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::int AS p95_ms,
       COALESCE(avg(wait_ms), 0)::int AS avg_wait_ms
     FROM request_logs WHERE project_id = $1 AND created_at > now() - make_interval(secs => $2::int)`,
    [id, seconds]
  )).rows[0];

  const paths = (await query(
    `SELECT method, path, count(*)::int AS hits, COALESCE(avg(duration_ms), 0)::int AS avg_ms
     FROM request_logs WHERE project_id = $1 AND created_at > now() - make_interval(secs => $2::int)
     GROUP BY method, path ORDER BY hits DESC LIMIT 8`,
    [id, seconds]
  )).rows;

  res.json({ range, bucketSeconds: bucket, points, totals, paths });
}));

router.get('/:id/requests', owns, wrap(async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const conditions = ['project_id = $1'];
  const params = [req.project.id];

  const method = String(req.query.method || '').toUpperCase();
  if (METHODS.includes(method)) {
    params.push(method);
    conditions.push(`method = $${params.length}`);
  }
  const bounds = CLASSES[req.query.status];
  if (bounds) {
    params.push(bounds[0], bounds[1]);
    conditions.push(`status BETWEEN $${params.length - 1} AND $${params.length}`);
  }
  params.push(limit);

  const { rows } = await query(
    `SELECT id, method, path, status, duration_ms, wait_ms, ip, created_at
     FROM request_logs WHERE ${conditions.join(' AND ')} ORDER BY id DESC LIMIT $${params.length}`,
    params
  );
  res.json(rows);
}));

router.get('/:id/stream', owns, (req, res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  res.write(': connected\n\n');
  const channel = `p${req.project.id}`;
  const send = entry => res.write(`data: ${JSON.stringify(entry)}\n\n`);
  traffic.bus.on(channel, send);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    traffic.bus.off(channel, send);
    clearInterval(ping);
  });
});

module.exports = router;
