import { randomInt } from 'node:crypto';

const TICK_MS = 2000;
const ACTIVE = "'jugado','abandono','progreso','desempate','no_presentacion','doble_ausencia','manual'";

// Torneos de eliminación directa. Cada partido es un duelo (server/duels.js).
// Los torneos se crean y administran desde neanbit-type-admin: el panel escribe en estas tablas
// y deja órdenes en `tournament_orders`, que la app lee cada pocos segundos. La app solo expone
// a los jugadores inscribirse, retirarse y consultar.
export function createTournaments({ db, duels, maintenance, bump, earnedMedal }) {
  db.exec(`
    create table if not exists tournaments (
      id integer primary key, name text not null, description text not null default '',
      status text not null default 'borrador', size integer not null default 8,
      access text not null default '{"mode":"open"}', starts_at integer not null default 0,
      ready_secs integer not null default 180, text_id integer not null default 0,
      rounds integer not null default 0, winner_id integer, created_at integer not null,
      finished_at integer not null default 0);
    create table if not exists tournament_players (
      tournament_id integer not null, user_id integer not null, seed integer not null default 0,
      source text not null default 'self', status text not null default 'activo',
      out_round integer not null default 0, joined_at integer not null,
      primary key (tournament_id, user_id));
    create index if not exists tp_user on tournament_players (user_id);
    create table if not exists tournament_matches (
      id integer primary key, tournament_id integer not null, round integer not null, slot integer not null,
      a_id integer, b_id integer, a_ready integer not null default 0, b_ready integer not null default 0,
      status text not null default 'pending', result text not null default '', winner_id integer,
      duel_id integer, deadline integer not null default 0, replays integer not null default 0,
      unique (tournament_id, round, slot));
    create index if not exists tm_duel on tournament_matches (duel_id);
    create table if not exists tournament_orders (
      id integer primary key, tournament_id integer not null, kind text not null,
      user_id integer not null default 0, match_id integer not null default 0,
      created_at integer not null, done_at integer not null default 0, result text not null default '');
    create index if not exists to_open on tournament_orders (done_at);
  `);

  const now = () => Date.now();
  const tget = (id) => db.prepare('select * from tournaments where id = ?').get(id);
  const mget = (id) => db.prepare('select * from tournament_matches where id = ?').get(id);
  const pstatus = (tid, uid) => db.prepare('select status from tournament_players where tournament_id = ? and user_id = ?').get(tid, uid)?.status || null;
  const seedOf = (tid, uid) => db.prepare('select seed from tournament_players where tournament_id = ? and user_id = ?').get(tid, uid)?.seed || 9999;
  const card = (id) => (id ? db.prepare('select handle, name, avatar_v as av from users where id = ?').get(id) || null : null);

  let depth = 0;
  function tx(fn) {
    if (depth) return fn();
    depth++;
    db.exec('begin immediate');
    try {
      const out = fn();
      db.exec('commit');
      return out;
    } catch (err) {
      try { db.exec('rollback'); } catch {}
      throw err;
    } finally {
      depth--;
    }
  }

  function push(userId, msg) {
    const c = duels.online.get(userId);
    if (c) c.conn.send(JSON.stringify(msg));
  }

  const higherSeed = (tid, a, b) => (seedOf(tid, a) <= seedOf(tid, b) ? a : b);

  // ---------- Acceso ----------

  function parseAccess(raw) {
    let a = {};
    try { a = JSON.parse(raw) || {}; } catch {}
    return {
      mode: ['open', 'rules', 'list'].includes(a.mode) ? a.mode : 'open',
      minCpm: Math.max(0, Math.floor(Number(a.minCpm) || 0)),
      medal: typeof a.medal === 'string' ? a.medal.slice(0, 60) : '',
    };
  }

  function publicAccess(t) {
    const a = parseAccess(t.access);
    const out = { mode: a.mode };
    if (a.mode !== 'rules') return out;
    if (a.minCpm) out.minCpm = a.minCpm;
    if (a.medal) {
      const m = db.prepare('select name, secret from medals where id = ?').get(a.medal);
      out.medal = m && !m.secret ? { name: m.name } : { hidden: true };
    }
    return out;
  }

  function playerCount(tid) {
    return db.prepare("select count(*) as n from tournament_players where tournament_id = ? and status != 'descalificado'").get(tid).n;
  }

  function eligibility(t, uid) {
    if (t.status !== 'inscripcion') return { ok: false, reason: 'La inscripción no está abierta.' };
    const status = pstatus(t.id, uid);
    if (status === 'descalificado') return { ok: false, reason: 'Fuiste descalificado de este torneo.' };
    if (status) return { ok: false, reason: 'Ya estás inscripto.' };
    if (playerCount(t.id) >= t.size) return { ok: false, reason: 'El torneo está completo.' };
    const a = parseAccess(t.access);
    if (a.mode === 'list') return { ok: false, reason: 'Este torneo es solo por invitación.' };
    if (a.mode === 'rules') {
      if (a.minCpm) {
        const best = db.prepare('select coalesce(max(cpm), 0) as b from races where user_id = ? and hc = 0').get(uid).b;
        if (best < a.minCpm) return { ok: false, reason: `Necesitás un récord de al menos ${a.minCpm} CPM (${Math.round(a.minCpm / 5)} WPM).` };
      }
      if (a.medal && !earnedMedal(uid, a.medal)) return { ok: false, reason: 'No cumplís los requisitos de acceso de este torneo.' };
    }
    return { ok: true, reason: '' };
  }

  // ---------- Llave ----------

  function bracketOrder(size) {
    let order = [1];
    while (order.length < size) order = order.flatMap((x) => [x, order.length * 2 + 1 - x]);
    return order;
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function startTournament(t) {
    if (t.status !== 'inscripcion') return 'El torneo no está en inscripción.';
    const players = db.prepare("select user_id from tournament_players where tournament_id = ? and status = 'activo'").all(t.id).map((r) => r.user_id);
    if (players.length < 2) return 'Hacen falta al menos 2 jugadores.';
    shuffle(players);
    let size = 2;
    while (size < players.length) size *= 2;
    const rounds = Math.log2(size);
    const setSeed = db.prepare('update tournament_players set seed = ? where tournament_id = ? and user_id = ?');
    players.forEach((id, i) => setSeed.run(i + 1, t.id, id));
    const order = bracketOrder(size);
    const add = db.prepare('insert into tournament_matches (tournament_id, round, slot, a_id, b_id) values (?, ?, ?, ?, ?)');
    for (let r = 1; r <= rounds; r++) {
      for (let s = 0; s < size / 2 ** r; s++) {
        const a = r === 1 ? players[order[2 * s] - 1] ?? null : null;
        const b = r === 1 ? players[order[2 * s + 1] - 1] ?? null : null;
        add.run(t.id, r, s, a, b);
      }
    }
    db.prepare("update tournaments set status = 'en_curso', rounds = ? where id = ?").run(rounds, t.id);
    const first = db.prepare('select id from tournament_matches where tournament_id = ? and round = 1 order by slot').all(t.id);
    for (const { id } of first) settle(id);
    for (const id of players) push(id, { t: 't_info', tid: t.id, name: t.name, event: 'start' });
    bump();
    return null;
  }

  function cancelTournament(t) {
    if (!['inscripcion', 'en_curso'].includes(t.status)) return 'El torneo ya terminó.';
    db.prepare("update tournaments set status = 'cancelado', finished_at = ? where id = ?").run(now(), t.id);
    const live = db.prepare("select * from tournament_matches where tournament_id = ? and status = 'live'").all(t.id);
    for (const m of live) { duels.kick(m.a_id); duels.kick(m.b_id); }
    const all = db.prepare("select user_id from tournament_players where tournament_id = ? and status != 'descalificado'").all(t.id);
    for (const { user_id } of all) push(user_id, { t: 't_info', tid: t.id, name: t.name, event: 'cancelled' });
    bump();
    return null;
  }

  // Decide un partido cuando se conocen sus dos lugares.
  function settle(id) {
    const m = mget(id);
    if (!m || m.status !== 'pending') return;
    if (m.round > 1) {
      const done = db.prepare("select count(*) as n from tournament_matches where tournament_id = ? and round = ? and slot in (?, ?) and status = 'done'")
        .get(m.tournament_id, m.round - 1, m.slot * 2, m.slot * 2 + 1).n;
      if (done < 2) return;
    }
    const active = (uid) => (uid && pstatus(m.tournament_id, uid) === 'activo' ? uid : null);
    const a = active(m.a_id);
    const b = active(m.b_id);
    if (a && b) return makeReady(m);
    if (a || b) return finishMatch(m, a || b, (m.a_id && !a) || (m.b_id && !b) ? 'descalificacion' : 'pase');
    finishMatch(m, null, 'vacio');
  }

  function makeReady(m) {
    const t = tget(m.tournament_id);
    db.prepare("update tournament_matches set status = 'ready', a_ready = 0, b_ready = 0, deadline = ? where id = ?").run(now() + t.ready_secs * 1000, m.id);
    announce(mget(m.id));
  }

  function finishMatch(m, winnerId, result, duelId = null) {
    const t = tget(m.tournament_id);
    db.prepare("update tournament_matches set status = 'done', winner_id = ?, result = ?, duel_id = coalesce(?, duel_id), a_ready = 0, b_ready = 0 where id = ?")
      .run(winnerId, result, duelId, m.id);
    const loser = winnerId ? (m.a_id === winnerId ? m.b_id : m.a_id) : null;
    if (loser) {
      db.prepare("update tournament_players set status = 'eliminado', out_round = ? where tournament_id = ? and user_id = ? and status = 'activo'").run(m.round, t.id, loser);
      if (pstatus(t.id, loser) === 'eliminado') push(loser, { t: 't_info', tid: t.id, name: t.name, event: 'out', round: m.round, rounds: t.rounds });
    }
    if (m.round < t.rounds) {
      if (winnerId) {
        db.prepare(`update tournament_matches set ${m.slot % 2 === 0 ? 'a_id' : 'b_id'} = ? where tournament_id = ? and round = ? and slot = ?`)
          .run(winnerId, t.id, m.round + 1, m.slot >> 1);
        push(winnerId, { t: 't_info', tid: t.id, name: t.name, event: result === 'pase' ? 'bye' : 'advance', round: m.round + 1, rounds: t.rounds });
      }
      const next = db.prepare('select id from tournament_matches where tournament_id = ? and round = ? and slot = ?').get(t.id, m.round + 1, m.slot >> 1);
      if (next) settle(next.id);
    } else {
      db.prepare("update tournaments set status = 'finalizado', winner_id = ?, finished_at = ? where id = ?").run(winnerId, now(), t.id);
      if (winnerId) push(winnerId, { t: 't_info', tid: t.id, name: t.name, event: 'champion' });
    }
    bump();
  }

  // ---------- Partidos en vivo ----------

  function matchPayload(m, uid) {
    const t = tget(m.tournament_id);
    const isA = uid === m.a_id;
    return {
      t: 't_match', tid: t.id, mid: m.id, name: t.name, round: m.round, rounds: t.rounds,
      opp: card(isA ? m.b_id : m.a_id), left: Math.max(0, m.deadline - now()), status: m.status,
      me: !!(isA ? m.a_ready : m.b_ready), oppReady: !!(isA ? m.b_ready : m.a_ready),
    };
  }

  function announce(m) {
    for (const id of [m.a_id, m.b_id]) if (id) push(id, matchPayload(m, id));
  }

  function startMatch(m) {
    const t = tget(m.tournament_id);
    const ok = duels.startTournamentDuel(m.a_id, m.b_id, {
      textId: t.text_id,
      tm: { tid: t.id, mid: m.id, name: t.name, round: m.round, rounds: t.rounds },
      onDone: (info) => onDuelDone(m.id, info),
    });
    if (ok) db.prepare("update tournament_matches set status = 'live' where id = ?").run(m.id);
    else announce(mget(m.id));
  }

  function onDuelDone(mid, info) {
    tx(() => {
      const m = mget(mid);
      if (!m || m.status !== 'live') return;
      const t = tget(m.tournament_id);
      if (!t || t.status !== 'en_curso') return;
      const a = m.a_id;
      const b = m.b_id;
      let winner = null;
      let result = 'jugado';
      if (info.cancelled) {
        winner = info.quitId === a ? b : a;
        result = 'abandono';
      } else if (info.winnerId) {
        winner = info.winnerId;
        result = info.forfeit ? 'abandono' : 'jugado';
      } else {
        const pa = info.prog?.[a] ?? 0;
        const pb = info.prog?.[b] ?? 0;
        if (pa !== pb) { winner = pa > pb ? a : b; result = 'progreso'; }
      }
      const out = (id) => pstatus(t.id, id) === 'descalificado';
      if (out(a) && out(b)) return finishMatch(m, null, 'vacio', info.duelId ?? null);
      if (out(a) !== out(b)) { winner = out(a) ? b : a; result = 'descalificacion'; }
      if (!winner) {
        if (m.replays >= 1) {
          winner = higherSeed(t.id, a, b);
          result = 'desempate';
        } else {
          db.prepare("update tournament_matches set status = 'ready', replays = replays + 1, a_ready = 0, b_ready = 0, deadline = ? where id = ?")
            .run(now() + t.ready_secs * 1000, m.id);
          announce(mget(m.id));
          return;
        }
      }
      finishMatch(m, winner, result, info.duelId ?? null);
    });
  }

  duels.hooks.open = (c) => {
    const rows = db.prepare("select * from tournament_matches where status = 'ready' and (a_id = ? or b_id = ?)").all(c.id, c.id);
    for (const m of rows) push(c.id, matchPayload(m, c.id));
  };

  duels.hooks.close = (c) => {
    const current = duels.online.get(c.id);
    if (current && current !== c) return;
    const rows = db.prepare("select * from tournament_matches where status = 'ready' and ((a_id = ? and a_ready = 1) or (b_id = ? and b_ready = 1))").all(c.id, c.id);
    for (const m of rows) {
      db.prepare(`update tournament_matches set ${m.a_id === c.id ? 'a_ready' : 'b_ready'} = 0 where id = ?`).run(m.id);
      announce(mget(m.id));
    }
  };

  duels.hooks.actions.t_ready = (c, msg) => {
    const fail = (error) => push(c.id, { t: 'error', error });
    const mid = Number(msg.mid);
    const m = Number.isInteger(mid) ? mget(mid) : null;
    if (!m || m.status !== 'ready' || (m.a_id !== c.id && m.b_id !== c.id)) return fail('Ese partido ya no está disponible.');
    const t = tget(m.tournament_id);
    if (!t || t.status !== 'en_curso') return fail('Ese torneo ya no está en curso.');
    if (maintenance().on && c.role !== 'admin') return fail('Estamos en mantenimiento.');
    if (!duels.free(c)) return fail('Terminá lo que estás haciendo antes de jugar el partido.');
    tx(() => {
      db.prepare(`update tournament_matches set ${m.a_id === c.id ? 'a_ready' : 'b_ready'} = 1 where id = ?`).run(m.id);
      const fresh = mget(m.id);
      if (fresh.a_ready && fresh.b_ready) startMatch(fresh);
      else announce(fresh);
    });
  };

  // ---------- Órdenes del panel ----------

  function applyOrder(o) {
    const t = tget(o.tournament_id);
    if (!t) return 'No existe ese torneo.';
    const user = o.user_id ? db.prepare('select id, handle from users where id = ?').get(o.user_id) : null;
    switch (o.kind) {
      case 'start': return startTournament(t) || 'ok';
      case 'cancel': return cancelTournament(t) || 'ok';
      case 'add': {
        if (t.status !== 'inscripcion') return 'Solo se puede agregar antes de empezar.';
        if (!user) return 'No existe ese usuario.';
        const status = pstatus(t.id, user.id);
        if (status === 'activo') return 'Ya está inscripto.';
        if (!status && playerCount(t.id) >= t.size) return 'El torneo está completo.';
        if (status) db.prepare("update tournament_players set status = 'activo', source = 'admin' where tournament_id = ? and user_id = ?").run(t.id, user.id);
        else db.prepare("insert into tournament_players (tournament_id, user_id, source, joined_at) values (?, ?, 'admin', ?)").run(t.id, user.id, now());
        return 'ok';
      }
      case 'remove': {
        if (t.status !== 'inscripcion') return 'Solo se puede quitar antes de empezar.';
        db.prepare('delete from tournament_players where tournament_id = ? and user_id = ?').run(t.id, o.user_id);
        return 'ok';
      }
      case 'dq': {
        if (!user || !pstatus(t.id, user.id)) return 'Ese usuario no está en el torneo.';
        db.prepare("update tournament_players set status = 'descalificado' where tournament_id = ? and user_id = ?").run(t.id, user.id);
        push(user.id, { t: 't_info', tid: t.id, name: t.name, event: 'dq' });
        if (t.status !== 'en_curso') return 'ok';
        const open = db.prepare("select * from tournament_matches where tournament_id = ? and status in ('ready', 'live') and (a_id = ? or b_id = ?)").all(t.id, user.id, user.id);
        for (const m of open) {
          if (m.status === 'live') duels.kick(user.id);
          const fresh = mget(m.id);
          if (fresh.status !== 'done') finishMatch(fresh, m.a_id === user.id ? m.b_id : m.a_id, 'descalificacion');
        }
        return 'ok';
      }
      case 'advance': {
        const m = mget(o.match_id);
        if (!m || m.tournament_id !== t.id) return 'No existe ese partido.';
        if (!user || (m.a_id !== user.id && m.b_id !== user.id)) return 'Ese usuario no juega ese partido.';
        if (!['ready', 'live'].includes(m.status)) return 'El partido no está pendiente.';
        if (m.status === 'live') duels.kick(m.a_id === user.id ? m.b_id : m.a_id);
        const fresh = mget(m.id);
        if (fresh.status !== 'done') finishMatch(fresh, user.id, 'manual');
        return 'ok';
      }
      default: return 'Orden desconocida.';
    }
  }

  function processOrders() {
    const rows = db.prepare('select * from tournament_orders where done_at = 0 order by id limit 50').all();
    for (const o of rows) {
      let result = 'ok';
      try {
        result = applyOrder(o) || 'ok';
      } catch (err) {
        console.error(err);
        result = 'Error interno.';
      }
      db.prepare('update tournament_orders set done_at = ?, result = ? where id = ?').run(now(), result, o.id);
    }
  }

  let paused = false;
  function tick() {
    if (maintenance().on) { paused = true; return; }
    try {
      tx(() => {
        const t = now();
        if (paused) {
          paused = false;
          db.prepare("update tournament_matches set deadline = ? where status = 'ready' and deadline < ?").run(t + 60000, t + 60000);
        }
        processOrders();
        const start = db.prepare("select * from tournaments where status = 'inscripcion' and starts_at > 0 and starts_at <= ?").all(t);
        for (const x of start) startTournament(x);
        const open = db.prepare("select m.* from tournament_matches m join tournaments x on x.id = m.tournament_id where m.status = 'ready' and x.status = 'en_curso'").all();
        for (const m of open) {
          if (m.a_ready && m.b_ready) {
            startMatch(m);
            if (mget(m.id).status === 'ready') db.prepare('update tournament_matches set deadline = ? where id = ?').run(t + 30000, m.id);
          } else if (m.deadline > 0 && m.deadline <= t) {
            if (m.a_ready) finishMatch(m, m.a_id, 'no_presentacion');
            else if (m.b_ready) finishMatch(m, m.b_id, 'no_presentacion');
            else finishMatch(m, higherSeed(m.tournament_id, m.a_id, m.b_id), 'doble_ausencia');
          }
        }
      });
    } catch (err) {
      console.error(err);
    }
  }

  // Tras un reinicio, los partidos que estaban jugándose vuelven a la espera con tiempo nuevo.
  db.prepare(`update tournament_matches set status = 'ready', a_ready = 0, b_ready = 0,
    deadline = ? + (select ready_secs from tournaments x where x.id = tournament_id) * 1000 where status = 'live'`).run(now());
  setInterval(tick, TICK_MS).unref();

  // ---------- Consultas públicas ----------

  const view = (t, uid) => {
    const winner = t.winner_id ? card(t.winner_id) : null;
    const row = uid ? db.prepare('select status from tournament_players where tournament_id = ? and user_id = ?').get(t.id, uid) : null;
    return {
      id: t.id, name: t.name, description: t.description, status: t.status, size: t.size, rounds: t.rounds,
      players: playerCount(t.id), startsAt: t.starts_at, readySecs: t.ready_secs, finishedAt: t.finished_at,
      access: publicAccess(t), winner,
      mine: row ? { status: row.status } : null,
      can: uid && !row ? eligibility(t, uid) : null,
    };
  };

  function list(me) {
    const live = db.prepare("select * from tournaments where status in ('inscripcion', 'en_curso') order by case status when 'en_curso' then 0 else 1 end, case when starts_at > 0 then starts_at else created_at end, id").all();
    const past = db.prepare("select * from tournaments where status in ('finalizado', 'cancelado') order by finished_at desc, id desc limit 20").all();
    return [...live, ...past].map((t) => view(t, me?.id));
  }

  function detail(id, me) {
    const t = tget(id);
    if (!t || t.status === 'borrador') return null;
    const people = db.prepare(`select p.user_id as id, p.seed, p.status, p.out_round as outRound, u.handle, u.name, u.avatar_v as av
      from tournament_players p join users u on u.id = p.user_id where p.tournament_id = ? order by case when p.seed > 0 then p.seed else 9999 end, p.joined_at`).all(t.id);
    const byId = new Map(people.map((p) => [p.id, p]));
    const who = (uid) => {
      const p = uid ? byId.get(uid) : null;
      return p ? { handle: p.handle, name: p.name, av: p.av, seed: p.seed, status: p.status } : null;
    };
    const matches = db.prepare(`select m.id, m.round, m.slot, m.a_id, m.b_id, m.winner_id, m.status, m.result, m.deadline,
      d.a_cpm, d.b_cpm from tournament_matches m left join duels d on d.id = m.duel_id where m.tournament_id = ? order by m.round, m.slot`).all(t.id)
      .map((m) => ({ id: m.id, round: m.round, slot: m.slot, a: who(m.a_id), b: who(m.b_id), winner: m.winner_id ? who(m.winner_id)?.handle : null,
        status: m.status, result: m.result, deadline: m.deadline, aCpm: m.a_cpm, bCpm: m.b_cpm }));
    const out = { ...view(t, me?.id), players: people.map((p) => ({ handle: p.handle, name: p.name, av: p.av, seed: p.seed, status: p.status, outRound: p.outRound })),
      count: playerCount(t.id), matches, now: null };
    if (me) {
      const m = db.prepare("select * from tournament_matches where tournament_id = ? and status in ('ready', 'live') and (a_id = ? or b_id = ?)").get(t.id, me.id, me.id);
      if (m) out.now = matchPayload(m, me.id);
    }
    return out;
  }

  function join(id, me) {
    const t = tget(id);
    if (!t || t.status === 'borrador') return { status: 404, body: { error: 'No existe ese torneo.' } };
    return tx(() => {
      const can = eligibility(t, me.id);
      if (!can.ok) return { status: 403, body: { error: can.reason } };
      db.prepare("insert into tournament_players (tournament_id, user_id, source, joined_at) values (?, ?, 'self', ?)").run(t.id, me.id, now());
      bump();
      return { status: 200, body: { ok: true } };
    });
  }

  function leave(id, me) {
    const t = tget(id);
    if (!t) return { status: 404, body: { error: 'No existe ese torneo.' } };
    if (t.status !== 'inscripcion') return { status: 403, body: { error: 'Ya no podés retirarte: el torneo empezó.' } };
    if (pstatus(t.id, me.id) !== 'activo') return { status: 403, body: { error: 'No estás inscripto.' } };
    db.prepare('delete from tournament_players where tournament_id = ? and user_id = ?').run(t.id, me.id);
    bump();
    return { status: 200, body: { ok: true } };
  }

  // ---------- Estadísticas ----------

  function summary(userId, recent = 0) {
    const entered = db.prepare("select count(*) as n from tournament_players p join tournaments t on t.id = p.tournament_id where p.user_id = ? and p.seed > 0 and t.status in ('en_curso', 'finalizado')").get(userId).n;
    const titles = db.prepare('select count(*) as n from tournaments where winner_id = ?').get(userId).n;
    const finals = db.prepare(`select count(distinct m.tournament_id) as n from tournament_matches m join tournaments t on t.id = m.tournament_id
      where m.round = t.rounds and m.a_id is not null and m.b_id is not null and (m.a_id = ? or m.b_id = ?)`).get(userId, userId).n;
    const rows = db.prepare(`select m.winner_id, m.a_id, m.round, t.rounds, t.name as tname, d.a_cpm, d.b_cpm, d.a_acc, d.b_acc, d.at, u.handle, u.name
      from tournament_matches m join tournaments t on t.id = m.tournament_id join users u on u.id = case when m.a_id = ? then m.b_id else m.a_id end
      left join duels d on d.id = m.duel_id
      where m.status = 'done' and m.a_id is not null and m.b_id is not null and (m.a_id = ? or m.b_id = ?) and m.result in (${ACTIVE})
      order by m.id desc`).all(userId, userId, userId);
    const mine = (r, a, b) => (r.a_id === userId ? r[a] : r[b]);
    const speeds = rows.map((r) => mine(r, 'a_cpm', 'b_cpm')).filter((v) => v !== null && v !== undefined);
    const accs = rows.map((r) => mine(r, 'a_acc', 'b_acc')).filter((v) => v !== null && v !== undefined);
    const wins = rows.filter((r) => r.winner_id === userId).length;
    let streak = 0;
    while (streak < rows.length && rows[streak].winner_id === userId) streak++;
    let best = 0;
    let run = 0;
    for (const r of [...rows].reverse()) { run = r.winner_id === userId ? run + 1 : 0; best = Math.max(best, run); }
    const mean = (list) => (list.length ? Math.round(list.reduce((a, v) => a + v, 0) / list.length) : 0);
    const far = db.prepare(`select m.round, t.rounds from tournament_matches m join tournaments t on t.id = m.tournament_id
      where (m.a_id = ? or m.b_id = ?) and t.status in ('en_curso', 'finalizado') order by (t.rounds - m.round) asc, m.round desc limit 1`).get(userId, userId);
    const out = {
      entered, titles, finals, total: rows.length, wins, losses: rows.length - wins,
      rate: rows.length ? Math.round((wins / rows.length) * 100) : 0, streak, bestStreak: best,
      best: Math.max(0, ...speeds), avg: mean(speeds), acc: mean(accs),
      bestRound: far ? { round: far.round, rounds: far.rounds, champion: titles > 0 } : null,
    };
    if (recent) {
      out.recent = rows.slice(0, recent).map((r) => ({
        tournament: r.tname, round: r.round, rounds: r.rounds, handle: r.handle, name: r.name,
        win: r.winner_id === userId, cpm: mine(r, 'a_cpm', 'b_cpm') ?? null, rcpm: mine(r, 'b_cpm', 'a_cpm') ?? null, at: r.at ?? null,
      }));
    }
    return out;
  }

  const raceFilter = 'duel in (select duel_id from tournament_matches where duel_id is not null)';

  function races(userId) {
    return db.prepare(`select cpm, acc, at, text_id, hc from races where user_id = ? and hc = 0 and ${raceFilter} order by at desc limit 100`).all(userId).reverse();
  }

  function raceTotals(userId) {
    return db.prepare(`select coalesce(round(avg(acc)), 0) as acc, min(at) as since, count(*) as n, coalesce(max(cpm), 0) as best
      from races where user_id = ? and hc = 0 and ${raceFilter}`).get(userId);
  }

  function ranking() {
    return db.prepare(`select * from (
      select u.handle, u.name, u.avatar_v as av, u.verified,
        (select count(*) from tournaments t where t.winner_id = u.id) as titles,
        (select count(*) from tournament_matches m where m.winner_id = u.id and m.a_id is not null and m.b_id is not null and m.result in (${ACTIVE})) as wins,
        (select count(*) from tournament_players p join tournaments t on t.id = p.tournament_id where p.user_id = u.id and p.seed > 0 and t.status in ('en_curso', 'finalizado')) as played,
        u.id as uid from users u)
      where played > 0 order by titles desc, wins desc, uid`).all();
  }

  return { list, detail, join, leave, summary, races, raceTotals, ranking, tick };
}
