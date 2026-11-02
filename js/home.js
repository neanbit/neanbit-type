import { api } from './api.js';
import { load } from './store.js';
import { avatarInner } from './avatar.js';
import { frameAttr, nameLite } from './rewards.js';
import { $, esc, svg, icons } from './ui.js';

const scope = { races: 'today', avg: '10', hc: 'today', duels: 'all', tourneys: 'all' };
const page = { races: 0, avg: 0, hc: 0, duels: 0, tourneys: 0 };
const PAGE = 10;
const cache = {};
let current = 'races';
let me = null;
let pulse = null;
let daily = null;
let catalog = [];
let loadedAt = 0;

const speed = (cpm) => (load('unit', 'cpm') === 'wpm' ? Math.round(cpm / 5) : cpm);
const unitName = () => (load('unit', 'cpm') === 'wpm' ? 'WPM' : 'CPM');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const textLabel = (id) => {
  const t = catalog.find((x) => x.id === id);
  return t ? `#${id} ${t.category}` : `#${id}`;
};

const boards = {
  races: {
    scopes: [['today', '24 h'], ['all', 'Histórico']],
    load: (v) => api.topRaces(v),
    sub: (r) => (r.text_id ? textLabel(r.text_id) : 'Tu mejor marca'),
    empty: 'Todavía no hay carreras en este período.',
    miss: 'Todavía no tenés una marca en este período.',
  },
  avg: {
    scopes: [['10', 'Últimas 10'], ['all', 'General']],
    load: (v, p) => api.averages(v, p),
    sub: (r) => (r.races ? plural(r.races, 'carrera', 'carreras') : 'Tu promedio'),
    empty: 'Nadie llegó todavía a las 5 carreras que hacen falta.',
    miss: () => `Necesitás 5 carreras para entrar${pulse ? ` (llevás ${pulse.races})` : ''}.`,
  },
  hc: {
    scopes: [['today', '24 h'], ['all', 'Histórico']],
    load: (v, p) => api.ranking(v, true, p),
    sub: (r) => (r.races ? `${plural(r.races, 'carrera', 'carreras')}, ${plural(r.deaths || 0, 'eliminación', 'eliminaciones')}` : 'Tu mejor marca'),
    empty: 'Nadie corrió en Hardcore todavía.',
    miss: 'Todavía no corriste en Hardcore en este período.',
  },
  duels: {
    scopes: [['today', '24 h'], ['all', 'Histórico']],
    load: (v, p) => api.duelRanking(v, p),
    sub: (r) => (r.duels ? `${plural(r.duels, 'duelo', 'duelos')}, ${Math.round((r.wins / r.duels) * 100)}% ganados` : 'Tus victorias'),
    val: (r) => r.wins,
    empty: 'Nadie ganó un duelo en este período.',
    miss: 'Todavía no ganaste un duelo en este período.',
  },
  tourneys: {
    scopes: [['all', 'Histórico']],
    load: () => api.tourneyRanking(),
    sub: (r) => `${plural(r.wins, 'partido ganado', 'partidos ganados')}, ${plural(r.played, 'torneo', 'torneos')}`,
    val: (r) => r.titles,
    empty: 'Todavía nadie ganó un torneo.',
    miss: 'Todavía no jugaste un torneo.',
  },
};

function row(board, r, pos, own) {
  const seal = r.verified ? `<span class="vf" title="${r.verified === 2 ? 'Servidor' : 'Verificado'}">${svg(icons.seal)}</span>` : '';
  return `<li data-handle="${esc(r.handle)}" class="${own ? 'me' : ''}"><span class="pos">${pos}</span>`
    + `<span class="av sm"${frameAttr(r.cosm)}>${avatarInner(r)}</span>`
    + `<span class="nm"><b>${nameLite(r.name, r.cosm)}</b>${seal}<small>${esc(board.sub(r))}</small></span>`
    + `<span class="val">${board.val ? board.val(r) : speed(r.cpm)}</span></li>`;
}

