import './style.css';
import { parseCommand } from './parser.js';
import { store, sameDay } from './store.js';
import { listen, speak, voiceSupported } from './voice.js';
import { ALERT_OPTIONS, describeAlert, dueAlerts, nextAlert, buildIcs } from './reminders.js';

const $ = (id) => document.getElementById(id);

const state = {
  viewMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selected: new Date(),
  pending: null, // parsed item waiting for Save
  listening: null,
};

const fmtMonth = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const fmtTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const fmtWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

const TYPE_ICON = { event: '📅', reminder: '🔔', task: '✅' };

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
  const first = new Date(viewMonth);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const today = new Date();
  const events = store.all();

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const count = events.filter((e) => e.start && sameDay(new Date(e.start), d)).length;
    const cls = [
      'day',
      d.getMonth() !== viewMonth.getMonth() && 'other',
      sameDay(d, today) && 'today',
      sameDay(d, state.selected) && 'selected',
    ].filter(Boolean).join(' ');
    const dots = count ? `<i class="dots">${'•'.repeat(Math.min(count, 3))}</i>` : '';
    cells.push(`<button class="${cls}" data-date="${d.toISOString()}"><b>${d.getDate()}</b>${dots}</button>`);
  }
  $('grid').innerHTML = cells.join('');
}

function itemHtml(e) {
  let when = e.allDay || !e.start ? 'All day' : fmtTime.format(new Date(e.start)) + (e.end ? ' – ' + fmtTime.format(new Date(e.end)) : '');
  const alert = describeAlert(e.alertMinutes);
  if (alert && e.start) when += ` · 🔔 ${alert}`;
  const ics = e.start ? '<button class="ics" data-act="ics" aria-label="Add to phone calendar" title="Add to phone calendar">📲</button>' : '';
  return `<li class="item ${e.done ? 'done' : ''}" data-id="${e.id}">
    <button class="check" data-act="toggle" aria-label="Mark done">${TYPE_ICON[e.type] || '📅'}</button>
    <div class="body"><span class="title"></span><span class="when">${when}</span></div>
    ${ics}
    <button class="del" data-act="delete" aria-label="Delete">✕</button>
  </li>`;
}

function fillList(ul, items) {
  ul.innerHTML = items.map(itemHtml).join('');
  // Set titles via textContent so user text is never interpreted as HTML.
  items.forEach((e, i) => { ul.children[i].querySelector('.title').textContent = e.title; });
}

function renderAgenda() {
  $('day-label').textContent = fmtDay.format(state.selected);
  const items = store.onDay(state.selected);
  fillList($('day-list'), items);
  if (!items.length) $('day-list').innerHTML = '<li class="empty">Nothing planned.</li>';
  const undated = store.undated();
  $('undated-wrap').hidden = !undated.length;
  fillList($('undated-list'), undated);
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

// ---------- preview / confirm ----------

const pad = (n) => String(n).padStart(2, '0');

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
    $('p-date').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    $('p-time').value = item.allDay ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } else {
    $('p-date').value = '';
    $('p-time').value = '';
  }
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
  const alertStr = $('p-alert').value;
  const alertMinutes = start && alertStr !== '' ? Number(alertStr) : null;
  const ev = store.add({ title, type: $('p-type').value, start, end, allDay, alertMinutes, notified: false });
  closePreview();
  if (ev.start) selectDate(new Date(ev.start));
  else render();
  const msg = `Saved “${ev.title}”${ev.start ? ' for ' + describe(ev) : ''}.`;
  setStatus(msg);
  speak(msg);
  // Ask for notification permission the first time an alert is set (this runs inside the Save tap).
  if (alertMinutes != null && notifySupported() && Notification.permission === 'default') requestNotify();
  checkAlerts();
}

// ---------- notifications ----------

