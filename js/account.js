import { api } from './api.js';
import { avatarInner } from './avatar.js';
import { initEditor, openEditor } from './editor.js';
import { $ } from './ui.js';

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
  $('#nav-out').hidden = !user;
  $('#menu-out').hidden = !user;
  document.dispatchEvent(new CustomEvent('session', { detail: user }));
}

const viewProfile = (handle) => document.dispatchEvent(new CustomEvent('profile', { detail: handle }));
function setMode(register) {
  registering = register;
  $('#auth-title').textContent = register ? 'Crear cuenta' : 'Ingresar';
  $('#auth-name').hidden = !register;
  $('#auth-terms').hidden = !register;
  $('#auth-accept').checked = false;
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
$('#pf-edit').onclick = () => openEditor();
$('#nav-out').onclick = async () => {
  await api.logout().catch(() => {});
  await refreshUser();
};
$('#auth-form').onsubmit = async (e) => {
  e.preventDefault();
  const handle = $('#auth-handle').value.trim();
  const password = $('#auth-pass').value;
  if (registering && !$('#auth-accept').checked) {
    $('#auth-error').textContent = 'Para crear la cuenta tenés que aceptar los términos y la política de privacidad.';
    return;
  }
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
  document.dispatchEvent(new Event('race-saved'));
});

document.addEventListener('death', (e) => {
  if (user) api.death(e.detail.textId).catch(() => {});
});

refreshUser();
