import * as chrono from 'chrono-node';
import { defaultAlert } from './reminders.js';
import { replaceHolidayNames } from './holidays.js';

/**
 * Turns a spoken/typed sentence into a command.
 *
 *   "dentist next tuesday at 3pm for an hour"
 *     -> { action: 'add', item: { title: 'Dentist', type: 'event', start, end, allDay: false } }
 *   "what do I have tomorrow"      -> { action: 'query', date }
 *   "cancel dentist"               -> { action: 'delete', query: 'dentist' }
 */

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5,
};

const LEADING_FILLER = [
  /^(?:hey|ok|okay|please)[,\s]+/i,
  /^(?:can you |could you |would you )/i,
  /^(?:remind me (?:to|about|that)?)\s*/i,
  /^(?:set (?:a |an )?reminder (?:to|for|about)?)\s*/i,
  /^(?:add|create|schedule|put|book|make|set|new)\s+(?:an?\s+)?(?:event|appointment|meeting|task|reminder|todo|to-do|to do)?\s*(?:called|named|for|to)?\s*/i,
  /^(?:i have|i've got|i got|there's|there is)\s+(?:an?\s+)?/i,
];

const TRAILING_FILLER = [
  /\s+(?:to|on|in) (?:my |the )?(?:calendar|schedule|list)\s*$/i,
  /\s+(?:on|at|for|from|by|this|next|in|the)\s*$/i,
  /[\s,.!?]+$/,
];

