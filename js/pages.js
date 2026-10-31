// Páginas de contenido: Información, Guías y preguntas frecuentes, y las legales.
// Viven dentro de la misma app (sin recargar). El servidor responde index.html en estas rutas, así que los enlaces
// directos y el botón Atrás funcionan. Todo el texto está acá, en un solo lugar, para poder corregirlo sin tocar el resto.

import { art, legalArt, paintArt } from './art.js';
import { esc } from './ui.js';

// Quién responde las consultas: la persona dueña del proyecto, a través de su perfil público (ahí figura su Discord).
const CONTACT_HANDLE = 'neanbit';
const UPDATED = '30 de octubre de 2026';
const REPO = 'https://github.com/neanbit/neanbit-type';

const paths = { info: '/info', guias: '/guias', terminos: '/terminos', privacidad: '/privacidad', cookies: '/cookies', normas: '/normas' };
const idOf = (path) => Object.keys(paths).find((k) => paths[k] === path.replace(/\/+$/, '')) || null;

const contact = `<a href="#" data-profile="${CONTACT_HANDLE}">el perfil de @${CONTACT_HANDLE}</a>`;

// ---------- piezas ----------
const hero = ({ eyebrow, title, lead, side, wide = false, meta = '' }) => `
  <header class="page-hero${wide ? ' wide' : ''}">
    <div>
      <p class="eyebrow">${eyebrow}</p>
      <h1>${title}</h1>
      <p class="lead">${lead}</p>
      ${meta ? `<p class="meta">${meta}</p>` : ''}
    </div>
    <div class="hero-art" aria-hidden="true">${side}</div>
  </header>`;

const figure = (svg, caption) => `<figure class="fig">${svg}<figcaption>${caption}</figcaption></figure>`;

// ---------- Información ----------
function infoPage(ctx) {
  const notice = ctx.info && (ctx.info.title || ctx.info.body)
    ? `<aside class="callout notice"><p class="sq">Aviso del sitio</p>${ctx.info.title ? `<h2>${esc(ctx.info.title)}</h2>` : ''}<p>${esc(ctx.info.body || '').replace(/\n/g, '<br>')}</p></aside>` : '';
  const mode = (name, title, text, guide) => `
    <article class="card-mode">
      <div class="cm-art">${art.modeIcon(name)}</div>
      <h3>${title}</h3>
      <p>${text}</p>
      <a href="/guias#${guide}" data-page="guias" data-anchor="${guide}">Ver la guía</a>
    </article>`;
  return `
  ${hero({
    eyebrow: 'Información',
    title: 'Escribir mejor, medirte y competir.',
    lead: 'neanbit type es un lugar para practicar mecanografía en español: carreras contra el reloj, duelos 1 contra 1 en vivo y torneos de eliminación directa. Se juega en el navegador, sin instalar nada.',
    side: art.heroKeys(),
    wide: true,
  })}
  ${notice}

  <section class="sec">
    <p class="eyebrow">Cómo es una carrera</p>
    <h2 class="sec-title">Cuatro pasos y un resultado</h2>
    <ol class="steps">
      <li><b>Elegís un texto</b><span>Al azar, por categoría o uno en particular. Cada texto tiene un número para reconocerlo.</span></li>
      <li><b>Escribís palabra por palabra</b><span>Una palabra queda lista cuando está bien escrita. Si te equivocás, corregís antes de pasar a la siguiente.</span></li>
      <li><b>El reloj arranca solo</b><span>Empieza con la primera tecla y se detiene al terminar el último carácter.</span></li>
      <li><b>Ves tu resultado</b><span>Velocidad, precisión y cuánto te alejaste de tu promedio. Con cuenta, queda guardado.</span></li>
    </ol>
  </section>

  <section class="sec two">
    <div>
      <p class="eyebrow">Cómo se mide</p>
      <h2 class="sec-title">Velocidad en CPM y WPM</h2>
      <p>La velocidad se mide en <b>CPM</b>: caracteres correctos por minuto, contando los espacios entre palabras. Si preferís <b>WPM</b> (palabras por minuto), es el mismo número dividido por cinco, que es el largo convencional de una palabra.</p>
      <p>La <b>precisión</b> es el porcentaje de teclas que apretaste bien sobre el total de teclas apretadas. Podés cambiar la unidad en Ajustes, o elegir <b>ZEN</b> para no ver la velocidad mientras escribís.</p>
    </div>
    ${figure(art.cpmDiagram(), 'Cinco caracteres, contando el espacio, equivalen a una palabra.')}
  </section>

  <section class="sec">
    <p class="eyebrow">Modos de juego</p>
    <h2 class="sec-title">Seis formas de practicar y competir</h2>
    <div class="grid-modes">
      ${mode('random', 'Aleatorio', 'Un texto al azar, sin vueltas. Ideal para calentar.', 'g-primeros')}
      ${mode('pick', 'Personalizado', 'Buscá por palabra, filtrá por largo y elegí exactamente qué escribir.', 'g-primeros')}
      ${mode('practice', 'Entrenamiento', 'Textos armados con las palabras donde más errores tuviste.', 'g-entrenamiento')}
      ${mode('hardcore', 'Hardcore', 'Un solo error termina la carrera. Tiene su propio ranking.', 'g-hardcore')}
      ${mode('duel', 'Duelos', 'Dos jugadores, el mismo texto, en vivo. Gana quien termina primero.', 'g-duelos')}
      ${mode('tourney', 'Torneos', 'Llaves de eliminación directa organizadas por neanbit.', 'g-torneos')}
    </div>
  </section>

  <section class="sec two rev">
    ${figure(art.tierDiagram(), 'Los cinco niveles de las medallas.')}
    <div>
      <p class="eyebrow">Tu perfil</p>
      <h2 class="sec-title">Estadísticas, medallas y estilo propio</h2>
      <p>Cada piloto tiene un perfil público con su récord, su promedio, su historial y las medallas que fue ganando: por constancia, velocidad, precisión, duelos o torneos. Podés elegir seis para mostrar junto a tu nombre y personalizar el color, la cabecera y la forma de la foto.</p>
      <p>Las estadísticas se pueden ver en tres vistas: general, duelos y torneos.</p>
    </div>
  </section>

  <section class="sec">
    <p class="eyebrow">Cómo está hecho</p>
    <h2 class="sec-title">Simple, propio y sin publicidad</h2>
    <div class="grid-3">
      <div class="pt"><b>Sin publicidad</b><span>No hay anuncios ni venta de datos. El proyecto se sostiene por gusto, no por negocio.</span></div>
      <div class="pt"><b>Solo navegador</b><span>No hay que instalar nada. Funciona en las versiones actuales de Chrome, Firefox, Safari y Edge.</span></div>
      <div class="pt"><b>Código abierto</b><span>El código está publicado en <a href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a>. Las carreras se validan en el servidor.</span></div>
    </div>
  </section>

  <aside class="callout cta">
    <div><b>¿Listo para escribir?</b><span>Podés empezar ahora mismo como invitado, o crear una cuenta para guardar tus carreras.</span></div>
    <div class="cta-btns"><button class="primary" data-home>Ir al inicio</button><button data-page="guias" data-href="/guias">Leer las guías</button></div>
  </aside>`;
}

