// Niveles y experiencia: lógica compartida entre la app y el panel (neanbit-type-admin). Los dos archivos deben ser idénticos.
// Los valores se leen de `settings.progress`; si no existe o es inválido se usan los de fábrica.

export const DEFAULT_PROGRESS = {
  xp: { race: 10, hc: 15, perfect: 5, duel: 20, tourney: 150 },
  step: 50,
  titles: [[1, 'Novato'], [3, 'Aprendiz'], [6, 'Mecanógrafo'], [10, 'Escribano'], [15, 'Veloz'], [22, 'Experto'], [30, 'Maestro'], [40, 'Leyenda']],
  goalDefault: 5,
  goalMax: 50,
};

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
  if (!titles.length || titles[0][0] !== 1) titles = d.titles.map((t) => [...t]);
  const goalMax = num(r.goalMax, 1, 200, d.goalMax);
  return { xp, step: num(r.step, 10, 1000, d.step), titles, goalDefault: num(r.goalDefault, 1, goalMax, Math.min(d.goalDefault, goalMax)), goalMax };
}

// XP total (ya sumada) a nivel. Es lo que usa la app desde que la XP se guarda al ocurrir (ver server/xp.js).
export function levelOfXp(total, rawProgress) {
  const p = cleanProgress(rawProgress);
  const xp = Math.max(0, Math.trunc(Number(total)) || 0);
  const level = Math.floor(Math.sqrt(xp / p.step)) + 1;
  const title = [...p.titles].reverse().find(([min]) => level >= min)[1];
  return { xp, level, from: p.step * (level - 1) ** 2, to: p.step * level ** 2, title };
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
