// Metas y misiones (entregas 5 y 6 del rediseño de niveles). Archivo compartido con la app (neanbit-type): los dos deben ser idénticos.
// El panel lo usa para armar y medir las misiones; la app, para mostrar el progreso a cada persona y entregar el premio al reclamar.
//
//   missions         metas fijas y misiones; `filters` (JSON) dice qué carreras cuentan; `reward` (JSON) es el premio
//   mission_claims   (usuario, misión, período): lo que cada persona ya reclamó. La clave primaria hace el reclamo idempotente.
//                    El panel solo la lee (contadores); la escribe la app al reclamar (claimMission).
//   mission_log      registro simple de cambios del panel (se conservan los últimos MISIONES.registro)
//
// El progreso NO se guarda: se calcula contando las carreras (o duelos ganados) del período con los filtros de la misión.
// El día y la semana se miden con una zona horaria FIJA del servidor (settings.missions.tz, por defecto UTC−3), nunca la del navegador.
import { deliver } from './deliver.js';
import { cleanPayload, multText } from './track.js';

export const MISIONES = { max: 60, maxActivas: 8, title: 60, note: 160, countMax: 1000, registro: 1000, pagina: 50, muestra: 10 };
export const KINDS = ['goal', 'mission'];
export const PERIODS = ['day', 'week', 'event'];
export const METRICS = ['races', 'duel_wins'];
export const REWARD_KINDS = ['none', 'xp', 'booster', 'reward'];
export const TRI = ['any', 'only', 'none']; // indistinto, solo, sin
export const CFG_DEFAULT = { tz: -3, xpCapDay: 0 };

const HOUR = 3600000;
const DAY = 86400000;
const FAR = Number.MAX_SAFE_INTEGER;
const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : NaN);
const parse = (raw) => { try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

// ---------- Esquema ----------

// Seguro de repetir. Los índices de races sirven al cálculo de progreso (por persona) y a los contadores del panel (por fecha).
export function ensureMissionSchema(db) {
  db.exec(`
    create table if not exists missions (
      id integer primary key, title text not null, note text not null default '', kind text not null default 'mission',
      metric text not null default 'races', period text not null default 'day', filters text not null default '{}',
      count integer not null default 1, starts integer not null default 0, ends integer not null default 0,
      repeat integer not null default 0, reward text not null default '{"kind":"none"}', enabled integer not null default 1,
      pos integer not null default 0, created integer not null);
    create table if not exists mission_claims (
      user_id integer not null, mission_id integer not null, period_key text not null, at integer not null,
      primary key (user_id, mission_id, period_key));
    create index if not exists mission_claims_by_mission on mission_claims (mission_id);
    create table if not exists mission_log (
      id integer primary key, at integer not null, mission_id integer not null default 0, title text not null default '',
      action text not null, detail text not null default '');
    create index if not exists mission_log_by_at on mission_log (id desc);
    create index if not exists races_user_at on races (user_id, at);
    create index if not exists races_at on races (at);
  `);
}

export const hasDuelCol = (db) => db.prepare('pragma table_info(races)').all().some((c) => c.name === 'duel');

// ¿Ya existe lo que necesita de la app? La app crea races (con hc, ms y duel), texts y categories al arrancar. (Las tablas de misiones las crea el panel.)
export const missionsReady = (db) => ['races', 'texts', 'categories'].every((n) => !!db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(n)) && hasDuelCol(db);

// ---------- Ajustes (zona horaria y tope de XP diario) ----------

export function cleanCfg(raw, cur = CFG_DEFAULT) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const tz = 'tz' in r ? int(r.tz) : cur.tz;
  if (!(tz >= -12 && tz <= 14)) throw new Error('La zona horaria va de −12 a +14 (horas respecto de UTC; Argentina es −3).');
  const xpCapDay = 'xpCapDay' in r ? int(r.xpCapDay) : cur.xpCapDay;
  if (!(xpCapDay >= 0 && xpCapDay <= 100000)) throw new Error('El tope de XP diario por misiones va de 0 (sin tope) a 100000.');
  return { tz, xpCapDay };
}
export const cfgOf = (stored) => { try { return cleanCfg(stored || {}, CFG_DEFAULT); } catch { return { ...CFG_DEFAULT }; } };

// ---------- Períodos ----------

const dateKey = (dayIdx) => new Date(dayIdx * DAY).toISOString().slice(0, 10);

