import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easter, holidaysOn, replaceHolidayNames, detectRegion } from './holidays.js';
import { parseCommand } from './parser.js';

const D = (y, m, d) => new Date(y, m - 1, d);
const names = (d, r, o = true) => holidaysOn(d, r, o).map((h) => h.name);
const REF = new Date(2026, 10, 15, 10, 0);

test('Easter dates', () => {
  assert.deepEqual(easter(2024), D(2024, 3, 31));
  assert.deepEqual(easter(2025), D(2025, 4, 20));
  assert.deepEqual(easter(2026), D(2026, 4, 5));
  assert.deepEqual(easter(2027), D(2027, 3, 28));
});

test('US holidays 2026', () => {
  assert.ok(names(D(2026, 1, 19), 'US').includes('Martin Luther King Jr. Day'));
  assert.ok(names(D(2026, 5, 25), 'US').includes('Memorial Day'));
  assert.ok(names(D(2026, 9, 7), 'US').includes('Labor Day'));
  assert.ok(names(D(2026, 11, 26), 'US').includes('Thanksgiving'));
  assert.ok(names(D(2026, 11, 27), 'US').includes('Black Friday'));
  assert.ok(names(D(2026, 5, 10), 'US').includes("Mother's Day"));
  assert.ok(names(D(2026, 11, 3), 'US').includes('Election Day'));
  assert.ok(names(D(2026, 3, 8), 'US')[0].startsWith('Daylight saving time starts'));
  assert.deepEqual(names(D(2026, 5, 10), 'US', false), [], 'observances hidden');
});

test('Canada and UK', () => {
  assert.ok(names(D(2026, 5, 18), 'CA').includes('Victoria Day'));
  assert.ok(names(D(2026, 10, 12), 'CA').includes('Thanksgiving'));
  assert.ok(names(D(2026, 12, 26), 'CA').includes('Boxing Day'));
  assert.ok(names(D(2026, 8, 31), 'GB').includes('Summer bank holiday'));
  assert.ok(names(D(2026, 3, 15), 'GB').includes('Mothering Sunday'));
  assert.deepEqual(names(D(2026, 6, 1), 'US'), []);
});

test('holiday names in sentences', () => {
  assert.equal(replaceHolidayNames('dinner on thanksgiving at 5', REF).text, 'dinner on November 26 2026 at 5');
  assert.equal(replaceHolidayNames('christmas party on dec 20', REF).text, 'christmas party on dec 20');
  assert.equal(replaceHolidayNames('what do I have on christmas eve', REF).text, 'what do I have on December 24 2026');
  assert.equal(replaceHolidayNames("call mom on mothers day", REF).text, 'call mom on May 9 2027');
  assert.equal(replaceHolidayNames('trip until new years', REF).text, 'trip until January 1 2027');

  const q = parseCommand('what do I have on thanksgiving', REF);
  assert.equal(q.date.getDate(), 26);
  const a = parseCommand('dinner at grandmas on thanksgiving at 5pm', REF).item;
  assert.equal(a.title, 'Dinner at grandmas');
  assert.equal(new Date(a.start).getHours(), 17);
  assert.equal(parseCommand('dinner on thanksgiving', REF, { region: 'CA' }).item.start.slice(0, 7), '2027-10');
});

test('detectRegion', () => {
  assert.equal(detectRegion('en-CA'), 'CA');
  assert.equal(detectRegion('en-GB'), 'GB');
  assert.equal(detectRegion('fr-FR'), 'US');
  assert.equal(detectRegion('en'), 'US');
});
