const { parentPort, threadId } = require('worker_threads');
const { execFile } = require('child_process');
const { toMb } = require('../utils/units');

const run = args =>
  new Promise(resolve => {
    execFile('docker', args, { timeout: 20000 }, (err, stdout) => resolve(err ? null : stdout));
  });

const lines = out => out.split('\n').filter(Boolean).map(l => l.split('|'));

async function readStats() {
  const out = await run(['stats', '--no-stream', '--format', '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}']);
  if (out === null) return null;
  return lines(out)
    .filter(([name]) => name.startsWith('hostly-d'))
    .map(([name, cpu, mem]) => ({ name, cpu: parseFloat(cpu) || 0, memMb: toMb((mem || '').split('/')[0]) }));
}

async function readDisk() {
  const out = await run(['ps', '-s', '--format', '{{.Names}}|{{.Size}}']);
  if (out === null) return null;
  return Object.fromEntries(lines(out).map(([name, size]) => [name, toMb(String(size).split(' (')[0])]));
}

let disk = {};
let diskAt = 0;

async function loop() {
  const stats = await readStats();
  if (stats) {
    if (Date.now() - diskAt > 30000) {
      disk = (await readDisk()) || disk;
      diskAt = Date.now();
    }
    parentPort.postMessage({ threadId, stats: stats.map(s => ({ ...s, diskMb: disk[s.name] ?? null })) });
  }
  setTimeout(loop, 4000);
}

loop();
