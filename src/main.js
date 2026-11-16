import './style.css';
import { parseCommand } from './parser.js';
import { store, sameDay } from './store.js';
import { listen, speak, voiceSupported } from './voice.js';
import { ALERT_OPTIONS, describeAlert, dueAlerts, nextAlert, buildIcs } from './reminders.js';
import { REPEAT_OPTIONS, presetOf, repeatFromPreset, describeRepeat, nextOccurrence, fromKey } from './recurrence.js';
import { holidaysOn } from './holidays.js';
import { getSettings, setSettings, holidayRegion, speechRegion } from './settings.js';

const $ = (id) => document.getElementById(id);

const state = {
  viewMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selected: new Date(),
  pending: null, // parsed item waiting for Save
  listening: null,
  listenId: 0,
};

const fmtMonth = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const fmtTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const fmtWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

const TYPE_ICON = { event: '📅', reminder: '🔔', task: '✅' };
const lowerFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const escapeHtml =(s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function dayHolidays(d) {
  const s = getSettings();
  return holidaysOn(d, holidayRegion(s), s.observances);
}

// ---------- rendering ----------

function renderWeekdays() {
  const base = new Date(2024, 0, 7); // a Sunday
  $('weekdays').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return `<span>${fmtWeekday.format(d)}</span>`;
  }).join('');
}

function renderGrid() {
  const { viewMonth } = state;
  $('month-label').textContent = fmtMonth.format(viewMonth);
  const start = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1 - viewMonth.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 41);
  const today = new Date();

  // Count occurrences per day once for the whole 6-week grid.
  const counts = new Map();
  for (const inst of store.between(start, end)) counts.set(inst.occ, (counts.get(inst.occ) || 0) + 1);

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const count = counts.get(key) || 0;
    const hols = dayHolidays(d);
    const cls = [
      'day',
      d.getMonth() !== viewMonth.getMonth() && 'other',
      sameDay(d, today) && 'today',
      sameDay(d, state.selected) && 'selected',
      hols.some((h) => h.kind === 'holiday') ? 'holiday' : hols.length ? 'observance' : '',
    ].filter(Boolean).join(' ');
    const dots = count ? `<i class="dots">${'•'.repeat(Math.min(count, 3))}</i>` : '<i class="dots"></i>';
    const title = hols.length ? ` title="${escapeHtml(hols.map((h) => h.name).join(', '))}"` : '';
    cells.push(`<button class="${cls}" data-date="${d.toISOString()}"${title}><b>${d.getDate()}</b>${dots}</button>`);
  }
  $('grid').innerHTML = cells.join('');
}

function itemHtml(e) {
  let when = e.allDay || !e.start ? 'All day' : fmtTime.format(new Date(e.start)) + (e.end ? ' – ' + fmtTime.format(new Date(e.end)) : '');
  if (e.repeat) when += ` · 🔁 ${escapeHtml(describeRepeat(e.repeat, e.start))}`;
  const alert = describeAlert(e.alertMinutes);
  if (alert && e.start) when += ` · 🔔 ${alert}`;
  const ics = e.start ? '<button class="ics" data-act="ics" aria-label="Add to phone calendar" title="Add to phone calendar">📲</button>' : '';
  return `<li class="item ${e.done ? 'done' : ''}" data-id="${e.eventId || e.id}" data-occ="${e.occ || ''}">
    <button class="check" data-act="toggle" aria-label="Mark done">${TYPE_ICON[e.type] || '📅'}</button>
    <div class="body"><span class="title">${escapeHtml(e.title)}</span><span class="when">${when}</span></div>
    ${ics}
    <button class="del" data-act="delete" aria-label="Delete">✕</button>
  </li>`;
}

function holidayHtml(h) {
  return `<li class="item holiday-item ${h.kind}"><span class="check">${h.kind === 'holiday' ? '🎉' : '⭐'}</span>
    <div class="body"><span class="title">${escapeHtml(h.name)}</span><span class="when">${h.kind === 'holiday' ? 'Public holiday' : 'Important day'}</span></div></li>`;
}

