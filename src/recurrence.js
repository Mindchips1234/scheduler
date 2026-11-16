// Repeating events. An event may carry:
//   repeat: { freq: 'daily'|'weekly'|'monthly'|'yearly', interval: 1, byDay?: [0..6], until?: ISO }
//   skip:          ['YYYY-MM-DD', ...]  occurrences deleted individually
//   doneDates:     ['YYYY-MM-DD', ...]  occurrences ticked off
//   notifiedDates: ['YYYY-MM-DD', ...]  occurrences already alerted
// Occurrences are computed on the fly; only the original event is stored.

const pad = (n) => String(n).padStart(2, '0');

export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Whole-day number, immune to daylight-saving shifts. */
const dayNum = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);

export const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Does this event happen on the given (local) day? */
export function occursOn(ev, day) {
  if (!ev.start) return false;
  const s = new Date(ev.start);
  if (!ev.repeat) return sameDay(s, day);
  if (ev.skip && ev.skip.includes(dateKey(day))) return false;
  const a = dayNum(s);
  const b = dayNum(day);
  if (b < a) return false;
  if (ev.repeat.until && b > dayNum(new Date(ev.repeat.until))) return false;
  const n = ev.repeat.interval || 1;
  switch (ev.repeat.freq) {
    case 'daily':
      return (b - a) % n === 0;
    case 'weekly': {
      const days = ev.repeat.byDay && ev.repeat.byDay.length ? ev.repeat.byDay : [s.getDay()];
      if (!days.includes(day.getDay())) return false;
      const weeks = Math.round(((b - day.getDay()) - (a - s.getDay())) / 7);
      return weeks % n === 0;
    }
    case 'monthly': {
      if (day.getDate() !== s.getDate()) return false;
      const months = (day.getFullYear() - s.getFullYear()) * 12 + day.getMonth() - s.getMonth();
      return months % n === 0;
    }
    case 'yearly':
      return day.getMonth() === s.getMonth() && day.getDate() === s.getDate() && (day.getFullYear() - s.getFullYear()) % n === 0;
    default:
      return false;
  }
}

/** The event as it happens on a specific day (start/end moved, per-day done/notified state). */
export function instanceOn(ev, day) {
  const k = dateKey(day);
  if (!ev.repeat) return { ...ev, eventId: ev.id, occ: k, done: !!ev.done, notified: !!ev.notified };
  const s = new Date(ev.start);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.getHours(), s.getMinutes());
  const end = ev.end ? new Date(start.getTime() + (new Date(ev.end) - s)) : null;
  return {
    ...ev,
    eventId: ev.id,
    occ: k,
    start: start.toISOString(),
    end: end ? end.toISOString() : null,
    done: !!(ev.doneDates && ev.doneDates.includes(k)),
    notified: !!(ev.notifiedDates && ev.notifiedDates.includes(k)),
  };
}

/** Every occurrence of every event between two dates (inclusive, by day), sorted by start. */
export function instancesBetween(events, from, to) {
  const out = [];
  const end = startOfDay(to);
  for (let d = startOfDay(from); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    for (const ev of events) if (occursOn(ev, d)) out.push(instanceOn(ev, d));
  }
  return out.sort((x, y) => x.start.localeCompare(y.start));
}

/** First occurrence on or after `from` (searches up to ~2 years ahead). */
export function nextOccurrence(ev, from = new Date()) {
  let d = startOfDay(from);
  for (let i = 0; i < 800; i++, d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (occursOn(ev, d)) return instanceOn(ev, d);
  }
  return null;
}

// ---------- presets for the repeat picker ----------

