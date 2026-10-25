import { api } from './api.js';
import { load } from './store.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const speed = (cpm) => (load('unit', 'cpm') === 'wpm' ? Math.round(cpm / 5) : cpm);

let user = null;
let registering = false;

async function refreshUser() {
  try { user = (await api.me()).user; } catch { user = null; }
  $('#who-name').textContent = user ? user.name : 'Ingresar';
  $('#who-handle').textContent = user ? '@' + user.handle : 'Crear una cuenta';
  $('#av').textContent = user ? user.name.charAt(0).toUpperCase() : 'n';
  $('#nav-out').hidden = !user;
  document.dispatchEvent(new CustomEvent('session', { detail: user }));
  refreshRanking();
}

const viewProfile = (handle) => document.dispatchEvent(new CustomEvent('profile', { detail: handle }));
const initial = (name) => esc(String(name).trim().charAt(0).toUpperCase());
const mine = (r) => (user && user.handle === r.handle ? 'me' : '');
const person = (r) => `<div class="who-cell"><span class="av sm">${initial(r.name)}</span>${esc(r.name)}</div>`;
const emptyRow = (text) => `<tr><td colspan="4" class="empty">${text}</td></tr>`;

export async function refreshRanking() {
  try {
    const [top, avg] = await Promise.all([api.topRaces($('#races-scope').value), api.averages($('#avg-scope').value)]);
    $('#rank-races').innerHTML = top.rows.length
      ? top.rows.map((r, i) => `<tr data-handle="${esc(r.handle)}" class="${mine(r)}"><td>${i + 1}</td><td>${person(r)}</td><td><b>${speed(r.cpm)}</b></td><td>#${r.text_id}</td></tr>`).join('')
      : emptyRow('Todavía no hay carreras en este período.');
    $('#rank-avg').innerHTML = avg.rows.length
      ? avg.rows.map((r, i) => `<tr data-handle="${esc(r.handle)}" class="${mine(r)}"><td>${i + 1}</td><td>${person(r)}</td><td><b>${speed(r.cpm)}</b></td><td>${r.races}</td></tr>`).join('')
      : emptyRow('Todavía no hay promedios.');
  } catch {
    $('#rank-races').innerHTML = $('#rank-avg').innerHTML = emptyRow('El ranking necesita el servidor en marcha.');
  }
}

const countries = ['Argentina', 'Bolivia', 'Chile', 'Colombia', 'Costa Rica', 'Cuba', 'Ecuador', 'El Salvador', 'España', 'Estados Unidos', 'Guatemala', 'Honduras', 'México', 'Nicaragua', 'Panamá', 'Paraguay', 'Perú', 'República Dominicana', 'Uruguay', 'Venezuela', 'Otro país'];
$('#me-country').innerHTML = '<option value="">País, opcional</option>' + countries.map((c) => `<option>${c}</option>`).join('');

let picker = { medals: [], order: [] };

function drawPicker() {
  $('#me-medals').innerHTML = picker.medals.length
    ? picker.medals.map((m) => {
        const at = picker.order.indexOf(m.id);
        return `<button type="button" class="pick${at > -1 ? ' on' : ''}" data-id="${esc(m.id)}">${esc(m.name)}${at > -1 ? `<i class="count">${at + 1}</i>` : ''}</button>`;
      }).join('')
    : '<p class="note">Todavía no ganaste medallas para lucir.</p>';
}

async function openMe() {
  for (const field of ['name', 'bio', 'country', 'layout', 'switches', 'discord']) $('#me-' + field).value = user[field] || '';
  $('#me-error').textContent = '';
  try {
    const p = await api.profile(user.handle);
    picker = { medals: p.medals.filter((m) => m.earned), order: [...p.shown] };
  } catch {
    picker = { medals: [], order: [] };
  }
  drawPicker();
  $('#me').showModal();
}

function setMode(register) {
  registering = register;
  $('#auth-title').textContent = register ? 'Crear cuenta' : 'Ingresar';
  $('#auth-name').hidden = !register;
  $('#auth-submit').textContent = register ? 'Crear cuenta' : 'Ingresar';
  $('#auth-switch').textContent = register ? 'Ya tengo cuenta' : 'Crear una cuenta';
  $('#auth-error').textContent = '';
}

$('#account').onclick = async () => {
  if (user) return viewProfile(user.handle);
  setMode(false);
  $('#auth').showModal();
};
$('#auth-switch').onclick = () => setMode(!registering);
$('#auth-close').onclick = () => $('#auth').close();
for (const id of ['#rank-races', '#rank-avg']) {
  $(id).onclick = (e) => {
    const row = e.target.closest('tr[data-handle]');
    if (row) viewProfile(row.dataset.handle);
  };
}
$('#races-scope').onchange = $('#avg-scope').onchange = refreshRanking;
$('#pf-edit').onclick = openMe;
$('#nav-out').onclick = async () => {
  await api.logout().catch(() => {});
  await refreshUser();
};
document.addEventListener('units', refreshRanking);
$('#me-close').onclick = () => $('#me').close();
$('#me-medals').onclick = (e) => {
  const id = e.target.closest('[data-id]')?.dataset.id;
  if (!id) return;
  const at = picker.order.indexOf(id);
  if (at > -1) picker.order.splice(at, 1);
  else if (picker.order.length < 6) picker.order.push(id);
  else $('#me-error').textContent = 'Podés lucir hasta 6 medallas.';
  drawPicker();
};
$('#me-form').onsubmit = async (e) => {
  e.preventDefault();
  const body = {};
  for (const field of ['name', 'bio', 'country', 'layout', 'switches', 'discord']) body[field] = $('#me-' + field).value;
  body.shown = picker.order;
  try {
    await api.saveProfile(body);
    $('#me').close();
    await refreshUser();
    if (!$('#profile').hidden) viewProfile(user.handle);
  } catch (err) {
    $('#me-error').textContent = err.message;
  }
};

$('#auth-form').onsubmit = async (e) => {
  e.preventDefault();
  const handle = $('#auth-handle').value.trim();
  const password = $('#auth-pass').value;
  try {
    if (registering) await api.register(handle, $('#auth-name').value.trim(), password);
    else await api.login(handle, password);
    $('#auth').close();
    $('#auth-pass').value = '';
    await refreshUser();
  } catch (err) {
    $('#auth-error').textContent = err.message;
  }
};

document.addEventListener('race', async (e) => {
  if (!user) return;
  const { textId, cpm, acc, hc, chars, words } = e.detail;
  await api.sendRace({ textId, cpm, acc, hc: hc ? 1 : 0, chars, words }).catch(() => {});
  refreshRanking();
});

document.addEventListener('death', (e) => {
  if (user) api.death(e.detail.textId).catch(() => {});
});

refreshUser();
