// Medallas: niveles, condiciones, íconos SVG y migración.
// Este archivo es IDÉNTICO en neanbit-type y en neanbit-type-admin: si se cambia uno, se copia al otro.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// ---------- Niveles ----------
// El nivel es solo el color del marco y del ícono. Un mismo ícono se puede pintar de cualquiera.
export const TIERS = [
  { id: 'bronce', label: 'Bronce', color: '#cd8a4b' },
  { id: 'gris', label: 'Gris', color: '#c4ccd8' },
  { id: 'oro', label: 'Oro', color: '#fca311' },
  { id: 'coral', label: 'Coral', color: '#ff7466' },
  { id: 'blanco', label: 'Blanco', color: '#f1f5f9' },
];
export const tierOf = (id) => (TIERS.some((t) => t.id === id) ? id : TIERS[0].id);

// ---------- Condiciones ----------
// unit: 'n' cantidad, 'speed' velocidad (se guarda en CPM; 1 WPM = 5 CPM), 'pct' porcentaje (1 a 100).
export const CONDITIONS = {
  races_total: { label: 'Carreras completadas', group: 'Constancia', unit: 'n', hint: 'Cuenta las carreras normales y las de duelo. Hardcore va aparte.' },
  cpm_max: { label: 'Velocidad máxima', group: 'Velocidad', unit: 'speed', hint: 'Su mejor carrera normal.' },
  cpm_avg: { label: 'Promedio de velocidad', group: 'Promedio', unit: 'speed', hint: 'Promedio de todas sus carreras normales.' },
  races_perfect: { label: 'Carreras sin errores (100 % de precisión)', group: 'Precisión', unit: 'n', hint: 'Carreras terminadas con precisión de 100 %.' },
  hc_races: { label: 'Carreras terminadas en Hardcore', group: 'Hardcore', unit: 'n', hint: '' },
  hc_best: { label: 'Velocidad máxima en Hardcore', group: 'Hardcore', unit: 'speed', hint: '' },
  duel_total: { label: 'Duelos jugados', group: 'Duelos', unit: 'n', hint: 'Cuenta todos, ganados o no.' },
  duel_wins: { label: 'Duelos ganados', group: 'Duelos', unit: 'n', hint: 'Incluye los ganados por abandono del rival.' },
  duel_streak: { label: 'Racha de victorias en duelos', group: 'Duelos', unit: 'n', hint: 'Su mejor racha histórica.' },
  duel_winrate: { label: '% de duelos ganados', group: 'Duelos', unit: 'pct', hint: 'Recién se evalúa desde 10 duelos jugados.' },
  duel_best_cpm: { label: 'Velocidad máxima en un duelo', group: 'Duelos', unit: 'speed', hint: '' },
  duel_avg_cpm: { label: 'Promedio de velocidad en duelos', group: 'Duelos', unit: 'speed', hint: 'Recién se evalúa desde 5 duelos jugados.' },
  duel_flawless: { label: 'Duelos ganados sin errores', group: 'Duelos', unit: 'n', hint: 'Ganados con 100 % de precisión y sin abandono.' },
  tournament_wins: { label: 'Torneos ganados', group: 'Torneos', unit: 'n', hint: 'Cuenta solos los torneos que ganó en neanbit type, más las veces que se otorgó a mano una medalla apilable marcada como «cuenta como torneo ganado» (por ejemplo, torneos jugados fuera de la app). No otorgues a mano los torneos que se juegan acá: ya cuentan.' },
  manual: { label: 'Manual (se otorga a mano)', group: 'Especiales', unit: 'n', hint: '' },
};
export const isCondition = (c) => Object.hasOwn(CONDITIONS, c);
export const groupOf = (c) => CONDITIONS[c]?.group || 'Especiales';
export const maxTarget = (c) => (CONDITIONS[c]?.unit === 'pct' ? 100 : 1000000);
export const conditionList = () => Object.entries(CONDITIONS).map(([id, c]) => ({ id, ...c }));

