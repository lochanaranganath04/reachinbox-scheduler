import { useCallback, useState } from 'react';

const KEY = 'starred-emails';
const read = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
  } catch {
    return new Set();
  }
};

/** Client-side favourites (per browser). */
export function useStars() {
  const [stars, setStars] = useState<Set<string>>(read);
  const toggle = useCallback((id: string) => {
    setStars((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);
  return { stars, toggle };
}
