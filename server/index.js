import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from './seed.js';
import { createDuels } from './duels.js';

const scrypt = promisify(scryptCb);
const root = join(fileURLToPath(import.meta.url), '..', '..');
const port = Number(process.env.PORT || 3000);
const admin = (process.env.NT_ADMIN || '').toLowerCase();
const db = new DatabaseSync(process.env.NT_DB || join(root, 'data.db'));

db.exec(`
  create table if not exists users (
    id integer primary key, handle text unique not null, name text not null,
    hash text not null, role text not null default 'user', created integer not null);
  create table if not exists sessions (
    token text primary key, user_id integer not null, expires integer not null);
  create table if not exists races (
    id integer primary key, user_id integer not null, text_id integer not null,
    cpm integer not null, acc integer not null, at integer not null);
  create index if not exists races_user on races (user_id);
  create index if not exists races_cpm on races (cpm desc);
`);
try { db.exec('alter table races add column hc integer not null default 0'); } catch {}
db.exec(`
  create table if not exists errors (
    user_id integer not null, kind text not null, key text not null, n integer not null,
    primary key (user_id, kind, key));
  create table if not exists deaths (
    id integer primary key, user_id integer not null, text_id integer not null, at integer not null);
`);
db.exec('pragma journal_mode = wal; pragma busy_timeout = 5000;');
try { db.exec("alter table users add column avatar text not null default ''"); } catch {}
try { db.exec('alter table users add column avatar_v integer not null default 0'); } catch {}
try { db.exec('alter table users add column verified integer not null default 0'); } catch {}
try { db.exec("alter table users add column shown text not null default '[]'"); } catch {}
for (const col of ['bio', 'country', 'layout', 'switches', 'discord', 'title', 'website']) {
  try { db.exec(`alter table users add column ${col} text not null default ''`); } catch {}
}
for (const [col, def] of [['accent', 'ambar'], ['banner', 'liso'], ['shape', 'cuadrada']]) {
  try { db.exec(`alter table users add column ${col} text not null default '${def}'`); } catch {}
}
db.exec(`
  create table if not exists categories (
    id integer primary key, name text unique not null, pos integer not null default 0);
  create table if not exists texts (
    id integer primary key, category_id integer not null, body text not null,
    words integer not null, pos integer not null default 0, active integer not null default 1);
  create table if not exists announcements (
    id integer primary key, title text not null, body text not null,
    at integer not null, active integer not null default 1);
  create table if not exists settings (key text primary key, value text not null);
  create table if not exists medals (
    id text primary key, name text not null, description text not null, icon text not null default '',
    condition text not null, target integer not null default 0,
    stackable integer not null default 0, secret integer not null default 0, pos integer not null default 0);
  create table if not exists user_medals (
    user_id integer not null, medal_id text not null, count integer not null default 1,
    primary key (user_id, medal_id));
`);
seedTexts();
seedMedals();
if (admin) db.prepare("update users set role = 'admin' where handle = ?").run(admin);

