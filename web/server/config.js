export const DEFAULT_BAR_VOLUME = 5000;
export const POLL_FALLBACK_MS = 500;
export const FEED_RECONNECT_MS = 5000;

export function calibrateBarVolume(referenceVolume) {
  if (!referenceVolume || referenceVolume <= 0) return DEFAULT_BAR_VOLUME;
  const raw = Math.max(100, Math.round(referenceVolume / 200));
  return Math.round(raw / 100) * 100;
}
