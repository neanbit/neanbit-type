import { api } from './api.js';
import { avatarInner } from './avatar.js';
import { openCrop } from './crop.js';
import { $, esc, svg, icons, medalImg } from './ui.js';
import { openVitrina } from './vitrina.js';
import { nameFx, rarityName, safePreset, setCover, setFrame } from './rewards.js';

const countries = ['Argentina', 'Bolivia', 'Chile', 'Colombia', 'Costa Rica', 'Cuba', 'Ecuador', 'El Salvador', 'España', 'Estados Unidos', 'Guatemala', 'Honduras', 'México', 'Nicaragua', 'Panamá', 'Paraguay', 'Perú', 'República Dominicana', 'Uruguay', 'Venezuela', 'Otro país'];
const layouts = ['QWERTY', 'Dvorak', 'Colemak', 'Otro'];
const accents = [['ambar', 'Ámbar'], ['celeste', 'Celeste'], ['menta', 'Menta'], ['rosa', 'Rosa'], ['violeta', 'Violeta'], ['lima', 'Lima'], ['hielo', 'Hielo']];
const banners = [['liso', 'Liso'], ['rejilla', 'Rejilla'], ['diagonal', 'Diagonal'], ['puntos', 'Puntos'], ['teclas', 'Teclas'], ['ondas', 'Ondas']];
const shapes = [['cuadrada', 'Cuadrada'], ['redondeada', 'Redondeada'], ['circulo', 'Círculo']];
const fields = ['name', 'bio', 'country', 'switches', 'discord', 'website'];
const maxShown = 6;

let hooks = { user: () => null, saved: () => {} };
let draft = {};
let baseline = '';
let medals = [];
let rw = { items: [] };
let rwShown = '';
let rwTheme = '';
const rwGroups = [['frame', 'Marco de la foto', 'Sin marco'], ['name', 'Efecto del nombre', 'Sin efecto'], ['cover', 'Portada', 'Sin portada']];

$('#me-country').innerHTML = '<option value="">Sin indicar</option>' + countries.map((c) => `<option>${c}</option>`).join('');
$('#ed-accents').innerHTML = accents.map(([id, name]) => `<button type="button" class="swatch" data-accent="${id}" data-set="accent:${id}" title="${name}" aria-label="${name}"></button>`).join('');
$('#ed-banners').innerHTML = banners.map(([id, name]) => `<button type="button" class="opt" data-set="banner:${id}"><i class="pf-banner" data-banner="${id}"></i><span>${name}</span></button>`).join('');
$('#ed-shapes').innerHTML = shapes.map(([id, name]) => `<button type="button" class="opt" data-set="shape:${id}"><i class="shape" data-shape="${id}"></i><span>${name}</span></button>`).join('');
$('#ed-layouts').innerHTML = layouts.map((l) => `<button type="button" class="chip" data-set="layout:${l}">${l}</button>`).join('');

export function initEditor(api2) {
  hooks = api2;
}

export async function openEditor(tab = 'identidad') {
  const user = hooks.user();
  if (!user) return;
  draft = {};
  for (const f of fields) draft[f] = user[f] || '';
  draft.layout = user.layout || '';
  draft.accent = user.accent || 'ambar';
  draft.banner = user.banner || 'liso';
  draft.shape = user.shape || 'cuadrada';
  draft.shown = [];
  draft.equip = { frame: '', name: '', cover: '' };
  medals = [];
  rw = { items: [] };
  rwShown = '';
  rwTheme = '';
  $('#me-error').textContent = '';
  $('#ed-confirm').hidden = true;
  for (const f of fields) $('#me-' + f).value = draft[f];
  try {
    const p = await api.profile(user.handle);
    medals = p.medals;
    draft.shown = p.shown.filter((id) => p.medals.some((m) => m.id === id && m.earned));
  } catch {}
  try {
    rw = await api.rewards();
    for (const k of ['frame', 'name', 'cover']) draft.equip[k] = rw.equip[k] || '';
  } catch {}
  baseline = JSON.stringify(draft);
  setTab(tab);
  paint();
  if (!$('#me').open) $('#me').showModal();
}