// Torneos ganados en el sistema (filas de `tournaments` con campeón). La tabla la crea la app; si todavía no existe, cuenta 0.
export function realTourneyWins(db, userId) {
  try { return db.prepare('select count(*) as c from tournaments where winner_id = ?').get(userId).c; } catch { return 0; }
}
// Cuántas veces cuenta una medalla manual para un usuario: lo otorgado a mano y, si es apilable y «cuenta como torneo ganado», también sus títulos reales.
export const grantCount = (m, given, wins) => (m.stackable && m.tourney ? given + wins : given);

const MIN_DUELS_RATE = 10;
const MIN_DUELS_AVG = 5;

// Valores actuales de un usuario para las condiciones pedidas (need = Set de ids de condición).
export function medalValues(db, userId, need) {
  const v = {};
  const has = (...k) => k.some((x) => need.has(x));
  if (has('races_total', 'cpm_max', 'cpm_avg')) {
    const n = db.prepare('select count(*) as c, coalesce(max(cpm), 0) as b, coalesce(round(avg(cpm)), 0) as a from races where user_id = ? and hc = 0').get(userId);
    Object.assign(v, { races_total: n.c, cpm_max: n.b, cpm_avg: n.a });
  }
  if (has('hc_races', 'hc_best')) {
    const h = db.prepare('select count(*) as c, coalesce(max(cpm), 0) as b from races where user_id = ? and hc = 1').get(userId);
    Object.assign(v, { hc_races: h.c, hc_best: h.b });
  }
  if (need.has('races_perfect')) v.races_perfect = db.prepare('select count(*) as c from races where user_id = ? and acc >= 100').get(userId).c;
  if (has('duel_total', 'duel_wins', 'duel_streak', 'duel_winrate', 'duel_best_cpm', 'duel_avg_cpm', 'duel_flawless')) {
    const rows = db.prepare('select a_id, winner_id, forfeit, a_cpm, a_acc, b_cpm, b_acc from duels where a_id = ? or b_id = ? order by at, id').all(userId, userId);
    let wins = 0, run = 0, streak = 0, flawless = 0, best = 0, sum = 0, speeds = 0;
    for (const r of rows) {
      const mine = r.a_id === userId;
      const cpm = mine ? r.a_cpm : r.b_cpm;
      const acc = mine ? r.a_acc : r.b_acc;
      const won = r.winner_id === userId;
      if (won) { wins++; run++; streak = Math.max(streak, run); if (!r.forfeit && acc === 100) flawless++; } else run = 0;
      if (cpm !== null && cpm !== undefined) { best = Math.max(best, cpm); sum += cpm; speeds++; }
    }
    Object.assign(v, {
      duel_total: rows.length, duel_wins: wins, duel_streak: streak, duel_flawless: flawless, duel_best_cpm: best,
      duel_winrate: rows.length >= MIN_DUELS_RATE ? Math.floor((wins * 100) / rows.length) : 0,
      duel_avg_cpm: rows.length >= MIN_DUELS_AVG && speeds ? Math.round(sum / speeds) : 0,
    });
  }
  if (need.has('tournament_wins')) {
    const manual = db.prepare('select coalesce(sum(um.count), 0) as c from user_medals um join medals m on m.id = um.medal_id where um.user_id = ? and m.tourney = 1').get(userId).c;
    v.tournament_wins = manual + realTourneyWins(db, userId);
  }
  return v;
}

