// Recompensas cosméticas: catálogo, inventario y lo que cada persona tiene puesto.
// Lo comparten la app y el panel (el archivo es idéntico en los dos proyectos).
// Los efectos son presets que se dibujan con CSS (css/rewards.css); nadie sube archivos.

export const KINDS = ['frame', 'name', 'cover'];
export const RARITIES = ['comun', 'rara', 'epica', 'legendaria'];

// Tipografías permitidas para los efectos de nombre (todas de Google Fonts, ya permitidas por la CSP).
export const FONTS = ['Orbitron', 'Pacifico', 'Press Start 2P', 'Cinzel', 'Bungee', 'Righteous', 'Audiowide', 'Permanent Marker',
  'Creepster', 'Special Elite', 'Monoton', 'Lobster', 'Caveat', 'Rubik Mono One', 'Michroma', 'Unbounded', 'Share Tech Mono',
  // v10
  'Fredoka', 'Bangers', 'Chewy', 'Cinzel Decorative', 'UnifrakturCook', 'Rye', 'Black Ops One', 'Shrikhand', 'Nosifer',
  'Sacramento', 'Silkscreen', 'VT323', 'Bungee Shade', 'Dancing Script'];

export const presetOk = (s) => typeof s === 'string' && /^[a-z0-9-]{1,24}$/.test(s);

export function ensureRewardSchema(db, base) {
  db.exec(`
    create table if not exists rewards (
      id text primary key, kind text not null, preset text not null, name text not null,
      description text not null default '', rarity text not null default 'comun', theme text not null default '',
      anim integer not null default 0, font text not null default '', rule text not null default '{"type":"manual"}',
      enabled integer not null default 1, pos integer not null default 0);
    create table if not exists user_rewards (
      user_id integer not null, reward_id text not null, source text not null default 'manual', note text not null default '',
      at integer not null, expires integer not null default 0,
      primary key (user_id, reward_id));
    create index if not exists user_rewards_by_reward on user_rewards (reward_id);
  `);
  try { db.exec("alter table users add column equip text not null default '{}'"); } catch {}
  // hidden = 1: mientras la persona no la tenga, no aparece en su colección (ni como bloqueada). Funciona como las medallas secretas.
  try { db.exec('alter table rewards add column hidden integer not null default 0'); } catch {}
  // seen = 0: la persona todavía no vio el aviso «Desbloqueaste…». Las filas que ya existían se dan por vistas.
  try { db.exec('alter table user_rewards add column seen integer not null default 1'); } catch {}
  // El catálogo base se carga por versiones: cada recompensa lleva `since` y solo se agregan las que superan la última cargada.
  // Así, lo que se borra desde el panel no vuelve a aparecer al reiniciar.
  const mark = db.prepare("select value from settings where key = 'rewards_seed'").get();
  const done = mark ? Number(mark.value) || 0 : 0;
  const top = Math.max(0, ...base.map((r) => r.since || 1));
  // v10: el halo pasó a llamarse Aureola y tiene un dibujo nuevo. Solo se renombra si nadie lo editó desde el panel.
  db.prepare("update rewards set preset = 'aureola' where kind = 'frame' and preset = 'halo'").run();
  db.prepare("update rewards set name = 'Aureola' where id = 'frame-halo' and name = 'Halo'").run();
  db.prepare("update rewards set description = 'Un aro de luz flotando sobre la cabeza.' where id = 'frame-halo' and description = 'Un halo de luz flotando sobre la foto.'").run();
  if (done >= top) return;
  const ins = db.prepare(`insert or ignore into rewards (id, kind, preset, name, description, rarity, theme, anim, font, rule, enabled, pos, hidden)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`);
  const at = db.prepare('select coalesce(max(pos), 0) as n from rewards').get().n;
  let pos = at;
  db.exec('begin');
  try {
    for (const r of base) {
      if ((r.since || 1) <= done) continue;
      ins.run(r.id, r.kind, r.preset, r.name, r.description || '', r.rarity || 'comun', r.theme || '', r.anim ? 1 : 0, r.font || '',
        JSON.stringify(r.rule || { type: 'manual' }), ++pos, r.hidden ? 1 : 0);
    }
    db.prepare("insert into settings (key, value) values ('rewards_seed', ?) on conflict(key) do update set value = excluded.value").run(String(top));
    db.exec('commit');
  } catch (err) {
    db.exec('rollback');
    throw err;
  }
}

