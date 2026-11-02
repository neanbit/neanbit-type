// Aviso «Desbloqueaste…»: aparece cuando la persona gana una recompensa (por nivel, medalla, torneo, evento o a mano desde el panel).
// El servidor la marca como vista apenas se muestra, así que no se repite al recargar.
import { api } from './api.js';
import { $, esc, icons, svg } from './ui.js';
import { nameFx, rarityName, safePreset } from './rewards.js';

const KIND = { frame: 'Marco de foto', name: 'Efecto de nombre', cover: 'Portada' };
const SHOW = 3; // tarjetas a la vez; el resto se resume en una línea
const STAY = 10000;
const shown = new Set();
let box = null;

function thumb(i) {
  const p = safePreset(i.preset);
  if (i.kind === 'frame') return `<i class="rw-av" data-frame="${p}"></i>`;
  if (i.kind === 'cover') return `<i class="rw-cv" data-cover="${p}"></i>`;
  return `<span class="rw-fx">${nameFx('Nombre', { name: i })}</span>`;
}

function mount() {
  if (box) return box;
  box = document.createElement('aside');
  box.id = 'rw-news';
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  if ('popover' in box) box.popover = 'manual'; // capa superior: se ve también encima de una ventana abierta (por ejemplo el resultado de un duelo)
  document.body.append(box);
  return box;
}

function card(i) {
  const el = document.createElement('div');
  el.className = 'rw-news-card';
  el.dataset.rarity = i.rarity;
  el.innerHTML = `<div class="rw-news-art">${thumb(i)}</div>
    <div class="rw-news-txt"><small>Desbloqueaste</small><b>${esc(i.name)}</b><span>${esc(KIND[i.kind] || i.kind)}, ${esc((rarityName[i.rarity] || i.rarity).toLowerCase())}</span></div>
    <button type="button" class="rw-news-view">Ver</button>
    <button type="button" class="ghost rw-news-x" aria-label="Cerrar">${svg(icons.close)}</button>`;
  const close = () => el.remove();
  el.querySelector('.rw-news-x').onclick = close;
  el.querySelector('.rw-news-view').onclick = () => {
    close();
    document.dispatchEvent(new CustomEvent('edit-profile', { detail: 'recompensas' }));
  };
  setTimeout(close, STAY);
  return el;
}

export function announce(list) {
  const fresh = (Array.isArray(list) ? list : []).filter((i) => i && i.id && !shown.has(i.id));
  if (!fresh.length) return;
  for (const i of fresh) shown.add(i.id);
  api.rewardsSeen().catch(() => {});
  const host = mount();
  for (const i of fresh.slice(0, SHOW)) host.append(card(i));
  if ('popover' in host) {
    try { host.hidePopover(); } catch {}
    try { host.showPopover(); } catch {}
  }
  if (fresh.length > SHOW) {
    const more = document.createElement('p');
    more.className = 'rw-news-more';
    more.textContent = `y ${fresh.length - SHOW} más en Editar perfil, pestaña Recompensas`;
    host.append(more);
    setTimeout(() => more.remove(), STAY);
  }
}

// Para después de un duelo o un torneo, que pueden haber dado algo mientras la persona miraba otra pantalla.
export async function checkNews() {
  try { announce((await api.rewardNews()).news); } catch {}
}
