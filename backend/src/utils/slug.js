const reserved = new Set(['www', 'api', 'app', 'admin', 'hostly', 'dashboard', 'mail']);
const SLUG = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;
const HOST = /^(?=.{3,100}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]([a-z0-9-]*[a-z0-9])?$/;

function toSlug(name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'app';
}

const isReserved = slug => reserved.has(slug);

function checkSlug(raw) {
  const slug = String(raw || '').trim().toLowerCase();
  if (!SLUG.test(slug)) return { slug, error: 'use letters, numbers and hyphens, up to 40 characters, not starting or ending with a hyphen' };
  if (isReserved(slug)) return { slug, error: 'that name is reserved' };
  return { slug, error: null };
}

function checkHost(raw, baseDomain) {
  const host = String(raw || '').trim().toLowerCase();
  if (!HOST.test(host)) return { host, error: 'enter a valid domain like www.example.com' };
  if (host === baseDomain || host.endsWith('.' + baseDomain)) return { host, error: `use the subdomain setting for ${baseDomain} names` };
  return { host, error: null };
}

module.exports = { toSlug, isReserved, checkSlug, checkHost };
