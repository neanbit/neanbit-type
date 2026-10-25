export const $ = (sel) => document.querySelector(sel);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const svg = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

export const icons = {
  lock: '<rect x="5" y="11" width="14" height="9"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12l4.5 4.5L19 7"/>',
  left: '<path d="M14 6l-6 6 6 6"/>',
  right: '<path d="M10 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  link: '<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-5.5 7-5.5s6 1.5 7 5.5"/>',
  keys: '<rect x="3" y="7" width="18" height="11"/><path d="M7 11h.01M11 11h.01M15 11h.01M7 15h10"/>',
  medal: '<circle cx="12" cy="9" r="5"/><path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5L15 13.5"/>',
  pen: '<path d="M4 20l4-1 10-10-3-3L5 16z"/><path d="M14 7l3 3"/>',
  replay: '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>',
  seal: '<path d="M12 3l2.4 1.8 3-.2 1 2.8 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-1 2.8-3-.2L12 21l-2.4-1.8-3 .2-1-2.8-2.5-1.7.9-2.9-.9-2.9 2.5-1.7 1-2.8 3 .2z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
};

export const medalImg = (m) => `<img src="img/medals/${esc(m.icon)}.svg" alt="" loading="lazy" draggable="false">`;
export const countBadge = (m) => (m.stackable && m.count > 1 ? `<i class="count">${m.count}</i>` : '');
