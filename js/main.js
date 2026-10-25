import { Engine } from './engine.js';
import { load, save } from './store.js';
import './account.js';
import './site.js';
import './home.js';
import { api } from './api.js';
import { renderStats, redrawStats } from './stats.js';
import { renderProfile, renderHistory } from './profile.js';
import { openVitrina } from './vitrina.js';
import { esc } from './ui.js';
import { avatarInner } from './avatar.js';
import { duel } from './duel.js';

const $ = (sel) => document.querySelector(sel);
let texts = [];
let categories = [];
const screens = ['home', 'pick', 'race', 'stats', 'profile', 'duel'];

const state = {
  unit: load('unit', 'cpm'),
  theme: ['neanbit', 'claro', 'carbon'].includes(load('theme', '')) ? load('theme', '') : 'neanbit',
  history: load('history', []),
  category: null,
  length: '',
  engine: null,
  mode: 'normal',
  over: false,
  errorWords: [],
  ghost: 0,
  me: null,
  active: 0,
  text: null,
  timer: 0,
  duel: null,
};

const favs = new Set(load('favs', []));
const typing = $('#typing');
const target = $('#target');

async function loadCatalog() {
  try {
    ({ texts, categories } = await api.texts());
    document.dispatchEvent(new CustomEvent('catalog', { detail: texts }));
  } catch {
    note('No se pudo cargar el catálogo de textos.');
  }
}

function show(name) {
  document.body.classList.toggle('profile-view', name === 'profile');
  $('#more-menu').hidden = true;
  screens.forEach((s) => ($('#' + s).hidden = s !== name));
  if (name === 'home') document.dispatchEvent(new Event('home'));
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
}

const star = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9-4.3-4.1 5.9-.8z"/></svg>';
const words = (t) => t.text.split(' ').length;

function lengthCuts() {
  const sorted = texts.map(words).sort((a, b) => a - b);
  return [sorted[Math.floor(sorted.length / 3)] || 0, sorted[Math.floor((sorted.length * 2) / 3)] || 0];
}

function lengthOf(t, cuts) {
  const n = words(t);
  return n < cuts[0] ? 's' : n < cuts[1] ? 'm' : 'l';
}

function highlight(text, query) {
  if (!query) return esc(text);
  const lower = text.toLowerCase();
  let out = '';
  let from = 0;
  for (let at = lower.indexOf(query); at > -1; at = lower.indexOf(query, from)) {
    out += esc(text.slice(from, at)) + '<mark>' + esc(text.slice(at, at + query.length)) + '</mark>';
    from = at + query.length;
  }
  return out + esc(text.slice(from));
}

function pickList() {
  const query = $('#search').value.trim().toLowerCase();
  const cuts = lengthCuts();
  const base = texts.filter((t) => (!query || t.text.toLowerCase().includes(query)) && (!state.length || lengthOf(t, cuts) === state.length));
  const list = base.filter((t) => !state.category || (state.category === 'Favoritos' ? favs.has(t.id) : t.category === state.category));
  return { query, base, list };
}

function renderPick() {
  const { query, base, list } = pickList();
  const count = (c) => base.filter((t) => (c === 'Todos' ? true : c === 'Favoritos' ? favs.has(t.id) : t.category === c)).length;
  $('#chips').innerHTML = ['Todos', 'Favoritos', ...categories].map((c) =>
    `<button data-cat="${esc(c)}" class="${(state.category || 'Todos') === c ? 'on' : ''}">${esc(c)}<i>${count(c)}</i></button>`
  ).join('');
  document.querySelectorAll('#len button').forEach((b) => b.classList.toggle('on', b.dataset.len === state.length));
  $('#pick-count').textContent = `${list.length} ${list.length === 1 ? 'texto' : 'textos'}`;
  $('#pick-random').disabled = !list.length;

  const best = new Map();
  for (const h of state.history) best.set(h.id, Math.max(best.get(h.id) || 0, h.cpm));
  $('#cards').innerHTML = list.length
    ? list.map((t) => {
      const mine = best.get(t.id);
      return `<li data-id="${t.id}"><div class="c-top"><span class="c-id">#${t.id}</span><span class="c-cat">${esc(t.category)}</span>`
        + `<button class="star${favs.has(t.id) ? ' on' : ''}" data-fav="${t.id}" aria-label="Favorito" aria-pressed="${favs.has(t.id)}">${star}</button></div>`
        + `<p>${highlight(t.text, query)}</p>`
        + `<div class="c-foot"><span>${words(t)} palabras</span>${mine ? `<span class="c-best">Tu mejor: <b>${speed(mine)}</b> ${unitLabel()}</span>` : ''}</div></li>`;
    }).join('')
    : `<li class="none">${state.category === 'Favoritos' && !favs.size ? 'Todavía no marcaste favoritos. Tocá la estrella de un texto para guardarlo.' : 'No hay textos que coincidan con esa búsqueda.'}</li>`;
}