function renderAgenda() {
  $('day-label').textContent = fmtDay.format(state.selected);
  const hols = dayHolidays(state.selected);
  const items = store.onDay(state.selected);
  const html = hols.map(holidayHtml).join('') + items.map(itemHtml).join('');
  $('day-list').innerHTML = html || '<li class="empty">Nothing planned.</li>';
  const undated = store.undated();
  $('undated-wrap').hidden = !undated.length;
  $('undated-list').innerHTML = undated.map(itemHtml).join('');
}

function render() {
  renderGrid();
  renderAgenda();
}

function selectDate(d) {
  state.selected = new Date(d);
  state.viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  render();
}

function setStatus(msg) {
  $('status').textContent = msg;
}

/** Small bottom sheet with buttons; resolves to the chosen value (or null). */
function askChoice(text, options) {
  return new Promise((resolve) => {
    $('choice-text').textContent = text;
    $('choice-buttons').innerHTML = options
      .map((o, i) => `<button data-i="${i}" class="${o.style || 'ghost'}">${escapeHtml(o.label)}</button>`)
      .join('');
    $('choice').hidden = false;
    $('choice-buttons').onclick = (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      $('choice').hidden = true;
      resolve(options[Number(btn.dataset.i)].value);
    };
  });
}

// ---------- preview / confirm ----------

const pad = (n) => String(n).padStart(2, '0');
const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function fillRepeatSelect(repeat, start) {
  const preset = presetOf(repeat, start);
  const opts = [...REPEAT_OPTIONS];
  if (preset === 'custom') opts.push({ value: 'custom', label: describeRepeat({ ...repeat, until: null }, start) });
  $('p-repeat').innerHTML = opts.map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
  $('p-repeat').value = preset;
  $('p-until').value = repeat && repeat.until ? toDateInput(new Date(repeat.until)) : '';
  $('p-until-wrap').hidden = preset === 'none';
}

function openPreview(item, heard) {
  state.pending = item;
  $('heard').textContent = heard ? `Heard: “${heard}”` : '';
  $('p-title').value = item.title;
  $('p-type').value = item.type;
  const alertVal = item.alertMinutes == null ? '' : String(item.alertMinutes);
  const opts = [...ALERT_OPTIONS];
  if (!opts.some((o) => o.value === alertVal)) opts.push({ value: alertVal, label: describeAlert(alertVal) });
  $('p-alert').innerHTML = opts.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
  $('p-alert').value = alertVal;
  if (item.start) {
    const d = new Date(item.start);
    $('p-date').value = toDateInput(d);
    $('p-time').value = item.allDay ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } else {
    $('p-date').value = '';
    $('p-time').value = '';
  }
  fillRepeatSelect(item.repeat, item.start);
  $('preview').hidden = false;
}

function closePreview() {
  state.pending = null;
  $('preview').hidden = true;
}

function savePreview() {
  const item = state.pending;
  if (!item) return;
  const title = $('p-title').value.trim() || item.title;
  const dateStr = $('p-date').value;
  const timeStr = $('p-time').value;
  let start = null;
  let end = null;
  let allDay = true;
  if (dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const s = new Date(y, m - 1, d);
    if (timeStr) {
      const [hh, mm] = timeStr.split(':').map(Number);
      s.setHours(hh, mm, 0, 0);
      allDay = false;
      // Keep the original duration if there was one.
      const dur = item.start && item.end ? new Date(item.end) - new Date(item.start) : 0;
      if (dur > 0) end = new Date(s.getTime() + dur).toISOString();
    }
    start = s.toISOString();
  }

  let repeat = start ? repeatFromPreset($('p-repeat').value, item.repeat) : null;
  if (repeat) {
    if ($('p-until').value) {
      const [y, m, d] = $('p-until').value.split('-').map(Number);
      repeat.until = new Date(y, m - 1, d).toISOString();
    } else {
      delete repeat.until;
    }
    // A weekly custom rule keeps its weekdays; plain weekly follows the chosen date.
    if ($('p-repeat').value !== 'custom' && $('p-repeat').value !== 'weekdays') delete repeat.byDay;
  }

  const alertStr = $('p-alert').value;
  const alertMinutes = start && alertStr !== '' ? Number(alertStr) : null;
  const ev = store.add({ title, type: $('p-type').value, start, end, allDay, alertMinutes, notified: false, repeat: repeat || null });
  closePreview();

  const first = ev.repeat ? nextOccurrence(ev, new Date(ev.start)) : ev;
  if (first && first.start) selectDate(new Date(first.start));
  else render();
  let msg = `Saved “${ev.title}”`;
  if (ev.repeat) msg += ` — ${lowerFirst(describeRepeat(ev.repeat, ev.start))}${ev.allDay ? '' : ' at ' + fmtTime.format(new Date(ev.start))}`;
  else if (ev.start) msg += ` for ${describe(ev)}`;
  msg += '.';
  setStatus(msg);
  speak(msg);
  // Ask for notification permission the first time an alert is set (this runs inside the Save tap).
  if (alertMinutes != null && notifySupported() && Notification.permission === 'default') requestNotify();
  checkAlerts();
}

