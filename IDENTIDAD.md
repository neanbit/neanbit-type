# Identidad visual nueva (30 de octubre de 2026)

## Idea
Una tecla y un cursor. El logo termina en un cuadrado de color: ese cuadrado es el cursor y aparece en los rótulos.
- Botones = teclas (borde inferior, se hunden al apretar). Controles dentro de filas (pestañas, segmentos) quedan planos.
- Paneles principales con marcas de registro en dos esquinas (se dibujan con `background`, sin pseudo-elementos). Se acaban las franjas de color al costado.
- Rótulos en IBM Plex Mono, mayúsculas, con cuadrado. Fondo de papel cuadriculado (`--grid`).
- Se mantienen: paleta (#14213d, #f1f5f9, #fca311), tres temas, Poppins + IBM Plex Mono, logo y sin emojis.
- Tokens nuevos: `--bg-deep`, `--raise`, `--grid`, `--k` (radio de tecla), `--z1..--z4` (dedos en el dibujo del teclado).

## Archivos
- `js/art.js`: ilustraciones SVG propias (teclado generado con zonas por dedo, íconos de modo, diagramas de CPM, duelo, llave, Hardcore, récord, niveles de medalla, escenas legales). Toman color del tema. `data-art="..."` en el HTML las inserta.
- `img/mark.svg`: marca en SVG (favicon). `mark.png` queda de respaldo.
- `js/pages.js`: Información, Guías y preguntas frecuentes (con buscador y categorías), Términos, Privacidad, Cookies y Normas. Todo el texto está ahí. Rutas `/info /guias /terminos /privacidad /cookies /normas` (el servidor entrega `index.html`; ver `pageRoutes` en `server/index.js`).
- `css/pages.css`: esas páginas y el pie.
- La ventana «Información» del panel (`settings.info`) ahora se muestra como «Aviso del sitio» arriba de la página Información. El contrato con el panel no cambia.
- Registro: casilla obligatoria de aceptación de Términos y Privacidad (13 años o más). No se guarda en el servidor.
- Perfil, editor y vitrina: solo CSS (`css/profile.css`); no cambió ningún comportamiento (`js/profile.js`, `editor.js`, `vitrina.js`, `ui.js`, `crop.js` intactos).

## Decisiones mías, sin confirmar (revisar)
1. **Textos legales**: describen lo que hace la app hoy (según el código y SEGURIDAD.md), pero **no son asesoramiento legal**. Conviene que los revise alguien con conocimiento de la Ley 25.326.
2. Edad mínima 13 años; menores de 18 con conocimiento de un adulto.
3. Jurisdicción: «tribunales competentes de la República Argentina» (sin ciudad). Completar si querés.
4. Contacto: el perfil público de `@neanbit` (constante `CONTACT_HANDLE` en `js/pages.js`). Cambiala si usás otro usuario o querés un correo.
5. Plazos de respuesta (10 días corridos / 5 días hábiles) tomados de la Ley 25.326: verificar.
6. La política dice que el servidor está en Alemania y que Cloudflare y Google Fonts reciben la IP. Si desactivás Fonts propias o usás otro proveedor, actualizar.
7. «Código abierto» en Información: el repo es público pero **no hay licencia definida** (README pendiente). Los Términos remiten a lo que diga el repo.
8. No hay recuperación de contraseña ni baja de cuenta desde la app: las guías lo dicen y remiten al contacto. Es un pendiente real.

## No hecho
- Capturas de pantalla para el README.
- Tipografías alojadas en el propio servidor (hoy vienen de Google Fonts).
- Imagen para compartir en redes (og:image).
- Probado en Chromium (4 temas, 1280 y 390 px) sin desbordes; duelo y revancha probados con dos usuarios en Chromium. No probado en Safari/Firefox ni con torneos en vivo.

## Segunda tanda (funciones nuevas)
- **Resultado compartible**: botón «Compartir» plano en el resultado. Dibuja un PNG de 1200x630 en un canvas (`js/share.js`), solo si lo pedís; no sube nada. Ofrece descargar, copiar y la hoja de compartir del sistema cuando existe. No aparece mientras jugás ni abre nada solo.
- **Niveles y XP** (`levelOf` en `server/index.js`): sin tabla nueva, se calcula con lo guardado. 10 XP por carrera, 15 en Hardcore, +5 sin errores, +20 duelo ganado, +150 torneo ganado. Nivel = 1 + raíz(XP/50). Ocho títulos (Novato a Leyenda). **Fórmula y títulos son decisión mía**: ajustalos en `RANKS`/`levelOf`.
- **Racha y meta diaria**: la racha viene de `homeSummary`; la meta es la columna `users.goal` (1 a 50, por defecto 5), editable desde el inicio.
- **Rankings paginados**: 10 por página, con «tu posición»; Hardcore completo (carreras y eliminaciones).
- **Revancha**: tras un duelo ambos siguen conectados, así que es una invitación normal (`duel.rematch`). Se oculta en torneos y si el rival abandonó.
- **Textos propios** (`js/mytexts.js`): solo en el navegador (`nt_mytexts`), 40 a 800 caracteres, no suman a ranking, XP ni estadísticas.
- **Tema «Alto contraste»**: negro, amarillo `#ffd400`, bordes de 2 px y foco blanco grueso.
- **Sonido de teclas** (`js/sound.js`): sintetizado con WebAudio, apagado por defecto (Apagado / Suave / Fuerte).
- **Ritmo del cursor**: apagado por defecto. Marca punteada sobre la barra al ritmo de tu promedio (10 últimas) o tu récord; verde si vas adelante, rojo si atrás. Necesita 3 carreras. No se usa en duelos ni entrenamiento. La barra «late» con cada tecla.
- **Animación del resultado**: entrada escalonada, barra de XP y estallido de partículas si es récord. Respeta `prefers-reduced-motion`.
- El tema por defecto ahora sigue al sistema (claro u oscuro) hasta que elegís uno.
- La grilla de modos pasó a 3x2 (los seis modos al mismo tamaño).

### Pendiente de esta tanda
- La velocidad del texto propio y del ritmo no se verificó con teclados reales (probado con Playwright).
- Sonido: no se pudo oír en el entorno de prueba; revisá volúmenes.
- Probar la revancha con mala conexión (invitación vencida a los 30 s) en vivo.

## Tercera tanda: editable desde el panel
- Nuevas claves de `settings` que lee `/api/config`: `features`, `progress` y `content` (ver README). Los valores de fábrica de niveles están en `server/levels.js`; `levelOf` ya no tiene números fijos.
- `users.xp_bonus`: ajuste manual de XP que se suma encima de lo calculado (columna nueva, se crea sola).
- Textos de las páginas: `js/pages.js` acepta reemplazos (`pages.setContent`). Los textos tienen marcadores `{{contacto}}`, `{{fecha}}` y `{{repo}}`. El HTML pasa por `server/html-safe.js` (lista blanca) al guardar en el panel y al servir.
- `scripts/export-content.mjs` genera `server/content-defaults.json` (los textos originales para el panel). **Hay que correrlo y copiar el archivo al panel cada vez que cambie un texto en `js/pages.js`.**
- Las funciones apagadas se ocultan con `data-feature` + `html[data-off]` (CSS); `js/features.js`. El servidor no impide una revancha ni un compartir: solo se ocultan.
- Las páginas legales siguen sin ser asesoramiento legal, y ahora cualquiera con acceso al panel puede cambiarlas.
- Si la dirección es una página (por ejemplo `/terminos`), la app espera hasta 1,2 s a que lleguen los textos editados antes de mostrarla.

## Nivel en el perfil (etapa 26, paso 3)

- El campo «Título» del perfil se retiró: ya no se pide, no se muestra y `POST /api/profile` lo ignora. La columna `users.title` se conserva sin usar, con los datos viejos.
- `js/nivel.js` y `css/nivel.css` (nuevos): widget `#pf-level` en la cabecera (el número del nivel en un cuadrado del color del perfil, título, XP y barra) y ventana `#levels` con el avance, los próximos 5 niveles y los títulos. Se abre con un clic en el widget.
- `/api/users/:handle` suma `ladder` (`step` y `titles`, para calcular los niveles futuros) y, solo en el perfil propio, `boost` (el potenciador que rige ahora). `/api/home` suma `boost` en `pulse`.
- El potenciador activo se avisa en la ventana de nivel (perfil propio), en el bloque de nivel del inicio y en el resultado de carrera (`xp.mult`).
- Clase `.lv-key` con el modificador `.xl` (no `.big`, que ya usa el editor).
