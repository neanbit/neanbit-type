// Limpieza de HTML para los textos de páginas editables desde el panel. Lista blanca de etiquetas y atributos.
// Compartido con neanbit-type-admin (archivos idénticos). La app lo vuelve a aplicar al servir, por si la base se tocó a mano.

const TAGS = new Set(['p', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'br', 'kbd', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h3', 'small']);
const VOID = new Set(['br']);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|svg|math|template)\b[\s\S]*?<\/\1\s*>/gi;
const CLASSES = new Set(['num', 'dots', 'doc-table']);
const escText = (s) => s.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function attrs(tag, raw) {
  const out = [];
  const re = /([a-z][a-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  for (const m of raw.matchAll(re)) {
    const k = m[1].toLowerCase();
    const v = (m[2] ?? m[3] ?? '').trim();
    if (tag === 'a' && k === 'href' && (/^(https?:\/\/[^\s]+|\/[a-z0-9\-_/#.]*|#[a-z0-9\-_]*|\{\{repo\}\})$/i.test(v))) out.push(`href="${escAttr(v)}"`);
    else if (tag === 'a' && ['data-page', 'data-anchor', 'data-profile'].includes(k) && /^[a-z0-9_-]{1,30}$/i.test(v)) out.push(`${k}="${escAttr(v)}"`);
    else if (k === 'class' && v.split(/\s+/).every((c) => CLASSES.has(c))) out.push(`class="${escAttr(v)}"`);
  }
  if (tag === 'a' && /href="(https?:|\{\{repo)/.test(out.join(' '))) out.push('target="_blank"', 'rel="noopener noreferrer nofollow"');
  return out.length ? ' ' + out.join(' ') : '';
}

export function safeHtml(input, max = 20000) {
  const src = String(input ?? '').replace(/\r/g, '').slice(0, max).replace(/<!--[\s\S]*?-->/g, '').replace(DROP_WITH_CONTENT, '');
  let out = '';
  let last = 0;
  const open = [];
  for (const m of src.matchAll(/<(\/?)([a-z][a-z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi)) {
    out += escText(src.slice(last, m.index));
    last = m.index + m[0].length;
    const tag = m[2].toLowerCase();
    if (!TAGS.has(tag)) continue;
    if (m[1]) {
      const at = open.lastIndexOf(tag);
      if (at === -1 || VOID.has(tag)) continue;
      while (open.length > at) out += `</${open.pop()}>`;
    } else {
      out += `<${tag}${attrs(tag, m[3])}>`;
      if (!VOID.has(tag)) open.push(tag);
    }
  }
  out += escText(src.slice(last));
  while (open.length) out += `</${open.pop()}>`;
  return out.trim();
}
