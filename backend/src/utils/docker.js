const { execFile } = require('child_process');

function docker(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile('docker', args, { timeout, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout.trim());
    });
  });
}

const removeContainer = name => docker(['rm', '-f', name]).catch(() => {});
const removeImage = tag => docker(['rmi', '-f', tag]).catch(() => {});

const isRunning = name =>
  docker(['inspect', '-f', '{{.State.Running}}', name])
    .then(out => out === 'true')
    .catch(() => false);

const imageExists = tag =>
  docker(['image', 'inspect', '-f', '{{.Id}}', tag])
    .then(() => true)
    .catch(() => false);

async function imageBytes(tag) {
  const out = await docker(['image', 'inspect', '-f', '{{.Size}}', tag]);
  return Number(out) || 0;
}

async function hostPort(name) {
  const out = await docker(['port', name]);
  return Number(out.split('\n')[0].split(':').pop());
}

function update(name, { cpus, memoryMb }) {
  const args = ['update'];
  if (cpus) args.push('--cpus', String(cpus));
  if (memoryMb) args.push('--memory', `${memoryMb}m`, '--memory-swap', `${memoryMb}m`);
  return docker([...args, name]);
}

async function top(name) {
  const out = await docker(['top', name, '-eo', 'pid,ppid,stat,rss,args']);
  return out
    .split('\n')
    .slice(1)
    .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map(m => ({ pid: Number(m[1]), ppid: Number(m[2]), stat: m[3], rssMb: Math.round((Number(m[4]) / 1024) * 10) / 10, cmd: m[5] }));
}

function containerLogs(name, tail = 200) {
  return new Promise(resolve => {
    execFile('docker', ['logs', '--tail', String(tail), name], { timeout: 15000, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && !stdout && !stderr) return resolve('');
        resolve(`${stdout}${stderr}`);
      });
  });
}

module.exports = { docker, removeContainer, removeImage, isRunning, imageExists, imageBytes, hostPort, update, top, containerLogs };
