const { bad } = require('./http');

const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

// turns a pasted .env style text into [{ key, value }]
function parseEnv(text = '') {
  const vars = new Map();
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) throw bad('env lines must look like KEY=value');
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (!KEY.test(key)) throw bad(`invalid variable name: ${key}`);
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    vars.set(key, value);
  }
  return [...vars].map(([key, value]) => ({ key, value }));
}

module.exports = { parseEnv };
