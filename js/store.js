const prefix = 'nt_';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(prefix + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value));
  } catch {}
}
