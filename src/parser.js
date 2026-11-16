import * as chrono from 'chrono-node';

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

export function parseCommand(input, ref = new Date()) {
  const text = (input || '').trim();
  if (!text) return { action: 'none' };

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
  const type = detectType(text);
  const { minutes, text: noDuration } = extractDuration(text);
  const results = chrono.parse(noDuration, ref, { forwardDate: true });

  let title = noDuration;
  let start = null;
  let end = null;
  let allDay = true;

  if (results.length) {
    const r = results[0];
    start = r.start.date();
    allDay = !r.start.isCertain('hour');
    if (r.end) end = r.end.date();
    // Remove every date phrase from the title, last first so indexes stay valid.
    for (const res of [...results].reverse()) {
      title = title.slice(0, res.index) + ' ' + title.slice(res.index + res.text.length);
    }
  }

  if (allDay && start) start = startOfDay(start);
  if (!end && start && !allDay && minutes) end = new Date(start.getTime() + minutes * 60000);
  if (!end && start && !allDay && type === 'event') end = new Date(start.getTime() + 60 * 60000);

  title = capitalize(stripFiller(title.replace(/\s{2,}/g, ' ')));
  if (!title) title = type === 'reminder' ? 'Reminder' : type === 'task' ? 'Task' : 'Event';

  return {
    action: 'add',
    item: {
      title,
      type,
      start: start ? start.toISOString() : null,
      end: end ? end.toISOString() : null,
      allDay,
    },
    heard: text,
  };
}
