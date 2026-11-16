import './style.css';
import { parseCommand } from './parser.js';
import { store, sameDay } from './store.js';
import { listen, speak, voiceSupported } from './voice.js';

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
  const when = e.allDay || !e.start ? 'All day' : fmtTime.format(new Date(e.start)) + (e.end ? ' – ' + fmtTime.format(new Date(e.end)) : '');
  return `<li class="item ${e.done ? 'done' : ''}" data-id="${e.id}">
    <button class="check" data-act="toggle" aria-label="Mark done">${TYPE_ICON[e.type] || '📅'}</button>
    <div class="body"><span class="title"></span><span class="when">${when}</span></div>
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
  const ev = store.add({ title, type: $('p-type').value, start, end, allDay });
  closePreview();
  if (ev.start) selectDate(new Date(ev.start));
  else render();
  const msg = `Saved “${ev.title}”${ev.start ? ' for ' + describe(ev) : ''}.`;
  setStatus(msg);
  speak(msg);
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
  if (btn.dataset.act === 'delete') store.remove(id);
  if (btn.dataset.act === 'toggle') {
    const ev = store.all().find((x) => x.id === id);
    store.update(id, { done: !ev.done });
  }
  render();
};

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

renderWeekdays();
render();
