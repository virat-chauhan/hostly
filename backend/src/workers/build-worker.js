const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');
const AdmZip = require('adm-zip');
const docker = require('../utils/docker');

let job = null;
let current = null;
let launched = false;

function send(msg, cb) {
  if (!process.connected) return cb && cb();
  process.send(msg, cb);
}

function log(text) {
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\u0000/g, '').replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, '').slice(0, 2000);
    if (line.trim()) send({ type: 'log', line });
  }
}

function sendAndExit(msg, code) {
  send(msg, () => process.exit(code));
}

function abort() {
  if (current) current.kill('SIGKILL');
  if (job) {
    try { execFileSync('docker', ['rm', '-f', job.containerName], { stdio: 'ignore' }); } catch {}
  }
  process.exit(0);
}

process.on('SIGTERM', abort);
process.on('disconnect', abort);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function run(cmd, args, { cwd, env, timeout, label }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env } });
    current = child;
    log(`$ ${label} (pid ${child.pid}, parent ${process.pid})`);
    if (child.pid) send({ type: 'proc', event: 'start', pid: child.pid, ppid: process.pid, cmd: label });

    for (const stream of [child.stdout, child.stderr]) {
      readline.createInterface({ input: stream }).on('line', line => log(line));
    }

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, timeout);

    child.on('error', err => {
      clearTimeout(timer);
      reject(new Error(`could not run ${cmd}: ${err.message}`));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      current = null;
      if (child.pid) send({ type: 'proc', event: 'exit', pid: child.pid, code, signal });
      if (timedOut) return reject(new Error(`${label} timed out`));
      if (code !== 0) return reject(new Error(`${label} exited with code ${code}`));
      resolve();
    });
  });
}

function extractZip(zipPath, dest) {
  const root = path.resolve(dest);
  fs.mkdirSync(root, { recursive: true });
  for (const entry of new AdmZip(zipPath).getEntries()) {
    if (entry.isDirectory || entry.entryName.startsWith('__MACOSX')) continue;
    const target = path.resolve(root, entry.entryName);
    if (!target.startsWith(root + path.sep)) throw new Error('zip contains an unsafe path');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
    const mode = (entry.attr >>> 16) & 0o777;
    if (mode) fs.chmodSync(target, mode);
  }
  const items = fs.readdirSync(root).filter(n => n !== '__MACOSX');
  if (items.length === 1 && fs.statSync(path.join(root, items[0])).isDirectory()) {
    return path.join(root, items[0]);
  }
  return root;
}

function dockerfile() {
  const lines = [`FROM ${job.baseImage}`, 'WORKDIR /app', `ENV PORT=${job.port}`];
  for (const key of Object.keys(job.env)) {
    lines.push(`ARG ${key}`, `ENV ${key}="$${key}"`);
  }
  lines.push('COPY . .');
  if (job.buildCommand) lines.push(`RUN ${job.buildCommand}`);
  lines.push(`EXPOSE ${job.port}`, `CMD ["sh", "-c", ${JSON.stringify(job.startCommand)}]`);
  return lines.join('\n') + '\n';
}

async function build(workDir) {
  let context;
  if (job.sourceType === 'github') {
    context = path.join(workDir, 'src');
    const branch = job.branch ? ['--branch', job.branch] : [];
    await run('git', ['clone', '--depth', '1', ...branch, '--', job.repoUrl, context], {
      env: { GIT_TERMINAL_PROMPT: '0' },
      timeout: 120000,
      label: `git clone ${job.repoUrl}`,
    });
  } else {
    log('extracting uploaded zip');
    context = extractZip(job.zipPath, path.join(workDir, 'src'));
  }

  fs.writeFileSync(path.join(context, 'Dockerfile.hostly'), dockerfile());
  const ignore = path.join(context, '.dockerignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, 'node_modules\n.git\n');

  const buildArgs = Object.entries(job.env).flatMap(([k, v]) => ['--build-arg', `${k}=${v}`]);
  await run('docker', ['build', '--progress=plain', '-t', job.imageTag, '-f', 'Dockerfile.hostly', ...buildArgs, '.'], {
    cwd: context,
    timeout: job.buildTimeout,
    label: `docker build -t ${job.imageTag}`,
  });
}

function ping(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 2000 }, res => {
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function waitReady(port) {
  const deadline = Date.now() + job.startTimeout;
  while (Date.now() < deadline) {
    if (!(await docker.isRunning(job.containerName))) throw new Error('container exited before the app started');
    if (await ping(port)) return;
    await sleep(1500);
  }
  throw new Error(`app did not answer on port ${job.port} within ${job.startTimeout / 1000}s, check that it listens on $PORT`);
}

async function ownSize() {
  try {
    const [total, base] = await Promise.all([
      docker.imageBytes(job.imageTag),
      docker.imageBytes(job.baseImage).catch(() => 0),
    ]);
    return Math.max(0, total - base) / 1048576;
  } catch {
    return 0;
  }
}

async function start() {
  log(`starting container ${job.containerName} with ${job.memory} memory and ${job.cpus} cpu`);
  launched = true;
  const args = [
    'run', '-d', '--name', job.containerName,
    '--memory', job.memory, '--memory-swap', job.memory, '--cpus', String(job.cpus), '--pids-limit', '512',
    '--restart', 'unless-stopped',
    '-p', `127.0.0.1::${job.port}`,
    '-e', `PORT=${job.port}`,
  ];
  for (const [k, v] of Object.entries(job.env)) args.push('-e', `${k}=${v}`);
  args.push(job.imageTag);

  const containerId = await docker.docker(args);
  const hostPort = await docker.hostPort(job.containerName);
  log(`container ${containerId.slice(0, 12)} mapped to host port ${hostPort}, waiting for the app`);
  await waitReady(hostPort);
  return { containerId, containerName: job.containerName, hostPort, imageTag: job.imageTag, imageMb: await ownSize() };
}

process.once('message', async ({ job: payload }) => {
  job = payload;
  process.title = `hostly-worker-${job.deploymentId}`;
  const workDir = path.join(job.dataDir, 'workspaces', String(job.deploymentId));
  try {
    if (!job.skipBuild) {
      try {
        await build(workDir);
      } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
      send({ type: 'status', status: 'starting' });
    }
    const result = await start();
    log('deployment is live');
    sendAndExit({ type: 'done', ...result }, 0);
  } catch (err) {
    log(`failed: ${err.message}`);
    const tail = launched ? await docker.containerLogs(job.containerName, 30) : '';
    if (tail.trim()) {
      log('last output from the container:');
      log(tail);
    }
    await docker.removeContainer(job.containerName);
    if (!job.skipBuild) await docker.removeImage(job.imageTag);
    sendAndExit({ type: 'fail', message: err.message }, 1);
  }
});
