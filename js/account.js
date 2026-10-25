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

function openMe() {
  for (const field of ['name', 'bio', 'country', 'layout', 'switches', 'discord']) $('#me-' + field).value = user[field] || '';
  $('#me-error').textContent = '';
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
  if (user) return openMe();
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
$('#me-profile').onclick = () => { $('#me').close(); viewProfile(user.handle); };
$('#me-logout').onclick = async () => {
  await api.logout().catch(() => {});
  $('#me').close();
  await refreshUser();
};
$('#me-form').onsubmit = async (e) => {
  e.preventDefault();
  const body = {};
  for (const field of ['name', 'bio', 'country', 'layout', 'switches', 'discord']) body[field] = $('#me-' + field).value;
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