function setTab(name) {
  for (const b of document.querySelectorAll('.ed-tabs button')) {
    const on = b.dataset.tab === name;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  for (const panel of document.querySelectorAll('.ed-panel')) panel.hidden = panel.dataset.panel !== name;
  $('.ed-panels').scrollTop = 0;
}

const dirty = () => JSON.stringify(draft) !== baseline;

function paint() {
  const user = hooks.user();
  for (const f of ['name', 'bio']) {
    const box = $('#me-' + f);
    $(`[data-count="${f}"]`).textContent = `${box.value.length}/${box.maxLength}`;
  }
  $('#me-av').innerHTML = avatarInner(user);
  $('#me-photo-del').hidden = !user.av;
  for (const b of document.querySelectorAll('[data-set]')) {
    const [key, val] = b.dataset.set.split(':');
    const on = draft[key] === val;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  for (const b of document.querySelectorAll('#ed-banners .pf-banner')) b.parentElement.dataset.accent = draft.accent;
  $('#ed-accent-name').textContent = accents.find(([id]) => id === draft.accent)[1];
  paintBadges();
  paintRewards();
  paintPreview();
  $('#ed-dirty').hidden = !dirty();
}

function paintBadges() {
  const earned = medals.filter((m) => m.earned);
  const locked = medals.filter((m) => !m.earned);
  $('#ed-count').textContent = `${draft.shown.length}/${maxShown}`;
  $('#ed-slots').innerHTML = Array.from({ length: maxShown }, (_, i) => {
    const m = medals.find((x) => x.id === draft.shown[i]);
    if (!m) return `<div class="slot empty" data-slot="${i}"><span>${svg(icons.plus)}</span><small>${i === 0 ? 'Destacada' : 'Libre'}</small></div>`;
    return `<div class="slot" draggable="true" data-slot="${i}">
      ${medalImg(m)}<b>${esc(m.name)}</b><small>${i === 0 ? 'Destacada' : 'Posición ' + (i + 1)}</small>
      <div class="slot-ctl">
        <button type="button" data-move="-1" aria-label="Mover antes" ${i === 0 ? 'disabled' : ''}>${svg(icons.left)}</button>
        <button type="button" data-drop aria-label="Quitar">${svg(icons.close)}</button>
        <button type="button" data-move="1" aria-label="Mover después" ${i === draft.shown.length - 1 ? 'disabled' : ''}>${svg(icons.right)}</button>
      </div></div>`;
  }).join('');
  $('#ed-pool').innerHTML = earned.length
    ? earned.map((m) => {
        const at = draft.shown.indexOf(m.id);
        return `<button type="button" class="pickme${at > -1 ? ' on' : ''}" data-pick="${esc(m.id)}" aria-pressed="${at > -1}" title="${esc(m.desc)}">${medalImg(m)}<span>${esc(m.name)}</span>${at > -1 ? `<i class="count">${at + 1}</i>` : ''}</button>`;
      }).join('')
    : '<p class="note">Todavía no ganaste medallas para lucir.</p>';
  $('#ed-locked-wrap').hidden = !locked.length;
  $('#ed-locked-n').textContent = locked.length;
}

const THEME_LABELS = { arcoiris: 'Arcoíris', oceano: 'Océano', tecnologia: 'Tecnología', comic: 'Cómic', neon: 'Neón' };
const themeLabel = (t) => THEME_LABELS[t] || t.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

// Sinergias (combos): temáticas con piezas de al menos dos tipos distintos entre las que la persona ve.
function synergies() {
  const by = new Map();
  for (const i of rw.items) if (i.theme) by.set(i.theme, [...(by.get(i.theme) || []), i]);
  return [...by.entries()]
    .filter(([, v]) => new Set(v.map((x) => x.kind)).size >= 2)
    .map(([theme, v]) => ({ theme, label: themeLabel(theme), total: v.length, owned: v.filter((x) => x.owned).length }))
    .sort((a, b) => b.owned - a.owned || a.label.localeCompare(b.label, 'es'));
}

const picked = (kind) => rw.items.find((i) => i.id === draft.equip[kind]) || null;

// Pestaña Recompensas: todo el catálogo, con lo bloqueado atenuado y la pista de cómo conseguirlo.
// Solo se vuelve a dibujar cuando cambia lo elegido, para que las animaciones no se reinicien al escribir en otras pestañas.
function paintRewards() {
  const key = JSON.stringify(draft.equip) + rw.items.length + '|' + rwTheme;
  if (key === rwShown) return;
  rwShown = key;
  if (!rw.items.length) {
    $('#rw-body').innerHTML = '<p class="note">Todavía no hay recompensas para mostrar.</p>';
    return;
  }
  const thumb = (i) => {
    const p = safePreset(i.preset);
    if (i.kind === 'frame') return `<i class="rw-av" data-frame="${p}"></i>`;
    if (i.kind === 'cover') return `<i class="rw-cv" data-cover="${p}"></i>`;
    return `<span class="rw-fx">${nameFx('Nombre', { name: i })}</span>`;
  };
  const syn = synergies();
  if (rwTheme && !syn.some((c) => c.theme === rwTheme)) rwTheme = '';
  const chips = syn.length
    ? `<div class="rw-syn" role="group" aria-label="Filtrar por sinergia"><span>Sinergia</span>
        <button type="button" data-syn="" class="${rwTheme ? '' : 'on'}" aria-pressed="${!rwTheme}">Todas</button>
        ${syn.map((c) => `<button type="button" data-syn="${esc(c.theme)}" class="${rwTheme === c.theme ? 'on' : ''}" aria-pressed="${rwTheme === c.theme}">${esc(c.label)}<i>${c.owned}/${c.total}</i></button>`).join('')}</div>`
    : '';
  const sel = syn.find((c) => c.theme === rwTheme);
  const bar = sel ? `<p class="rw-syn-note">Combo ${esc(sel.label)}: las piezas de este grupo combinan entre sí. Elegí una de cada tipo para llevar la sinergia completa.</p>` : '';
  $('#rw-body').innerHTML = chips + bar + rwGroups.map(([kind, title, none]) => {
    const list = rw.items.filter((i) => i.kind === kind && (!rwTheme || i.theme === rwTheme));
    if (!list.length) return '';
    const cards = list.map((i) => `<button type="button" class="rw-card${draft.equip[kind] === i.id ? ' on' : ''}${i.owned ? '' : ' locked'}" data-rw="${kind}:${esc(i.id)}"
      data-rarity="${esc(i.rarity)}" aria-pressed="${draft.equip[kind] === i.id}" title="${esc(i.owned ? i.description : i.hint)}">${thumb(i)}<b>${esc(i.name)}</b><small>${esc(rarityName[i.rarity] || i.rarity)}</small></button>`).join('');
    return `<div class="rw-group"><h3>${title}<small>${list.filter((i) => i.owned).length} de ${list.length}</small></h3>
      <div class="rw-grid">${rwTheme ? '' : `<button type="button" class="rw-card${draft.equip[kind] ? '' : ' on'}" data-rw="${kind}:" aria-pressed="${!draft.equip[kind]}"><span class="rw-none">${none}</span></button>`}${cards}</div></div>`;
  }).join('');
}

function paintPreview() {
  const user = hooks.user();
  const box = $('#ed-preview');
  box.dataset.accent = draft.accent;
  box.dataset.shape = draft.shape;
  const cosm = { frame: picked('frame'), name: picked('name'), cover: picked('cover') };
  setCover($('#ed-preview .pf-banner'), cosm.cover, draft.banner);
  setFrame($('#pv-avatar'), cosm.frame);
  $('#pv-avatar').innerHTML = avatarInner(user);
  const first = medals.find((m) => m.id === draft.shown[0]);
  $('#pv-name').innerHTML = nameFx(draft.name.trim() || user.name, cosm) + (first ? `<span class="feat">${medalImg(first)}</span>` : '');
  $('#pv-handle').textContent = '@' + user.handle;
  const tags = [draft.country, draft.layout, draft.switches].filter(Boolean);
  $('#pv-tags').innerHTML = tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  $('#pv-bio').textContent = draft.bio.trim() || 'Tu biografía va a aparecer acá.';
  $('#pv-medals').innerHTML = Array.from({ length: maxShown }, (_, i) => {
    const m = medals.find((x) => x.id === draft.shown[i]);
    return m ? `<span title="${esc(m.name)}">${medalImg(m)}</span>` : '<span class="blank"></span>';
  }).join('');
}

function move(from, to) {
  if (to < 0 || to >= draft.shown.length || from === to) return;
  const [id] = draft.shown.splice(from, 1);
  draft.shown.splice(to, 0, id);
}

function tryClose() {
  if (!dirty()) return $('#me').close();
  $('#ed-confirm').hidden = false;
  $('#ed-confirm button').focus();
}

async function savePhoto(image) {
  try {
    await api.saveAvatar(image);
    await hooks.saved({ photo: true });
    paint();
  } catch (err) {
    $('#me-error').textContent = err.message;
  }
}

for (const f of fields) {
  $('#me-' + f).addEventListener('input', (e) => {
    draft[f] = e.target.value;
    paint();
  });
}

$('.ed-tabs').onclick = (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) setTab(b.dataset.tab);
};
$('.ed-tabs').onkeydown = (e) => {
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
  if (!step) return;
  const tabs = [...document.querySelectorAll('.ed-tabs button')];
  const next = tabs[(tabs.indexOf(document.activeElement) + step + tabs.length) % tabs.length];
  e.preventDefault();
  next.focus();
  setTab(next.dataset.tab);
};

$('#me').addEventListener('click', (e) => {
  const set = e.target.closest('[data-set]');
  if (set) {
    const [key, val] = set.dataset.set.split(':');
    draft[key] = key === 'layout' && draft.layout === val ? '' : val;
    return paint();
  }
  const synBtn = e.target.closest('[data-syn]');
  if (synBtn) {
    rwTheme = synBtn.dataset.syn;
    rwShown = '';
    return paint();
  }
  const gift = e.target.closest('[data-rw]');
  if (gift) {
    const [kind, id] = gift.dataset.rw.split(':');
    const item = rw.items.find((i) => i.id === id);
    if (id && item && !item.owned) {
      $('#rw-hint').textContent = `${item.name}: ${item.hint}`;
      return;
    }
    $('#rw-hint').textContent = '';
    draft.equip[kind] = id;
    return paint();
  }
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    const id = pick.dataset.pick;
    const at = draft.shown.indexOf(id);
    $('#me-error').textContent = '';
    if (at > -1) draft.shown.splice(at, 1);
    else if (draft.shown.length < maxShown) draft.shown.push(id);
    else $('#me-error').textContent = 'Ya elegiste 6. Quitá una para sumar otra.';
    return paint();
  }
  const slot = e.target.closest('.slot[data-slot]');
  if (slot && e.target.closest('[data-drop]')) {
    draft.shown.splice(Number(slot.dataset.slot), 1);
    return paint();
  }
  const shift = e.target.closest('[data-move]');
  if (slot && shift) {
    const i = Number(slot.dataset.slot);
    move(i, i + Number(shift.dataset.move));
    return paint();
  }
  if (e.target.closest('#ed-vitrina')) openVitrina();
});

