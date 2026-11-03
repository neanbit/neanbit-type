// Gráficos SVG de la página de Estadísticas. Son funciones puras: reciben datos y devuelven texto HTML/SVG,
// sin tocar el DOM ni pedir nada. Los colores salen de variables CSS del tema (ver css/stats.css).

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const f1 = (n) => (Math.round(n * 10) / 10).toString();

// Dona. segs: [{ label, value, tip? }]. Cada segmento toma el color --sgN por orden.
// La leyenda lleva el número y el porcentaje, así el color nunca es lo único que dice algo.
export function donut(segs, { center = '', sub = '', aria = 'Gráfico de dona' } = {}) {
  const live = segs.filter((s) => s.value > 0);
  const total = live.reduce((a, s) => a + s.value, 0);
  if (!total) return '<p class="note">Sin datos en este período.</p>';
  let offset = 0;
  const gap = live.length > 1 ? 0.7 : 0;
  const arcs = live.map((s) => {
    const len = (s.value / total) * 100;
    const i = s.c ?? segs.indexOf(s);
    const a = `<circle class="dn-seg sg${i}" cx="50" cy="50" r="38" pathLength="100" stroke-dasharray="${f1(Math.max(0.1, len - gap))} ${f1(100 - Math.max(0.1, len - gap))}" stroke-dashoffset="${f1(-offset)}"><title>${esc(s.label)}: ${s.value} (${Math.round(len)}%)</title></circle>`;
    offset += len;
    return a;
  }).join('');
  const legend = segs.map((s, k) => (s.value > 0
    ? `<li><i class="sg${s.c ?? k}"></i><span>${esc(s.label)}</span><b>${s.value.toLocaleString('es-AR')}</b><em>${Math.round((s.value / total) * 100)}%</em></li>`
    : '')).join('');
  return `<div class="dn"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(aria)}"><circle class="dn-track" cx="50" cy="50" r="38"/><g transform="rotate(-90 50 50)">${arcs}</g>`
    + `<text class="dn-c" x="50" y="${sub ? 50 : 55}" text-anchor="middle">${esc(center)}</text>${sub ? `<text class="dn-s" x="50" y="63" text-anchor="middle">${esc(sub)}</text>` : ''}</svg>`
    + `<ul class="dn-leg">${legend}</ul></div>`;
}

// Medidor de media luna para un porcentaje de 0 a 100.
export function gauge(pct, { label = '', aria = 'Medidor' } = {}) {
  const v = Math.max(0, Math.min(100, pct));
  const r = 40;
  const arc = `M10,52 A${r},${r} 0 0 1 90,52`;
  const knob = (() => {
    const a = Math.PI * (1 - v / 100);
    return [50 + r * Math.cos(a), 52 - r * Math.sin(a)];
  })();
  return `<svg class="gg" viewBox="0 0 100 62" role="img" aria-label="${esc(aria)}: ${Math.round(v)} de 100"><path class="gg-track" d="${arc}" pathLength="100"/>`
    + `<path class="gg-fill" d="${arc}" pathLength="100" stroke-dasharray="${f1(v)} 100"/>`
    + `<circle class="gg-knob" cx="${f1(knob[0])}" cy="${f1(knob[1])}" r="3.4"/>`
    + `<text class="gg-n" x="50" y="48" text-anchor="middle">${Math.round(v)}</text>`
    + (label ? `<text class="gg-l" x="50" y="60" text-anchor="middle">${esc(label)}</text>` : '') + '</svg>';
}

