import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, extractAlert } from './parser.js';
import { alertTime, dueAlerts, nextAlert, buildIcs, describeAlert } from './reminders.js';

const REF = new Date(2026, 10, 15, 10, 0, 0); // Sun 15 Nov 2026 10:00

test('extractAlert phrases', () => {
  assert.equal(extractAlert('dentist at 3 remind me 30 minutes before').alertMinutes, 30);
  assert.equal(extractAlert('dentist at 3 and alert me an hour before').alertMinutes, 60);
  assert.equal(extractAlert('flight friday, remind me the day before').alertMinutes, 1440);
  assert.equal(extractAlert('gym with a reminder 2 hours before').alertMinutes, 120);
  assert.equal(extractAlert('remind me to call mom').alertMinutes, null);
});

test('alert phrase is removed from title and keeps type', () => {
  const { item } = parseCommand('dentist next tuesday at 3pm remind me 30 minutes before', REF);
  assert.equal(item.title, 'Dentist');
  assert.equal(item.type, 'event');
  assert.equal(item.alertMinutes, 30);
  assert.equal(new Date(item.start).getHours(), 15);
});

test('default alerts', () => {
  assert.equal(parseCommand('remind me to call mom tomorrow at 5pm', REF).item.alertMinutes, 0);
  assert.equal(parseCommand('dentist tomorrow at 3pm', REF).item.alertMinutes, 10);
  assert.equal(parseCommand('essay due friday', REF).item.alertMinutes, null);
  assert.equal(parseCommand('buy milk', REF).item.alertMinutes, null);
});

test('alertTime for timed and all-day items', () => {
  const timed = { start: new Date(2026, 10, 16, 15, 0).toISOString(), allDay: false, alertMinutes: 10 };
  assert.equal(alertTime(timed).getTime(), new Date(2026, 10, 16, 14, 50).getTime());
  const allDay = { start: new Date(2026, 10, 16).toISOString(), allDay: true, alertMinutes: 0 };
  assert.equal(alertTime(allDay).getTime(), new Date(2026, 10, 16, 9, 0).getTime());
  assert.equal(alertTime({ ...timed, alertMinutes: null }), null);
});

test('dueAlerts splits show / missed and skips notified or done', () => {
  const at = (h, m) => new Date(2026, 10, 15, h, m).toISOString();
  const events = [
    { id: 'a', start: at(10, 5), alertMinutes: 10 },               // alert 9:55 -> show
    { id: 'b', start: at(8, 0), alertMinutes: 0 },                 // alert 8:00 -> missed
    { id: 'c', start: at(10, 30), alertMinutes: 10 },              // alert 10:20 -> future
    { id: 'd', start: at(10, 5), alertMinutes: 10, notified: true },
    { id: 'e', start: at(10, 5), alertMinutes: 10, done: true },
  ];
  const { show, missed } = dueAlerts(events, REF);
  assert.deepEqual(show.map((e) => e.id), ['a']);
  assert.deepEqual(missed.map((e) => e.id), ['b']);
  assert.equal(nextAlert(events, REF).getTime(), new Date(2026, 10, 15, 10, 20).getTime());
});

test('buildIcs includes an alarm', () => {
  const ics = buildIcs({ id: 'x1', title: 'Dentist, upstairs', start: new Date(Date.UTC(2026, 10, 17, 15)).toISOString(), end: null, allDay: false, alertMinutes: 30 }, REF);
  assert.match(ics, /DTSTART:20261117T150000Z/);
  assert.match(ics, /SUMMARY:Dentist\\, upstairs/);
  assert.match(ics, /TRIGGER:-PT30M/);
  assert.ok(ics.includes('\r\n'));
  const allDay = buildIcs({ id: 'x2', title: 'Birthday', start: new Date(2026, 11, 3).toISOString(), allDay: true, alertMinutes: 0 }, REF);
  assert.match(allDay, /DTSTART;VALUE=DATE:20261203/);
  assert.match(allDay, /TRIGGER:PT540M/);
});

test('describeAlert', () => {
  assert.equal(describeAlert(0), 'at time');
  assert.equal(describeAlert(10), '10 min before');
  assert.equal(describeAlert(60), '1 hr before');
  assert.equal(describeAlert(1440), '1 day before');
  assert.equal(describeAlert(null), '');
});
