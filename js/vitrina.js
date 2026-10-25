import { $, esc, svg, icons, medalImg, countBadge } from './ui.js';

let list = [];
let secretLeft = 0;
let filter = 'all';

export function setVitrina(medals, secrets = 0) {
  list = medals;
  secretLeft = secrets;
}

export function openVitrina() {
  filter = 'all';
  draw();
  $('#medals').showModal();
  $('#medals-list').scrollTop = 0;
}

function tile(m, i) {
  const progress = !m.earned && m.target
    ? `<div class="prog"><span style="width:${Math.round((m.value / m.target) * 100)}%"></span></div><small class="prog-n">${m.value} / ${m.target}</small>`
    : '';
  const lock = m.earned ? '' : `<span class="lock">${svg(icons.lock)}</span>`;
  return `<li class="tile ${m.earned ? 'earned' : 'locked'}" style="--i:${i}">
    <div class="art">${medalImg(m)}${lock}${countBadge(m)}</div>
    <b>${esc(m.name)}</b>
    <small>${esc(m.desc)}</small>
    ${progress}
    <span class="state">${m.earned ? 'Obtenida' : 'Bloqueada'}</span>
  </li>`;
}

function draw() {
  const got = list.filter((m) => m.earned).length;
  $('#vt-count').textContent = `${got} de ${list.length} obtenidas`;
  $('#vt-fill').style.width = list.length ? `${(got / list.length) * 100}%` : '0';
  $('#vt-all').textContent = list.length;
  $('#vt-got').textContent = got;
  $('#vt-miss').textContent = list.length - got;
  for (const b of document.querySelectorAll('#vt-filter button')) b.classList.toggle('on', b.dataset.f === filter);

  const visible = list.filter((m) => filter === 'all' || (filter === 'got') === m.earned);
  const shelves = new Map();
  for (const m of visible) {
    if (!shelves.has(m.group)) shelves.set(m.group, []);
    shelves.get(m.group).push(m);
  }
  let n = 0;
  $('#medals-list').innerHTML = visible.length
    ? [...shelves].map(([name, items]) => {
        const done = list.filter((m) => m.group === name && m.earned).length;
        const total = list.filter((m) => m.group === name).length;
        return `<section class="shelf"><h3>${esc(name)} <small>${done} de ${total}</small></h3>
          <ul class="shelf-row">${items.map((m) => tile(m, n++)).join('')}</ul></section>`;
      }).join('')
    : `<p class="vt-empty">${filter === 'got' ? 'Todavía no hay medallas obtenidas.' : 'No queda ninguna por desbloquear.'}</p>`;
  $('#vt-secret').textContent = secretLeft > 0 && filter !== 'got'
    ? (secretLeft === 1 ? 'Hay 1 medalla secreta que todavía no se muestra.' : `Hay ${secretLeft} medallas secretas que todavía no se muestran.`)
    : '';
}

$('#vt-filter').onclick = (e) => {
  const f = e.target.closest('button')?.dataset.f;
  if (!f || f === filter) return;
  filter = f;
  draw();
  $('#medals-list').scrollTop = 0;
};
$('#medals-close').onclick = () => $('#medals').close();
$('#medals').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
