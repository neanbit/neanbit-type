import { avatarInner } from './avatar.js';
import { $, esc, svg, icons, medalImg, countBadge } from './ui.js';
import { setVitrina } from './vitrina.js';

export { esc };

function standing(p) {
  const normal = p.rank && p.rank <= 10 ? { text: '#' + p.rank, n: p.rank, hc: false } : null;
  const hard = p.hcRank && p.hcRank <= 10 ? { text: 'HC #' + p.hcRank, n: p.hcRank, hc: true } : null;
  if (normal && hard && normal.n === 1 && hard.n === 1) return { text: '#1 | HC #1', n: 1, hc: false, dual: true };
  if (normal && hard) return hard.n < normal.n ? hard : normal;
  return normal || hard;
}

const siteName = (href) => {
  try { return new URL(href).hostname.replace(/^www\./, ''); } catch { return href; }
};

let duelView = false;
let duelFor = null;
let lastDuel = null;

function duelScope(p, opts) {
  const { speed, unit } = opts;
  if (duelFor !== p.handle) { duelFor = p.handle; duelView = false; }
  lastDuel = { p, opts };
  if (!$('#pf-scope')) {
    const seg = document.createElement('div');
    seg.className = 'seg d-seg';
    seg.id = 'pf-scope';
    seg.innerHTML = '<button data-m="all">General</button><button data-m="duel">Duelos</button>';
    seg.onclick = (e) => {
      const m = e.target.dataset.m;
      if (!m || (m === 'duel') === duelView) return;
      duelView = m === 'duel';
      renderProfile(lastDuel.p, lastDuel.opts);
    };
    $('.pf-actions').prepend(seg);
  }
  document.querySelectorAll('#pf-scope button').forEach((b) => b.classList.toggle('on', (b.dataset.m === 'duel') === duelView));
  if (!duelView || !p.duels) return;
  const d = p.duels;
  $('#pf-stats').innerHTML = [
    ['Duelos', d.total, ''],
    ['Victorias', d.wins, ''],
    ['% ganados', d.rate + '%', ''],
    ['Mejor en duelo', d.best ? speed(d.best) : 0, 'hot'],
  ].map(([label, value, cls]) => `<div class="${cls}"><small>${label}</small><b>${value}</b></div>`).join('');
  $('#pf-file').innerHTML = [
    ['Derrotas', d.losses],
    ['Racha actual', d.streak],
    ['Mejor racha', d.bestStreak],
    ['Ganados por abandono', d.byForfeit],
    ['Promedio en duelo', d.avg ? `${speed(d.avg)} ${unit}` : '-'],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
}

export function renderProfile(p, opts) {
  const { speed, unit, textLabel, isMe } = opts;
  const rank = standing(p);
  const earned = p.medals.filter((m) => m.earned);
  const chosen = p.shown.map((id) => earned.find((m) => m.id === id)).filter(Boolean);
  const shown = chosen.length ? chosen : earned.slice(0, 6);

  const root = $('#profile');
  root.dataset.accent = p.accent || 'ambar';
  $('#pf-hero .pf-banner').dataset.banner = p.banner || 'liso';
  $('#pf-hero').dataset.shape = p.shape || 'cuadrada';

  $('#pf-avatar').className = 'pf-avatar' + (rank ? (rank.dual ? ' tier-dual' : ` tier-${rank.n <= 3 ? rank.n : 10}${rank.hc ? ' hc' : ''}`) : '');
  $('#pf-initial').innerHTML = avatarInner(p);
  $('#pf-badge').hidden = !rank;
  $('#pf-badge').textContent = rank ? rank.text : '';

  const mark = p.verified ? `<span class="vf" title="${p.verified === 2 ? 'Servidor' : 'Verificado'}">${svg(icons.seal)}</span>` : '';
  const star = chosen[0] ? `<span class="feat" title="${esc(chosen[0].name)}">${medalImg(chosen[0])}</span>` : '';
  $('#pf-name').innerHTML = `${esc(p.name)}${mark}${star}`;
  $('#pf-title').textContent = p.title || '';
  $('#pf-title').hidden = !p.title;
  $('#pf-handle').textContent = '@' + p.handle;
  $('#pf-edit').hidden = !isMe;
  $('#pf-statslink').hidden = !isMe;

  const tags = [`<span class="tag accent">${p.role === 'admin' ? 'Admin' : 'Piloto'}</span>`];
  if (p.country) tags.push(`<span class="tag">${esc(p.country)}</span>`);
  if (p.discord) tags.push(`<button class="tag" data-copy="${esc(p.discord)}" title="Copiar usuario">Discord: ${esc(p.discord)}</button>`);
  if (p.website) tags.push(`<a class="tag" href="${esc(p.website)}" target="_blank" rel="noopener noreferrer nofollow">${esc(siteName(p.website))} ${svg(icons.link)}</a>`);
  $('#pf-tags').innerHTML = tags.join('');

  $('#pf-bio').textContent = p.bio || 'Este piloto todavía no escribió su historia.';
  $('#pf-bio').classList.toggle('blank', !p.bio);
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

  duelScope(p, opts);

  const slots = shown.map((m) => `<button type="button" class="medal" data-open="vitrina" title="${esc(m.desc)}">${medalImg(m)}<span>${esc(m.name)}</span>${countBadge(m)}</button>`);
  if (isMe && earned.length) {
    while (slots.length < 6) slots.push(`<button type="button" class="medal empty" data-open="editor" title="Elegir medallas para lucir">${svg(icons.plus)}<span>Libre</span></button>`);
  }
  $('#pf-medals').innerHTML = slots.length ? slots.join('') : '<p class="note">Todavía no hay medallas.</p>';
  $('#pf-medal-count').textContent = `${earned.length} de ${p.medals.length}`;

  setVitrina(p.medals, p.secretLeft);
  $('#pf-th').textContent = 'Vel. ' + unit;
}

export function renderHistory({ rows, total }, page, { speed, textLabel }) {
  $('#pf-history').innerHTML = rows.length
    ? rows.map((r) => `<tr><td><b>${speed(r.cpm)}</b></td><td><button class="link plain" data-text="${r.text_id}">${esc(textLabel(r.text_id))}</button></td><td>${new Date(r.at).toLocaleDateString('es-AR')}</td>
        <td><button class="ghost" data-ghost="${r.text_id}" data-cpm="${r.cpm}" title="Competir contra esta marca" aria-label="Competir contra esta marca">${svg(icons.replay)}</button></td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">Todavía no hay carreras.</td></tr>';
  const pages = Math.max(1, Math.ceil(total / 10));
  $('#pf-page').textContent = `Página ${page + 1} de ${pages}`;
  $('#pf-prev').disabled = page === 0;
  $('#pf-next').disabled = page + 1 >= pages;
}
