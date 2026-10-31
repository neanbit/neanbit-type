// Ilustraciones propias de neanbit type. Todas son SVG en línea que toman el color del tema:
// el trazo usa currentColor, lo resaltado usa --accent. Las clases (.art, .f, .s2, .soft...) están en style.css.
// Idea de base: la tecla (como en el logo, donde la "n" termina en un cursor cuadrado de color).

const svg = (w, h, body, cls = '') => `<svg class="art ${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">${body}</svg>`;

// ---------- Teclado generado ----------
// Dedos por tecla: 1 meñique, 2 anular, 3 medio, 4 índice. Las zonas se pintan con --z1 a --z4.
const ROWS = [
  { y: 0, x: 0, keys: 'QWERTYUIOP' },
  { y: 40, x: 14, keys: 'ASDFGHJKLÑ' },
  { y: 80, x: 34, keys: 'ZXCVBNM,.' },
];
const FINGER = { Q: 1, A: 1, Z: 1, W: 2, S: 2, X: 2, E: 3, D: 3, C: 3, R: 4, T: 4, F: 4, G: 4, V: 4, B: 4,
  Y: 4, U: 4, H: 4, J: 4, N: 4, M: 4, I: 3, K: 3, ',': 3, O: 2, L: 2, '.': 2, P: 1, 'Ñ': 1 };

// opts: zones (colorea por dedo), lit (teclas resaltadas), cursor (agrega cursor tras la última lit), labels, space
export function keyboard({ zones = false, lit = [], labels = true, space = true, cursor = false } = {}) {
  const set = new Set(lit.map((k) => k.toUpperCase()));
  let out = '';
  let last = null;
  for (const row of ROWS) {
    [...row.keys].forEach((ch, i) => {
      const x = row.x + i * 40;
      const f = FINGER[ch];
      const cls = ['k', zones ? `z${f}` : '', set.has(ch) ? 'on' : ''].filter(Boolean).join(' ');
      out += `<g class="${cls}"><rect x="${x}" y="${row.y}" width="34" height="34" rx="6"/>`
        + (labels ? `<text x="${x + 17}" y="${row.y + 22}" text-anchor="middle" class="kl">${ch}</text>` : '') + '</g>';
      if (set.has(ch)) last = { x: x + 34, y: row.y };
    });
  }
  if (space) out += `<g class="k${set.has(' ') ? ' on' : ''}"><rect x="94" y="120" width="190" height="34" rx="6"/></g>`;
  if (cursor && last) out += `<rect class="f cur" x="${last.x + 6}" y="${last.y + 6}" width="8" height="22"/>`;
  return svg(414, space ? 154 : 114, out, 'kbd');
}

// ---------- Íconos de modo: una tecla con un símbolo adentro ----------
const keycap = (glyph) => `<rect x="3" y="3" width="42" height="42" rx="8"/><rect class="mute" x="9" y="7" width="30" height="28" rx="4"/>${glyph}`;
const glyphs = {
  random: '<path d="M14 15h5l8 12h6M14 27h5l2.5-3.6M25.5 18.6L27 15h6"/><path class="s2" d="M30 12l3 3-3 3M30 24l3 3-3 3"/>',
  pick: '<path class="s2" d="M15 14h18"/><path d="M15 21h18M15 28h10"/>',
  practice: '<circle cx="24" cy="21" r="9"/><rect class="f" x="21.5" y="18.5" width="5" height="5"/>',
  hardcore: '<path d="M24 12l10 18H14z"/><path class="s2" d="M24 19v5"/><rect class="f" x="22.5" y="26" width="3" height="3"/>',
  duel: '<path d="M14 16h20M14 26h20"/><rect class="f" x="28" y="13" width="6" height="6"/><rect class="f soft2" x="20" y="23" width="6" height="6"/>',
  tourney: '<path d="M14 14h6v7h6M14 28h6v-7M26 21h8"/><rect class="f" x="32" y="19" width="5" height="5"/>',
};
export const modeIcon = (name) => svg(48, 48, keycap(glyphs[name] || ''), 'micon');

// ---------- Diagramas ----------
// 5 caracteres = 1 palabra
export function cpmDiagram() {
  const chars = ['h', 'o', 'l', 'a', '␣'];
  const boxes = chars.map((c, i) => `<g class="k"><rect x="${i * 46}" y="8" width="40" height="40" rx="7"/><text x="${i * 46 + 20}" y="34" text-anchor="middle" class="kl big">${c}</text></g>`).join('');
  return svg(330, 120, `${boxes}
    <path class="s2" d="M0 60v8h224v-8M112 68v12"/>
    <text x="112" y="98" text-anchor="middle" class="kl">5 caracteres = 1 palabra</text>
    <path d="M250 28h60M250 40h40" class="mute"/><rect class="f" x="296" y="36" width="8" height="8"/>`, 'diagram');
}

