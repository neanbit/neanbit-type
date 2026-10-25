import { handshake } from './ws.js';

const INVITE_MS = 30000;
const GRACE_MS = 90000;
const MAX_RACE_MS = 300000;
const MAX_CPM = 1800;

export function createDuels({ db, sessionUser, maintenance, bump, saveErrors }) {
  db.exec(`
    create table if not exists duels (
      id integer primary key, a_id integer not null, b_id integer not null, text_id integer not null,
      winner_id integer, a_cpm integer, a_acc integer, b_cpm integer, b_acc integer,
      forfeit integer not null default 0, at integer not null);
    create index if not exists duels_a on duels (a_id);
    create index if not exists duels_b on duels (b_id);
  `);
  try { db.exec('alter table races add column duel integer not null default 0'); } catch {}

  const online = new Map();
  const invites = new Map();
  let queue = [];
  let nextId = 1;

  const card = (c) => ({ handle: c.handle, name: c.name, av: c.av });
  const tell = (c, msg) => c.conn.send(JSON.stringify(msg));
  const fail = (c, error) => tell(c, { t: 'error', error });
  const blocked = (c) => maintenance().on && c.role !== 'admin';
  const rival = (d, c) => (d.a === c ? d.b : d.a);

  function upgrade(req, socket) {
    socket.on('error', () => {});
    const refuse = (line) => socket.end(`HTTP/1.1 ${line}\r\nConnection: close\r\n\r\n`);
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return refuse('400 Bad Request'); }
    if (url.pathname !== '/ws') return refuse('404 Not Found');
    let origin = '';
    try { origin = new URL(req.headers.origin || '').host; } catch {}
    if (!origin || origin !== req.headers.host) return refuse('403 Forbidden');
    const user = sessionUser(req);
    if (!user) return refuse('401 Unauthorized');
    const conn = handshake(req, socket);
    if (!conn) return;
    const old = online.get(user.id);
    if (old) {
      tell(old, { t: 'replaced' });
      old.conn.close(1000);
    }
    const c = { conn, id: user.id, handle: user.handle, name: user.name, av: user.avatar_v, role: user.role,
      state: 'idle', duel: null, outgoing: null, lastInvite: 0 };
    online.set(user.id, c);
    conn.onmessage = (raw) => handle(c, raw);
    conn.onclose = () => gone(c);
    tell(c, { t: 'hello', me: card(c), online: online.size, queued: queue.length });
  }

  function handle(c, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string' || !Object.hasOwn(actions, m.t)) return;
    actions[m.t](c, m);
  }

  const actions = {
    presence(c) {
      tell(c, { t: 'presence', online: online.size, queued: queue.length });
    },

    queue(c) {
      if (c.state === 'queued') return;
      if (c.state !== 'idle') return fail(c, 'Terminá lo que estás haciendo antes de buscar rival.');
      if (blocked(c)) return fail(c, 'Estamos en mantenimiento.');
      c.state = 'queued';
      queue.push(c);
      tell(c, { t: 'queued', waiting: queue.length });
      while (queue.length >= 2) start(queue.shift(), queue.shift());
    },

    unqueue(c) {
      queue = queue.filter((q) => q !== c);
      if (c.state === 'queued') c.state = 'idle';
      tell(c, { t: 'idle' });
    },

    invite(c, m) {
      if (c.state !== 'idle') return fail(c, 'Estás ocupado en este momento.');
      if (blocked(c)) return fail(c, 'Estamos en mantenimiento.');
      const now = Date.now();
      if (now - c.lastInvite < 2000) return fail(c, 'Esperá un momento antes de invitar de nuevo.');
      c.lastInvite = now;
      const row = db.prepare('select id from users where handle = ?').get(String(m.to || '').toLowerCase());
      if (!row) return fail(c, 'No existe ese piloto.');
      if (row.id === c.id) return fail(c, 'No podés invitarte a vos mismo.');
      const target = online.get(row.id);
      if (!target) return fail(c, 'Ese piloto no está conectado ahora.');
      if (target.state === 'duel') return fail(c, 'Ese piloto está en un duelo.');
      if ([...invites.values()].filter((v) => v.to === target).length >= 3) return fail(c, 'Ese piloto tiene muchas invitaciones pendientes.');
      const key = `${c.id}>${target.id}`;
      invites.set(key, { from: c, to: target, timer: setTimeout(() => expire(key), INVITE_MS) });
      c.state = 'inviting';
      c.outgoing = key;
      tell(c, { t: 'invite_sent', to: card(target) });
      tell(target, { t: 'invite', from: card(c) });
    },

    cancel(c) {
      if (c.outgoing) closeInvite(c.outgoing, (inv) => tell(inv.to, { t: 'invite_gone', from: card(c) }));
      tell(c, { t: 'idle' });
    },

    accept(c, m) {
      const from = String(m.from || '').toLowerCase();
      const found = [...invites.entries()].find(([, v]) => v.to === c && v.from.handle === from);
      if (!found) return fail(c, 'Esa invitación ya no está disponible.');
      if (c.state === 'duel') return fail(c, 'Ya estás en un duelo.');
      if (blocked(c)) return fail(c, 'Estamos en mantenimiento.');
      if (c.outgoing) closeInvite(c.outgoing, (inv) => tell(inv.to, { t: 'invite_gone', from: card(c) }));
      closeInvite(found[0]);
      start(found[1].from, c);
    },

    decline(c, m) {
      const from = String(m.from || '').toLowerCase();
      const found = [...invites.entries()].find(([, v]) => v.to === c && v.from.handle === from);
      if (found) closeInvite(found[0], (inv) => tell(inv.from, { t: 'invite_declined', to: card(c) }));
    },

    progress(c, m) {
      const d = c.duel;
      if (!d || d.phase !== 'live' || d.done.has(c.id) || !Number.isInteger(m.n) || m.n < 0) return;
      const cap = Math.floor((Date.now() - d.startAt) * MAX_CPM / 60000) + 10;
      const n = Math.min(m.n, d.body.length, cap);
      if (n <= d.prog.get(c.id)) return;
      d.prog.set(c.id, n);
      const now = Date.now();
      if (now - (d.relayed.get(c.id) || 0) >= 70) {
        d.relayed.set(c.id, now);
        tell(rival(d, c), { t: 'opp', n });
      }
    },

    finish(c, m) {
      const d = c.duel;
      if (!d || d.phase !== 'live' || d.done.has(c.id)) return;
      const len = d.body.length;
      const ms = Date.now() - d.startAt;
      if (len > ms * MAX_CPM / 60000 + 10) return fail(c, 'Resultado inválido.');
      if (!Number.isInteger(m.acc) || m.acc < 0 || m.acc > 100) return fail(c, 'Resultado inválido.');
      const cpm = Math.min(MAX_CPM, Math.max(1, Math.round(len * 60000 / ms)));
      d.prog.set(c.id, len);
      d.done.set(c.id, { ms, cpm, acc: m.acc, chars: m.chars, words: m.words });
      d.order.push(c.id);
      if (d.done.size === 2) return conclude(d);
      tell(rival(d, c), { t: 'opp_done', cpm });
      tell(c, { t: 'wait' });
      later(d, GRACE_MS, () => conclude(d));
    },

    leave(c) {
      abandon(c);
      tell(c, { t: 'idle' });
    },
  };

  function later(d, ms, fn) {
    d.timers.push(setTimeout(() => { if (d.phase !== 'done') fn(); }, ms));
  }

  function closeInvite(key, notice) {
    const inv = invites.get(key);
    if (!inv) return;
    clearTimeout(inv.timer);
    invites.delete(key);
    if (inv.from.outgoing === key) {
      inv.from.outgoing = null;
      if (inv.from.state === 'inviting') inv.from.state = 'idle';
    }
    if (notice) notice(inv);
  }

  function expire(key) {
    closeInvite(key, (inv) => {
      tell(inv.from, { t: 'invite_expired', to: card(inv.to) });
      tell(inv.to, { t: 'invite_gone', from: card(inv.from) });
    });
  }

  function clearInvites(c) {
    for (const [key, inv] of [...invites]) {
      if (inv.from === c) closeInvite(key, () => tell(inv.to, { t: 'invite_gone', from: card(c) }));
      else if (inv.to === c) closeInvite(key, () => tell(inv.from, { t: 'invite_declined', to: card(c), busy: true }));
    }
  }

  function start(a, b) {
    for (const x of [a, b]) {
      clearInvites(x);
      queue = queue.filter((q) => q !== x);
    }
    const row = db.prepare('select id, body from texts where active = 1 order by random() limit 1').get();
    if (!row) {
      for (const x of [a, b]) { x.state = 'idle'; fail(x, 'No hay textos disponibles.'); }
      return;
    }
    const body = row.body.trim().split(/\s+/).join(' ');
    const d = { id: nextId++, a, b, textId: row.id, body, phase: 'count', startAt: 0,
      prog: new Map([[a.id, 0], [b.id, 0]]), done: new Map(), order: [], relayed: new Map(), timers: [] };
    for (const x of [a, b]) {
      x.state = 'duel';
      x.duel = d;
      tell(x, { t: 'match', duel: d.id, opp: card(rival(d, x)), textId: d.textId, text: d.body });
    }
    [1500, 2500, 3500].forEach((ms, i) => later(d, ms, () => both(d, { t: 'count', n: 3 - i })));
    later(d, 4500, () => {
      d.phase = 'live';
      d.startAt = Date.now();
      both(d, { t: 'go' });
      later(d, MAX_RACE_MS, () => conclude(d));
    });
  }

  function both(d, msg) {
    tell(d.a, msg);
    tell(d.b, msg);
  }

  function conclude(d, quit = null) {
    if (d.phase === 'done') return;
    d.phase = 'done';
    d.timers.forEach(clearTimeout);
    const firstId = d.order[0];
    const first = firstId ? (d.a.id === firstId ? d.a : d.b) : null;
    const winner = first || (quit ? rival(d, quit) : null);
    const forfeit = !first && !!quit;
    const [da, dbb] = [d.done.get(d.a.id), d.done.get(d.b.id)];
    if (winner || da || dbb) {
      try {
        const info = db.prepare('insert into duels (a_id, b_id, text_id, winner_id, a_cpm, a_acc, b_cpm, b_acc, forfeit, at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(d.a.id, d.b.id, d.textId, winner ? winner.id : null, da?.cpm ?? null, da?.acc ?? null, dbb?.cpm ?? null, dbb?.acc ?? null, forfeit ? 1 : 0, Date.now());
        const duelId = Number(info.lastInsertRowid);
        const add = db.prepare('insert into races (user_id, text_id, cpm, acc, at, hc, duel) values (?, ?, ?, ?, ?, 0, ?)');
        for (const [x, r] of [[d.a, da], [d.b, dbb]]) {
          if (!r) continue;
          add.run(x.id, d.textId, r.cpm, r.acc, Date.now(), duelId);
          saveErrors(x.id, 'c', r.chars);
          saveErrors(x.id, 'w', r.words);
        }
        bump();
      } catch (err) {
        console.error(err);
      }
    }
    for (const x of [d.a, d.b]) {
      if (x.duel !== d) continue;
      x.state = 'idle';
      x.duel = null;
      const y = rival(d, x);
      tell(x, { t: 'result', win: winner ? winner === x : null, forfeit,
        you: d.done.get(x.id) ? { cpm: d.done.get(x.id).cpm, acc: d.done.get(x.id).acc, ms: d.done.get(x.id).ms } : null,
        opp: d.done.get(y.id) ? { cpm: d.done.get(y.id).cpm, acc: d.done.get(y.id).acc, ms: d.done.get(y.id).ms } : null });
    }
  }

  function abandon(c) {
    queue = queue.filter((q) => q !== c);
    clearInvites(c);
    const d = c.duel;
    if (c.state === 'duel' && d) {
      if (d.phase === 'count') {
        d.phase = 'done';
        d.timers.forEach(clearTimeout);
        const o = rival(d, c);
        o.state = 'idle';
        o.duel = null;
        tell(o, { t: 'cancelled' });
      } else if (d.phase === 'live' && !d.done.has(c.id)) {
        conclude(d, c);
      }
    }
    c.state = 'idle';
    c.duel = null;
  }

  function gone(c) {
    if (online.get(c.id) === c) online.delete(c.id);
    abandon(c);
  }

  return { upgrade };
}
