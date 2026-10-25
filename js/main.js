import { Engine } from './engine.js';
import { load, save } from './store.js';
import './account.js';
import './site.js';
import { api } from './api.js';
import { renderStats } from './stats.js';
import { renderProfile, renderHistory, esc } from './profile.js';

const $ = (sel) => document.querySelector(sel);
let texts = [];
let categories = [];
const screens = ['home', 'pick', 'race', 'stats', 'profile'];

const state = {
  unit: load('unit', 'cpm'),
  theme: ['neanbit', 'claro', 'carbon'].includes(load('theme', '')) ? load('theme', '') : 'neanbit',
  history: load('history', []),
  category: null,
  engine: null,
  mode: 'normal',
  over: false,
  errorWords: [],
  ghost: 0,
  me: null,
  text: null,
  timer: 0,
};

const favs = new Set(load('favs', []));
const typing = $('#typing');
const target = $('#target');

async function loadCatalog() {
  try {
    ({ texts, categories } = await api.texts());
  } catch {
    note('No se pudo cargar el catálogo de textos.');
  }
}

function show(name) {
  document.body.classList.toggle('profile-view', name === 'profile');
  screens.forEach((s) => ($('#' + s).hidden = s !== name));
  if (name === 'race') typing.focus();
}

function speed(cpm) {
  return state.unit === 'wpm' ? Math.round(cpm / 5) : cpm;
}

function unitLabel() {
  return state.unit === 'zen' ? 'CPM' : state.unit.toUpperCase();
}

function applyPrefs() {
  document.documentElement.dataset.theme = state.theme;
  document.body.classList.toggle('zen', state.unit === 'zen');
  document.querySelectorAll('#units button').forEach((b) => b.classList.toggle('on', b.dataset.unit === state.unit));
  $('#theme').value = state.theme;
  $('#r-unit').textContent = unitLabel();
  $('#r-speed-unit').textContent = unitLabel();
  $('#th-speed').textContent = 'Vel. ' + unitLabel();
  $('#th-avg').textContent = 'Promedio ' + unitLabel();
}

function renderPick() {
  const query = $('#search').value.trim().toLowerCase();
  $('#chips').innerHTML = ['Todos', 'Favoritos', ...categories].map((c) =>
    `<button data-cat="${c}" class="${(state.category || 'Todos') === c ? 'on' : ''}">${c}</button>`
  ).join('');
  const list = texts.filter((t) =>
    (!state.category || (state.category === 'Favoritos' ? favs.has(t.id) : t.category === state.category)) && (!query || t.text.toLowerCase().includes(query))
  );
  $('#cards').innerHTML = list.length
    ? list.map((t) => `<li data-id="${t.id}"><button class="star" data-fav="${t.id}" aria-label="Favorito">${favs.has(t.id) ? '★' : '☆'}</button><p>${t.text}</p><small>${t.text.split(' ').length} palabras, ${t.category}</small></li>`).join('')
    : '<li>No hay textos que coincidan con la búsqueda.</li>';
}

function drawTarget() {
  const { engine } = state;
  [...target.children].forEach((el, i) => {
    el.className = 'w' + (i < engine.index ? ' done' : i === engine.index ? ' on' : '');
    if (i !== engine.index) return;
    const word = engine.words[i];
    const ok = engine.matched(typing.value.slice(0, word.length));
    const typed = typing.value.slice(0, word.length + 4);
    const bad = Math.max(0, typed.length - ok);
    el.innerHTML = `<span class="ok">${word.slice(0, ok)}</span><i class="caret"></i><span class="bad">${word.slice(ok, ok + bad)}</span>${word.slice(ok + bad)}`;
  });
}

function startRace(text, mode = 'normal', ghost = 0) {
  if (!text) return note('Todavía no hay textos cargados.');
  clearInterval(state.timer);
  state.text = text;
  state.mode = mode;
  state.ghost = ghost;
  $('#r-ghost').style.width = '0';
  state.over = false;
  $('#result').classList.remove('dead');
  state.engine = new Engine(text.text);
  target.replaceChildren(...state.engine.words.map((w) => Object.assign(document.createElement('span'), { className: 'w', textContent: w })));
  typing.value = '';
  typing.className = '';
  $('#result').hidden = true;
  $('#r-time').textContent = '0';
  $('#r-live').textContent = '0';
  $('#r-bar').style.width = '0';
  show('race');
  drawTarget();
}

function randomText() {
  const pool = texts.filter((t) => !state.text || t.id !== state.text.id);
  return pool[Math.floor(Math.random() * pool.length)];
}

