import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from './seed.js';

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
for (const col of ['bio', 'country', 'layout', 'switches', 'discord']) {
  try { db.exec(`alter table users add column ${col} text not null default ''`); } catch {}
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
`);
seedTexts();
if (admin) db.prepare("update users set role = 'admin' where handle = ?").run(admin);

function seedTexts() {
  if (db.prepare('select count(*) as n from texts').get().n) return;
  const addCategory = db.prepare('insert into categories (name, pos) values (?, ?)');
  const addText = db.prepare('insert into texts (id, category_id, body, words, pos) values (?, ?, ?, ?, ?)');
  Object.entries(seed).forEach(([name, list], c) => {
    const categoryId = Number(addCategory.run(name, c).lastInsertRowid);
    list.forEach((body, i) => addText.run(c * 10 + i + 1, categoryId, body, body.split(/\s+/).length, i));
  });
}

function maintenance() {
  try {
    return JSON.parse(db.prepare("select value from settings where key = 'maintenance'").get()?.value || '{}');
  } catch {
    return {};
  }
}

const sha = (s) => createHash('sha256').update(s).digest('hex');
const mime = { '.png': 'image/png', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const hits = new Map();

function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10000) { fail(new Error('big')); req.destroy(); }
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

const medalList = [
  ['primeros-pasos', 'Primeros pasos', 'Completar una carrera', (s) => s.races >= 1],
  ['constante', 'Constante', 'Completar 50 carreras', (s) => s.races >= 50],
  ['ritmo', 'Ritmo', 'Llegar a 300 CPM', (s) => s.best >= 300],
  ['veloz', 'Veloz', 'Llegar a 450 CPM', (s) => s.best >= 450],
  ['sin-red', 'Sin red', 'Terminar 5 carreras en Hardcore', (s) => s.hcRaces >= 5],
  ['pulso-firme', 'Pulso firme', 'Llegar a 250 CPM en Hardcore', (s) => s.hcBest >= 250],
];

function profileStats(userId) {
  const normal = db.prepare('select count(*) as races, coalesce(max(cpm), 0) as best from races where user_id = ? and hc = 0').get(userId);
  const hard = db.prepare('select count(*) as hcRaces, coalesce(max(cpm), 0) as hcBest from races where user_id = ? and hc = 1').get(userId);
  return { ...normal, ...hard };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}

function sessionUser(req) {
  const token = /(?:^|; )nt_session=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
  if (!token) return null;
  return db.prepare(
    'select u.* from sessions s join users u on u.id = s.user_id where s.token = ? and s.expires > ?'
  ).get(sha(token), Date.now()) || null;
}

function cookie(req, value, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `nt_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

const publicUser = (u) => ({
  handle: u.handle, name: u.name, role: u.role,
  bio: u.bio, country: u.country, layout: u.layout, switches: u.switches, discord: u.discord,
});

async function api(req, res, url) {
  const key = `${req.method} ${url.pathname}`;
  const me = sessionUser(req);
  const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;

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
    return send(res, 200, { maintenance: maintenance(), announcement });
  }

  if (key === 'POST /api/profile') {
    if (!me) return send(res, 401, { error: 'Iniciá sesión para ver esto.' });
    const b = await readBody(req);
    const clean = (v, max) => String(v ?? '').trim().slice(0, max);
    const name = clean(b.name, 15);
    const layout = clean(b.layout, 10);
    if (!/^[\p{L}\p{N} _.-]{1,15}$/u.test(name)) return send(res, 400, { error: 'El nombre tiene hasta 15 caracteres.' });
    if (layout && !['QWERTY', 'Dvorak', 'Colemak', 'Otro'].includes(layout)) return send(res, 400, { error: 'Distribución inválida.' });
    db.prepare('update users set name = ?, bio = ?, country = ?, layout = ?, switches = ?, discord = ? where id = ?')
      .run(name, clean(b.bio, 150), clean(b.country, 30), layout, clean(b.switches, 30), clean(b.discord, 32), me.id);
    return send(res, 200, { user: publicUser(db.prepare('select * from users where id = ?').get(me.id)) });
  }

  if (key === 'GET /api/me') return send(res, 200, { user: me && publicUser(me) });

  if (key === 'POST /api/register') {
    if (limited(ip)) return send(res, 429, { error: 'Demasiados intentos, esperá un minuto.' });
    const { handle = '', name = '', password = '' } = await readBody(req);
    const h = String(handle).toLowerCase();
    if (!/^[a-z0-9_]{3,15}$/.test(h)) return send(res, 400, { error: 'El usuario usa 3 a 15 letras, números o guion bajo.' });
    if (!/^[\p{L}\p{N} _.-]{1,15}$/u.test(name)) return send(res, 400, { error: 'El nombre tiene hasta 15 caracteres.' });
    if (typeof password !== 'string' || password.length < 8) return send(res, 400, { error: 'La contraseña necesita 8 caracteres o más.' });
    try {
      const role = h === admin ? 'admin' : 'user';
      const info = db.prepare('insert into users (handle, name, hash, role, created) values (?, ?, ?, ?, ?)')
        .run(h, name.trim(), hashPassword(password), role, Date.now());
      return startSession(req, res, Number(info.lastInsertRowid), 201);
    } catch {
      return send(res, 409, { error: 'Ese usuario ya existe.' });
    }
  }

  if (key === 'POST /api/login') {
    if (limited(ip)) return send(res, 429, { error: 'Demasiados intentos, esperá un minuto.' });
    const { handle = '', password = '' } = await readBody(req);
    const user = db.prepare('select * from users where handle = ?').get(String(handle).toLowerCase());
    if (!user || typeof password !== 'string' || !checkPassword(password, user.hash))
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
    const races = db.prepare('select cpm, acc, at, text_id, hc from races where user_id = ? and hc = 0 order by at desc limit 100').all(me.id).reverse();
    const top = (kind, n) => db.prepare('select key, n from errors where user_id = ? and kind = ? order by n desc limit ?').all(me.id, kind, n);
    const deaths = db.prepare('select count(*) as n from deaths where user_id = ?').get(me.id).n;
    return send(res, 200, { races, chars: top('c', 40), words: top('w', 20), deaths });
  }

  if (key === 'GET /api/ranking') {
    const since = url.searchParams.get('scope') === 'today' ? Date.now() - 86400000 : 0;
    const rows = db.prepare(`
      select u.handle, u.name, max(r.cpm) as cpm, count(*) as races
      from races r join users u on u.id = r.user_id
      where r.at >= ? and r.hc = ? group by u.id order by cpm desc limit 20`).all(since, url.searchParams.get('mode') === 'hc' ? 1 : 0);
    return send(res, 200, { rows });
  }

  const profile = /^\/api\/users\/([a-z0-9_]{3,15})$/.exec(url.pathname);
  if (req.method === 'GET' && profile) {
    const user = db.prepare('select * from users where handle = ?').get(profile[1]);
    if (!user) return send(res, 404, { error: 'No existe ese piloto.' });
    const s = profileStats(user.id);
    const recent = db.prepare('select cpm from races where user_id = ? and hc = 0 order by at desc limit 10').all(user.id);
    const avg = recent.length ? Math.round(recent.reduce((a, r) => a + r.cpm, 0) / recent.length) : 0;
    return send(res, 200, { name: user.name, handle: user.handle, since: user.created, bio: user.bio, country: user.country, layout: user.layout, switches: user.switches, discord: user.discord, races: s.races, best: s.best, avg, hcBest: s.hcBest,
      medals: medalList.filter(([, , , test]) => test(s)).map(([id, name, desc]) => ({ id, name, desc })) });
  }

  send(res, 404, { error: 'No encontrado.' });
}