export const parseEquip = (raw) => {
  try {
    const o = JSON.parse(raw || '{}');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
};

// ---------- Reglas de desbloqueo ----------
// manual: solo a mano desde el panel. level: al llegar a un nivel. medal: al ganar una medalla. tourney: premio por puesto al
// terminar un torneo (champ, final, semi, part). event: a quien juega entre dos fechas (con `temp` la recompensa vence al cerrar).
export const RULE_TYPES = ['manual', 'level', 'medal', 'tourney', 'event'];
export const PLACES = ['champ', 'final', 'semi', 'part'];
export const PLACE_NAMES = { champ: 'campeón', final: 'finalista', semi: 'semifinalista', part: 'participante' };

// Devuelve una regla limpia o lanza un Error con el motivo (lo usa el panel). La app usa ruleOf, que nunca lanza.
export function cleanRule(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const type = String(r.type || 'manual');
  if (!RULE_TYPES.includes(type)) throw new Error('Esa regla no existe.');
  if (type === 'manual') return { type };
  if (type === 'level') {
    const level = Math.trunc(Number(r.level));
    if (!Number.isFinite(level) || level < 1 || level > 999) throw new Error('El nivel va de 1 a 999.');
    return { type, level };
  }
  if (type === 'medal') {
    const medal = String(r.medal || '').trim();
    if (!/^[a-z0-9-]{1,60}$/.test(medal)) throw new Error('Elegí una medalla.');
    return { type, medal };
  }
  if (type === 'tourney') {
    if (!PLACES.includes(r.place)) throw new Error('Elegí el puesto del torneo.');
    return { type, place: r.place };
  }
  const from = Math.trunc(Number(r.from));
  const to = Math.trunc(Number(r.to));
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= from) throw new Error('El evento necesita un inicio y un fin, con el fin después del inicio.');
  if (to - from > 366 * 86400000) throw new Error('Un evento dura como máximo un año.');
  return { type, from, to, temp: !!r.temp };
}