function drawTarget() {
  const { engine } = state;
  const words = target.children;
  const previous = words[state.active];
  if (previous && state.active !== engine.index) {
    previous.textContent = engine.words[state.active];
    previous.className = 'w done';
  }
  state.active = engine.index;
  const el = words[engine.index];
  if (!el) return;

  const word = engine.words[engine.index];
  const typed = typing.value.slice(0, word.length + 4);
  const ok = engine.matched(typed);
  const letters = word.split('').map((ch, i) => {
    const cls = i < ok ? 'ok' : i < typed.length ? 'bad' : i === typed.length ? 'next' : '';
    return `<span class="${cls}">${esc(ch)}</span>`;
  });
  const extra = typed.length > word.length ? `<span class="bad extra">${esc(typed.slice(word.length))}</span>` : '';
  const ready = ok === word.length && typed.length === word.length && !engine.isLast;
  el.className = 'w on' + (ready ? ' ready' : '');
  el.innerHTML = letters.join('') + extra;
}

function startRace(text, mode = 'normal', ghost = 0) {
  if (!text) return note('Todavía no hay textos cargados.');
  clearInterval(state.timer);
  state.text = text;
  state.mode = mode;
  state.ghost = ghost;
  if (mode !== 'duel') state.duel = null;
  $('#r-ghost').style.width = '0';
  state.over = false;
  $('#result').classList.remove('dead');
  state.engine = new Engine(text.text);
  target.replaceChildren(...state.engine.words.map((w) => Object.assign(document.createElement('span'), { className: 'w', textContent: w })));
  typing.value = '';
  typing.className = '';
  state.active = 0;
  $('#result').hidden = true;
  $('#r-time').textContent = '0';
  $('#r-live').textContent = '0';
  $('#r-bar').style.width = '0';
  typing.placeholder = 'Empezá a escribir para arrancar el reloj';
  $('#r-ghostbtn').hidden = ['hc', 'practice', 'duel'].includes(mode);
  $('#r-liveacc').textContent = '100';
  $('#r-words').textContent = '0';
  $('#r-of').textContent = '/ ' + state.engine.words.length;
  $('#r-mode').textContent = modeNames[mode] || 'Carrera';
  $('#r-mode').dataset.mode = mode;
  $('#r-meta').textContent = raceMeta(text, mode, ghost);
  const isDuel = mode === 'duel';
  typing.disabled = isDuel;
  if (isDuel) typing.placeholder = 'Esperá la largada';
  $('#r-count').hidden = !isDuel;
  $('#r-count').classList.remove('out');
  $('#r-count').dataset.state = 'wait';
  $('#r-count-n').textContent = '';
  $('#r-legend').hidden = !isDuel;
  $('#r-track').classList.toggle('duel', isDuel);
  $('#r-forfeit').hidden = !isDuel;
  $('#r-forfeit').textContent = 'Abandonar';
  $('#r-again').hidden = isDuel;
  $('#r-next-label').textContent = isDuel ? 'Otro duelo' : 'Siguiente';
  $('#d-modal').hidden = true;
  $('.hint').hidden = isDuel;
  if (isDuel) {
    $('#r-opp-name').textContent = state.duel.opp.name;
    $('#r-count-vs').textContent = 'Contra ' + state.duel.opp.name;
    $('#r-ghost').style.width = '0';
    $('#d-bar-fill').style.width = '0';
  }
  show('race');
  drawTarget();
}