function seedMedals() {
  const add = db.prepare('insert or ignore into medals (id, name, description, icon, condition, target, stackable, secret, pos) values (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  [
    ['primeros-pasos', 'Primeros pasos', 'Completar una carrera', 'races_total', 1],
    ['calentando', 'Calentando', 'Completar 10 carreras', 'races_total', 10],
    ['constante', 'Constante', 'Completar 50 carreras', 'races_total', 50],
    ['veterano', 'Veterano', 'Completar 250 carreras', 'races_total', 250],
    ['leyenda-viva', 'Leyenda viva', 'Completar 1000 carreras', 'races_total', 1000],
    ['ritmo', 'Ritmo', 'Llegar a 300 CPM', 'cpm_max', 300],
    ['veloz', 'Veloz', 'Llegar a 450 CPM', 'cpm_max', 450],
    ['relampago', 'Relámpago', 'Llegar a 600 CPM', 'cpm_max', 600],
    ['sonico', 'Sónico', 'Llegar a 800 CPM', 'cpm_max', 800],
    ['imparable', 'Imparable', 'Llegar a 1000 CPM', 'cpm_max', 1000],
    ['estable', 'Estable', 'Promedio general de 250 CPM', 'cpm_avg', 250],
    ['metronomo', 'Metrónomo', 'Promedio general de 400 CPM', 'cpm_avg', 400],
    ['maquina', 'Máquina', 'Promedio general de 600 CPM', 'cpm_avg', 600],
    ['sin-red', 'Sin red', 'Terminar 5 carreras en Hardcore', 'hc_races', 5],
    ['superviviente', 'Superviviente', 'Terminar 25 carreras en Hardcore', 'hc_races', 25],
    ['pulso-firme', 'Pulso firme', 'Llegar a 250 CPM en Hardcore', 'hc_best', 250],
    ['sangre-fria', 'Sangre fría', 'Llegar a 500 CPM en Hardcore', 'hc_best', 500],
    ['fundador', 'Fundador', 'Estuvo desde el principio', 'manual', 0],
    ['campeon', 'Campeón', 'Ganar un torneo', 'manual', 0],
    ['probador', 'Probador', 'Ayudó a encontrar errores', 'manual', 0],
  ].forEach(([id, name, desc, cond, target], i) =>
    add.run(id, name, desc, id, cond, target, id === 'campeon' ? 1 : 0, id === 'probador' ? 1 : 0, i));
  db.exec("update medals set icon = id where icon in ('play', 'rows', 'gauge', 'bolt', 'shield', 'target')");
}

function seedTexts() {
  if (db.prepare('select count(*) as n from texts').get().n) return;
  const addCategory = db.prepare('insert into categories (name, pos) values (?, ?)');
  const addText = db.prepare('insert into texts (id, category_id, body, words, pos) values (?, ?, ?, ?, ?)');
  Object.entries(seed).forEach(([name, list], c) => {
    const categoryId = Number(addCategory.run(name, c).lastInsertRowid);
    list.forEach((body, i) => addText.run(c * 10 + i + 1, categoryId, body, body.split(/\s+/).length, i));
  });
}

function setting(key) {
  try {
    return JSON.parse(db.prepare('select value from settings where key = ?').get(key)?.value || 'null');
  } catch {
    return null;
  }
}

function maintenance() {
  try {
    return JSON.parse(db.prepare("select value from settings where key = 'maintenance'").get()?.value || '{}');
  } catch {
    return {};
  }
}

const userCols = 'id, handle, name, hash, role, created, avatar_v, verified, shown, bio, country, layout, switches, discord, title, website, accent, banner, shape';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const mime = { '.png': 'image/png', '.svg': 'image/svg+xml', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const hits = new Map();

function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 10000) {
  return new Promise((ok, fail) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > limit) { fail(new Error('big')); req.destroy(); }
    });
    req.on('end', () => {
      try { ok(raw ? JSON.parse(raw) : {}); } catch { fail(new Error('json')); }
    });
  });
}

function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

function saveErrors(userId, kind, map) {
  const up = db.prepare(
    'insert into errors (user_id, kind, key, n) values (?, ?, ?, ?) on conflict (user_id, kind, key) do update set n = n + excluded.n'
  );
  for (const [key, n] of Object.entries(map || {}).slice(0, 60)) {
    if (key.length <= 30 && Number.isInteger(n) && n > 0 && n < 200) up.run(userId, kind, key, n);
  }
}

function profileStats(userId) {
  const normal = db.prepare('select count(*) as races, coalesce(max(cpm), 0) as best from races where user_id = ? and hc = 0').get(userId);
  const hard = db.prepare('select count(*) as hcRaces, coalesce(max(cpm), 0) as hcBest from races where user_id = ? and hc = 1').get(userId);
  return { ...normal, ...hard };
}