export function ruleOf(raw) {
  try { return cleanRule(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch { return { type: 'manual' }; }
}

const day = (t) => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

// La pista que ve quien todavía no la tiene. `medals` (id a nombre) solo trae las medallas que no son secretas.
const ruleText = (rule, medals) => {
  const r = ruleOf(rule);
  if (r.type === 'level') return `Se consigue al llegar al nivel ${r.level}.`;
  if (r.type === 'medal') return medals?.get(r.medal) ? `Se consigue con la medalla ${medals.get(r.medal)}.` : 'Se consigue con una medalla.';
  if (r.type === 'tourney') {
    return { champ: 'Premio para quien gane un torneo.', final: 'Premio para quien llegue a la final de un torneo.',
      semi: 'Premio para quien llegue a las semifinales de un torneo.', part: 'Premio por participar en un torneo.' }[r.place];
  }
  if (r.type === 'event') return Date.now() >= r.to ? `Fue un evento del ${day(r.from)} al ${day(r.to)}, ya terminó.` : `Se consigue jugando entre el ${day(r.from)} y el ${day(r.to)}.`;
  return 'Se entrega como premio o en eventos.';
};

const pub = (r) => ({
  id: r.id, kind: r.kind, preset: r.preset, name: r.name, description: r.description, rarity: r.rarity, theme: r.theme,
  anim: !!r.anim, font: FONTS.includes(r.font) ? r.font : '',
});

// Solo lo que la ventana de nivel necesita saber de la regla (el nivel que la desbloquea).
const levelOfRule = (rule) => { const r = ruleOf(rule); return r.type === 'level' ? r.level : 0; };

// Lo que se ve de una persona en su perfil: solo los presets de lo que tiene puesto y todavía le pertenece.
export function cosmeticsOf(db, user) {
  const eq = parseEquip(user.equip);
  const ids = KINDS.map((k) => eq[k]).filter((v) => typeof v === 'string');
  const out = { frame: null, name: null, cover: null };
  if (!ids.length) return out;
  const rows = db.prepare(`select r.* from rewards r join user_rewards ur on ur.reward_id = r.id
    where ur.user_id = ? and r.enabled = 1 and (ur.expires = 0 or ur.expires > ?) and r.id in (${ids.map(() => '?').join(',')})`)
    .all(user.id, Date.now(), ...ids);
  for (const r of rows) if (eq[r.kind] === r.id) out[r.kind] = pub(r);
  return out;
}

// Catálogo completo con lo que la persona tiene. Lo bloqueado se muestra con la pista de cómo conseguirlo.
export function rewardsFor(db, user) {
  const now = Date.now();
  const owned = new Map(db.prepare('select reward_id, source, at, expires from user_rewards where user_id = ?').all(user.id)
    .filter((o) => o.expires === 0 || o.expires > now).map((o) => [o.reward_id, o]));
  let medals = new Map();
  try { medals = new Map(db.prepare('select id, name from medals where secret = 0').all().map((m) => [m.id, `«${m.name}»`])); } catch {}
  // Las ocultas (hidden = 1) solo aparecen cuando la persona las tiene: así lo que no se puede conseguir no llena la colección de candados.
  const items = db.prepare('select * from rewards where enabled = 1 order by pos, name').all().filter((r) => !r.hidden || owned.has(r.id)).map((r) => {
    const has = owned.get(r.id);
    return { ...pub(r), lvl: levelOfRule(r.rule), owned: !!has, source: has ? has.source : '', expires: has ? has.expires : 0, hint: has ? '' : ruleText(r.rule, medals) };
  });
  const eq = parseEquip(user.equip);
  const equip = {};
  for (const k of KINDS) equip[k] = items.some((i) => i.id === eq[k] && i.owned) ? eq[k] : '';
  return { items, equip };
}

// Guarda lo que la persona se pone. Solo acepta recompensas que tiene, del tipo correcto; el resto se ignora.
export function setEquip(db, user, wanted) {
  const have = new Set(rewardsFor(db, user).items.filter((i) => i.owned).map((i) => i.id));
  const kinds = new Map(db.prepare('select id, kind from rewards').all().map((r) => [r.id, r.kind]));
  const next = {};
  const w = wanted && typeof wanted === 'object' ? wanted : {};
  for (const k of KINDS) if (typeof w[k] === 'string' && have.has(w[k]) && kinds.get(w[k]) === k) next[k] = w[k];
  db.prepare('update users set equip = ? where id = ?').run(JSON.stringify(next), user.id);
  return next;
}

export function grant(db, userId, rewardId, { source = 'manual', note = '', expires = 0 } = {}) {
  if (!db.prepare('select 1 from rewards where id = ?').get(rewardId)) return false;
  // seen = 0 para que la persona reciba el aviso «Desbloqueaste…». Si ya la tenía, solo se renueva el vencimiento.
  db.prepare(`insert into user_rewards (user_id, reward_id, source, note, at, expires, seen) values (?, ?, ?, ?, ?, ?, 0)
    on conflict(user_id, reward_id) do update set expires = case when user_rewards.expires = 0 then 0 else excluded.expires end`)
    .run(userId, rewardId, String(source).slice(0, 20), String(note).slice(0, 80), Date.now(), expires);
  return true;
}

export function revoke(db, userId, rewardId) {
  db.prepare('delete from user_rewards where user_id = ? and reward_id = ?').run(userId, rewardId);
  const u = db.prepare('select id, equip from users where id = ?').get(userId);
  if (!u) return;
  const eq = parseEquip(u.equip);
  let touched = false;
  for (const k of KINDS) if (eq[k] === rewardId) { delete eq[k]; touched = true; }
  if (touched) db.prepare('update users set equip = ? where id = ?').run(JSON.stringify(eq), userId);
}

// ---------- Entrega automática ----------

// Revisa las reglas `level`, `medal` y `event` para una persona y le da lo que le toca. Devuelve los ids nuevos.
//   level   nivel actual de la persona
//   medals  función que devuelve el Set de ids de medallas ganadas (solo se llama si hay reglas de medalla)
//   events  true solo cuando la persona acaba de jugar (carrera o duelo): los eventos se ganan jugando
// Nunca se quita nada: si después cambia la regla o la persona baja de nivel, lo ya entregado se conserva.
export function autoGrant(db, userId, { level = 1, medals = () => new Set(), events = false, now = Date.now() } = {}) {
  const rows = db.prepare('select id, rule from rewards where enabled = 1').all().filter((r) => ruleOf(r.rule).type !== 'manual');
  if (!rows.length) return [];
  const have = new Map(db.prepare('select reward_id, expires from user_rewards where user_id = ?').all(userId).map((o) => [o.reward_id, o.expires]));
  const alive = (id) => have.has(id) && (have.get(id) === 0 || have.get(id) > now);
  let earned = null;
  const given = [];
  for (const row of rows) {
    if (alive(row.id)) continue;
    const r = ruleOf(row.rule);
    let ok = false;
    let note = '';
    let expires = 0;
    if (r.type === 'level') { ok = level >= r.level; note = `Nivel ${r.level}`; }
    else if (r.type === 'medal') { earned ||= medals(); ok = earned.has(r.medal); note = 'Medalla'; }
    else if (r.type === 'event' && events) { ok = now >= r.from && now < r.to; note = 'Evento'; expires = r.temp ? r.to : 0; }
    if (ok && grant(db, userId, row.id, { source: r.type, note, expires })) given.push(row.id);
  }
  return given;
}

// Premio de torneo por puesto: se llama al terminar el torneo para cada jugador (place: champ, final, semi o part).
export function grantPlace(db, userId, place, note = '') {
  const given = [];
  const have = new Set(db.prepare('select reward_id from user_rewards where user_id = ? and (expires = 0 or expires > ?)').all(userId, Date.now()).map((o) => o.reward_id));
  for (const row of db.prepare('select id, rule from rewards where enabled = 1').all()) {
    const r = ruleOf(row.rule);
    if (r.type !== 'tourney' || r.place !== place || have.has(row.id)) continue;
    if (grant(db, userId, row.id, { source: 'tourney', note })) given.push(row.id);
  }
  return given;
}

// Lo que todavía no vio (aviso «Desbloqueaste…»). Solo recompensas encendidas y vigentes.
export function unseen(db, userId) {
  return db.prepare(`select r.id, r.kind, r.preset, r.name, r.rarity, r.font, ur.source from user_rewards ur join rewards r on r.id = ur.reward_id
    where ur.user_id = ? and ur.seen = 0 and r.enabled = 1 and (ur.expires = 0 or ur.expires > ?) order by ur.at, r.pos limit 8`).all(userId, Date.now())
    .map((r) => ({ id: r.id, kind: r.kind, preset: r.preset, name: r.name, rarity: r.rarity, font: FONTS.includes(r.font) ? r.font : '', source: r.source }));
}

export function markSeen(db, userId) {
  db.prepare('update user_rewards set seen = 1 where user_id = ? and seen = 0').run(userId);
}

// Marco y nombre que tienen puestos varias personas a la vez (rankings, duelos, torneos). Devuelve un Map handle a
// { frame: { preset }, name: { preset } }; quien no tiene nada puesto no aparece. No incluye tipografía ni portada: en las listas
// los efectos van quietos y sin cambiar la letra, así las filas no se desalinean.
export function cosmeticsMany(db, handles) {
  const out = new Map();
  const list = [...new Set(handles.filter((h) => typeof h === 'string' && h))].slice(0, 60);
  if (!list.length) return out;
  const users = db.prepare(`select id, handle, equip from users where handle in (${list.map(() => '?').join(',')}) and equip != '{}'`).all(...list);
  const wanted = new Map();
  for (const u of users) {
    const eq = parseEquip(u.equip);
    const ids = ['frame', 'name'].map((k) => eq[k]).filter((v) => typeof v === 'string');
    if (ids.length) wanted.set(u.id, { handle: u.handle, eq, ids });
  }
  if (!wanted.size) return out;
  const allIds = [...new Set([...wanted.values()].flatMap((w) => w.ids))];
  const owners = [...wanted.keys()];
  const rows = db.prepare(`select ur.user_id, r.id, r.kind, r.preset from user_rewards ur join rewards r on r.id = ur.reward_id
    where ur.user_id in (${owners.map(() => '?').join(',')}) and r.id in (${allIds.map(() => '?').join(',')})
    and r.enabled = 1 and (ur.expires = 0 or ur.expires > ?)`).all(...owners, ...allIds, Date.now());
  for (const r of rows) {
    const w = wanted.get(r.user_id);
    if (!w || (r.kind !== 'frame' && r.kind !== 'name') || w.eq[r.kind] !== r.id || !presetOk(r.preset)) continue;
    const cur = out.get(w.handle) || {};
    cur[r.kind] = { preset: r.preset };
    out.set(w.handle, cur);
  }
  return out;
}
