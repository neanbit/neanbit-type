const $ = (sel) => document.querySelector(sel);
const size = 240;
let img = null;
let scale = 1;
let x = 0;
let y = 0;
let drag = null;
let onSave = null;

const clamp = () => {
  x = Math.min(0, Math.max(size - img.naturalWidth * scale, x));
  y = Math.min(0, Math.max(size - img.naturalHeight * scale, y));
};
const draw = () => ($('#crop-img').style.transform = `translate(${x}px, ${y}px) scale(${scale})`);

export function openCrop(file, done) {
  onSave = done;
  const reader = new FileReader();
  reader.onload = () => {
    img = new Image();
    img.onload = () => {
      const min = size / Math.min(img.naturalWidth, img.naturalHeight);
      scale = min;
      x = (size - img.naturalWidth * scale) / 2;
      y = (size - img.naturalHeight * scale) / 2;
      Object.assign($('#crop-img'), { src: img.src });
      $('#crop-img').style.width = img.naturalWidth + 'px';
      Object.assign($('#crop-zoom'), { min, max: min * 4, step: min / 50, value: scale });
      draw();
      $('#crop').showModal();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

const view = $('#crop-view');
view.onpointerdown = (e) => {
  drag = { px: e.clientX, py: e.clientY, x, y };
  view.setPointerCapture(e.pointerId);
};
view.onpointermove = (e) => {
  if (!drag) return;
  x = drag.x + e.clientX - drag.px;
  y = drag.y + e.clientY - drag.py;
  clamp();
  draw();
};
view.onpointerup = () => (drag = null);
$('#crop-zoom').oninput = (e) => {
  const cx = (size / 2 - x) / scale;
  const cy = (size / 2 - y) / scale;
  scale = Number(e.target.value);
  x = size / 2 - cx * scale;
  y = size / 2 - cy * scale;
  clamp();
  draw();
};
$('#crop-cancel').onclick = () => $('#crop').close();
$('#crop-save').onclick = () => {
  const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  canvas.getContext('2d').drawImage(img, -x / scale, -y / scale, size / scale, size / scale, 0, 0, 256, 256);
  $('#crop').close();
  onSave(canvas.toDataURL('image/jpeg', 0.85));
};
