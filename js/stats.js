import { api } from './api.js';
import { load, save } from './store.js';
import { donut, gauge, spark, heat, scatter, progress } from './stats-viz.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const DAY = 86400000;
const keyRows = [['qwertyuiop', 0], ['asdfghjklñ', .5], ['zxcvbnm', 1.1]];
const weekdays = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

let data = null;
let kit = null;
let mode = 'all';
let period = 30;
let metric = 'cpm';
let catMetric = 'cpm';
let textSort = 'plays';
let list = [];
let view = { cur: [], prev: [], b: { all: true } };
let range = defaultRange();
let editGoal = false;
let compare = load('statcompare', false) === true;
let fingMetric = 'rate';
const MIN_FINGER_KEYS = 40; // con menos teclas registradas en un dedo no se muestra su tasa
let lastW = 0;
const SESSION_GAP = 30 * 60000;

const sum = (l) => l.reduce((a, v) => a + v, 0);
const avg = (l) => (l.length ? sum(l) / l.length : 0);
const sorted = (l) => [...l].sort((a, b) => a - b);
const median = (l) => {
  if (!l.length) return 0;
  const s = sorted(l);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quant = (l, q) => {
  if (!l.length) return 0;
  const s = sorted(l);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const std = (l) => {
  if (l.length < 2) return 0;
  const m = avg(l);
  return Math.sqrt(avg(l.map((v) => (v - m) ** 2)));
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const date = (t, opts = { day: 'numeric', month: 'short' }) => new Date(t).toLocaleDateString('es-AR', opts);
const dayIndex = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY;
};
const sp = (cpm) => kit.speed(Math.round(cpm));

// Segundos que llevó una carrera: la duración medida si se guardó (desde la v20) y, si no, la estimada con el largo del texto.
const secsOf = (r) => (r.ms > 0 ? r.ms / 1000 : ((kit.chars?.(r.t) || 0) * 60) / r.cpm);
const timeSource = (rows) => {
  const m = rows.filter((r) => r.ms > 0).length;
  if (!rows.length || !m) return 'estimado por largo y velocidad';
  return m === rows.length ? 'medido en cada carrera' : `${Math.round((m / rows.length) * 100)}% medido, el resto estimado`;
};
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function summarize(rows) {
  const cpm = rows.map((r) => r.cpm);
  const acc = rows.map((r) => r.acc);
  return {
    n: rows.length, best: cpm.length ? Math.max(...cpm) : 0, avg: avg(cpm), med: median(cpm), sd: std(cpm),
    acc: avg(acc), perfect: acc.filter((a) => a === 100).length,
  };
}

function defaultRange() {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const from = new Date(end.getTime() - 29 * DAY);
  from.setHours(0, 0, 0, 0);
  return { from: from.getTime(), to: end.getTime() };
}
const pad2 = (n) => String(n).padStart(2, '0');
const toInput = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const fromInput = (v, end) => {
  const [y, m, d] = String(v).split('-').map(Number);
  if (!y || !m || !d) return null;
  return end ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime() : new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
};

// Límites del período elegido y del período anterior de igual largo. "Todo" no tiene anterior.
function bounds() {
  const now = Date.now();
  if (period === -1) {
    const len = range.to - range.from + 1;
    return { from: range.from, to: range.to, len, prevFrom: range.from - len, prevTo: range.from - 1, all: false };
  }
  if (!period) return { from: 0, to: now, len: 0, all: true };
  const from = now - period * DAY;
  return { from, to: now, len: period * DAY, prevFrom: from - period * DAY, prevTo: from - 1, all: false };
}

function windows() {
  const b = bounds();
  if (b.all) return { cur: list, prev: [], b };
  return {
    cur: list.filter((r) => r.at >= b.from && r.at <= b.to),
    prev: list.filter((r) => r.at >= b.prevFrom && r.at <= b.prevTo),
    b,
  };
}

// Racha de días con al menos una carrera. La actual sigue viva hasta que termine el día de hoy.
function dayStreaks() {
  const days = [...new Set(list.map((r) => dayIndex(r.at)))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i && d - days[i - 1] === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  const set = new Set(days);
  const today = dayIndex(Date.now());
  let cursor = set.has(today) ? today : today - 1;
  let current = 0;
  while (set.has(cursor)) { current++; cursor--; }
  return { current, best };
}

// Hardcore: carreras completadas seguidas sin eliminación, mezclando carreras y eliminaciones en el tiempo.
function surviveStreaks() {
  const events = [...list.map((r) => [r.at, 1]), ...data.deaths.map((d) => [d[0], 0])].sort((a, b) => a[0] - b[0]);
  let best = 0;
  let run = 0;
  for (const [, ok] of events) { run = ok ? run + 1 : 0; best = Math.max(best, run); }
  return { current: run, best };
}

function delta(cur, prev, { up = true, unit = '' } = {}) {
  if (view.b.all || !view.prev.length || !view.cur.length) return '';
  const d = cur - prev;
  if (!d) return '<em>igual que el período anterior</em>';
  return `<em class="${d > 0 === up ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}${unit} vs período anterior</em>`;
}

function spanDays() {
  if (view.b.all) return data.since ? Math.max(1, dayIndex(Date.now()) - dayIndex(data.since) + 1) : 1;
  return Math.max(1, Math.round(view.b.len / DAY));
}

const card = ([label, value, note, extra, trend]) =>
  `<div class="kpi"><small>${label}</small><b>${value}</b><span>${esc(note)}</span>${extra}${trend ? `<div class="kpi-sp">${trend}</div>` : ''}</div>`;

// Carreras del período repartidas en tramos de uno o más días (máximo unos 40), para las tendencias.
function buckets() {
  const b = view.b;
  const first = b.all ? (list[0]?.at ?? Date.now()) : b.from;
  const start = dayIndex(first);
  const end = dayIndex(Math.min(b.to, Date.now()));
  const days = Math.max(1, end - start + 1);
  const step = Math.max(1, Math.ceil(days / 40));
  const out = Array.from({ length: Math.ceil(days / step) }, () => []);
  for (const r of view.cur) {
    const k = Math.min(out.length - 1, Math.floor((dayIndex(r.at) - start) / step));
    if (k >= 0) out[k].push(r);
  }
  return out;
}
const bucketAvg = (g, key) => (g.length ? avg(g.map((r) => r[key])) : null);

function kpis() {
  const { speed, unit } = kit;
  const c = summarize(view.cur);
  const p = summarize(view.prev);
  const hc = mode === 'hc';
  const dash = (v) => (c.n ? v : '-');
  const activeDays = new Set(view.cur.map((r) => dayIndex(r.at))).size;
  const perDay = activeDays ? (c.n / activeDays).toFixed(1).replace('.', ',') : '0';
  const allBest = list.length ? Math.max(...list.map((r) => r.cpm)) : 0;
  const rank = mode === 'all' && data.rank ? `<em class="rk">#${data.rank} en el ranking</em>`
    : hc && data.hcRank ? `<em class="rk">#${data.hcRank} en el ranking Hardcore</em>` : '';
  const b = view.b;
  const deathsIn = hc ? data.deaths.filter((d) => b.all || (d[0] >= b.from && d[0] <= b.to)) : [];
  const deathsPrev = hc && !b.all ? data.deaths.filter((d) => d[0] >= b.prevFrom && d[0] <= b.prevTo) : [];
  const attempts = c.n + deathsIn.length;
  const bk = buckets();
  let run = null;
  const tCount = spark(bk.map((g) => g.length));
  const tBest = spark(bk.map((g) => { if (g.length) run = Math.max(run ?? 0, ...g.map((r) => r.cpm)); return run; }), { area: false });
  const tAvg = spark(bk.map((g) => { const v = bucketAvg(g, 'cpm'); return v === null ? null : sp(v); }));
  const tAcc = spark(bk.map((g) => bucketAvg(g, 'acc')));

  const first = [
    [hc ? 'Completadas' : 'Carreras', c.n, `${data.total} en total`, delta(c.n, p.n), tCount],
    ['Récord', dash(speed(c.best)), `${unit}${!b.all && allBest > c.best ? `, histórico ${speed(allBest)}` : ''}`, rank, tBest],
    ['Promedio', dash(sp(c.avg)), unit, delta(sp(c.avg), sp(p.avg)), tAvg],
    ['Mediana', dash(sp(c.med)), `${unit}, la mitad por encima`, ''],
  ];
  let second;
  if (hc) {
    const sv = surviveStreaks();
    second = [
      ['Eliminaciones', deathsIn.length, `${data.deathsTotal} en total`, delta(deathsIn.length, deathsPrev.length, { up: false })],
      ['Supervivencia', attempts ? Math.round((c.n / attempts) * 100) + '%' : '-', 'carreras que terminás', ''],
      ['Racha sin caer', sv.current, `carreras seguidas, mejor ${sv.best}`, ''],
      ['Días activos', activeDays, `de ${spanDays()}, ${perDay} por día`, ''],
    ];
  } else {
    const st = dayStreaks();
    second = [
      ['Precisión', dash(Math.round(c.acc) + '%'), plural(c.perfect, 'carrera perfecta', 'carreras perfectas'), delta(Math.round(c.acc), Math.round(p.acc), { unit: ' pts' }), tAcc],
      ['Consistencia', dash('±' + sp(c.sd)), `${unit} de variación`, delta(sp(c.sd), sp(p.sd), { up: false })],
      ['Racha de días', st.current, `${st.current === 1 ? 'día seguido' : 'días seguidos'}, mejor ${st.best}`, ''],
      ['Días activos', activeDays, `de ${spanDays()}, ${perDay} por día`, ''],
    ];
  }
  $('#s-cards').innerHTML = [...first, ...second].map(card).join('');

  const d = data.duel;
  const t = data.tourney;
  const roundLabel = (b) => (b.champion ? 'campeón' : ['la final', 'semifinales', 'cuartos', 'octavos'][b.rounds - b.round] || `ronda ${b.round}`);
  let strip = [];
  if (mode === 'duel' && d) {
    strip = [
      ['Duelos', d.total, `${plural(d.wins, 'ganado', 'ganados')}, ${plural(d.losses, 'perdido', 'perdidos')}`, ''],
      ['Victorias', d.rate + '%', 'de tus duelos', ''],
      ['Racha', d.streak, `${d.streak === 1 ? 'victoria seguida' : 'victorias seguidas'}, mejor ${d.bestStreak}`, ''],
      ['Récord en duelo', speed(d.best), unit, ''],
      ['Promedio en duelo', speed(d.avg), `${unit}, precisión ${d.acc}%`, ''],
    ];
  } else if (mode === 'tourney' && t) {
    strip = [
      ['Torneos', t.entered, `${plural(t.titles, 'título', 'títulos')}, ${plural(t.finals, 'final', 'finales')}${t.bestRound ? `, mejor: ${roundLabel(t.bestRound)}` : ''}`, ''],
      ['Partidos', t.total, `${plural(t.wins, 'ganado', 'ganados')}, ${plural(t.losses, 'perdido', 'perdidos')}`, ''],
      ['Victorias', t.rate + '%', 'de tus partidos', ''],
      ['Récord en torneo', speed(t.best), unit, ''],
      ['Promedio en torneo', speed(t.avg), `${unit}, precisión ${t.acc}%`, ''],
    ];
  } else if (mode === 'all') {
    const duels = list.filter((r) => r.duel).length;
    // Desde la v20 se guarda la duración real de cada carrera; en las anteriores el tiempo se estima con el largo del texto y la velocidad.
    const typed = sum(list.map((r) => kit.chars?.(r.t) || 0));
    const mins = Math.round(sum(list.map(secsOf)) / 60);
    const timed = list.filter((r) => r.ms > 0);
    strip = [
      ['Caracteres tipeados', typed.toLocaleString('es-AR'), 'en total, sin contar eliminaciones', ''],
      ['Tiempo tipeando', mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`, timeSource(list), ''],
      ...(timed.length ? [['Duración media', clock(avg(timed.map((r) => r.ms)) / 1000), `por carrera, de ${plural(timed.length, 'medida', 'medidas')}`, '']] : []),
      ['Carreras en duelo', duels, `${list.length ? Math.round((duels / list.length) * 100) : 0}% del total`, ''],
      ['Experiencia', data.xp.toLocaleString('es-AR'), 'XP ganada en estas carreras', ''],
    ];
  }
  const box = $('#s-cards2');
  box.hidden = !strip.length;
  box.style.setProperty('--cols', strip.length || 1);
  box.innerHTML = strip.map(card).join('');
}

function chart() {
  const { speed, unit } = kit;
  const acc = metric === 'acc' && mode !== 'hc';
  const name = acc ? 'Evolución de la precisión' : 'Evolución de la velocidad';
  $('#s-chart-title').textContent = name;
  const chartNote = $('#s-chart-note');
  chartNote.textContent = '';
  if (compare && !view.b.all) {
    if (view.prev.length && view.cur.length) return compareChart(acc, name);
    if (!view.prev.length) chartNote.textContent = 'No hay carreras en el período anterior para comparar.';
  }
  const rows = view.cur;
  if (rows.length < 2) {
    $('#s-chart').innerHTML = '<p class="note">Hacen falta al menos dos carreras en este período para dibujar la evolución.</p>';
    $('#s-legend').innerHTML = '';
    return;
  }
  const byDay = rows.length > 140;
  let points;
  if (byDay) {
    const groups = new Map();
    for (const r of rows) {
      const k = dayIndex(r.at);
      groups.set(k, [...(groups.get(k) || []), r]);
    }
    points = [...groups.values()].map((g) => ({
      v: acc ? avg(g.map((r) => r.acc)) : speed(Math.round(avg(g.map((r) => r.cpm)))), at: g[0].at, n: g.length,
    }));
  } else {
    points = rows.map((r) => ({ v: acc ? r.acc : speed(r.cpm), at: r.at, n: 1, acc: r.acc }));
  }
  if (points.length < 2) {
    $('#s-chart').innerHTML = '<p class="note">Hacen falta al menos dos días con carreras para dibujar la evolución.</p>';
    $('#s-legend').innerHTML = '';
    return;
  }
  const values = points.map((p) => p.v);
  // El ancho sale del contenedor para que las letras se vean del tamaño real también en el celular.
  const cw = Math.round($('#s-chart').clientWidth);
  lastW = cw;
  const W = cw || 900;
  const H = cw && cw < 520 ? 240 : 290;
  const L = cw && cw < 520 ? 40 : 48, R = 14, T = 16, B = 30;
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const pad = Math.max(1, Math.round((hi - lo) * .12));
  const top = acc ? Math.min(100, hi + pad) : hi + pad;
  const bottom = Math.max(0, lo - pad);
  const span = top - bottom || 1;
  const x = (i) => L + (i / (values.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - bottom) / span) * (H - T - B);
  const win = byDay ? 3 : 5;
  const smooth = values.map((_, i) => avg(values.slice(Math.max(0, i - win + 1), i + 1)));
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const line = path(values);
  const area = `${line}L${x(values.length - 1).toFixed(1)},${H - B}L${L},${H - B}Z`;
  const ticks = [0, 1, 2, 3, 4].map((k) => Math.round(bottom + (span * k) / 4));
  const grid = ticks.map((t) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="gt" x="${L - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${t}</text>`).join('');
  const labels = [0, 1, 2, 3, 4].map((k) => {
    const i = Math.round((k / 4) * (values.length - 1));
    return `<text class="gt" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}">${date(points[i].at)}</text>`;
  }).join('');
  const mean = avg(values);
  const meanLine = `<line class="avg" x1="${L}" x2="${W - R}" y1="${y(mean).toFixed(1)}" y2="${y(mean).toFixed(1)}"/>`;
  const bestAt = values.indexOf(hi);
  const dots = values.map((v, i) => {
    const r = i === bestAt ? 5 : values.length > 60 ? 0 : values.length > 35 ? 2 : 3;
    return r ? `<circle class="${i === bestAt ? 'rec' : 'pt'}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${r}"/>` : '';
  }).join('');
  const tipOf = (i) => {
    const p = points[i];
    const v = values[i];
    const when = `${date(p.at, { day: 'numeric', month: 'long' })}${byDay ? `, ${plural(p.n, 'carrera', 'carreras')}` : ''}`;
    const main = acc ? `${Math.round(v)}%` : `${v} ${unit}`;
    const extra = acc ? 'de precisión' : byDay ? 'de promedio' : `${p.acc}% de precisión`;
    return `<b>${main}</b> ${extra}<span>${esc(when)}</span><span>media móvil ${acc ? Math.round(smooth[i]) + '%' : Math.round(smooth[i])}</span>`;
  };
  $('#s-chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${name}">${grid}${labels}<path class="ar" d="${area}"/>${meanLine}<path class="ln" d="${line}"/><path class="mv" d="${path(smooth)}"/>${dots}`
    + `<line class="xh-line" y1="${T}" y2="${H - B}" hidden/><circle class="xh-dot" r="5" hidden/></svg><div class="xh-tip" hidden></div>`;
  crosshair({ W, L, R, n: values.length, x, y, values, tipOf });
  $('#s-legend').innerHTML = `<span><i class="l-line"></i>${byDay ? 'Promedio diario' : 'Carrera'}</span><span><i class="l-avg"></i>Media móvil de ${win}</span><span><i class="l-mean"></i>Promedio del período</span><span><i class="l-rec"></i>Mejor punto</span>`;
}

// Evolución con el período anterior superpuesto. Los dos períodos tienen el mismo largo, así que cada tramo de uno
// se alinea con el mismo tramo del otro (día contra día) y las líneas se leen de verdad una encima de la otra.
function compareChart(acc, name) {
  const { speed, unit } = kit;
  const b = view.b;
  const box = $('#s-chart');
  const days = Math.max(1, Math.round(b.len / DAY));
  const step = Math.max(1, Math.ceil(days / 45));
  const n = Math.ceil(days / step);
  if (n < 2) {
    box.innerHTML = '<p class="note">Para comparar elegí un período de al menos 2 días.</p>';
    $('#s-legend').innerHTML = '';
    return;
  }
  const size = step * DAY;
  const group = (rows, from) => {
    const g = Array.from({ length: n }, () => []);
    for (const r of rows) {
      const k = Math.min(n - 1, Math.floor((r.at - from) / size));
      if (k >= 0) g[k].push(r);
    }
    return g.map((rs) => (rs.length ? { v: acc ? avg(rs.map((r) => r.acc)) : speed(Math.round(avg(rs.map((r) => r.cpm)))), n: rs.length } : null));
  };
  const cur = group(view.cur, b.from);
  const prev = group(view.prev, b.prevFrom);
  const all = [...cur, ...prev].filter(Boolean).map((q) => q.v);
  const cw = Math.round(box.clientWidth);
  lastW = cw;
  const W = cw || 900;
  const H = cw && cw < 520 ? 240 : 290;
  const L = cw && cw < 520 ? 40 : 48, R = 14, T = 16, B = 30;
  const hi = Math.max(...all);
  const lo = Math.min(...all);
  const pad = Math.max(1, Math.round((hi - lo) * .12));
  const top = acc ? Math.min(100, hi + pad) : hi + pad;
  const bottom = Math.max(0, lo - pad);
  const span = top - bottom || 1;
  const x = (i) => L + (i / (n - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - bottom) / span) * (H - T - B);
  // Los días sin carreras no cortan la línea: une los puntos que hay.
  const path = (arr) => arr.reduce((d, q, i) => (q ? `${d}${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(q.v).toFixed(1)}` : d), '');
  const dots = (arr, cls) => arr.map((q, i) => (q ? `<circle class="${cls}" cx="${x(i).toFixed(1)}" cy="${y(q.v).toFixed(1)}" r="${n > 35 ? 2 : 3}"/>` : '')).join('');
  const ticks = [0, 1, 2, 3, 4].map((k) => Math.round(bottom + (span * k) / 4));
  const grid = ticks.map((t) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="gt" x="${L - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${t}</text>`).join('');
  const labels = [0, 1, 2, 3, 4].map((k) => {
    const i = Math.round((k / 4) * (n - 1));
    return `<text class="gt" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}">${date(b.from + i * size)}</text>`;
  }).join('');
  const when = (from, i) => {
    const a = from + i * size;
    return step === 1 ? date(a, { day: 'numeric', month: 'long' }) : `${date(a)} al ${date(Math.min(a + size - 1, from + b.len - 1))}`;
  };
  const fmt = (q) => (acc ? `${Math.round(q.v)}%` : `${q.v} ${unit}`);
  const tipOf = (i) => {
    const c = cur[i];
    const p = prev[i];
    return (c ? `<b>${fmt(c)}</b> este período<span>${esc(when(b.from, i))}, ${plural(c.n, 'carrera', 'carreras')}</span>`
      : `<span class="gap">Sin carreras este período (${esc(when(b.from, i))})</span>`)
      + (p ? `<div class="pv"><b>${fmt(p)}</b> período anterior<span>${esc(when(b.prevFrom, i))}, ${plural(p.n, 'carrera', 'carreras')}</span></div>`
        : '<span class="gap">Sin carreras en el período anterior</span>');
  };
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${name}, comparada con el período anterior">${grid}${labels}`
    + `<path class="ln pv" d="${path(prev)}"/><path class="ln" d="${path(cur)}"/>${dots(prev, 'pt pv')}${dots(cur, 'pt')}`
    + `<line class="xh-line" y1="${T}" y2="${H - B}" hidden/><circle class="xh-dot" r="5" hidden/></svg><div class="xh-tip" hidden></div>`;
  crosshair({ W, L, R, n, x, y, values: [], tipOf, dotAt: (i) => (cur[i] ? y(cur[i].v) : prev[i] ? y(prev[i].v) : null) });
  $('#s-legend').innerHTML = `<span><i class="l-line"></i>Este período</span><span><i class="l-prev"></i>Período anterior, alineado día contra día</span><span>Cada punto es el promedio de ${step === 1 ? 'un día' : plural(step, 'día', 'días')}</span>`;
  const c = summarize(view.cur);
  const p = summarize(view.prev);
  const a1 = acc ? c.acc : c.avg;
  const a0 = acc ? p.acc : p.avg;
  const d = acc ? Math.round(a1) - Math.round(a0) : sp(a1) - sp(a0);
  const fm = (v) => (acc ? `${Math.round(v)}%` : `${sp(v)} ${unit}`);
  $('#s-chart-note').textContent = `Promedio de este período: ${fm(a1)} en ${plural(c.n, 'carrera', 'carreras')}. Período anterior: ${fm(a0)} en ${plural(p.n, 'carrera', 'carreras')}. `
    + (d === 0 ? 'Sin diferencia.' : `Diferencia: ${d > 0 ? '+' : ''}${d}${acc ? ' pts' : ' ' + unit}.`);
}

// Cruz de lectura: una línea vertical sigue al puntero y muestra el valor exacto de la carrera (o del día) más cercana.
function crosshair({ W, L, R, n, x, y, values, tipOf, dotAt }) {
  const box = $('#s-chart');
  const svg = box.querySelector('svg');
  const line = svg.querySelector('.xh-line');
  const dot = svg.querySelector('.xh-dot');
  const tip = box.querySelector('.xh-tip');
  const mark = (on) => { line.toggleAttribute('hidden', !on); dot.toggleAttribute('hidden', !on); tip.hidden = !on; }; // en SVG no existe la propiedad hidden, hay que usar el atributo
  const hide = () => mark(false);
  const show = (e) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((vx - L) / (W - L - R)) * (n - 1))));
    const px = x(i);
    line.setAttribute('x1', px.toFixed(1));
    line.setAttribute('x2', px.toFixed(1));
    dot.setAttribute('cx', px.toFixed(1));
    const py = dotAt ? dotAt(i) : y(values[i]);
    if (py !== null) dot.setAttribute('cy', py.toFixed(1));
    tip.innerHTML = tipOf(i);
    mark(true);
    if (py === null) dot.setAttribute('hidden', '');
    tip.style.left = `${(px / W) * 100}%`;
    tip.classList.toggle('flip', px / W > 0.62);
  };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('pointercancel', hide);
}

function calendar() {
  const counts = new Map();
  for (const r of list) {
    const k = dayIndex(r.at);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const weeks = 26;
  const today = dayIndex(Date.now());
  const dow = (new Date().getDay() + 6) % 7;
  const first = today - dow - (weeks - 1) * 7;
  const cells = [];
  let max = 0;
  let total = 0;
  let active = 0;
  for (let i = 0; i < weeks * 7; i++) {
    const idx = first + i;
    if (idx > today) { cells.push(null); continue; }
    const n = counts.get(idx) || 0;
    max = Math.max(max, n);
    total += n;
    if (n) active++;
    cells.push({ idx, n });
  }
  const level = (n) => (n ? Math.max(1, Math.ceil((n / max) * 4)) : 0);
  const grid = cells.map((c) => (c ? `<i data-l="${level(c.n)}" title="${plural(c.n, 'carrera', 'carreras')}, ${date(c.idx * DAY, { day: 'numeric', month: 'long', timeZone: 'UTC' })}"></i>` : '<i class="off"></i>')).join('');
  let prevMonth = -1;
  const months = Array.from({ length: weeks }, (_, w) => {
    const d = new Date((first + w * 7) * DAY);
    const m = d.getUTCMonth();
    const show = m !== prevMonth;
    prevMonth = m;
    return `<span>${show ? d.toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' }) : ''}</span>`;
  }).join('');
  $('#s-cal').innerHTML = `<div class="cal"><div class="cal-days"><span>lun</span><span></span><span>mié</span><span></span><span>vie</span><span></span><span>dom</span></div><div class="cal-main"><div class="cal-m">${months}</div><div class="cal-grid">${grid}</div></div></div>`
    + '<p class="legend cal-legend">Menos <i data-l="0"></i><i data-l="1"></i><i data-l="2"></i><i data-l="3"></i><i data-l="4"></i> Más</p>';
  $('#s-cal-note').textContent = `${plural(total, 'carrera', 'carreras')} en 26 semanas, ${plural(active, 'día activo', 'días activos')}`;
}

function bars(items) {
  const top = Math.max(1, ...items.map((i) => i.v));
  return `<div class="bars" style="--n:${items.length}">${items.map((i) =>
    `<div class="${i.hot ? 'hot' : ''}" title="${esc(i.title)}"><i style="--h:${i.v / top}"></i><span>${esc(i.label)}</span></div>`).join('')}</div>`;
}

function groupBy(rows, key, count) {
  const out = Array.from({ length: count }, () => []);
  for (const r of rows) out[key(r)].push(r);
  return out;
}

let rh = { hot: -1, wk: -1 };

function rhythm() {
  const { unit } = kit;
  const rows = view.cur;
  const hours = groupBy(rows, (r) => new Date(r.at).getHours(), 24);
  const week = groupBy(rows, (r) => (new Date(r.at).getDay() + 6) % 7, 7);
  const mean = (g) => avg(g.map((r) => r.cpm));
  const fastest = (groups, min) => {
    let at = -1;
    groups.forEach((g, i) => { if (g.length >= min && (at < 0 || mean(g) > mean(groups[at]))) at = i; });
    return at;
  };
  const tip = (g, name) => `${name}: ${plural(g.length, 'carrera', 'carreras')}${g.length ? `, ${sp(mean(g))} ${unit} de promedio` : ''}`;
  const hot = fastest(hours, 3);
  rh = { hot, wk: fastest(week, 3), hours, week, mean };
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ n: 0, mean: 0 })));
  const slotRows = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => []));
  for (const r of rows) {
    const d = new Date(r.at);
    slotRows[(d.getDay() + 6) % 7][d.getHours()].push(r);
  }
  let busiest = null;
  slotRows.forEach((row, d) => row.forEach((g, h) => {
    cells[d][h] = { n: g.length, mean: g.length ? mean(g) : 0 };
    if (g.length && (!busiest || g.length > busiest.n)) busiest = { d, h, n: g.length };
  }));
  $('#s-heat').innerHTML = heat(cells, { weekdays, unit, speed: kit.speed });
  $('#s-heat-note').textContent = busiest
    ? `Tu momento más frecuente es ${weekdays[busiest.d]} de ${busiest.h} a ${busiest.h + 1} h, con ${plural(busiest.n, 'carrera', 'carreras')}.` : '';
  $('#s-hours').innerHTML = bars(hours.map((g, i) => ({ v: g.length, label: i % 3 === 0 ? String(i) : '', title: tip(g, `${i}:00 a ${i}:59`), hot: i === hot })));
  $('#s-hours-note').textContent = hot < 0 ? 'Hacen falta al menos 3 carreras en una misma hora para marcar tu franja más rápida.'
    : `Tu franja más rápida es de ${hot} a ${hot + 1} h: ${sp(mean(hours[hot]))} ${unit} de promedio (${plural(hours[hot].length, 'carrera', 'carreras')}). Las barras muestran cuántas corriste.`;
  const wk = fastest(week, 3);
  $('#s-week').innerHTML = bars(week.map((g, i) => ({ v: g.length, label: weekdays[i], title: tip(g, weekdays[i]), hot: i === wk })));
  $('#s-week-note').textContent = wk < 0 ? 'Hacen falta al menos 3 carreras en un mismo día de la semana para compararlos.'
    : `Corrés más rápido los ${['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'][wk]}: ${sp(mean(week[wk]))} ${unit} de promedio.`;
}