// ---------- Guías y preguntas frecuentes ----------
const guides = [
  ['g-primeros', 'Primeros pasos', () => `
    <p>No hace falta cuenta para probar: como invitado podés correr todas las carreras que quieras, pero no se guardan ni suman al ranking.</p>
    <ol class="num">
      <li>Desde el inicio, tocá <b>Aleatorio</b>. Aparece un texto y un campo para escribir debajo.</li>
      <li>Empezá a escribir. El reloj arranca con la primera tecla.</li>
      <li>Cada palabra tiene que quedar exacta para pasar a la siguiente. Con la barra espaciadora la confirmás.</li>
      <li>Al terminar ves tu velocidad, precisión y tiempo. <kbd>Enter</kbd> pasa al siguiente texto.</li>
    </ol>
    <p>Atajos durante una carrera: <kbd>Tab</kbd> la reinicia, <kbd>Esc</kbd> vuelve al inicio y <kbd>Enter</kbd> avanza al siguiente texto cuando termina. No se puede pegar texto en el campo.</p>`, () => art.modeIcon('random')],
  ['g-postura', 'Postura y fila base', () => `
    <p>Antes de buscar velocidad conviene ordenar las manos. La <b>fila base</b> es donde descansan los dedos: <b>A S D F</b> con la mano izquierda y <b>J K L Ñ</b> con la derecha. Los índices apoyan en la F y la J, que suelen tener una marquita en relieve.</p>
    <p>Cada dedo cubre su zona, como muestra el dibujo. Con el tiempo, dejar de mirar el teclado es lo que más acelera.</p>
    <ul class="dots">
      <li><b>Precisión primero.</b> Mejor lento y limpio: la velocidad llega sola cuando el movimiento es correcto.</li>
      <li><b>Muñecas rectas</b> y antebrazos apoyados, sin forzar los hombros.</li>
      <li><b>Pantalla a la altura de los ojos</b> y pausas cortas cada tanto.</li>
    </ul>`, () => art.keyboard({ zones: true, lit: ['F', 'J'] })],
  ['g-medicion', 'Cómo se mide tu velocidad', () => `
    <p><b>CPM</b> son los caracteres correctos por minuto, contando el espacio que va entre palabras. <b>WPM</b> es CPM dividido por cinco. Por ejemplo, 300 CPM son 60 WPM.</p>
    <p>La <b>precisión</b> es el porcentaje de teclas correctas sobre las teclas totales: cada tecla equivocada cuenta como un error, aunque la corrijas después.</p>
    <p>En Ajustes elegís la unidad (CPM, WPM o ZEN). ZEN oculta la velocidad mientras escribís, útil si te pones nervioso mirando el número.</p>`, () => art.cpmDiagram()],
  ['g-entrenamiento', 'Entrenamiento y contra tu récord', () => `
    <p><b>Entrenamiento</b> arma un texto con las palabras en las que más te equivocás. Necesita cuenta y un mínimo de errores registrados: si todavía no hay suficientes, jugá algunas carreras primero. Lo ves también en Estadísticas, en «Palabras que más te cuestan».</p>
    <p><b>Contra mi récord</b> aparece al terminar una carrera, y también desde tu historial en el perfil. Corrés el mismo texto contra la sombra de tu mejor marca en él.</p>`, () => art.ghostDiagram()],
  ['g-hardcore', 'Hardcore', () => `
    <p>En Hardcore <b>un solo error termina la carrera</b>. Se ve hasta qué palabra llegaste. Las carreras terminadas se guardan aparte de las normales y cuentan para el ranking Hardcore y para las medallas de ese modo.</p>
    <p>Consejo: no apures las primeras palabras. Es más fácil sostener el ritmo que recuperar la calma después de un fallo.</p>`, () => art.hardcoreDiagram()],
  ['g-duelos', 'Duelos 1 contra 1', () => `
    <ol class="num">
      <li>Entrá a <b>Duelos</b> (hace falta cuenta). Elegí <b>Rival al azar</b> o invitá a alguien por su nombre de usuario; esa persona tiene que estar en la sala de Duelos para recibir la invitación, que vence a los 30 segundos.</li>
      <li>Los dos escriben el <b>mismo texto</b>. Hay una cuenta regresiva de 3 segundos y se larga a la vez.</li>
      <li>Gana quien termina primero. Si el otro no termina, tiene 90 segundos de gracia, y el duelo se cierra como máximo a los 5 minutos.</li>
      <li>Si alguien se desconecta o abandona en plena carrera, gana el rival. Si alguien se va antes de largar, el duelo se cancela sin resultado.</li>
    </ol>
    <p>La velocidad en duelo la calcula el <b>servidor</b> desde la largada, así que no depende de tu reloj. Las carreras de duelo suman a tu historial y a tus estadísticas, con una vista propia de Duelos.</p>`, () => art.duelDiagram()],
  ['g-torneos', 'Torneos', () => `
    <p>Los torneos son de <b>eliminación directa</b> y cada partido es un duelo. Los organiza neanbit y se anuncian en la sección Torneos.</p>
    <ol class="num">
      <li><b>Inscripción.</b> Puede ser abierta o pedir requisitos, como un récord mínimo o una medalla. También puede ser por lista cerrada.</li>
      <li><b>Llave.</b> Se sortea cuando empieza el torneo. Si los jugadores no son potencia de dos, los mejores sembrados pasan directo la primera ronda.</li>
      <li><b>Tu partido.</b> Dejá abierta la pantalla del torneo. Cuando te toca, aparece un aviso: tenés un tiempo (180 segundos, salvo que el torneo diga otro) para apretar <b>Estoy listo</b>.</li>
      <li><b>Si no aparecés, perdés.</b> Si no aparece ninguno de los dos, pasa el mejor sembrado.</li>
    </ol>
    <p>Si en un partido nadie termina el texto en 5 minutos, pasa quien llegó más lejos. Con igualdad se repite una vez con otro texto.</p>`, () => art.bracketDiagram()],
  ['g-medallas', 'Medallas y niveles', () => `
    <p>Las medallas se ganan solas al cumplir una condición: cantidad de carreras, velocidad máxima o promedio, carreras sin errores, Hardcore, duelos o torneos ganados. Algunas son <b>apilables</b> (se cuentan) y otras <b>secretas</b>: no se muestran hasta que las conseguís.</p>
    <p>El <b>nivel</b> (bronce, gris, oro, coral o blanco) es el color de la medalla. En la vitrina ves cuáles tenés, cuáles te faltan y cuánto te falta para cada una. Desde «Editar perfil» elegís hasta seis para exhibir.</p>`, () => art.tierDiagram()],
];

