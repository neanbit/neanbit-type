const $ = (sel) => document.querySelector(sel);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const svg = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const medalIcons = {
  'primeros-pasos': '<path d="M7 5l11 7-11 7z"/>',
  constante: '<path d="M5 8h14M5 12h14M5 16h14"/>',
  ritmo: '<path d="M4 17a8 8 0 0 1 16 0M12 17l4-5"/>',
  veloz: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  'sin-red': '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  'pulso-firme': '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
};
const replayIcon = svg('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>');

function standing(p) {
  const normal = p.rank && p.rank <= 10 ? { text: '#' + p.rank, n: p.rank, hc: false } : null;
  const hard = p.hcRank && p.hcRank <= 10 ? { text: 'HC #' + p.hcRank, n: p.hcRank, hc: true } : null;
  if (normal && hard) return hard.n < normal.n ? hard : normal;
  return normal || hard;
}

export function renderProfile(p, { speed, unit, textLabel, isMe }) {
  const rank = standing(p);
  $('#pf-avatar').className = 'pf-avatar' + (rank ? ` tier-${rank.n <= 3 ? rank.n : 10}${rank.hc ? ' hc' : ''}` : '');
  $('#pf-initial').textContent = p.name.charAt(0).toUpperCase();
  $('#pf-badge').hidden = !rank;
  $('#pf-badge').textContent = rank ? rank.text : '';
  $('#pf-name').textContent = p.name;
  $('#pf-handle').textContent = '@' + p.handle;
  $('#pf-edit').hidden = !isMe;

  const tags = [`<span class="tag accent">${p.role === 'admin' ? 'Admin' : 'Piloto'}</span>`];
  if (p.country) tags.push(`<span class="tag">${esc(p.country)}</span>`);
  if (p.discord) tags.push(`<button class="tag" data-copy="${esc(p.discord)}" title="Copiar usuario">Discord: ${esc(p.discord)}</button>`);
  $('#pf-tags').innerHTML = tags.join('');

  $('#pf-bio').textContent = p.bio || 'Este piloto todavía no escribió su historia.';
  const setup = [p.layout, p.switches].filter(Boolean);
  $('#pf-setup-wrap').hidden = !setup.length;
  $('#pf-setup').innerHTML = setup.map((s) => `<span class="tag">${esc(s)}</span>`).join('');

  $('#pf-stats').innerHTML = [
    ['Carreras', p.races, ''],
    ['Prom. general', speed(p.avgAll), ''],
    ['Últ. 10', speed(p.avg), ''],
    ['Récord absoluto', speed(p.best), 'hot'],
  ].map(([label, value, cls]) => `<div class="${cls}"><small>${label}</small><b>${value}</b></div>`).join('');

  $('#pf-file').innerHTML = [
    ['Registrado desde', new Date(p.since).toLocaleDateString('es-AR')],
    ['Texto favorito', p.favorite ? textLabel(p.favorite) : '-'],
    ['Récord Hardcore', p.hcBest ? `${speed(p.hcBest)} ${unit}` : '-'],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');

  $('#pf-medals').innerHTML = p.medals.map((m) =>
    `<div class="medal${m.earned ? '' : ' off'}" title="${esc(m.desc)}">${svg(medalIcons[m.id] || '')}<span>${esc(m.name)}</span></div>`
  ).join('');
  $('#pf-th').textContent = 'Vel. ' + unit;
}

export function renderHistory({ rows, total }, page, { speed, textLabel }) {
  $('#pf-history').innerHTML = rows.length
    ? rows.map((r) => `<tr><td><b>${speed(r.cpm)}</b></td><td>${esc(textLabel(r.text_id))}</td><td>${new Date(r.at).toLocaleDateString('es-AR')}</td>
        <td><button class="ghost" data-ghost="${r.text_id}" data-cpm="${r.cpm}" title="Competir contra esta marca" aria-label="Competir contra esta marca">${replayIcon}</button></td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">Todavía no hay carreras.</td></tr>';
  const pages = Math.max(1, Math.ceil(total / 10));
  $('#pf-page').textContent = `Página ${page + 1} de ${pages}`;
  $('#pf-prev').disabled = page === 0;
  $('#pf-next').disabled = page + 1 >= pages;
}
