// Per-device preferences.
import { detectRegion } from './holidays.js';

const KEY = 'scheduler.settings.v1';
const DEFAULTS = { holidays: 'auto', observances: true };

export function getSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* keep in memory only */ }
  return next;
}

/** Region whose holidays are shown on the calendar, or null when turned off. */
export function holidayRegion(s = getSettings()) {
  if (s.holidays === 'off') return null;
  return s.holidays === 'auto' ? detectRegion() : s.holidays;
}

/** Region used to understand holiday names in voice commands (works even when hidden). */
export function speechRegion(s = getSettings()) {
  return holidayRegion(s) || detectRegion();
}
