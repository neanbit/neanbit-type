const raw = {
  Cotidiano: [
    'Todas las mañanas pongo la pava antes de abrir la ventana. El mate se enfría rápido cuando el viento sopla del sur, así que aprendí a tomarlo despacio y sin apuro.',
    'La feria del barrio abre los sábados temprano. Hay verduras recién cosechadas, pan casero y alguien que siempre vende los mismos discos viejos a un precio que nadie discute.',
    'Perder el colectivo por un minuto cambia el día entero. Caminás distinto, pensás en otras cosas y a veces terminás encontrando una calle que nunca habías mirado.',
    'Cocinar para varios es mejor que cocinar para uno. Se trata de repartir tareas, probar la sal entre todos y dejar que la sobremesa dure más que la comida.',
  ],
  Tecnología: [
    'Un buen programa se parece a una buena conversación: dice lo que tiene que decir, no repite lo obvio y deja claro quién responde cada pregunta.',
    'Antes de optimizar hay que medir. La mayoría de las veces el problema no está donde uno cree, y los números lo muestran en cuanto se les presta atención.',
    'Escribir código legible es una forma de cortesía hacia quien lo va a leer dentro de seis meses, que probablemente seas vos mismo y no recuerdes nada.',
    'Las copias de seguridad no sirven hasta que se prueba restaurarlas. Conviene averiguar cómo funcionan un día tranquilo, no el día en que algo se rompe.',
  ],
  Naturaleza: [
    'En la costa patagónica el viento no es un fenómeno, es una condición. Los árboles crecen torcidos, las casas bajas miran al este y la gente saluda sin sacarse la capucha.',
    'Las mareas suben y bajan dos veces por día, y entre una y otra la playa cambia de forma. Lo que parecía una roca firme queda cubierto, y aparecen pozos llenos de pequeños seres.',
    'Las aves migratorias recorren miles de kilómetros guiadas por el sol, las estrellas y el campo magnético de la Tierra, sin mapas ni instrucciones de nadie.',
    'Después de una tormenta, el desierto florece en pocos días. Las semillas esperaron años enteros bajo la tierra seca, y cuando llega el agua no pierden tiempo.',
  ],
};

export const texts = Object.entries(raw).flatMap(([category, list], c) =>
  list.map((text, i) => ({ id: c * 10 + i + 1, category, text }))
);

export const categories = Object.keys(raw);
