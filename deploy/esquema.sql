-- Esquema de referencia de neanbit type, con el estado final de cada tabla.
--
-- NO hace falta correr este archivo: la app (server/index.js, duels.js, tournaments.js
-- y medals.js) crea y migra todo sola al arrancar. Sirve para leer la estructura de un
-- vistazo, para armar consultas o para levantar una base vacia fuera de la app:
--
--   sqlite3 /tmp/prueba.db < deploy/esquema.sql
--
-- Las fechas (at, created, expires, created_at...) son milisegundos desde 1970 (Date.now()).
-- No correr sobre la base de produccion.

pragma journal_mode = wal;
pragma busy_timeout = 5000;

-- Cuentas y sesiones ---------------------------------------------------------

create table if not exists users (
  id integer primary key,
  handle text unique not null,            -- nombre de usuario, en minusculas
  name text not null,                     -- nombre visible
  hash text not null,                     -- scrypt, nunca la clave
  role text not null default 'user',      -- user | admin
  created integer not null,
  avatar text not null default '',        -- foto en base64
  avatar_v integer not null default 0,    -- version de la foto, para la cache
  verified integer not null default 0,    -- 0, 1 o 2
  shown text not null default '[]',       -- medallas elegidas para la vitrina (JSON)
  bio text not null default '',
  country text not null default '',
  layout text not null default '',
  switches text not null default '',
  discord text not null default '',
  title text not null default '',
  website text not null default '',
  accent text not null default 'ambar',
  banner text not null default 'liso',
  shape text not null default 'cuadrada'
);

create table if not exists sessions (
  token text primary key,
  user_id integer not null,
  expires integer not null
);

-- Carreras y errores ---------------------------------------------------------

create table if not exists races (
  id integer primary key,
  user_id integer not null,
  text_id integer not null,
  cpm integer not null,
  acc integer not null,
  at integer not null,
  hc integer not null default 0,          -- 1 = Hardcore
  duel integer not null default 0         -- 0 = carrera normal, otro valor = id del duelo
);
create index if not exists races_user on races (user_id);
create index if not exists races_cpm on races (cpm desc);

create table if not exists errors (
  user_id integer not null,
  kind text not null,
  key text not null,
  n integer not null,
  primary key (user_id, kind, key)
);

create table if not exists deaths (       -- eliminaciones en Hardcore
  id integer primary key,
  user_id integer not null,
  text_id integer not null,
  at integer not null
);

-- Textos, anuncios y ajustes -------------------------------------------------

create table if not exists categories (
  id integer primary key,
  name text unique not null,
  pos integer not null default 0
);

create table if not exists texts (
  id integer primary key,
  category_id integer not null,
  body text not null,                     -- entre 40 y 600 caracteres
  words integer not null,
  pos integer not null default 0,
  active integer not null default 1
);

create table if not exists announcements (
  id integer primary key,
  title text not null,
  body text not null,
  at integer not null,
  active integer not null default 1
);

-- Claves en uso: maintenance {"on":true,"message":"..."}, info {"title","body"}, medals_v2
create table if not exists settings (
  key text primary key,
  value text not null
);

-- Medallas -------------------------------------------------------------------

create table if not exists medals (
  id text primary key,
  name text not null,
  description text not null,
  icon text not null default '',          -- nombre del icono dentro de server/medal-icons
  tier text not null default '',          -- bronce | gris | oro | coral | blanco
  condition text not null,                -- ver server/medals.js (o "manual")
  target integer not null default 0,
  stackable integer not null default 0,
  tourney integer not null default 0,     -- 1 = cuenta como torneo ganado
  secret integer not null default 0,
  pos integer not null default 0
);

create table if not exists user_medals (
  user_id integer not null,
  medal_id text not null,
  count integer not null default 1,
  primary key (user_id, medal_id)
);

-- Duelos ---------------------------------------------------------------------

create table if not exists duels (
  id integer primary key,
  a_id integer not null,
  b_id integer not null,
  text_id integer not null,
  winner_id integer,
  a_cpm integer, a_acc integer,
  b_cpm integer, b_acc integer,
  forfeit integer not null default 0,     -- 1 = termino por abandono
  at integer not null
);
create index if not exists duels_a on duels (a_id);
create index if not exists duels_b on duels (b_id);

-- Torneos --------------------------------------------------------------------

create table if not exists tournaments (
  id integer primary key,
  name text not null,
  description text not null default '',
  status text not null default 'borrador', -- borrador | inscripcion | en_curso | finalizado | cancelado
  size integer not null default 8,         -- 4, 8, 16 o 32
  access text not null default '{"mode":"open"}',  -- open | rules (minCpm, medal) | list
  starts_at integer not null default 0,
  ready_secs integer not null default 180,
  text_id integer not null default 0,
  rounds integer not null default 0,
  winner_id integer,
  created_at integer not null,
  finished_at integer not null default 0
);

create table if not exists tournament_players (
  tournament_id integer not null,
  user_id integer not null,
  seed integer not null default 0,
  source text not null default 'self',
  status text not null default 'activo',
  out_round integer not null default 0,
  joined_at integer not null,
  primary key (tournament_id, user_id)
);
create index if not exists tp_user on tournament_players (user_id);

create table if not exists tournament_matches (
  id integer primary key,
  tournament_id integer not null,
  round integer not null,
  slot integer not null,
  a_id integer, b_id integer,
  a_ready integer not null default 0,
  b_ready integer not null default 0,
  status text not null default 'pending',
  result text not null default '',
  winner_id integer,
  duel_id integer,
  deadline integer not null default 0,
  replays integer not null default 0,
  unique (tournament_id, round, slot)
);
create index if not exists tm_duel on tournament_matches (duel_id);

-- Ordenes que deja el panel y que la app procesa cada 2 segundos:
-- kind = start | cancel | add | remove | dq | advance
create table if not exists tournament_orders (
  id integer primary key,
  tournament_id integer not null,
  kind text not null,
  user_id integer not null default 0,
  match_id integer not null default 0,
  created_at integer not null,
  done_at integer not null default 0,
  result text not null default ''         -- "ok" o el motivo del error
);
create index if not exists to_open on tournament_orders (done_at);

-- Consultas utiles (solo lectura) -------------------------------------------
--
-- Top 10 de carreras normales:
--   select u.handle, max(r.cpm) as cpm from races r join users u on u.id = r.user_id
--   where r.hc = 0 group by u.id order by cpm desc limit 10;
--
-- Torneos y su estado:
--   select id, name, status, size from tournaments order by id desc;
--
-- Ordenes del panel que la app todavia no proceso:
--   select * from tournament_orders where done_at = 0;