const notifySupported = () => 'Notification' in window;
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function updateBell() {
  const on = notifySupported() && Notification.permission === 'granted';
  $('bell').textContent = on ? '🔔' : '🔕';
  $('bell').setAttribute('aria-label', on ? 'Notifications on' : 'Turn on notifications');
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
  updateBell();
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
  const events = store.all();
  const { show, missed } = dueAlerts(events);
  const canNotify = notifySupported() && Notification.permission === 'granted';

  for (const ev of show) {
    store.update(ev.id, { notified: true }); // mark first so two tabs don't both alert
    const body = ev.allDay ? 'Today' : fmtTime.format(new Date(ev.start)) + (ev.alertMinutes ? ` (${describeAlert(ev.alertMinutes)})` : '');
    if (canNotify) notify({ id: ev.id, title: `${TYPE_ICON[ev.type] || '🔔'} ${ev.title}`, body });
    if (document.visibilityState === 'visible') speak(`Reminder: ${ev.title}`);
  }
  for (const ev of missed) store.update(ev.id, { notified: true });
  if (show.length) setStatus('🔔 ' + show.map((e) => e.title).join(', '));
  else if (missed.length) setStatus(`While you were away: ${missed.map((e) => e.title).join(', ')}.`);
  if (show.length || missed.length) render();

  // Wake up exactly when the next alert is due (capped; also re-checked every 30s).
  clearTimeout(alertTimer);
  const next = nextAlert(store.all());
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
  setStatus('Open the downloaded file to add it (with its alarm) to your phone’s calendar.');
}

function describe(ev) {
  const d = new Date(ev.start);
  return fmtDay.format(d) + (ev.allDay ? '' : ' at ' + fmtTime.format(d));
}

// ---------- commands ----------

function handle(text) {
  const cmd = parseCommand(text);
  if (cmd.action === 'none') return;

  if (cmd.action === 'add') {
    openPreview(cmd.item, cmd.heard);
    setStatus('Check the details and tap Save.');
    return;
  }

  if (cmd.action === 'query') {
    selectDate(cmd.date);
    const items = store.onDay(cmd.date);
    const msg = items.length
      ? `${fmtDay.format(cmd.date)}: ` + items.map((e) => (e.allDay ? e.title : `${e.title} at ${fmtTime.format(new Date(e.start))}`)).join(', ') + '.'
      : `Nothing planned on ${fmtDay.format(cmd.date)}.`;
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
    const target = matches.find((e) => e.start && new Date(e.start) >= new Date()) || matches[0];
    if (confirm(`Delete “${target.title}”${target.start ? ' on ' + describe(target) : ''}?`)) {
      store.remove(target.id);
      render();
      setStatus(`Deleted “${target.title}”.`);
    }
  }
}

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
  const id = btn.closest('.item').dataset.id;
  const ev = store.all().find((x) => x.id === id);
  if (!ev) return;
  if (btn.dataset.act === 'ics') return downloadIcs(ev);
  if (btn.dataset.act === 'delete') store.remove(id);
  if (btn.dataset.act === 'toggle') store.update(id, { done: !ev.done });
  render();
};

$('bell').onclick = requestNotify;

$('p-save').onclick = savePreview;
$('p-cancel').onclick = () => { closePreview(); setStatus('Cancelled.'); };

function submitText() {
  const text = $('text-input').value;
  $('text-input').value = '';
  $('text-input').blur();
  handle(text);
}
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
  setStatus('Listening…');
  state.listening = listen({
    onInterim: (t) => setStatus(`“${t}”`),
    onFinal: handle,
    onError: setStatus,
    onEnd: () => {
      state.listening = null;
      $('mic').classList.remove('on');
    },
  });
};

if (!voiceSupported) {
  $('mic').disabled = true;
  setStatus('Voice isn’t supported in this browser — you can still type commands.');
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Opened from a notification tap: jump to that item's day.
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type !== 'open-item') return;
  const ev = store.all().find((x) => x.id === e.data.id);
  if (ev?.start) selectDate(new Date(ev.start));
});

renderWeekdays();
render();
updateBell();
checkAlerts();
setInterval(checkAlerts, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkAlerts(); });
