// Recompensas cosméticas en el navegador: dibuja el marco, el nombre y la portada que cada piloto tiene puesto.
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
export function nameFx(name, cosm, { still = false } = {}) {
  const fx = preset(cosm && cosm.name);
  if (!fx) return esc(name);
  const font = cosm.name.font;
  if (font) loadFont(font);
  const style = font && FONT.test(font) ? ` style="font-family:'${font}',var(--ui)"` : '';
  return `<span class="fx" data-fx="${fx}" data-t="${esc(name)}"${style}${still ? ' data-still' : ''}>${esc(name)}</span>`;
}

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

export const rarityName = { comun: 'Común', rara: 'Rara', epica: 'Épica', legendaria: 'Legendaria' };
