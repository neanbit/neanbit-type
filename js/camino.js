// Camino de niveles: el recorrido del nivel 1 al último con tu posición, lo reclamado, lo reclamable y lo que viene.
// Es la ventana del perfil propio (en perfiles ajenos sigue la ventana simple de js/nivel.js). Los premios se reclaman acá.
// En pantallas anchas el recorrido es horizontal; en celular, vertical. Los datos salen de /api/track (casilleros con su estado).
import { $, esc, icons, svg } from './ui.js';
import { api } from './api.js';
import { announce, thumb } from './unlock.js';

const num = (x) => Number(x).toLocaleString('es-AR');
const xpAt = (c, level) => { const n = Math.max(0, level - 1); return c.base * n + (c.grow * n * (n - 1)) / 2; };
const titleAt = (titles, level) => [...titles].reverse().find(([min]) => level >= min)?.[1] ?? titles[0][1];
const mult = (m) => 'x' + String(m).replace('.', ',');
const when = (t) => new Date(t).toLocaleString('es-AR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const until = (t) => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const BOLT = '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>';
const MILESTONES = new Set([25, 75]);

let view = null; // perfil propio (nivel, ladder, boost, name, accent)
let data = null; // respuesta de /api/track
let msg = null; // { text, bad } resultado del último reclamo
let busy = false;
let focusSlot = 0;

const isHito = (lv, titles) => lv === 1 || lv % 10 === 0 || MILESTONES.has(lv) || titles.some(([min]) => min === lv);

function art(s) {
  if (s.kind === 'reward') return thumb({ kind: s.rkind, preset: s.preset, rarity: s.rarity });
  if (s.kind === 'booster') return `<span class="cn-sym">${svg(BOLT)}<b>${esc(mult(s.mult))}</b></span>`;
  return `<span class="cn-sym"><b>+${esc(num(s.amount))}</b><small>XP</small></span>`;
}

function action(s, xp, curve) {
  const lim = s.until ? `<small class="cn-lim">Hasta el ${esc(until(s.until))}</small>` : '';
  if (s.state === 'ready') return `<button type="button" class="primary cn-btn" data-claim="${s.id}"${busy ? ' disabled' : ''}>Reclamar</button>${lim}`;
  if (s.state === 'claimed') return `<span class="cn-st">${svg(icons.check)}Reclamado</span>`;
  if (s.state === 'missed') return `<span class="cn-st" title="Ya estabas en este nivel cuando se agregó, o venció la fecha límite.">No disponible</span>`;
  return `<span class="cn-st">Faltan ${num(Math.max(0, xpAt(curve, s.level) - xp))} XP</span>${lim}`;
}

function slot(s, xp, curve) {
  return `<div class="cn-slot" data-state="${s.state}" data-rarity="${esc(s.rarity)}" data-kind="${s.kind}" data-id="${s.id}" tabindex="-1">
    <span class="cn-art">${art(s)}</span>
    <span class="cn-txt"><b>${esc(s.name)}</b><small>${esc(s.note)}</small></span>
    <span class="cn-act">${action(s, xp, curve)}</span>
  </div>`;
}

function path() {
  const { xp, level, from, to } = view.level;
  const { curve, titles } = view.ladder;
  const slots = data ? data.slots : [];
  const by = new Map();
  for (const s of slots) { if (!by.has(s.level)) by.set(s.level, []); by.get(s.level).push(s); }
  const last = Math.max(level + 1, titles.reduce((m, [min]) => Math.max(m, min), 1), ...slots.map((s) => s.level));
  const pct = Math.max(0, Math.min(100, Math.round(((xp - from) / Math.max(1, to - from)) * 100)));
  let out = '';
  for (let lv = 1; lv <= last; lv++) {
    const here = by.get(lv) || [];
    const ttl = titles.find(([min]) => min === lv);
    const kind = lv < level ? 'done' : lv === level ? 'now' : 'next';
    const ready = here.some((s) => s.state === 'ready');
    const cls = ['cn-lv', kind, isHito(lv, titles) ? 'hito' : '', here.length ? 'has' : '', ready ? 'ready' : ''].filter(Boolean).join(' ');
    out += `<li class="${cls}" data-level="${lv}"${lv === level ? ` style="--p:${pct}%" aria-current="step"` : ''}>
      ${ttl ? `<span class="cn-ttl">${esc(ttl[1])}</span>` : ''}
      <div class="cn-node"><span class="lv-key" data-digits="${String(lv).length}"><span class="cn-sr">Nivel </span>${lv}</span>${lv === level ? '<i class="cn-cur" aria-hidden="true"></i>' : ''}</div>
      ${here.length ? `<div class="cn-slots">${here.map((s) => slot(s, xp, curve)).join('')}</div>` : ''}
    </li>`;
  }
  return out;
}

function draw() {
  const { xp, level, from, to, title } = view.level;
  const { curve, titles } = view.ladder;
  const dlg = $('#camino');
  dlg.dataset.accent = view.accent || 'ambar';
  $('#cn-n').textContent = level;
  $('#cn-n').dataset.digits = String(level).length;
  $('#cn-title').textContent = title;
  $('#cn-sub').textContent = `${view.name}, ${num(xp)} XP en total`;
  $('#cn-from').textContent = `Nivel ${level}`;
  $('#cn-to').textContent = `Nivel ${level + 1}`;
  const pct = Math.round(((xp - from) / Math.max(1, to - from)) * 100);
  $('#cn-fill').style.width = pct + '%';
  $('#cn-bar').setAttribute('aria-valuenow', String(pct));
  const nextTitle = titleAt(titles, level + 1);
  $('#cn-left').textContent = `${num(xp - from)} de ${num(to - from)} XP en este nivel. `
    + (nextTitle !== title ? `Al subir llega el título ${nextTitle}.` : `Faltan ${num(to - xp)} para el ${level + 1}.`);

  const boost = $('#cn-boost');
  boost.hidden = !view.boost;
  if (view.boost) boost.innerHTML = `Potenciador activo: <b>${esc(view.boost.name)}</b>, ${mult(view.boost.mult)} de XP en carreras, duelos ganados y torneos ganados hasta el ${when(view.boost.ends)}.`;

  // Próxima recompensa y reclamo masivo
  const slots = data ? data.slots : [];
  const ready = slots.filter((s) => s.state === 'ready');
  const locked = slots.filter((s) => s.state === 'locked');
  const first = locked[0];
  const more = first ? locked.filter((s) => s.level === first.level).length - 1 : 0;
  $('#cn-next').innerHTML = !data ? '<small>Próxima recompensa</small><b>Cargando el camino…</b>'
    : first ? `<small>Próxima recompensa</small><b>${esc(first.name)}</b><span>${esc(first.note)}. Nivel ${first.level}${more ? `, y ${more} más` : ''}; faltan ${num(Math.max(0, xpAt(curve, first.level) - xp))} XP.</span>`
    : '<small>Próxima recompensa</small><b>No hay más por delante</b><span>Cuando se sumen nuevas al camino, aparecen acá.</span>';
  $('#cn-next').dataset.rarity = first ? first.rarity : 'comun';
  const all = $('#cn-all');
  all.hidden = ready.length < 1;
  all.textContent = ready.length === 1 ? 'Reclamar el premio' : `Reclamar todo (${ready.length})`;
  all.disabled = busy;
  const note = $('#cn-msg');
  note.hidden = !msg;
  note.className = 'lvd-msg' + (msg && msg.bad ? ' bad' : '');
  note.textContent = msg ? msg.text : '';

  const sc = $('#cn-scroll');
  const [x, y] = [sc.scrollLeft, sc.scrollTop];
  $('#cn-path').innerHTML = path();
  sc.scrollLeft = x;
  sc.scrollTop = y;
  if (focusSlot && !busy) {
    const el = $(`#cn-path [data-id="${focusSlot}"]`) || $('#cn-path .cn-lv.now');
    focusSlot = 0;
    if (el) el.focus({ preventScroll: true });
  }
}

// Deja la posición propia en el centro del recorrido.
function center(smooth) {
  const sc = $('#cn-scroll');
  const el = $('#cn-path .cn-lv.now');
  if (!sc || !el) return;
  const a = sc.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  const horizontal = getComputedStyle($('#cn-path')).flexDirection === 'row';
  const behavior = smooth && !calm() ? 'smooth' : 'auto';
  if (horizontal) sc.scrollTo({ left: Math.max(0, sc.scrollLeft + (b.left - a.left) - (a.width - b.width) / 3), behavior });
  else sc.scrollTo({ top: Math.max(0, sc.scrollTop + (b.top - a.top) - (a.height - b.height) / 3), behavior });
}

function apply(res) {
  data = res;
  view.level = res.level;
  msg = res.given.length
    ? { text: res.given.length === 1 ? `Reclamaste: ${res.given[0].name}.` : `Reclamaste ${res.given.length} premios: ${res.given.map((g) => g.name).join(', ')}.` }
    : null;
  if (res.failed && res.failed.length) msg = { text: res.failed[0].error, bad: true };
  if (res.news && res.news.length) announce(res.news);
  document.dispatchEvent(new CustomEvent('track-claimed', { detail: { level: res.level } }));
}

async function claim(id) {
  if (busy || !view) return;
  busy = true;
  focusSlot = id || 0;
  draw();
  try {
    apply(id ? await api.claim(id) : await api.claimAll());
  } catch (err) {
    msg = { text: err.message, bad: true };
    try { data = await api.track(); } catch {}
  }
  busy = false;
  if ($('#camino').open) draw();
}

// Abre el camino de la persona que tiene la sesión. `p` es su perfil (/api/users/:handle).
export async function openCamino(p) {
  view = p;
  data = null;
  msg = null;
  busy = false;
  const dlg = $('#camino');
  draw();
  dlg.showModal();
  center(false);
  const shown = view;
  try { data = await api.track(); } catch (err) { msg = { text: err.message, bad: true }; }
  if (view === shown && dlg.open) {
    draw();
    center(false);
  }
}

$('#cn-path').addEventListener('click', (e) => {
  const one = e.target.closest('[data-claim]');
  if (one) claim(Number(one.dataset.claim));
});
$('#cn-all').onclick = () => claim(0);
$('#cn-here').onclick = () => center(true);
$('#camino-close').onclick = () => $('#camino').close();
$('#camino').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