// Minigráfico de tendencia para las tarjetas. values puede tener huecos (null): se saltean y se une el resto.
export function spark(values, { area = true } = {}) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v !== null && v !== undefined && Number.isFinite(v));
  if (pts.length < 2) return '';
  const W = 100, H = 28, P = 2;
  const lo = Math.min(...pts.map((p) => p[1]));
  const hi = Math.max(...pts.map((p) => p[1]));
  const span = hi - lo || 1;
  const last = values.length - 1 || 1;
  const x = (i) => P + (i / last) * (W - 2 * P);
  const y = (v) => (hi === lo ? H / 2 : P + (1 - (v - lo) / span) * (H - 2 * P));
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${f1(x(i))},${f1(y(v))}`).join('');
  const end = pts[pts.length - 1];
  const fill = area ? `<path class="sp-ar" d="${d}L${f1(x(end[0]))},${H}L${f1(x(pts[0][0]))},${H}Z"/>` : '';
  return `<svg class="sp" viewBox="0 0 ${W} ${H}" aria-hidden="true">${fill}<path class="sp-ln" d="${d}"/></svg>`
    + `<svg class="sp-dot" viewBox="0 0 ${W} ${H}" aria-hidden="true"><circle cx="${f1(x(end[0]))}" cy="${f1(y(end[1]))}" r="2.6"/></svg>`;
}

// Mapa de calor 7 x 24 (día de la semana por hora). cells[d][h] = { n, mean }.
export function heat(cells, { weekdays, unit, speed }) {
  let max = 0;
  for (const row of cells) for (const c of row) max = Math.max(max, c.n);
  if (!max) return '<p class="note">Sin carreras en este período.</p>';
  const lvl = (n) => (n ? Math.max(1, Math.ceil((n / max) * 4)) : 0);
  const head = `<div class="ht-h"><span></span>${Array.from({ length: 24 }, (_, h) => `<span>${h % 3 === 0 ? h : ''}</span>`).join('')}</div>`;
  const rows = cells.map((row, d) => `<div class="ht-r"><span class="ht-d">${weekdays[d]}</span>${row.map((c, h) =>
    `<i data-l="${lvl(c.n)}" title="${weekdays[d]} ${h}:00, ${c.n} ${c.n === 1 ? 'carrera' : 'carreras'}${c.n ? `, ${speed(Math.round(c.mean))} ${unit} de promedio` : ''}"></i>`).join('')}</div>`).join('');
  return `<div class="ht" role="img" aria-label="Mapa de calor de carreras por día y hora">${head}${rows}</div>`
    + '<p class="legend cal-legend">Menos <i data-l="0"></i><i data-l="1"></i><i data-l="2"></i><i data-l="3"></i><i data-l="4"></i> Más</p>';
}

// Dispersión velocidad contra precisión. points: [{ cpm, acc, label }] (ya en la unidad que se muestra).
export function scatter(points, { unit, width = 0 }) {
  if (points.length < 5) return '<p class="note">Hacen falta al menos 5 carreras en este período.</p>';
  const W = width || 900, H = width && width < 520 ? 240 : 300, L = width && width < 520 ? 42 : 48, R = 14, T = 14, B = 30;
  const xs = points.map((p) => p.cpm);
  const ys = points.map((p) => p.acc);
  const xLo = Math.floor(Math.min(...xs) / 10) * 10;
  const xHi = Math.max(xLo + 10, Math.ceil(Math.max(...xs) / 10) * 10);
  const yLo = Math.max(0, Math.floor(Math.min(...ys) / 5) * 5 - 5);
  const yHi = 100;
  const x = (v) => L + ((v - xLo) / (xHi - xLo)) * (W - L - R);
  const y = (v) => T + (1 - (v - yLo) / (yHi - yLo || 1)) * (H - T - B);
  const mx = xs.reduce((a, v) => a + v, 0) / xs.length;
  const my = ys.reduce((a, v) => a + v, 0) / ys.length;
  const gx = [0, 1, 2, 3, 4].map((k) => Math.round(xLo + ((xHi - xLo) * k) / 4));
  const gy = [0, 1, 2, 3].map((k) => Math.round(yLo + ((yHi - yLo) * k) / 3));
  const grid = gx.map((v) => `<line class="gl" x1="${f1(x(v))}" x2="${f1(x(v))}" y1="${T}" y2="${H - B}"/><text class="gt" x="${f1(x(v))}" y="${H - 10}" text-anchor="middle">${v}</text>`).join('')
    + gy.map((v) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text class="gt" x="${L - 8}" y="${f1(y(v) + 4)}" text-anchor="end">${v}%</text>`).join('');
  const dots = points.map((p) => `<circle class="sc-pt" cx="${f1(x(p.cpm))}" cy="${f1(y(p.acc))}" r="3"><title>${esc(p.label)}</title></circle>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Velocidad contra precisión de cada carrera">${grid}`
    + `<line class="avg" x1="${f1(x(mx))}" x2="${f1(x(mx))}" y1="${T}" y2="${H - B}"/><line class="avg" x1="${L}" x2="${W - R}" y1="${f1(y(my))}" y2="${f1(y(my))}"/>${dots}`
    + `</svg></div><p class="legend"><span>Hacia la derecha, más velocidad (${esc(unit)})</span><span>Hacia arriba, más precisión</span><span><i class="l-mean"></i>Tus promedios</span></p>`;
}

// Línea de objetivo: barra con marca de avance (para la meta de velocidad).
export function progress(pct) {
  const v = Math.max(0, Math.min(100, pct));
  return `<div class="pg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v)}"><i style="width:${f1(v)}%"></i></div>`;
}
