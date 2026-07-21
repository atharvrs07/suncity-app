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

// Which house slots are already registered: { [block]: { [houseNo]: { owner,
// resident } } }. Deliberately NOT cached at module scope (unlike the static
// house-number map) so the greying reflects the latest registrations each time a
// signup / edit form mounts. Returns null while loading, then the taken map.
export function useHouseOccupancy() {
  const [taken, setTaken] = useState(null);
  useEffect(() => {
    let live = true;
    api('/api/meta/house-occupancy')
      .then((d) => {
        if (live) setTaken(d.taken || {});
      })
      .catch(() => {
        if (live) setTaken({}); // greying is a nicety; the server still enforces the lock
      });
    return () => {
      live = false;
    };
  }, []);
  return taken;
}