const faq = [
  ['Cuenta', '¿Necesito una cuenta para jugar?', 'No. Como invitado podés correr carreras, pero no se guardan, no suman a rankings y no podés jugar duelos ni torneos. Crear una cuenta es gratis y solo pide usuario, nombre para mostrar y contraseña.'],
  ['Cuenta', '¿Puedo cambiar mi nombre de usuario?', 'El usuario (el que va con @) no se cambia. El <b>nombre para mostrar</b>, el título, la biografía y la foto sí, desde «Editar perfil».'],
  ['Cuenta', 'Me olvidé la contraseña, ¿qué hago?', 'Por ahora no hay recuperación automática. Si la perdés, escribinos y vemos cómo ayudarte. Para evitarlo, usá una contraseña que puedas recordar o un gestor de contraseñas.'],
  ['Cuenta', '¿Cómo borro mi cuenta?', `Pedilo por ${contact}. Se eliminan tu perfil, tus carreras y tus estadísticas. Los detalles están en la <a href="/privacidad" data-page="privacidad">Política de privacidad</a>.`],
  ['Cuenta', '¿Quién puede ver mi perfil?', 'Cualquiera. El perfil, el historial reciente, las medallas y tu lugar en los rankings son públicos. Tus errores por tecla y tus estadísticas detalladas solo las ves vos. No pongas en la biografía ni en la foto nada que no quieras que vea todo el mundo.'],
  ['Medición', '¿Qué diferencia hay entre CPM y WPM?', 'CPM cuenta caracteres por minuto; WPM, palabras por minuto, que son CPM dividido por cinco. 300 CPM equivalen a 60 WPM. Elegís la unidad en Ajustes.'],
  ['Medición', '¿Por qué un error me baja la precisión aunque lo corrija?', 'Porque la precisión se calcula sobre las teclas apretadas: cada tecla equivocada cuenta, se corrija o no. Además, una palabra tiene que quedar exacta para poder avanzar.'],
  ['Medición', '¿Se guardan mis carreras de invitado?', 'No. Para que una carrera quede en tu historial y cuente para los rankings, tenés que haber ingresado.'],
  ['Medición', '¿Por qué puedo ver una velocidad distinta en un duelo?', 'En duelos y torneos el tiempo lo mide el servidor desde la largada, para que sea igual para los dos. Puede diferir unas décimas de lo que ves en pantalla.'],
  ['Duelos y torneos', '¿Qué pasa si se me corta internet en un duelo?', 'Si ya largó, gana tu rival por abandono. Si pasa antes de largar, el duelo se cancela sin resultado. En un torneo, desconectarse en plena carrera cuenta como derrota.'],
  ['Duelos y torneos', '¿Cómo me inscribo a un torneo?', 'Entrá a Torneos, abrí el que esté en inscripción e inscribite. Algunos piden requisitos (un récord mínimo, una medalla) o son por lista cerrada; la pantalla te dice si cumplís.'],
  ['Duelos y torneos', '¿Qué es «Estoy listo»?', 'Es la confirmación de que estás en tu pantalla de torneo para jugar el partido. Si no la apretás dentro del tiempo que da el torneo, perdés el partido.'],
  ['Medallas', '¿Qué es una medalla secreta?', 'Una cuyo requisito no se muestra hasta que la conseguís. En la vitrina aparece cuántas te quedan por descubrir.'],
  ['Medallas', '¿Por qué una medalla tiene un contador?', 'Es una medalla apilable: se puede ganar varias veces, como un título de campeón en cada torneo ganado.'],
  ['Técnico', '¿Funciona en el celular?', 'La página se adapta a pantallas chicas, pero está pensada para escribir con un teclado físico. Para jugar en serio, usá una computadora.'],
  ['Técnico', '¿Puedo pegar un texto o usar un programa que escriba por mí?', 'No. El campo no acepta pegar y está prohibido usar macros, bots o automatizaciones. Las carreras sospechosas pueden anularse; mirá las <a href="/normas" data-page="normas">Normas de la comunidad</a>.'],
  ['Técnico', '¿Cómo reporto un error o a alguien que hace trampa?', `Escribinos por ${contact}. Si es un error técnico, contá qué hiciste, el navegador que usás y, si podés, una captura.`],
];

