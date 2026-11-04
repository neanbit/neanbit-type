// Nivel en el perfil: el widget de la cabecera y la ventana con el detalle (progreso, próximos niveles y títulos).
// Reemplaza al campo «Título» que había antes. Los datos llegan en /api/users/:handle (level, ladder y, solo en el perfil propio, boost).
import { $, esc } from './ui.js';
import { features } from './features.js';
import { api } from './api.js';
import { announce } from './unlock.js';

const AHEAD = 5; // cuántos niveles futuros se muestran

let view = null;
let trackData = null; // camino de niveles con el estado de cada casillero (solo en el perfil propio)
let claimMsg = null; // { text, bad } resultado del último reclamo
let busy = false;

const num = (x) => Number(x).toLocaleString('es-AR');
// XP total para llegar a un nivel con la curva del servidor: base × (n − 1) + grow × (n − 1) × (n − 2) / 2.
const xpAt = (c, level) => { const n = Math.max(0, level - 1); return c.base * n + (c.grow * n * (n - 1)) / 2; };
const titleAt = (titles, level) => [...titles].reverse().find(([min]) => level >= min)?.[1] ?? titles[0][1];
const mult = (m) => 'x' + String(m).replace('.', ',');
const when = (t) => new Date(t).toLocaleString('es-AR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// Se llama cada vez que se dibuja un perfil.
export function setNivel(p) {
  const btn = $('#pf-level');
  const ok = features.levels && p.level && p.ladder && Array.isArray(p.ladder.titles) && p.ladder.titles.length;
  btn.hidden = !ok;
  view = ok ? p : null;
  if (!ok) return;
  const { level, title } = p.level;
  $('#pf-lv-n').textContent = level;
  btn.title = `Nivel ${level}, ${title}`;
  btn.setAttribute('aria-label', `Nivel ${level}, ${title}. Ver el progreso`);
}

function row(kind, level, name, note, xp, gap) {
  return `<li class="lvd-row ${kind}">
    <span class="lv-key sm" data-digits="${String(level).length}">${level}</span>
    <span class="lvd-name"><b>${esc(name)}</b>${note ? `<small>${esc(note)}</small>` : ''}</span>
    <span class="lvd-xp"><b>${num(xp)} XP</b>${gap > 0 ? `<small>faltan ${num(gap)}</small>` : ''}</span>
  </li>`;
}

function draw() {
  const p = view;
  const { xp, level, from, to, title } = p.level;
  const { curve, titles } = p.ladder;
  $('#levels').dataset.accent = p.accent || 'ambar';
  $('#lvd-n').textContent = level;
  $('#lvd-n').dataset.digits = String(level).length;
  $('#lvd-title').textContent = title;
  $('#lvd-sub').textContent = `${p.name}, ${num(xp)} XP en total`;
  $('#lvd-from').textContent = `Nivel ${level}`;
  $('#lvd-to').textContent = `Nivel ${level + 1}`;
  const pct = Math.round(((xp - from) / (to - from)) * 100);
  $('#lvd-fill').style.width = pct + '%';
  $('#lvd-bar').setAttribute('aria-valuenow', String(pct));
  const nextTitle = titleAt(titles, level + 1);
  $('#lvd-left').textContent = `${num(xp - from)} de ${num(to - from)} XP en este nivel. `
    + (nextTitle !== title ? `Al subir llega el título ${nextTitle}.` : `Faltan ${num(to - xp)} para el ${level + 1}.`);

  const boost = $('#lvd-boost');
  boost.hidden = !p.boost;
  if (p.boost) boost.innerHTML = `Potenciador activo: <b>${esc(p.boost.name)}</b>, ${mult(p.boost.mult)} de XP en carreras, duelos ganados y torneos ganados hasta el ${when(p.boost.ends)}.`;

  const ahead = Array.from({ length: AHEAD }, (_, i) => {
    const lv = level + 1 + i;
    const t = titleAt(titles, lv);
    const first = titles.some(([min]) => min === lv);
    return row('next', lv, t, first ? 'Nuevo título' : '', xpAt(curve, lv), xpAt(curve, lv) - xp);
  }).join('');

  const ranks = titles.map(([min, name]) => {
    const last = titles.find(([m]) => m > min);
    const here = level >= min && (!last || level < last[0]);
    const kind = here ? 'now' : level >= min ? 'done' : 'next';
    const note = here ? 'Tu título actual' : level >= min ? 'Obtenido' : 'Bloqueado';
    return row(kind, min, name, note, xpAt(curve, min), level >= min ? 0 : xpAt(curve, min) - xp);
  }).join('');

  $('#lvd-body').innerHTML = `${claimShelf()}${nextShelf(curve, xp)}<section class="lvd-shelf"><h3>Próximos niveles</h3><ol class="lvd-list">${ahead}</ol></section>
    <section class="lvd-shelf"><h3>Títulos <small>${titles.filter(([min]) => level >= min).length} de ${titles.length}</small></h3><ol class="lvd-list">${ranks}</ol></section>`;
}

const until = (t) => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });

// Premios del camino que ya se pueden reclamar (solo en el perfil propio). Sin reclamar no se obtienen.
function claimShelf() {
  if (!trackData) return '';
  const ready = trackData.slots.filter((s) => s.state === 'ready');
  const msg = claimMsg ? `<p class="lvd-msg${claimMsg.bad ? ' bad' : ''}" role="status">${esc(claimMsg.text)}</p>` : '';
  if (!ready.length) return msg ? `<section class="lvd-shelf">${msg}</section>` : '';
  const rows = ready.map((s) => `<li class="lvd-row ready" data-rarity="${esc(s.rarity)}">
    <span class="lv-key sm" data-digits="${String(s.level).length}">${s.level}</span>
    <span class="lvd-name"><b>${esc(s.name)}</b><small>${esc(s.note)}${s.until ? `, podés reclamarlo hasta el ${until(s.until)}` : ''}</small></span>
    <button type="button" class="primary lvd-btn" data-claim="${s.id}"${busy ? ' disabled' : ''}>Reclamar</button></li>`).join('');
  const all = ready.length > 1 ? `<button type="button" class="lvd-all" data-claim-all${busy ? ' disabled' : ''}>Reclamar todo</button>` : '';
  return `<section class="lvd-shelf"><h3>Para reclamar <small>${ready.length}</small>${all}</h3>${msg}<ol class="lvd-list">${rows}</ol>
    <p class="lvd-hint">Un premio sin reclamar no se obtiene. Las recompensas cosméticas se activan desde Editar perfil, en Recompensas.</p></section>`;
}

// La próxima recompensa y las que siguen (solo en el perfil propio): los casilleros del camino que todavía no se alcanzaron.
function nextShelf(curve, xp) {
  if (!trackData) return '';
  const locked = trackData.slots.filter((s) => s.state === 'locked');
  if (!locked.length) return '';
  const rowOf = (s, extra = '') => row('next', s.level, s.name, s.note + extra, xpAt(curve, s.level), xpAt(curve, s.level) - xp);
  const first = locked[0];
  const same = locked.filter((s) => s.level === first.level).length - 1;
  const later = locked.slice(1, 4);
  return `<section class="lvd-shelf"><h3>Próxima recompensa</h3><ol class="lvd-list">${rowOf(first, same > 0 ? `, y ${same} más en este nivel` : '')}</ol></section>`
    + (later.length ? `<section class="lvd-shelf"><h3>Más adelante</h3><ol class="lvd-list">${later.map((s) => rowOf(s)).join('')}</ol></section>` : '');
}

// Aplica la respuesta de un reclamo: nivel nuevo (la XP lo puede subir), camino al día y avisos «Desbloqueaste…».
function applyClaim(res) {
  trackData = res;
  view.level = res.level;
  $('#pf-lv-n').textContent = res.level.level;
  claimMsg = res.given.length
    ? { text: res.given.length === 1 ? `Reclamaste: ${res.given[0].name}.` : `Reclamaste ${res.given.length} premios: ${res.given.map((g) => g.name).join(', ')}.` }
    : null;
  if (res.failed && res.failed.length) claimMsg = { text: res.failed[0].error, bad: true };
  if (res.news && res.news.length) announce(res.news);
  document.dispatchEvent(new CustomEvent('track-claimed'));
}

async function doClaim(slot) {
  if (busy || !view || !view.mine) return;
  busy = true;
  draw();
  try {
    applyClaim(slot ? await api.claim(slot) : await api.claimAll());
  } catch (err) {
    claimMsg = { text: err.message, bad: true };
    try { trackData = await api.track(); } catch {}
  }
  busy = false;
  if ($('#levels').open) draw();
}

export async function openNivel() {
  if (!view) return;
  trackData = null;
  claimMsg = null;
  draw();
  $('#levels').showModal();
  $('#lvd-body').scrollTop = 0;
  if (!view.mine) return;
  const shown = view;
  try { trackData = await api.track(); } catch { trackData = null; }
  if (view === shown && $('#levels').open && trackData) draw();
}

// Abre la ventana de nivel de la persona que tiene la sesión, sin pasar por el perfil (desde el inicio).
export async function openOwnNivel(handle) {
  try {
    const p = await api.profile(handle);
    if (!features.levels || !p.level || !p.ladder || !Array.isArray(p.ladder.titles) || !p.ladder.titles.length) return;
    view = p;
    await openNivel();
  } catch {}
}

$('#pf-level').onclick = openNivel;
$('#lvd-body').addEventListener('click', (e) => {
  const one = e.target.closest('[data-claim]');
  if (one) return doClaim(Number(one.dataset.claim));
  if (e.target.closest('[data-claim-all]')) doClaim(0);
});
$('#levels-close').onclick = () => $('#levels').close();
$('#levels').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
