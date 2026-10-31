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
- Probado en Chromium (3 temas, 1280 y 390 px) sin desbordes ni errores de consola; no probado en Safari/Firefox ni con duelos/torneos en vivo.
