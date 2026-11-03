// Datos para la página de Estadísticas. El servidor solo entrega lo crudo (carreras compactas,
// eliminaciones, resúmenes de duelos y torneos); los cálculos por período se hacen en el navegador.

const LIMIT = 5000;
const MIN_POP = 5; // con menos pilotos que esto no se compara (no tiene sentido y se podría adivinar quién es quién)
const POP_TTL = 60000;

export function createStats({ db, tourneys, duelSummary, rankOf, hcRankOf }) {
  const scopes = {
    all: 'hc = 0',
    duel: 'hc = 0 and duel > 0',
    tourney: `hc = 0 and ${tourneys.raceFilter}`,
    hc: 'hc = 1',
  };

  const top = (userId, kind, n) => db.prepare('select key, n from errors where user_id = ? and kind = ? order by n desc limit ?').all(userId, kind, n);

  function duelRivals(userId) {
    return db.prepare(`
      select u.handle, u.name, count(*) as n,
        sum(case when d.winner_id = ? then 1 else 0 end) as wins,
        sum(case when d.winner_id is not null and d.winner_id != ? then 1 else 0 end) as losses
      from duels d join users u on u.id = case when d.a_id = ? then d.b_id else d.a_id end
      where d.a_id = ? or d.b_id = ? group by u.id order by n desc, wins desc, u.id limit 8`).all(userId, userId, userId, userId, userId);
  }

  function tourneyRivals(recent) {
    const by = new Map();
    for (const r of recent) {
      const cur = by.get(r.handle) || { handle: r.handle, name: r.name, n: 0, wins: 0, losses: 0 };
      cur.n++;
      if (r.win) cur.wins++; else cur.losses++;
      by.set(r.handle, cur);
    }
    return [...by.values()].sort((a, b) => b.n - a.n || b.wins - a.wins).slice(0, 8);
  }

  // Comparación con la comunidad: se calcula una vez por minuto para todos y cada persona solo recibe su percentil
  // y la mediana de los demás. Nunca sale un valor individual de otro piloto.
  let pop = null;
  function population() {
    if (pop && Date.now() - pop.at < POP_TTL) return pop;
    const best = db.prepare('select user_id as id, max(cpm) as v from races where hc = 0 group by user_id having count(*) >= 5').all();
    const avg = db.prepare(`
      select user_id as id, avg(cpm) as v from (select user_id, cpm, row_number() over (partition by user_id order by at desc) as rn from races where hc = 0)
      where rn <= 10 group by user_id having count(*) >= 5`).all();
    const hc = db.prepare('select user_id as id, max(cpm) as v from races where hc = 1 group by user_id').all();
    pop = { at: Date.now(), best, avg, hc };
    return pop;
  }

  function place(list, userId) {
    const mine = list.find((r) => r.id === userId);
    const others = list.filter((r) => r.id !== userId).map((r) => r.v).sort((a, b) => a - b);
    if (!mine || others.length < MIN_POP - 1) return null;
    const below = others.filter((v) => v < mine.v).length;
    const m = others.length >> 1;
    const median = others.length % 2 ? others[m] : (others[m - 1] + others[m]) / 2;
    return { pct: Math.round((below / others.length) * 100), mine: Math.round(mine.v), median: Math.round(median), n: others.length + 1 };
  }

  function community(userId, mode) {
    const p = population();
    if (mode === 'all') return { best: place(p.best, userId), avg: place(p.avg, userId) };
    if (mode === 'hc') return { best: place(p.hc, userId) };
    return null;
  }

  return function stats(userId, rawMode) {
    const mode = Object.hasOwn(scopes, rawMode) ? rawMode : 'all';
    const where = scopes[mode];
    const rows = db.prepare(`select at, cpm, acc, text_id as t, duel, ms from races where user_id = ? and ${where} order by at desc limit ${LIMIT}`).all(userId).reverse();
    const agg = db.prepare(`select count(*) as n, min(at) as since, coalesce(sum(xp), 0) as xp from races where user_id = ? and ${where}`).get(userId);
    const out = {
      mode, total: agg.n, since: agg.since, xp: agg.xp, capped: agg.n > rows.length,
      // El sexto valor es la duración real en ms; 0 si la carrera es anterior a que se guardara (ahí el navegador estima).
      races: rows.map((r) => [r.at, r.cpm, r.acc, r.t, r.duel > 0 ? 1 : 0, r.ms || 0]),
    };
    if (mode === 'all') {
      out.rank = rankOf(userId);
      out.chars = top(userId, 'c', 60);
      // Teclas tipeadas y errores del mismo período, para la tasa por tecla y por dedo.
      out.keys = top(userId, 'k', 120);
      out.misses = top(userId, 'x', 120);
      out.community = community(userId, 'all');
      out.words = top(userId, 'w', 20);
    } else if (mode === 'hc') {
      out.hcRank = hcRankOf(userId);
      out.community = community(userId, 'hc');
      const deaths = db.prepare(`select at, text_id as t from deaths where user_id = ? order by at desc limit ${LIMIT}`).all(userId).reverse();
      out.deaths = deaths.map((d) => [d.at, d.t]);
      out.deathsTotal = db.prepare('select count(*) as n from deaths where user_id = ?').get(userId).n;
    } else if (mode === 'duel') {
      out.duel = duelSummary(userId, 30);
      out.rivals = duelRivals(userId);
    } else {
      out.tourney = tourneys.summary(userId, 200);
      out.rivals = tourneyRivals(out.tourney.recent || []);
    }
    return out;
  };
}
