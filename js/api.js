async function call(path, body) {
  const res = await fetch('/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo conectar con el servidor.');
  return data;
}

export const api = {
  me: () => call('/me'),
  saveAvatar: (image) => call('/avatar', { image }),
  texts: () => call('/texts'),
  config: () => call('/config'),
  saveProfile: (body) => call('/profile', body),
  login: (handle, password) => call('/login', { handle, password }),
  register: (handle, name, password) => call('/register', { handle, name, password }),
  logout: () => call('/logout', {}),
  sendRace: (body) => call('/races', body),
  death: (textId) => call('/deaths', { textId }),
  stats: () => call('/stats'),
  best: (textId) => call('/best?textId=' + textId),
  userRaces: (handle, page) => call('/users/' + handle + '/races?page=' + page),
  searchUsers: (q) => call('/users?q=' + encodeURIComponent(q)),
  profile: (handle) => call('/users/' + handle),
  home: () => call('/home?tz=' + new Date().getTimezoneOffset()),
  topRaces: (scope) => call('/races/top?scope=' + scope),
  averages: (window) => call('/ranking/average?window=' + window),
  ranking: (scope, hc) => call('/ranking?scope=' + scope + (hc ? '&mode=hc' : '')),
};