const modeNames = { normal: 'Carrera', ghost: 'Contra tu récord', hc: 'Hardcore', practice: 'Entrenamiento', duel: 'Duelo' };

function raceMeta(text, mode, ghost) {
  if (mode === 'practice') return 'Tus palabras difíciles';
  if (mode === 'duel') return `Contra ${state.duel.opp.name}, ${text.text.split(' ').length} palabras`;
  const base = `#${text.id} ${text.category}, ${text.text.split(' ').length} palabras`;
  return mode === 'ghost' ? `${base}. Récord ${speed(ghost)} ${unitLabel()}` : base;
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
    ? rows.map((r) => `<li data-handle="${esc(r.handle)}"><span class="av sm">${avatarInner(r)}</span>${esc(r.name)} <small>@${esc(r.handle)}</small></li>`).join('')
    : '<li class="none">No hay pilotos con ese nombre.</li>';
  box.hidden = false;
}

function statsKit() {
  const category = (id) => texts.find((t) => t.id === id)?.category;
  return { speed, unit: unitLabel(), category };
}

async function openStats() {
  try {
    renderStats(await api.stats(), statsKit());
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
  $('#r-deadinfo').textContent = `Llegaste a la palabra ${state.engine.index + 1} de ${state.engine.words.length}. En Hardcore un error termina la carrera.`;
  $('#result').hidden = false;
  document.dispatchEvent(new CustomEvent('death', { detail: { textId: state.text.id } }));
}

function tick() {
  const { engine } = state;
  $('#r-time').textContent = Math.floor(engine.elapsed());
  $('#r-live').textContent = speed(engine.cpm());
  $('#r-liveacc').textContent = engine.accuracy();
  $('#r-words').textContent = engine.index;
  $('#r-bar').style.width = (engine.index / engine.words.length) * 100 + '%';
  if (state.ghost) {
    const ahead = (state.ghost / 60) * engine.elapsed() / state.text.text.length;
    $('#r-ghost').style.width = Math.min(1, ahead) * 100 + '%';
  }
}

function finish() {
  if (state.mode === 'duel') return finishDuel();
  clearInterval(state.timer);
  state.over = true;
  const { engine } = state;
  const cpm = engine.cpm();
  const previous = state.history.length ? Math.max(...state.history.map((h) => h.cpm)) : 0;
  const recent = state.history.slice(-10);
  const base = recent.length ? recent.reduce((a, h) => a + h.cpm, 0) / recent.length : 0;
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
  $('#r-wcount').textContent = engine.words.length;
  $('#r-errors').textContent = engine.misses;
  const delta = $('#r-delta');
  const gap = base && ['normal', 'ghost'].includes(state.mode) ? speed(cpm) - speed(base) : null;
  delta.hidden = gap === null;
  if (gap !== null) {
    delta.className = 'delta ' + (gap >= 0 ? 'up' : 'down');
    delta.textContent = gap === 0 ? 'Igual que tu promedio' : `${Math.abs(gap)} ${unitLabel()} ${gap > 0 ? 'sobre' : 'bajo'} tu promedio`;
  }
  $('#r-total').textContent = engine.elapsed().toFixed(1);
  $('#r-guest').hidden = !!state.me;
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
  if (first) {
    state.timer = setInterval(tick, 100);
    typing.placeholder = '';
  }
  drawTarget();
  tick();
  if (state.mode === 'duel') duel.progress(engine.chars());
  if (engine.finished) finish();
});

typing.addEventListener('paste', (e) => e.preventDefault());
typing.addEventListener('blur', () => { if (state.engine && !state.over && !$('#race').hidden) typing.focus(); });

