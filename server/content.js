// Limpieza de los textos de páginas editables (settings.content). Compartido con neanbit-type-admin (archivos idénticos).
// Sirve para validar al guardar (panel) y otra vez al servir (app).
import { safeHtml } from './html-safe.js';

export const PAGE_IDS = ['info', 'guias', 'terminos', 'privacidad', 'cookies', 'normas'];

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const list = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);

export function cleanPage(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  if (p.title) out.title = text(p.title, 80);
  if (p.lead) out.lead = safeHtml(p.lead, 800);
  if (Array.isArray(p.sections)) out.sections = list(p.sections, 40).map((x) => ({ t: text(x?.t, 90), html: safeHtml(x?.html) })).filter((x) => x.t);
  if (Array.isArray(p.guides)) out.guides = list(p.guides, 40).map((x) => ({ id: text(x?.id, 30).toLowerCase().replace(/[^a-z0-9-]/g, ''), title: text(x?.title, 90), html: safeHtml(x?.html) })).filter((x) => x.id && x.title);
  if (Array.isArray(p.faq)) out.faq = list(p.faq, 120).map((x) => ({ c: text(x?.c, 30), q: text(x?.q, 160), a: safeHtml(x?.a, 4000) })).filter((x) => x.q && x.a);
  if (Array.isArray(p.extra)) out.extra = list(p.extra, 10).map((x) => ({ t: text(x?.t, 90), html: safeHtml(x?.html) })).filter((x) => x.t);
  return out;
}

export function cleanSite(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const site = {};
  if (/^[a-z0-9_]{3,15}$/i.test(r.contact || '')) site.contact = r.contact;
  if (text(r.updated, 40)) site.updated = text(r.updated, 40);
  if (/^https:\/\/[^\s"<>]{4,100}$/.test(r.repo || '')) site.repo = r.repo;
  return site;
}

// Devuelve { site, pages } listo para guardar o servir, o null si no hay nada.
export function cleanContent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pages = {};
  for (const id of PAGE_IDS) {
    const p = cleanPage(raw.pages?.[id]);
    if (Object.keys(p).length) pages[id] = p;
  }
  const site = cleanSite(raw.site);
  return Object.keys(pages).length || Object.keys(site).length ? { site, pages } : null;
}
