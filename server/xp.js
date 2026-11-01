// Experiencia (XP): se guarda al ocurrir, con el multiplicador vigente en ese momento. Archivo compartido con el panel
// (neanbit-type-admin): los dos deben ser idénticos.
//
//   races.xp         XP de cada carrera (fija: cambiar un valor global no recalcula el pasado)
//   xp_events        todo lo que no es una carrera: duelo ganado, torneo ganado, ajustes manuales (con motivo)
//   xp_boosters      multiplicadores con inicio y fin, globales (user_id 0) o para un usuario
//   users.xp         total (carreras + eventos), para no recorrer el historial en cada consulta
import { cleanProgress, countsOf, levelFrom, levelOfXp } from './levels.js';

export const REASONS = {
  manual: 'Ajuste manual', migrado: 'Ajuste anterior', duel: 'Duelo ganado', tourney: 'Torneo ganado',
  tourney_final: 'Finalista de torneo', tourney_semi: 'Semifinalista de torneo', tourney_part: 'Participación en torneo',
};

const col = (db, table, name) => db.prepare(`pragma table_info(${table})`).all().some((c) => c.name === name);
const tableExists = (db, name) => !!db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(name);

// ¿Ya existe todo lo que necesita el panel? La app lo crea al arrancar.
export const xpReady = (db) => col(db, 'users', 'xp') && col(db, 'races', 'xp') && tableExists(db, 'xp_events') && tableExists(db, 'xp_boosters');

export function createXp({ db, setting }) {
  const cfg = () => cleanProgress(setting('progress'));

  // Multiplicador vigente: el más alto entre los potenciadores activos (global o del usuario). No se acumulan.
  function multFor(userId, at = Date.now()) {
    const m = db.prepare('select max(mult) as m from xp_boosters where starts <= ? and ends > ? and (user_id = 0 or user_id = ?)').get(at, at, userId)?.m;
    return m > 1 ? m : 1;
  }

  const credit = (userId, amount) => db.prepare('update users set xp = xp + ? where id = ?').run(amount, userId);

  // XP de una carrera que se está guardando. Quien llama la guarda en races.xp y después llama a credit().
  function race(userId, hc, acc, at = Date.now()) {
    const p = cfg();
    const mult = multFor(userId, at);
    return { xp: Math.round(((hc ? p.xp.hc : p.xp.race) + (acc === 100 ? p.xp.perfect : 0)) * mult), mult };
  }

  // Un evento. El índice único (usuario, motivo, ref) evita acreditar dos veces el mismo duelo o torneo.
  function add(userId, amount, reason, { ref = 0, note = '', mult = 1, at = Date.now() } = {}) {
    amount = Math.trunc(amount);
    if (!amount || !Number.isFinite(amount)) return 0;
    const r = db.prepare('insert or ignore into xp_events (user_id, amount, reason, ref, note, mult, at) values (?, ?, ?, ?, ?, ?, ?)')
      .run(userId, amount, reason, ref, String(note).slice(0, 120), mult, at);
    if (!r.changes) return 0;
    credit(userId, amount);
    return amount;
  }

  // XP de un duelo ganado ('duel') o de un puesto de torneo ('tourney', 'tourney_final', 'tourney_semi', 'tourney_part').
  // Sin `base` usa el valor global del panel; los torneos pasan el suyo, ya resuelto.
  function event(userId, kind, ref, at = Date.now(), base = null) {
    const mult = multFor(userId, at);
    return add(userId, Math.round((base ?? cfg().xp[kind]) * mult), kind, { ref, mult, at });
  }

  // Ajuste manual acumulado (lo que el panel muestra como «ajuste de XP»).
  const manualOf = (userId) => db.prepare("select coalesce(sum(amount), 0) as n from xp_events where user_id = ? and reason in ('manual', 'migrado')").get(userId).n;

  // Recalcula users.xp desde las fuentes (carreras + eventos). Sin id, para todos.
  function reconcile(userId = null) {
    const where = userId == null ? '' : 'where id = ?';
    db.prepare(`update users set xp = coalesce((select sum(xp) from races where races.user_id = users.id), 0)
      + coalesce((select sum(amount) from xp_events where xp_events.user_id = users.id), 0) ${where}`).run(...(userId == null ? [] : [userId]));
  }

  const totalOf = (userId) => Math.max(0, db.prepare('select xp from users where id = ?').get(userId)?.xp || 0);
  const levelOf = (userId) => levelOfXp(totalOf(userId), setting('progress'));

  return { cfg, multFor, credit, race, add, event, manualOf, reconcile, totalOf, levelOf };
}

