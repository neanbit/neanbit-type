// Nivel en el perfil: el widget de la cabecera y la ventana con el detalle (progreso, próximos niveles y títulos).
// Reemplaza al campo «Título» que había antes. Los datos llegan en /api/users/:handle (level, ladder y, solo en el perfil propio, boost).
import { $, esc } from './ui.js';
import { features } from './features.js';
import { api } from './api.js';
import { openCamino } from './camino.js';

const AHEAD = 5; // cuántos niveles futuros se muestran

let view = null;

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

  $('#lvd-body').innerHTML = `<section class="lvd-shelf"><h3>Próximos niveles</h3><ol class="lvd-list">${ahead}</ol></section>
    <section class="lvd-shelf"><h3>Títulos <small>${titles.filter(([min]) => level >= min).length} de ${titles.length}</small></h3><ol class="lvd-list">${ranks}</ol></section>`;
}

// El perfil propio abre el camino de niveles (js/camino.js); el de otra persona, la ventana simple con su avance y los títulos.
export async function openNivel() {
  if (!view) return;
  if (view.mine) return openCamino(view);
  draw();
  $('#levels').showModal();
  $('#lvd-body').scrollTop = 0;
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
// El camino avisa cuando cambió el nivel (un reclamo de XP puede subirlo).
document.addEventListener('track-claimed', (e) => { if (view && e.detail && e.detail.level) $('#pf-lv-n').textContent = e.detail.level.level; });
$('#levels-close').onclick = () => $('#levels').close();
$('#levels').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