function note(message) {
  $('#toast').textContent = message;
  clearTimeout(note.timer);
  note.timer = setTimeout(() => ($('#toast').textContent = ''), 4000);
}

function toggleFav(id) {
  if (!favs.delete(id)) favs.add(id);
  save('favs', [...favs]);
  renderPick();
}

function nextMode() {
  return state.mode === 'ghost' ? 'normal' : state.mode;
}

async function startGhost() {
  try {
    const { best } = await api.best(state.text.id);
    if (!best) return note('Todavía no tenés un récord en este texto.');
    startRace(state.text, 'ghost', best);
  } catch (err) {
    note(err.message);
  }
}

function practiceText() {
  const pick = () => state.errorWords[Math.floor(Math.random() * state.errorWords.length)];
  return { id: 0, category: 'Práctica', text: Array.from({ length: 20 }, pick).join(' ') };
}

function nextText() {
  return state.mode === 'practice' ? practiceText() : randomText();
}

async function startPractice() {
  try {
    const { words } = await api.stats();
    if (words.length < 5) return note('Todavía no hay suficientes errores registrados. Jugá algunas carreras primero.');
    state.errorWords = words.map((w) => w.key);
    startRace(practiceText(), 'practice');
  } catch (err) {
    note(err.message);
  }
}

const view = { handle: null, page: 0 };

function textLabel(id) {
  const text = texts.find((t) => t.id === id);
  return text ? `#${id} ${text.category}` : `#${id}`;
}

async function loadHistory() {
  renderHistory(await api.userRaces(view.handle, view.page), view.page, { speed, textLabel });
}

async function openProfile(handle) {
  try {
    const data = await api.profile(handle);
    view.handle = data.handle;
    view.page = 0;
    renderProfile(data, { speed, unit: unitLabel(), textLabel, isMe: data.handle === state.me });
    show('profile');
    await loadHistory();
  } catch (err) {
    note(err.message);
  }
}

async function searchPilots() {
  const query = $('#pf-search').value.trim();
  const box = $('#pf-results');
  if (query.length < 2) { box.hidden = true; return; }
  const { rows } = await api.searchUsers(query).catch(() => ({ rows: [] }));
  box.innerHTML = rows.length
    ? rows.map((r) => `<li data-handle="${esc(r.handle)}"><span class="av sm">${esc(r.name.charAt(0).toUpperCase())}</span>${esc(r.name)} <small>@${esc(r.handle)}</small></li>`).join('')
    : '<li class="none">No hay pilotos con ese nombre.</li>';
  box.hidden = false;
}

async function openStats() {
  try {
    renderStats(await api.stats(), speed);
    show('stats');
  } catch (err) {
    note(err.message);
  }
}

function die() {
  clearInterval(state.timer);
  state.over = true;
  typing.blur();
  $('#r-flag').hidden = true;
  $('#result').classList.add('dead');
  $('#result').hidden = false;
  document.dispatchEvent(new CustomEvent('death', { detail: { textId: state.text.id } }));
}

function tick() {
  const { engine } = state;
  $('#r-time').textContent = Math.floor(engine.elapsed());
  $('#r-live').textContent = speed(engine.cpm());
  $('#r-bar').style.width = (engine.index / engine.words.length) * 100 + '%';
  if (state.ghost) {
    const ahead = (state.ghost / 60) * engine.elapsed() / state.text.text.length;
    $('#r-ghost').style.width = Math.min(1, ahead) * 100 + '%';
  }
}

