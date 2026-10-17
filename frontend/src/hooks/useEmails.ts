import { useCallback, useEffect, useState } from 'react';
import { api, ListParams } from '../api/client';
import type { EmailListResponse } from '../types';

/** Loads a page of emails and silently refreshes every `pollMs` so the list stays live. */
export function useEmails(params: ListParams, pollMs = 5000) {
  const { view, page, q, status } = params;
  const [data, setData] = useState<EmailListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Show the spinner (not stale rows) when the query itself changes.
  useEffect(() => {
    setLoading(true);
    setData(null);
    setError(null);
  }, [view, page, q, status]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .emails({ view, page, q, status })
        .then((d) => !cancelled && (setData(d), setError(null)))
        .catch((e: Error) => !cancelled && setError(e.message))
        .finally(() => !cancelled && (setLoading(false), setRefreshing(false)));
    load();
    const id = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [view, page, q, status, pollMs, tick]);

  const refetch = useCallback(() => {
    setRefreshing(true);
    setTick((t) => t + 1);
  }, []);
  return { data, loading, refreshing, error, refetch };
}