function duelSummary(userId, recent = 0) {
  const rows = db.prepare(`
    select d.winner_id, d.forfeit, d.at, u.handle, u.name,
      case when d.a_id = ? then d.a_cpm else d.b_cpm end as cpm,
      case when d.a_id = ? then d.a_acc else d.b_acc end as acc,
      case when d.a_id = ? then d.b_cpm else d.a_cpm end as rcpm
    from duels d join users u on u.id = case when d.a_id = ? then d.b_id else d.a_id end
    where d.a_id = ? or d.b_id = ? order by d.at desc, d.id desc`).all(userId, userId, userId, userId, userId, userId);
  const wins = rows.filter((r) => r.winner_id === userId);
  const speeds = rows.map((r) => r.cpm).filter((v) => v !== null);
  const accs = rows.map((r) => r.acc).filter((v) => v !== null);
  let streak = 0;
  while (streak < rows.length && rows[streak].winner_id === userId) streak++;
  let best = 0, run = 0;
  for (const r of [...rows].reverse()) { run = r.winner_id === userId ? run + 1 : 0; best = Math.max(best, run); }
  const mean = (list) => (list.length ? Math.round(list.reduce((a, v) => a + v, 0) / list.length) : 0);
  const out = {
    total: rows.length, wins: wins.length, byForfeit: wins.filter((r) => r.forfeit).length,
    losses: rows.filter((r) => r.winner_id && r.winner_id !== userId).length,
    rate: rows.length ? Math.round((wins.length / rows.length) * 100) : 0,
    streak, bestStreak: best, best: Math.max(0, ...speeds), avg: mean(speeds), acc: mean(accs),
  };
  if (recent) {
    out.recent = rows.slice(0, recent).map((r) => ({
      handle: r.handle, name: r.name, win: r.winner_id ? r.winner_id === userId : null,
      forfeit: !!r.forfeit, cpm: r.cpm, rcpm: r.rcpm, at: r.at,
    }));
  }
  return out;
}

const accents = ['ambar', 'celeste', 'menta', 'rosa', 'violeta', 'lima', 'hielo'];
const banners = ['liso', 'rejilla', 'diagonal', 'puntos', 'teclas', 'ondas'];
const shapes = ['cuadrada', 'redondeada', 'circulo'];
const oneOf = (value, list) => (list.includes(value) ? value : list[0]);
function cleanSite(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.') || url.href.length > 80) return null;
    return url.href;
  } catch {
    return null;
  }
}
const parseShown = (raw) => {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

const medalGroups = { races_total: 'Constancia', cpm_max: 'Velocidad', cpm_avg: 'Promedio', hc_races: 'Hardcore', hc_best: 'Hardcore', manual: 'Especiales' };
function medalsOf(userId) {
  const s = profileStats(userId);
  s.avg = db.prepare('select coalesce(round(avg(cpm)), 0) as a from races where user_id = ? and hc = 0').get(userId).a;
  const grants = new Map(db.prepare('select medal_id, count from user_medals where user_id = ?').all(userId).map((r) => [r.medal_id, r.count]));
  const values = { races_total: s.races, cpm_max: s.best, cpm_avg: s.avg, hc_races: s.hcRaces, hc_best: s.hcBest };
  return db.prepare('select * from medals order by pos, rowid').all().map((m) => {
    const given = grants.get(m.id) || 0;
    const earned = m.condition === 'manual' ? given > 0 : (values[m.condition] || 0) >= m.target;
    const manual = m.condition === 'manual';
    return {
      id: m.id, name: m.name, desc: m.description, icon: m.icon, stackable: !!m.stackable, secret: !!m.secret, earned,
      count: earned && m.stackable ? Math.max(given, 1) : 1,
      group: medalGroups[m.condition] || 'Especiales',
      target: manual ? 0 : m.target, value: manual ? 0 : Math.min(values[m.condition] || 0, m.target),
    };
  }).filter((m) => m.earned || !m.secret);
}

const minForAverage = 5;
const cache = new Map();
let version = 0;
function memo(key, make, ttl = 20000) {
  const hit = cache.get(key);
  if (hit && hit.v === version && Date.now() - hit.at < ttl) return hit.data;
  const data = make();
  cache.set(key, { v: version, at: Date.now(), data });
  return data;
}

function averages(window) {
  return db.prepare(`
    select u.handle, u.name, u.avatar_v as av, u.verified, round(avg(x.cpm)) as cpm, count(*) as races
    from (select user_id, cpm, row_number() over (partition by user_id order by at desc) as rn
          from races where hc = 0) x
    join users u on u.id = x.user_id
    where x.rn <= ? group by u.id having count(*) >= ? order by cpm desc, u.id`).all(window, minForAverage);
}

function homeSummary(userId, tz) {
  const day = (t) => Math.floor((t - tz * 60000) / 86400000);
  const today = day(Date.now());
  const rows = db.prepare('select cpm, at from races where user_id = ? and hc = 0 order by at desc').all(userId);
  const days = new Set(rows.map((r) => day(r.at)));
  let streak = 0;
  for (let d = days.has(today) ? today : today - 1; days.has(d); d--) streak++;
  const last = rows.slice(0, 10);
  const todayRows = rows.filter((r) => day(r.at) === today);
  return {
    races: rows.length,
    best: rows.reduce((m, r) => Math.max(m, r.cpm), 0),
    avg: last.length ? Math.round(last.reduce((a, r) => a + r.cpm, 0) / last.length) : 0,
    today: todayRows.length,
    todayBest: todayRows.reduce((m, r) => Math.max(m, r.cpm), 0),
    streak, streakToday: days.has(today),
  };
}

function rankOf(userId) {
  const rows = db.prepare(`
    select user_id, avg(cpm) as a, count(*) as c
    from (select user_id, cpm, row_number() over (partition by user_id order by at desc) as rn from races where hc = 0)
    where rn <= 10 group by user_id having c >= 5 order by a desc`).all();
  return rows.findIndex((r) => r.user_id === userId) + 1;
}

function hcRankOf(userId) {
  const rows = db.prepare('select user_id, max(cpm) as m from races where hc = 1 group by user_id order by m desc').all();
  return rows.findIndex((r) => r.user_id === userId) + 1;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}

async function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(await scrypt(password, salt, 64), Buffer.from(hash, 'hex'));
}

