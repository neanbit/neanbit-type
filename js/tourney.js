import { api } from './api.js';
import { duel } from './duel.js';
import { avatarInner } from './avatar.js';
import { $, esc } from './ui.js';

let kit = null;
let rows = [];
let detail = null;
let openId = 0;
let current = null;
let until = 0;
let loop = 0;
let ticks = 0;
let busy = false;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const statusLabel = { inscripcion: 'Inscripción abierta', en_curso: 'En curso', finalizado: 'Finalizado', cancelado: 'Cancelado' };
const resultNote = {
  no_presentacion: 'Ganó por ausencia del rival',
  doble_ausencia: 'Nadie se presentó, pasa el mejor sembrado',
  abandono: 'Ganó por abandono',
  progreso: 'Ganó por avance en el texto',
  desempate: 'Desempate por sembrado',
  descalificacion: 'Descalificación',
  manual: 'Decidido por la organización',
  pase: 'Pase directo',
};

function roundName(round, rounds) {
  const left = rounds - round;
  if (left === 0) return 'Final';
  if (left === 1) return 'Semifinal';
  if (left === 2) return 'Cuartos de final';
  if (left === 3) return 'Octavos de final';
  return `Ronda ${round}`;
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.textContent = ''), 5000);
}

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function until_(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d) return `${plural(d, 'día', 'días')} y ${h} h`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${total % 60} s`;
  return `${total} s`;
}

function accessLabel(a) {
  if (a.mode === 'list') return 'Solo invitados';
  if (a.mode !== 'rules') return 'Abierto a todos';
  const parts = [];
  if (a.minCpm) parts.push(`Desde ${kit.speed(a.minCpm)} ${kit.unitLabel()}`);
  if (a.medal) parts.push(a.medal.hidden ? 'Con pase' : `Medalla ${a.medal.name}`);
  return parts.join(' y ') || 'Con requisitos';
}

function when(t) {
  if (!t.startsAt) return '';
  return new Date(t.startsAt).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

const chips = (t) => `<span class="tn-chip" data-s="${t.status}">${statusLabel[t.status] || t.status}</span>`
  + `<span class="tn-chip">${esc(accessLabel(t.access))}</span>`
  + `<span class="tn-chip">${t.players} de ${t.size} cupos</span>`;

function drawList() {
  const live = rows.filter((t) => t.status === 'inscripcion' || t.status === 'en_curso');
  const past = rows.filter((t) => t.status === 'finalizado' || t.status === 'cancelado');
  const card = (t) => {
    const mine = t.mine && t.mine.status !== 'descalificado' ? '<span class="tn-flag">Estás inscripto</span>' : '';
    const champ = t.winner ? `<p class="tn-meta">Campeón: <b>${esc(t.winner.name)}</b></p>` : '';
    const start = t.status === 'inscripcion' && t.startsAt ? `<p class="tn-meta">Empieza el ${esc(when(t))}</p>` : '';
    return `<li><button class="tn-card" data-id="${t.id}"><span class="tn-card-top"><b>${esc(t.name)}</b>${mine}</span>`
      + `<span class="tn-chips">${chips(t)}</span>${t.description ? `<p class="tn-desc">${esc(t.description)}</p>` : ''}${start}${champ}</button></li>`;
  };
  const block = (title, list) => (list.length ? `<h3 class="tn-sec">${title}</h3><ul class="tn-grid">${list.map(card).join('')}</ul>` : '');
  $('#tn-list').innerHTML = rows.length
    ? block('Abiertos y en curso', live) + block('Anteriores', past)
    : '<div class="tn-empty"><p>Todavía no hay torneos publicados.</p><small>Cuando se anuncie uno, lo vas a ver acá.</small></div>';
}

function slot(m, side, me) {
  const p = m[side];
  const cpm = side === 'a' ? m.aCpm : m.bCpm;
  const label = p ? esc(p.name) : m.status === 'done' ? 'Sin rival' : m.round === 1 ? 'Pase' : 'Por definir';
  const cls = ['tn-p'];
  if (!p) cls.push('none');
  else if (m.winner === p.handle) cls.push('win');
  else if (m.status === 'done' && m.winner) cls.push('lose');
  if (p && p.handle === me) cls.push('me');
  if (p && p.status === 'descalificado') cls.push('dq');
  return `<div class="${cls.join(' ')}"${p ? ` data-handle="${esc(p.handle)}"` : ''}><span>${label}</span><em>${cpm === null || cpm === undefined ? '' : kit.speed(cpm)}</em></div>`;
}

function matchBox(m, me) {
  let note = '';
  if (m.status === 'live') note = 'En juego';
  else if (m.status === 'ready') note = 'Esperando que los dos estén listos';
  else if (m.status === 'done') note = resultNote[m.result] || '';
  if (m.result === 'vacio') note = '';
  return `<article class="tn-m" data-s="${m.status}">${slot(m, 'a', me)}${slot(m, 'b', me)}${note ? `<small>${note}</small>` : ''}</article>`;
}

function bracket(t, me) {
  const cols = [];
  for (let r = 1; r <= t.rounds; r++) {
    const list = t.matches.filter((m) => m.round === r);
    cols.push(`<div class="tn-round"><h4>${roundName(r, t.rounds)}</h4>${list.map((m) => matchBox(m, me)).join('')}</div>`);
  }
  return `<div class="tn-bracket">${cols.join('')}</div>`;
}

function actions(t, me, mine) {
  if (!me) return '<button class="primary" data-act="login">Ingresar para inscribirme</button>';
  if (mine && mine.status === 'descalificado') return '<p class="tn-note bad">Fuiste descalificado de este torneo.</p>';
  if (t.status === 'inscripcion') {
    if (mine) return '<p class="tn-note ok">Estás inscripto.</p><button data-act="leave">Retirarme</button>';
    if (t.can && t.can.ok) return '<button class="primary" data-act="join">Inscribirme</button>';
    return `<p class="tn-note">${esc(t.can ? t.can.reason : 'La inscripción no está abierta.')}</p>`;
  }
  if (mine && t.status === 'en_curso') {
    const self = t.players.find((p) => p.handle === me);
    if (self && self.status === 'eliminado') return `<p class="tn-note">Quedaste eliminado en ${roundName(self.outRound, t.rounds).toLowerCase()}.</p>`;
    return '<p class="tn-note ok">Estás en carrera. Dejá esta pantalla abierta: cuando tu partido esté listo te avisamos acá.</p>';
  }
  return '';
}

function drawDetail() {
  const t = detail;
  const me = kit.me();
  const mine = t.mine;
  $('#tn-eyebrow').textContent = 'Torneo de eliminación directa';
  $('#tn-title').textContent = t.name;
  const champ = t.status === 'finalizado' && t.winner
    ? `<div class="tn-champ"><small>Campeón</small><b>${esc(t.winner.name)}</b><span>@${esc(t.winner.handle)}</span></div>` : '';
  const players = t.players.length
    ? t.players.map((p) => `<li class="${p.status}" data-handle="${esc(p.handle)}"><span class="av sm">${avatarInner(p)}</span><span>${esc(p.name)}<small>@${esc(p.handle)}</small></span>`
      + `${p.status === 'eliminado' ? '<em>Eliminado</em>' : p.status === 'descalificado' ? '<em>Descalificado</em>' : ''}</li>`).join('')
    : '<li class="none">Todavía no hay inscriptos.</li>';
  const draw = t.status === 'inscripcion'
    ? '<p class="tn-note">La llave se sortea cuando empieza el torneo.</p>'
    : t.matches.length ? bracket(t, me) : '<p class="tn-note">Este torneo se canceló antes de armar la llave.</p>';
  $('#tn-detail').innerHTML = `<section class="tn-head"><div class="tn-chips">${chips(t)}</div>`
    + `${t.description ? `<p class="tn-desc">${esc(t.description)}</p>` : ''}`
    + `<p class="tn-when" id="tn-when"></p>`
    + `<div class="tn-actions">${actions(t, me, mine)}</div></section>${champ}`
    + `<section class="tn-block"><h3>Llave</h3>${draw}</section>`
    + `<section class="tn-block"><h3>Participantes <small>${t.count}</small></h3><ul class="tn-players">${players}</ul></section>`;
  drawWhen();
}

function drawWhen() {
  const el = $('#tn-when');
  if (!el || !detail) return;
  if (detail.status === 'inscripcion' && detail.startsAt) {
    const ms = detail.startsAt - Date.now();
    el.textContent = ms > 0 ? `Empieza el ${when(detail)}, en ${until_(ms)}.` : 'Empieza en cuanto la organización largue la primera ronda.';
  } else el.textContent = '';
}

function drawAlert() {
  const box = $('#tn-alert');
  if (!current) { box.hidden = true; return; }
  const c = current;
  const opp = c.opp ? esc(c.opp.name) : 'tu rival';
  box.hidden = false;
  box.innerHTML = `<div class="tn-al-main"><p class="tn-kicker">${esc(c.name)}, ${roundName(c.round, c.rounds).toLowerCase()}</p>`
    + `<h3>${c.me ? `Esperando a ${opp}` : 'Tu partido está listo'}</h3>`
    + `<p>${c.me ? 'Arranca apenas los dos estén listos.' : `Rival: <b>${opp}</b>${c.oppReady ? ', ya está listo.' : '.'}`}</p></div>`
    + `<div class="tn-al-side"><span class="tn-left" id="tn-left">${clock(Math.max(0, Math.round((until - Date.now()) / 1000)))}</span>`
    + `${c.me ? '' : '<button class="primary" data-ready>Estoy listo</button>'}</div>`;
}

function drawConn() {
  const el = $('#tn-conn');
  if (!kit.me()) { el.textContent = 'Ingresá para inscribirte y jugar torneos.'; return; }
  const watching = (detail ? [detail] : rows).some((t) => t.mine && t.mine.status === 'activo' && ['inscripcion', 'en_curso'].includes(t.status));
  if (!watching) { el.textContent = ''; return; }
  el.innerHTML = duel.connected()
    ? 'Conectado: vas a recibir el aviso de tu partido en esta pantalla.'
    : 'Sin conexión con la sala del torneo. <button data-act="reconnect">Reconectar</button>';
}

async function sync() {
  if (!kit.me()) return;
  const watching = (detail ? [detail] : rows).some((t) => t.mine && t.mine.status === 'activo' && ['inscripcion', 'en_curso'].includes(t.status));
  if (watching && !duel.connected()) await duel.join();
  drawConn();
}

async function loadList() {
  busy = true;
  try {
    ({ rows } = await api.tournaments());
    if (!openId) drawList();
  } catch {
    if (!openId) $('#tn-list').innerHTML = '<div class="tn-empty"><p>No se pudieron cargar los torneos.</p></div>';
  }
  busy = false;
  await sync();
}

async function loadDetail() {
  busy = true;
  try {
    detail = await api.tournament(openId);
    if (openId) drawDetail();
  } catch {
    toast('No se pudo cargar el torneo.');
  }
  busy = false;
  await sync();
}

function view(id) {
  openId = id;
  $('#tn-list').hidden = !!id;
  $('#tn-detail').hidden = !id;
  if (!id) {
    detail = null;
    $('#tn-eyebrow').textContent = 'Eliminación directa';
    $('#tn-title').textContent = 'Torneos';
    drawList();
  }
  drawConn();
}

function refresh() {
  if (busy) return;
  return openId ? loadDetail() : loadList();
}

function start() {
  clearInterval(loop);
  ticks = 0;
  loop = setInterval(() => {
    if ($('#tourney').hidden) { clearInterval(loop); return; }
    ticks++;
    if (current) {
      const left = Math.max(0, Math.round((until - Date.now()) / 1000));
      const el = $('#tn-left');
      if (el) el.textContent = clock(left);
    }
    drawWhen();
    if (ticks % 6 === 0) refresh();
  }, 1000);
}

async function act(name) {
  if (name === 'login') return kit.login();
  if (name === 'reconnect') { await duel.join(); return drawConn(); }
  if (!detail) return;
  try {
    if (name === 'join') await api.joinTournament(detail.id);
    else if (name === 'leave') await api.leaveTournament(detail.id);
  } catch (err) {
    toast(err.message);
  }
  await loadDetail();
}

$('#tn-list').onclick = (e) => {
  const card = e.target.closest('[data-id]');
  if (card) open(Number(card.dataset.id));
};

$('#tn-detail').onclick = (e) => {
  const btn = e.target.closest('[data-act]');
  if (btn) return act(btn.dataset.act);
  const who = e.target.closest('[data-handle]');
  if (who) document.dispatchEvent(new CustomEvent('profile', { detail: who.dataset.handle }));
};

$('#tn-conn').onclick = (e) => {
  if (e.target.closest('[data-act="reconnect"]')) act('reconnect');
};

$('#tn-alert').onclick = (e) => {
  if (!e.target.closest('[data-ready]') || !current) return;
  duel.ready(current.mid);
  current = { ...current, me: true };
  drawAlert();
};

$('#tn-back').onclick = () => {
  if (openId) { view(0); refresh(); } else kit.home();
};

document.addEventListener('duel-tmatch', (e) => {
  current = e.detail;
  until = Date.now() + (current.left || 0);
  drawAlert();
  if (!$('#tourney').hidden) refresh();
});

document.addEventListener('duel-tinfo', (e) => {
  const m = e.detail;
  if (m.event !== 'start') current = null;
  drawAlert();
  const text = {
    start: `${m.name} empezó. Mirá tu partido en la llave.`,
    advance: `Pasaste a ${roundName(m.round, m.rounds).toLowerCase()} en ${m.name}.`,
    bye: `Pasás directo a ${roundName(m.round, m.rounds).toLowerCase()} en ${m.name}.`,
    out: `Quedaste eliminado de ${m.name}.`,
    champion: `Sos el campeón de ${m.name}.`,
    dq: `Fuiste descalificado de ${m.name}.`,
    cancelled: `${m.name} se canceló.`,
  }[m.event];
  if (text) toast(text);
  if (!$('#tourney').hidden) refresh();
});

document.addEventListener('duel-match', () => {
  current = null;
  drawAlert();
});

document.addEventListener('duel-closed', () => {
  if (!$('#tourney').hidden) drawConn();
});

async function open(id = 0) {
  kit.show('tourney');
  current = null;
  drawAlert();
  start();
  view(id);
  if (id) {
    $('#tn-detail').innerHTML = '<p class="tn-note">Cargando…</p>';
    await loadDetail();
  } else {
    await loadList();
  }
}

export const tourney = {
  init(helpers) {
    kit = helpers;
  },
  open,
};
