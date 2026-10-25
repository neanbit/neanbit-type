import { avatarInner } from './avatar.js';

const $ = (sel) => document.querySelector(sel);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const svg = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const seal = '<path d="M12 3l2.4 1.8 3-.2 1 2.8 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-1 2.8-3-.2L12 21l-2.4-1.8-3 .2-1-2.8-2.5-1.7.9-2.9-.9-2.9 2.5-1.7 1-2.8 3 .2z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>';
const medalIcon = (m) => `<img src="img/medals/${esc(m.icon)}.svg" alt="" loading="lazy">`;
const countBadge = (m) => (m.stackable && m.count > 1 ? `<i class="count">${m.count}</i>` : '');
const replayIcon = svg('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>');

function standing(p) {
  const normal = p.rank && p.rank <= 10 ? { text: '#' + p.rank, n: p.rank, hc: false } : null;
  const hard = p.hcRank && p.hcRank <= 10 ? { text: 'HC #' + p.hcRank, n: p.hcRank, hc: true } : null;
  if (normal && hard && normal.n === 1 && hard.n === 1) return { text: '#1 | HC #1', n: 1, hc: false, dual: true };
  if (normal && hard) return hard.n < normal.n ? hard : normal;
  return normal || hard;
}

export function renderProfile(p, { speed, unit, textLabel, isMe }) {
  const rank = standing(p);
  $('#pf-avatar').className = 'pf-avatar' + (rank ? (rank.dual ? ' tier-dual' : ` tier-${rank.n <= 3 ? rank.n : 10}${rank.hc ? ' hc' : ''}`) : '');
  $('#pf-initial').innerHTML = avatarInner(p);
  $('#pf-statslink').hidden = !isMe;
  $('#pf-badge').hidden = !rank;
  $('#pf-badge').textContent = rank ? rank.text : '';
  const mark = p.verified ? `<span class="vf" title="${p.verified === 2 ? 'Servidor' : 'Verificado'}">${svg(seal)}</span>` : '';
  $('#pf-name').innerHTML = esc(p.name) + mark;
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
    ['Eliminaciones en Hardcore', p.deaths],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');

  const earned = p.medals.filter((m) => m.earned);
  const chosen = p.shown.map((id) => earned.find((m) => m.id === id)).filter(Boolean);
  const shown = chosen.length ? chosen : earned.slice(0, 6);
  $('#pf-medals').innerHTML = shown.length
    ? shown.map((m) => `<div class="medal" title="${esc(m.desc)}">${medalIcon(m)}<span>${esc(m.name)}</span>${countBadge(m)}</div>`).join('')
    : '<p class="note">Todavía no hay medallas.</p>';
  $('#medals-list').innerHTML = p.medals.map((m) =>
    `<li class="${m.earned ? '' : 'off'}">${medalIcon(m)}<div><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></div>${m.earned ? countBadge(m) : ''}</li>`
  ).join('');
  $('#pf-th').textContent = 'Vel. ' + unit;
}

export function renderHistory({ rows, total }, page, { speed, textLabel }) {
  $('#pf-history').innerHTML = rows.length
    ? rows.map((r) => `<tr><td><b>${speed(r.cpm)}</b></td><td><button class="link plain" data-text="${r.text_id}">${esc(textLabel(r.text_id))}</button></td><td>${new Date(r.at).toLocaleDateString('es-AR')}</td>
        <td><button class="ghost" data-ghost="${r.text_id}" data-cpm="${r.cpm}" title="Competir contra esta marca" aria-label="Competir contra esta marca">${replayIcon}</button></td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">Todavía no hay carreras.</td></tr>';
  const pages = Math.max(1, Math.ceil(total / 10));
  $('#pf-page').textContent = `Página ${page + 1} de ${pages}`;
  $('#pf-prev').disabled = page === 0;
  $('#pf-next').disabled = page + 1 >= pages;
}
