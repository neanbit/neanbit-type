import { api } from './api.js';
import { avatarInner } from './avatar.js';
import { $, esc } from './ui.js';

let ws = null;
let me = null;
let status = 'idle';
let online = 0;
let wantQueue = false;
let pulse = 0;
let lastSent = 0;
let trailing = 0;
let pending = -1;
const incoming = new Map();

const emit = (name, detail) => document.dispatchEvent(new CustomEvent('duel-' + name, { detail }));

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.textContent = ''), 4000);
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
    const timer = setTimeout(() => { socket.close(); reject(new Error('timeout')); }, 7000);
    ws = socket;
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = () => { clearTimeout(timer); reject(new Error('socket')); };
    socket.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      handle(msg);
    };
    socket.onclose = () => {
      clearTimeout(timer);
      if (ws !== socket) return;
      ws = null;
      const wasDuel = status === 'duel';
      reset();
      emit('closed');
      if (wasDuel) emit('lost');
      else draw();
    };
  });
}

function reset() {
  status = 'idle';
  incoming.clear();
  clearInterval(pulse);
  clearTimeout(trailing);
  pending = -1;
}

function handle(m) {
  switch (m.t) {
    case 'hello':
      me = m.me;
      online = m.online;
      break;
    case 'presence':
      online = m.online;
      break;
    case 'queued':
      status = 'queued';
      break;
    case 'idle':
      status = 'idle';
      break;
    case 'invite_sent':
      status = 'inviting';
      $('#d-wait-msg').textContent = `Invitación enviada a ${m.to.name}. Esperando que responda…`;
      break;
    case 'invite':
      incoming.set(m.from.handle, m.from);
      break;
    case 'invite_gone':
      incoming.delete(m.from.handle);
      break;
    case 'invite_declined':
      status = 'idle';
      toast(m.busy ? `${m.to.name} está ocupado ahora.` : `${m.to.name} rechazó la invitación.`);
      break;
    case 'invite_expired':
      status = 'idle';
      toast(`${m.to.name} no respondió a tiempo.`);
      break;
    case 'match':
      status = 'duel';
      incoming.clear();
      draw();
      emit('match', m);
      return;
    case 'error':
      toast(m.error);
      if (status === 'inviting') status = 'idle';
      break;
    case 'replaced':
      toast('Abriste Duelos en otra pestaña. Esta quedó desconectada.');
      reset();
      emit('replaced');
      return;
    case 't_match':
      emit('tmatch', m);
      return;
    case 't_info':
      emit('tinfo', m);
      return;
    case 'count': case 'go': case 'opp': case 'opp_done': case 'wait': case 'cancelled':
      if (m.t === 'cancelled') status = 'idle';
      emit(m.t, m);
      return;
    case 'result':
      status = 'idle';
      emit('result', m);
      return;
    default:
      return;
  }
  draw();
}

function draw() {
  const idle = status === 'idle';
  const waiting = status === 'queued' || status === 'inviting';
  $('#d-grid').hidden = !idle;
  $('#d-wait').hidden = !waiting;
  if (status === 'queued') $('#d-wait-msg').textContent = 'Buscando rival. En cuanto otro piloto busque duelo, arrancan.';
  $('#d-in').hidden = !incoming.size || status === 'duel';
  $('#d-incoming').innerHTML = [...incoming.values()].map((c) =>
    `<li data-handle="${esc(c.handle)}"><span class="av sm">${avatarInner(c)}</span>`
    + `<span class="nm"><b>${esc(c.name)}</b><small>@${esc(c.handle)} te invita a un duelo</small></span>`
    + '<button class="primary" data-accept>Aceptar</button><button data-decline>Rechazar</button></li>').join('');
  const connected = ws && ws.readyState === WebSocket.OPEN;
  $('#d-online').textContent = connected
    ? `${online} ${online === 1 ? 'piloto en la sala' : 'pilotos en la sala'}`
    : 'Sin conexión con la sala de duelos.';
  $('#d-queue').disabled = !connected;
}

async function search() {
  const query = $('#d-search').value.trim();
  const box = $('#d-results');
  if (query.length < 2) { box.hidden = true; return; }
  const { rows } = await api.searchUsers(query).catch(() => ({ rows: [] }));
  const list = rows.filter((r) => !me || r.handle !== me.handle);
  box.innerHTML = list.length
    ? list.map((r) => `<li data-handle="${esc(r.handle)}"><span class="av sm">${avatarInner(r)}</span>${esc(r.name)} <small>@${esc(r.handle)}</small></li>`).join('')
    : '<li class="none">No hay pilotos con ese nombre.</li>';
  box.hidden = false;
}

$('#d-queue').onclick = () => send({ t: 'queue' });
$('#d-cancel').onclick = () => send({ t: status === 'queued' ? 'unqueue' : 'cancel' });
$('#d-search').oninput = () => { clearTimeout(search.timer); search.timer = setTimeout(search, 250); };
$('#d-results').onclick = (e) => {
  const row = e.target.closest('li[data-handle]');
  if (!row) return;
  $('#d-results').hidden = true;
  $('#d-search').value = '';
  send({ t: 'invite', to: row.dataset.handle });
};
$('#d-incoming').onclick = (e) => {
  const li = e.target.closest('li[data-handle]');
  if (!li) return;
  const from = li.dataset.handle;
  if (e.target.closest('[data-accept]')) send({ t: 'accept', from });
  else if (e.target.closest('[data-decline]')) {
    send({ t: 'decline', from });
    incoming.delete(from);
    draw();
  }
};

export const duel = {
  async open({ queue = false } = {}) {
    wantQueue = queue;
    draw();
    try {
      await connect();
    } catch {
      ws = null;
      draw();
      toast('No se pudo conectar con la sala de duelos.');
      return;
    }
    clearInterval(pulse);
    pulse = setInterval(() => send({ t: 'presence' }), 10000);
    draw();
    if (wantQueue) send({ t: 'queue' });
  },

  // Conexión para torneos: sin cola ni invitaciones, solo para recibir el aviso del partido.
  async join() {
    try {
      await connect();
    } catch {
      ws = null;
      draw();
      return false;
    }
    clearInterval(pulse);
    pulse = setInterval(() => send({ t: 'presence' }), 10000);
    draw();
    return true;
  },

  connected() {
    return !!ws && ws.readyState === WebSocket.OPEN;
  },

  ready(mid) {
    send({ t: 't_ready', mid });
  },

  close() {
    const socket = ws;
    ws = null;
    reset();
    if (socket) socket.close();
  },

  progress(n) {
    pending = n;
    const wait = 90 - (Date.now() - lastSent);
    if (wait <= 0) {
      lastSent = Date.now();
      send({ t: 'progress', n });
      pending = -1;
    } else if (!trailing) {
      trailing = setTimeout(() => {
        trailing = 0;
        if (pending >= 0) { lastSent = Date.now(); send({ t: 'progress', n: pending }); pending = -1; }
      }, wait);
    }
  },

  finish(data) {
    clearTimeout(trailing);
    trailing = 0;
    send({ t: 'finish', ...data });
  },
};
