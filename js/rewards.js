// Recompensas cosméticas en el navegador: dibuja el marco, el nombre y la portada que cada usuario tiene puesto.
// Los efectos viven en css/rewards.css; acá solo se ponen los atributos y se cargan las tipografías cuando hacen falta.
import { esc } from './ui.js';

const FONT = /^[A-Za-z0-9 ]{2,30}$/;
const PRESET = /^[a-z0-9-]{1,24}$/;
const asked = new Set();

// Las tipografías de los nombres se piden recién cuando alguien con ese efecto aparece en pantalla.
export function loadFont(name) {
  if (!FONT.test(name || '') || asked.has(name)) return;
  asked.add(name);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, '+')}&display=swap`;
  document.head.append(link);
}

const preset = (item) => (item && PRESET.test(item.preset || '') ? item.preset : '');
export const safePreset = (p) => (PRESET.test(p || '') ? p : '');

// Nombre con su efecto y tipografía. Sin efecto, devuelve el texto escapado.
export function nameFx(name, cosm, { still = false, plain = false } = {}) {
  const fx = preset(cosm && cosm.name);
  if (!fx) return esc(name);
  const font = plain ? '' : cosm.name.font;
  if (font) loadFont(font);
  const style = font && FONT.test(font) ? ` style="font-family:'${font}',var(--ui)"` : '';
  return `<span class="fx" data-fx="${fx}" data-t="${esc(name)}"${style}${still ? ' data-still' : ''}>${esc(name)}</span>`;
}

// Para listas, rankings y llaves: el nombre con su efecto pero quieto y con la letra de siempre (así las filas no se desalinean),
// y el marco de la foto como atributos listos para pegar en la etiqueta del avatar.
export const nameLite = (name, cosm) => nameFx(name, cosm, { still: true, plain: true });
export const frameAttr = (cosm) => { const p = preset(cosm && cosm.frame); return p ? ` data-frame="${p}" data-still` : ''; };

export function setFrame(el, item) {
  const p = preset(item);
  if (p) el.dataset.frame = p;
  else delete el.dataset.frame;
}

// La portada reemplaza al patrón liso; si no hay portada, el patrón que eligió la persona sigue valiendo.
export function setCover(el, item, banner) {
  const p = preset(item);
  if (p) {
    el.dataset.cover = p;
    el.dataset.banner = 'liso';
  } else {
    delete el.dataset.cover;
    el.dataset.banner = banner || 'liso';
  }
}

// La paleta cambia los colores generales del perfil (acento y tinta) con data-palette; sin paleta vale el color que eligió la persona.
export function setPalette(el, item) {
  const p = preset(item);
  if (p) el.dataset.palette = p;
  else delete el.dataset.palette;
}

export const rarityName = { comun: 'Común', rara: 'Rara', epica: 'Épica', legendaria: 'Legendaria' };