function guiasPage() {
  const cats = [...new Set(faq.map((f) => f[0]))];
  const toc = [...guides.map((g) => [g[0], g[1]]), ['faq', 'Preguntas frecuentes']];
  return `
  ${hero({
    eyebrow: 'Guías y preguntas frecuentes',
    title: 'Aprendé a sacarle el jugo.',
    lead: 'Desde cómo apoyar los dedos hasta cómo funciona una llave de torneo. Si no encontrás lo que buscás, abajo hay preguntas frecuentes con buscador.',
    side: legalArt.guides(),
  })}
  <div class="doc">
    <nav class="toc" aria-label="En esta página"><p class="sq">En esta página</p>${toc.map(([id, t]) => `<a href="#${id}" data-anchor="${id}">${t}</a>`).join('')}</nav>
    <div class="doc-body">
      ${guides.map(([id, title, body, fig], i) => `
      <article class="guide" id="${id}">
        <p class="eyebrow">Guía ${String(i + 1).padStart(2, '0')}</p>
        <h2>${title}</h2>
        <div class="guide-grid"><div class="prose">${body()}</div><div class="guide-fig" aria-hidden="true">${fig()}</div></div>
      </article>`).join('')}
      <section class="faq" id="faq">
        <p class="eyebrow">Preguntas frecuentes</p>
        <h2>¿Algo para aclarar?</h2>
        <div class="faq-tools">
          <input id="faq-q" type="search" placeholder="Buscar en las preguntas" autocomplete="off" aria-label="Buscar en las preguntas frecuentes">
          <div class="seg" id="faq-cats"><button class="on" data-c="">Todas</button>${cats.map((c) => `<button data-c="${c}">${c}</button>`).join('')}</div>
        </div>
        <div id="faq-list">${faq.map(([c, q, a]) => `
          <details class="qa" data-c="${c}"><summary><span>${q}</span></summary><div class="qa-a"><p>${a}</p></div></details>`).join('')}</div>
        <p class="faq-none" id="faq-none" hidden>No hay preguntas que coincidan.</p>
        <aside class="callout cta"><div><b>¿No está tu duda?</b><span>Escribinos por ${contact} y la sumamos.</span></div></aside>
      </section>
    </div>
  </div>`;
}

