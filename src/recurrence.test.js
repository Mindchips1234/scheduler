import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from './parser.js';
import { occursOn, instancesBetween, describeRepeat, presetOf, toRRule, nextOccurrence } from './recurrence.js';
import { buildIcs, dueAlerts } from './reminders.js';

const REF = new Date(2026, 10, 15, 10, 0); // Sun 15 Nov 2026
const D = (m, d, y = 2026) => new Date(y, m - 1, d);
const ev = (repeat, start = new Date(2026, 10, 16, 9, 0), extra = {}) => ({ id: 'e', title: 'X', start: start.toISOString(), allDay: false, repeat, ...extra });

test('daily, every other day', () => {
  const e = ev({ freq: 'daily', interval: 2 });
  assert.ok(occursOn(e, D(11, 16)));
  assert.ok(!occursOn(e, D(11, 17)));
  assert.ok(occursOn(e, D(11, 18)));
  assert.ok(!occursOn(e, D(11, 15)), 'not before start');
});

test('weekly on several days, every other week', () => {
  const e = ev({ freq: 'weekly', interval: 2, byDay: [1, 3] }); // starts Mon 16 Nov
  assert.ok(occursOn(e, D(11, 16)));
  assert.ok(occursOn(e, D(11, 18)));
  assert.ok(!occursOn(e, D(11, 23)));
  assert.ok(!occursOn(e, D(11, 25)));
  assert.ok(occursOn(e, D(11, 30)));
  assert.ok(occursOn(e, D(12, 2)));
});

test('monthly, yearly, until, skip', () => {
  const m = ev({ freq: 'monthly', interval: 1 }, D(11, 1));
  assert.ok(occursOn(m, D(12, 1)) && occursOn(m, D(1, 1, 2027)) && !occursOn(m, D(12, 2)));
  const y = ev({ freq: 'yearly', interval: 1 }, D(3, 3, 2027));
  assert.ok(occursOn(y, D(3, 3, 2030)) && !occursOn(y, D(3, 3, 2026)));
  const u = ev({ freq: 'daily', interval: 1, until: D(11, 20).toISOString() });
  assert.ok(occursOn(u, D(11, 20)) && !occursOn(u, D(11, 21)));
  const s = ev({ freq: 'daily', interval: 1 }, undefined, { skip: ['2026-11-17'] });
  assert.ok(!occursOn(s, D(11, 17)) && occursOn(s, D(11, 18)));
});

test('instances keep the time and per-day state', () => {
  const e = ev({ freq: 'daily', interval: 1 }, undefined, { end: new Date(2026, 10, 16, 10, 0).toISOString(), doneDates: ['2026-11-17'] });
  const list = instancesBetween([e], D(11, 16), D(11, 18));
  assert.equal(list.length, 3);
  assert.equal(new Date(list[1].start).getHours(), 9);
  assert.equal((new Date(list[1].end) - new Date(list[1].start)) / 60000, 60);
  assert.deepEqual(list.map((i) => i.done), [false, true, false]);
  assert.equal(nextOccurrence(e, D(12, 25)).occ, '2026-12-25');
});

test('repeating alerts fire once per occurrence', () => {
  const e = ev({ freq: 'daily', interval: 1 }, new Date(2026, 10, 14, 9, 55), { alertMinutes: 0, notifiedDates: ['2026-11-14'] });
  const now = new Date(2026, 10, 15, 10, 0);
  const { show } = dueAlerts(instancesBetween([e], D(11, 14), D(11, 16)), now);
  assert.deepEqual(show.map((i) => i.occ), ['2026-11-15']);
});

test('parser: repeat phrases', () => {
  const a = parseCommand('team meeting every monday at 9', REF).item;
  assert.equal(a.title, 'Team meeting');
  assert.deepEqual(a.repeat, { freq: 'weekly', interval: 1, byDay: [1] });
  assert.equal(new Date(a.start).getDay(), 1);

  const b = parseCommand('every Monday and Wednesday at 6pm gym', REF).item;
  assert.equal(b.title, 'Gym');
  assert.deepEqual(b.repeat.byDay, [1, 3]);

  const c = parseCommand('standup every weekday at 9:30', REF).item;
  assert.deepEqual(c.repeat.byDay, [1, 2, 3, 4, 5]);
  assert.equal(new Date(c.start).getMinutes(), 30);

  const d = parseCommand('every other friday at 4 pay day', REF).item;
  assert.equal(d.repeat.interval, 2);
  assert.equal(new Date(d.start).getHours(), 16, '"at 4" means 4pm');

  const e = parseCommand('pay rent every month on the 1st', REF).item;
  assert.equal(e.title, 'Pay rent');
  assert.equal(e.repeat.freq, 'monthly');
  assert.equal(new Date(e.start).getDate(), 1);

  const f = parseCommand('yoga on tuesdays at 7pm until december 20', REF).item;
  assert.equal(f.title, 'Yoga');
  assert.equal(new Date(f.repeat.until).getDate(), 20);

  const g = parseCommand('piano lesson every week on saturday at 10 for 6 weeks', REF).item;
  assert.equal(instancesBetween([{ ...g, id: 'g' }], D(11, 1), D(3, 1, 2027)).length, 6);

  assert.equal(parseCommand('weekly meeting on thursday at 2', REF).item.title, 'Weekly meeting');
  assert.equal(parseCommand('take vitamins every day at 8am', REF).item.repeat.freq, 'daily');
  assert.equal(new Date(parseCommand('walk the dog every morning', REF).item.start).getHours(), 8);
  assert.equal(parseCommand("mom's birthday on march 3", REF).item.repeat.freq, 'yearly');
  assert.equal(parseCommand('dentist tuesday at 3pm', REF).item.repeat, null);
});

test('describe, presets, RRULE, ics', () => {
  const start = new Date(2026, 10, 16, 9).toISOString();
  assert.equal(describeRepeat({ freq: 'weekly', interval: 1, byDay: [1] }, start), 'Every Monday');
  assert.equal(describeRepeat({ freq: 'weekly', interval: 2, byDay: [1, 3] }, start), 'Every other Mon, Wed');
  assert.equal(describeRepeat({ freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] }, start), 'Every weekday');
  assert.equal(describeRepeat({ freq: 'monthly', interval: 1 }, D(12, 1).toISOString()), 'Monthly on the 1st');
  assert.equal(presetOf({ freq: 'weekly', interval: 2 }, start), 'biweekly');
  assert.equal(presetOf({ freq: 'weekly', interval: 1, byDay: [1, 3] }, start), 'custom');
  assert.equal(toRRule({ freq: 'weekly', interval: 2, byDay: [3, 1] }, false), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;WKST=SU');
  const ics = buildIcs({ id: 'r', title: 'Gym', start, allDay: false, alertMinutes: 10, repeat: { freq: 'daily', interval: 1 }, skip: ['2026-11-18'] }, REF);
  assert.match(ics, /RRULE:FREQ=DAILY/);
  assert.match(ics, /EXDATE:2026111\dT\d{6}Z/);
});
