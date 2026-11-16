// Events live on the device in localStorage. No account, no server.
import { occursOn, instancesBetween, dateKey, sameDay } from './recurrence.js';

export { sameDay };

const KEY = 'scheduler.events.v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(events) {
  try {
    localStorage.setItem(KEY, JSON.stringify(events));
    return true;
  } catch {
    return false;
  }
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
}

const addKey = (list, k) => [...new Set([...(list || []), k])];
const dropKey = (list, k) => (list || []).filter((x) => x !== k);
/** Keep per-occurrence lists from growing forever. */
const recent = (list, days = 60) => {
  const cutoff = dateKey(new Date(Date.now() - days * 86400000));
  return (list || []).filter((k) => k >= cutoff);
};

export const store = {
  all() {
    return load().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  },
  get(id) {
    return load().find((e) => e.id === id) || null;
  },
  add(item) {
    const events = load();
    const ev = { id: newId(), done: false, createdAt: new Date().toISOString(), ...item };
    events.push(ev);
    save(events);
    return ev;
  },
  update(id, patch) {
    save(load().map((e) => (e.id === id ? { ...e, ...patch } : e)));
  },
  remove(id) {
    save(load().filter((e) => e.id !== id));
  },
  /** Delete one occurrence of a repeating event (or the whole thing if it doesn't repeat). */
  removeOccurrence(id, occ) {
    const ev = this.get(id);
    if (!ev) return;
    if (!ev.repeat) return this.remove(id);
    this.update(id, { skip: addKey(ev.skip, occ) });
  },
  toggleDone(id, occ) {
    const ev = this.get(id);
    if (!ev) return;
    if (!ev.repeat) return this.update(id, { done: !ev.done });
    const done = (ev.doneDates || []).includes(occ);
    this.update(id, { doneDates: recent(done ? dropKey(ev.doneDates, occ) : addKey(ev.doneDates, occ), 400) });
  },
  markNotified(instance) {
    const ev = this.get(instance.eventId || instance.id);
    if (!ev) return;
    if (!ev.repeat) return this.update(ev.id, { notified: true });
    this.update(ev.id, { notifiedDates: recent(addKey(ev.notifiedDates, instance.occ)) });
  },
  /** Occurrences on one day, repeats included. */
  onDay(date) {
    return instancesBetween(this.all(), date, date);
  },
  between(from, to) {
    return instancesBetween(this.all(), from, to);
  },
  undated() {
    return this.all().filter((e) => !e.start);
  },
  /** Finds events whose title contains every word of the query (optionally happening on a given day). */
  find(query, date = null) {
    const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
    return this.all().filter((e) => {
      const title = e.title.toLowerCase();
      if (!words.every((w) => title.includes(w))) return false;
      return !date || occursOn(e, date);
    });
  },
};
