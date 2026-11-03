// Medallas de velocidad en la unidad elegida (CPM o WPM).
// El servidor guarda y envía todo en CPM (1 WPM = 5 CPM). Acá se adaptan, antes de dibujarlas, la descripción
// y los números de avance de las medallas que miden velocidad (el servidor las marca con speed: true).
import { load } from './store.js';

const PER_WORD = 5;
const TOKEN = /(\d+(?:\.\d{3})*)\s*(CPM|WPM)\b/gi;

function swap(text, wpm) {
  return String(text || '').replace(TOKEN, (whole, digits, unit) => {
    const from = unit.toUpperCase();
    const to = wpm ? 'WPM' : 'CPM';
    if (from === to) return whole;
    const n = Number(digits.replace(/\./g, ''));
    const out = wpm ? Math.round(n / PER_WORD) : n * PER_WORD;
    const grouped = digits.includes('.') && out >= 1000 ? out.toLocaleString('es-AR') : String(out);
    return `${grouped} ${to}`;
  });
}

export function localizeMedals(data) {
  if (!data || !Array.isArray(data.medals)) return data;
  const wpm = load('unit', 'cpm') === 'wpm';
  data.medals = data.medals.map((m) => {
    if (!m.speed) return m;
    return {
      ...m,
      desc: swap(m.desc, wpm),
      target: wpm ? Math.ceil(m.target / PER_WORD) : m.target,
      value: wpm ? Math.floor(m.value / PER_WORD) : m.value,
    };
  });
  return data;
}
