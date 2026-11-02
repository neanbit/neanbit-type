// Nivel en el perfil: el widget de la cabecera y la ventana con el detalle (progreso, próximos niveles y títulos).
// Reemplaza al campo «Título» que había antes. Los datos llegan en /api/users/:handle (level, ladder y, solo en el perfil propio, boost).
import { $, esc } from './ui.js';
import { features } from './features.js';
import { api } from './api.js';
import { rarityName } from './rewards.js';

const AHEAD = 5; // cuántos niveles futuros se muestran

let view = null;
let shelf = null; // recompensas que se desbloquean por nivel (solo en el perfil propio)
const KIND = { frame: 'Marco', name: 'Nombre', cover: 'Portada' };

const num = (x) => Number(x).toLocaleString('es-AR');
const xpAt = (step, level) => step * (level - 1) ** 2;
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
  const { step, titles } = p.ladder;
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
    return row('next', lv, t, first ? 'Nuevo título' : '', xpAt(step, lv), xpAt(step, lv) - xp);
  }).join('');

  const ranks = titles.map(([min, name]) => {
    const last = titles.find(([m]) => m > min);
    const here = level >= min && (!last || level < last[0]);
    const kind = here ? 'now' : level >= min ? 'done' : 'next';
    const note = here ? 'Tu título actual' : level >= min ? 'Obtenido' : 'Bloqueado';
    return row(kind, min, name, note, xpAt(step, min), level >= min ? 0 : xpAt(step, min) - xp);
  }).join('');

  $('#lvd-body').innerHTML = `<section class="lvd-shelf"><h3>Próximos niveles</h3><ol class="lvd-list">${ahead}</ol></section>
    <section class="lvd-shelf"><h3>Títulos <small>${titles.filter(([min]) => level >= min).length} de ${titles.length}</small></h3><ol class="lvd-list">${ranks}</ol></section>
    ${rewardsShelf(level)}`;
}

// Recompensas que se consiguen al llegar a un nivel, de la más cercana a la más lejana. Solo se muestran en el perfil propio
// (el catálogo con lo que tiene cada persona es privado) y si hay alguna con esa regla.
function rewardsShelf(level) {
  if (!shelf || !shelf.length) return '';
  const rows = shelf.map((r) => {
    const got = r.owned || level >= r.lvl;
    return `<li class="lvd-row ${got ? 'done' : 'next'}">
      <span class="lv-key sm" data-digits="${String(r.lvl).length}">${r.lvl}</span>
      <span class="lvd-name"><b>${esc(r.name)}</b><small>${esc(KIND[r.kind] || r.kind)}, ${esc((rarityName[r.rarity] || r.rarity).toLowerCase())}</small></span>
      <span class="lvd-xp"><b>${r.owned ? 'Desbloqueada' : level >= r.lvl ? 'Lista' : 'Bloqueada'}</b></span></li>`;
  }).join('');
  return `<section class="lvd-shelf"><h3>Recompensas <small>${shelf.filter((r) => r.owned).length} de ${shelf.length}</small></h3><ol class="lvd-list">${rows}</ol>
    <p class="lvd-hint">Se activan desde Editar perfil, en la pestaña Recompensas.</p></section>`;
}

export async function openNivel() {
  if (!view) return;
  shelf = null;
  draw();
  $('#levels').showModal();
  $('#lvd-body').scrollTop = 0;
  if (!view.mine) return;
  const shown = view;
  try {
    const all = await api.rewards();
    shelf = all.items.filter((i) => i.lvl > 0).sort((a, b) => a.lvl - b.lvl || a.name.localeCompare(b.name));
  } catch { shelf = null; }
  if (view === shown && $('#levels').open && shelf && shelf.length) draw();
}

$('#pf-level').onclick = openNivel;
$('#levels-close').onclick = () => $('#levels').close();
$('#levels').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
