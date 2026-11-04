// Camino de niveles: casilleros con premios que se reclaman a mano. Archivo compartido con el panel (neanbit-type-admin):
// los dos deben ser idénticos. La app crea las tablas y reclama; el panel arma los casilleros.
//
//   tracks         caminos guardados; uno solo está activo (active = 1)
//   track_slots    casilleros: nivel, tipo (reward cosmético, booster potenciador, xp), payload (JSON validado), vencimiento y opción retroactiva
//   track_claims   (usuario, casillero): lo que cada persona ya reclamó. La clave primaria hace el reclamo idempotente
//   track_blocked  (casillero, usuario): quienes ya estaban en ese nivel o por encima cuando se creó un casillero NO retroactivo
//
// Nada de lo reclamado se quita: si después se apaga o se borra el casillero, el premio se conserva.
import { xpAtLevel } from './levels.js';
import { grant } from './rewards.js';

export const SLOT_KINDS = ['reward', 'booster', 'xp'];
export const LIMITS = { maxLevel: 999, perLevel: 6, slots: 500, days: 3650, hoursMax: 720, xpMax: 10000, multMin: 1.1, multMax: 10 };

const KIND_NAME = { frame: 'Marco', name: 'Efecto de nombre', cover: 'Portada', palette: 'Paleta' };
const RARITY_NAME = { comun: 'común', rara: 'rara', epica: 'épica', legendaria: 'legendaria' };
const HOUR = 3600000;
const DAY = 86400000;

export function ensureTrackSchema(db) {
  db.exec(`
    create table if not exists tracks (
      id integer primary key, name text not null, active integer not null default 0, created integer not null);
    create table if not exists track_slots (
      id integer primary key, track_id integer not null, level integer not null, pos integer not null default 0,
      kind text not null, payload text not null, enabled integer not null default 1,
      until integer not null default 0, retro integer not null default 0, created integer not null);
    create index if not exists track_slots_by_track on track_slots (track_id, level, pos);
    create table if not exists track_claims (
      user_id integer not null, slot_id integer not null, at integer not null, expires integer not null default 0,
      primary key (user_id, slot_id));
    create index if not exists track_claims_by_slot on track_claims (slot_id);
    create table if not exists track_blocked (
      slot_id integer not null, user_id integer not null, primary key (slot_id, user_id));
  `);
}

export const trackReady = (db) => !!db.prepare("select 1 from sqlite_master where type = 'table' and name = 'track_slots'").get();

const parse = (raw) => { try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : NaN);

export const activeTrack = (db) => db.prepare('select id, name from tracks where active = 1 order by id limit 1').get() || null;

// ---------- Validación ----------

// Devuelve el payload limpio de un tipo de casillero o lanza un Error con el motivo (en español, lo muestra el panel).
export function cleanPayload(db, kind, raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  if (kind === 'reward') {
    const id = String(r.id || '');
    const row = db.prepare('select id from rewards where id = ?').get(id);
    if (!row) throw new Error('Elegí una recompensa que exista.');
    const days = int(r.days ?? 0);
    if (!(days >= 0 && days <= LIMITS.days)) throw new Error(`Los días van de 0 (permanente) a ${LIMITS.days}.`);
    return { id, days };
  }
  if (kind === 'booster') {
    const mult = Math.round(Number(r.mult) * 10) / 10;
    if (!(mult >= LIMITS.multMin && mult <= LIMITS.multMax)) throw new Error(`El multiplicador va de ${LIMITS.multMin} a ${LIMITS.multMax}.`);
    const hours = int(r.hours);
    if (!(hours >= 1 && hours <= LIMITS.hoursMax)) throw new Error(`La duración va de 1 a ${LIMITS.hoursMax} horas.`);
    return { mult, hours };
  }
  if (kind === 'xp') {
    const amount = int(r.amount);
    if (!(amount >= 1 && amount <= LIMITS.xpMax)) throw new Error(`La XP va de 1 a ${LIMITS.xpMax}.`);
    return { amount };
  }
  throw new Error('Ese tipo de casillero no existe.');
}

// Campos de un casillero nuevo o editado. Sin `cur`, todo es obligatorio; con `cur`, lo que no viene se conserva.
export function cleanSlot(db, body, cur = null) {
  const b = body && typeof body === 'object' ? body : {};
  const kind = cur ? cur.kind : String(b.kind || '');
  if (!SLOT_KINDS.includes(kind)) throw new Error('Elegí qué tipo de premio es.');
  const level = 'level' in b || !cur ? int(b.level) : cur.level;
  if (!(level >= 1 && level <= LIMITS.maxLevel)) throw new Error(`El nivel va de 1 a ${LIMITS.maxLevel}.`);
  const payload = 'payload' in b || !cur ? cleanPayload(db, kind, b.payload) : parse(cur.payload);
  const enabled = 'enabled' in b ? (b.enabled ? 1 : 0) : (cur ? cur.enabled : 1);
  const retro = 'retro' in b ? (b.retro ? 1 : 0) : (cur ? cur.retro : 0);
  let until = 'until' in b ? int(b.until || 0) : (cur ? cur.until : 0);
  if (!(until >= 0)) throw new Error('La fecha límite no es válida.');
  if (until > 0 && until <= Date.now() && !(cur && cur.until === until)) throw new Error('La fecha límite tiene que ser a futuro.');
  return { kind, level, payload, enabled, retro, until };
}

