// Metas y misiones (entregas 5 y 6 del rediseño de niveles). Archivo compartido con la app (neanbit-type): los dos deben ser idénticos.
// El panel lo usa para armar y medir las misiones; la app, para mostrar el progreso a cada persona y entregar el premio al reclamar.
//
//   missions         metas fijas y misiones; `filters` (JSON) dice qué carreras cuentan; `reward` (JSON) es el premio.
//                    `pool = 1` marca las que están en el pozo: son candidatas de la rotación y no se muestran hasta que les toca.
//   mission_claims   (usuario, misión, período): lo que cada persona ya reclamó. La clave primaria hace el reclamo idempotente.
//                    El panel solo la lee (contadores); la escribe la app al reclamar (claimMission).
//   mission_rotation (período, misión): qué eligió la rotación en cada día, semana o evento. Se congela la primera vez que
//                    se pide el período, así todos ven lo mismo y editar el pozo a mitad de día no cambia lo que ya salió.
//   mission_log      registro simple de cambios del panel (se conservan los últimos MISIONES.registro)
//
// El progreso NO se guarda: se calcula contando las carreras (o duelos ganados) del período con los filtros de la misión,
// o los días seguidos con carreras (medida `streak`).
// El día y la semana se miden con una zona horaria FIJA del servidor (settings.missions.tz, por defecto UTC−3), nunca la del navegador.
//
// Cupos (v26, entrega 6 parte 2a): hay `cfg.slots` misiones a la vez en total (día y semana juntas); de ellas, hasta
// `cfg.slotsWeek` son de la semana y el resto, del día. Las metas fijas y los eventos no ocupan cupo y se muestran siempre.
// Las misiones manuales (pool = 0, con fecha) se muestran mientras dure su ventana y ocupan cupo; antes de empezar salen
// como «programada». La rotación elige del pozo lo que falta hasta el cupo.
import { deliver } from './deliver.js';
import { cleanPayload, multText } from './track.js';

