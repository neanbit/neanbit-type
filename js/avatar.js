const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const avatarInner = (u) =>
  u.av ? `<img src="/api/avatar/${u.handle}?v=${u.av}" alt="">` : esc(String(u.name).trim().charAt(0).toUpperCase());
