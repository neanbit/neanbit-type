// Recompensas cosméticas: catálogo, inventario y lo que cada persona tiene puesto.
// Lo comparten la app y el panel (el archivo es idéntico en los dos proyectos).
// Los efectos son presets que se dibujan con CSS (css/rewards.css); nadie sube archivos.

export const KINDS = ['frame', 'name', 'cover'];
export const RARITIES = ['comun', 'rara', 'epica', 'legendaria'];

// Tipografías permitidas para los efectos de nombre (todas de Google Fonts, ya permitidas por la CSP).
export const FONTS = ['Orbitron', 'Pacifico', 'Press Start 2P', 'Cinzel', 'Bungee', 'Righteous', 'Audiowide', 'Permanent Marker',
  'Creepster', 'Special Elite', 'Monoton', 'Lobster', 'Caveat', 'Rubik Mono One', 'Michroma', 'Unbounded', 'Share Tech Mono'];

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
  // El catálogo base se carga por versiones: cada recompensa lleva `since` y solo se agregan las que superan la última cargada.
  // Así, lo que se borra desde el panel no vuelve a aparecer al reiniciar.
  const mark = db.prepare("select value from settings where key = 'rewards_seed'").get();
  const done = mark ? Number(mark.value) || 0 : 0;
  const top = Math.max(0, ...base.map((r) => r.since || 1));
  if (done >= top) return;
  const ins = db.prepare(`insert or ignore into rewards (id, kind, preset, name, description, rarity, theme, anim, font, rule, enabled, pos)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`);
  const at = db.prepare('select coalesce(max(pos), 0) as n from rewards').get().n;
  let pos = at;
  db.exec('begin');
  try {
    for (const r of base) {
      if ((r.since || 1) <= done) continue;
      ins.run(r.id, r.kind, r.preset, r.name, r.description || '', r.rarity || 'comun', r.theme || '', r.anim ? 1 : 0, r.font || '',
        JSON.stringify(r.rule || { type: 'manual' }), ++pos);
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

const ruleText = (rule) => {
  try {
    const r = typeof rule === 'string' ? JSON.parse(rule) : rule;
    if (r.type === 'level') return `Se consigue al llegar al nivel ${r.level}.`;
    if (r.type === 'medal') return 'Se consigue con una medalla.';
    if (r.type === 'tourney') return 'Es un premio de torneo.';
    if (r.type === 'event') return 'Se entrega en eventos por tiempo limitado.';
  } catch {}
  return 'Se entrega como premio o en eventos.';
};

const pub = (r) => ({
  id: r.id, kind: r.kind, preset: r.preset, name: r.name, description: r.description, rarity: r.rarity, theme: r.theme,
  anim: !!r.anim, font: FONTS.includes(r.font) ? r.font : '',
});

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
  const items = db.prepare('select * from rewards where enabled = 1 order by pos, name').all().map((r) => {
    const has = owned.get(r.id);
    return { ...pub(r), owned: !!has, source: has ? has.source : '', expires: has ? has.expires : 0, hint: has ? '' : ruleText(r.rule) };
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
  db.prepare(`insert into user_rewards (user_id, reward_id, source, note, at, expires) values (?, ?, ?, ?, ?, ?)
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