export const MISIONES = { max: 60, maxActivas: 8, title: 60, note: 160, countMax: 1000, registro: 1000, pagina: 50, muestra: 10 };
export const KINDS = ['goal', 'mission'];
export const PERIODS = ['day', 'week', 'event'];
export const METRICS = ['races', 'duel_wins', 'streak'];
export const REWARD_KINDS = ['none', 'xp', 'booster', 'reward'];
export const TRI = ['any', 'only', 'none']; // indistinto, solo, sin
// Evento automático de fábrica: viernes a las 18:00 y 54 horas (hasta el domingo a medianoche), uno del pozo de eventos.
export const EVENTOS = { on: 0, weekday: 5, hour: 18, hours: 54, count: 1 };
// Calibración (entrega 7): la XP de las misiones se mide contra la curva `base 100 / grow 10` y contra el tope diario.
// Referencia de premios (XP): meta fija 10, misión diaria 15 a 25, semanal 60, evento 40. Una carrera normal da 10 XP.
// Tope diario de fábrica: 120 XP, que son 12 carreras normales y alrededor del 20 % de un nivel en el 50 (590 XP).
// El tope cuenta TODO lo que dan las misiones en el día (metas, diarias, semanal y eventos), así un pozo o un evento
// mal cargado no infla la economía. 0 lo desactiva.
export const CFG_DEFAULT = { tz: -3, xpCapDay: 120, slots: 3, slotsWeek: 1, events: { ...EVENTOS } };
export const SLOTS = { max: 10, events: 3 };

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
      pos integer not null default 0, created integer not null, pool integer not null default 0);
    create table if not exists mission_claims (
      user_id integer not null, mission_id integer not null, period_key text not null, at integer not null,
      primary key (user_id, mission_id, period_key));
    create index if not exists mission_claims_by_mission on mission_claims (mission_id);
    create table if not exists mission_rotation (
      period_key text not null, mission_id integer not null, pos integer not null default 0, at integer not null,
      primary key (period_key, mission_id));
    create index if not exists mission_rotation_by_key on mission_rotation (period_key, pos);
    create table if not exists mission_log (
      id integer primary key, at integer not null, mission_id integer not null default 0, title text not null default '',
      action text not null, detail text not null default '');
    create index if not exists mission_log_by_at on mission_log (id desc);
    create index if not exists races_user_at on races (user_id, at);
    create index if not exists races_at on races (at);
  `);
  // La columna `pool` se suma a las bases que ya tienen la tabla (no hay «add column if not exists» en SQLite).
  if (!db.prepare('pragma table_info(missions)').all().some((c) => c.name === 'pool')) {
    db.exec('alter table missions add column pool integer not null default 0');
  }
}

export const hasDuelCol = (db) => db.prepare('pragma table_info(races)').all().some((c) => c.name === 'duel');

// ¿Ya existe lo que necesita de la app? La app crea races (con hc, ms y duel), texts y categories al arrancar. (Las tablas de misiones las crea el panel.)
export const missionsReady = (db) => ['races', 'texts', 'categories'].every((n) => !!db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(n)) && hasDuelCol(db);

// ---------- Ajustes (zona horaria y tope de XP diario) ----------

export function cleanCfg(raw, cur = CFG_DEFAULT) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const base = { ...CFG_DEFAULT, ...cur, events: { ...EVENTOS, ...(cur && cur.events) } };
  const tz = 'tz' in r ? int(r.tz) : base.tz;
  if (!(tz >= -12 && tz <= 14)) throw new Error('La zona horaria va de −12 a +14 (horas respecto de UTC; Argentina es −3).');
  const xpCapDay = 'xpCapDay' in r ? int(r.xpCapDay) : base.xpCapDay;
  if (!(xpCapDay >= 0 && xpCapDay <= 100000)) throw new Error('El tope de XP diario por misiones va de 0 (sin tope) a 100000.');
  const slots = 'slots' in r ? int(r.slots) : base.slots;
  if (!(slots >= 1 && slots <= SLOTS.max)) throw new Error(`Las misiones a la vez van de 1 a ${SLOTS.max}.`);
  const slotsWeek = 'slotsWeek' in r ? int(r.slotsWeek) : base.slotsWeek;
  if (!(slotsWeek >= 0 && slotsWeek <= slots)) throw new Error('Las misiones de la semana a la vez van de 0 al total de misiones a la vez.');
  const er = r.events && typeof r.events === 'object' ? r.events : {};
  const events = {
    on: 'on' in er ? (er.on ? 1 : 0) : base.events.on,
    weekday: 'weekday' in er ? int(er.weekday) : base.events.weekday,
    hour: 'hour' in er ? int(er.hour) : base.events.hour,
    hours: 'hours' in er ? int(er.hours) : base.events.hours,
    count: 'count' in er ? int(er.count) : base.events.count,
  };
  if (!(events.weekday >= 1 && events.weekday <= 7)) throw new Error('El día del evento va de lunes (1) a domingo (7).');
  if (!(events.hour >= 0 && events.hour <= 23)) throw new Error('La hora del evento va de 0 a 23.');
  if (!(events.hours >= 6 && events.hours <= 168)) throw new Error('El evento automático dura de 6 a 168 horas.');
  if (!(events.count >= 1 && events.count <= SLOTS.events)) throw new Error(`Se eligen de 1 a ${SLOTS.events} misiones del pozo de eventos.`);
  return { tz, xpCapDay, slots, slotsWeek, events };
}
export const cfgOf = (stored) => { try { return cleanCfg(stored || {}, CFG_DEFAULT); } catch { return { ...CFG_DEFAULT, events: { ...EVENTOS } }; } };

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

// Ventana de una misión en su período (día, semana u ocurrencia de evento), aunque todavía no haya empezado.
// Sirve para mostrarla como programada en la app y para congelar la rotación.
export function slotWindow(m, now, tz) {
  if (m.period === 'event') {
    const from = m.starts || 0;
    return { key: 'e:' + dateKey(dayOf(from, tz).idx), from, to: m.ends || FAR };
  }
  const p = m.repeat ? (m.period === 'day' ? dayOf(now, tz) : weekOf(now, tz)) : (m.period === 'day' ? dayOf(m.starts, tz) : weekOf(m.starts, tz));
  return { key: p.key, from: Math.max(p.from, m.starts || 0), to: Math.min(p.to, m.ends || FAR) };
}

// Ventana del período que corre ahora (día o semana), recortada por las fechas de una misión.
export function periodWindow(period, now, tz, starts = 0, ends = 0) {
  const p = period === 'day' ? dayOf(now, tz) : weekOf(now, tz);
  return { key: p.key, from: Math.max(p.from, starts || 0), to: Math.min(p.to, ends || FAR) };
}

// Ventana de conteo de una misión activa ahora: { key, from, to }, o null si no está activa.
export function windowOf(m, now, tz) {
  if (statusOf(m, now, tz) !== 'activa') return null;
  return slotWindow(m, now, tz);
}

// Días que le quedan a una ventana (para no elegir misiones de racha que ya no se pueden cumplir).
export function daysLeft(win, now, tz) {
  const from = Math.max(win.from, now);
  if (from >= win.to) return 0;
  return dayOf(win.to - 1, tz).idx - dayOf(from, tz).idx + 1;
}

// ---------- Eventos automáticos ----------

// Ocurrencia del evento automático que corre ahora (o la próxima): viernes a las 18:00 y 54 h, de fábrica.
// Se calcula, no se guarda: es determinista por fecha y zona, así todos ven lo mismo sin cron.
export function eventWindow(cfg, now = Date.now()) {
  const r = cfg.events || EVENTOS;
  if (!r.on) return null;
  const today = dayOf(now, cfg.tz);
  const weekday = ((today.idx + 3) % 7) + 1; // 1 = lunes … 7 = domingo
  let startIdx = today.idx - ((weekday - r.weekday + 7) % 7);
  let from = startIdx * DAY - cfg.tz * HOUR + r.hour * HOUR;
  if (now < from) { startIdx -= 7; from -= 7 * DAY; } // todavía no empezó: la que corre es la de la semana anterior
  return { key: 'e:' + dateKey(startIdx), from, to: from + r.hours * HOUR, startIdx, count: r.count };
}

// Evento automático que corre ahora, o el próximo si no hay: { key, from, to, next }.
export function eventUpcoming(cfg, now = Date.now()) {
  const w = eventWindow(cfg, now);
  if (!w) return null;
  if (now < w.to) return { ...w, next: now < w.from };
  const from = w.from + 7 * DAY;
  return { key: 'e:' + dateKey(w.startIdx + 7), from, to: from + cfg.events.hours * HOUR, startIdx: w.startIdx + 7, count: cfg.events.count, next: true };
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
  const metric = pick('metric', METRICS, 'qué se cuenta (carreras, duelos ganados o días seguidos)');
  const period = pick('period', PERIODS, 'el período (día, semana o evento)');
  const pool = 'pool' in b ? (b.pool ? 1 : 0) : (cur ? cur.pool : 0);
  if (pool && kind !== 'mission') throw new Error('Al pozo solo van misiones: las metas fijas se muestran siempre.');
  const count = has('count') ? int(b.count) : cur.count;
  if (!(count >= 1 && count <= MISIONES.countMax)) throw new Error(`La cantidad va de 1 a ${MISIONES.countMax}.`);
  let starts = has('starts') ? int(b.starts || 0) : cur.starts;
  let ends = has('ends') ? int(b.ends || 0) : cur.ends;
  let repeat = has('repeat') ? (b.repeat ? 1 : 0) : cur.repeat;
  if (pool) {
    // El pozo no lleva fechas: el día o la semana los pone la rotación y el evento, la regla del panel.
    starts = 0;
    ends = 0;
    repeat = 1;
  } else {
    if (!(starts >= 0 && ends >= 0)) throw new Error('Las fechas no son válidas.');
    if (ends && starts && ends <= starts) throw new Error('El fin tiene que ser posterior al inicio.');
    if (ends && ends <= Date.now() && !(cur && cur.ends === ends)) throw new Error('El fin tiene que ser a futuro.');
    if (period === 'event' && (!starts || !ends)) throw new Error('Un evento necesita fecha de inicio y de fin.');
    if (period !== 'event' && !repeat && !starts) throw new Error('Una misión que no se repite necesita fecha de inicio (es el día o la semana en que está disponible).');
  }
  if (metric === 'streak') {
    if (period === 'day') throw new Error('Los días seguidos se piden por semana o por evento: una misión de un día no puede pedirlos.');
    if (period === 'week' && count > 7) throw new Error('Una misión semanal de días seguidos pide como máximo 7 días.');
    if (period === 'week' && !repeat && ends && ends - starts < count * DAY) throw new Error(`Una misión de ${count} días seguidos necesita al menos ${count} días de ventana.`);
    if (period === 'event' && ends - starts < count * DAY) throw new Error(`Un evento de ${count} días seguidos tiene que durar al menos ${count} días.`);
  }
  const filters = metric === 'duel_wins' || metric === 'streak' ? cleanFilters(db, {}) : (has('filters') ? cleanFilters(db, b.filters) : cleanFilters(db, parse(cur.filters)));
  const reward = has('reward') ? cleanReward(db, b.reward) : parse(cur.reward);
  const enabled = 'enabled' in b ? (b.enabled ? 1 : 0) : (cur ? cur.enabled : 1);
  return { title, note, kind, metric, period, count, starts, ends, repeat, filters, reward, enabled, pool };
}

// Máximo de misiones encendidas y todavía vigentes por tipo de período, para no cargar al servidor ni al inicio de la app.
// Las del pozo no cuentan: son candidatas y no se muestran hasta que la rotación las elige.
function needRoom(db, f, exceptId, now) {
  if (!f.enabled || f.pool) return;
  const n = db.prepare('select count(*) as n from missions where enabled = 1 and pool = 0 and period = ? and id != ? and (ends = 0 or ends > ?)').get(f.period, exceptId, now).n;
  if (n >= MISIONES.maxActivas && (!f.ends || f.ends > now)) {
    throw new Error(`Ya hay ${MISIONES.maxActivas} misiones activas con ese período, que es el máximo. Apagá o borrá alguna.`);
  }
}

// ---------- Altas, cambios y bajas ----------

export function createMission(db, f, now = Date.now()) {
  if (db.prepare('select count(*) as n from missions').get().n >= MISIONES.max) throw new Error(`Hay ${MISIONES.max} misiones, que es el máximo. Borrá alguna que no uses.`);
  needRoom(db, f, 0, now);
  const pos = db.prepare('select coalesce(max(pos), 0) + 1 as n from missions').get().n;
  return Number(db.prepare(`insert into missions (title, note, kind, metric, period, filters, count, starts, ends, repeat, reward, enabled, pos, created, pool)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(f.title, f.note, f.kind, f.metric, f.period, JSON.stringify(f.filters), f.count, f.starts, f.ends, f.repeat, JSON.stringify(f.reward), f.enabled, pos, now, f.pool).lastInsertRowid);
}