function drawBoard() {
  const board = boards[current];
  const data = cache[current + scope[current] + page[current]];
  const rows = $('#board-rows');
  const note = $('#board-note');
  note.textContent = '';
  if (!data) {
    rows.innerHTML = '<li class="none">Cargando…</li>';
    return;
  }
  if (data.error) {
    rows.innerHTML = '<li class="none">El ranking necesita el servidor en marcha.</li>';
    return;
  }
  const mine = me && data.rows.findIndex((r) => r.handle === me.handle);
  let html = data.rows.length
    ? data.rows.map((r, i) => row(board, r, page[current] * PAGE + i + 1, i === mine)).join('')
    : `<li class="none">${board.empty}</li>`;
  if (me && data.me && mine < 0) {
    html += '<li class="gap" aria-hidden="true"></li>' + row(board, { ...me, ...data.me }, data.me.pos, true);
  } else if (me && !data.me && data.rows.length) {
    note.textContent = typeof board.miss === 'function' ? board.miss() : board.miss;
  }
  rows.innerHTML = html;
  const pages = Math.ceil((data.total || 0) / PAGE);
  $('#board-pager').hidden = pages < 2;
  if (pages > 1) {
    $('#bp-info').textContent = `Puestos ${page[current] * PAGE + 1} a ${Math.min(data.total, (page[current] + 1) * PAGE)} de ${data.total}`;
    $('#bp-prev').disabled = page[current] === 0;
    $('#bp-next').disabled = page[current] + 1 >= pages;
  }
}