function stripFiller(text) {
  let out = text.trim();
  for (let changed = true; changed; ) {
    changed = false;
    for (const re of LEADING_FILLER) {
      const next = out.replace(re, '');
      if (next !== out) { out = next.trim(); changed = true; }
    }
    for (const re of TRAILING_FILLER) {
      const next = out.replace(re, '');
      if (next !== out) { out = next.trim(); changed = true; }
    }
  }
  return out;
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Pulls "for 2 hours" / "for half an hour" / "for 45 minutes" out of the text. */
export function extractDuration(text) {
  const re = /\bfor\s+(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|half)\s*(?:an?\s+)?(hours?|hrs?|minutes?|mins?)\b/i;
  const m = text.match(re);
  if (!m) return { minutes: null, text };
  const raw = m[1].toLowerCase();
  const n = NUMBER_WORDS[raw] ?? parseFloat(raw);
  const minutes = /^h/i.test(m[2]) ? n * 60 : n;
  return { minutes, text: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim() };
}

/**
 * Pulls "remind me 30 minutes before" / "with an alert an hour before" /
 * "alert me the day before" out of the text. Returns minutes before the start.
 */
export function extractAlert(text) {
  const lead = String.raw`(?:,?\s*(?:and\s+)?)(?:remind me|alert me|notify me|warn me|ping me|with an? (?:reminder|alert|notification)|set an? (?:reminder|alert))`;
  const amount = String.raw`(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|half)\s*(?:an?\s+)?(minutes?|mins?|hours?|hrs?|days?)`;
  const re = new RegExp(`${lead}\\s+(?:${amount}|the (day|night) )\\s*(?:before|early|ahead|beforehand)?\\b`, 'i');
  const m = text.match(re);
  if (!m) return { alertMinutes: null, text };
  let minutes;
  if (m[3]) {
    minutes = 1440;
  } else {
    const raw = m[1].toLowerCase();
    const n = NUMBER_WORDS[raw] ?? parseFloat(raw);
    minutes = /^d/i.test(m[2]) ? n * 1440 : /^h/i.test(m[2]) ? n * 60 : n;
  }
  return { alertMinutes: minutes, text: (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim() };
}

function detectType(text) {
  if (/\bremind(?:er| me)?\b/i.test(text)) return 'reminder';
  if (/\b(?:task|to-?do|to do|deadline|due|finish|submit)\b/i.test(text)) return 'task';
  return 'event';
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// ---------- repeats ----------

const DAY_WORD = '(?:sun|mon|tues|wednes|thurs|fri|satur)days?';
const DAY_LIST = `${DAY_WORD}(?:\\s*(?:,\\s*and|,|and|&|\\+)\\s*${DAY_WORD})*`;
const INTERVAL = '(other|\\d+|two|three|four|five|six)';
const dayIndex = (w) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(w.slice(0, 3).toLowerCase());
const intervalOf = (w) => (!w ? 1 : w.toLowerCase() === 'other' ? 2 : NUMBER_WORDS[w.toLowerCase()] ?? parseInt(w, 10));
const TIME_OF_DAY = { morning: 8, afternoon: 14, evening: 18, night: 21 };

function cut(text, m) {
  return (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim();
}

/**
 * Pulls a repeat rule out of the text:
 *   "every day", "every other week", "every 3 months", "every weekday", "every Monday and Wednesday",
 *   "on Tuesdays", "every morning", "daily", "weekly", "monthly", "yearly", "annually".
 */
export function extractRepeat(text) {
  let m;

  if ((m = text.match(/\b(?:every|each)\s+(?:single\s+)?(week\s?days?|work\s?days?|weekends?)\b/i)) ||
      (m = text.match(/\bon\s+(weekdays|weekends)\b/i))) {
    const byDay = /end/i.test(m[1]) ? [0, 6] : [1, 2, 3, 4, 5];
    return { repeat: { freq: 'weekly', interval: 1, byDay }, text: cut(text, m) };
  }

  if ((m = text.match(new RegExp(`\\b(?:every|each)\\s+(?:${INTERVAL}\\s+)?(${DAY_LIST})\\b`, 'i'))) ||
      (m = text.match(new RegExp(`\\bon\\s+()((?:${DAY_WORD.replace('days?', 'days')})(?:\\s*(?:,\\s*and|,|and|&)\\s*${DAY_WORD.replace('days?', 'days')})*)\\b`, 'i')))) {
    const byDay = [...new Set((m[2].match(new RegExp(DAY_WORD, 'gi')) || []).map(dayIndex))].sort();
    const repeat = { freq: 'weekly', interval: intervalOf(m[1]) };
    if (byDay.length) repeat.byDay = byDay;
    return { repeat, text: cut(text, m) };
  }

  if ((m = text.match(new RegExp(`\\b(?:every|each)\\s+(?:${INTERVAL}\\s+)?(day|night|morning|afternoon|evening|week|fortnight|month|year)s?\\b`, 'i')))) {
    const unit = m[2].toLowerCase();
    let repeat;
    if (unit === 'fortnight') repeat = { freq: 'weekly', interval: 2 * intervalOf(m[1]) };
    else if (TIME_OF_DAY[unit] != null) repeat = { freq: 'daily', interval: intervalOf(m[1]), defaultHour: TIME_OF_DAY[unit] };
    else repeat = { freq: unit === 'day' ? 'daily' : `${unit}ly`, interval: intervalOf(m[1]) };
    return { repeat, text: cut(text, m) };
  }

  if ((m = text.match(/\b(daily|nightly|weekly|bi-?weekly|fortnightly|monthly|yearly|annually|annual)\b/i))) {
    const w = m[1].toLowerCase().replace('-', '');
    const repeat =
      w === 'daily' ? { freq: 'daily', interval: 1 } :
      w === 'nightly' ? { freq: 'daily', interval: 1, defaultHour: 21 } :
      w === 'weekly' ? { freq: 'weekly', interval: 1 } :
      w === 'biweekly' || w === 'fortnightly' ? { freq: 'weekly', interval: 2 } :
      w === 'monthly' ? { freq: 'monthly', interval: 1 } :
      { freq: 'yearly', interval: 1 };
    // Keep the word in the title when it's an adjective ("weekly meeting"), drop it otherwise.
    const adjective = /^\s+(?:meeting|call|check-?in|review|report|sync|standup|lesson|class|checkup|check-up|physical|appointment|exam)\b/i.test(text.slice(m.index + m[0].length));
    return { repeat, text: adjective ? text : cut(text, m) };
  }

  return { repeat: null, text };
}

/** Pulls "until March 1" / "through June" / "for 6 weeks" out of the text. */
export function extractUntil(text, ref = new Date()) {
  const forCount = text.match(/\bfor\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?|months?|years?)\b/i);
  if (forCount) {
    const raw = forCount[1].toLowerCase();
    return { until: null, count: { n: NUMBER_WORDS[raw] ?? parseInt(raw, 10), unit: forCount[2].toLowerCase().replace(/s$/, '') }, text: cut(text, forCount) };
  }
  const m = text.match(/\b(?:until|till|til|through|thru|ending(?:\s+on)?)\s+/i);
  if (!m) return { until: null, count: null, text };
  const after = text.slice(m.index + m[0].length);
  const r = chrono.parse(after, ref, { forwardDate: true })[0];
  if (!r || r.index !== 0) return { until: null, count: null, text };
  const end = m.index + m[0].length + r.text.length;
  return { until: startOfDay(r.start.date()), count: null, text: (text.slice(0, m.index) + ' ' + text.slice(end)).replace(/\s{2,}/g, ' ').trim() };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "on the 15th" (no month given) -> the next 15th, written as a plain date. */
function replaceDayOfMonth(text, ref) {
  const m = text.match(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b(?!\s+of\b)/i);
  if (!m) return text;
  const day = parseInt(m[1], 10);
  if (day < 1 || day > 31) return text;
  let d = new Date(ref.getFullYear(), ref.getMonth(), day);
  if (d.getDate() !== day || d < startOfDay(ref)) {
    for (let i = 1; i <= 12; i++) {
      d = new Date(ref.getFullYear(), ref.getMonth() + i, day);
      if (d.getDate() === day) break;
    }
  }
  return cut(text, m) + ` on ${MONTH_NAMES[d.getMonth()]} ${day} ${d.getFullYear()}`;
}

function addUnits(date, n, unit) {
  const d = new Date(date);
  if (unit === 'day') d.setDate(d.getDate() + n);
  if (unit === 'week') d.setDate(d.getDate() + 7 * n);
  if (unit === 'month') d.setMonth(d.getMonth() + n);
  if (unit === 'year') d.setFullYear(d.getFullYear() + n);
  return d;
}

export function parseCommand(input, ref = new Date(), { region = 'US' } = {}) {
  const original = (input || '').trim();
  if (!original) return { action: 'none' };
  // "on Thanksgiving" -> "on November 26 2026" so the date parser understands it.
  const text = replaceHolidayNames(original, ref, region).text;

  // Questions about the schedule.
  if (/^(?:what(?:'s| is| do i have| have i got)|show(?: me)?|list|read|anything)\b/i.test(text)) {
    const r = chrono.parse(text, ref, { forwardDate: true })[0];
    return { action: 'query', date: startOfDay(r ? r.start.date() : ref) };
  }

  // Deleting something.
  const del = text.match(/^(?:delete|remove|cancel|clear|erase)\s+(?:the\s+|my\s+)?(.+)$/i);
  if (del) {
    let rest = del[1];
    const r = chrono.parse(rest, ref, { forwardDate: true })[0];
    let date = null;
    if (r) {
      date = startOfDay(r.start.date());
      rest = rest.slice(0, r.index) + rest.slice(r.index + r.text.length);
    }
    const query = stripFiller(rest.replace(/\b(?:event|appointment|meeting|reminder|task)\b/gi, ''));
    return { action: 'delete', query, date };
  }

  // Everything else is something to add.
  const { alertMinutes, text: noAlert } = extractAlert(text);
  const { repeat: parsedRepeat, text: noRepeat } = extractRepeat(noAlert);
  const untilInfo = parsedRepeat ? extractUntil(noRepeat, ref) : { until: null, count: null, text: noRepeat };
  const type = detectType(untilInfo.text);
  const { minutes, text: durationless } = extractDuration(untilInfo.text);
  const noDuration = replaceDayOfMonth(durationless, ref);
  const results = chrono.parse(noDuration, ref, { forwardDate: true });

  let title = noDuration;
  let start = null;
  let end = null;
  let allDay = true;

  if (results.length) {
    const r = results[0];
    start = r.start.date();
    allDay = !r.start.isCertain('hour');
    // "at 4" with no am/pm almost always means the afternoon.
    if (!allDay && !r.start.isCertain('meridiem') && start.getHours() >= 1 && start.getHours() <= 6) {
      start.setHours(start.getHours() + 12);
      if (r.end) end = new Date(r.end.date().getTime() + 12 * 3600000);
    }
    if (r.end && !end) end = r.end.date();
    // Remove every date phrase from the title, last first so indexes stay valid.
    for (const res of [...results].reverse()) {
      title = title.slice(0, res.index) + ' ' + title.slice(res.index + res.text.length);
    }
  }

  if (allDay && start) start = startOfDay(start);

  title = capitalize(stripFiller(title.replace(/\s{2,}/g, ' ')));
  if (!title) title = type === 'reminder' ? 'Reminder' : type === 'task' ? 'Task' : 'Event';

  // Birthdays and anniversaries repeat every year unless told otherwise.
  let repeat = parsedRepeat;
  if (!repeat && start && /\b(?:birthday|bday|anniversary)\b/i.test(title)) repeat = { freq: 'yearly', interval: 1 };

  if (repeat) {
    const { defaultHour, ...rule } = repeat;
    repeat = rule;
    if (!start) start = startOfDay(ref);
    if (allDay && defaultHour != null) {
      start = new Date(start.getFullYear(), start.getMonth(), start.getDate(), defaultHour);
      allDay = false;
    }
    // Move the first occurrence onto one of the chosen weekdays.
    if (repeat.byDay) {
      for (let i = 0; i < 7 && !repeat.byDay.includes(start.getDay()); i++) start.setDate(start.getDate() + 1);
    }
    if (untilInfo.until) repeat.until = untilInfo.until.toISOString();
    if (untilInfo.count) {
      const u = addUnits(startOfDay(start), untilInfo.count.n, untilInfo.count.unit);
      u.setDate(u.getDate() - 1);
      repeat.until = u.toISOString();
    }
  }

  if (!end && start && !allDay && minutes) end = new Date(start.getTime() + minutes * 60000);
  if (!end && start && !allDay && type === 'event') end = new Date(start.getTime() + 60 * 60000);

  const item = {
    title,
    type,
    start: start ? start.toISOString() : null,
    end: end ? end.toISOString() : null,
    allDay,
    repeat: repeat || null,
  };
  item.alertMinutes = start ? (alertMinutes ?? defaultAlert(item)) : null;

  return { action: 'add', item, heard: original };
}