function startSession(req, res, userId, status) {
  const token = randomBytes(32).toString('hex');
  db.prepare('delete from sessions where expires < ?').run(Date.now());
  db.prepare('insert into sessions (token, user_id, expires) values (?, ?, ?)')
    .run(sha(token), userId, Date.now() + 30 * 86400000);
  const user = db.prepare('select * from users where id = ?').get(userId);
  send(res, status, { user: publicUser(user) }, { 'set-cookie': cookie(req, token, 30 * 86400) });
}

async function serveStatic(res, pathname) {
  const clean = pathname === '/' ? '/index.html' : pathname;
  if (!/^\/(index\.html|css\/[\w.-]+|js\/[\w.-]+|img\/[\w.-]+)$/.test(clean)) {
    res.writeHead(404);
    return res.end('No encontrado');
  }
  try {
    const file = await readFile(join(root, clean));
    res.writeHead(200, { 'content-type': mime[extname(clean)] || 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end('No encontrado');
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else await serveStatic(res, url.pathname);
  } catch (err) {
    if (err.message === 'json' || err.message === 'big') return send(res, 400, { error: 'Pedido inválido.' });
    console.error(err);
    send(res, 500, { error: 'Error interno.' });
  }
}).listen(port, () => console.log(`neanbit type en http://localhost:${port}`));
