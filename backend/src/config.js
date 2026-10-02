require('dotenv').config();
const path = require('path');

const num = (value, fallback) => (value ? Number(value) : fallback);

const config = {
  port: num(process.env.PORT, 4000),
  proxyPort: num(process.env.PROXY_PORT, 8080),
  baseDomain: process.env.BASE_DOMAIN || 'hostly.localhost',
  databaseUrl: process.env.DATABASE_URL || 'postgres://hostly:hostly@localhost:5432/hostly',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  maxBuilds: num(process.env.MAX_CONCURRENT_BUILDS, 2),
  buildTimeout: num(process.env.BUILD_TIMEOUT_MS, 600000),
  startTimeout: num(process.env.START_TIMEOUT_MS, 60000),
  quota: {
    cpu: num(process.env.USER_CPU, 0.5),
    ramMb: num(process.env.USER_RAM_MB, 512),
    storageMb: num(process.env.USER_STORAGE_MB, 1024),
  },
  project: { defaultMemoryMb: 128, minMemoryMb: 32 },
  quantumMs: num(process.env.QUANTUM_MS, 100),
  requestSlotsPerCpu: num(process.env.REQUEST_SLOTS_PER_CPU, 8),
  queueLimit: num(process.env.QUEUE_LIMIT, 50),
  queueTimeoutMs: num(process.env.QUEUE_TIMEOUT_MS, 15000),
  dataDir: path.join(__dirname, '..', 'data'),
  runtimes: {
    node20: { label: 'Node.js 20', image: 'node:20-slim' },
    node22: { label: 'Node.js 22', image: 'node:22-slim' },
    python312: { label: 'Python 3.12', image: 'python:3.12-slim' },
  },
};

config.domainFor = slug => `${slug}.${config.baseDomain}`;
config.urlFor = slug =>
  `http://${config.domainFor(slug)}${config.proxyPort === 80 ? '' : ':' + config.proxyPort}`;

module.exports = config;
