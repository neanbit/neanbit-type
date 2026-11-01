// Funciones que se pueden apagar desde el panel (settings.features, llega en /api/config). Todas vienen encendidas.
// Las partes de la pantalla que dependen de una función llevan data-feature="nombre" y se ocultan por CSS (ver style.css).
export const features = { share: true, rematch: true, sound: true, pace: true, mytexts: true, levels: true, goal: true };

export function setFeatures(next) {
  for (const k of Object.keys(features)) features[k] = !next || next[k] !== false;
  document.documentElement.dataset.off = Object.keys(features).filter((k) => !features[k]).join(' ');
  document.dispatchEvent(new CustomEvent('features'));
}