function describe(ev) {
  const d = new Date(ev.start);
  return fmtDay.format(d) + (ev.allDay ? '' : ' at ' + fmtTime.format(d));
}

// ---------- deleting ----------

async function deleteItem(id, occ) {
  const ev = store.get(id);
  if (!ev) return;
  if (ev.repeat) {
    const day = occ ? fromKey(occ) : null;
    const choice = await askChoice(`“${ev.title}” repeats (${lowerFirst(describeRepeat(ev.repeat, ev.start))}). What should be deleted?`, [
      ...(day ? [{ label: `Only ${fmtDay.format(day)}`, value: 'one' }] : []),
      { label: 'All repeats', value: 'all', style: 'danger' },
      { label: 'Cancel', value: null },
    ]);
    if (choice === 'one') store.removeOccurrence(id, occ);
    if (choice === 'all') store.remove(id);
    if (!choice) return;
    setStatus(choice === 'all' ? `Deleted every “${ev.title}”.` : `Deleted “${ev.title}” on ${fmtDay.format(day)}.`);
  } else {
    store.remove(id);
    setStatus(`Deleted “${ev.title}”.`);
  }
  render();
}

// ---------- commands ----------

function handle(text) {
  const cmd = parseCommand(text, new Date(), { region: speechRegion() });
  if (cmd.action === 'none') return;

  if (cmd.action === 'add') {
    openPreview(cmd.item, cmd.heard);
    setStatus('Check the details and tap Save.');
    return;
  }

  if (cmd.action === 'query') {
    selectDate(cmd.date);
    const hols = dayHolidays(cmd.date).map((h) => h.name);
    const items = store.onDay(cmd.date).map((e) => (e.allDay ? e.title : `${e.title} at ${fmtTime.format(new Date(e.start))}`));
    const all = [...hols, ...items];
    const msg = all.length ? `${fmtDay.format(cmd.date)}: ${all.join(', ')}.` : `Nothing planned on ${fmtDay.format(cmd.date)}.`;
    setStatus(msg);
    speak(msg);
    return;
  }

  if (cmd.action === 'delete') {
    const matches = store.find(cmd.query, cmd.date);
    if (!matches.length) {
      setStatus(`Couldn't find anything matching “${cmd.query}”.`);
      return;
    }
    // Prefer the soonest upcoming match.
    const now = new Date();
    const ranked = matches
      .map((ev) => ({ ev, inst: ev.repeat ? nextOccurrence(ev, cmd.date || now) : ev }))
      .filter((x) => x.inst)
      .sort((a, b) => {
        const fa = a.inst.start && new Date(a.inst.start) >= now ? 0 : 1;
        const fb = b.inst.start && new Date(b.inst.start) >= now ? 0 : 1;
        return fa - fb || (a.inst.start || '').localeCompare(b.inst.start || '');
      });
    const target = (ranked[0] || { ev: matches[0], inst: matches[0] });
    if (target.ev.repeat) return deleteItem(target.ev.id, target.inst.occ);
    if (confirm(`Delete “${target.ev.title}”${target.ev.start ? ' on ' + describe(target.ev) : ''}?`)) deleteItem(target.ev.id);
  }
}

// ---------- notifications ----------

