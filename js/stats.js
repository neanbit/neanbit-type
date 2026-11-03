import { api } from './api.js';

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
let textSort = 'plays';
let list = [];
let view = { cur: [], prev: [] };

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

function summarize(rows) {
  const cpm = rows.map((r) => r.cpm);
  const acc = rows.map((r) => r.acc);
  return {
    n: rows.length, best: cpm.length ? Math.max(...cpm) : 0, avg: avg(cpm), med: median(cpm), sd: std(cpm),
    acc: avg(acc), perfect: acc.filter((a) => a === 100).length,
  };
}

function windows() {
  if (!period) return { cur: list, prev: [] };
  const start = Date.now() - period * DAY;
  return {
    cur: list.filter((r) => r.at >= start),
    prev: list.filter((r) => r.at >= start - period * DAY && r.at < start),
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
  if (!period || !view.prev.length || !view.cur.length) return '';
  const d = cur - prev;
  if (!d) return '<em>igual que el período anterior</em>';
  return `<em class="${d > 0 === up ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}${unit} vs período anterior</em>`;
}

function spanDays() {
  if (period) return period;
  return data.since ? Math.max(1, dayIndex(Date.now()) - dayIndex(data.since) + 1) : 1;
}

const card = ([label, value, note, extra]) =>
  `<div class="kpi"><small>${label}</small><b>${value}</b><span>${esc(note)}</span>${extra}</div>`;

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
  const now = Date.now();
  const deathsIn = hc ? data.deaths.filter((d) => !period || d[0] >= now - period * DAY) : [];
  const deathsPrev = hc && period ? data.deaths.filter((d) => d[0] >= now - 2 * period * DAY && d[0] < now - period * DAY) : [];
  const attempts = c.n + deathsIn.length;

  const first = [
    [hc ? 'Completadas' : 'Carreras', c.n, `${data.total} en total`, delta(c.n, p.n)],
    ['Récord', dash(speed(c.best)), `${unit}${period && allBest > c.best ? `, histórico ${speed(allBest)}` : ''}`, rank],
    ['Promedio', dash(sp(c.avg)), unit, delta(sp(c.avg), sp(p.avg))],
    ['Mediana', dash(sp(c.med)), `${unit}, la mitad por encima`, ''],
  ];
  let second;
  if (hc) {
    const run = surviveStreaks();
    second = [
      ['Eliminaciones', deathsIn.length, `${data.deathsTotal} en total`, delta(deathsIn.length, deathsPrev.length, { up: false })],
      ['Supervivencia', attempts ? Math.round((c.n / attempts) * 100) + '%' : '-', 'carreras que terminás', ''],
      ['Racha sin caer', run.current, `carreras seguidas, mejor ${run.best}`, ''],
      ['Días activos', activeDays, `de ${spanDays()}, ${perDay} por día`, ''],
    ];
  } else {
    const st = dayStreaks();
    second = [
      ['Precisión', dash(Math.round(c.acc) + '%'), plural(c.perfect, 'carrera perfecta', 'carreras perfectas'), delta(Math.round(c.acc), Math.round(p.acc), { unit: ' pts' })],
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
    // El tiempo no se guarda: se estima con el largo del texto y la velocidad de cada carrera.
    const typed = sum(list.map((r) => kit.chars?.(r.t) || 0));
    const mins = Math.round(sum(list.map((r) => ((kit.chars?.(r.t) || 0) * 60) / r.cpm)) / 60);
    strip = [
      ['Caracteres tipeados', typed.toLocaleString('es-AR'), 'en total, sin contar eliminaciones', ''],
      ['Tiempo tipeando', mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`, 'estimado por largo y velocidad', ''],
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
  const W = 900, H = 290, L = 48, R = 16, T = 16, B = 30;
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
    const p = points[i];
    const when = `${date(p.at)}${byDay ? `, ${plural(p.n, 'carrera', 'carreras')}` : ''}`;
    const tip = acc ? `${Math.round(v)}% de precisión, ${when}`
      : `${v} ${unit}${byDay ? ' de promedio' : `, ${p.acc}% de precisión`}, ${when}`;
    const r = i === bestAt ? 5 : values.length > 60 ? 0 : values.length > 35 ? 2 : 3;
    return r ? `<circle class="${i === bestAt ? 'rec' : 'pt'}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${r}"><title>${esc(tip)}</title></circle>` : '';
  }).join('');
  $('#s-chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${name}">${grid}${labels}<path class="ar" d="${area}"/>${meanLine}<path class="ln" d="${line}"/><path class="mv" d="${path(smooth)}"/>${dots}</svg>`;
  $('#s-legend').innerHTML = `<span><i class="l-line"></i>${byDay ? 'Promedio diario' : 'Carrera'}</span><span><i class="l-avg"></i>Media móvil de ${win}</span><span><i class="l-mean"></i>Promedio del período</span><span><i class="l-rec"></i>Mejor punto</span>`;
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
  const by = new Map();
  for (const r of view.cur) {
    const c = category(r.t);
    if (!c) continue;
    by.set(c, [...(by.get(c) || []), r.cpm]);
  }
  const rows = [...by].map(([name, v]) => ({ name, n: v.length, mean: avg(v), best: Math.max(...v) })).sort((a, b) => b.mean - a.mean);
  const top = Math.max(1, ...rows.map((c) => c.mean));
  $('#s-cats').innerHTML = rows.length
    ? rows.map((c) => `<li><span>${esc(c.name)}<small>${plural(c.n, 'carrera', 'carreras')}, mejor ${speed(c.best)}</small></span><div><i style="width:${(c.mean / top) * 100}%"></i></div><b>${speed(Math.round(c.mean))}</b></li>`).join('')
    : '<li class="none">Sin datos por categoría en este período.</li>';
  $('#s-cats').setAttribute('aria-label', 'Velocidad media en ' + unit);
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
  const from = period ? Date.now() - period * DAY : 0;
  const by = new Map();
  const slot = (t) => {
    if (!by.has(t)) by.set(t, { t, deaths: 0, done: 0 });
    return by.get(t);
  };
  for (const [at, t] of data.deaths) if (at >= from) slot(t).deaths++;
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

const emptyText = {
  all: 'Todavía no hay carreras guardadas. Corré una y acá vas a ver cómo evolucionás.',
  duel: 'Todavía no jugaste duelos. Desafiá a alguien desde Duelos y acá vas a ver tus resultados.',
  tourney: 'Todavía no jugaste torneos. Cuando participes en uno, acá vas a ver tus resultados.',
  hc: 'Todavía no completaste carreras en Hardcore. Cuando lo hagas, acá vas a ver tu supervivencia.',
};
const kind = { all: 'Corriendo', duel: 'Duelos', tourney: 'Torneos', hc: 'Hardcore' };
const title = { all: 'Tu rendimiento', duel: 'Tus duelos', tourney: 'Tus torneos', hc: 'Tu Hardcore' };

function draw() {
  list = data.races.map(([at, cpm, acc, t, duel]) => ({ at, cpm, acc, t, duel }));
  const extra = (mode === 'hc' && data.deathsTotal) || (mode === 'duel' && data.duel?.total) || (mode === 'tourney' && data.tourney?.total);
  const empty = !data.total && !extra;
  document.querySelectorAll('#s-mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
  document.querySelectorAll('#s-period button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === period));
  document.querySelectorAll('#s-metric button').forEach((b) => b.classList.toggle('on', b.dataset.k === metric));
  document.querySelectorAll('#s-text-sort button').forEach((b) => b.classList.toggle('on', b.dataset.k === textSort));
  $('#s-empty').hidden = !empty;
  $('#s-body').hidden = empty;
  $('#s-empty-text').textContent = emptyText[mode];
  $('#s-first').hidden = mode !== 'all' && mode !== 'hc';
  $('#s-since').textContent = (data.since
    ? `${kind[mode]} desde el ${date(data.since, { day: 'numeric', month: 'long', year: 'numeric' })}`
    : title[mode]) + (data.capped ? `, mostrando las últimas ${data.races.length.toLocaleString('es-AR')}` : '');
  if (empty) return;
  document.querySelectorAll('#s-body [data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(mode); });
  view = windows();
  kpis();
  chart();
  calendar();
  rhythm();
  histogram();
  categories();
  texts();
  records();
  if (mode === 'duel') duels();
  else if (mode === 'tourney') tourneys();
  else if (mode === 'hc') hardcore();
  else { keyboard(); words(); }
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
