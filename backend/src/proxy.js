const http = require('http');
const httpProxy = require('http-proxy');
const config = require('./config');
const scheduler = require('./services/scheduler');
const traffic = require('./services/traffic');

const hosts = new Map();
const targets = new Map();

const slugHost = slug => `${slug}.${config.baseDomain}`;
const bindHost = (host, projectId) => hosts.set(host.toLowerCase(), projectId);
const unbindHost = host => hosts.delete(host.toLowerCase());
const setTarget = (projectId, target) => targets.set(projectId, target);
const removeTarget = projectId => targets.delete(projectId);

const proxy = httpProxy.createProxyServer({ xfwd: true, changeOrigin: true });

proxy.on('proxyReq', (proxyReq, req) => {
  proxyReq.setHeader('x-forwarded-host', req.headers.host || '');
});

proxy.on('error', (err, req, res) => {
  if (res.writeHead && !res.headersSent) {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('the app is not responding');
  } else if (res.destroy) {
    res.destroy();
  }
});

const hostOf = req => (req.headers.host || '').split(':')[0].toLowerCase();
const addressOf = req => String(req.socket.remoteAddress || '').replace('::ffff:', '');
const pathOf = req => (req.url || '/').split('?')[0].slice(0, 300);

function notice(res, status, title, text) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;color:#222">
<h2 style="margin-bottom:8px">${title}</h2><p style="color:#666">${text}</p></body>`);
}

async function handle(req, res) {
  const projectId = hosts.get(hostOf(req));
  if (!projectId) return notice(res, 404, 'Nothing here', 'No project is connected to this domain.');
  const target = targets.get(projectId);
  if (!target) return notice(res, 503, 'This app is not running', 'The project exists but has no live deployment right now.');

  const arrived = Date.now();
  let lease = null;
  let began = 0;
  let closed = false;

  res.on('close', () => {
    closed = true;
    if (!lease) return;
    lease.release();
    traffic.record({
      projectId,
      method: req.method,
      path: pathOf(req),
      status: res.headersSent || res.writableEnded ? res.statusCode : 499,
      durationMs: Date.now() - began,
      waitMs: lease.waitMs,
      ip: addressOf(req),
      at: new Date(began).toISOString(),
    });
  });

  const streaming = String(req.headers.accept || '').includes('text/event-stream');
  try {
    lease = streaming ? { waitMs: 0, release() {} } : await scheduler.acquire(target.userId, projectId);
  } catch (err) {
    traffic.record({
      projectId,
      method: req.method,
      path: pathOf(req),
      status: 503,
      durationMs: 0,
      waitMs: Date.now() - arrived,
      ip: addressOf(req),
      at: new Date(arrived).toISOString(),
    });
    res.writeHead(503, { 'content-type': 'text/plain', 'retry-after': '5' });
    return res.end(`too many requests are waiting for this account, ${err.message}`);
  }

  if (closed) return lease.release();
  began = Date.now();
  proxy.web(req, res, { target: `http://127.0.0.1:${target.port}` });
}

function start() {
  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  server.on('upgrade', (req, socket, head) => {
    const projectId = hosts.get(hostOf(req));
    const target = targets.get(projectId);
    if (!target) return socket.destroy();
    traffic.record({
      projectId,
      method: 'WS',
      path: pathOf(req),
      status: 101,
      durationMs: 0,
      waitMs: 0,
      ip: addressOf(req),
      at: new Date().toISOString(),
    });
    proxy.ws(req, socket, head, { target: `http://127.0.0.1:${target.port}` });
  });

  server.listen(config.proxyPort, () => {
    console.log(`proxy listening on :${config.proxyPort} for *.${config.baseDomain}`);
  });
  return server;
}

module.exports = { start, slugHost, bindHost, unbindHost, setTarget, removeTarget };