// ---------- Textos legales ----------
const legal = {
  terminos: {
    eyebrow: 'Legal',
    title: 'Términos y condiciones',
    lead: 'Las reglas básicas para usar neanbit type. Están escritas para que se entiendan: leelas antes de crear una cuenta.',
    art: () => legalArt.terms(),
    sections: [
      ['Quién ofrece el servicio', `<p>neanbit type («el servicio») es un proyecto personal de neanbit, disponible en type.neanbit.com. Estos términos regulan el uso del sitio, de las cuentas y de las funciones asociadas (carreras, duelos, torneos, perfiles y rankings).</p>`],
      ['Aceptación y edad mínima', `<p>Al crear una cuenta o usar el servicio aceptás estos términos y la <a href="/privacidad" data-page="privacidad">Política de privacidad</a>. Si no estás de acuerdo, no lo uses.</p>
        <p>Tenés que tener <b>13 años o más</b>. Si sos menor de 18, usá el servicio con conocimiento de tu madre, padre o tutor. Podés practicar sin cuenta, como invitado, con las limitaciones que se explican en las guías.</p>`],
      ['Tu cuenta', `<ul>
        <li>El usuario (3 a 15 letras, números o guion bajo) es único y no se puede cambiar.</li>
        <li>La contraseña debe tener al menos 8 caracteres. Guardala bien y no la compartas: todo lo que se haga con tu cuenta se considera hecho por vos.</li>
        <li>Una persona, una cuenta. No crees cuentas adicionales para alterar rankings, torneos o medallas.</li>
        <li>Si pensás que alguien accedió a tu cuenta, avisanos cuanto antes.</li>
      </ul>`],
      ['Uso aceptable', `<p>Te comprometés a usar el servicio de buena fe. En particular, no está permitido:</p>
        <ul>
          <li>Usar bots, macros, scripts o cualquier automatización para escribir, ni alterar las solicitudes al servidor para enviar resultados falsos.</li>
          <li>Acordar resultados con otra persona en duelos o torneos.</li>
          <li>Intentar vulnerar la seguridad, sobrecargar el servicio, acceder a datos de otras personas o extraer información de forma masiva.</li>
          <li>Suplantar a otra persona o usar nombres, textos o fotos ofensivos, ilegales o que vulneren derechos de terceros.</li>
        </ul>
        <p>El detalle está en las <a href="/normas" data-page="normas">Normas de la comunidad</a>.</p>`],
      ['El contenido que publicás', `<p>Tu nombre para mostrar, título, biografía, foto, país, datos de teclado, usuario de Discord y sitio web son visibles para otras personas. Seguís siendo titular de lo que subís. Nos das una licencia gratuita, no exclusiva y limitada a mostrarlo dentro del servicio mientras tengas cuenta.</p>
        <p>Declarás que tenés derecho a usar la foto y los textos que publiques. Podemos quitar contenido que incumpla estos términos o las normas.</p>`],
      ['Resultados, rankings, medallas y torneos', `<ul>
        <li>Las carreras se validan en el servidor. Podemos <b>anular carreras</b>, reiniciar estadísticas, retirar medallas o descalificar de un torneo cuando haya indicios de trampa o de error técnico.</li>
        <li>Los rankings, las medallas y los títulos son virtuales y no tienen valor económico. Si un torneo ofreciera algo más, se informará en su descripción.</li>
        <li>Las decisiones de organización de un torneo (llave, plazos, descalificaciones, desempates) son definitivas, y se aplican las reglas publicadas en las guías.</li>
      </ul>`],
      ['Propiedad intelectual', `<p>El nombre y el logotipo «neanbit» pertenecen a su titular. El código del servicio está publicado en <a href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a> y se rige por las condiciones que figuren en ese repositorio.</p>
        <p>Los textos de práctica se usan con fines de práctica. Si sos titular de derechos sobre alguno y querés que lo retiremos, escribinos y lo revisamos.</p>`],
      ['Disponibilidad y cambios del servicio', `<p>El servicio se ofrece «tal cual». Puede tener errores, interrupciones o períodos de mantenimiento, y podemos modificar o retirar funciones. Hacemos copias de seguridad periódicas, pero no garantizamos que no se pierdan datos.</p>`],
      ['Responsabilidad', `<p>En la medida que la ley lo permita, neanbit no responde por daños indirectos, pérdida de resultados, interrupciones del servicio ni por el contenido publicado por otras personas. Esto no limita los derechos que la ley no permita limitar.</p>`],
      ['Suspensión y baja', `<p>Podemos suspender o eliminar cuentas que incumplan estos términos o las normas, con o sin aviso previo cuando la gravedad lo justifique. Vos podés pedir la baja de tu cuenta en cualquier momento; mirá cómo en la <a href="/privacidad" data-page="privacidad">Política de privacidad</a>.</p>`],
      ['Cambios en estos términos', `<p>Podemos actualizar estos términos. La fecha de la última versión figura arriba. Si el cambio es importante, lo avisaremos con un anuncio dentro del servicio. Seguir usándolo después del aviso implica aceptar la nueva versión.</p>`],
      ['Ley aplicable', `<p>Estos términos se rigen por las leyes de la República Argentina. Cualquier conflicto se someterá a los tribunales competentes de ese país.</p>`],
      ['Contacto', `<p>Para consultas sobre estos términos, escribinos por ${contact}.</p>`],
    ],
  },

  privacidad: {
    eyebrow: 'Legal',
    title: 'Política de privacidad',
    lead: 'Qué datos guarda neanbit type, para qué los usa, quién puede verlos y cómo podés acceder a ellos, corregirlos o borrarlos.',
    art: () => legalArt.privacy(),
    sections: [
      ['Quién es responsable', `<p>El responsable del tratamiento de los datos es neanbit, titular del proyecto neanbit type (type.neanbit.com). Podés contactarlo por ${contact}.</p>`],
      ['Qué datos guardamos', `<table class="doc-table">
        <thead><tr><th>Dato</th><th>Detalle</th></tr></thead>
        <tbody>
          <tr><td>Cuenta</td><td>Nombre de usuario, nombre para mostrar, fecha de alta y rol. La contraseña se guarda <b>solo como hash</b> (scrypt), nunca en texto.</td></tr>
          <tr><td>Perfil (opcional)</td><td>Foto, título, biografía, país, distribución y tipo de teclado, usuario de Discord, sitio web, color, cabecera y forma de la foto, y las medallas que elegís mostrar.</td></tr>
          <tr><td>Actividad</td><td>Carreras (texto, velocidad, precisión, modo y fecha), errores por tecla y por palabra, eliminaciones en Hardcore, duelos y partidos de torneo con sus resultados, e inscripciones.</td></tr>
          <tr><td>Sesión</td><td>Una cookie que mantiene tu sesión iniciada hasta 30 días. En el servidor se guarda una huella de ese código, no el código.</td></tr>
          <tr><td>Técnicos</td><td>Tu dirección IP y datos del navegador viajan con cada solicitud. Se usan para limitar abusos y proteger el servicio y se mantienen en la memoria del servidor por minutos u horas; <b>no se guardan en la base de datos</b>.</td></tr>
        </tbody></table>
        <p>No pedimos tu correo, teléfono, nombre real ni documentos.</p>`],
      ['Para qué los usamos', `<ul>
        <li>Darte una cuenta y guardar tus carreras, estadísticas, medallas y perfil.</li>
        <li>Armar rankings, duelos y torneos.</li>
        <li>Proteger el servicio: límites de uso, detección de trampas, anulación de resultados.</li>
        <li>Mantener y mejorar el servicio.</li>
      </ul>
      <p>No vendemos tus datos, no mostramos publicidad y no hacemos perfiles comerciales.</p>`],
      ['Qué es público y qué no', `<p><b>Es público</b> (lo ve cualquier persona, tenga o no cuenta): tu usuario, nombre para mostrar, foto, título, biografía, país, datos de teclado, Discord y sitio web si los completás, tus medallas, tus récords, promedios, historial reciente y tu posición en los rankings.</p>
        <p><b>No es público</b>: tu contraseña, tu sesión, tu IP y tus estadísticas detalladas de errores por tecla y palabra. Pensá bien qué escribís en tu perfil: no incluyas datos que no quieras que vea todo el mundo.</p>`],
      ['Con quién se comparten', `<p>No se ceden datos a terceros para fines propios de ellos. Para que el servicio funcione intervienen estos proveedores:</p>
        <ul>
          <li><b>Cloudflare</b>: el tráfico pasa por su red (túnel, protección y caché). Puede registrar métricas técnicas y de seguridad.</li>
          <li><b>Proveedor de servidores</b>: la base de datos y las copias de seguridad están en un servidor ubicado en Alemania (Unión Europea).</li>
          <li><b>Google Fonts</b>: tu navegador descarga las tipografías desde Google, que recibe tu dirección IP al hacerlo.</li>
        </ul>
        <p>También podemos revelar datos si una autoridad competente lo exige de forma legal.</p>`],
      ['Cuánto tiempo los conservamos', `<ul>
        <li>Tus datos se conservan mientras tengas cuenta.</li>
        <li>Si la eliminás, se borran tu perfil, carreras, errores, duelos y torneos asociados. Los resultados de tus rivales se mantienen sin tus datos.</li>
        <li>Las <b>copias de seguridad</b> pueden contener tus datos hasta que se renuevan: las diarias se guardan 14 días, y las que se hacen antes de acciones de mantenimiento hasta 30 días.</li>
        <li>Las sesiones vencen a los 30 días.</li>
      </ul>`],
      ['Seguridad', `<p>Protegemos el servicio con conexión cifrada (HTTPS), contraseñas con hash, cookie de sesión sin acceso desde scripts, límites de intentos, verificación de origen de las solicitudes y cabeceras de seguridad. Ningún sistema es infalible; si detectáramos un incidente que te afecte, te avisaremos.</p>`],
      ['Tus derechos', `<p>Tenés derecho a <b>acceder</b> a tus datos, <b>rectificarlos o actualizarlos</b> y pedir su <b>supresión</b>. Gran parte la hacés vos mismo desde «Editar perfil». Para el resto, o para pedir la baja de tu cuenta, escribinos por ${contact} desde tu cuenta y respondemos dentro de los plazos de la ley (10 días corridos para el acceso; 5 días hábiles para rectificar, actualizar o suprimir).</p>
        <p>La Agencia de Acceso a la Información Pública, como órgano de control de la Ley 25.326 de Protección de los Datos Personales, atiende las denuncias y reclamos de quienes resulten afectados por incumplimientos de esa ley.</p>`],
      ['Menores de edad', `<p>El servicio no está dirigido a menores de 13 años. Si detectamos una cuenta de una persona menor de esa edad, la eliminamos. Si sos madre, padre o tutor y creés que pasó, avisanos.</p>`],
      ['Cambios en esta política', `<p>Podemos actualizar esta política y lo avisaremos dentro del servicio cuando el cambio sea importante. La fecha de la última versión figura arriba.</p>`],
      ['Contacto', `<p>Para cualquier consulta sobre tus datos, escribinos por ${contact}.</p>`],
    ],
  },

  cookies: {
    eyebrow: 'Legal',
    title: 'Cookies y almacenamiento local',
    lead: 'Qué guarda neanbit type en tu navegador y por qué. Resumen: solo lo necesario para que funcione. Sin publicidad ni seguimiento.',
    art: () => legalArt.cookies(),
    sections: [
      ['Qué guardamos en tu navegador', `<table class="doc-table">
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Para qué sirve</th><th>Dura</th></tr></thead>
        <tbody>
          <tr><td><code>nt_session</code></td><td>Cookie</td><td>Mantiene tu sesión iniciada. Es <b>HttpOnly</b> (los scripts no pueden leerla), <b>SameSite=Lax</b> y <b>Secure</b> en HTTPS.</td><td>30 días o hasta que cerrás sesión</td></tr>
          <tr><td><code>nt_theme</code></td><td>Almacenamiento local</td><td>El tema elegido (neanbit, claro o carbón).</td><td>Hasta que lo borres</td></tr>
          <tr><td><code>nt_unit</code></td><td>Almacenamiento local</td><td>La unidad de velocidad (CPM, WPM o ZEN).</td><td>Hasta que lo borres</td></tr>
          <tr><td><code>nt_history</code></td><td>Almacenamiento local</td><td>Tus últimas 50 carreras, para compararte con tu promedio.</td><td>Hasta que lo borres</td></tr>
          <tr><td><code>nt_favs</code></td><td>Almacenamiento local</td><td>Los textos que marcaste como favoritos.</td><td>Hasta que lo borres</td></tr>
          <tr><td><code>nt_news</code></td><td>Almacenamiento local</td><td>El último anuncio que viste, para no repetirlo.</td><td>Hasta que lo borres</td></tr>
        </tbody></table>`],
      ['Sin publicidad ni seguimiento', `<p>neanbit type no usa cookies publicitarias ni de seguimiento propias, ni comparte datos con redes de anuncios.</p>
        <p>Las cookies y el almacenamiento anteriores son <b>necesarios o de preferencia</b>: sin ellos no podrías mantener la sesión ni recordar tus ajustes. Por eso no mostramos un aviso para aceptarlas.</p>`],
      ['Servicios de terceros', `<p>Cloudflare, que intermedia el tráfico, puede usar mecanismos técnicos propios (por ejemplo, para distinguir tráfico automatizado). Google Fonts entrega las tipografías y recibe tu dirección IP al hacerlo. Más datos en la <a href="/privacidad" data-page="privacidad">Política de privacidad</a>.</p>`],
      ['Cómo borrarlos', `<ul>
        <li><b>Cerrar sesión</b> elimina la cookie de sesión.</li>
        <li>Desde la configuración de tu navegador podés borrar las cookies y los datos del sitio type.neanbit.com. Se pierden tus ajustes y tus últimas carreras locales; lo guardado en tu cuenta no se toca.</li>
      </ul>`],
    ],
  },

  normas: {
    eyebrow: 'Comunidad',
    title: 'Normas de la comunidad',
    lead: 'Para que competir valga la pena: juego limpio, buen trato y un lugar donde todos puedan practicar tranquilos.',
    art: () => legalArt.rules(),
    sections: [
      ['Juego limpio', `<ul>
        <li>Escribís vos, con tu teclado. Nada de bots, macros, autoescritores ni extensiones que escriban o corrijan por vos.</li>
        <li>No manipules las solicitudes al servidor ni envíes resultados falsos.</li>
        <li>Una persona, una cuenta. No uses cuentas extra para subir en rankings o ganar medallas.</li>
        <li>En duelos y torneos, nada de pactar resultados ni de abandonar a propósito para perjudicar a otra persona.</li>
      </ul>`],
      ['Buen trato', `<ul>
        <li>Tu nombre, título, biografía y foto tienen que ser aptos para todo público: sin odio, acoso, contenido sexual explícito ni amenazas.</li>
        <li>No suplantes a otras personas ni uses datos personales de terceros.</li>
        <li>No hagas spam ni incluyas enlaces engañosos o maliciosos.</li>
      </ul>`],
      ['Torneos y duelos', `<ul>
        <li>Llegá a tiempo a tu partido y mantené abierta la pantalla del torneo.</li>
        <li>Las decisiones de la organización (llave, plazos, descalificaciones) son definitivas.</li>
        <li>Si tenés un problema técnico durante un partido, escribinos después con los detalles; no se repiten partidos por problemas de conexión del jugador.</li>
      </ul>`],
      ['Seguridad', `<p>Si encontrás una falla de seguridad, no la uses ni la difundas: avisanos por ${contact} y la corregimos. Se agradece y se reconoce.</p>`],
      ['Qué pasa si no se cumplen', `<p>Según la gravedad, podemos: anular carreras, reiniciar estadísticas, retirar medallas, descalificar de un torneo, quitar o cambiar contenido del perfil, o bloquear o eliminar la cuenta. En lo posible, avisamos primero y escuchamos tu versión.</p>`],
      ['Cómo reportar', `<p>Escribinos por ${contact} indicando el usuario involucrado y qué pasó. Cuanta más información, mejor.</p>`],
    ],
  },
};