// Día local al que pertenece `at` con una zona fija en horas. Devuelve inicio, fin (en UTC) y clave AAAA-MM-DD.
export function dayOf(at, tz) {
  const idx = Math.floor((at + tz * HOUR) / DAY);
  return { key: dateKey(idx), from: idx * DAY - tz * HOUR, to: (idx + 1) * DAY - tz * HOUR, idx };
}

// Semana ISO (lunes a domingo). La clave es AAAA-Www, con el año de la semana ISO.
export function weekOf(at, tz) {
  const idx = Math.floor((at + tz * HOUR) / DAY);
  const start = idx - ((idx + 3) % 7); // el día 0 (1-ene-1970) fue jueves
  const thu = start + 3;
  const year = new Date(thu * DAY).getUTCFullYear();
  const week = Math.floor((thu - Date.UTC(year, 0, 1) / DAY) / 7) + 1;
  return { key: `${year}-W${String(week).padStart(2, '0')}`, from: start * DAY - tz * HOUR, to: (start + 7) * DAY - tz * HOUR, idx: start };
}

// Estado de una misión ahora: apagada, programada (aún no empieza), vencida (pasó su fin), terminada (no repetible y ya pasó su único período) o activa.
export function statusOf(m, now, tz) {
  if (!m.enabled) return 'apagada';
  if (m.starts && now < m.starts) return 'programada';
  if (m.ends && now >= m.ends) return 'vencida';
  if (m.period !== 'event' && !m.repeat) {
    const p = m.period === 'day' ? dayOf(m.starts, tz) : weekOf(m.starts, tz);
    if (now >= p.to) return 'terminada';
  }
  return 'activa';
}

// Ventana de conteo de una misión activa ahora: { key, from, to }, o null si no está activa.
export function windowOf(m, now, tz) {
  if (statusOf(m, now, tz) !== 'activa') return null;
  if (m.period === 'event') return { key: 'e', from: m.starts || 0, to: m.ends || FAR };
  const p = m.repeat ? (m.period === 'day' ? dayOf(now, tz) : weekOf(now, tz)) : (m.period === 'day' ? dayOf(m.starts, tz) : weekOf(m.starts, tz));
  return { key: p.key, from: Math.max(p.from, m.starts || 0), to: Math.min(p.to, m.ends || FAR) };
}

// ---------- Validación ----------

export function cleanFilters(db, raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const tri = (v, label) => { const s = String(v ?? 'any'); if (!TRI.includes(s)) throw new Error(`«${label}» tiene que ser indistinto, solo o sin.`); return s; };
  const num = (v, min, max, label) => { const n = int(v ?? 0); if (!(n >= min && n <= max)) throw new Error(`${label} va de ${min} a ${max}.`); return n; };
  const f = {
    hc: tri(r.hc, 'Hardcore'), duel: tri(r.duel, 'Duelos'),
    minCpm: num(r.minCpm, 0, 1800, 'El CPM mínimo'), minAcc: num(r.minAcc, 0, 100, 'La precisión mínima'),
    minMs: num(r.minMs, 0, 3600000, 'La duración mínima (ms)'), maxMs: num(r.maxMs, 0, 3600000, 'La duración máxima (ms)'),
    minChars: num(r.minChars, 0, 2000, 'El largo mínimo del texto (letras)'),
    categoria: num(r.categoria, 0, 1e9, 'La categoría'), texto: num(r.texto, 0, 1e9, 'El texto'),
  };
  if (f.maxMs && f.minMs > f.maxMs) throw new Error('La duración mínima no puede ser mayor que la máxima.');
  if (f.categoria && !db.prepare('select 1 from categories where id = ?').get(f.categoria)) throw new Error('Esa categoría no existe.');
  if (f.texto && !db.prepare('select 1 from texts where id = ?').get(f.texto)) throw new Error('Ese texto no existe.');
  return f;
}

