// Textos propios: viven solo en este navegador (localStorage), no pasan por el servidor ni suman a rankings.
import { load, save } from './store.js';
import { $ } from './ui.js';

const KEY = 'mytexts';
const MIN = 40;
const MAX = 800;
const LIMIT = 20;

export const clean = (s) => String(s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (t) => (t ? t.split(' ').length : 0);

export const mytexts = {
  all: () => load(KEY, []),
  find: (id) => mytexts.all().find((t) => t.id === id),
  remove(id) { save(KEY, mytexts.all().filter((t) => t.id !== id)); },
  asText: (t) => ({ id: 0, category: 'Mi texto', text: t.text, title: t.title, custom: true }),
};

let editing = null;
let done = () => {};

function count() {
  const t = clean($('#mt-body').value);
  $('#mt-count').textContent = `${t.length} de ${MAX} caracteres, ${words(t)} palabras`;
}

// Abre el formulario para crear (item vacío) o editar. onSave recibe el texto guardado.
export function editMyText(item, onSave) {
  editing = item || null;
  done = onSave;
  $('#mytext-h').textContent = item ? 'Editar mi texto' : 'Mi texto';
  $('#mt-title').value = item ? item.title : '';
  $('#mt-body').value = item ? item.text : '';
  $('#mt-error').textContent = '';
  count();
  $('#mytext').showModal();
  $('#mt-body').focus();
}

$('#mt-body').addEventListener('input', count);
$('#mt-cancel').onclick = () => $('#mytext').close();
$('#mytext-form').onsubmit = (e) => {
  e.preventDefault();
  const text = clean($('#mt-body').value);
  const title = clean($('#mt-title').value).slice(0, 40);
  const list = mytexts.all();
  if (text.length < MIN) return void ($('#mt-error').textContent = `Necesita al menos ${MIN} caracteres para que valga como práctica.`);
  if (text.length > MAX) return void ($('#mt-error').textContent = `Es demasiado largo (máximo ${MAX} caracteres).`);
  if (!editing && list.length >= LIMIT) return void ($('#mt-error').textContent = `Podés guardar hasta ${LIMIT} textos. Borrá alguno para sumar otro.`);
  let item;
  if (editing) {
    item = { ...editing, title, text };
    save(KEY, list.map((t) => (t.id === editing.id ? item : t)));
  } else {
    item = { id: 'm' + Date.now().toString(36), title, text };
    save(KEY, [...list, item]);
  }
  $('#mytext').close();
  done(item, !editing);
};
