// Events live on the device in localStorage. No account, no server.
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

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export const store = {
  all() {
    return load().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  },
  add(item) {
    const events = load();
    const ev = { id: newId(), done: false, createdAt: new Date().toISOString(), ...item };
    events.push(ev);
    save(events);
    return ev;
  },
  update(id, patch) {
    const events = load().map((e) => (e.id === id ? { ...e, ...patch } : e));
    save(events);
  },
  remove(id) {
    save(load().filter((e) => e.id !== id));
  },
  onDay(date) {
    return this.all().filter((e) => e.start && sameDay(new Date(e.start), date));
  },
  undated() {
    return this.all().filter((e) => !e.start);
  },
  /** Finds events whose title contains every word of the query (optionally on a given day). */
  find(query, date = null) {
    const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
    return this.all().filter((e) => {
      const title = e.title.toLowerCase();
      if (!words.every((w) => title.includes(w))) return false;
      return !date || (e.start && sameDay(new Date(e.start), date));
    });
  },
};
