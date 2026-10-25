import { api } from './api.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rows = [['qwertyuiop', 0], ['asdfghjklñ', .5], ['zxcvbnm', 1.1]];

let data = null;
let kit = null;
let range = 30;
let mode = 'all';

const avg = (list) => (list.length ? list.reduce((a, v) => a + v, 0) / list.length : 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function kpis() {
  const { races, totals, deaths } = data;
  const { speed, unit } = kit;
  const cpm = races.map((r) => r.cpm);
  const last = avg(cpm.slice(-10));
  const before = cpm.length > 10 ? avg(cpm.slice(-20, -10)) : 0;
  const gap = before ? speed(Math.round(last)) - speed(Math.round(before)) : null;
  const trend = gap === null ? '' : `<em class="${gap >= 0 ? 'up' : 'down'}">${gap >= 0 ? '+' : ''}${gap} vs las 10 anteriores</em>`;
  const d = data.duel;
  const cards = mode === 'duel' ? [
    ['Duelos', d.total, `${plural(d.wins, 'ganado', 'ganados')}, ${plural(d.losses, 'perdido', 'perdidos')}`, ''],
    ['Victorias', d.rate + '%', 'de tus duelos', ''],
    ['Racha', d.streak, `${d.streak === 1 ? 'victoria seguida' : 'victorias seguidas'}, mejor ${d.bestStreak}`, ''],
    ['Récord', speed(d.best), unit + ' en duelo', ''],
    ['Promedio', speed(d.avg), `${unit}, precisión ${d.acc}%`, ''],
  ] : [
    ['Carreras', totals.races, 'en total', ''],
    ['Récord', speed(totals.best), unit, ''],
    ['Promedio', speed(Math.round(last)), `${unit}, últimas 10`, trend],
    ['Precisión', totals.acc + '%', 'promedio', ''],
    ['Hardcore', totals.hcBest ? speed(totals.hcBest) : 0, `${unit}, ${plural(deaths, 'eliminación', 'eliminaciones')}`, ''],
  ];
  $('#s-cards').innerHTML = cards.map(([label, value, note, extra]) =>
    `<div class="kpi"><small>${label}</small><b>${value}</b><span>${esc(note)}</span>${extra}</div>`).join('');
}

function chart() {
  const { races } = data;
  const { speed, unit } = kit;
  const list = races.slice(-range);
  if (list.length < 2) {
    $('#s-chart').innerHTML = '<p class="note">Hacen falta dos carreras para dibujar la evolución.</p>';
    return;
  }
  const values = list.map((r) => speed(r.cpm));
  const W = 720, H = 230, L = 46, R = 14, T = 14, B = 26;
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const pad = Math.max(1, Math.round((hi - lo) * .12));
  const top = hi + pad;
  const bottom = Math.max(0, lo - pad);
  const span = top - bottom || 1;
  const x = (i) => L + (i / (values.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - bottom) / span) * (H - T - B);

  const smooth = values.map((_, i) => avg(values.slice(Math.max(0, i - 4), i + 1)));
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const mean = smooth.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(values.length - 1).toFixed(1)},${H - B}L${L},${H - B}Z`;
  const ticks = [0, 1, 2, 3].map((k) => Math.round(bottom + (span * k) / 3));
  const grid = ticks.map((t) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="gt" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('');
  const bestAt = values.indexOf(hi);
  const dots = values.map((v, i) =>
    `<circle class="${i === bestAt ? 'rec' : 'pt'}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === bestAt ? 5 : list.length > 45 ? 2 : 3}"><title>${v} ${unit}, ${list[i].acc}% de precisión, ${new Date(list[i].at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</title></circle>`).join('');
  $('#s-chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de tu velocidad">${grid}<path class="ar" d="${area}"/><path class="ln" d="${line}"/><path class="mv" d="${mean}"/>${dots}</svg>`;
}

function days() {
  const { races } = data;
  const key = (t) => new Date(t).toDateString();
  const count = new Map();
  for (const r of races) count.set(key(r.at), (count.get(key(r.at)) || 0) + 1);
  const list = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return { d, n: count.get(d.toDateString()) || 0 };
  });
  const top = Math.max(1, ...list.map((x) => x.n));
  $('#s-days').innerHTML = list.map(({ d, n }, i) =>
    `<div class="${i === 13 ? 'now' : ''}" title="${plural(n, 'carrera', 'carreras')}, ${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}"><i style="--h:${n / top}"></i><span>${d.toLocaleDateString('es-AR', { weekday: 'narrow' })}</span></div>`).join('');
}