export function cleanReward(db, raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const kind = String(r.kind || 'none');
  if (!REWARD_KINDS.includes(kind)) throw new Error('Elegí qué premio da (ninguno, XP, potenciador o cosmético).');
  if (kind === 'none') return { kind };
  return { kind, ...cleanPayload(db, kind, r) };
}

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Campos de una misión nueva o editada. Sin `cur`, todo lo importante es obligatorio; con `cur`, lo que no viene se conserva.
export function cleanMission(db, body, cur = null) {
  const b = body && typeof body === 'object' ? body : {};
  const has = (k) => k in b || !cur;
  const pick = (k, list, label) => { const v = has(k) ? String(b[k] ?? '') : cur[k]; if (!list.includes(v)) throw new Error(`Elegí ${label}.`); return v; };
  const title = has('title') ? clean(b.title, 200) : cur.title;
  if (!title) throw new Error('Escribí un título.');
  if (title.length > MISIONES.title) throw new Error(`El título admite hasta ${MISIONES.title} letras.`);
  const note = has('note') ? clean(b.note, 400) : cur.note;
  if (note.length > MISIONES.note) throw new Error(`La nota admite hasta ${MISIONES.note} letras.`);
  const kind = pick('kind', KINDS, 'si es una meta fija o una misión');
  const metric = pick('metric', METRICS, 'qué se cuenta (carreras o duelos ganados)');
  const period = pick('period', PERIODS, 'el período (día, semana o evento)');
  const count = has('count') ? int(b.count) : cur.count;
  if (!(count >= 1 && count <= MISIONES.countMax)) throw new Error(`La cantidad va de 1 a ${MISIONES.countMax}.`);
  const starts = has('starts') ? int(b.starts || 0) : cur.starts;
  const ends = has('ends') ? int(b.ends || 0) : cur.ends;
  if (!(starts >= 0 && ends >= 0)) throw new Error('Las fechas no son válidas.');
  if (ends && starts && ends <= starts) throw new Error('El fin tiene que ser posterior al inicio.');
  if (ends && ends <= Date.now() && !(cur && cur.ends === ends)) throw new Error('El fin tiene que ser a futuro.');
  const repeat = has('repeat') ? (b.repeat ? 1 : 0) : cur.repeat;
  if (period === 'event' && (!starts || !ends)) throw new Error('Un evento necesita fecha de inicio y de fin.');
  if (period !== 'event' && !repeat && !starts) throw new Error('Una misión que no se repite necesita fecha de inicio (es el día o la semana en que está disponible).');
  const filters = metric === 'duel_wins' ? cleanFilters(db, {}) : (has('filters') ? cleanFilters(db, b.filters) : cleanFilters(db, parse(cur.filters)));
  const reward = has('reward') ? cleanReward(db, b.reward) : parse(cur.reward);
  const enabled = 'enabled' in b ? (b.enabled ? 1 : 0) : (cur ? cur.enabled : 1);
  return { title, note, kind, metric, period, count, starts, ends, repeat, filters, reward, enabled };
}

// Máximo de misiones encendidas y todavía vigentes por tipo de período, para no cargar al servidor ni al inicio de la app.
function needRoom(db, f, exceptId, now) {
  if (!f.enabled) return;
  const n = db.prepare('select count(*) as n from missions where enabled = 1 and period = ? and id != ? and (ends = 0 or ends > ?)').get(f.period, exceptId, now).n;
  if (n >= MISIONES.maxActivas && (!f.ends || f.ends > now)) {
    throw new Error(`Ya hay ${MISIONES.maxActivas} misiones activas con ese período, que es el máximo. Apagá o borrá alguna.`);
  }
}

// ---------- Altas, cambios y bajas ----------