document.addEventListener('keydown', (e) => {
  if ($('#race').hidden) return;
  const inDuel = state.mode === 'duel';
  if (e.key === 'Tab') { e.preventDefault(); if (!inDuel) startRace(state.text, state.mode, state.ghost); }
  else if (e.key === 'Escape') { if (inDuel && !state.duel.ended && (state.duel.live || state.over)) return; clearInterval(state.timer); goHome(); }
  else if (e.key === 'Enter' && state.over) { if (!inDuel) startRace(nextText(), nextMode()); else if (state.duel.ended) nextDuel(); }
});

function goHome() {
  clearInterval(state.timer);
  state.engine = null;
  duel.close();
  show('home');
}

document.addEventListener('play', (e) => startRace(texts.find((t) => t.id === e.detail)));
$('#go-random').onclick = () => startRace(randomText());
$('#go-pick').onclick = () => { renderPick(); show('pick'); };
$('#pick-back').onclick = goHome;
$('#logo').onclick = (e) => { e.preventDefault(); goHome(); };
$('#r-next').onclick = () => (state.mode === 'duel' ? nextDuel() : startRace(nextText(), nextMode()));
$('#r-again').onclick = () => startRace(state.text, state.mode, state.ghost);
$('#r-ghostbtn').onclick = startGhost;
$('#go-hc').onclick = () => startRace(randomText(), 'hc');
$('#go-practice').onclick = startPractice;
$('#nav-stats').onclick = openStats;
document.addEventListener('profile', (e) => openProfile(e.detail));
document.addEventListener('session', (e) => {
  state.me = e.detail ? e.detail.handle : null;
  if (!e.detail) duel.close();
});
document.addEventListener('units', () => {
  if (!$('#profile').hidden) openProfile(view.handle);
  if (!$('#pick').hidden) renderPick();
  if (!$('#stats').hidden) redrawStats(statsKit());
});
$('#pf-back').onclick = goHome;
$('#nav-more').onclick = () => {
  const menu = $('#more-menu');
  menu.hidden = !menu.hidden;
  $('#nav-more').setAttribute('aria-expanded', String(!menu.hidden));
};
$('#more-menu').onclick = (e) => {
  const item = e.target.closest('[data-fwd]');
  if (!item) return;
  $('#more-menu').hidden = true;
  document.getElementById(item.dataset.fwd).click();
};
document.addEventListener('click', (e) => {
  if (!e.target.closest('.gear-wrap')) $('#more-menu').hidden = true;
});
$('#pf-allmedals').onclick = openVitrina;
$('#pf-medals').onclick = (e) => {
  const slot = e.target.closest('[data-open]');
  if (!slot) return;
  if (slot.dataset.open === 'editor') document.dispatchEvent(new CustomEvent('edit-profile', { detail: 'insignias' }));
  else openVitrina();
};
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
$('#pf-statslink').onclick = openStats;
$('#preview-close').onclick = () => $('#preview').close();
$('#pf-history').onclick = (e) => {
  const link = e.target.closest('[data-text]');
  if (link) {
    const text = texts.find((t) => t.id === Number(link.dataset.text));
    if (!text) return note('Ese texto ya no está disponible.');
    $('#preview-title').textContent = textLabel(text.id);
    $('#preview-meta').textContent = `${text.text.split(' ').length} palabras`;
    $('#preview-body').textContent = text.text;
    $('#preview-play').onclick = () => { $('#preview').close(); startRace(text); };
    $('#preview').showModal();
    return;
  }
  const btn = e.target.closest('[data-ghost]');
  if (!btn) return;
  const text = texts.find((t) => t.id === Number(btn.dataset.ghost));
  if (!text) return note('Ese texto ya no está disponible.');
  startRace(text, 'ghost', Number(btn.dataset.cpm));
};
$('#nav-settings').onclick = () => $('#settings').showModal();
$('#settings-close').onclick = () => $('#settings').close();
$('#stats-back').onclick = goHome;
$('#s-first').onclick = () => startRace(randomText());
$('#s-train').onclick = startPractice;
$('#r-home').onclick = goHome;
$('#search').oninput = renderPick;
$('#chips').onclick = (e) => {
  const cat = e.target.closest('[data-cat]')?.dataset.cat;
  if (!cat) return;
  state.category = cat === 'Todos' ? null : cat;
  renderPick();
};
$('#len').onclick = (e) => {
  if (e.target.dataset.len === undefined) return;
  state.length = e.target.dataset.len;
  renderPick();
};
$('#pick-random').onclick = () => {
  const { list } = pickList();
  if (list.length) startRace(list[Math.floor(Math.random() * list.length)]);
};
$('#cards').onclick = (e) => {
  const fav = e.target.closest('[data-fav]');
  if (fav) return toggleFav(Number(fav.dataset.fav));
  const card = e.target.closest('li[data-id]');
  if (card) startRace(texts.find((t) => t.id === Number(card.dataset.id)));
};
$('#units').onclick = (e) => {
  const unit = e.target.closest('[data-unit]')?.dataset.unit;
  if (!unit || unit === state.unit) return;
  state.unit = unit;
  save('unit', unit);
  applyPrefs();
  document.dispatchEvent(new Event('units'));
};
$('#theme').onchange = (e) => {
  state.theme = e.target.value;
  save('theme', state.theme);
  applyPrefs();
};