function legalPage(id) {
  const d = legal[id];
  const secs = d.sections.map(([t, html], i) => ({ id: `s${i + 1}`, t, html }));
  return `
  ${hero({ eyebrow: d.eyebrow, title: d.title, lead: d.lead, side: d.art(), meta: id === 'normas' ? '' : `Última actualización: ${UPDATED}` })}
  <div class="doc">
    <nav class="toc" aria-label="En esta página"><p class="sq">En esta página</p>${secs.map((s, i) => `<a href="#${s.id}" data-anchor="${s.id}"><i>${String(i + 1).padStart(2, '0')}</i>${s.t}</a>`).join('')}</nav>
    <article class="doc-body prose legal">
      ${secs.map((s) => `<section id="${s.id}"><h2>${s.t}</h2>${s.html}</section>`).join('')}
      <nav class="doc-more" aria-label="Más documentos">
        <p class="sq">Otros documentos</p>
        ${['terminos', 'privacidad', 'cookies', 'normas'].filter((k) => k !== id).map((k) => `<a href="${paths[k]}" data-page="${k}">${legal[k].title}</a>`).join('')}
      </nav>
    </article>
  </div>`;
}

// ---------- Enrutado ----------
const defs = {
  info: { title: 'Información', render: infoPage },
  guias: { title: 'Guías y preguntas frecuentes', render: guiasPage },
  terminos: { title: legal.terminos.title, render: () => legalPage('terminos') },
  privacidad: { title: legal.privacidad.title, render: () => legalPage('privacidad') },
  cookies: { title: legal.cookies.title, render: () => legalPage('cookies') },
  normas: { title: legal.normas.title, render: () => legalPage('normas') },
};

