export const token = {
  get: () => localStorage.getItem('hostly_token'),
  set: value => localStorage.setItem('hostly_token', value),
  clear: () => localStorage.removeItem('hostly_token'),
};

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const saved = token.get();
  if (saved) headers.Authorization = `Bearer ${saved}`;

  let payload;
  if (form) {
    payload = form;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && saved) {
    token.clear();
    window.location.href = '/login';
  }
  if (!res.ok) throw new Error(data.error || 'request failed');
  return data;
}

export async function stream(path, onData, signal) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token.get()}` }, signal });
  if (!res.ok || !res.body) throw new Error('could not open the stream');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop();
    for (const part of parts) {
      const line = part.split('\n').find(l => l.startsWith('data: '));
      if (line) onData(JSON.parse(line.slice(6)));
    }
  }
}
