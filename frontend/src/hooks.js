import { useEffect, useState } from 'react';
import { api } from './api';

// calls fn every `ms` milliseconds, reload() forces an extra call right away
export function usePoll(fn, ms, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer;
    const tick = async () => {
      try {
        const result = await fn();
        if (!stopped) {
          setData(result);
          setError('');
        }
      } catch (err) {
        if (!stopped) setError(err.message);
      }
      if (!stopped) timer = setTimeout(tick, ms);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [...deps, version]);

  return [data, error, () => setVersion(v => v + 1)];
}

export function useMeta() {
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    api('/meta').then(setMeta).catch(() => {});
  }, []);
  return meta;
}