function histogram() {
  const { speed, unit } = kit;
  const values = view.cur.map((r) => speed(r.cpm));
  if (values.length < 3) {
    $('#s-hist').innerHTML = '<p class="note">Hacen falta al menos 3 carreras en este período.</p>';
    $('#s-hist-note').textContent = '';
    return;
  }
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const width = [2, 5, 10, 20, 25, 50, 100].find((w) => Math.floor(hi / w) - Math.floor(lo / w) + 1 <= 14) || 100;
  const start = Math.floor(lo / width) * width;
  const count = Math.floor(hi / width) - Math.floor(lo / width) + 1;
  const bins = Array.from({ length: count }, (_, i) => ({ from: start + i * width, n: 0 }));
  for (const v of values) bins[Math.floor((v - start) / width)].n++;
  const mid = Math.floor((median(values) - start) / width);
  $('#s-hist').innerHTML = bars(bins.map((b, i) => ({
    v: b.n, label: i % (count > 9 ? 2 : 1) === 0 ? String(b.from) : '', title: `${b.from} a ${b.from + width - 1} ${unit}: ${plural(b.n, 'carrera', 'carreras')}`, hot: i === mid,
  })));
  $('#s-hist-note').textContent = `La mitad de tus carreras está entre ${Math.round(quant(values, .25))} y ${Math.round(quant(values, .75))} ${unit}. La barra marcada es la de tu mediana.`;
}