const $ = (sel) => document.querySelector(sel);
let ctx = { info: null, show: () => {}, leave: () => {}, guard: () => true, home: () => {}, profile: () => {}, note: () => {} };
let current = null;
let spy = null;

function wire(root) {
  paintArt(root);
  // índice lateral: marca la sección visible
  spy?.disconnect();
  const links = [...root.querySelectorAll('.toc a')];
  if (links.length && 'IntersectionObserver' in window) {
    const marks = new Map(links.map((a) => [a.dataset.anchor, a]));
    spy = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { links.forEach((a) => a.classList.remove('on')); marks.get(e.target.id)?.classList.add('on'); }
    }, { rootMargin: '-20% 0px -70% 0px' });
    marks.forEach((_, id) => { const el = document.getElementById(id); if (el) spy.observe(el); });
  }
  const q = root.querySelector('#faq-q');
  if (q) {
    const list = [...root.querySelectorAll('.qa')];
    const apply = () => {
      const text = q.value.trim().toLowerCase();
      const cat = root.querySelector('#faq-cats .on')?.dataset.c || '';
      let n = 0;
      for (const d of list) {
        const ok = (!cat || d.dataset.c === cat) && (!text || d.textContent.toLowerCase().includes(text));
        d.hidden = !ok;
        if (ok) n++;
        if (text && ok) d.open = true;
      }
      $('#faq-none').hidden = n > 0;
    };
    q.oninput = apply;
    root.querySelector('#faq-cats').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      root.querySelectorAll('#faq-cats button').forEach((x) => x.classList.toggle('on', x === b));
      apply();
    };
  }
}