function finish() {
  clearInterval(state.timer);
  state.over = true;
  const { engine } = state;
  const cpm = engine.cpm();
  const previous = state.history.length ? Math.max(...state.history.map((h) => h.cpm)) : 0;
  if (state.mode === 'normal' || state.mode === 'ghost') {
    state.history = [...state.history, { id: state.text.id, cpm, acc: engine.accuracy(), at: Date.now() }].slice(-50);
    save('history', state.history);
  }
  if (state.mode !== 'practice') {
    document.dispatchEvent(new CustomEvent('race', {
      detail: { textId: state.text.id, cpm, acc: engine.accuracy(), hc: state.mode === 'hc', chars: engine.missedChars, words: engine.missedWords },
    }));
  }

  $('#r-bar').style.width = '100%';
  $('#r-flag').hidden = !(['normal', 'ghost'].includes(state.mode) && previous && cpm > previous);
  $('#r-acc').textContent = engine.accuracy() + '%';
  $('#r-total').textContent = engine.elapsed().toFixed(1);
  $('#result').hidden = false;
  typing.blur();

  const goal = speed(cpm);
  const out = $('#r-speed');
  const began = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - began) / 600);
    out.textContent = Math.round(goal * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

typing.addEventListener('input', () => {
  const { engine } = state;
  if (!engine || engine.finished || state.over) return;
  const first = !engine.startedAt;
  const res = engine.input(typing.value);
  typing.value = res.typed;
  typing.classList.toggle('err', res.wrong);
  if (state.mode === 'hc' && res.wrong) return die();
  if (first) state.timer = setInterval(tick, 100);
  drawTarget();
  tick();
  if (engine.finished) finish();
});

typing.addEventListener('paste', (e) => e.preventDefault());
typing.addEventListener('blur', () => { if (state.engine && !state.over && !$('#race').hidden) typing.focus(); });

document.addEventListener('keydown', (e) => {
  if ($('#race').hidden) return;
  if (e.key === 'Tab') { e.preventDefault(); startRace(state.text, state.mode, state.ghost); }
  else if (e.key === 'Escape') { clearInterval(state.timer); goHome(); }
  else if (e.key === 'Enter' && state.over) startRace(nextText(), nextMode());
});

function goHome() {
  clearInterval(state.timer);
  state.engine = null;
  show('home');
}

$('#go-random').onclick = () => startRace(randomText());
$('#go-pick').onclick = () => { renderPick(); show('pick'); };
$('#pick-back').onclick = goHome;
$('#logo').onclick = (e) => { e.preventDefault(); goHome(); };
$('#r-next').onclick = () => startRace(nextText(), nextMode());
$('#r-again').onclick = () => startRace(state.text, state.mode, state.ghost);
$('#r-ghostbtn').onclick = startGhost;
$('#go-hc').onclick = () => startRace(randomText(), 'hc');
$('#go-practice').onclick = startPractice;
$('#nav-stats').onclick = openStats;
document.addEventListener('profile', (e) => openProfile(e.detail));
document.addEventListener('session', (e) => { state.me = e.detail ? e.detail.handle : null; });
document.addEventListener('units', () => { if (!$('#profile').hidden) openProfile(view.handle); });
$('#pf-back').onclick = goHome;
$('#pf-allmedals').onclick = () => $('#medals').showModal();
$('#medals-close').onclick = () => $('#medals').close();
$('#pf-search').oninput = () => { clearTimeout(searchPilots.timer); searchPilots.timer = setTimeout(searchPilots, 250); };
$('#pf-results').onclick = (e) => {
  const row = e.target.closest('li[data-handle]');
  if (!row) return;
  $('#pf-results').hidden = true;
  $('#pf-search').value = '';
  openProfile(row.dataset.handle);
};
$('#pf-prev').onclick = () => { view.page--; loadHistory(); };
$('#pf-next').onclick = () => { view.page++; loadHistory(); };
$('#pf-tags').onclick = (e) => {
  const copy = e.target.closest('[data-copy]');
  if (copy) navigator.clipboard.writeText(copy.dataset.copy).then(() => note('Usuario de Discord copiado.')).catch(() => {});
};
$('#pf-history').onclick = (e) => {
  const btn = e.target.closest('[data-ghost]');
  if (!btn) return;
  const text = texts.find((t) => t.id === Number(btn.dataset.ghost));
  if (!text) return note('Ese texto ya no está disponible.');
  startRace(text, 'ghost', Number(btn.dataset.cpm));
};
$('#nav-settings').onclick = () => $('#settings').showModal();
$('#settings-close').onclick = () => $('#settings').close();
$('#stats-back').onclick = goHome;
$('#r-home').onclick = goHome;
$('#search').oninput = renderPick;
$('#chips').onclick = (e) => {
  const cat = e.target.dataset.cat;
  if (!cat) return;
  state.category = cat === 'Todos' ? null : cat;
  renderPick();
};
$('#cards').onclick = (e) => {
  if (e.target.dataset.fav) return toggleFav(Number(e.target.dataset.fav));
  const card = e.target.closest('li[data-id]');
  if (card) startRace(texts.find((t) => t.id === Number(card.dataset.id)));
};
$('#units').onclick = (e) => {
  if (!e.target.dataset.unit) return;
  state.unit = e.target.dataset.unit;
  save('unit', state.unit);
  applyPrefs();
  document.dispatchEvent(new Event('units'));
};
$('#theme').onchange = (e) => {
  state.theme = e.target.value;
  save('theme', state.theme);
  applyPrefs();
};

applyPrefs();
loadCatalog();
