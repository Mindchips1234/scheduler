// Pure reminder logic (no DOM), so it can be unit-tested in Node.

/** All-day items alert at this hour of the day (minus the alert offset). */
export const ALL_DAY_ALERT_HOUR = 9;

/** Alerts more than this late are reported as "missed" instead of popping up. */
export const MISSED_AFTER_MS = 60 * 60 * 1000;

export const ALERT_OPTIONS = [
  { value: '', label: 'No alert' },
  { value: '0', label: 'At time of event' },
  { value: '5', label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '120', label: '2 hours before' },
  { value: '1440', label: '1 day before' },
];

/** Default alert for a freshly parsed item, in minutes before (null = none). */
export function defaultAlert(item) {
  if (!item.start) return null;
  if (item.type === 'reminder') return 0;
  if (item.type === 'event' && !item.allDay) return 10;
  return null;
}

/** When the alert for an event should fire, or null. */
export function alertTime(ev) {
  if (!ev.start || ev.alertMinutes == null || ev.alertMinutes === '') return null;
  const start = new Date(ev.start);
  const base = ev.allDay ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), ALL_DAY_ALERT_HOUR) : start;
  return new Date(base.getTime() - Number(ev.alertMinutes) * 60000);
}

/** Splits events whose alert time has passed into ones to show now and ones that were missed. */
export function dueAlerts(events, now = new Date()) {
  const show = [];
  const missed = [];
  for (const ev of events) {
    if (ev.notified || ev.done) continue;
    const at = alertTime(ev);
    if (!at || at > now) continue;
    (now - at > MISSED_AFTER_MS ? missed : show).push(ev);
  }
  return { show, missed };
}

/** The soonest alert still to come, for scheduling a precise timer. */
export function nextAlert(events, now = new Date()) {
  let best = null;
  for (const ev of events) {
    if (ev.notified || ev.done) continue;
    const at = alertTime(ev);
    if (at && at > now && (!best || at < best)) best = at;
  }
  return best;
}

export function describeAlert(minutes) {
  if (minutes == null || minutes === '') return '';
  const m = Number(minutes);
  if (m === 0) return 'at time';
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? '' : 's'} before`;
  if (m % 60 === 0) return `${m / 60} hr before`;
  return `${m} min before`;
}

// ---------- .ics export (lets the phone's own calendar handle the alarm) ----------

const pad = (n) => String(n).padStart(2, '0');
const utcStamp = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const dateStamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function buildIcs(ev, now = new Date()) {
  const start = new Date(ev.start);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.id}@scheduler`,
    `DTSTAMP:${utcStamp(now)}`,
  ];
  if (ev.allDay) {
    const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(start)}`, `DTEND;VALUE=DATE:${dateStamp(next)}`);
  } else {
    const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 30 * 60000);
    lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
  }
  lines.push(`SUMMARY:${esc(ev.title)}`);
  if (ev.alertMinutes != null && ev.alertMinutes !== '') {
    // Trigger is relative to DTSTART (midnight for all-day items).
    const offset = ev.allDay ? ALL_DAY_ALERT_HOUR * 60 - Number(ev.alertMinutes) : -Number(ev.alertMinutes);
    const trigger = offset < 0 ? `-PT${-offset}M` : `PT${offset}M`;
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title)}`, `TRIGGER:${trigger}`, 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
