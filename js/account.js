import { api } from './api.js';
import { load } from './store.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const speed = (cpm) => (load('unit', 'cpm') === 'wpm' ? Math.round(cpm / 5) : cpm);

let user = null;
let registering = false;

async function refreshUser() {
  try { user = (await api.me()).user; } catch { user = null; }
  $('#account').textContent = user ? user.name : 'Ingresar';
}

export async function refreshRanking() {
  const list = $('#ranking');
  try {
    const scope = $('#board-scope').value;
    const { rows } = await api.ranking(scope === 'hc' ? 'all' : scope, scope === 'hc');
    list.innerHTML = rows.length
      ? rows.map((r, i) => `<li data-handle="${esc(r.handle)}"><span>${i + 1}</span><span>${esc(r.name)}</span><b>${speed(r.cpm)}</b></li>`).join('')
      : '<li>Todavía no hay carreras en el ranking.</li>';
  } catch {
    list.innerHTML = '<li>El ranking necesita el servidor en marcha.</li>';
  }
}

async function openProfile(handle) {
  try {
    const p = await api.profile(handle);
    const medals = p.medals.length
      ? p.medals.map((m) => `<li><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></li>`).join('')
      : '<li><small>Sin medallas todavía.</small></li>';
    $('#profile-body').innerHTML = `<h2>${esc(p.name)}</h2>
      <p class="note">@${esc(p.handle)}, desde ${new Date(p.since).toLocaleDateString('es-AR')}</p>
      <div class="summary"><div><span>${p.races}</span><small>carreras</small></div>
        <div><span>${speed(p.best)}</span><small>récord</small></div>
        <div><span>${speed(p.avg)}</span><small>promedio</small></div></div>
      <ul class="medals">${medals}</ul>`;
    $('#profile').showModal();
  } catch {}
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
  if (user) {
    if (confirm('¿Cerrar sesión?')) { await api.logout().catch(() => {}); await refreshUser(); }
    return;
  }
  setMode(false);
  $('#auth').showModal();
};
$('#auth-switch').onclick = () => setMode(!registering);
$('#auth-close').onclick = () => $('#auth').close();
$('#board-scope').onchange = refreshRanking;
$('#ranking').onclick = (e) => {
  const row = e.target.closest('li[data-handle]');
  if (row) openProfile(row.dataset.handle);
};
$('#profile-close').onclick = () => $('#profile').close();

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
refreshRanking();