let dragging = null;
$('#ed-slots').addEventListener('dragstart', (e) => {
  const slot = e.target.closest('.slot[draggable]');
  if (!slot) return;
  dragging = Number(slot.dataset.slot);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(dragging));
  slot.classList.add('lifted');
});
$('#ed-slots').addEventListener('dragover', (e) => {
  if (dragging !== null && e.target.closest('.slot')) e.preventDefault();
});
$('#ed-slots').addEventListener('drop', (e) => {
  const slot = e.target.closest('.slot');
  if (dragging === null || !slot) return;
  e.preventDefault();
  move(dragging, Math.min(Number(slot.dataset.slot), draft.shown.length - 1));
  dragging = null;
  paint();
});
$('#ed-slots').addEventListener('dragend', () => {
  dragging = null;
  paint();
});

$('#me-photo-btn').onclick = () => $('#me-photo').click();
$('#me-photo').onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { $('#me-error').textContent = 'Elegí un archivo de imagen.'; return; }
  openCrop(file, (image) => savePhoto(image));
};
$('#me-photo-del').onclick = () => savePhoto(null);

$('#me-close').onclick = tryClose;
$('#me-cancel').onclick = tryClose;
$('#me').addEventListener('cancel', (e) => {
  if (dirty()) { e.preventDefault(); tryClose(); }
});
$('#ed-keep').onclick = () => { $('#ed-confirm').hidden = true; };
$('#ed-discard').onclick = () => $('#me').close();

$('#me-form').onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api.saveProfile({ ...draft });
    baseline = JSON.stringify(draft);
    $('#me').close();
    await hooks.saved({});
  } catch (err) {
    $('#me-error').textContent = err.message;
  }
};

document.addEventListener('edit-profile', (e) => openEditor(e.detail));
