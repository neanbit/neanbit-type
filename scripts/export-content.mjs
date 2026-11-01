// Genera server/content-defaults.json: los textos originales de las páginas (Información, Guías, FAQ y legales).
// El panel (neanbit-type-admin) los usa como punto de partida para editarlos. Correr cada vez que cambie un texto en js/pages.js:
//   node scripts/export-content.mjs
// Después copiar server/content-defaults.json a la carpeta server/ del panel.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const noop = () => {};
globalThis.document = { addEventListener: noop, querySelector: () => null, getElementById: () => null };
globalThis.window = { addEventListener: noop };
globalThis.location = { pathname: '/' };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { defaults } = await import(join(root, 'js', 'pages.js'));
const out = join(root, 'server', 'content-defaults.json');
writeFileSync(out, JSON.stringify(defaults(), null, 1) + '\n');
console.log('Escrito', out);
