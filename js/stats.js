const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const layout = ['qwertyuiop', 'asdfghjklñ', 'zxcvbnm'];

function chart(values) {
  if (values.length < 2) return '<p class="note">Hacen falta dos carreras para dibujar la evolución.</p>';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 600},${150 - ((v - min) / span) * 130}`)
    .join(' ');
  return `<svg viewBox="0 0 600 160" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>
    <div class="axis"><span>${min}</span><span>${max}</span></div>`;
}

export function renderStats({ races, chars, words, deaths }, speed) {
  const normal = races.filter((r) => !r.hc);
  const avg = normal.length ? Math.round(normal.reduce((a, r) => a + r.cpm, 0) / normal.length) : 0;
  const best = normal.length ? Math.max(...normal.map((r) => r.cpm)) : 0;

  $('#s-cards').innerHTML = [
    [normal.length, 'carreras'],
    [speed(avg), 'promedio'],
    [speed(best), 'récord'],
    [deaths, 'eliminaciones en Hardcore'],
  ].map(([value, label]) => `<div><span>${value}</span><small>${label}</small></div>`).join('');

  $('#s-chart').innerHTML = chart(normal.slice(-30).map((r) => speed(r.cpm)));

  const misses = {};
  for (const { key, n } of chars) {
    const base = key === 'ñ' ? key : key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    misses[base] = (misses[base] || 0) + n;
  }
  const top = Math.max(1, ...Object.values(misses));
  $('#s-keys').innerHTML = layout.map((row) =>
    `<div>${[...row].map((k) => `<kbd style="--h:${(misses[k] || 0) / top}" title="${misses[k] || 0} errores">${k}</kbd>`).join('')}</div>`
  ).join('');

  $('#s-words').innerHTML = words.length
    ? words.map((w, i) => `<li><span>${i + 1}</span><span>${esc(w.key)}</span><b>${w.n}</b></li>`).join('')
    : '<li>Todavía no registraste errores.</li>';
}
