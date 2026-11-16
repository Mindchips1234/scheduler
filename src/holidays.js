// Public holidays and other notable days, calculated from rules (works for any year, offline).
// kind: 'holiday' = public / bank holiday, 'observance' = notable day that isn't a day off.
// Dates are the actual day, not a substituted day off when it falls on a weekend.

import { dateKey } from './recurrence.js';

export const REGIONS = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'GB', label: 'United Kingdom' },
];

// ---------- date helpers ----------

const fixed = (m, d) => (y) => new Date(y, m - 1, d);

/** nth weekday of a month (wd: 0=Sun; n: 1..5, or -1 for last). */
function nth(y, m, wd, n) {
  if (n > 0) {
    const first = new Date(y, m - 1, 1);
    return new Date(y, m - 1, 1 + ((wd - first.getDay() + 7) % 7) + 7 * (n - 1));
  }
  const last = new Date(y, m, 0);
  return new Date(y, m - 1, last.getDate() - ((last.getDay() - wd + 7) % 7));
}
const nthRule = (m, wd, n) => (y) => nth(y, m, wd, n);

/** Easter Sunday (Gregorian, Meeus/Jones/Butcher). */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
const fromEaster = (offset) => (y) => { const e = easter(y); return new Date(y, e.getMonth(), e.getDate() + offset); };

// ---------- definitions ----------

const H = (name, date, aliases = []) => ({ name, kind: 'holiday', date, aliases });
const O = (name, date, aliases = []) => ({ name, kind: 'observance', date, aliases });

const NEW_YEAR = H("New Year's Day", fixed(1, 1), ["new year's day", "new year's", 'new years day', 'new year']);
const CHRISTMAS = H('Christmas Day', fixed(12, 25), ['christmas day', 'christmas', 'xmas']);
const GOOD_FRIDAY = H('Good Friday', fromEaster(-2), ['good friday']);

const COMMON_OBSERVANCES = [
  O("Valentine's Day", fixed(2, 14), ["valentine's day", "valentine's"]),
  O("St. Patrick's Day", fixed(3, 17), ["st. patrick's day", "saint patrick's day", "st patrick's day", "paddy's day"]),
  O('Easter Sunday', fromEaster(0), ['easter sunday', 'easter']),
  O('Halloween', fixed(10, 31), ['halloween']),
  O('Christmas Eve', fixed(12, 24), ['christmas eve', 'xmas eve']),
  O("New Year's Eve", fixed(12, 31), ["new year's eve", 'new years eve']),
];

const NORTH_AMERICA_OBSERVANCES = [
  O('Groundhog Day', fixed(2, 2), ['groundhog day']),
  O('Daylight saving time starts (clocks forward)', nthRule(3, 0, 2), ['daylight saving time', 'daylight savings']),
  O("Mother's Day", nthRule(5, 0, 2), ["mother's day"]),
  O("Father's Day", nthRule(6, 0, 3), ["father's day"]),
  O('Daylight saving time ends (clocks back)', nthRule(11, 0, 1)),
];

const DEFINITIONS = {
  US: [
    NEW_YEAR,
    H('Martin Luther King Jr. Day', nthRule(1, 1, 3), ['martin luther king jr. day', 'martin luther king day', 'mlk day']),
    H("Presidents' Day", nthRule(2, 1, 3), ["presidents' day", "president's day", "washington's birthday"]),
    H('Memorial Day', nthRule(5, 1, -1), ['memorial day']),
    H('Juneteenth', fixed(6, 19), ['juneteenth']),
    H('Independence Day', fixed(7, 4), ['independence day', 'the fourth of july', 'fourth of july', 'the 4th of july', '4th of july']),
    H('Labor Day', nthRule(9, 1, 1), ['labor day', 'labour day']),
    H("Columbus Day / Indigenous Peoples' Day", nthRule(10, 1, 2), ['columbus day', "indigenous peoples' day", "indigenous people's day"]),
    H('Veterans Day', fixed(11, 11), ["veterans day", "veteran's day"]),
    H('Thanksgiving', nthRule(11, 4, 4), ['thanksgiving day', 'thanksgiving']),
    CHRISTMAS,
    ...COMMON_OBSERVANCES,
    ...NORTH_AMERICA_OBSERVANCES,
    O('Earth Day', fixed(4, 22), ['earth day']),
    O('Good Friday', fromEaster(-2), ['good friday']),
    O('Black Friday', (y) => { const t = nth(y, 11, 4, 4); return new Date(y, 10, t.getDate() + 1); }, ['black friday']),
    O('Election Day', (y) => (y % 2 === 0 ? new Date(y, 10, nth(y, 11, 1, 1).getDate() + 1) : null), ['election day']),
  ],
  CA: [
    NEW_YEAR,
    H('Family Day (most provinces)', nthRule(2, 1, 3), ['family day']),
    GOOD_FRIDAY,
    H('Victoria Day', (y) => { const d = new Date(y, 4, 24); d.setDate(24 - ((d.getDay() + 6) % 7)); return d; }, ['victoria day']),
    H('Canada Day', fixed(7, 1), ['canada day']),
    H('Civic Holiday (most provinces)', nthRule(8, 1, 1), ['civic holiday']),
    H('Labour Day', nthRule(9, 1, 1), ['labour day', 'labor day']),
    H('National Day for Truth and Reconciliation', fixed(9, 30), ['truth and reconciliation day', 'orange shirt day']),
    H('Thanksgiving', nthRule(10, 1, 2), ['thanksgiving day', 'thanksgiving']),
    H('Remembrance Day', fixed(11, 11), ['remembrance day']),
    CHRISTMAS,
    H('Boxing Day', fixed(12, 26), ['boxing day']),
    ...COMMON_OBSERVANCES,
    ...NORTH_AMERICA_OBSERVANCES,
    O('Easter Monday', fromEaster(1), ['easter monday']),
  ],
  GB: [
    NEW_YEAR,
    GOOD_FRIDAY,
    H('Easter Monday', fromEaster(1), ['easter monday']),
    H('Early May bank holiday', nthRule(5, 1, 1), ['may day', 'early may bank holiday']),
    H('Spring bank holiday', nthRule(5, 1, -1), ['spring bank holiday']),
    H('Summer bank holiday', nthRule(8, 1, -1), ['summer bank holiday', 'august bank holiday']),
    CHRISTMAS,
    H('Boxing Day', fixed(12, 26), ['boxing day']),
    ...COMMON_OBSERVANCES,
    O('Pancake Day', fromEaster(-47), ['pancake day', 'shrove tuesday']),
    O('Mothering Sunday', fromEaster(-21), ['mothering sunday', "mother's day"]),
    O('British Summer Time begins (clocks forward)', nthRule(3, 0, -1)),
    O("Father's Day", nthRule(6, 0, 3), ["father's day"]),
    O('British Summer Time ends (clocks back)', nthRule(10, 0, -1)),
    O('Bonfire Night', fixed(11, 5), ['bonfire night', 'guy fawkes night']),
    O('Remembrance Sunday', nthRule(11, 0, 2), ['remembrance sunday']),
  ],
};

