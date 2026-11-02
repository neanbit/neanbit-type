# neanbit type

Práctica de mecanografía en español: carreras contra el reloj, Hardcore, entrenamiento con tus errores, duelos 1 contra 1 en vivo, torneos de eliminación directa, medallas, niveles y rankings. Se juega en el navegador, sin instalar nada. Sitio: https://type.neanbit.com

Node 22.13 o superior, **sin dependencias y sin build**. Front estático con módulos ES; servidor con `http`, `node:sqlite` y un WebSocket escrito a mano; base SQLite en modo WAL.

## Cómo correrlo

```bash
NT_DB=/home/neanbit/neanbit-type-data/data.db PORT=3000 NT_ADMIN=neanbit node server/index.js
```

| Variable | Qué es |
|---|---|
| `NT_DB` | Ruta de la base SQLite. |
| `PORT` | Puerto (3000 por defecto). |
| `NT_ADMIN` | Usuario dueño: siempre es administrador. Se crea la cuenta con ese nombre. |
| `HOST` | Dirección de escucha (127.0.0.1 detrás del túnel). |
| `NT_CSP=report` | Cabeceras CSP en modo reporte. |

Para probar sin tocar datos reales: `NT_DB=/tmp/h.db PORT=3222 NT_ADMIN=ana node server/index.js`.

## Qué incluye

- **Modos:** aleatorio, personalizado (categoría o texto, más «Mis textos» guardados en el navegador), entrenamiento, Hardcore, duelos (con revancha) y torneos.
- **Progreso:** niveles y experiencia (el nivel se ve en el perfil como un widget que abre el detalle: avance, próximos niveles y títulos), racha de días, meta diaria y rankings paginados (carreras, promedios, Hardcore, duelos, torneos).
- **Recompensas:** marcos de foto, efectos de nombre y portadas, con rareza. Se desbloquean por nivel, medalla, puesto en un torneo o evento con fechas (o a mano desde el panel) y avisan con «Desbloqueaste…». Se activan desde Editar perfil. En rankings, duelos y torneos se ven quietos.
- **Resultado:** animación, barra de experiencia e imagen para compartir (se dibuja en el navegador, no se sube).
- **Ajustes:** cuatro temas (neanbit, claro, carbón y alto contraste), unidad de velocidad, sonido de teclas y ritmo del cursor (apagados por defecto).
- **Información:** Información, Guías, preguntas frecuentes, Términos, Privacidad, Cookies y Normas, con rutas propias (`/info`, `/guias`, `/terminos`, `/privacidad`, `/cookies`, `/normas`).

## Se administra desde el panel

El panel [neanbit-type-admin](../neanbit-type-admin) comparte la base y escribe en la tabla `settings`. La app lee, en cada pedido a `/api/config`:

| Clave | Qué controla |
|---|---|
| `maintenance` | Modo mantenimiento y mensaje. |
| `info` | Aviso del sitio (arriba de la página Información). |
| `features` | Funciones encendidas o apagadas: compartir, revancha, sonido, ritmo, textos propios, niveles, meta diaria. |
| `progress` | XP por acción (incluye los valores por defecto de los puestos de torneo), escala, títulos de nivel, meta diaria por defecto y máxima. |
| `content` | Reemplazos de los textos de las páginas y datos del sitio (contacto, fecha, repositorio). |

Los textos originales viven en `js/pages.js`. Si los cambiás, regenerá el archivo que usa el panel y copialo a la carpeta `server/` del panel:

```bash
node scripts/export-content.mjs
```

Archivos que deben ser idénticos en la app y el panel: `server/medals.js`, `server/levels.js`, `server/html-safe.js`, `server/content.js`, `server/content-defaults.json` y `server/medal-icons/`.

## Estructura

```
index.html        única página; las pantallas se muestran con show(nombre)
css/              estilos por pantalla
js/               módulos del front (main.js arma todo; pages.js tiene los textos)
server/           index.js (API y estáticos), duels.js, tournaments.js, medals.js, levels.js, rewards.js (recompensas y reglas), limits.js, seed.js
scripts/          backup, auditoría de seguridad y export-content.mjs
```

## Documentos

- [IDENTIDAD.md](IDENTIDAD.md): decisiones visuales y de producto, y lo que queda pendiente.
- [SEGURIDAD.md](SEGURIDAD.md): medidas de seguridad.
- [TORNEOS-PENDIENTES.md](TORNEOS-PENDIENTES.md): pendientes de torneos.

**Licencia:** sin definir. El repositorio es público, pero todavía no tiene una licencia; los Términos remiten a lo que diga el repositorio.