function categories() {
  const { races } = data;
  const { speed, category, unit } = kit;
  const by = new Map();
  for (const r of races) {
    const c = category(r.text_id);
    if (!c) continue;
    by.set(c, [...(by.get(c) || []), r.cpm]);
  }
  const list = [...by].map(([name, v]) => ({ name, n: v.length, mean: avg(v) })).sort((a, b) => b.mean - a.mean);
  const top = Math.max(1, ...list.map((c) => c.mean));
  $('#s-cats').innerHTML = list.length
    ? list.map((c) => `<li><span>${esc(c.name)}<small>${plural(c.n, 'carrera', 'carreras')}</small></span><div><i style="width:${(c.mean / top) * 100}%"></i></div><b>${speed(Math.round(c.mean))}</b></li>`).join('')
    : `<li class="none">Sin datos por categoría todavía.</li>`;
  $('#s-cats').setAttribute('aria-label', 'Velocidad media en ' + unit);
}

function keyboard() {
  const misses = {};
  for (const { key, n } of data.chars) {
    const base = key === 'ñ' ? key : key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    misses[base] = (misses[base] || 0) + n;
  }
  const top = Math.max(1, ...Object.values(misses));
  const worst = Object.entries(misses).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const board = rows.map(([row, shift]) =>
    `<div style="margin-left:${shift * 3}rem">${[...row].map((k) => `<span class="kk${misses[k] ? ' hit' : ''}" style="--h:${(misses[k] || 0) / top}" title="${misses[k] || 0} errores">${k}${misses[k] ? `<small>${misses[k]}</small>` : ''}</span>`).join('')}</div>`).join('');
  $('#s-keys').innerHTML = `<div class="kb-board">${board}</div>`
    + (worst.length
      ? `<p class="kb-top">Más fallas: ${worst.map(([k, n]) => `<b>${esc(k)}</b> ${n}`).join(', ')}</p>`
      : '<p class="kb-top">Todavía no registraste errores de teclas.</p>');
}

function words() {
  const list = data.words.slice(0, 10);
  const top = Math.max(1, ...list.map((w) => w.n));
  $('#s-words').innerHTML = list.length
    ? list.map((w, i) => `<li><span class="n">${i + 1}</span><span class="w">${esc(w.key)}</span><div><i style="width:${(w.n / top) * 100}%"></i></div><b>${w.n}</b></li>`).join('')
    : '<li class="none">Todavía no registraste errores.</li>';
  $('#s-train').hidden = data.words.length < 5;
}

function duels() {
  const list = data.duel.recent;
  $('#s-duel-list').innerHTML = list.map((r) => {
    const label = r.win === null ? 'Sin ganador' : r.win ? (r.forfeit ? 'Ganado por abandono' : 'Ganado') : 'Perdido';
    const mine = r.cpm === null ? '-' : kit.speed(r.cpm);
    const theirs = r.rcpm === null ? '-' : kit.speed(r.rcpm);
    return `<li class="${r.win ? 'won' : ''}"><b>${label}</b><span>contra ${esc(r.name)}</span><em>${mine} vs ${theirs} ${kit.unit}</em><small>${new Date(r.at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</small></li>`;
  }).join('');
}

function draw() {
  const duel = mode === 'duel';
  const empty = !data.totals.races && !(duel && data.duel.total);
  document.querySelectorAll('#s-mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
  $('#s-empty').hidden = !empty;
  $('#s-body').hidden = empty;
  $('#s-empty-text').textContent = duel
    ? 'Todavía no jugaste duelos. Desafiá a alguien desde Duelos y acá vas a ver tus resultados.'
    : 'Todavía no hay carreras guardadas. Corré una y acá vas a ver cómo evolucionás.';
  $('#s-first').hidden = duel;
  $('#s-since').textContent = data.totals.since
    ? `${duel ? 'Duelos' : 'Corriendo'} desde el ${new Date(data.totals.since).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : (duel ? 'Tus duelos' : 'Tu rendimiento');
  if (empty) return;
  document.querySelectorAll('#s-body .g-only').forEach((el) => { el.hidden = duel; });
  $('#s-duel').hidden = !duel;
  kpis();
  chart();
  days();
  categories();
  if (duel) {
    duels();
  } else {
    keyboard();
    words();
  }
}

export function renderStats(payload, helpers) {
  mode = 'all';
  data = payload;
  kit = helpers;
  draw();
}

export function redrawStats(helpers) {
  if (!data) return;
  kit = helpers;
  draw();
}

$('#s-range').onclick = (e) => {
  const n = Number(e.target.dataset.n);
  if (!n || !data) return;
  range = n;
  document.querySelectorAll('#s-range button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === n));
  chart();
};

$('#s-mode').onclick = async (e) => {
  const m = e.target.dataset.m;
  if (!m || m === mode || !data) return;
  try {
    const next = await api.stats(m);
    mode = m;
    data = next;
    draw();
  } catch {}
};
