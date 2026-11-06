// Entrega de un premio (recompensa cosmética, potenciador de XP o XP extra). La usan el camino de niveles (track.js) y las metas y misiones
// (misiones.js). Archivo compartido con el panel (neanbit-type-admin): los dos deben ser idénticos.
//
// Siempre se llama dentro de una transacción de quien reclama: si algo falla, se deshace todo junto con el registro del reclamo.
//
//   p   { kind: 'reward' | 'booster' | 'xp', rewardId, days, mult, hours, amount }
//   o   xp          el módulo de XP de la app (server/xp.js)
//       now         momento del reclamo
//       source      origen de la recompensa cosmética ('track', 'mission'); note, su nota
//       boosterName nombre del potenciador; boosterLike, patrón (like) de los potenciadores del mismo origen: uno nuevo arranca
//                   cuando termina el anterior, así no se desperdicia
//       xpReason    motivo del evento de XP; xpRef, su referencia (única por persona y motivo); xpNote, su nota; xpAmount, si hay que
//                   entregar menos que p.amount (por ejemplo, por un tope diario)
// Devuelve cuándo vence lo entregado (0 si no vence).
import { grant } from './rewards.js';

const HOUR = 3600000;
const DAY = 86400000;
const fail = (status, msg) => Object.assign(new Error(msg), { status });

export function deliver(db, userId, p, o) {
  const { xp, now } = o;
  if (p.kind === 'reward') {
    const expires = p.days > 0 ? now + p.days * DAY : 0;
    if (!grant(db, userId, p.rewardId, { source: o.source, note: o.note, expires })) throw fail(410, 'Esa recompensa ya no existe.');
    return expires;
  }
  if (p.kind === 'booster') {
    const last = db.prepare('select max(ends) as e from xp_boosters where user_id = ? and name like ? and ends > ?').get(userId, o.boosterLike, now).e || 0;
    const starts = Math.max(now, last);
    const ends = starts + p.hours * HOUR;
    db.prepare('insert into xp_boosters (name, mult, user_id, starts, ends, created) values (?, ?, ?, ?, ?, ?)').run(o.boosterName, p.mult, userId, starts, ends, now);
    return ends;
  }
  xp.add(userId, o.xpAmount ?? p.amount, o.xpReason, { ref: o.xpRef, note: o.xpNote, at: now });
  return 0;
}