function openDuel(queue = false) {
  if (!state.me) {
    note('Ingresá para jugar duelos.');
    return $('#account').click();
  }
  clearInterval(state.timer);
  state.engine = null;
  show('duel');
  duel.open({ queue });
}

function nextDuel() {
  openDuel(true);
}

function startDuelRace(match) {
  state.duel = { opp: match.opp, len: match.text.length, live: false, ended: false, oppCpm: 0 };
  startRace({ id: match.textId, category: 'Duelo', text: match.text }, 'duel');
}

function setCount(label, kind = 'num') {
  const box = $('#r-count');
  const n = $('#r-count-n');
  n.textContent = label;
  box.dataset.state = kind;
  box.classList.remove('tick');
  void box.offsetWidth;
  box.classList.add('tick');
}

function finishDuel() {
  clearInterval(state.timer);
  state.over = true;
  const { engine } = state;
  duel.finish({ acc: engine.accuracy(), chars: engine.missedChars, words: engine.missedWords });
  $('#r-bar').style.width = '100%';
  $('#r-forfeit').hidden = true;
  $('#r-meta').textContent = raceMeta(state.text, 'duel', 0);
  typing.blur();
  showVerdict({
    wait: true,
    you: { cpm: engine.cpm(), acc: engine.accuracy(), ms: engine.elapsed() * 1000 },
    opp: state.duel.oppCpm ? { cpm: state.duel.oppCpm } : null,
    words: engine.words.length,
    errors: engine.misses,
  });
}

function showVerdict({ win = null, forfeit = false, wait = false, you = null, opp = null, words = null, errors = null }) {
  const verdict = $('#d-verdict');
  const name = state.duel ? state.duel.opp.name : 'Rival';
  verdict.dataset.win = wait ? 'wait' : win === true ? 'win' : win === false ? 'lose' : 'draw';
  verdict.classList.toggle('dnf', !you);
  let title = 'Terminaste';
  let sub = `Esperando a que ${name} termine…`;
  if (!wait) {
    title = win === true ? (forfeit ? 'Ganaste por abandono' : 'Ganaste') : win === false ? 'Perdiste' : 'Sin ganador';
    if (win === null) sub = 'Nadie llegó a terminar el texto.';
    else if (forfeit) sub = `${name} se desconectó antes de terminar.`;
    else if (!you) sub = `${name} terminó y vos no llegaste a tiempo.`;
    else if (opp) {
      const gap = (Math.abs(you.ms - opp.ms) / 1000).toFixed(1);
      sub = `${win ? 'Le sacaste' : 'Te sacó'} ${gap} s de ventaja.`;
    } else sub = '';
  }
  $('#d-kicker').textContent = `Duelo contra ${name}`;
  $('#d-title').textContent = title;
  $('#d-sub').textContent = sub;
  $('#d-opp-label').textContent = name;
  $('#d-me').textContent = you ? speed(you.cpm) : '—';
  $('#d-opp').textContent = opp ? speed(opp.cpm) : '—';
  document.querySelectorAll('.d-u').forEach((el) => (el.textContent = unitLabel()));
  if (you) {
    $('#d-acc').textContent = you.acc + '%';
    $('#d-time').textContent = (you.ms / 1000).toFixed(1) + ' s';
  }
  if (words !== null) $('#d-words').textContent = words;
  if (errors !== null) $('#d-errs').textContent = errors;
  $('#d-bar').hidden = !wait;
  $('#d-actions').hidden = wait;
  $('#d-modal').hidden = false;
  verdict.classList.remove('pop');
  void verdict.offsetWidth;
  verdict.classList.add('pop');
  if (!wait) $('#d-next').focus({ preventScroll: true });
}