// Solo la app lo llama, al arrancar: crea las tablas y columnas, y migra una única vez lo ya guardado.
export function setupXp(db, setting) {
  db.exec(`
    create table if not exists xp_events (
      id integer primary key, user_id integer not null, amount integer not null, reason text not null,
      ref integer not null default 0, note text not null default '', mult real not null default 1, at integer not null);
    create index if not exists xp_events_user on xp_events (user_id, at);
    create unique index if not exists xp_events_ref on xp_events (user_id, reason, ref) where ref > 0;
    create table if not exists xp_boosters (
      id integer primary key, name text not null, mult real not null, user_id integer not null default 0,
      starts integer not null, ends integer not null, created integer not null);
  `);
  for (const sql of ['alter table users add column xp integer not null default 0', 'alter table races add column xp integer not null default 0']) {
    try { db.exec(sql); } catch {}
  }
  const xp = createXp({ db, setting });
  if (!db.prepare("select 1 from settings where key = 'xp_v2'").get()) {
    const p = xp.cfg();
    const legacy = tableExists(db, 'duels'); // sin la tabla de duelos es una base nueva: no hay nada que migrar ni comparar
    const old = !legacy ? null : new Map(db.prepare('select id from users').all().map((u) => [u.id, levelFrom(countsOf(db, u.id), setting('progress'), db.prepare('select xp_bonus from users where id = ?').get(u.id).xp_bonus).xp]));
    db.exec('begin');
    try {
      // Las cuentas son enteros ya limpios por cleanProgress, por eso van directo al SQL (los números de JS entrarían como decimales).
      db.exec(`update races set xp = (case when hc = 1 then ${p.xp.hc} else ${p.xp.race} end) + (case when acc = 100 then ${p.xp.perfect} else 0 end)`);
      if (legacy) db.exec(`insert or ignore into xp_events (user_id, amount, reason, ref, at) select winner_id, ${p.xp.duel}, 'duel', id, at from duels where winner_id is not null`);
      if (tableExists(db, 'tournaments')) {
        db.exec(`insert or ignore into xp_events (user_id, amount, reason, ref, at) select winner_id, ${p.xp.tourney}, 'tourney', id,
          case when finished_at > 0 then finished_at else created_at end from tournaments where winner_id is not null`);
      }
      db.exec("insert into xp_events (user_id, amount, reason, note, at) select id, xp_bonus, 'migrado', 'Ajuste manual anterior', created from users where xp_bonus != 0");
      xp.reconcile();
      // Comprobación: el total nuevo tiene que coincidir con el cálculo anterior para todos. Si no, no se migra nada.
      for (const u of old ? db.prepare('select id, xp from users').all() : []) {
        if (Math.max(0, u.xp) !== old.get(u.id)) throw new Error(`La migración de XP no coincide para el usuario ${u.id} (${u.xp} contra ${old.get(u.id)}).`);
      }
      db.prepare("insert into settings (key, value) values ('xp_v2', ?)").run(JSON.stringify({ at: Date.now() }));
      db.exec('commit');
    } catch (err) {
      try { db.exec('rollback'); } catch {}
      throw err;
    }
  } else {
    xp.reconcile();
  }
  return xp;
}