export const REPEAT_OPTIONS = [
  { value: 'none', label: 'Never' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
];

const sameDays = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export function presetOf(repeat, start) {
  if (!repeat) return 'none';
  const n = repeat.interval || 1;
  const by = repeat.byDay ? [...repeat.byDay].sort() : null;
  if (repeat.freq === 'daily' && n === 1) return 'daily';
  if (repeat.freq === 'weekly') {
    if (n === 1 && by && sameDays(by, [1, 2, 3, 4, 5])) return 'weekdays';
    const single = !by || (by.length === 1 && start && by[0] === new Date(start).getDay());
    if (single && n === 1) return 'weekly';
    if (single && n === 2) return 'biweekly';
  }
  if (repeat.freq === 'monthly' && n === 1) return 'monthly';
  if (repeat.freq === 'yearly' && n === 1) return 'yearly';
  return 'custom';
}

export function repeatFromPreset(preset, custom = null) {
  switch (preset) {
    case 'daily': return { freq: 'daily', interval: 1 };
    case 'weekdays': return { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] };
    case 'weekly': return { freq: 'weekly', interval: 1 };
    case 'biweekly': return { freq: 'weekly', interval: 2 };
    case 'monthly': return { freq: 'monthly', interval: 1 };
    case 'yearly': return { freq: 'yearly', interval: 1 };
    case 'custom': return custom ? { ...custom } : null;
    default: return null;
  }
}

// ---------- human-readable text ----------

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function describeRepeat(repeat, start) {
  if (!repeat) return '';
  const n = repeat.interval || 1;
  const s = start ? new Date(start) : new Date();
  let text;
  switch (repeat.freq) {
    case 'daily':
      text = n === 1 ? 'Every day' : n === 2 ? 'Every other day' : `Every ${n} days`;
      break;
    case 'weekly': {
      const by = repeat.byDay && repeat.byDay.length ? [...repeat.byDay].sort() : [s.getDay()];
      let list;
      if (sameDays(by, [1, 2, 3, 4, 5])) list = 'weekday';
      else if (sameDays(by, [0, 6])) list = 'weekend';
      else if (by.length === 1) list = DAY_LONG[by[0]];
      else list = by.map((d) => DAY_SHORT[d]).join(', ');
      text = n === 1 ? `Every ${list}` : n === 2 ? `Every other ${list}` : `Every ${n} weeks on ${list}`;
      break;
    }
    case 'monthly':
      text = (n === 1 ? 'Monthly' : `Every ${n} months`) + ` on the ${ordinal(s.getDate())}`;
      break;
    case 'yearly':
      text = (n === 1 ? 'Every year' : `Every ${n} years`) + ` on ${MONTHS[s.getMonth()]} ${s.getDate()}`;
      break;
    default:
      text = 'Repeats';
  }
  if (repeat.until) {
    const u = new Date(repeat.until);
    text += ` until ${MONTHS[u.getMonth()].slice(0, 3)} ${u.getDate()}`;
  }
  return text;
}

// ---------- iCalendar RRULE ----------

const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function toRRule(repeat, allDay) {
  const parts = [`FREQ=${repeat.freq.toUpperCase()}`];
  if ((repeat.interval || 1) > 1) parts.push(`INTERVAL=${repeat.interval}`);
  if (repeat.freq === 'weekly' && repeat.byDay && repeat.byDay.length) {
    parts.push(`BYDAY=${[...repeat.byDay].sort().map((d) => ICS_DAYS[d]).join(',')}`, 'WKST=SU');
  }
  if (repeat.until) {
    const u = new Date(repeat.until);
    if (allDay) {
      parts.push(`UNTIL=${u.getFullYear()}${pad(u.getMonth() + 1)}${pad(u.getDate())}`);
    } else {
      const e = new Date(u.getFullYear(), u.getMonth(), u.getDate(), 23, 59, 59);
      parts.push(`UNTIL=${e.getUTCFullYear()}${pad(e.getUTCMonth() + 1)}${pad(e.getUTCDate())}T${pad(e.getUTCHours())}${pad(e.getUTCMinutes())}${pad(e.getUTCSeconds())}Z`);
    }
  }
  return parts.join(';');
}
