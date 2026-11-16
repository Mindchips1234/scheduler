import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, extractDuration } from './parser.js';

// Fixed reference: Sunday 15 Nov 2026, 10:00 local time.
const REF = new Date(2026, 10, 15, 10, 0, 0);
const local = (iso) => new Date(iso);

test('event with weekday and time', () => {
  const { action, item } = parseCommand('dentist next tuesday at 3pm', REF);
  assert.equal(action, 'add');
  assert.equal(item.title, 'Dentist');
  assert.equal(item.type, 'event');
  assert.equal(item.allDay, false);
  const s = local(item.start);
  assert.equal(s.getDay(), 2);
  assert.equal(s.getHours(), 15);
  assert.equal((local(item.end) - s) / 60000, 60); // default 1h
});

test('reminder with filler words', () => {
  const { item } = parseCommand('remind me to call mom tomorrow at 5pm', REF);
  assert.equal(item.title, 'Call mom');
  assert.equal(item.type, 'reminder');
  const s = local(item.start);
  assert.equal(s.getDate(), 16);
  assert.equal(s.getHours(), 17);
});

test('duration is applied and removed from title', () => {
  const { item } = parseCommand('add lunch with Sam on Friday at noon for 2 hours', REF);
  assert.equal(item.title, 'Lunch with Sam');
  const s = local(item.start);
  assert.equal(s.getDay(), 5);
  assert.equal(s.getHours(), 12);
  assert.equal((local(item.end) - s) / 60000, 120);
});

test('all-day item when no time is given', () => {
  const { item } = parseCommand("mom's birthday on December 3rd", REF);
  assert.equal(item.title, "Mom's birthday");
  assert.equal(item.allDay, true);
  assert.equal(local(item.start).getMonth(), 11);
  assert.equal(local(item.start).getDate(), 3);
});

test('task detection', () => {
  const { item } = parseCommand('essay due friday', REF);
  assert.equal(item.type, 'task');
  assert.equal(item.title, 'Essay due');
});

test('no date keeps item undated', () => {
  const { item } = parseCommand('buy milk', REF);
  assert.equal(item.title, 'Buy milk');
  assert.equal(item.start, null);
});

test('query', () => {
  const cmd = parseCommand('what do I have tomorrow', REF);
  assert.equal(cmd.action, 'query');
  assert.equal(cmd.date.getDate(), 16);
});

test('delete', () => {
  const cmd = parseCommand('cancel the dentist appointment', REF);
  assert.equal(cmd.action, 'delete');
  assert.equal(cmd.query, 'dentist');
});

test('extractDuration', () => {
  assert.equal(extractDuration('gym for half an hour').minutes, 30);
  assert.equal(extractDuration('gym for 45 minutes').minutes, 45);
  assert.equal(extractDuration('gym').minutes, null);
});
