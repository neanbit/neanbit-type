import { avatarInner } from './avatar.js';
import { $, esc, svg, icons, medalImg, countBadge } from './ui.js';
import { setVitrina } from './vitrina.js';
import { setNivel } from './nivel.js';
import { nameFx, setCover, setFrame, setPalette } from './rewards.js';

const discordLogo = '<svg class="i brand" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M19.6 5.3A16.6 16.6 0 0 0 15.5 4l-.5 1a15.400 15.400 0 0 0-6 0L8.500 4a16.600 16.600 0 0 0-4.100 1.300C1.800 9.200 1.100 13 1.400 16.700a16.700 16.700 0 0 0 5 2.500l1.100-1.700c-.6-.2-1.200-.5-1.700-.8l.4-.3a11.900 11.900 0 0 0 10.200 0l.4.3c-.5.3-1.100.6-1.700.8l1.100 1.700a16.700 16.700 0 0 0 5-2.500c.4-4.300-.7-8.100-3-11.400zM8.700 14.500c-1 0-1.800-.9-1.800-2s.8-2 1.800-2 1.800.9 1.800 2-.8 2-1.800 2zm6.600 0c-1 0-1.800-.9-1.800-2s.8-2 1.800-2 1.800.9 1.800 2-.8 2-1.800 2z"/></svg>';

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

let scopeView = 'all';
let scopeFor = null;
let lastScope = null;

const bestRoundText = (b) => (b.champion ? 'Campeón' : ['Finalista', 'Semifinales', 'Cuartos de final', 'Octavos de final'][b.rounds - b.round] || `Ronda ${b.round}`);

// Pestañas General | Duelos | Torneos en la base de la cabecera. En Duelos y Torneos cambian las tarjetas y el expediente.
function duelScope(p, opts) {
  const { speed, unit } = opts;
  if (scopeFor !== p.handle) { scopeFor = p.handle; scopeView = 'all'; }
  lastScope = { p, opts };
  const bar = $('#pf-scope');
  if (!bar.dataset.ready) {
    bar.dataset.ready = '1';
    bar.onclick = (e) => {
      const m = e.target.closest('button[data-m]')?.dataset.m;
      if (!m || m === scopeView) return;
      scopeView = m;
      renderProfile(lastScope.p, lastScope.opts);
    };
    bar.onkeydown = (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      const tabs = [...bar.querySelectorAll('button')];
      const next = tabs[(tabs.indexOf(document.activeElement) + step + tabs.length) % tabs.length];
      e.preventDefault();
      next.focus();
      next.click();
    };
  }
  const count = { all: p.races, duel: p.duels ? p.duels.total : 0, tourney: p.tourneys ? p.tourneys.entered : 0 };
  const had = bar.contains(document.activeElement);
  bar.innerHTML = [['all', 'General'], ['duel', 'Duelos'], ['tourney', 'Torneos']].map(([m, label]) => {
    const on = m === scopeView;
    return `<button type="button" role="tab" data-m="${m}" aria-selected="${on}" tabindex="${on ? 0 : -1}" class="${on ? 'on' : ''}">${label}<i>${count[m] || 0}</i></button>`;
  }).join('');
  if (had) bar.querySelector('.on').focus();
  const cards = (list) => list.map(([label, value, cls]) => `<div class="${cls}"><small>${label}</small><b>${value}</b></div>`).join('');
  const file = (list) => list.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  if (scopeView === 'duel' && p.duels) {
    const d = p.duels;
    $('#pf-stats').innerHTML = cards([
      ['Duelos', d.total, ''],
      ['Victorias', d.wins, ''],
      ['% ganados', d.rate + '%', ''],
      ['Mejor en duelo', d.best ? speed(d.best) : 0, 'hot'],
    ]);
    $('#pf-file').innerHTML = file([
      ['Derrotas', d.losses],
      ['Racha actual', d.streak],
      ['Mejor racha', d.bestStreak],
      ['Ganados por abandono', d.byForfeit],
      ['Promedio en duelo', d.avg ? `${speed(d.avg)} ${unit}` : '-'],
    ]);
  } else if (scopeView === 'tourney' && p.tourneys) {
    const t = p.tourneys;
    $('#pf-stats').innerHTML = cards([
      ['Torneos', t.entered, ''],
      ['Títulos', t.titles, ''],
      ['Finales', t.finals, ''],
      ['Mejor en torneo', t.best ? speed(t.best) : 0, 'hot'],
    ]);
    $('#pf-file').innerHTML = file([
      ['Mejor resultado', t.bestRound ? bestRoundText(t.bestRound) : '-'],
      ['Partidos ganados', `${t.wins} de ${t.total}`],
      ['% ganados', t.total ? t.rate + '%' : '-'],
      ['Racha actual', t.streak],
      ['Mejor racha', t.bestStreak],
      ['Promedio en torneo', t.avg ? `${speed(t.avg)} ${unit}` : '-'],
    ]);
  }
}

export function renderProfile(p, opts) {
  const { speed, unit, textLabel, isMe } = opts;
  const rank = standing(p);
  const earned = p.medals.filter((m) => m.earned);
  const chosen = p.shown.map((id) => earned.find((m) => m.id === id)).filter(Boolean);
  const shown = chosen.length ? chosen : earned.slice(0, 6);

  const root = $('#profile');
  root.dataset.accent = p.accent || 'ambar';
  setPalette(root, p.cosm && p.cosm.palette);
  setCover($('#pf-hero .pf-banner'), p.cosm && p.cosm.cover, p.banner);
  $('#pf-hero').dataset.shape = p.shape || 'cuadrada';

  $('#pf-avatar').className = 'pf-avatar' + (rank ? (rank.dual ? ' tier-dual' : ` tier-${rank.n <= 3 ? rank.n : 10}${rank.hc ? ' hc' : ''}`) : '');
  setFrame($('#pf-avatar'), p.cosm && p.cosm.frame);
  $('#pf-initial').innerHTML = avatarInner(p);
  $('#pf-badge').hidden = !rank;
  $('#pf-badge').textContent = rank ? rank.text : '';

  const mark = p.verified ? `<span class="vf" title="${p.verified === 2 ? 'Servidor' : 'Verificado'}">${svg(icons.seal)}</span>` : '';
  const star = chosen[0] ? `<span class="feat" title="${esc(chosen[0].name)}">${medalImg(chosen[0])}</span>` : '';
  $('#pf-name').innerHTML = `${nameFx(p.name, p.cosm)}${mark}${star}`;
  $('#pf-handle').textContent = '@' + p.handle;
  $('#pf-edit').hidden = !isMe;
  $('#pf-statslink').hidden = !isMe;

  const tags = [];
  if (p.role === 'admin') tags.push('<span class="tag accent">Admin</span>');
  if (p.country) tags.push(`<span class="tag">${esc(p.country)}</span>`);
  if (p.discord) tags.push(`<button class="tag discord" data-copy="${esc(p.discord)}" title="Copiar usuario de Discord" aria-label="Copiar usuario de Discord: ${esc(p.discord)}">${discordLogo}${esc(p.discord)}</button>`);
  if (p.website) tags.push(`<a class="tag" href="${esc(p.website)}" target="_blank" rel="noopener noreferrer nofollow">${esc(siteName(p.website))} ${svg(icons.link)}</a>`);
  $('#pf-tags').innerHTML = tags.join('');
  setNivel(p);

  $('#pf-bio').textContent = p.bio || 'Este usuario todavía no escribió su historia.';
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