// Dos carriles con el mismo texto; el servidor mide
export function duelDiagram() {
  return svg(360, 150, `
    <rect x="0" y="8" width="360" height="34" rx="4" class="mute"/>
    <rect x="0" y="8" width="236" height="34" rx="4" class="soft"/>
    <rect class="f" x="236" y="8" width="10" height="34"/>
    <rect x="0" y="62" width="360" height="34" rx="4" class="mute"/>
    <rect x="0" y="62" width="170" height="34" rx="4" class="soft2"/>
    <rect class="ff" x="170" y="62" width="10" height="34"/>
    <path d="M340 0v104" class="s2 dash"/>
    <text x="0" y="128" class="kl">Los dos escriben el mismo texto. El servidor cuenta el tiempo desde la largada.</text>`, 'diagram');
}

// Llave de eliminación directa, 8 jugadores
export function bracketDiagram() {
  const slot = (x, y, win) => `<rect x="${x}" y="${y}" width="64" height="22" rx="3" class="${win ? 'hit' : 'mute'}"/>`;
  const rows = [0, 30, 66, 96, 140, 170, 206, 236];
  const r1 = rows.map((y, i) => slot(0, y, i % 2 === 0 && i < 2)).join('');
  const r2 = [15, 81, 155, 221].map((y, i) => slot(104, y, i === 0)).join('');
  const r3 = [48, 188].map((y, i) => slot(208, y, i === 0)).join('');
  const final = slot(312, 118, true);
  const lines = `<path class="mute" d="M64 11h20v15M64 41h20V26M84 26h20M64 77h20v15M64 107h20V92M84 92h20M64 151h20v15M64 181h20v-15M84 166h20M64 217h20v15M64 247h20v-15M84 232h20M168 26h20v33M168 92h20V59M188 59h20M168 166h20v33M168 232h20v-33M188 199h20M272 59h20v70M272 199h20v-70M292 129h20"/>`;
  const path = `<path class="s2" d="M64 11h20v15h20M168 26h20v33h20M272 59h20v70h20"/>`;
  return svg(376, 258, lines + path + r1 + r2 + r3 + final + '<rect class="f" x="360" y="124" width="10" height="10"/>', 'diagram tall');
}

// Hardcore: un error y se termina
export function hardcoreDiagram() {
  const txt = 'rápido y limpio';
  const at = 7;
  const cells = [...txt].map((c, i) => `<g class="${i === at ? 'k bad' : i < at ? 'k on' : 'k'}"><rect x="${i * 24}" y="6" width="21" height="30" rx="4"/><text x="${i * 24 + 10.5}" y="27" text-anchor="middle" class="kl">${c === ' ' ? '' : c}</text></g>`).join('');
  return svg(360, 72, `${cells}<path class="bad-s" d="M${at * 24 + 3} 46l15 12M${at * 24 + 18} 46l-15 12"/><text x="${at * 24 + 30}" y="58" class="kl bad-t">fin de la carrera</text>`, 'diagram');
}

// Contra tu récord: la sombra de tu mejor marca
export function ghostDiagram() {
  return svg(360, 90, `
    <rect x="0" y="8" width="360" height="22" rx="3" class="mute"/>
    <rect x="0" y="8" width="212" height="22" rx="3" class="soft"/>
    <rect class="f" x="212" y="8" width="9" height="22"/>
    <rect x="0" y="48" width="360" height="22" rx="3" class="mute"/>
    <rect x="0" y="48" width="170" height="22" rx="3" class="ghost"/>
    <path class="mute dash" d="M170 40v38"/>
    <text x="0" y="88" class="kl">Tu carrera de ahora, contra la sombra de tu mejor marca.</text>`, 'diagram');
}

// Niveles de medalla: hexágonos como en las medallas reales
export function tierDiagram() {
  const tiers = [['Bronce', '#cd8a4b'], ['Gris', '#c4ccd8'], ['Oro', '#fca311'], ['Coral', '#ff7466'], ['Blanco', '#f1f5f9']];
  const hex = (cx, cy, c) => `<path d="M${cx} ${cy - 24}l21 12v24l-21 12-21-12v-24z" fill="#14213d" stroke="${c}" stroke-width="3"/><path d="M${cx} ${cy - 14}l13 7.5v14l-13 7.5-13-7.5v-14z" fill="none" stroke="${c}" stroke-opacity=".4" stroke-width="1.5"/>`;
  return svg(380, 96, tiers.map(([n, c], i) => `${hex(30 + i * 80, 38, c)}<text x="${30 + i * 80}" y="88" text-anchor="middle" class="kl">${n}</text>`).join(''), 'diagram');
}