function drawTabs() {
  document.querySelectorAll('#board-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.b === current));
  $('#board-scope').innerHTML = boards[current].scopes
    .map(([v, label]) => `<button data-v="${v}" class="${scope[current] === v ? 'on' : ''}">${label}</button>`).join('');
}

async function loadBoard() {
  drawTabs();
  drawBoard();
  const key = current + scope[current] + page[current];
  try {
    cache[key] = await boards[current].load(scope[current], page[current]);
  } catch {
    cache[key] = { error: true };
  }
  drawBoard();
}

function drawHero() {
  $('#hero-date').textContent = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#hero-title').textContent = me ? `Hola, ${me.name}` : 'Bienvenido';
  $('#invite').hidden = !!me;
  $('#practice-tag').hidden = !!me;
  $('#duel-tag').hidden = !!me;
  $('#pulse').hidden = !(me && pulse);
  drawProgress();

  let sub = 'Corré una carrera y medite contra el resto del ranking.';
  if (me && pulse) {
    if (pulse.today) sub = `Hoy llevás ${plural(pulse.today, 'carrera', 'carreras')}, con ${speed(pulse.todayBest)} ${unitName()} de mejor marca.`;
    else if (pulse.streak) sub = `Corré hoy para mantener tu racha de ${plural(pulse.streak, 'día', 'días')}.`;
    else if (pulse.races) sub = 'Todavía no corriste hoy. Una carrera alcanza para empezar la racha.';
    else sub = 'Todavía no tenés carreras. La primera te deja en el ranking.';
    if (pulse.rank) sub += ` Estás ${pulse.rank}° en promedios.`;
  }
  $('#hero-sub').textContent = sub;

  if (me && pulse) {
    $('#p-streak').textContent = pulse.streak;
    $('#p-streak-u').textContent = pulse.streak === 1 ? 'día' : 'días';
    $('#p-best-l').textContent = 'Mejor ' + unitName();
    $('#p-best').textContent = speed(pulse.best);
    $('#p-avg-l').textContent = 'Promedio ' + unitName();
    $('#p-avg').textContent = speed(pulse.avg);
    $('#p-today').textContent = pulse.today;
    $('#p-today-u').textContent = pulse.today === 1 ? 'carrera' : 'carreras';
  }
}

// Nivel y meta del día
function drawProgress() {
  const box = $('#progress');
  box.hidden = !(me && pulse && pulse.level);
  if (box.hidden) return;
  const { xp, level, from, to, title } = pulse.level;
  $('#lv-name').textContent = 'Nivel ' + level;
  $('#lv-title').textContent = title;
  $('#lv-xp').textContent = `${xp - from} / ${to - from} XP`;
  $('#lv-fill').style.width = Math.round(((xp - from) / (to - from)) * 100) + '%';
  const boost = pulse.boost;
  $('#lv-boost').hidden = !boost;
  if (boost) $('#lv-boost').textContent = `Potenciador activo: x${String(boost.mult).replace('.', ',')} de XP hasta el ${new Date(boost.ends).toLocaleString('es-AR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}.`;
  const goal = pulse.goal || 5;
  const done = Math.min(pulse.today, goal);
  $('#goal-txt').textContent = pulse.today >= goal ? `Meta cumplida: ${plural(pulse.today, 'carrera', 'carreras')}` : `${pulse.today} de ${goal} carreras`;
  $('#goal-ticks').innerHTML = Array.from({ length: goal }, (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('');
  $('#goal-ticks').classList.toggle('full', pulse.today >= goal);
  document.querySelectorAll('#goal-seg button').forEach((b) => b.classList.toggle('on', Number(b.dataset.g) === goal));
}

function drawDaily() {
  const text = catalog.find((t) => t.id === daily);
  $('#daily').hidden = !text;
  if (!text) return;
  const body = text.text.length > 150 ? text.text.slice(0, 150).replace(/\s\S*$/, '') + '…' : text.text;
  $('#daily-text').textContent = body;
  $('#daily-meta').textContent = `#${text.id} ${text.category}, ${plural(text.text.split(' ').length, 'palabra', 'palabras')}`;
}

function drawCommunity(c) {
  $('#community').textContent = c
    ? `${plural(c.users, 'piloto registrado', 'pilotos registrados')}. ${plural(c.today, 'carrera', 'carreras')} en las últimas 24 horas.`
    : '';
}

async function refresh(force) {
  if (!force && Date.now() - loadedAt < 15000) return;
  loadedAt = Date.now();
  drawHero();
  try {
    const data = await api.home();
    pulse = data.pulse;
    daily = data.daily;
    drawCommunity(data.community);
  } catch {
    pulse = null;
    daily = null;
    drawCommunity(null);
  }
  drawHero();
  drawDaily();
  await loadBoard();
}

$('#board-tabs').onclick = (e) => {
  const b = e.target.dataset.b;
  if (!b || b === current) return;
  current = b;
  page[current] = 0;
  loadBoard();
};
$('#board-scope').onclick = (e) => {
  const v = e.target.dataset.v;
  if (!v || v === scope[current]) return;
  scope[current] = v;
  page[current] = 0;
  loadBoard();
};
$('#board-rows').onclick = (e) => {
  const item = e.target.closest('li[data-handle]');
  if (item) document.dispatchEvent(new CustomEvent('profile', { detail: item.dataset.handle }));
};
$('#bp-prev').onclick = () => { page[current]--; loadBoard(); };
$('#bp-next').onclick = () => { page[current]++; loadBoard(); };
$('#goal-edit').onclick = () => { $('#goal-seg').hidden = !$('#goal-seg').hidden; };
$('#goal-seg').onclick = async (e) => {
  const g = Number(e.target.dataset.g);
  if (!g || !pulse) return;
  try { await api.setGoal(g); pulse.goal = g; $('#goal-seg').hidden = true; drawProgress(); } catch {}
};
$('#invite-login').onclick = () => $('#account').click();
$('#daily-go').onclick = () => document.dispatchEvent(new CustomEvent('play', { detail: daily }));

document.addEventListener('session', (e) => { me = e.detail; refresh(true); });
document.addEventListener('catalog', (e) => { catalog = e.detail; drawDaily(); drawBoard(); });
document.addEventListener('race-saved', () => { loadedAt = 0; });
document.addEventListener('home', () => refresh(false));
document.addEventListener('units', () => { drawHero(); drawBoard(); });

drawHero();
drawTabs();