// ---------- Altas, cambios y bajas (las usa el panel) ----------

// Marca como bloqueados a quienes ya tienen el nivel del casillero (XP total mayor o igual a lo que pide ese nivel).
function blockAbove(db, slotId, level, curve) {
  db.prepare('delete from track_blocked where slot_id = ?').run(slotId);
  db.prepare('insert or ignore into track_blocked (slot_id, user_id) select ?, id from users where xp >= ?').run(slotId, xpAtLevel(level, curve));
}

export function createSlot(db, trackId, f, curve) {
  if (!db.prepare('select 1 from tracks where id = ?').get(trackId)) throw new Error('Ese camino no existe.');
  if (db.prepare('select count(*) as n from track_slots where track_id = ?').get(trackId).n >= LIMITS.slots) throw new Error(`Hay ${LIMITS.slots} casilleros, que es el máximo.`);
  if (db.prepare('select count(*) as n from track_slots where track_id = ? and level = ?').get(trackId, f.level).n >= LIMITS.perLevel) throw new Error(`Cada nivel admite hasta ${LIMITS.perLevel} casilleros.`);
  const pos = db.prepare('select coalesce(max(pos), 0) + 1 as n from track_slots where track_id = ? and level = ?').get(trackId, f.level).n;
  const id = Number(db.prepare('insert into track_slots (track_id, level, pos, kind, payload, enabled, until, retro, created) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(trackId, f.level, pos, f.kind, JSON.stringify(f.payload), f.enabled, f.until, f.retro, Date.now()).lastInsertRowid);
  if (!f.retro) blockAbove(db, id, f.level, curve);
  return id;
}

// Si cambia el nivel o la opción retroactiva se rehace la foto de bloqueados; encender o apagar un casillero no la toca.
export function updateSlot(db, cur, f, curve) {
  db.prepare('update track_slots set level = ?, payload = ?, enabled = ?, until = ?, retro = ? where id = ?')
    .run(f.level, JSON.stringify(f.payload), f.enabled, f.until, f.retro, cur.id);
  if (f.level !== cur.level || f.retro !== cur.retro) {
    if (f.retro) db.prepare('delete from track_blocked where slot_id = ?').run(cur.id);
    else blockAbove(db, cur.id, f.level, curve);
  }
}

export function deleteSlot(db, id) {
  db.prepare('delete from track_claims where slot_id = ?').run(id);
  db.prepare('delete from track_blocked where slot_id = ?').run(id);
  db.prepare('delete from track_slots where id = ?').run(id);
}

// ---------- Cómo se ve un casillero ----------

const hoursText = (h) => (h % 24 === 0 ? `${h / 24} ${h === 24 ? 'día' : 'días'}` : `${h} h`);
export const multText = (m) => 'x' + String(m).replace('.', ',');

// Texto y datos de un casillero para mostrar. `rewards` es un Map de id a fila de `rewards`. Devuelve null si el premio no se puede entregar
// (recompensa borrada o apagada).
function describe(s, p, rewards) {
  if (s.kind === 'reward') {
    const r = rewards.get(p.id);
    if (!r || !r.enabled) return null;
    const dur = p.days > 0 ? `${p.days} ${p.days === 1 ? 'día' : 'días'}` : 'permanente';
    return { name: r.name, note: `${KIND_NAME[r.kind] || r.kind}, ${RARITY_NAME[r.rarity] || r.rarity}, ${dur}`, rarity: r.rarity, rkind: r.kind, preset: r.preset, hidden: !!r.hidden, days: p.days };
  }
  if (s.kind === 'booster') return { name: `Potenciador ${multText(p.mult)}`, note: `${hoursText(p.hours)} de XP multiplicada, se activa al reclamar`, rarity: 'rara', mult: p.mult, hours: p.hours };
  return { name: `+${p.amount} XP`, note: 'XP extra', rarity: 'comun', amount: p.amount };
}

const rewardsMap = (db) => new Map(db.prepare('select id, kind, preset, name, rarity, enabled, hidden from rewards').all().map((r) => [r.id, r]));

// El camino activo con el estado de cada casillero para una persona:
//   locked   todavía no llegó a ese nivel
//   ready    se puede reclamar ya
//   claimed  ya lo reclamó
//   missed   no está disponible para ella (ya estaba por encima cuando se creó, o venció la fecha límite)
// Solo trae casilleros encendidos y entregables. Los de una recompensa oculta no se ven hasta que se puedan reclamar.
export function trackFor(db, userId, level, now = Date.now()) {
  const tr = activeTrack(db);
  if (!tr) return { track: null, slots: [], ready: 0 };
  const rewards = rewardsMap(db);
  const claims = new Map(db.prepare('select slot_id, at, expires from track_claims where user_id = ?').all(userId).map((c) => [c.slot_id, c]));
  const blocked = new Set(db.prepare('select slot_id from track_blocked where user_id = ?').all(userId).map((b) => b.slot_id));
  const slots = [];
  for (const s of db.prepare('select * from track_slots where track_id = ? and enabled = 1 order by level, pos, id').all(tr.id)) {
    const p = parse(s.payload);
    const d = describe(s, p, rewards);
    if (!d) continue;
    const mine = claims.get(s.id);
    let state;
    if (mine) state = 'claimed';
    else if (blocked.has(s.id) || (s.until > 0 && now > s.until)) state = 'missed';
    else if (level < s.level) state = 'locked';
    else state = 'ready';
    if (d.hidden && state === 'locked') continue;
    slots.push({ id: s.id, level: s.level, kind: s.kind, state, until: s.until, ...d, claimedAt: mine ? mine.at : 0 });
  }
  return { track: tr, slots, ready: slots.filter((x) => x.state === 'ready').length };
}

// La próxima recompensa: el primer casillero que todavía no se alcanzó y cuántos más hay en ese mismo nivel.
export function nextOf(view) {
  const locked = view.slots.filter((s) => s.state === 'locked');
  if (!locked.length) return null;
  const first = locked[0];
  const more = locked.filter((s) => s.level === first.level).length - 1;
  return { id: first.id, level: first.level, kind: first.kind, name: first.name, note: first.note, rarity: first.rarity, more };
}

// ---------- Reclamar ----------

const fail = (status, msg) => Object.assign(new Error(msg), { status });

// Entrega el premio de un casillero. Devuelve cuándo vence lo entregado (0 si no vence). Lo llama claimSlot dentro de una transacción.
function applySlot(db, userId, s, { xp, now }) {
  if (s.kind === 'reward') {
    const expires = s.days > 0 ? now + s.days * DAY : 0;
    if (!grant(db, userId, s.rewardId, { source: 'track', note: `Nivel ${s.level}`, expires })) throw fail(410, 'Esa recompensa ya no existe.');
    return expires;
  }
  if (s.kind === 'booster') {
    // Un potenciador del camino que ya esté activo no se desperdicia: el nuevo arranca cuando termine el anterior.
    const last = db.prepare("select max(ends) as e from xp_boosters where user_id = ? and name like 'Camino:%' and ends > ?").get(userId, now).e || 0;
    const starts = Math.max(now, last);
    const ends = starts + s.hours * HOUR;
    db.prepare('insert into xp_boosters (name, mult, user_id, starts, ends, created) values (?, ?, ?, ?, ?, ?)').run(`Camino: nivel ${s.level}`, s.mult, userId, starts, ends, now);
    return ends;
  }
  xp.add(userId, s.amount, 'track', { ref: s.id, note: `Camino, nivel ${s.level}`, at: now });
  return 0;
}

// Reclama un casillero. `xp` es el módulo de XP de la app (server/xp.js). Lanza un Error con `status` si no se puede.
export function claimSlot(db, userId, slotId, { level, xp, now = Date.now() }) {
  const view = trackFor(db, userId, level, now);
  const s = view.slots.find((x) => x.id === slotId);
  if (!s) throw fail(404, 'Ese premio no existe o ya no está en el camino.');
  if (s.state === 'claimed') throw fail(409, 'Ya reclamaste este premio.');
  if (s.state === 'locked') throw fail(403, 'Todavía no llegaste a ese nivel.');
  if (s.state === 'missed') throw fail(410, 'Ese premio ya no está disponible para vos.');
  const raw = parse(db.prepare('select payload from track_slots where id = ?').get(slotId).payload);
  const full = { ...s, rewardId: raw.id };
  db.exec('begin immediate');
  try {
    const expires = applySlot(db, userId, full, { xp, now });
    db.prepare('insert into track_claims (user_id, slot_id, at, expires) values (?, ?, ?, ?)').run(userId, slotId, now, expires);
    db.exec('commit');
    return { id: s.id, level: s.level, kind: s.kind, name: s.name, note: s.note, rarity: s.rarity, expires };
  } catch (err) {
    try { db.exec('rollback'); } catch {}
    throw err;
  }
}

// Reclama todo lo reclamable, en orden. Cada casillero es independiente: si uno falla, los demás siguen.
export function claimAll(db, userId, { level, xp, now = Date.now() }) {
  const given = [];
  const failed = [];
  for (const s of trackFor(db, userId, level, now).slots.filter((x) => x.state === 'ready')) {
    try { given.push(claimSlot(db, userId, s.id, { level, xp, now })); } catch (err) { failed.push({ id: s.id, error: err.message }); }
  }
  return { given, failed };
}

// ---------- Migración única desde las reglas por nivel (app v23, entrega 2) ----------

// Crea «Camino 1» con un casillero permanente por cada recompensa de regla `level`, marca como reclamado lo que cada persona ya tiene
// (para que nadie pierda ni vuelva a recibir nada) y pasa esas recompensas a regla manual. Se hace una sola vez (settings.track_v1).
export function migrateTrack(db) {
  if (db.prepare("select 1 from settings where key = 'track_v1'").get()) return null;
  const before = db.prepare('select count(*) as n from user_rewards').get().n;
  db.exec('begin immediate');
  try {
    let tr = activeTrack(db);
    if (!tr) {
      const id = Number(db.prepare("insert into tracks (name, active, created) values ('Camino 1', 1, ?)").run(Date.now()).lastInsertRowid);
      tr = { id, name: 'Camino 1' };
    }
    let slots = 0;
    let claims = 0;
    const perLevel = new Map();
    for (const r of db.prepare('select id, rule, enabled from rewards order by pos, name').all()) {
      const rule = parse(r.rule);
      if (rule.type !== 'level' || !(Number(rule.level) >= 1)) continue;
      const level = Math.min(LIMITS.maxLevel, Math.trunc(Number(rule.level)));
      const pos = (perLevel.get(level) || 0) + 1;
      perLevel.set(level, pos);
      // retro = 1: así funcionaban las reglas por nivel (quien ya pasó el nivel la recibía). Si la recompensa estaba apagada, el casillero también.
      const sid = Number(db.prepare('insert into track_slots (track_id, level, pos, kind, payload, enabled, until, retro, created) values (?, ?, ?, ?, ?, ?, 0, 1, ?)')
        .run(tr.id, level, pos, 'reward', JSON.stringify({ id: r.id, days: 0 }), r.enabled ? 1 : 0, Date.now()).lastInsertRowid);
      slots++;
      claims += Number(db.prepare('insert or ignore into track_claims (user_id, slot_id, at, expires) select user_id, ?, at, expires from user_rewards where reward_id = ?')
        .run(sid, r.id).changes);
      db.prepare("update rewards set rule = '{\"type\":\"manual\"}' where id = ?").run(r.id);
    }
    const after = db.prepare('select count(*) as n from user_rewards').get().n;
    if (after !== before) throw new Error('La migración del camino cambió lo que la gente tiene. Se cancela.');
    db.prepare("insert into settings (key, value) values ('track_v1', ?)").run(JSON.stringify({ at: Date.now(), slots, claims }));
    db.exec('commit');
    return { slots, claims };
  } catch (err) {
    try { db.exec('rollback'); } catch {}
    throw err;
  }
}

// ---------- Vista del panel ----------

// Casilleros de un camino con sus números: cuántos ya reclamaron y cuántos podrían reclamar ahora.
export function adminSlots(db, trackId, curve) {
  const rewards = rewardsMap(db);
  const claimed = new Map(db.prepare('select slot_id, count(*) as n from track_claims group by slot_id').all().map((r) => [r.slot_id, r.n]));
  const reach = db.prepare(`select count(*) as n from users u where u.xp >= ?
    and not exists (select 1 from track_claims c where c.slot_id = ? and c.user_id = u.id)
    and not exists (select 1 from track_blocked b where b.slot_id = ? and b.user_id = u.id)`);
  const blockedN = new Map(db.prepare('select slot_id, count(*) as n from track_blocked group by slot_id').all().map((r) => [r.slot_id, r.n]));
  return db.prepare('select * from track_slots where track_id = ? order by level, pos, id').all(trackId).map((s) => {
    const p = parse(s.payload);
    const d = describe(s, p, rewards);
    return {
      id: s.id, level: s.level, pos: s.pos, kind: s.kind, payload: p, enabled: !!s.enabled, until: s.until, retro: !!s.retro,
      name: d ? d.name : (s.kind === 'reward' ? 'Recompensa borrada o apagada' : '?'), note: d ? d.note : '', rarity: d ? d.rarity : 'comun',
      broken: !d, claimed: claimed.get(s.id) || 0, pending: reach.get(xpAtLevel(s.level, curve), s.id, s.id).n, blocked: blockedN.get(s.id) || 0,
    };
  });
}