// ---------- lookups ----------

const yearCache = new Map();

/** Map of 'YYYY-MM-DD' -> [{ name, kind }] for one year and region. */
export function holidaysForYear(year, region) {
  const key = `${region}:${year}`;
  if (yearCache.has(key)) return yearCache.get(key);
  const map = new Map();
  for (const def of DEFINITIONS[region] || []) {
    const d = def.date(year);
    if (!d) continue;
    const k = dateKey(d);
    const list = map.get(k) || [];
    if (!list.some((h) => h.name === def.name)) list.push({ name: def.name, kind: def.kind });
    map.set(k, list);
  }
  yearCache.set(key, map);
  return map;
}

/** Holidays on a given day. `observances` false = public holidays only. */
export function holidaysOn(day, region, observances = true) {
  if (!region || !DEFINITIONS[region]) return [];
  const list = holidaysForYear(day.getFullYear(), region).get(dateKey(day)) || [];
  return observances ? list : list.filter((h) => h.kind === 'holiday');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Alias -> forgiving regex source: optional apostrophes and dots, flexible spaces. */
const aliasSource = (alias) =>
  escapeRe(alias)
    .replace(/'/g, "['’]?")
    .replace(/\\\./g, '\\.?')
    .replace(/ /g, '\\s+');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Finds a holiday name used as a date ("on Thanksgiving", "until Christmas", "...on Mother's Day")
 * and replaces it with a plain date ("November 26 2026") that the date parser understands.
 * Only replaces when the name follows a date word or ends the sentence, so "Christmas party on
 * Dec 20" keeps its title.
 */
export function replaceHolidayNames(text, ref = new Date(), region = 'US') {
  const defs = DEFINITIONS[region] || DEFINITIONS.US;
  const entries = [];
  for (const def of defs) for (const alias of def.aliases) entries.push({ alias, def });
  entries.sort((a, b) => b.alias.length - a.alias.length); // longest first: "christmas eve" before "christmas"

  for (const { alias, def } of entries) {
    const src = aliasSource(alias);
    const re = new RegExp(`(\\b(?:on|for|this|next|until|till|til|through|before|after|by|from|at)\\s+(?:the\\s+)?)(${src})\\b|^(?:the\\s+)?(${src})\\s*[?.!]?$|\\s(${src})\\s*[?.!]?$`, 'i');
    const m = text.match(re);
    if (!m) continue;
    const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    let d = def.date(ref.getFullYear());
    if (!d || d < today) d = def.date(ref.getFullYear() + 1) || def.date(ref.getFullYear() + 2);
    if (!d) continue;
    const replacement = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
    const name = m[2] || m[3] || m[4];
    const at = m.index + m[0].indexOf(name, m[1] ? m[1].length : 0);
    return { text: text.slice(0, at) + replacement + text.slice(at + name.length), holiday: def.name, date: d };
  }
  return { text, holiday: null, date: null };
}

/** Region from the device's language setting, e.g. en-CA -> CA (falls back to US). */
export function detectRegion(lang = typeof navigator !== 'undefined' ? navigator.language : 'en-US') {
  const m = /[-_]([A-Za-z]{2})\b/.exec(lang || '');
  const r = m ? m[1].toUpperCase() : 'US';
  if (r === 'UK') return 'GB';
  return DEFINITIONS[r] ? r : 'US';
}
