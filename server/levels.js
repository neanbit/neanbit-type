// Niveles y experiencia: lógica compartida entre la app y el panel (neanbit-type-admin). Los dos archivos deben ser idénticos.
// Los valores se leen de `settings.progress`; si no existe o es inválido se usan los de fábrica.

// Curva de niveles (desde la app v22): subir del nivel N al N+1 cuesta `base + grow × (N − 1)` XP. El total para llegar al nivel N es
//   base × (N − 1) + grow × (N − 1) × (N − 2) / 2
// Con base 100 y grow 10: el 2 llega a 100 XP, el 10 a 1.260, el 25 a 5.160, el 50 a 16.660 y el 100 a 58.410.
// (Hasta la v21 era `step × (N − 1)²`, con `step` 50: el 100 pedía 490.050 XP. Ese valor guardado ya no se usa.)
export const DEFAULT_PROGRESS = {
  // tourney = campeón de torneo; tFinal, tSemi y tPart son los valores por defecto de finalista, semifinalista y participación.
  xp: { race: 10, hc: 15, perfect: 5, duel: 20, tourney: 150, tFinal: 0, tSemi: 0, tPart: 0 },
  curve: { base: 100, grow: 10 },
  titles: [[1, 'Novato'], [3, 'Aprendiz'], [6, 'Mecanógrafo'], [10, 'Escribano'], [15, 'Veloz'], [22, 'Experto'], [30, 'Maestro'], [40, 'Leyenda'], [55, 'Virtuoso'], [70, 'Eminencia'], [85, 'Titán'], [100, 'Inmortal']],
  goalDefault: 5,
  goalMax: 50,
};

// Los títulos de fábrica hasta la v21. Si lo guardado es exactamente esto, nadie los personalizó y se pasa a los nuevos.
const LEGACY_TITLES = '1Novato|3Aprendiz|6Mecanógrafo|10Escribano|15Veloz|22Experto|30Maestro|40Leyenda';

const num = (v, min, max, def) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };

// Devuelve siempre una configuración completa y válida (nunca lanza).
export function cleanProgress(raw) {
  const d = DEFAULT_PROGRESS;
  const r = raw && typeof raw === 'object' ? raw : {};
  const xp = {};
  for (const k of Object.keys(d.xp)) xp[k] = num(r.xp?.[k], 0, 10000, d.xp[k]);
  let titles = Array.isArray(r.titles)
    ? r.titles.map((t) => [num(t?.[0], 1, 999, 0), String(t?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 24)]).filter((t) => t[0] > 0 && t[1])
    : [];
  titles.sort((a, b) => a[0] - b[0]);
  titles = titles.filter((t, i) => i === 0 || t[0] !== titles[i - 1][0]);
  if (!titles.length || titles[0][0] !== 1 || titles.map((t) => t[0] + t[1]).join('|') === LEGACY_TITLES) titles = d.titles.map((t) => [...t]);
  const goalMax = num(r.goalMax, 1, 200, d.goalMax);
  const curve = { base: num(r.curve?.base, 10, 5000, d.curve.base), grow: num(r.curve?.grow, 0, 1000, d.curve.grow) };
  return { xp, curve, titles, goalDefault: num(r.goalDefault, 1, goalMax, Math.min(d.goalDefault, goalMax)), goalMax };
}

// XP total que hace falta para llegar al nivel `level` (el nivel 1 es 0). `curve` es { base, grow } ya limpio.
export function xpAtLevel(level, curve) {
  const n = Math.max(0, Math.trunc(Number(level)) - 1);
  return curve.base * n + (curve.grow * n * (n - 1)) / 2;
}

// Nivel que corresponde a un total de XP para una curva dada: resuelve el cuadrático y corrige el redondeo.
export function levelAtXp(xp, curve) {
  const { base, grow } = curve;
  let n = grow > 0
    ? Math.floor((-(2 * base - grow) + Math.sqrt((2 * base - grow) ** 2 + 8 * grow * xp)) / (2 * grow))
    : Math.floor(xp / base);
  n = Math.max(0, n);
  while (xpAtLevel(n + 2, curve) <= xp) n++;
  while (n > 0 && xpAtLevel(n + 1, curve) > xp) n--;
  return n + 1;
}

// XP total (ya sumada) a nivel. Es lo que usa la app desde que la XP se guarda al ocurrir (ver server/xp.js).
export function levelOfXp(total, rawProgress) {
  const p = cleanProgress(rawProgress);
  const xp = Math.max(0, Math.trunc(Number(total)) || 0);
  const level = levelAtXp(xp, p.curve);
  const title = [...p.titles].reverse().find(([min]) => level >= min)[1];
  return { xp, level, from: xpAtLevel(level, p.curve), to: xpAtLevel(level + 1, p.curve), title };
}

// Cálculo anterior, por conteos. Solo lo usa la migración de xp.js para comprobar que el total nuevo coincide con el viejo.
// counts: { races, hc, perfect, wins, titles }. `races` incluye las Hardcore.
export function levelFrom(counts, rawProgress, bonus = 0) {
  const p = cleanProgress(rawProgress);
  const xp = (counts.races - counts.hc) * p.xp.race + counts.hc * p.xp.hc + counts.perfect * p.xp.perfect
    + counts.wins * p.xp.duel + counts.titles * p.xp.tourney + (Number(bonus) || 0);
  return levelOfXp(xp, rawProgress);
}

// Lee los conteos de un usuario (las tablas `races`, `duels` y `tournaments` ya existen en la app).
export function countsOf(db, userId) {
  const r = db.prepare('select count(*) as n, coalesce(sum(hc), 0) as h, coalesce(sum(acc = 100), 0) as p from races where user_id = ?').get(userId);
  const wins = db.prepare('select count(*) as n from duels where winner_id = ?').get(userId).n;
  let titles = 0;
  try { titles = db.prepare('select count(*) as n from tournaments where winner_id = ?').get(userId).n; } catch {}
  return { races: r.n, hc: r.h, perfect: r.p, wins, titles };
}
