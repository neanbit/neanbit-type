// Límites de uso en memoria y dirección real del cliente.
// Sin dependencias. Las ventanas se purgan solas y, si igual se llena el mapa, se desalojan las
// claves más inactivas: el mapa nunca se vacía entero ni crece sin límite con muchas direcciones.

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_KEYS = 100000;
const EVICT_BATCH = 1000; // claves más viejas que se desalojan de una vez al llenarse el mapa

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

  // Descarta las claves cuya ventana ya venció.
  const prune = () => {
    const t = now();
    for (const [k, e] of marks) if (!e.t.length || t - e.t[e.t.length - 1] > e.w) marks.delete(k);
  };

  // Al llenarse el mapa: primero lo vencido y, si todavía no alcanza, las claves que hace más
  // tiempo no se tocan, en bloque. Nunca se vacía el mapa entero, porque ahí también viven los
  // contadores de login y de intentos fallidos.
  const makeRoom = () => {
    prune();
    for (let n = EVICT_BATCH; n > 0 && marks.size >= MAX_KEYS; n--) {
      const oldest = marks.keys().next();
      if (oldest.done) return;
      marks.delete(oldest.value);
    }
  };

  const entry = (key, windowMs) => {
    const prev = marks.get(key);
    // Reinsertar al final deja el mapa ordenado por último uso, así el desalojo se lleva
    // primero lo que está inactivo y no el contador de un cliente que sigue reintentando.
    if (prev) marks.delete(key);
    else if (marks.size >= MAX_KEYS) makeRoom();
    const e = prev || { t: [], w: windowMs };
    marks.set(key, e);
    e.w = Math.max(e.w, windowMs);
    const from = now() - windowMs;
    while (e.t.length && e.t[0] <= from) e.t.shift();
    return e;
  };

  return {
    // Anota un evento y devuelve true si ya se pasó del máximo dentro de la ventana.
    hit(key, max, windowMs) {
      const e = entry(key, windowMs);
      // Ya bloqueado: no se anota nada, así el bloqueo no se estira y el array no crece sin techo.
      if (e.t.length > max) return true;
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
      prune();
    },
    get size() {
      return marks.size;
    },
  };
}
