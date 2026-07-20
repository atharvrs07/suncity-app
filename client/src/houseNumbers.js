import { useEffect, useState } from 'react';
import { api } from './api';

// The block → house-number mapping is fetched once from the server (which reads
// it from block-house-numbers.json — the single source of truth) and cached at
// module scope so the signup and OAuth forms don't refetch it.
let cache = null;
let inflight = null;

export function fetchHouseNumbers() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = api('/api/meta/house-numbers')
      .then((d) => {
        cache = d.houseNumbers || {};
        return cache;
      })
      .catch((err) => {
        inflight = null; // allow a retry on the next mount
        throw err;
      });
  }
  return inflight;
}

// Returns the mapping once loaded, or null while it's still being fetched.
export function useHouseNumbers() {
  const [map, setMap] = useState(cache);
  useEffect(() => {
    let live = true;
    fetchHouseNumbers()
      .then((m) => {
        if (live) setMap(m);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return map;
}
