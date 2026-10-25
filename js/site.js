import { api } from './api.js';
import { load, save } from './store.js';

const $ = (sel) => document.querySelector(sel);

async function checkSite() {
  let config;
  let session;
  try {
    [config, session] = await Promise.all([api.config(), api.me()]);
  } catch {
    return;
  }

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

checkSite();
