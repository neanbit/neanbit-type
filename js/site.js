import { api } from './api.js';
import { load, save } from './store.js';
import { pages } from './pages.js';
import { setFeatures } from './features.js';

const $ = (sel) => document.querySelector(sel);

async function checkSite() {
  let config;
  let session;
  try {
    [config, session] = await Promise.all([api.config(), api.me()]);
  } catch {
    return;
  }
  setFeatures(config.features);
  pages.setContent(config.content);
  pages.setInfo(config.info);
  const gmax = config.goalMax || 50;
  document.querySelectorAll('#goal-seg button[data-g]').forEach((b) => { b.hidden = Number(b.dataset.g) > gmax; });

  if (config.maintenance.on && session.user?.role !== 'admin') {
    $('#maint-msg').textContent = config.maintenance.message || 'Volvemos en un rato.';
    $('#maint').hidden = false;
    return;
  }

  const news = config.announcement;
  if (news && load('news', 0) !== news.id) {
    $('#news-title').textContent = news.title;
    $('#news-body').textContent = news.body;
    $('#news').showModal();
    $('#news-close').onclick = () => {
      save('news', news.id);
      $('#news').close();
    };
  }
}

export const siteReady = checkSite();