function categories() {
  const { speed, category, unit } = kit;
  const acc = catMetric === 'acc';
  $('#s-cats-title').textContent = acc ? 'Precisión por categoría' : 'Velocidad por categoría';
  const by = new Map();
  for (const r of view.cur) {
    const c = category(r.t);
    if (!c) continue;
    by.set(c, [...(by.get(c) || []), r]);
  }
  const rows = [...by].map(([name, v]) => ({
    name, n: v.length, best: Math.max(...v.map((r) => r.cpm)), cpm: avg(v.map((r) => r.cpm)), acc: avg(v.map((r) => r.acc)),
  })).sort((a, b) => (acc ? b.acc - a.acc : b.cpm - a.cpm));
  const vals = rows.map((c) => (acc ? c.acc : c.cpm));
  const floor = acc ? Math.max(0, Math.floor(Math.min(...vals, 100)) - 10) : 0;
  const top = acc ? 100 : Math.max(1, ...vals);
  $('#s-cats').innerHTML = rows.length
    ? rows.map((c, i) => `<li><span>${esc(c.name)}<small>${plural(c.n, 'carrera', 'carreras')}, ${acc ? `${speed(Math.round(c.cpm))} ${unit} de promedio` : `mejor ${speed(c.best)}`}</small></span><div><i style="width:${Math.max(2, ((vals[i] - floor) / (top - floor || 1)) * 100)}%"></i></div><b>${acc ? Math.round(c.acc) + '%' : speed(Math.round(c.cpm))}</b></li>`).join('')
    : '<li class="none">Sin datos por categoría en este período.</li>';
  if (acc && rows.length) $('#s-cats').insertAdjacentHTML('beforeend', `<li class="none"><small>Las barras de precisión empiezan en ${floor}% para que se noten las diferencias.</small></li>`);
  $('#s-cats').setAttribute('aria-label', (acc ? 'Precisión media en %' : 'Velocidad media en ' + unit));
}

