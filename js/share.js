// Resultado compartible: una imagen que se dibuja en el navegador (canvas) solo cuando la pedís desde el botón
// "Compartir" del resultado. No sube nada a ningún servidor.
import { $ } from './ui.js';

const W = 1200;
const H = 630;
let blob = null;

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };

async function mark() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'img/mark.svg';
  });
}

// data: { speed, unit, acc, time, words, errors, label, name, handle, level, record }
async function draw(data) {
  try { await Promise.all([document.fonts.load('500 120px "IBM Plex Mono"'), document.fonts.load('600 40px "Poppins"')]); } catch {}
  const bg = css('--bg'); const panel = css('--panel'); const line = css('--line');
  const text = css('--text'); const muted = css('--muted'); const accent = css('--accent');
  const mono = '"IBM Plex Mono", ui-monospace, Consolas, monospace';
  const ui = '"Poppins", system-ui, sans-serif';
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');

  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  c.strokeStyle = line; c.globalAlpha = 0.35; c.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + .5, 0); c.lineTo(x + .5, H); c.stroke(); }
  for (let y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + .5); c.lineTo(W, y + .5); c.stroke(); }
  c.globalAlpha = 1;

  // panel con marcas de registro
  const px = 60; const py = 60; const pw = W - 120; const ph = H - 120;
  c.fillStyle = panel; c.fillRect(px, py, pw, ph);
  c.strokeStyle = line; c.lineWidth = 2; c.strokeRect(px, py, pw, ph);
  c.strokeStyle = accent; c.lineWidth = 5;
  c.beginPath(); c.moveTo(px, py + 36); c.lineTo(px, py); c.lineTo(px + 36, py); c.stroke();
  c.beginPath(); c.moveTo(px + pw, py + ph - 36); c.lineTo(px + pw, py + ph); c.lineTo(px + pw - 36, py + ph); c.stroke();

  // rótulo
  c.fillStyle = accent; c.fillRect(px + 48, py + 52, 14, 14);
  c.fillStyle = muted; c.font = `500 24px ${mono}`; c.textBaseline = 'alphabetic';
  c.fillText(data.label.toUpperCase().split('').join(String.fromCharCode(8202)), px + 76, py + 66);

  // velocidad
  c.fillStyle = css('--ink') || accent; c.font = `500 230px ${mono}`;
  c.fillText(String(data.speed), px + 44, py + 300);
  const sw = c.measureText(String(data.speed)).width;
  c.fillStyle = muted; c.font = `500 36px ${mono}`;
  c.fillText(data.unit, px + 60 + sw, py + 300);
  if (data.record) {
    c.fillStyle = accent; rr(c, px + 48, py + 326, 292, 46, 6); c.fill();
    c.fillStyle = css('--on-accent'); c.font = `600 24px ${ui}`;
    c.fillText('Nuevo récord personal', px + 68, py + 358);
  }

  // datos
  const cells = [['Precisión', data.acc + '%'], ['Tiempo', data.time + ' s'], ['Palabras', String(data.words)], ['Errores', String(data.errors)]];
  const cw = (pw - 96) / 4;
  cells.forEach(([k, v], i) => {
    const x = px + 48 + i * cw;
    c.strokeStyle = line; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, py + 400); c.lineTo(x + cw - 24, py + 400); c.stroke();
    c.fillStyle = muted; c.font = `500 20px ${mono}`; c.fillText(k.toUpperCase().split('').join(String.fromCharCode(8202)), x, py + 436);
    c.fillStyle = text; c.font = `500 44px ${mono}`; c.fillText(v, x, py + 486);
  });

  // pie: quién y dónde
  const icon = await mark();
  if (icon) c.drawImage(icon, px + pw - 120, py + 40, 72, 72);
  c.fillStyle = text; c.font = `600 28px ${ui}`; c.textAlign = 'right';
  c.fillText(data.name, px + pw - 140, py + 66);
  c.fillStyle = muted; c.font = `500 20px ${mono}`;
  if (data.handle) c.fillText(`@${data.handle}${data.level ? '  ·  Nivel ' + data.level : ''}`, px + pw - 140, py + 100);
  c.fillStyle = muted; c.font = `500 22px ${mono}`;
  c.fillText('type.neanbit.com', px + pw - 48, py + 300);
  c.textAlign = 'left';
  return cv;
}

const toBlob = (cv) => new Promise((resolve) => cv.toBlob(resolve, 'image/png'));

export async function openShare(data) {
  const dlg = $('#share');
  $('#share-img').removeAttribute('src');
  $('#share-msg').textContent = 'Preparando la imagen…';
  dlg.showModal();
  try {
    const cv = await draw(data);
    blob = await toBlob(cv);
    $('#share-img').src = cv.toDataURL('image/png');
    $('#share-msg').textContent = '';
    const file = new File([blob], 'neanbit-type.png', { type: 'image/png' });
    $('#share-send').hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    $('#share-copy').hidden = !(navigator.clipboard && window.ClipboardItem);
  } catch {
    $('#share-msg').textContent = 'No se pudo generar la imagen en este navegador.';
  }
}

$('#share-close').onclick = () => $('#share').close();
$('#share-dl').onclick = () => {
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'neanbit-type.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('#share-copy').onclick = async () => {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    $('#share-msg').textContent = 'Imagen copiada.';
  } catch { $('#share-msg').textContent = 'No se pudo copiar. Probá con Descargar.'; }
};
$('#share-send').onclick = async () => {
  try {
    await navigator.share({ files: [new File([blob], 'neanbit-type.png', { type: 'image/png' })], title: 'neanbit type' });
  } catch {}
};
