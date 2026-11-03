// Datos para la página de Estadísticas. El servidor solo entrega lo crudo (carreras compactas,
// eliminaciones, resúmenes de duelos y torneos); los cálculos por período se hacen en el navegador.

const LIMIT = 5000;

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

  return function stats(userId, rawMode) {
    const mode = Object.hasOwn(scopes, rawMode) ? rawMode : 'all';
    const where = scopes[mode];
    const rows = db.prepare(`select at, cpm, acc, text_id as t, duel from races where user_id = ? and ${where} order by at desc limit ${LIMIT}`).all(userId).reverse();
    const agg = db.prepare(`select count(*) as n, min(at) as since, coalesce(sum(xp), 0) as xp from races where user_id = ? and ${where}`).get(userId);
    const out = {
      mode, total: agg.n, since: agg.since, xp: agg.xp, capped: agg.n > rows.length,
      races: rows.map((r) => [r.at, r.cpm, r.acc, r.t, r.duel > 0 ? 1 : 0]),
    };
    if (mode === 'all') {
      out.rank = rankOf(userId);
      out.chars = top(userId, 'c', 40);
      out.words = top(userId, 'w', 20);
    } else if (mode === 'hc') {
      out.hcRank = hcRankOf(userId);
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