document.addEventListener('duel-match', (e) => startDuelRace(e.detail));
document.addEventListener('duel-count', (e) => {
  if (state.mode === 'duel') setCount(String(e.detail.n));
});
document.addEventListener('duel-go', () => {
  if (state.mode !== 'duel' || !state.engine) return;
  state.duel.live = true;
  state.engine.startedAt = performance.now();
  clearInterval(state.timer);
  state.timer = setInterval(tick, 100);
  typing.disabled = false;
  typing.placeholder = '';
  setCount('Ya', 'go');
  const box = $('#r-count');
  setTimeout(() => {
    if (state.mode !== 'duel') return;
    box.classList.add('out');
    typing.focus();
    setTimeout(() => { if (state.mode === 'duel') box.hidden = true; }, 450);
  }, 550);
  typing.focus();
});
document.addEventListener('duel-opp', (e) => {
  if (state.mode !== 'duel' || !state.duel) return;
  const pct = Math.min(100, (e.detail.n / state.duel.len) * 100) + '%';
  $('#r-ghost').style.width = pct;
  $('#d-bar-fill').style.width = pct;
});
document.addEventListener('duel-opp_done', (e) => {
  if (state.mode !== 'duel' || !state.duel) return;
  state.duel.oppCpm = e.detail.cpm;
  if (!state.over) $('#r-meta').textContent = `${state.duel.opp.name} ya terminó, con ${speed(e.detail.cpm)} ${unitLabel()}. Todavía llegás a tiempo.`;
  else $('#d-opp').textContent = speed(e.detail.cpm);
});
document.addEventListener('duel-result', (e) => {
  if (state.mode !== 'duel' || !state.duel) return;
  const r = e.detail;
  clearInterval(state.timer);
  state.over = true;
  state.duel.ended = true;
  typing.blur();
  typing.disabled = true;
  $('#r-forfeit').hidden = true;
  $('#r-count').hidden = true;
  $('#r-meta').textContent = raceMeta(state.text, 'duel', 0);
  if (r.you) document.dispatchEvent(new Event('race-saved'));
  showVerdict({ win: r.win, forfeit: r.forfeit, you: r.you, opp: r.opp,
    words: r.you ? state.text.text.split(' ').length : null,
    errors: state.engine && r.you ? state.engine.misses : null });
});
document.addEventListener('duel-cancelled', () => {
  note('Tu rival se fue antes de largar.');
  openDuel();
});
document.addEventListener('duel-lost', () => {
  if (state.mode !== 'duel') return;
  clearInterval(state.timer);
  state.over = true;
  note('Se perdió la conexión con el duelo.');
  openDuel();
});
document.addEventListener('duel-replaced', () => goHome());
$('#go-duel').onclick = () => openDuel();
$('#duel-back').onclick = goHome;
$('#d-next').onclick = nextDuel;
$('#d-home').onclick = goHome;
$('#r-forfeit').onclick = () => {
  const btn = $('#r-forfeit');
  if (btn.dataset.sure) {
    clearTimeout(btn.timer);
    delete btn.dataset.sure;
    return goHome();
  }
  btn.dataset.sure = '1';
  btn.textContent = 'Confirmar abandono';
  btn.timer = setTimeout(() => { delete btn.dataset.sure; btn.textContent = 'Abandonar'; }, 3000);
};

applyPrefs();
loadCatalog();