function texts() {
  const { unit, label } = kit;
  const by = new Map();
  for (const r of view.cur) by.set(r.t, [...(by.get(r.t) || []), r]);
  const rows = [...by].map(([id, v]) => ({ id, n: v.length, best: Math.max(...v.map((r) => r.cpm)), mean: avg(v.map((r) => r.cpm)), last: v[v.length - 1].at }))
    .sort((a, b) => (textSort === 'best' ? b.best - a.best : b.n - a.n || b.best - a.best)).slice(0, 8);
  $('#s-texts').innerHTML = rows.length
    ? `<table class="s-table"><thead><tr><th>Texto</th><th>Veces</th><th>Mejor (${unit})</th><th>Promedio</th><th>Última</th></tr></thead><tbody>${rows.map((r) =>
      `<tr><td>${esc(label(r.id))}</td><td>${r.n}</td><td><b>${sp(r.best)}</b></td><td>${sp(r.mean)}</td><td>${date(r.last)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="note">Sin textos jugados en este período.</p>';
}

function records() {
  const { speed, unit, label } = kit;
  let top = 0;
  const found = [];
  for (const r of list) {
    if (r.cpm > top) { found.push({ ...r, gain: top ? speed(r.cpm) - speed(top) : null }); top = r.cpm; }
  }
  $('#s-recs-note').textContent = found.length ? plural(found.length, 'récord batido', 'récords batidos') : '';
  $('#s-recs').innerHTML = found.length
    ? found.slice(-8).reverse().map((r) => `<li><b>${speed(r.cpm)}</b><span>${unit}, ${esc(label(r.t))}</span><em>${r.gain === null ? 'primero' : `+${r.gain}`}</em><small>${date(r.at, { day: 'numeric', month: 'short', year: 'numeric' })}</small></li>`).join('')
    : '<li class="none">Todavía no hay récords registrados.</li>';
}

function versus(rivals, target, none) {
  const top = Math.max(1, ...rivals.map((r) => r.n));
  $(target).innerHTML = rivals.length
    ? rivals.map((r) => `<li><span>${esc(r.name)}<small>${plural(r.n, 'partida', 'partidas')}</small></span><div><i style="width:${(r.n / top) * 100}%"></i></div><b>${r.wins}-${r.losses}</b></li>`).join('')
    : `<li class="none">${none}</li>`;
}

function matchList(rows, target, fn, none) {
  $(target).innerHTML = rows.length ? rows.slice(0, 10).map(fn).join('') : `<li class="none"><span>${none}</span></li>`;
}

function duels() {
  const recent = data.duel.recent || [];
  $('#s-duel-strip').innerHTML = recent.length
    ? `<p class="s-note">Últimos ${recent.length} duelos, del más viejo al más nuevo</p><div>${[...recent].reverse().map((r) =>
      `<i class="${r.win === null ? 'none' : r.win ? 'win' : 'loss'}" title="${r.win === null ? 'Sin ganador' : r.win ? 'Ganado' : 'Perdido'} contra ${esc(r.name)}, ${date(r.at)}"></i>`).join('')}</div>`
    : '';
  versus(data.rivals, '#s-duel-rivals', 'Todavía no jugaste duelos.');
  matchList(recent, '#s-duel-list', (r) => {
    const label = r.win === null ? 'Sin ganador' : r.win ? (r.forfeit ? 'Ganado por abandono' : 'Ganado') : 'Perdido';
    const mine = r.cpm === null ? '-' : kit.speed(r.cpm);
    const theirs = r.rcpm === null ? '-' : kit.speed(r.rcpm);
    return `<li class="${r.win ? 'won' : ''}"><b>${label}</b><span>contra ${esc(r.name)}</span><em>${mine} vs ${theirs} ${kit.unit}</em><small>${date(r.at)}</small></li>`;
  }, 'Todavía no jugaste duelos.');
}

function tourneys() {
  const recent = data.tourney.recent || [];
  versus(data.rivals, '#s-tourney-rivals', 'Todavía no jugaste partidos de torneo.');
  matchList(recent, '#s-tourney-list', (r) => {
    const mine = r.cpm === null ? '-' : kit.speed(r.cpm);
    const theirs = r.rcpm === null ? '-' : kit.speed(r.rcpm);
    const stage = ['Final', 'Semifinal', 'Cuartos de final', 'Octavos de final'][r.rounds - r.round] || `Ronda ${r.round}`;
    return `<li class="${r.win ? 'won' : ''}"><b>${r.win ? 'Ganado' : 'Perdido'}</b><span>${esc(stage)} de ${esc(r.tournament)}, contra ${esc(r.name)}</span><em>${mine} vs ${theirs} ${kit.unit}</em><small>${r.at ? date(r.at) : ''}</small></li>`;
  }, 'Todavía no jugaste partidos de torneo.');
}

function hardcore() {
  const { from, to } = view.b;
  const by = new Map();
  const slot = (t) => {
    if (!by.has(t)) by.set(t, { t, deaths: 0, done: 0 });
    return by.get(t);
  };
  for (const [at, t] of data.deaths) if (at >= from && at <= to) slot(t).deaths++;
  for (const r of view.cur) slot(r.t).done++;
  const rows = [...by.values()].filter((r) => r.deaths).sort((a, b) => b.deaths - a.deaths || a.done - b.done).slice(0, 8);
  const top = Math.max(1, ...rows.map((r) => r.deaths));
  $('#s-hc-texts').innerHTML = rows.length
    ? rows.map((r) => `<li><span>${esc(kit.label(r.t))}<small>${plural(r.deaths, 'eliminación', 'eliminaciones')}, ${plural(r.done, 'completada', 'completadas')}</small></span><div><i style="width:${(r.deaths / top) * 100}%"></i></div><b>${Math.round((r.done / (r.done + r.deaths)) * 100)}%</b></li>`).join('')
    : '<li class="none">No tuviste eliminaciones en este período.</li>';
  $('#s-hc-note').textContent = rows.length ? 'El porcentaje es la supervivencia en ese texto: carreras completadas sobre completadas más eliminaciones.' : '';
}

function keyboard() {
  const misses = {};
  for (const { key, n } of data.chars) {
    const base = key === 'ñ' ? key : key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    misses[base] = (misses[base] || 0) + n;
  }
  const top = Math.max(1, ...Object.values(misses));
  const worst = Object.entries(misses).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const board = keyRows.map(([row, shift]) =>
    `<div style="margin-left:${shift * 3}rem">${[...row].map((k) => `<span class="kk${misses[k] ? ' hit' : ''}" style="--h:${(misses[k] || 0) / top}" title="${misses[k] || 0} errores">${k}${misses[k] ? `<small>${misses[k]}</small>` : ''}</span>`).join('')}</div>`).join('');
  $('#s-keys').innerHTML = `<div class="kb-board">${board}</div>`
    + (worst.length
      ? `<p class="kb-top">Más fallas: ${worst.map(([k, n]) => `<b>${esc(k)}</b> ${n}`).join(', ')}</p>`
      : '<p class="kb-top">Todavía no registraste errores de teclas.</p>');
}

function words() {
  const rows = data.words.slice(0, 10);
  const top = Math.max(1, ...rows.map((w) => w.n));
  $('#s-words').innerHTML = rows.length
    ? rows.map((w, i) => `<li><span class="n">${i + 1}</span><span class="w">${esc(w.key)}</span><div><i style="width:${(w.n / top) * 100}%"></i></div><b>${w.n}</b></li>`).join('')
    : '<li class="none">Todavía no registraste errores.</li>';
  $('#s-train').hidden = data.words.length < 5;
}

// ---------- tendencia, meta y comparación ----------

// Recta de mínimos cuadrados sobre el promedio diario de velocidad. Necesita al menos 5 días y 8 carreras.
function trend() {
  const by = new Map();
  for (const r of view.cur) {
    const k = dayIndex(r.at);
    by.set(k, [...(by.get(k) || []), r.cpm]);
  }
  const pts = [...by].map(([k, v]) => [k, avg(v)]).sort((a, b) => a[0] - b[0]);
  if (pts.length < 5 || view.cur.length < 8) return null;
  const mx = avg(pts.map((q) => q[0]));
  const my = avg(pts.map((q) => q[1]));
  let num = 0;
  let den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  if (!den) return null;
  return { perDay: num / den, days: pts[pts.length - 1][0] - pts[0][0] + 1 };
}
const conv = (cpm) => (cpm * kit.speed(1000)) / 1000; // CPM a la unidad elegida, sin redondear

function goalBlock() {
  const goal = load('statgoal', 0);
  const { speed, unit } = kit;
  const box = $('#s-goal');
  const note = $('#s-goal-note');
  note.textContent = '';
  if (!goal || editGoal) {
    box.innerHTML = `<p class="insight first">Elegí una velocidad que quieras alcanzar y seguí tu avance. Se guarda solo en este navegador.</p>`
      + `<div class="goal-form"><input type="number" inputmode="numeric" id="s-goal-in" min="1" placeholder="${esc(unit)}" aria-label="Meta en ${esc(unit)}" value="${goal ? speed(goal) : ''}"><button class="primary" data-act="set">Fijar meta</button>${goal ? '<button data-act="cancel">Cancelar</button>' : ''}</div>`;
    return;
  }
  const last = list.slice(-10).map((r) => r.cpm);
  const level = last.length ? avg(last) : 0;
  const best = list.length ? Math.max(...list.map((r) => r.cpm)) : 0;
  const pct = Math.min(100, (level / goal) * 100);
  const t = trend();
  let line;
  if (level >= goal) line = 'Tu promedio de las últimas 10 ya alcanzó la meta. Podés fijar una más alta.';
  else if (!t) line = 'Para estimar cuándo llegás hacen falta al menos 5 días con carreras (y 8 carreras) en el período elegido.';
  else if (t.perDay <= 0) line = 'Con la tendencia de este período no te acercás a la meta: probá con un período más largo o con más práctica.';
  else {
    const days = (goal - level) / t.perDay;
    line = days > 365 ? 'A este ritmo tardarías más de un año.'
      : `A este ritmo llegarías en unos ${plural(Math.max(1, Math.ceil(days)), 'día', 'días')} (hacia el ${date(Date.now() + days * DAY, { day: 'numeric', month: 'long' })}). Estimación lineal, sirve de guía.`;
  }
  note.textContent = best >= goal ? 'Récord por encima de la meta' : `Récord al ${Math.round((best / goal) * 100)}% de la meta`;
  box.innerHTML = `<div class="goal-big"><b>${speed(Math.round(level))}</b><span>de ${speed(goal)} ${esc(unit)}, promedio de las últimas ${last.length}</span></div>${progress(pct)}`
    + `<p class="insight">${esc(line)}${t && t.perDay > 0 ? ` Tu tendencia: ${conv(t.perDay * 7) >= 10 ? Math.round(conv(t.perDay * 7)) : conv(t.perDay * 7).toFixed(1).replace('.', ',')} ${esc(unit)} por semana.` : ''}</p>`
    + '<div class="goal-form"><button data-act="edit">Cambiar meta</button><button data-act="clear">Quitar</button></div>';
}

function communityBlock() {
  const c = data.community;
  const { speed, unit } = kit;
  const box = $('#s-comm');
  const parts = c ? [[mode === 'hc' ? 'Récord en Hardcore' : 'Récord', c.best], ['Promedio de las últimas 10', c.avg]].filter(([, v]) => v) : [];
  $('#s-comm-note').textContent = parts.length ? `${Math.max(...parts.map(([, v]) => v.n))} pilotos, no depende del período` : '';
  box.innerHTML = parts.length
    ? `<div class="cm-row">${parts.map(([title, v]) => `<div class="cm"><h4>${title}</h4>${gauge(v.pct, { label: 'percentil', aria: title })}`
      + `<p>${v.pct >= 100 ? 'Estás por encima de todos los demás.' : `Más rápido que el <b>${v.pct}%</b> de los pilotos.`}</p>`
      + `<small>Vos ${speed(v.mine)} ${esc(unit)}, mediana de los demás ${speed(v.median)}.</small></div>`).join('')}</div>`
    : '<p class="note first">Para compararte hacen falta al menos 5 pilotos con 5 carreras o más, y que vos también las tengas.</p>';
}

// ---------- composición (donas) ----------
function donuts() {
  const rows = view.cur;
  const b = view.b;
  const card = (title, body) => `<div class="dn-card"><h4>${title}</h4>${body}</div>`;
  const accuracy = card('Precisión', donut([
    { label: 'Perfectas', value: rows.filter((r) => r.acc === 100).length },
    { label: '97 a 99%', value: rows.filter((r) => r.acc >= 97 && r.acc < 100).length },
    { label: '90 a 96%', value: rows.filter((r) => r.acc >= 90 && r.acc < 97).length },
    { label: 'Menos de 90%', value: rows.filter((r) => r.acc < 90).length },
  ], { center: rows.length ? Math.round(avg(rows.map((r) => r.acc))) + '%' : '-', sub: 'promedio', aria: 'Reparto de carreras por precisión' }));
  const part = (r) => { const h = new Date(r.at).getHours(); return h < 6 ? 0 : h < 12 ? 1 : h < 19 ? 2 : 3; };
  const slots = [0, 0, 0, 0];
  for (const r of rows) slots[part(r)]++;
  const day = card('Franja del día', donut([
    { label: 'Madrugada (0 a 5 h)', value: slots[0], c: 5 }, { label: 'Mañana (6 a 11 h)', value: slots[1], c: 1 },
    { label: 'Tarde (12 a 18 h)', value: slots[2], c: 2 }, { label: 'Noche (19 a 23 h)', value: slots[3], c: 0 },
  ], { center: String(rows.length), sub: rows.length === 1 ? 'carrera' : 'carreras', aria: 'Reparto de carreras por franja del día' }));
  let out;
  let note = '';
  if (mode === 'duel' && data.duel) {
    const d = data.duel;
    const none = Math.max(0, d.total - d.wins - d.losses);
    out = [card('Resultados de duelos', donut([
      { label: 'Ganados', value: d.wins - d.byForfeit }, { label: 'Ganados por abandono', value: d.byForfeit },
      { label: 'Sin ganador', value: none, c: 2 }, { label: 'Perdidos', value: d.losses, c: 3 },
    ], { center: d.total ? d.rate + '%' : '-', sub: 'victorias', aria: 'Resultados de tus duelos' })), accuracy, day];
    note = 'Los resultados son del historial completo; las otras dos dependen del período.';
  } else if (mode === 'tourney' && data.tourney) {
    const t = data.tourney;
    out = [card('Partidos de torneo', donut([
      { label: 'Ganados', value: t.wins }, { label: 'Perdidos', value: t.losses, c: 3 },
    ], { center: t.total ? t.rate + '%' : '-', sub: 'victorias', aria: 'Resultados de tus partidos de torneo' })),
    card('Resultado por torneo', donut([
      { label: 'Títulos', value: t.titles }, { label: 'Finales perdidas', value: Math.max(0, t.finals - t.titles) },
      { label: 'Eliminado antes', value: Math.max(0, t.entered - t.finals) },
    ], { center: String(t.entered), sub: t.entered === 1 ? 'torneo' : 'torneos', aria: 'Cómo terminaste en cada torneo' })), accuracy];
    note = 'Los partidos y los torneos son del historial completo; la precisión depende del período.';
  } else if (mode === 'hc') {
    const dead = data.deaths.filter((d) => b.all || (d[0] >= b.from && d[0] <= b.to)).length;
    const att = rows.length + dead;
    out = [card('Intentos en Hardcore', donut([
      { label: 'Completadas', value: rows.length }, { label: 'Eliminaciones', value: dead, c: 3 },
    ], { center: att ? Math.round((rows.length / att) * 100) + '%' : '-', sub: 'supervivencia', aria: 'Carreras completadas y eliminaciones' })), accuracy, day];
  } else {
    const by = new Map();
    for (const r of rows) {
      const c = kit.category(r.t);
      if (c) by.set(c, (by.get(c) || 0) + 1);
    }
    const sorted = [...by].sort((x, y) => y[1] - x[1]);
    const tone = [0, 1, 2, 4]; // sin el rojo: una categoría no es "mala"
    const segs = sorted.slice(0, 4).map(([label, value], i) => ({ label, value, c: tone[i] }));
    const rest = sorted.slice(4).reduce((a, [, v]) => a + v, 0);
    if (rest) segs.push({ label: 'Otras', value: rest, c: 5 });
    out = [accuracy, card('Por categoría', donut(segs, { center: String(sum(sorted.map((x) => x[1]))), sub: 'carreras', aria: 'Reparto de carreras por categoría' })), day];
  }
  $('#s-donuts').innerHTML = out.join('');
  $('#s-comp-note').textContent = note;
}

// ---------- sesiones ----------
function sessions() {
  const rows = view.cur;
  const box = $('#s-sess');
  if (rows.length < 3) {
    box.innerHTML = '<p class="note first">Hacen falta al menos 3 carreras en este período.</p>';
    $('#s-sess-note').textContent = '';
    return;
  }
  const list2 = [];
  let cur = null;
  for (const r of rows) {
    if (cur && r.at - cur.last <= SESSION_GAP) { cur.rows.push(r); cur.last = r.at; } else { cur = { first: r.at, last: r.at, rows: [r] }; list2.push(cur); }
  }
  const longest = list2.reduce((a, x) => (x.rows.length > a.rows.length ? x : a), list2[0]);
  const minutes = (ss) => sum(ss.rows.map(secsOf)) / 60;
  const avgMin = avg(list2.map(minutes));
  const edges = [[1, 1, 'Carrera 1'], [2, 3, 'Carreras 2 y 3'], [4, 6, 'Carreras 4 a 6'], [7, 10, 'Carreras 7 a 10'], [11, Infinity, 'Carrera 11 en adelante']];
  const stages = edges.map(([lo, hi, label]) => {
    const v = [];
    for (const ss of list2) ss.rows.forEach((r, i) => { if (i + 1 >= lo && i + 1 <= hi) v.push(r.cpm); });
    return { label, n: v.length, mean: avg(v) };
  }).filter((g) => g.n >= 3);
  const top = Math.max(1, ...stages.map((g) => g.mean));
  let insight = '';
  if (stages.length >= 2) {
    const bestStage = stages.reduce((a, g) => (g.mean > a.mean ? g : a), stages[0]);
    insight = bestStage === stages[0]
      ? 'Rendís más al empezar la sesión: la velocidad baja con las carreras seguidas. Un descanso corto puede ayudar.'
      : `Rendís mejor después de entrar en calor: tu punto más alto llega en ${bestStage.label.toLowerCase()}.`;
  }
  $('#s-sess-note').textContent = 'Una sesión termina tras 30 minutos sin correr';
  box.innerHTML = `<div class="s-two s-inner"><div><h4>Resumen</h4><dl class="mini">`
    + `<div><dt>Sesiones</dt><dd>${list2.length}</dd></div>`
    + `<div><dt>Carreras por sesión</dt><dd>${(rows.length / list2.length).toFixed(1).replace('.', ',')}</dd></div>`
    + `<div><dt>Sesión más larga</dt><dd>${plural(longest.rows.length, 'carrera', 'carreras')}<small>${date(longest.first, { day: 'numeric', month: 'short' })}</small></dd></div>`
    + `<div><dt>Tiempo tipeando por sesión</dt><dd>${avgMin >= 60 ? `${Math.floor(avgMin / 60)} h ${Math.round(avgMin % 60)} min` : `${Math.max(1, Math.round(avgMin))} min`}<small>${timeSource(rows)}</small></dd></div>`
    + `</dl></div><div><h4>Velocidad según el número de carrera</h4>`
    + (stages.length ? `<ul class="cats">${stages.map((g) => `<li><span>${g.label}<small>${plural(g.n, 'carrera', 'carreras')}</small></span><div><i style="width:${Math.max(2, (g.mean / top) * 100)}%"></i></div><b>${sp(g.mean)}</b></li>`).join('')}</ul>${insight ? `<p class="insight">${insight}</p>` : ''}`
      : '<p class="note first">Todavía no hay sesiones con suficientes carreras para comparar.</p>')
    + '</div></div>';
}

// ---------- velocidad contra precisión ----------
function scatterBlock() {
  const rows = view.cur.slice(-500);
  const { speed, unit } = kit;
  $('#s-scatter').innerHTML = scatter(rows.map((r) => ({
    cpm: speed(r.cpm), acc: r.acc, label: `${speed(r.cpm)} ${unit}, ${r.acc}% de precisión, ${date(r.at)}`,
  })), { unit, width: Math.round($('#s-scatter').clientWidth) });
  $('#s-sc-note').textContent = rows.length >= 5 ? `${plural(rows.length, 'carrera', 'carreras')}${view.cur.length > rows.length ? ', las últimas 500' : ''}` : '';
  let text = '';
  if (rows.length >= 20) {
    const byCpm = [...rows].sort((a, b) => b.cpm - a.cpm);
    const k = Math.max(2, Math.round(rows.length * 0.1));
    const fast = avg(byCpm.slice(0, k).map((r) => r.acc));
    const rest = avg(byCpm.slice(k).map((r) => r.acc));
    const gap = Math.round(rest - fast);
    text = `Tus carreras más rápidas (el 10% de arriba) tienen ${Math.round(fast)}% de precisión; el resto, ${Math.round(rest)}%. `
      + (gap >= 3 ? 'Cuando apretás el ritmo perdés precisión: ese es el punto a trabajar.' : gap <= -2 ? 'Te sale mejor limpio cuando vas más rápido, buena señal de ritmo.' : 'Mantenés la precisión aunque subas la velocidad.');
  } else if (rows.length >= 5) text = 'Con 20 carreras o más acá aparece una lectura de cómo cambia tu precisión cuando corrés más rápido.';
  $('#s-scatter-note').textContent = text;
}

// ---------- errores por mano y dedo ----------
const FINGERS = [
  ['li', 'Meñique izq.', '1qaz'], ['la', 'Anular izq.', '2wsx'], ['lm', 'Medio izq.', '3edc'], ['lx', 'Índice izq.', '45rtfgvb'],
  ['rx', 'Índice der.', '67yuhjnm'], ['rm', 'Medio der.', '8ik,'], ['ra', 'Anular der.', '9ol.'], ['ri', 'Meñique der.', '0pñ-;'], ['th', 'Pulgares', ' '],
];
const fingerOf = new Map(FINGERS.flatMap(([id, , keys]) => [...keys].map((k) => [k, id])));

const norm = (key) => {
  const k = key.toLowerCase();
  return k === 'ñ' ? k : k.normalize('NFD').replace(/[̀-ͯ]/g, '');
};
function byFinger(rows) {
  const by = Object.fromEntries(FINGERS.map(([id]) => [id, 0]));
  let mapped = 0;
  let other = 0;
  for (const { key, n } of rows) {
    const id = fingerOf.get(norm(key));
    if (id) { by[id] += n; mapped += n; } else other += n;
  }
  return { by, mapped, other };
}
// Sin teclas registradas todavía (carreras anteriores a la v20) no hay con qué calcular una tasa: se muestra la cantidad.
const fingEffective = () => (fingMetric === 'rate' && data?.keys?.length ? 'rate' : 'n');
const pc = (v) => `${(v * 100).toFixed(1).replace('.', ',')}%`;

function fingers() {
  const box = $('#s-fingers');
  const note = $('#s-fingers-note');
  if (fingEffective() === 'rate') return fingerRates(box, note);
  const { by, mapped, other } = byFinger(data.chars);
  if (!mapped) {
    box.innerHTML = '<p class="note first">Todavía no registraste errores de teclas.</p>';
    note.textContent = '';
    return;
  }
  const left = by.li + by.la + by.lm + by.lx;
  const right = by.rx + by.rm + by.ra + by.ri;
  const rows = FINGERS.filter(([id]) => by[id]).sort((a, b) => by[b[0]] - by[a[0]]);
  const top = by[rows[0][0]];
  box.innerHTML = `<div class="s-two s-inner"><div>${donut([
    { label: 'Mano izquierda', value: left }, { label: 'Mano derecha', value: right }, { label: 'Barra espaciadora', value: by.th },
  ], { center: String(mapped), sub: 'errores', aria: 'Errores por mano' })}</div>`
    + `<div><ul class="cats bad">${rows.map(([id, name]) => `<li><span>${name}<small>${Math.round((by[id] / mapped) * 100)}% de los errores</small></span><div><i style="width:${(by[id] / top) * 100}%"></i></div><b>${by[id]}</b></li>`).join('')}</ul></div></div>`;
  const hand = left === right ? 'Los errores se reparten parejo entre las dos manos.'
    : `Fallás más con la mano ${left > right ? 'izquierda' : 'derecha'} (${Math.round((Math.max(left, right) / (left + right || 1)) * 100)}% de los errores con letras y signos).`;
  const why = data.keys?.length
    ? 'Cuentan cantidad: un dedo que escribe más teclas falla más veces. La vista por tasa lo corrige.'
    : 'Cuentan cantidad, no tasa. Desde la v20 también se guardan las teclas tipeadas: con unas carreras más vas a poder ver la tasa de error por dedo.';
  note.textContent = `${hand} Son errores acumulados de todas tus carreras. ${why}${other ? ` Quedaron fuera ${other} errores en teclas que no están en el mapa.` : ''}`;
}

// Tasa de error por dedo: errores sobre teclas tipeadas, con los dos conteos del mismo período (desde que se guardan las teclas).
function fingerRates(box, note) {
  const a = byFinger(data.keys);
  const m = byFinger(data.misses || []);
  const rows = FINGERS.filter(([id]) => id !== 'th').map(([id, name]) => ({ id, name, keys: a.by[id], miss: Math.min(m.by[id], a.by[id]) }));
  const enough = rows.filter((r) => r.keys >= MIN_FINGER_KEYS).map((r) => ({ ...r, rate: r.miss / r.keys })).sort((x, y) => y.rate - x.rate);
  const few = rows.filter((r) => r.keys < MIN_FINGER_KEYS);
  if (!enough.length) {
    box.innerHTML = `<p class="note first">Todavía hay pocas teclas registradas para calcular la tasa por dedo: hacen falta al menos ${MIN_FINGER_KEYS} en un mismo dedo. Con unas carreras más aparece.</p>`;
    note.textContent = '';
    return;
  }
  const hand = (ids) => {
    const k = sum(ids.map((id) => a.by[id]));
    const e = sum(ids.map((id) => Math.min(m.by[id], a.by[id])));
    return { k, e, rate: k ? e / k : 0 };
  };
  const lh = hand(['li', 'la', 'lm', 'lx']);
  const rh2 = hand(['rx', 'rm', 'ra', 'ri']);
  const total = lh.k + rh2.k;
  const top = Math.max(...enough.map((r) => r.rate), 0.0001);
  const rowsHtml = enough.map((r) => `<li><span>${r.name}<small>${plural(r.keys, 'tecla', 'teclas')}, ${plural(r.miss, 'error', 'errores')}</small></span><div><i style="width:${Math.max(2, (r.rate / top) * 100)}%"></i></div><b>${pc(r.rate)}</b></li>`).join('')
    + (few.length ? `<li class="none"><small>Pocas teclas para calcular: ${few.map((r) => r.name).join(', ')}</small></li>` : '');
  box.innerHTML = `<div class="s-two s-inner"><div><dl class="mini fg-sum">`
    + `<div><dt>Mano izquierda</dt><dd>${pc(lh.rate)}<small>${plural(lh.k, 'tecla', 'teclas')}</small></dd></div>`
    + `<div><dt>Mano derecha</dt><dd>${pc(rh2.rate)}<small>${plural(rh2.k, 'tecla', 'teclas')}</small></dd></div>`
    + `<div><dt>Error en letras y signos</dt><dd>${pc(total ? (lh.e + rh2.e) / total : 0)}<small>${plural(total, 'tecla', 'teclas')} registradas</small></dd></div>`
    + `</dl></div><div><ul class="cats bad">${rowsHtml}</ul></div></div>`;
  const worst = enough[0];
  const best = enough[enough.length - 1];
  let txt = enough.length >= 2 ? `Tu dedo con más error es el ${worst.name.toLowerCase()} (${pc(worst.rate)}) y el más firme, el ${best.name.toLowerCase()} (${pc(best.rate)}). ` : '';
  if (lh.k >= 100 && rh2.k >= 100) {
    const diff = lh.rate - rh2.rate;
    txt += Math.abs(diff) < 0.005 ? 'Las dos manos fallan casi igual. ' : `La mano ${diff > 0 ? 'izquierda' : 'derecha'} falla más: ${pc(Math.max(lh.rate, rh2.rate))} contra ${pc(Math.min(lh.rate, rh2.rate))}. `;
  }
  note.textContent = `${txt}La tasa son los errores sobre las teclas tipeadas, contadas desde la v20; las carreras anteriores no se incluyen porque no guardaban las teclas.${a.other ? ' Quedan fuera las teclas que no están en el mapa.' : ''}`;
}

// ---------- lo más importante, en palabras ----------
function insights() {
  const { unit } = kit;
  const out = [];
  const c = summarize(view.cur);
  const p = summarize(view.prev);
  if (c.n >= 3 && p.n >= 3) {
    const d = sp(c.avg) - sp(p.avg);
    out.push(['Tendencia', d === 0 ? 'Tu promedio se mantiene igual que en el período anterior.'
      : `Tu promedio ${d > 0 ? 'subió' : 'bajó'} ${Math.abs(d)} ${unit} contra el período anterior.`]);
  } else {
    const t = trend();
    if (t) {
      const w = conv(t.perDay * 7);
      out.push(['Tendencia', Math.abs(w) < 0.5 ? 'Tu velocidad está estable en este período.'
        : `Tu velocidad ${w > 0 ? 'sube' : 'baja'} cerca de ${Math.abs(w) >= 10 ? Math.round(Math.abs(w)) : Math.abs(w).toFixed(1).replace('.', ',')} ${unit} por semana.`]);
    }
  }
  if (mode === 'duel' && data.duel?.recent?.length) {
    const r = data.duel.recent.filter((x) => x.cpm !== null && x.rcpm !== null);
    if (r.length >= 3) out.push(['Contra rivales', `En tus últimos ${r.length} duelos tu velocidad promedió ${sp(avg(r.map((x) => x.cpm)))} ${unit} y la de tus rivales ${sp(avg(r.map((x) => x.rcpm)))}.`]);
    out.push(['Duelos', `Ganaste ${data.duel.wins} de ${data.duel.total} (${data.duel.rate}%), racha actual de ${data.duel.streak}.`]);
  } else if (mode === 'tourney' && data.tourney) {
    out.push(['Torneos', `Jugaste ${plural(data.tourney.entered, 'torneo', 'torneos')}, con ${plural(data.tourney.titles, 'título', 'títulos')} y ${plural(data.tourney.finals, 'final', 'finales')}.`]);
  } else if (mode === 'hc') {
    const sv = surviveStreaks();
    out.push(['Supervivencia', `Tu mejor racha sin caer es de ${plural(sv.best, 'carrera', 'carreras')} y la actual, de ${sv.current}.`]);
  }
  if (rh.hot >= 0) out.push(['Mejor momento', `Corrés más rápido de ${rh.hot} a ${rh.hot + 1} h: ${sp(rh.mean(rh.hours[rh.hot]))} ${unit} de promedio.`]);
  if (mode !== 'hc') {
    const st = dayStreaks();
    if (st.current >= 2) out.push(['Constancia', `Llevás ${st.current} días seguidos corriendo, tu mejor racha es de ${st.best}.`]);
    else if (st.best >= 3) out.push(['Constancia', `Tu racha de días se cortó. La mejor fue de ${st.best}: se puede superar.`]);
  }
  if (c.n && c.perfect) out.push(['Precisión', `${plural(c.perfect, 'carrera', 'carreras')} sin errores, el ${Math.round((c.perfect / c.n) * 100)}% del período.`]);
  const goal = load('statgoal', 0);
  if (goal && list.length) {
    const level = avg(list.slice(-10).map((r) => r.cpm));
    out.push(['Meta', level >= goal ? 'Tu promedio ya alcanzó la meta de velocidad.' : `Te faltan ${sp(goal) - sp(level)} ${unit} de promedio para tu meta.`]);
  }
  $('#s-insights').innerHTML = out.slice(0, 4).map(([k, t]) => `<li><small>${k}</small><p>${esc(t)}</p></li>`).join('');
  $('#s-insights').hidden = !out.length;
}

// ---------- exportar ----------
function exportCsv() {
  const { unit } = kit;
  const cell = (v) => {
    let t = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // evita que una planilla lo tome como fórmula
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const kindOf = (r) => (mode === 'hc' ? 'Hardcore' : mode === 'duel' ? 'Duelo' : mode === 'tourney' ? 'Torneo' : r.duel ? 'Duelo' : 'Normal');
  const both = unit !== 'CPM'; // con WPM se agrega también la columna en CPM; con CPM no se repite
  const lines = [['Fecha', 'Hora', `Velocidad (${unit})`, ...(both ? ['Velocidad (CPM)'] : []), 'Precisión (%)', 'Duración (s)', 'Texto', 'Tipo']];
  for (const r of view.cur) {
    const d = new Date(r.at);
    lines.push([`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, kit.speed(r.cpm), ...(both ? [r.cpm] : []), r.acc, r.ms > 0 ? (r.ms / 1000).toFixed(1).replace('.', ',') : '', kit.label(r.t), kindOf(r)]);
  }
  const blob = new Blob(['\ufeff' + lines.map((l) => l.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `neanbit-type-estadisticas-${mode}-${toInput(Date.now())}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const emptyText = {
  all: 'Todavía no hay carreras guardadas. Corré una y acá vas a ver cómo evolucionás.',
  duel: 'Todavía no jugaste duelos. Desafiá a alguien desde Duelos y acá vas a ver tus resultados.',
  tourney: 'Todavía no jugaste torneos. Cuando participes en uno, acá vas a ver tus resultados.',
  hc: 'Todavía no completaste carreras en Hardcore. Cuando lo hagas, acá vas a ver tu supervivencia.',
};
const kind = { all: 'Corriendo', duel: 'Duelos', tourney: 'Torneos', hc: 'Hardcore' };
const title = { all: 'Tu rendimiento', duel: 'Tus duelos', tourney: 'Tus torneos', hc: 'Tu Hardcore' };

// Franja de «hoy»: lo corrido en el día, aparte del período elegido. Sigue el modo de la página (general, duelos, torneos o Hardcore).
function todayStrip() {
  const box = $('#s-today');
  if (!list.length) { box.hidden = true; box.innerHTML = ''; return; }
  const t0 = dayIndex(Date.now());
  const today = list.filter((r) => dayIndex(r.at) === t0);
  const who = mode === 'all' ? '' : ` · ${kind[mode]}`;
  box.hidden = false;
  box.innerHTML = today.length
    ? `<span class="s-today-k">Hoy${who}</span><span><b>${today.length}</b> ${today.length === 1 ? 'carrera' : 'carreras'}</span><span><b>${sp(Math.max(...today.map((r) => r.cpm)))}</b> ${kit.unit} de mejor</span>`
    : `<span class="s-today-k">Hoy${who}</span><span class="s-today-off">Todavía no corriste</span>`;
}

function draw() {
  list = data.races.map(([at, cpm, acc, t, duel, ms]) => ({ at, cpm, acc, t, duel, ms }));
  const extra = (mode === 'hc' && data.deathsTotal) || (mode === 'duel' && data.duel?.total) || (mode === 'tourney' && data.tourney?.total);
  const empty = !data.total && !extra;
  document.querySelectorAll('#s-mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
  document.querySelectorAll('#s-period button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === period));
  document.querySelectorAll('#s-metric button').forEach((b) => b.classList.toggle('on', b.dataset.k === metric));
  document.querySelectorAll('#s-fing-metric button').forEach((b) => b.classList.toggle('on', b.dataset.k === fingEffective()));
  document.querySelectorAll('#s-text-sort button').forEach((b) => b.classList.toggle('on', b.dataset.k === textSort));
  $('#s-empty').hidden = !empty;
  $('#s-body').hidden = empty;
  $('#s-empty-text').textContent = emptyText[mode];
  $('#s-first').hidden = mode !== 'all' && mode !== 'hc';
  $('#s-since').textContent = (data.since
    ? `${kind[mode]} desde el ${date(data.since, { day: 'numeric', month: 'long', year: 'numeric' })}`
    : title[mode]) + (data.capped ? `, mostrando las últimas ${data.races.length.toLocaleString('es-AR')}` : '');
  if (empty) { $('#s-today').hidden = true; $('#s-today').innerHTML = ''; return; }
  document.querySelectorAll('#s-body [data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(mode); });
  view = windows();
  const canCompare = !view.b.all;
  $('#s-compare').hidden = !canCompare;
  document.querySelectorAll('#s-compare button').forEach((b) => b.classList.toggle('on', (b.dataset.k === '1') === compare));
  const custom = period === -1;
  $('#s-range').hidden = !custom;
  if (custom) {
    $('#s-from').value = toInput(range.from);
    $('#s-to').value = toInput(range.to);
    $('#s-from').max = $('#s-to').max = toInput(Date.now());
    $('#s-range-note').textContent = plural(Math.max(1, Math.round(view.b.len / DAY)), 'día', 'días');
  }
  $('#s-export').disabled = !view.cur.length;
  todayStrip();
  kpis();
  chart();
  donuts();
  if (mode !== 'hc') goalBlock();
  if (mode === 'all' || mode === 'hc') communityBlock();
  calendar();
  rhythm();
  insights();
  sessions();
  histogram();
  categories();
  scatterBlock();
  texts();
  records();
  if (mode === 'duel') duels();
  else if (mode === 'tourney') tourneys();
  else if (mode === 'hc') hardcore();
  else { keyboard(); fingers(); words(); }
}

export function renderStats(payload, helpers) {
  mode = payload.mode || 'all';
  data = payload;
  kit = helpers;
  draw();
}

export function redrawStats(helpers) {
  if (!data) return;
  kit = helpers;
  draw();
}

// Si cambia el ancho (girar el celular, achicar la ventana, o recién se muestra la página), se redibujan los gráficos con medida propia.
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => {
    const w = Math.round($('#s-chart').clientWidth);
    if (!data || !w || Math.abs(w - lastW) < 24 || $('#s-body').hidden) return;
    chart();
    scatterBlock();
  }).observe($('#s-chart'));
}

const pick = (box, attr, apply) => {
  $(box).onclick = (e) => {
    const v = e.target.closest('button')?.dataset[attr];
    if (v === undefined || !data) return;
    apply(v);
    draw();
  };
};
pick('#s-period', 'n', (v) => { period = Number(v); });
pick('#s-metric', 'k', (v) => { metric = v; });
pick('#s-text-sort', 'k', (v) => { textSort = v; });
pick('#s-cat-metric', 'k', (v) => { catMetric = v; });
pick('#s-compare', 'k', (v) => { compare = v === '1'; save('statcompare', compare); });
pick('#s-fing-metric', 'k', (v) => { fingMetric = v; });

for (const id of ['#s-from', '#s-to']) {
  $(id).onchange = (e) => {
    let a = $('#s-from').value;
    let b = $('#s-to').value;
    if (!data || fromInput(a, false) === null || fromInput(b, true) === null) return;
    if (a > b) { if (e.target.id === 's-from') b = a; else a = b; } // AAAA-MM-DD se compara como texto
    range = { from: fromInput(a, false), to: Math.min(fromInput(b, true), defaultRange().to) };
    draw();
  };
}
$('#s-export').onclick = () => { if (data && view.cur.length) exportCsv(); };

$('#s-goal').onclick = (e) => {
  const act = e.target.closest('button')?.dataset.act;
  if (!act || !data) return;
  if (act === 'set') {
    const cpm = kit.toCpm(Number($('#s-goal-in').value));
    if (!(cpm >= 20 && cpm <= 1800)) { $('#s-goal-note').textContent = 'Poné una velocidad razonable'; return; }
    save('statgoal', Math.round(cpm));
    editGoal = false;
  } else if (act === 'clear') { save('statgoal', 0); editGoal = false; } else editGoal = act === 'edit';
  draw();
};
$('#s-goal').onkeydown = (e) => {
  if (e.key === 'Enter' && e.target.id === 's-goal-in') $('#s-goal [data-act="set"]').click();
};

$('#s-mode').onclick = async (e) => {
  const m = e.target.closest('button')?.dataset.m;
  if (!m || m === mode || !data) return;
  try {
    const next = await api.stats(m);
    mode = m;
    data = next;
    if (m === 'hc') metric = 'cpm';
    draw();
  } catch {}
};