export function updateMission(db, cur, f, now = Date.now()) {
  needRoom(db, f, cur.id, now);
  db.prepare(`update missions set title = ?, note = ?, kind = ?, metric = ?, period = ?, filters = ?, count = ?, starts = ?, ends = ?,
    repeat = ?, reward = ?, enabled = ?, pool = ? where id = ?`)
    .run(f.title, f.note, f.kind, f.metric, f.period, JSON.stringify(f.filters), f.count, f.starts, f.ends, f.repeat, JSON.stringify(f.reward), f.enabled, f.pool, cur.id);
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

// Días seguidos con al menos una carrera guardada dentro de la ventana, por persona: { best, cur, days }.
// Cuentan todas las carreras (normales, Hardcore y duelos) y el día se corta con la zona fija del servidor.
function streakByUser(db, win, tz, userId = 0) {
  const where = ['at >= ?', 'at < ?'];
  const params = [win.from, win.to];
  if (userId) { where.push('user_id = ?'); params.push(userId); }
  const rows = db.prepare(`select distinct user_id, cast((at + ?) / ${DAY} as integer) as d from races
    where ${where.join(' and ')} order by user_id, d`).all(tz * HOUR, ...params);
  const by = new Map();
  for (const r of rows) {
    const e = by.get(r.user_id);
    if (!e) { by.set(r.user_id, { best: 1, cur: 1, last: r.d, days: 1 }); continue; }
    e.days++;
    e.cur = r.d === e.last + 1 ? e.cur + 1 : 1;
    if (e.cur > e.best) e.best = e.cur;
    e.last = r.d;
  }
  return by;
}

// Progreso de una persona en una ventana (lo que la app mostrará en la entrega 6).
export function progressOf(db, m, userId, win, tz) {
  if (m.metric === 'duel_wins') {
    if (!hasDuels(db)) return 0;
    return db.prepare('select count(*) as n from duels where winner_id = ? and forfeit = 0 and at >= ? and at < ?').get(userId, win.from, win.to).n;
  }
  if (m.metric === 'streak') {
    const e = streakByUser(db, win, tz, userId).get(userId);
    return e ? e.best : 0;
  }
  const q = raceMatch(m.filters, win, userId);
  return db.prepare(`select count(*) as n from ${q.from} where ${q.where}`).get(...q.params).n;
}

// Cuántas personas cumplen la misión en una ventana, y cuántas carreras cuentan en total.
function totals(db, m, win, tz) {
  if (m.metric === 'duel_wins') {
    if (!hasDuels(db)) return { users: 0, completers: 0, matches: 0 };
    const w = 'winner_id is not null and forfeit = 0 and at >= ? and at < ?';
    return {
      matches: db.prepare(`select count(*) as n from duels where ${w}`).get(win.from, win.to).n,
      users: db.prepare(`select count(distinct winner_id) as n from duels where ${w}`).get(win.from, win.to).n,
      completers: db.prepare(`select count(*) as n from (select winner_id from duels where ${w} group by winner_id having count(*) >= ?)`).get(win.from, win.to, m.count).n,
    };
  }
  if (m.metric === 'streak') {
    let users = 0, completers = 0, matches = 0;
    for (const e of streakByUser(db, win, tz).values()) { users++; matches += e.days; if (e.best >= m.count) completers++; }
    return { users, completers, matches };
  }
  const q = raceMatch(m.filters, win);
  return {
    matches: db.prepare(`select count(*) as n from ${q.from} where ${q.where}`).get(...q.params).n,
    users: db.prepare(`select count(distinct r.user_id) as n from ${q.from} where ${q.where}`).get(...q.params).n,
    completers: db.prepare(`select count(*) as n from (select r.user_id from ${q.from} where ${q.where} group by r.user_id having count(*) >= ?)`).get(...q.params, m.count).n,
  };
}

// ---------- Rotación ----------

// Hash estable para ordenar las candidatas: la misma fecha da la misma selección en cualquier proceso.
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

function frozen(db, key) {
  return db.prepare('select mission_id as id, pos from mission_rotation where period_key = ? order by pos, mission_id').all(key);
}

function freeze(db, key, ids, now, offset = 0) {
  const ins = db.prepare('insert or ignore into mission_rotation (period_key, mission_id, pos, at) values (?, ?, ?, ?)');
  ids.forEach((id, i) => ins.run(key, id, offset + i + 1, now));
  db.prepare('delete from mission_rotation where at < ?').run(now - 120 * DAY);
}

// Completa la selección congelada hasta `want` sin tocar lo que ya salió: si el pozo creció o cambió el cupo
// a mitad de período, se suman las que faltan; si sobra cupo, las últimas quedan guardadas por si vuelve a hacer falta.
function fill(db, cand, key, ids, want, prev, now) {
  if (ids.length >= want) return ids.slice(0, want);
  const have = new Set(ids);
  const extra = pick(cand.filter((m) => !have.has(m.id)), key, want - ids.length, prev);
  if (extra.length) freeze(db, key, extra, now, ids.length);
  return [...ids, ...extra].slice(0, want);
}

// Ordena las candidatas por período; las que salieron en el período anterior van al final (si hay con qué cambiarlas).
function pick(list, key, n, prev) {
  if (n <= 0) return [];
  const was = new Set(prev);
  return list.slice()
    .sort((a, b) => (was.has(a.id) - was.has(b.id)) || (fnv(key + ':' + a.id) - fnv(key + ':' + b.id)) || (a.id - b.id))
    .slice(0, n).map((m) => m.id);
}

// Misiones manuales con fecha que ocupan cupo en el período que corre, aunque todavía no hayan empezado.
function manualInPeriod(db, period, now, tz) {
  const cur = period === 'day' ? dayOf(now, tz) : weekOf(now, tz);
  const out = [];
  for (const row of db.prepare("select * from missions where enabled = 1 and pool = 0 and kind = 'mission' and period = ? order by pos, id").all(period)) {
    const m = hydrate(row);
    const own = m.repeat ? cur : (period === 'day' ? dayOf(m.starts, tz) : weekOf(m.starts, tz));
    if (own.key !== cur.key) continue;
    const from = Math.max(own.from, m.starts || 0);
    const to = Math.min(own.to, m.ends || FAR);
    if (to <= from) continue;
    out.push({ m, win: { key: own.key, from, to } });
  }
  return out;
}

// Candidatas del pozo para el período: encendidas, con premio entregable y todavía cumplibles.
function poolInPeriod(db, period, now, tz, rewards) {
  const cur = period === 'day' ? dayOf(now, tz) : weekOf(now, tz);
  return db.prepare("select * from missions where enabled = 1 and pool = 1 and kind = 'mission' and period = ? order by pos, id").all(period)
    .map(hydrate)
    .filter((m) => {
      if (m.ends && m.ends <= cur.from) return false;
      if (m.starts && m.starts >= cur.to) return false;
      if (!describeReward(m.reward, rewards)) return false;
      if (m.metric === 'streak' && m.count > daysLeft(cur, now, tz)) return false;
      return true;
    });
}

// Arma el cupo que corre ahora: manuales + lo que elige la rotación del pozo. Devuelve [{ m, win, auto }].
function rotationNow(db, cfg, now, rewards) {
  const day = dayOf(now, cfg.tz);
  const week = weekOf(now, cfg.tz);
  const manualDay = manualInPeriod(db, 'day', now, cfg.tz);
  const manualWeek = manualInPeriod(db, 'week', now, cfg.tz);
  const rowOf = (id) => { const r = db.prepare('select * from missions where id = ?').get(id); return r && r.enabled ? hydrate(r) : null; };

  // Semana: las manuales ya ocupan su lugar; el pozo cubre lo que falte de slotsWeek, sin pasar el cupo total.
  let weekIds = frozen(db, week.key).map((r) => r.id);
  const weekRoom = Math.max(0, Math.min(cfg.slotsWeek, cfg.slots) - manualWeek.length);
  weekIds = weekRoom > 0
    ? fill(db, poolInPeriod(db, 'week', now, cfg.tz, rewards), week.key, weekIds, weekRoom, frozen(db, weekOf(now - 7 * DAY, cfg.tz).key).map((r) => r.id), now)
    : [];

  // Día: lo que dejen libre la semana y las manuales del día.
  let dayIds = frozen(db, day.key).map((r) => r.id);
  const dayRoom = Math.max(0, cfg.slots - manualWeek.length - weekIds.length - manualDay.length);
  dayIds = dayRoom > 0
    ? fill(db, poolInPeriod(db, 'day', now, cfg.tz, rewards), day.key, dayIds, dayRoom, frozen(db, dayOf(now - DAY, cfg.tz).key).map((r) => r.id), now)
    : [];

  const out = [...manualWeek, ...manualDay];
  for (const id of weekIds) { const m = rowOf(id); if (m) out.push({ m, win: periodWindow('week', now, cfg.tz, m.starts, m.ends), auto: true }); }
  for (const id of dayIds) { const m = rowOf(id); if (m) out.push({ m, win: periodWindow('day', now, cfg.tz, m.starts, m.ends), auto: true }); }
  return out;
}

// Metas fijas: se muestran siempre que estén en su ventana; no ocupan cupo.
function goalsNow(db, now, tz, rewards) {
  return db.prepare("select * from missions where enabled = 1 and pool = 0 and kind = 'goal' order by pos, id").all()
    .map(hydrate)
    .map((m) => ({ m, win: windowOf(m, now, tz), auto: false }))
    .filter((x) => x.win && describeReward(x.m.reward, rewards));
}

// Eventos: los manuales con fecha y los que arma la regla automática desde el pozo de eventos. No ocupan cupo.
function eventsNow(db, cfg, now, rewards) {
  const out = [];
  for (const row of db.prepare("select * from missions where enabled = 1 and pool = 0 and period = 'event' order by pos, id").all()) {
    const m = hydrate(row);
    if (!m.starts || now < m.starts || (m.ends && now >= m.ends)) continue;
    if (!describeReward(m.reward, rewards)) continue;
    out.push({ m, win: slotWindow(m, now, cfg.tz), auto: false });
  }
  const w = eventWindow(cfg, now);
  if (w && now >= w.from && now < w.to) {
    let ids = frozen(db, w.key).map((r) => r.id);
    if (ids.length < w.count) {
      const cand = db.prepare("select * from missions where enabled = 1 and pool = 1 and kind = 'mission' and period = 'event' order by pos, id").all()
        .map(hydrate)
        .filter((m) => describeReward(m.reward, rewards) && !(m.metric === 'streak' && m.count > daysLeft(w, now, cfg.tz)));
      ids = fill(db, cand, w.key, ids, w.count, frozen(db, 'e:' + dateKey(w.startIdx - 7)).map((r) => r.id), now);
    }
    for (const id of ids) {
      const r = db.prepare('select * from missions where id = ?').get(id);
      if (r && r.enabled && describeReward(hydrate(r).reward, rewards)) out.push({ m: hydrate(r), win: { key: w.key, from: w.from, to: w.to }, auto: true });
    }
  }
  return out;
}

// Todo lo que ve una persona ahora: metas fijas, cupo del día y la semana, y eventos. Ordenado por posición del panel.
export function liveMissions(db, cfg, now = Date.now()) {
  const rewards = rewardRows(db);
  return [...goalsNow(db, now, cfg.tz, rewards), ...rotationNow(db, cfg, now, rewards), ...eventsNow(db, cfg, now, rewards)]
    .sort((a, b) => (a.m.pos - b.m.pos) || (a.m.id - b.m.id));
}

// ---------- Lectura para el panel ----------

export const hydrate = (row) => ({ ...row, filters: parse(row.filters), reward: parse(row.reward) });

// Qué está seleccionado ahora en cada período, con los títulos y cuántas manuales ocupan cupo. Solo lee: no sortea.
export function rotationOf(db, cfg, now = Date.now()) {
  const title = (id) => {
    const r = db.prepare('select title, enabled from missions where id = ?').get(id);
    return r ? { title: r.enabled ? r.title : `${r.title} (apagada)`, gone: !r.enabled } : null;
  };
  const rowsOf = (key) => frozen(db, key).map((r) => { const t = title(r.id); return t && { id: r.id, pos: r.pos, ...t }; }).filter(Boolean);
  const day = dayOf(now, cfg.tz);
  const week = weekOf(now, cfg.tz);
  const ev = eventUpcoming(cfg, now);
  const count = (period) => db.prepare("select count(*) as n from missions where enabled = 1 and pool = 1 and kind = 'mission' and period = ?").get(period).n;
  return {
    slots: cfg.slots, slotsWeek: cfg.slotsWeek,
    day: { key: day.key, from: day.from, to: day.to, manual: manualInPeriod(db, 'day', now, cfg.tz).length, rows: rowsOf(day.key) },
    week: { key: week.key, from: week.from, to: week.to, manual: manualInPeriod(db, 'week', now, cfg.tz).length, rows: rowsOf(week.key) },
    event: ev && { ...ev, rows: rowsOf(ev.key) },
    pool: { day: count('day'), week: count('week'), event: count('event') },
  };
}

export function listMissions(db, cfg, now = Date.now()) {
  const claims = db.prepare('select mission_id, count(*) as n, count(distinct user_id) as users from mission_claims group by mission_id').all();
  const claimOf = new Map(claims.map((c) => [c.mission_id, c]));
  const rewardsAll = rewardRows(db);
  const live = new Map(liveMissions(db, cfg, now).map((x) => [x.m.id, x]));
  const rot = rotationOf(db, cfg, now);
  const rotOf = new Map();
  for (const p of ['day', 'week', 'event']) if (rot[p]) for (const r of rot[p].rows) rotOf.set(r.id, { period: p, key: rot[p].key });
  return db.prepare('select * from missions order by pos, id').all().map((row) => {
    const m = hydrate(row);
    const hit = live.get(m.id);
    const win = hit ? hit.win : (m.pool ? null : windowOf(m, now, cfg.tz));
    const t = win ? totals(db, m, win, cfg.tz) : null;
    const nowClaims = win ? db.prepare('select count(*) as n from mission_claims where mission_id = ? and period_key = ?').get(m.id, win.key).n : 0;
    const status = hit ? (now < hit.win.from ? 'programada' : 'activa') : m.pool ? 'pozo' : statusOf(m, now, cfg.tz);
    return {
      ...m, broken: !describeReward(m.reward, rewardsAll), status, selected: !!hit, auto: !!hit && hit.auto,
      rotation: rotOf.get(m.id) || null, window: win && { ...win, to: win.to === FAR ? 0 : win.to },
      now: t && { ...t, claimed: nowClaims }, claimedTotal: claimOf.get(m.id)?.n || 0, claimedUsers: claimOf.get(m.id)?.users || 0,
    };
  });
}

// Vista previa de qué carreras cuentan. Sirve para una misión guardada o para un borrador (`spec` ya validado, sin guardar).
// Si la misión no está activa ahora (o es del pozo y todavía no le toca), se mide sobre los últimos 7 días y se avisa con `fallback`.
export function previewMission(db, spec, cfg, now = Date.now()) {
  const m = { id: 0, ...spec };
  let win = null;
  let fallback = false;
  if (m.pool) {
    win = m.period === 'event' ? eventUpcoming(cfg, now) : periodWindow(m.period, now, cfg.tz);
  } else {
    win = windowOf({ ...m, enabled: 1 }, now, cfg.tz);
  }
  if (!win) { win = { key: '', from: now - 7 * DAY, to: now + 1 }; fallback = true; }
  const t = totals(db, m, win, cfg.tz);
  let sample = [];
  if (m.metric === 'streak') {
    const by = streakByUser(db, win, cfg.tz);
    sample = [...by.entries()].sort((a, b) => b[1].best - a[1].best).slice(0, MISIONES.muestra)
      .map(([uid, e]) => { const u = db.prepare('select handle from users where id = ?').get(uid); return { handle: u ? u.handle : String(uid), run: e.best, days: e.days }; });
  } else if (m.metric === 'duel_wins') {
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
// Se toma del inicio de la ventana (y no de «ahora») para que un evento que cruza la medianoche no cambie de referencia.
function periodNum(m, tz, win) {
  if (m.period === 'week') return Math.floor(weekOf(win.from, tz).idx / 7);
  return dayOf(win.from, tz).idx;
}

// Metas y misiones activas ahora, con el progreso de una persona. Estados: scheduled (programada, todavía no empezó),
// active (en curso), ready (cumplida, se puede reclamar), done (cumplida y sin premio que reclamar) y claimed (reclamada).
export function missionsFor(db, userId, cfg, now = Date.now()) {
  const rewards = rewardRows(db);
  const claimed = db.prepare('select 1 from mission_claims where user_id = ? and mission_id = ? and period_key = ?');
  const out = [];
  for (const { m, win, auto } of liveMissions(db, cfg, now)) {
    const reward = describeReward(m.reward, rewards);
    if (!reward) continue;
    const progress = progressOf(db, m, userId, win, cfg.tz);
    const done = progress >= m.count;
    const scheduled = now < win.from;
    const state = claimed.get(userId, m.id, win.key) ? 'claimed' : scheduled ? 'scheduled' : !done ? 'active' : reward.kind === 'none' ? 'done' : 'ready';
    out.push({
      id: m.id, title: m.title, note: m.note, kind: m.kind, metric: m.metric, period: m.period, filters: m.filters, count: m.count,
      progress: Math.min(progress, m.count), state, reward, auto, starts: scheduled ? win.from : 0, ends: win.to === FAR ? 0 : win.to,
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
  if (m.reward.kind === 'none') throw fail(400, 'Esta meta no tiene un premio para reclamar.');
  // Solo se reclama lo que está en el cupo de ahora: una misión del pozo a la que no le tocó no se puede cobrar.
  const hit = liveMissions(db, cfg, now).find((x) => x.m.id === missionId);
  if (!hit) throw fail(410, 'Esa misión ya no está disponible.');
  const win = hit.win;
  if (now < win.from) throw fail(410, 'Esa misión todavía no empezó.');
  if (progressOf(db, m, userId, win, cfg.tz) < m.count) throw fail(403, 'Todavía no cumpliste esta misión.');
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
      xpReason: 'mission', xpRef: m.id * 1000000 + periodNum(m, cfg.tz, win), xpNote: `Misión: ${m.title}`, xpAmount: give,
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
