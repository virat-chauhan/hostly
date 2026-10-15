import { useState } from 'react';

export default function Copy({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {}
  }
  return <button type="button" className="btn ghost small-btn" onClick={copy}>{done ? 'Copied' : label}</button>;
}
