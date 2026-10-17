import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Stats } from '../types';

export function useStats(pollMs = 5000): Stats {
  const [stats, setStats] = useState<Stats>({ scheduled: 0, sent: 0 });
  useEffect(() => {
    const load = () => api.stats().then(setStats).catch(() => undefined);
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [pollMs]);
  return stats;
}