// ---------- Migración ----------
// Agrega las columnas nuevas. Con `base` (solo la app) además:
//  - base de datos nueva: carga las medallas iniciales de medals-base.json (una sola vez);
//  - base de datos existente: completa el nivel de cada medalla y deja a Campeón apilable (una sola vez).
// Después de eso la tabla `medals` manda: nada se vuelve a crear ni a pisar al reiniciar.
export function ensureMedalSchema(db, base = null) {
  for (const sql of ["alter table medals add column tier text not null default ''", 'alter table medals add column tourney integer not null default 0']) {
    try { db.exec(sql); } catch {}
  }
  if (!base) return;
  if (db.prepare("select 1 from settings where key = 'medals_v2'").get()) return;
  db.exec('begin');
  try {
    if (db.prepare('select count(*) as n from medals').get().n === 0) {
      const add = db.prepare('insert into medals (id, name, description, icon, tier, condition, target, stackable, tourney, secret, pos) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      base.forEach((m, i) => add.run(m.id, m.name, m.description, m.icon, tierOf(m.tier), m.condition, m.target || 0, m.stackable ? 1 : 0, m.tourney ? 1 : 0, m.secret ? 1 : 0, i));
    } else {
      const byIcon = new Map(base.map((m) => [m.icon, m.tier]));
      const set = db.prepare('update medals set tier = ? where id = ?');
      for (const r of db.prepare("select id, icon from medals where tier = ''").all()) set.run(tierOf(byIcon.get(r.icon)), r.id);
      db.prepare("update medals set stackable = 1, tourney = 1 where id = 'campeon' and condition = 'manual'").run();
    }
    db.prepare("insert into settings (key, value) values ('medals_v2', '1')").run();
    db.exec('commit');
  } catch (err) {
    db.exec('rollback');
    throw err;
  }
}

// ---------- Íconos SVG ----------
// Cada ícono es un archivo server/medal-icons/<pack>/<nombre>.svg (viewBox 24x24, trazo de línea).
// Para sumar uno basta soltar el archivo y reiniciar el servicio.
export const PACKS = { base: 'Base', variados: 'Variados', torneos: 'Torneos y campeones', duelos: 'Duelos' };
export const packLabel = (id) => PACKS[id] || id.charAt(0).toUpperCase() + id.slice(1);

const ALLOWED = /^(path|circle|ellipse|rect|line|polyline|polygon|g)$/i;
function cleanInner(svg) {
  const m = /<svg\b[^>]*>([\s\S]*)<\/svg>/i.exec(svg);
  if (!m) return null;
  const inner = m[1].replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
  if (!inner || /\bon\w+\s*=|javascript:|href\s*=|style\s*=|<\s*\//.test(inner.replace(/<\/(path|circle|ellipse|rect|line|polyline|polygon|g)>/gi, ''))) return null;
  for (const tag of inner.matchAll(/<\s*([a-z0-9]+)/gi)) if (!ALLOWED.test(tag[1])) return null;
  return inner;
}

export function loadIcons(dir) {
  const icons = new Map();
  let folders = [];
  try { folders = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return icons; }
  const order = [...Object.keys(PACKS).filter((p) => folders.includes(p)), ...folders.filter((p) => !(p in PACKS)).sort()];
  for (const pack of order) {
    for (const file of readdirSync(join(dir, pack)).sort()) {
      const m = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.svg$/.exec(file);
      if (!m || icons.has(m[1])) continue;
      const inner = cleanInner(readFileSync(join(dir, pack, file), 'utf8'));
      if (inner) icons.set(m[1], { name: m[1], pack, inner });
    }
  }
  return icons;
}

// SVG final de una medalla: marco hexagonal + ícono, ambos en el color del nivel.
export function medalSvg(icons, name, tier) {
  const color = TIERS.find((t) => t.id === tier)?.color || TIERS[0].color;
  const inner = (icons.get(name)?.inner || '<circle cx="12" cy="12" r="6"/>').replaceAll('currentColor', color);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="${name}">`
    + `<path d="M48 5l37 21v44L48 91 11 70V26z" fill="#14213d" stroke="${color}" stroke-width="4"/>`
    + `<path d="M48 14l29 16.5v35L48 82 19 65.5v-35z" fill="none" stroke="${color}" stroke-opacity=".35" stroke-width="2"/>`
    + `<g transform="translate(24 24) scale(2)" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter">${inner}</g></svg>`;
}

// Nombre de archivo pedido por el navegador: «ancla--oro.svg». Sin nivel («veloz.svg», nombres viejos) usa el de la medalla.
export function medalFile(icons, db, file) {
  const m = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?:--([a-z]+))?\.svg$/.exec(file);
  if (!m || !icons.has(m[1])) return null;
  let tier = m[2];
  if (!tier) tier = db.prepare('select tier from medals where icon = ? limit 1').get(m[1])?.tier;
  const body = medalSvg(icons, m[1], tierOf(tier));
  return { body, etag: '"' + createHash('sha1').update(body).digest('hex').slice(0, 16) + '"' };
}
