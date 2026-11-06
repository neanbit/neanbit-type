import { localizeMedals } from './medal-unit.js';

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
  stats: (mode) => call('/stats' + (mode && mode !== 'all' ? '?mode=' + mode : '')),
  tournaments: () => call('/tournaments'),
  tournament: (id) => call('/tournaments/' + id),
  joinTournament: (id) => call('/tournaments/' + id + '/join', {}),
  leaveTournament: (id) => call('/tournaments/' + id + '/leave', {}),
  tourneyRanking: () => call('/ranking/tourneys'),
  best: (textId) => call('/best?textId=' + textId),
  userRaces: (handle, page, mode = 'all') => call('/users/' + handle + '/races?page=' + page + '&mode=' + mode),
  searchUsers: (q) => call('/users?q=' + encodeURIComponent(q)),
  profile: (handle) => call('/users/' + handle).then(localizeMedals),
  rewards: () => call('/rewards'),
  track: () => call('/track'),
  claim: (slot) => call('/track/claim', { slot }),
  claimAll: () => call('/track/claim-all', {}),
  rewardNews: () => call('/rewards/news'),
  rewardsSeen: () => call('/rewards/seen', {}),
  home: () => call('/home?tz=' + new Date().getTimezoneOffset()),
  missions: () => call('/missions'),
  claimMission: (mission) => call('/missions/claim', { mission }),
  topRaces: (scope) => call('/races/top?scope=' + scope),
  averages: (window, page = 0) => call('/ranking/average?window=' + window + '&page=' + page),
  duelRanking: (scope, page = 0) => call('/ranking/duels?scope=' + scope + '&page=' + page),
  ranking: (scope, hc, page = 0) => call('/ranking?scope=' + scope + (hc ? '&mode=hc' : '') + '&page=' + page),
};