const notifySupported = () => 'Notification' in window;
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function updateNotifyRow() {
  let text;
  let btn = 'Turn on';
  if (!notifySupported()) {
    text = isIos && !isStandalone() ? 'Add Scheduler to your Home Screen first, then open it from there.' : 'Not supported in this browser.';
    btn = 'Why?';
  } else if (Notification.permission === 'granted') {
    text = 'On — alerts show while Scheduler is open or recently used.';
    btn = 'Test';
  } else if (Notification.permission === 'denied') {
    text = 'Blocked — allow notifications for this site in your browser settings.';
    btn = 'Help';
  } else {
    text = 'Off';
  }
  $('notify-state').textContent = text;
  $('notify-btn').textContent = btn;
}

async function requestNotify() {
  if (!notifySupported()) {
    setStatus(isIos && !isStandalone()
      ? 'On iPhone, notifications only work after you add Scheduler to your Home Screen (Share → Add to Home Screen) and open it from there.'
      : 'This browser can’t show notifications. Use 📲 on an item to add it to your phone’s calendar instead.');
    return;
  }
  if (Notification.permission === 'denied') {
    setStatus('Notifications are blocked. Turn them on for this site in your browser settings.');
    return;
  }
  if (Notification.permission === 'granted') {
    notify({ id: 'test', title: 'Notifications are on', body: 'Scheduler will alert you while the app is open or recently used.' });
    return;
  }
  const result = await Notification.requestPermission();
  updateNotifyRow();
  setStatus(result === 'granted'
    ? 'Notifications on. Alerts show while Scheduler is open or recently used — tap 📲 on an item for a guaranteed phone-calendar alarm.'
    : 'Notifications not allowed. You can still use 📲 to add items to your phone’s calendar.');
}

async function notify({ id, title, body }) {
  const options = { body, tag: id, icon: './icon.svg', badge: './icon.svg', renotify: true, data: { id } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return await reg.showNotification(title, options);
  } catch { /* fall through */ }
  try { new Notification(title, options); } catch { /* not allowed in this context */ }
}

let alertTimer = null;

function checkAlerts() {
  const now = new Date();
  const events = store.all();
  const maxAlert = Math.max(0, ...events.map((e) => Number(e.alertMinutes) || 0));
  const horizon = new Date(now.getTime() + (maxAlert + 2 * 1440) * 60000);
  const instances = store.between(new Date(now.getTime() - 86400000), horizon);
  const { show, missed } = dueAlerts(instances, now);
  const canNotify = notifySupported() && Notification.permission === 'granted';

  for (const inst of show) {
    store.markNotified(inst); // mark first so two tabs don't both alert
    const body = inst.allDay ? 'Today' : fmtTime.format(new Date(inst.start)) + (inst.alertMinutes ? ` (${describeAlert(inst.alertMinutes)})` : '');
    if (canNotify) notify({ id: `${inst.eventId}|${inst.occ}`, title: `${TYPE_ICON[inst.type] || '🔔'} ${inst.title}`, body });
    if (document.visibilityState === 'visible') speak(`Reminder: ${inst.title}`);
  }
  for (const inst of missed) store.markNotified(inst);
  if (show.length) setStatus('🔔 ' + show.map((e) => e.title).join(', '));
  else if (missed.length) setStatus(`While you were away: ${missed.map((e) => e.title).join(', ')}.`);
  if (show.length || missed.length) render();

  // Wake up exactly when the next alert is due (also re-checked every 30s).
  clearTimeout(alertTimer);
  const next = nextAlert(store.between(now, horizon), now);
  if (next) alertTimer = setTimeout(checkAlerts, Math.min(Math.max(next - Date.now(), 0) + 250, 2 ** 31 - 1));
}

function downloadIcs(ev) {
  const blob = new Blob([buildIcs(ev)], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (ev.title.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'event') + '.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  setStatus(ev.repeat
    ? 'Open the downloaded file to add it — with all its repeats and its alarm — to your phone’s calendar.'
    : 'Open the downloaded file to add it (with its alarm) to your phone’s calendar.');
}

// ---------- settings ----------

