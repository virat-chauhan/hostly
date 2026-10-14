export function fmtMb(n) {
  if (!n) return '0 MB';
  if (n >= 1024) return `${(n / 1024).toFixed(2)} GB`;
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} MB`;
}

export const fmtCores = n => `${n.toFixed(2)} cores`;

export const fmtClock = value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function fmtAge(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export const fmtCount = n => (n >= 10000 ? `${(n / 1000).toFixed(1)}K` : String(n));