function render(id) {
  const body = $('#page-body');
  body.className = 'page';
  body.innerHTML = defs[id].render(ctx);
  wire(body);
  current = id;
}

function scrollToAnchor(anchor) {
  const el = document.getElementById(anchor);
  if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function open(id, { push = true, anchor = '' } = {}) {
  if (!defs[id]) return;
  if (!ctx.guard()) return;
  ctx.leave();
  render(id);
  ctx.show('page');
  if (push && location.pathname !== paths[id]) history.pushState({ page: id }, '', paths[id]);
  document.title = `${defs[id].title} · neanbit type`;
  window.scrollTo(0, 0);
  if (anchor) requestAnimationFrame(() => scrollToAnchor(anchor));
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a, button');
  if (!a || a.target === '_blank') return;
  if (a.dataset.home !== undefined) { e.preventDefault(); ctx.home(); return; }
  if (a.dataset.profile) { e.preventDefault(); ctx.profile(a.dataset.profile); return; }
  const id = a.dataset.page;
  if (id) {
    e.preventDefault();
    const link = a.getAttribute('href') || '';
    open(id, { anchor: a.dataset.anchor || (link.includes('#') ? link.split('#')[1] : '') });
    return;
  }
  if (a.tagName === 'A' && a.dataset.anchor && !$('#page').hidden) { e.preventDefault(); scrollToAnchor(a.dataset.anchor); }
});

window.addEventListener('popstate', () => {
  const id = idOf(location.pathname);
  if (id) { if (id !== current || $('#page').hidden) open(id, { push: false }); }
  else if (!$('#page').hidden) ctx.home();
});

export const pages = {
  init(options) {
    ctx = { ...ctx, ...options };
    $('#nav-info').onclick = () => open('info');
    $('#nav-guides').onclick = () => open('guias');
    $('#foot-year').textContent = new Date().getFullYear();
  },
  // Si la dirección es una página, la muestra. Se llama una vez, al final de la carga.
  boot() {
    const id = idOf(location.pathname);
    if (id) open(id, { push: false });
  },
  setInfo(info) {
    ctx.info = info;
    if (current === 'info' && !$('#page').hidden) render('info');
  },
  title: 'neanbit type',
};
