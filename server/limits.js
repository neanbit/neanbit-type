// Límites de uso en memoria y dirección real del cliente.
// Sin dependencias. Las ventanas se purgan solas, así que el mapa no crece sin límite aunque lleguen muchas direcciones distintas.

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_KEYS = 100000;

// Dirección del cliente. La cabecera cf-connecting-ip solo se cree cuando el pedido llega desde esta misma máquina
// (el túnel de Cloudflare conecta por loopback). Si alguien llega directo desde afuera, esa cabecera se ignora y no sirve
// para esquivar los límites.
export function clientIp(req) {
  const peer = req.socket?.remoteAddress || '';
  const fwd = req.headers['cf-connecting-ip'];
  if (LOOPBACK.has(peer) && typeof fwd === 'string' && /^[0-9a-f.:]{3,45}$/i.test(fwd)) return fwd;
  return peer;
}

export function createLimiter(now = () => Date.now()) {
  const marks = new Map(); // clave -> { t: [instantes], w: ventana más larga usada (ms) }

  const entry = (key, windowMs) => {
    let e = marks.get(key);
    if (!e) {
      if (marks.size >= MAX_KEYS) marks.clear();
      e = { t: [], w: windowMs };
      marks.set(key, e);
    }
    e.w = Math.max(e.w, windowMs);
    const from = now() - windowMs;
    while (e.t.length && e.t[0] <= from) e.t.shift();
    return e;
  };

  return {
    // Anota un evento y devuelve true si ya se pasó del máximo dentro de la ventana.
    hit(key, max, windowMs) {
      const e = entry(key, windowMs);
      e.t.push(now());
      return e.t.length > max;
    },
    // Sin anotar: ¿ya se llegó al máximo?
    blocked(key, max, windowMs) {
      return entry(key, windowMs).t.length >= max;
    },
    // Anota un evento sin comprobar.
    add(key, windowMs) {
      entry(key, windowMs).t.push(now());
    },
    reset(key) {
      marks.delete(key);
    },
    // Segundos hasta que se libere el evento más viejo de la ventana (para Retry-After).
    wait(key, windowMs) {
      const e = marks.get(key);
      return e?.t.length ? Math.max(1, Math.ceil((e.t[0] + windowMs - now()) / 1000)) : 1;
    },
    sweep() {
      const t = now();
      for (const [k, e] of marks) if (!e.t.length || t - e.t[e.t.length - 1] > e.w) marks.delete(k);
    },
    get size() {
      return marks.size;
    },
  };
}
