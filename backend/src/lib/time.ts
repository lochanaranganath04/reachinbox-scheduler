/** UTC clock-hour window, e.g. 2026-10-16T14 */
export const hourWindow = (d = new Date()): string => d.toISOString().slice(0, 13);

/** Epoch ms of the start of the next UTC hour. */
export function nextHourMs(d = new Date()): number {
  const n = new Date(d);
  n.setUTCMinutes(0, 0, 0);
  return n.getTime() + 3_600_000;
}
