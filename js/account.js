import { api } from './api.js';
import { load } from './store.js';
import { avatarInner } from './avatar.js';
import { initEditor, openEditor } from './editor.js';
import { $, esc } from './ui.js';

const speed = (cpm) => (load('unit', 'cpm') === 'wpm' ? Math.round(cpm / 5) : cpm);

let user = null;
let registering = false;

initEditor({
  user: () => user,
  saved: async () => {
    await refreshUser();
    if (!$('#profile').hidden) viewProfile(user.handle);
  },
});

async function refreshUser() {
  try { user = (await api.me()).user; } catch { user = null; }
  $('#who-name').textContent = user ? user.name : 'Ingresar';
  $('#who-handle').textContent = user ? '@' + user.handle : 'Crear una cuenta';
  $('#av').innerHTML = user ? avatarInner(user) : 'n';
  $('#guest').hidden = !!user;
  $('#nav-out').hidden = !user;
  $('#menu-out').hidden = !user;
  document.dispatchEvent(new CustomEvent('session', { detail: user }));
  refreshRanking();
}

const viewProfile = (handle) => document.dispatchEvent(new CustomEvent('profile', { detail: handle }));
const mine = (r) => (user && user.handle === r.handle ? 'me' : '');
const person = (r) => `<div class="who-cell"><span class="av sm">${avatarInner(r)}</span>${esc(r.name)}</div>`;
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
$('#pf-edit').onclick = () => openEditor();
$('#guest-login').onclick = () => $('#account').click();
$('#nav-out').onclick = async () => {
  await api.logout().catch(() => {});
  await refreshUser();
};
document.addEventListener('units', refreshRanking);
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