export function createMission(db, f, now = Date.now()) {
  if (db.prepare('select count(*) as n from missions').get().n >= MISIONES.max) throw new Error(`Hay ${MISIONES.max} misiones, que es el máximo. Borrá alguna que no uses.`);
  needRoom(db, f, 0, now);
  const pos = db.prepare('select coalesce(max(pos), 0) + 1 as n from missions').get().n;
  return Number(db.prepare(`insert into missions (title, note, kind, metric, period, filters, count, starts, ends, repeat, reward, enabled, pos, created)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(f.title, f.note, f.kind, f.metric, f.period, JSON.stringify(f.filters), f.count, f.starts, f.ends, f.repeat, JSON.stringify(f.reward), f.enabled, pos, now).lastInsertRowid);
}

export function updateMission(db, cur, f, now = Date.now()) {
  needRoom(db, f, cur.id, now);
  db.prepare(`update missions set title = ?, note = ?, kind = ?, metric = ?, period = ?, filters = ?, count = ?, starts = ?, ends = ?,
    repeat = ?, reward = ?, enabled = ? where id = ?`)
    .run(f.title, f.note, f.kind, f.metric, f.period, JSON.stringify(f.filters), f.count, f.starts, f.ends, f.repeat, JSON.stringify(f.reward), f.enabled, cur.id);
}

// Los premios que ya se reclamaron no se quitan: solo se borra el registro de reclamos de esa misión.
export function deleteMission(db, id) {
  db.prepare('delete from mission_claims where mission_id = ?').run(id);
  db.prepare('delete from missions where id = ?').run(id);
}

export function moveMission(db, id, dir) {
  const rows = db.prepare('select id from missions order by pos, id').all().map((r) => r.id);
  const i = rows.indexOf(id);
  const j = i + (dir === 'up' ? -1 : 1);
  if (i < 0 || j < 0 || j >= rows.length) return false;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  const up = db.prepare('update missions set pos = ? where id = ?');
  rows.forEach((mid, k) => up.run(k + 1, mid));
  return true;
}

// ---------- Conteo ----------

// Carreras que cumplen los filtros dentro de una ventana [from, to). Con `userId` solo las de esa persona.
function raceMatch(f, win, userId = 0) {
  const where = ['r.at >= ?', 'r.at < ?'];
  const params = [win.from, win.to];
  if (userId) { where.push('r.user_id = ?'); params.push(userId); }
  if (f.hc === 'only') where.push('r.hc = 1'); else if (f.hc === 'none') where.push('r.hc = 0');
  if (f.duel === 'only') where.push('r.duel = 1'); else if (f.duel === 'none') where.push('r.duel = 0');
  if (f.minCpm) { where.push('r.cpm >= ?'); params.push(f.minCpm); }
  if (f.minAcc) { where.push('r.acc >= ?'); params.push(f.minAcc); }
  // Las carreras anteriores a la v20 no tienen duración (ms es null): con un filtro de duración no cuentan.
  if (f.minMs) { where.push('r.ms >= ?'); params.push(f.minMs); }
  if (f.maxMs) { where.push('r.ms is not null and r.ms <= ?'); params.push(f.maxMs); }
  if (f.minChars) { where.push('coalesce(length(t.body), 0) >= ?'); params.push(f.minChars); }
  if (f.categoria) { where.push('t.category_id = ?'); params.push(f.categoria); }
  if (f.texto) { where.push('r.text_id = ?'); params.push(f.texto); }
  return { from: 'races r left join texts t on t.id = r.text_id', where: where.join(' and '), params };
}

const hasDuels = (db) => !!db.prepare("select 1 from sqlite_master where type = 'table' and name = 'duels'").get();

// Progreso de una persona en una ventana (lo que la app mostrará en la entrega 6).
export function progressOf(db, m, userId, win) {
  if (m.metric === 'duel_wins') {
    if (!hasDuels(db)) return 0;
    return db.prepare('select count(*) as n from duels where winner_id = ? and forfeit = 0 and at >= ? and at < ?').get(userId, win.from, win.to).n;
  }
  const q = raceMatch(m.filters, win, userId);
  return db.prepare(`select count(*) as n from ${q.from} where ${q.where}`).get(...q.params).n;
}

// Cuántas personas cumplen la misión en una ventana, y cuántas carreras cuentan en total.
function totals(db, m, win) {
  if (m.metric === 'duel_wins') {
    if (!hasDuels(db)) return { users: 0, completers: 0, matches: 0 };
    const w = 'winner_id is not null and forfeit = 0 and at >= ? and at < ?';
    return {
      matches: db.prepare(`select count(*) as n from duels where ${w}`).get(win.from, win.to).n,
      users: db.prepare(`select count(distinct winner_id) as n from duels where ${w}`).get(win.from, win.to).n,
      completers: db.prepare(`select count(*) as n from (select winner_id from duels where ${w} group by winner_id having count(*) >= ?)`).get(win.from, win.to, m.count).n,
    };
  }
  const q = raceMatch(m.filters, win);
  return {
    matches: db.prepare(`select count(*) as n from ${q.from} where ${q.where}`).get(...q.params).n,
    users: db.prepare(`select count(distinct r.user_id) as n from ${q.from} where ${q.where}`).get(...q.params).n,
    completers: db.prepare(`select count(*) as n from (select r.user_id from ${q.from} where ${q.where} group by r.user_id having count(*) >= ?)`).get(...q.params, m.count).n,
  };
}

// ---------- Lectura para el panel ----------

export const hydrate = (row) => ({ ...row, filters: parse(row.filters), reward: parse(row.reward) });

export function listMissions(db, cfg, now = Date.now()) {
  const claims = db.prepare('select mission_id, count(*) as n, count(distinct user_id) as users from mission_claims group by mission_id').all();
  const claimOf = new Map(claims.map((c) => [c.mission_id, c]));
  const rewardsAll = rewardRows(db);
  return db.prepare('select * from missions order by pos, id').all().map((row) => {
    const m = hydrate(row);
    const win = windowOf(m, now, cfg.tz);
    const t = win ? totals(db, m, win) : null;
    const nowClaims = win ? db.prepare('select count(*) as n from mission_claims where mission_id = ? and period_key = ?').get(m.id, win.key).n : 0;
    return {
      ...m, broken: !describeReward(m.reward, rewardsAll), status: statusOf(m, now, cfg.tz), window: win && { ...win, to: win.to === FAR ? 0 : win.to },
      now: t && { ...t, claimed: nowClaims }, claimedTotal: claimOf.get(m.id)?.n || 0, claimedUsers: claimOf.get(m.id)?.users || 0,
    };
  });
}

// Vista previa de qué carreras cuentan. Sirve para una misión guardada o para un borrador (`spec` ya validado, sin guardar).
// Si la misión no está activa ahora, se mide sobre los últimos 7 días y se avisa con `fallback`.
export function previewMission(db, spec, cfg, now = Date.now()) {
  const m = { id: 0, ...spec };
  let win = windowOf({ ...m, enabled: 1 }, now, cfg.tz);
  let fallback = false;
  if (!win) { win = { key: '', from: now - 7 * DAY, to: now + 1 }; fallback = true; }
  const t = totals(db, m, win);
  let sample = [];
  if (m.metric === 'duel_wins') {
    if (hasDuels(db)) {
      sample = db.prepare(`select d.id, d.at, u.handle, case when d.winner_id = d.a_id then d.a_cpm else d.b_cpm end as cpm,
        case when d.winner_id = d.a_id then d.a_acc else d.b_acc end as acc from duels d join users u on u.id = d.winner_id
        where d.winner_id is not null and d.forfeit = 0 and d.at >= ? and d.at < ? order by d.at desc limit ?`).all(win.from, win.to, MISIONES.muestra)
        .map((r) => ({ ...r, hc: 0, duel: 1 }));
    }
  } else {
    const q = raceMatch(m.filters, win);
    sample = db.prepare(`select r.id, r.at, u.handle, r.cpm, r.acc, r.hc, r.duel, r.ms from ${q.from} join users u on u.id = r.user_id
      where ${q.where} order by r.at desc limit ?`).all(...q.params, MISIONES.muestra);
  }
  return { ...t, fallback, window: { from: win.from, to: win.to === FAR ? 0 : win.to, key: win.key }, sample };
}

// ---------- Lo que ve y reclama cada persona (la app) ----------

const fail = (status, msg) => Object.assign(new Error(msg), { status });
const hoursText = (h) => (h % 24 === 0 ? `${h / 24} ${h === 24 ? 'día' : 'días'}` : `${h} h`);
const rewardRows = (db) => new Map(db.prepare('select id, kind, name, rarity, enabled from rewards').all().map((r) => [r.id, r]));

// Cómo se muestra un premio. Devuelve null si no se puede entregar (cosmético borrado o apagado): esa misión no se muestra.
export function describeReward(r, rewards) {
  if (r.kind === 'none') return { kind: 'none', name: 'Sin premio', note: '' };
  if (r.kind === 'xp') return { kind: 'xp', name: `+${r.amount} XP`, note: 'XP extra', amount: r.amount };
  if (r.kind === 'booster') return { kind: 'booster', name: `Potenciador ${multText(r.mult)}`, note: `${hoursText(r.hours)} de XP multiplicada, se activa al reclamar`, mult: r.mult, hours: r.hours };
  const row = rewards.get(r.id);
  if (!row || !row.enabled) return null;
  return { kind: 'reward', name: row.name, note: r.days > 0 ? `Cosmético, ${r.days} ${r.days === 1 ? 'día' : 'días'}` : 'Cosmético, permanente', rarity: row.rarity, days: r.days || 0 };
}

// Número que identifica el período de una misión activa ahora; entra en la referencia única del evento de XP (id × 1.000.000 + número).
function periodNum(m, now, tz) {
  if (m.period === 'day') return dayOf(now, tz).idx;
  if (m.period === 'week') return Math.floor(weekOf(now, tz).idx / 7);
  return 1;
}

// Metas y misiones activas ahora, con el progreso de una persona. Estados: active (en curso), ready (cumplida, se puede reclamar),
// done (cumplida y sin premio que reclamar) y claimed (ya reclamada en este período).
export function missionsFor(db, userId, cfg, now = Date.now()) {
  const rewards = rewardRows(db);
  const claimed = db.prepare('select 1 from mission_claims where user_id = ? and mission_id = ? and period_key = ?');
  const out = [];
  for (const row of db.prepare('select * from missions where enabled = 1 order by pos, id').all()) {
    const m = hydrate(row);
    const win = windowOf(m, now, cfg.tz);
    if (!win) continue;
    const reward = describeReward(m.reward, rewards);
    if (!reward) continue;
    const progress = progressOf(db, m, userId, win);
    const done = progress >= m.count;
    const state = claimed.get(userId, m.id, win.key) ? 'claimed' : !done ? 'active' : reward.kind === 'none' ? 'done' : 'ready';
    out.push({
      id: m.id, title: m.title, note: m.note, kind: m.kind, metric: m.metric, period: m.period, filters: m.filters, count: m.count,
      progress: Math.min(progress, m.count), state, reward, ends: win.to === FAR ? 0 : win.to,
    });
  }
  return out;
}

// Reclama el premio de una misión cumplida. `xp` es el módulo de XP de la app. Lanza un Error con `status` si no se puede.
// El progreso se calcula acá, en el servidor, con las carreras guardadas: nunca se confía en lo que diga el cliente.
export function claimMission(db, userId, missionId, { xp, cfg, now = Date.now() }) {
  const row = db.prepare('select * from missions where id = ?').get(missionId);
  if (!row) throw fail(404, 'Esa misión no existe o ya no está disponible.');
  const m = hydrate(row);
  const win = windowOf(m, now, cfg.tz);
  if (!win) throw fail(410, 'Esa misión ya no está disponible.');
  if (m.reward.kind === 'none') throw fail(400, 'Esta meta no tiene un premio para reclamar.');
  if (!describeReward(m.reward, rewardRows(db))) throw fail(410, 'Esa misión ya no está disponible.');
  if (progressOf(db, m, userId, win) < m.count) throw fail(403, 'Todavía no cumpliste esta misión.');
  db.exec('begin immediate');
  try {
    // Con la transacción tomada nadie más puede reclamar a la vez: esta comprobación y el insert son seguros.
    if (db.prepare('select 1 from mission_claims where user_id = ? and mission_id = ? and period_key = ?').get(userId, m.id, win.key)) throw fail(409, 'Ya reclamaste este premio.');
    let give = m.reward.amount;
    let capped = false;
    if (m.reward.kind === 'xp' && cfg.xpCapDay > 0) {
      const day = dayOf(now, cfg.tz);
      const used = db.prepare("select coalesce(sum(amount), 0) as n from xp_events where user_id = ? and reason = 'mission' and at >= ? and at < ?").get(userId, day.from, day.to).n;
      give = Math.max(0, Math.min(m.reward.amount, cfg.xpCapDay - used));
      capped = give < m.reward.amount;
    }
    db.prepare('insert into mission_claims (user_id, mission_id, period_key, at) values (?, ?, ?, ?)').run(userId, m.id, win.key, now);
    const expires = deliver(db, userId, { kind: m.reward.kind, rewardId: m.reward.id, days: m.reward.days, mult: m.reward.mult, hours: m.reward.hours, amount: m.reward.amount }, {
      xp, now, source: 'mission', note: m.title, boosterLike: 'Misión:%', boosterName: `Misión: ${m.title}`.slice(0, 80),
      xpReason: 'mission', xpRef: m.id * 1000000 + periodNum(m, now, cfg.tz), xpNote: `Misión: ${m.title}`, xpAmount: give,
    });
    db.exec('commit');
    const d = describeReward(m.reward, rewardRows(db));
    return { id: m.id, title: m.title, reward: d, given: m.reward.kind === 'xp' ? give : null, capped, expires };
  } catch (err) {
    try { db.exec('rollback'); } catch {}
    throw err;
  }
}

// ---------- Registro ----------

export function logMission(db, mission, action, detail) {
  db.prepare('insert into mission_log (at, mission_id, title, action, detail) values (?, ?, ?, ?, ?)')
    .run(Date.now(), mission ? mission.id : 0, mission ? String(mission.title).slice(0, 60) : '', action, String(detail).slice(0, 400));
  db.prepare('delete from mission_log where id <= (select max(id) from mission_log) - ?').run(MISIONES.registro);
}

export function logPage(db, page) {
  const total = db.prepare('select count(*) as n from mission_log').get().n;
  const rows = db.prepare('select id, at, mission_id, title, action, detail from mission_log order by id desc limit ? offset ?').all(MISIONES.pagina, page * MISIONES.pagina);
  return { total, page, size: MISIONES.pagina, rows };
}
