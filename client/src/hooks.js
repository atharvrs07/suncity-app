import { useEffect, useState, useCallback } from 'react';
import { api } from './api';

export function useFetch(path, enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    setError(null);
    api(path)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [path, enabled, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading: enabled && data === null && !error, reload };
}
