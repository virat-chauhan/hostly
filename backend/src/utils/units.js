const factors = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, kib: 1024, mib: 1048576, gib: 1073741824 };

function toMb(text) {
  const match = String(text).trim().match(/^([\d.]+)\s*([a-zA-Z]+)$/);
  if (!match) return 0;
  const factor = factors[match[2].toLowerCase()];
  return factor ? (parseFloat(match[1]) * factor) / 1048576 : 0;
}

module.exports = { toMb };