// ---------- Escenas ----------
// Portada de Información: teclado con la palabra neanbit encendida
export function heroKeys() {
  return keyboard({ lit: ['N', 'E', 'A', 'B', 'I', 'T'], cursor: true, space: true });
}

// Estado vacío: un renglón con el cursor
export function emptyArt() {
  return svg(160, 60, '<rect x="6" y="14" width="148" height="32" rx="5" class="mute"/><path d="M20 30h54" class="mute"/><rect class="f cur" x="80" y="22" width="8" height="16"/>', 'empty');
}

// ---------- Ilustraciones de las páginas legales ----------
export const legalArt = {
  terms: () => svg(96, 96, '<path d="M24 10h36l14 14v62H24z"/><path class="mute" d="M60 10v14h14"/><path d="M34 40h30M34 52h30M34 64h16"/><circle class="s2" cx="62" cy="68" r="10"/><path class="s2" d="M57 68l4 4 7-8"/>', 'legal'),
  privacy: () => svg(96, 96, '<path d="M48 8l32 12v26c0 20-13 34-32 42C29 80 16 66 16 46V20z"/><path class="mute" d="M48 18l22 8v20c0 14-9 25-22 31"/><rect x="38" y="44" width="20" height="16"/><path d="M42 44v-6a6 6 0 0 1 12 0v6"/><rect class="f" x="46" y="50" width="4" height="4"/>', 'legal'),
  cookies: () => svg(96, 96, '<path d="M48 10a38 38 0 1 0 38 38 14 14 0 0 1-16-14 14 14 0 0 1-22-24z"/><rect class="f" x="34" y="40" width="7" height="7"/><rect class="f" x="52" y="58" width="7" height="7"/><path d="M38 66h6M60 44h6" class="mute"/>', 'legal'),
  rules: () => svg(96, 96, '<path d="M48 12v66M28 84h40"/><path d="M20 28h56"/><path d="M20 28l-10 22h20zM76 28l-10 22h20z"/><path class="mute" d="M10 50a10 6 0 0 0 20 0M66 50a10 6 0 0 0 20 0"/><rect class="f" x="43" y="8" width="10" height="10"/>', 'legal'),
  info: () => svg(96, 96, '<rect x="14" y="14" width="68" height="68" rx="12"/><rect class="mute" x="24" y="22" width="48" height="40" rx="6"/><path d="M48 36v16"/><rect class="f" x="45" y="27" width="6" height="6"/><path class="mute" d="M30 72h36"/>', 'legal'),
  guides: () => svg(96, 96, '<path d="M14 20h28a6 6 0 0 1 6 6v52a6 6 0 0 0-6-6H14zM82 20H54a6 6 0 0 0-6 6v52a6 6 0 0 1 6-6h28z"/><path class="mute" d="M22 34h18M22 44h18M56 34h18M56 44h12"/><rect class="f" x="56" y="54" width="8" height="8"/>', 'legal'),
};

// ---------- Mantenimiento ----------
export function maintArt() {
  return svg(160, 100, '<rect x="4" y="30" width="152" height="60" rx="8"/><rect class="mute" x="14" y="40" width="22" height="18" rx="3"/><rect class="mute" x="42" y="40" width="22" height="18" rx="3"/><rect class="mute" x="70" y="40" width="22" height="18" rx="3"/><rect class="f" x="98" y="40" width="22" height="18" rx="3"/><rect class="mute" x="14" y="64" width="106" height="16" rx="3"/><path class="s2" d="M80 30V10a14 14 0 0 1 28 0v6"/>', 'maint');
}

export const art = { keyboard, modeIcon, cpmDiagram, duelDiagram, bracketDiagram, hardcoreDiagram, ghostDiagram, tierDiagram, heroKeys, emptyArt, maintArt, legalArt };

// Reemplaza <span data-art="duel"> por la ilustración. data-art="mode:duel" para íconos de modo.
export function paintArt(root = document) {
  root.querySelectorAll('[data-art]').forEach((el) => {
    const [kind, arg] = el.dataset.art.split(':');
    const html = kind === 'mode' ? modeIcon(arg) : kind === 'legal' ? legalArt[arg]?.() : art[kind]?.();
    if (html) el.innerHTML = html;
  });
}