function sessionUser(req) {
  const token = /(?:^|; )nt_session=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
  if (!token) return null;
  return db.prepare(
    `select ${userCols} from sessions s join users u on u.id = s.user_id where s.token = ? and s.expires > ?`
  ).get(sha(token), Date.now()) || null;
}

function cookie(req, value, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `nt_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

const publicUser = (u) => ({
  handle: u.handle, name: u.name, role: u.role, av: u.avatar_v,
  bio: u.bio, country: u.country, layout: u.layout, switches: u.switches, discord: u.discord,
  title: u.title, website: u.website, accent: u.accent, banner: u.banner, shape: u.shape,
});

async function api(req, res, url) {
  const key = `${req.method} ${url.pathname}`;
  const me = sessionUser(req);
  const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;

  const photo = /^\/api\/avatar\/([a-z0-9_]{3,15})$/.exec(url.pathname);
  if (req.method === 'GET' && photo) {
    const row = db.prepare('select avatar from users where handle = ?').get(photo[1]);
    if (!row || !row.avatar) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' });
    return res.end(Buffer.from(row.avatar, 'base64'));
  }

  if (key === 'POST /api/avatar') {
    if (!me) return send(res, 401, { error: 'Iniciá sesión para ver esto.' });
    const { image } = await readBody(req, 120000);
    const prefix = 'data:image/jpeg;base64,';
    if (image === null) {
      db.prepare("update users set avatar = '', avatar_v = 0 where id = ?").run(me.id);
      return send(res, 200, { ok: true });
    }
    if (typeof image !== 'string' || !image.startsWith(prefix) || image.length > 100000 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(prefix.length)))
      return send(res, 400, { error: 'La imagen no es válida.' });
    db.prepare('update users set avatar = ?, avatar_v = ? where id = ?').run(image.slice(prefix.length), Date.now(), me.id);
    return send(res, 200, { ok: true });
  }

  if (key === 'GET /api/texts') {
    const categories = db.prepare('select name from categories order by pos, id').all().map((c) => c.name);
    const texts = db.prepare(`
      select t.id, c.name as category, t.body as text
      from texts t join categories c on c.id = t.category_id
      where t.active = 1 order by c.pos, t.pos, t.id`).all();
    return send(res, 200, { categories, texts });
  }

  if (key === 'GET /api/config') {
    const announcement = db.prepare('select id, title, body from announcements where active = 1 order by at desc limit 1').get() || null;
    return send(res, 200, { maintenance: maintenance(), announcement, info: setting('info') });
  }

  if (key === 'POST /api/profile') {
    if (!me) return send(res, 401, { error: 'Iniciá sesión para ver esto.' });
    const b = await readBody(req);
    const clean = (v, max) => String(v ?? '').trim().slice(0, max);
    const name = clean(b.name, 15);
    const layout = clean(b.layout, 10);
    const website = cleanSite(b.website);
    if (website === null) return send(res, 400, { error: 'El sitio web no es una dirección válida.' });
    if (!/^[\p{L}\p{N} _.-]{1,15}$/u.test(name)) return send(res, 400, { error: 'El nombre tiene hasta 15 caracteres.' });
    if (layout && !['QWERTY', 'Dvorak', 'Colemak', 'Otro'].includes(layout)) return send(res, 400, { error: 'Distribución inválida.' });
    const earned = new Set(medalsOf(me.id).filter((m) => m.earned).map((m) => m.id));
    const shown = Array.isArray(b.shown) ? [...new Set(b.shown)].filter((id) => earned.has(id)).slice(0, 6) : parseShown(me.shown);
    db.prepare(`update users set name = ?, bio = ?, country = ?, layout = ?, switches = ?, discord = ?, shown = ?,
      title = ?, website = ?, accent = ?, banner = ?, shape = ? where id = ?`)
      .run(name, clean(b.bio, 150), clean(b.country, 30), layout, clean(b.switches, 30), clean(b.discord, 32), JSON.stringify(shown),
        clean(b.title, 28), website, oneOf(b.accent, accents), oneOf(b.banner, banners), oneOf(b.shape, shapes), me.id);
    return send(res, 200, { user: publicUser(db.prepare(`select ${userCols} from users where id = ?`).get(me.id)) });
  }

  if (key === 'GET /api/me') return send(res, 200, { user: me && publicUser(me) });

  if (key === 'POST /api/register') {
    if (limited(ip)) return send(res, 429, { error: 'Demasiados intentos, esperá un minuto.' });
    const { handle = '', name = '', password = '' } = await readBody(req);
    const h = String(handle).toLowerCase();
    if (!/^[a-z0-9_]{3,15}$/.test(h)) return send(res, 400, { error: 'El usuario usa 3 a 15 letras, números o guion bajo.' });
    if (!/^[\p{L}\p{N} _.-]{1,15}$/u.test(name)) return send(res, 400, { error: 'El nombre tiene hasta 15 caracteres.' });
    if (typeof password !== 'string' || password.length < 8) return send(res, 400, { error: 'La contraseña necesita 8 caracteres o más.' });
    const hash = await hashPassword(password);
    try {
      const role = h === admin ? 'admin' : 'user';
      const info = db.prepare('insert into users (handle, name, hash, role, created) values (?, ?, ?, ?, ?)')
        .run(h, name.trim(), hash, role, Date.now());
      return startSession(req, res, Number(info.lastInsertRowid), 201);
    } catch {
      return send(res, 409, { error: 'Ese usuario ya existe.' });
    }
  }

  if (key === 'POST /api/login') {
    if (limited(ip)) return send(res, 429, { error: 'Demasiados intentos, esperá un minuto.' });
    const { handle = '', password = '' } = await readBody(req);
    const user = db.prepare(`select ${userCols} from users where handle = ?`).get(String(handle).toLowerCase());
    if (!user || typeof password !== 'string' || !(await checkPassword(password, user.hash)))
      return send(res, 401, { error: 'Usuario o contraseña incorrectos.' });
    return startSession(req, res, user.id, 200);
  }

  if (key === 'POST /api/logout') {
    const token = /(?:^|; )nt_session=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
    if (token) db.prepare('delete from sessions where token = ?').run(sha(token));
    return send(res, 200, { ok: true }, { 'set-cookie': cookie(req, '', 0) });
  }

  if (key === 'POST /api/races') {
    if (!me) return send(res, 401, { error: 'Iniciá sesión para guardar la carrera.' });
    if (maintenance().on && me.role !== 'admin') return send(res, 503, { error: 'Estamos en mantenimiento.' });
    const { textId, cpm, acc, hc = 0, chars, words } = await readBody(req);
    const valid = [textId, cpm, acc].every(Number.isInteger) && cpm >= 1 && cpm <= 1800 && acc >= 0 && acc <= 100 && (hc === 0 || hc === 1);
    if (!valid) return send(res, 400, { error: 'Resultado inválido.' });
    const last = db.prepare('select max(at) as a from races where user_id = ?').get(me.id).a || 0;
    if (Date.now() - last < 3000) return send(res, 429, { error: 'Demasiado rápido.' });
    db.prepare('insert into races (user_id, text_id, cpm, acc, at, hc) values (?, ?, ?, ?, ?, ?)')
      .run(me.id, textId, cpm, acc, Date.now(), hc);
    version++;
    saveErrors(me.id, 'c', chars);
    saveErrors(me.id, 'w', words);
    return send(res, 201, { ok: true });
  }

  if (key === 'POST /api/deaths') {
    if (!me) return send(res, 401, { error: 'Iniciá sesión para ver esto.' });
    const { textId } = await readBody(req);
    if (!Number.isInteger(textId)) return send(res, 400, { error: 'Pedido inválido.' });
    db.prepare('insert into deaths (user_id, text_id, at) values (?, ?, ?)').run(me.id, textId, Date.now());
    return send(res, 201, { ok: true });
  }

  if (key === 'GET /api/best') {
    if (!me) return send(res, 401, { error: 'Iniciá sesión para ver esto.' });
    const textId = Number(url.searchParams.get('textId'));
    const row = db.prepare('select max(cpm) as best from races where user_id = ? and text_id = ? and hc = 0').get(me.id, textId);
    return send(res, 200, { best: row.best || 0 });
  }

  if (key === 'GET /api/stats') {
    if (!me) return send(res, 401, { error: 'Iniciá sesión para ver esto.' });
    const duelMode = url.searchParams.get('mode') === 'duel';
    const races = db.prepare(`select cpm, acc, at, text_id, hc from races where user_id = ? and hc = 0 and duel ${duelMode ? '>' : '>='} 0 order by at desc limit 100`).all(me.id).reverse();
    const top = (kind, n) => db.prepare('select key, n from errors where user_id = ? and kind = ? order by n desc limit ?').all(me.id, kind, n);
    const deaths = db.prepare('select count(*) as n from deaths where user_id = ?').get(me.id).n;
    const t = profileStats(me.id);
    const agg = db.prepare(`select coalesce(round(avg(acc)), 0) as acc, min(at) as since, count(*) as n, coalesce(max(cpm), 0) as best from races where user_id = ? and hc = 0 and duel ${duelMode ? '>' : '>='} 0`).get(me.id);
    if (duelMode) {
      return send(res, 200, {
        races, chars: [], words: [], deaths: 0, duel: duelSummary(me.id, 8),
        totals: { races: agg.n, best: agg.best, hcRaces: 0, hcBest: 0, acc: agg.acc, since: agg.since },
      });
    }
    return send(res, 200, {
      races, chars: top('c', 40), words: top('w', 20), deaths,
      totals: { races: t.races, best: t.best, hcRaces: t.hcRaces, hcBest: t.hcBest, acc: agg.acc, since: agg.since },
    });
  }

  if (key === 'GET /api/races/top') {
    const since = url.searchParams.get('scope') === 'today' ? Date.now() - 86400000 : 0;
    const rows = memo('top' + since, () => db.prepare(`
      select u.handle, u.name, u.avatar_v as av, u.verified, max(r.cpm) as cpm, r.text_id
      from races r join users u on u.id = r.user_id
      where r.hc = 0 and r.at >= ? group by u.id order by cpm desc, u.id limit 10`).all(since));
    let mine = null;
    if (me) {
      const best = db.prepare('select max(cpm) as c from races where user_id = ? and hc = 0 and at >= ?').get(me.id, since).c;
      if (best) mine = { pos: 1 + db.prepare('select count(distinct user_id) as n from races where hc = 0 and at >= ? and cpm > ?').get(since, best).n, cpm: best };
    }
    return send(res, 200, { rows, me: mine });
  }

  if (key === 'GET /api/ranking/average') {
    const window = url.searchParams.get('window') === 'all' ? 1000000 : 10;
    const all = memo('avg' + window, () => averages(window));
    const at = me ? all.findIndex((r) => r.handle === me.handle) : -1;
    return send(res, 200, { rows: all.slice(0, 10), me: at > -1 ? { pos: at + 1, cpm: all[at].cpm } : null, min: minForAverage });
  }

  if (key === 'GET /api/ranking') {
    const since = url.searchParams.get('scope') === 'today' ? Date.now() - 86400000 : 0;
    const hc = url.searchParams.get('mode') === 'hc' ? 1 : 0;
    const all = memo(`rank${hc}-${since}`, () => db.prepare(`
      select u.handle, u.name, u.avatar_v as av, u.verified, max(r.cpm) as cpm, count(*) as races
      from races r join users u on u.id = r.user_id
      where r.at >= ? and r.hc = ? group by u.id order by cpm desc, u.id`).all(since, hc));
    const at = me ? all.findIndex((r) => r.handle === me.handle) : -1;
    return send(res, 200, { rows: all.slice(0, 10), me: at > -1 ? { pos: at + 1, cpm: all[at].cpm } : null });
  }

  if (key === 'GET /api/ranking/duels') {
    const since = url.searchParams.get('scope') === 'today' ? Date.now() - 86400000 : 0;
    const all = memo('duels-' + since, () => db.prepare(`
      select u.handle, u.name, u.avatar_v as av, u.verified,
        sum(case when p.winner_id = u.id then 1 else 0 end) as wins, count(*) as duels
      from (select a_id as uid, winner_id, at from duels union all select b_id, winner_id, at from duels) p
      join users u on u.id = p.uid where p.at >= ?
      group by u.id having wins > 0 order by wins desc, (wins * 1.0 / count(*)) desc, u.id`).all(since));
    const at = me ? all.findIndex((r) => r.handle === me.handle) : -1;
    return send(res, 200, { rows: all.slice(0, 10), me: at > -1 ? { pos: at + 1, wins: all[at].wins, duels: all[at].duels } : null });
  }

  if (key === 'GET /api/home') {
    const tz = Math.max(-840, Math.min(840, Number(url.searchParams.get('tz')) || 0));
    const dayStart = Date.now() - 86400000;
    const community = memo('community', () => ({
      users: db.prepare('select count(*) as n from users').get().n,
      today: db.prepare('select count(*) as n from races where at >= ?').get(dayStart).n,
    }));
    const ids = memo('textids', () => db.prepare('select id from texts where active = 1 order by id').all().map((t) => t.id), 60000);
    const dayNumber = Math.floor((Date.now() - tz * 60000) / 86400000);
    const daily = ids.length ? ids[dayNumber % ids.length] : null;
    const pulse = me ? { ...homeSummary(me.id, tz), rank: rankOf(me.id), hcRank: hcRankOf(me.id) } : null;
    return send(res, 200, { community, daily, pulse, min: minForAverage });
  }

  if (key === 'GET /api/users') {
    const q = String(url.searchParams.get('q') || '').toLowerCase().replace(/[^\p{L}\p{N}_ .-]/gu, '');
    if (q.length < 2) return send(res, 200, { rows: [] });
    const rows = db.prepare('select handle, name, avatar_v as av from users where handle like ? or lower(name) like ? limit 6').all(`%${q}%`, `%${q}%`);
    return send(res, 200, { rows });
  }

  const route = /^\/api\/users\/([a-z0-9_]{3,15})(\/races)?$/.exec(url.pathname);
  if (req.method === 'GET' && route) {
    const user = db.prepare(`select ${userCols} from users where handle = ?`).get(route[1]);
    if (!user) return send(res, 404, { error: 'No existe ese piloto.' });
    if (route[2]) {
      const page = Math.max(0, Number(url.searchParams.get('page')) || 0);
      const rows = db.prepare('select cpm, text_id, at from races where user_id = ? and hc = 0 order by at desc limit 10 offset ?').all(user.id, page * 10);
      const total = db.prepare('select count(*) as n from races where user_id = ? and hc = 0').get(user.id).n;
      return send(res, 200, { rows, total });
    }
    const s = profileStats(user.id);
    const medals = medalsOf(user.id);
    const secretLeft = db.prepare('select count(*) as n from medals where secret = 1').get().n - medals.filter((m) => m.secret).length;
    const normal = db.prepare('select cpm from races where user_id = ? and hc = 0 order by at desc').all(user.id);
    const mean = (list) => (list.length ? Math.round(list.reduce((a, r) => a + r.cpm, 0) / list.length) : 0);
    const favorite = db.prepare('select text_id from races where user_id = ? and hc = 0 group by text_id order by count(*) desc limit 1').get(user.id);
    return send(res, 200, {
      name: user.name, handle: user.handle, role: user.role, since: user.created, av: user.avatar_v,
      deaths: db.prepare('select count(*) as n from deaths where user_id = ?').get(user.id).n,
      bio: user.bio, country: user.country, layout: user.layout, switches: user.switches, discord: user.discord,
      title: user.title, website: user.website, accent: user.accent, banner: user.banner, shape: user.shape,
      races: s.races, best: s.best, hcBest: s.hcBest,
      avg: mean(normal.slice(0, 10)), avgAll: mean(normal),
      favorite: favorite ? favorite.text_id : null,
      rank: rankOf(user.id), hcRank: hcRankOf(user.id),
      verified: user.verified, shown: parseShown(user.shown), medals, secretLeft,
      duels: duelSummary(user.id),
    });
  }

  send(res, 404, { error: 'No encontrado.' });
}

function startSession(req, res, userId, status) {
  const token = randomBytes(32).toString('hex');
  db.prepare('delete from sessions where expires < ?').run(Date.now());
  db.prepare('insert into sessions (token, user_id, expires) values (?, ?, ?)')
    .run(sha(token), userId, Date.now() + 30 * 86400000);
  const user = db.prepare(`select ${userCols} from users where id = ?`).get(userId);
  send(res, status, { user: publicUser(user) }, { 'set-cookie': cookie(req, token, 30 * 86400) });
}

async function serveStatic(res, pathname) {
  const clean = pathname === '/' ? '/index.html' : pathname;
  if (!/^\/(index\.html|css\/[\w.-]+|js\/[\w.-]+|img\/(?:medals\/)?[\w.-]+)$/.test(clean)) {
    res.writeHead(404);
    return res.end('No encontrado');
  }
  try {
    const file = await readFile(join(root, clean));
    res.writeHead(200, { 'content-type': mime[extname(clean)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end('No encontrado');
  }
}

const duels = createDuels({ db, sessionUser, maintenance, bump: () => { version++; }, saveErrors });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else await serveStatic(res, url.pathname);
  } catch (err) {
    if (err instanceof TypeError && err.code === 'ERR_INVALID_URL') return send(res, 400, { error: 'Pedido inválido.' });
    if (err.message === 'json' || err.message === 'big') return send(res, 400, { error: 'Pedido inválido.' });
    console.error(err);
    send(res, 500, { error: 'Error interno.' });
  }
});
server.on('upgrade', duels.upgrade);
server.listen(port, () => console.log(`neanbit type en http://localhost:${port}`));
