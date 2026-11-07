import { api } from './api.js';
import { load } from './store.js';
import { avatarInner } from './avatar.js';
import { frameAttr, nameLite } from './rewards.js';
import { openOwnNivel } from './nivel.js';
import { announce } from './unlock.js';
import { $, esc, svg, icons } from './ui.js';
import { tourney } from './tourney.js';

const scope = { races: 'today', avg: '10', hc: 'today', duels: 'all', tourneys: 'all' };
const page = { races: 0, avg: 0, hc: 0, duels: 0, tourneys: 0 };
const PAGE = 10;
const cache = {};
let current = 'races';
let me = null;
let pulse = null;
let extra = null;
let live = null;
let open = [];
let community = null;
let catalog = [];
let missions = [];
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

const unitKey = () => load('unit', 'cpm');
const num = (n) => Number(n).toLocaleString('es-AR');
const clock = (t) => new Date(t).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function ago(t) {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : d < 30 ? `hace ${d} días` : new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

// Barra superior: quién está en la sala de duelos y el movimiento de la comunidad. Todo son números, sin frases armadas.
function drawStats() {
  const parts = [];
  if (live) {
    parts.push(`<span><i class="hm-dot${live.online ? ' on' : ''}"></i><b>${num(live.online)}</b> en la sala de Duelos${live.queued ? `, <b>${num(live.queued)}</b> buscando rival` : ''}</span>`);
  }
  if (community) {
    parts.push(`<span><b>${num(community.users)}</b> ${community.users === 1 ? 'usuario' : 'usuarios'}</span>`);
    parts.push(`<span><b>${num(community.today)}</b> ${community.today === 1 ? 'carrera' : 'carreras'} en 24 h</span>`);
  }
  $('#hm-stats').innerHTML = parts.join('');
  $('#hm-stats').hidden = !parts.length;
}

function drawUnit() {
  const unit = unitKey();
  document.querySelectorAll('#hm-unit button').forEach((b) => b.classList.toggle('on', b.dataset.unit === unit));
}

function drawModes() {
  $('#invite').hidden = !!me;
  $('#practice-tag').hidden = !!me;
  const duelTag = $('#duel-tag');
  duelTag.hidden = !!me && !(live && live.online);
  duelTag.textContent = me ? `${live ? live.online : 0} en sala` : 'Con cuenta';
  const tn = $('#tn-tag');
  tn.hidden = !open.length;
  tn.textContent = open.length === 1 ? '1 activo' : `${open.length} activos`;
}

// Tarjeta de nivel
function drawLevel() {
  const l = pulse.level;
  if (!l) return;
  const { xp, level, from, to, title } = l;
  $('#lv-num').textContent = level;
  $('#lv-title').textContent = title;
  $('#lv-fill').style.width = Math.round(((xp - from) / Math.max(1, to - from)) * 100) + '%';
  $('#lv-xp').textContent = `${num(xp - from)} / ${num(to - from)} XP`;
  $('#lv-next').textContent = `faltan ${num(to - xp)}`;
  const boost = pulse.boost;
  $('#lv-boost').hidden = !boost;
  if (boost) $('#lv-boost').textContent = `Potenciador x${String(boost.mult).replace('.', ',')} hasta el ${clock(boost.ends)}`;
  // Próxima recompensa por nivel: la más cercana que todavía no tiene.
  const nx = pulse.next;
  const rw = $('#lv-reward');
  rw.hidden = !nx;
  if (nx) {
    rw.dataset.rarity = nx.rarity;
    rw.innerHTML = `<small>Próxima recompensa</small><b>${esc(nx.name)}</b>`
      + `<span>${esc(nx.note)}. Nivel ${nx.level}${nx.more ? `, y ${nx.more} más` : ''}; faltan ${num(Math.max(0, nx.xp - xp))} XP.</span>`;
  }
  // Premios del camino listos para reclamar.
  const ready = pulse.ready || 0;
  const cl = $('#lv-claim');
  cl.hidden = !ready;
  if (ready) cl.textContent = ready === 1 ? 'Tenés 1 premio para reclamar' : `Tenés ${ready} premios para reclamar`;
}

// Tarjeta de misiones: las carreras de hoy arriba y las metas y misiones con su progreso y el botón para reclamar.
const PERIOD = { day: 'Hoy', week: 'Semana', event: 'Evento' };
const CARD_MISSIONS = 2; // misiones que entran en la tarjeta del inicio; el resto va en la ventana «Ver todas»
const rewardName = (r) => (!r || r.kind === 'none' ? 'Sin premio' : r.name);

function missionItem(m) {
  const pct = m.count ? Math.round((m.progress / m.count) * 100) : 0;
  const seen = m.metric === 'streak' ? `${m.progress} / ${m.count} días` : `${m.progress} / ${m.count}`;
  const tag = m.state === 'scheduled' ? `Empieza ${clock(m.starts)}` : PERIOD[m.period];
  const act = m.state === 'ready' ? `<button type="button" class="hm-m-btn" data-claim="${m.id}">Reclamar</button>`
    : m.state === 'claimed' ? '<span class="hm-m-done">Reclamada</span>'
      : m.state === 'done' ? '<span class="hm-m-done">Cumplida</span>' : '';
  return `<li class="hm-m" data-state="${m.state}">
    <div class="hm-m-head"><b class="hm-m-name">${esc(m.title)}</b><span class="hm-m-rw">${esc(rewardName(m.reward))}</span></div>
    <div class="hm-m-bar"><div class="meter" role="progressbar" aria-label="${esc(m.title)}" aria-valuenow="${m.progress}" aria-valuemin="0" aria-valuemax="${m.count}"><i style="width:${pct}%"></i></div><span class="hm-m-num">${seen}</span><span class="hm-m-tag">${esc(tag)}</span>${act}</div>
  </li>`;
}

function drawMissions() {
  $('#td-num').textContent = pulse ? pulse.today : 0;
  $('#td-of').textContent = pulse && pulse.today === 1 ? 'carrera hoy' : 'carreras hoy';
  $('#td-best').textContent = pulse && pulse.today ? `mejor ${speed(pulse.todayBest)} ${unitName()}` : '';
  const n = missions.filter((m) => m.kind === 'mission').length;
  const full = missions.length > CARD_MISSIONS;
  // con la lista completa a un clic, el contador deja su lugar al enlace
  $('#ms-count').hidden = !n || full;
  $('#ms-count').textContent = n ? `${n} ${n === 1 ? 'misión' : 'misiones'}` : '';
  // en la tarjeta van primero las que se pueden reclamar y después las que están en curso; las reclamadas al final
  const rank = (m) => (m.state === 'ready' ? 0 : m.state === 'claimed' || m.state === 'done' ? 2 : 1);
  const shown = missions
    .map((m, i) => [m, i])
    .sort((a, b) => (rank(a[0]) - rank(b[0])) || (a[1] - b[1]))
    .slice(0, CARD_MISSIONS)
    .map(([m]) => m);
  $('#ms-list').innerHTML = shown.map(missionItem).join('');
  $('#ms-all').hidden = !full;
  $('#ms-empty').hidden = missions.length > 0;
  if ($('#ms-dlg').open) drawAllMissions();
}

// Ventana con todas las misiones: primero lo que se puede reclamar, después lo que está en curso y lo ya reclamado.
function drawAllMissions() {
  const count = (states) => missions.filter((m) => states.includes(m.state));
  const groups = [
    ['Para reclamar', count(['ready'])],
    ['En curso', count(['active', 'scheduled'])],
    ['Reclamadas y cumplidas', count(['claimed', 'done'])],
  ].filter(([, list]) => list.length);
  const total = missions.filter((m) => m.kind === 'mission').length;
  $('#ms-dlg-sub').textContent = total
    ? `${total} ${total === 1 ? 'misión activa' : 'misiones activas'} entre hoy, la semana y los eventos`
    : '';
  $('#ms-dlg-body').innerHTML = groups.length
    ? groups.map(([label, list]) => `<section class="lvd-shelf"><h3>${label} <small>${list.length}</small></h3><ul class="lvd-list">${list.map(missionItem).join('')}</ul></section>`).join('')
    : '<p class="hm-empty">No hay misiones por ahora.</p>';
}

// Tarjeta compacta de racha: días seguidos y las 14 casillas de actividad (sin la meta personal, que salió del inicio).
function drawStreak() {
  const s = pulse ? pulse.streak : 0;
  $('#st-n').textContent = s;
  $('#st-u').textContent = s === 1 ? 'día seguido' : 'días seguidos';
  const week = extra ? extra.week : Array(14).fill(0);
  $('#heat').innerHTML = week.map((n, i) => {
    const lvl = n ? Math.min(4, Math.max(1, Math.ceil((n / 5) * 4))) : 0;
    const d = new Date(Date.now() - (13 - i) * 86400000).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
    return `<i class="l${lvl}${i === 13 ? ' now' : ''}" title="${esc(d)}: ${plural(n, 'carrera', 'carreras')}"></i>`;
  }).join('');
}

// Curva de las últimas carreras: línea simple, promedio punteado y un cuadrado (el cursor) en la más reciente.
function spark(values) {
  const W = 260;
  const H = 70;
  const pad = 6;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(1, hi - lo);
  const x = (i) => pad + (i * (W - pad * 2)) / (values.length - 1);
  const y = (v) => H - pad - ((v - lo) / span) * (H - pad * 2);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  const last = values.length - 1;
  return `<svg class="hm-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Velocidad de tus últimas ${values.length} carreras">`
    + `<line class="avg" x1="${pad}" x2="${W - pad}" y1="${y(mean).toFixed(1)}" y2="${y(mean).toFixed(1)}"/>`
    + `<path class="area" d="M${pts[0]} L${pts.join(' L')} L${x(last).toFixed(1)},${H - pad} L${pad},${H - pad}Z"/>`
    + `<polyline class="line" points="${pts.join(' ')}"/>`
    + `<rect class="cur" x="${(x(last) - 3.5).toFixed(1)}" y="${(y(values[last]) - 3.5).toFixed(1)}" width="7" height="7"/>`
    + '</svg>';
}

function drawPerf() {
  $('#pf-unit').textContent = unitName();
  const sp = extra ? extra.spark : [];
  $('#spark-box').innerHTML = sp.length >= 2
    ? spark(sp.map(speed))
    : '<p class="hm-empty">Con 2 carreras se dibuja tu curva.</p>';
  $('#p-best').textContent = pulse.best ? speed(pulse.best) : '-';
  $('#p-avg').textContent = pulse.avg ? speed(pulse.avg) : '-';
  $('#p-rank').textContent = pulse.rank ? `${pulse.rank}°` : '-';
  $('#p-rank').title = pulse.rank ? 'Puesto en el ranking de promedios' : `Hacen falta 5 carreras para entrar (llevás ${pulse.races})`;
}

function drawLast() {
  const l = extra && extra.last;
  $('#w-last').hidden = !l;
  if (!l) return;
  $('#last-when').textContent = ago(l.at);
  $('#last-speed').textContent = speed(l.cpm);
  $('#last-unit').textContent = unitName();
  const kind = l.duel ? 'Duelo' : l.hc ? 'Hardcore' : 'Normal';
  $('#last-meta').textContent = `${kind}, ${l.acc} % de precisión`;
  $('#last-text').textContent = textLabel(l.textId);
  $('#last-again').hidden = !catalog.some((t) => t.id === l.textId);
}

function drawWeak() {
  const weak = extra ? extra.weak : [];
  $('#w-weak').hidden = weak.length < 3;
  if (weak.length < 3) return;
  $('#weak-caps').innerHTML = weak.map((w) => {
    const rate = w.typed ? `${(Math.round((w.miss / w.typed) * 1000) / 10).toLocaleString('es-AR')} %` : `${w.miss} err.`;
    return `<span class="hm-cap" title="${esc(w.key)}: ${w.miss} errores${w.typed ? ` en ${w.typed} pulsaciones` : ''}"><b>${esc(w.key)}</b><small>${rate}</small></span>`;
  }).join('');
}

const TN = { inscripcion: 'Inscripción', en_curso: 'En curso' };

function drawTourneys() {
  const mine = new Set(extra ? extra.joined : []);
  $('#tn-list-home').innerHTML = open.length
    ? open.map((t) => {
      const when = t.status === 'inscripcion' && t.startsAt > Date.now() ? `empieza ${clock(t.startsAt)}` : '';
      return `<li><button data-tn="${t.id}"><span class="hm-tn-name"><b>${esc(t.name)}</b>${mine.has(t.id) ? '<em class="hm-tag me">Anotado</em>' : ''}</span>`
        + `<span class="hm-tn-meta"><em class="hm-tag ${t.status}">${TN[t.status]}</em>${t.players}${t.size ? ` / ${t.size}` : ''} ${t.players === 1 ? 'jugador' : 'jugadores'}${when ? `, ${esc(when)}` : ''}</span></button></li>`;
    }).join('')
    : '<li class="hm-empty">No hay torneos abiertos por ahora.</li>';
}

function drawHome() {
  drawStats();
  drawUnit();
  drawModes();
  const logged = !!(me && pulse);
  $('#hm-me').hidden = !logged;
  if (logged) {
    drawLevel();
    drawMissions();
    drawStreak();
    drawPerf();
  }
  drawLast();
  drawWeak();
  drawTourneys();
}

async function refresh(force) {
  if (!force && Date.now() - loadedAt < 15000) return;
  loadedAt = Date.now();
  drawHome();
  try {
    // Las misiones van aparte del resumen del inicio: si fallan, el resto del inicio se muestra igual.
    const [data, ms] = await Promise.all([api.home(), api.missions().catch(() => null)]);
    pulse = data.pulse;
    extra = data.extra;
    live = data.live;
    open = data.tourneys || [];
    community = data.community;
    missions = ms && Array.isArray(ms.missions) ? ms.missions : [];
  } catch {
    pulse = null;
    extra = null;
    live = null;
    open = [];
    community = null;
    missions = [];
  }
  drawHome();
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
// Reclamo de una misión: la respuesta trae las misiones al día y los avisos «Desbloqueaste…».
// Sirve igual desde la tarjeta del inicio y desde la ventana «Ver todas».
async function claimMissionBtn(b, msg) {
  if (!b || b.disabled) return;
  b.disabled = true;
  try {
    const res = await api.claimMission(Number(b.dataset.claim));
    if (Array.isArray(res.missions)) missions = res.missions;
    if (res.news && res.news.length) announce(res.news);
    drawMissions();
    if (msg) {
      msg.hidden = false;
      msg.textContent = res.claimed
        ? `Reclamado: ${res.claimed.title}${res.claimed.given != null ? ` (+${res.claimed.given} XP${res.claimed.capped ? ', tope diario' : ''})` : ''}`
        : 'Premio reclamado.';
      setTimeout(() => { msg.hidden = true; }, 5000);
    }
    refresh(true);
  } catch (err) {
    b.disabled = false;
    if (msg) { msg.hidden = false; msg.textContent = err.message; }
  }
}
$('#ms-list').onclick = (e) => {
  const b = e.target.closest('[data-claim]');
  if (b) claimMissionBtn(b, $('#ms-msg'));
};
$('#ms-dlg-body').onclick = (e) => {
  const b = e.target.closest('[data-claim]');
  if (b) claimMissionBtn(b, $('#ms-dlg-msg'));
};
$('#ms-all').onclick = () => { drawAllMissions(); $('#ms-dlg').showModal(); };
$('#ms-dlg-close').onclick = () => $('#ms-dlg').close();
$('#ms-dlg').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$('#invite-login').onclick = () => $('#account').click();
$('#hm-path').onclick = () => { if (me) openOwnNivel(me.handle); };
$('#hm-profile').onclick = () => { if (me) document.dispatchEvent(new CustomEvent('profile', { detail: me.handle })); };
$('#hm-unit').onclick = (e) => {
  const unit = e.target.closest('[data-unit]')?.dataset.unit;
  if (unit && unit !== unitKey()) document.querySelector(`#units [data-unit="${unit}"]`)?.click();
};
$('#last-again').onclick = () => { if (extra && extra.last) document.dispatchEvent(new CustomEvent('play', { detail: extra.last.textId })); };
$('#weak-go').onclick = () => $('#go-practice').click();
$('#tn-all').onclick = () => $('#go-tourney').click();
$('#tn-list-home').onclick = (e) => {
  const id = Number(e.target.closest('[data-tn]')?.dataset.tn);
  if (id) tourney.open(id);
};

// Atajos del inicio: 1 a 6 abren los modos en el orden en que se muestran.
const MODE_KEYS = ['go-random', 'go-pick', 'go-practice', 'go-hc', 'go-duel', 'go-tourney'];
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || $('#home').hidden) return;
  const id = MODE_KEYS[Number(e.key) - 1];
  if (!id || !/^[1-6]$/.test(e.key)) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (document.querySelector('dialog[open]')) return;
  e.preventDefault();
  $('#' + id).click();
});

document.addEventListener('session', (e) => { me = e.detail; refresh(true); });
document.addEventListener('catalog', (e) => { catalog = e.detail; drawLast(); drawBoard(); });
document.addEventListener('race-saved', () => { loadedAt = 0; });
document.addEventListener('track-claimed', () => { loadedAt = 0; refresh(true); });
$('#lv-claim').onclick = () => { if (me) openOwnNivel(me.handle); };
document.addEventListener('home', () => refresh(false));
document.addEventListener('units', () => { drawHome(); drawBoard(); });

drawHome();
drawTabs();
