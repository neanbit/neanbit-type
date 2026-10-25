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
  login: (handle, password) => call('/login', { handle, password }),
  register: (handle, name, password) => call('/register', { handle, name, password }),
  logout: () => call('/logout', {}),
  sendRace: (body) => call('/races', body),
  death: (textId) => call('/deaths', { textId }),
  stats: () => call('/stats'),
  best: (textId) => call('/best?textId=' + textId),
  profile: (handle) => call('/users/' + handle),
  ranking: (scope, hc) => call('/ranking?scope=' + scope + (hc ? '&mode=hc' : '')),
};