function openSettings() {
  const s = getSettings();
  $('s-holidays').value = s.holidays;
  $('s-observances').checked = s.observances;
  $('s-observances').disabled = s.holidays === 'off';
  updateNotifyRow();
  $('settings').hidden = false;
}

$('settings-btn').onclick = openSettings;
$('settings-close').onclick = () => { $('settings').hidden = true; };
$('notify-btn').onclick = async () => { await requestNotify(); updateNotifyRow(); };
$('s-holidays').onchange = () => {
  setSettings({ holidays: $('s-holidays').value });
  $('s-observances').disabled = $('s-holidays').value === 'off';
  render();
};
$('s-observances').onchange = () => { setSettings({ observances: $('s-observances').checked }); render(); };

// ---------- events ----------

$('prev').onclick = () => { state.viewMonth.setMonth(state.viewMonth.getMonth() - 1); renderGrid(); };
$('next').onclick = () => { state.viewMonth.setMonth(state.viewMonth.getMonth() + 1); renderGrid(); };
$('today').onclick = () => selectDate(new Date());

$('grid').onclick = (e) => {
  const btn = e.target.closest('.day');
  if (btn) selectDate(new Date(btn.dataset.date));
};

document.querySelector('.agenda').onclick = (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const li = btn.closest('.item');
  const id = li.dataset.id;
  const occ = li.dataset.occ || null;
  const ev = store.get(id);
  if (!ev) return;
  if (btn.dataset.act === 'ics') return downloadIcs(ev);
  if (btn.dataset.act === 'delete') return deleteItem(id, occ);
  if (btn.dataset.act === 'toggle') store.toggleDone(id, occ);
  render();
};

$('p-save').onclick = savePreview;
$('p-cancel').onclick = () => { closePreview(); setStatus('Cancelled.'); };
$('p-repeat').onchange = () => { $('p-until-wrap').hidden = $('p-repeat').value === 'none'; };

function updateEnter() {
  $('enter').disabled = !$('text-input').value.trim();
}

function submitText() {
  if (state.listening) {
    state.listenId++; // ignore anything the mic reports after this
    state.listening.stop();
  }
  const text = $('text-input').value.trim();
  if (!text) {
    setStatus('Say something with the mic or type it first.');
    return;
  }
  $('text-input').value = '';
  $('text-input').blur();
  updateEnter();
  handle(text);
}
$('text-input').addEventListener('input', updateEnter);
$('text-form').onsubmit = (e) => { e.preventDefault(); submitText(); };
$('text-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submitText(); }
});

$('mic').onclick = () => {
  if (state.listening) {
    state.listening.stop();
    return;
  }
  $('mic').classList.add('on');
  $('mic').setAttribute('aria-label', 'Stop listening');
  setStatus('Listening… tap the mic again when you’re done.');
  // What you say goes into the text box, so you can check or fix it, then tap Enter.
  const before = $('text-input').value.trim();
  const id = ++state.listenId;
  const show = (t) => {
    if (id !== state.listenId) return false;
    $('text-input').value = before ? `${before} ${t}` : t;
    updateEnter();
    return true;
  };
  state.listening = listen({
    onInterim: show,
    onFinal: (t) => {
      if (show(t)) setStatus('Got it. Tap ➤ Enter to add it, or fix the text first.');
    },
    onError: setStatus,
    onEnd: () => {
      state.listening = null;
      $('mic').classList.remove('on');
      $('mic').setAttribute('aria-label', 'Speak a command');
    },
  });
};

if (!voiceSupported) {
  $('mic').disabled = true;
  setStatus('Voice isn’t supported in this browser — you can still type commands.');
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  if (import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  } else {
    // In development the offline cache would serve stale source files.
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
    caches?.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}

// Opened from a notification tap: jump to that occurrence's day.
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type !== 'open-item' || !e.data.id) return;
  const [id, occ] = String(e.data.id).split('|');
  if (occ) return selectDate(fromKey(occ));
  const ev = store.get(id);
  if (ev?.start) selectDate(new Date(ev.start));
});

renderWeekdays();
render();
updateEnter();
checkAlerts();
setInterval(checkAlerts, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkAlerts(); });
