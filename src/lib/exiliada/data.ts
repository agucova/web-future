import type { Place, WordDefinition, PlaceTiming } from './types';

export const places: Record<string, Place> = {
  "los-lagos": {
    name: "Los Lagos (Región)",
    coords: [-41.47, -72.94],
    fragment: "Un ojo",
    verse: "Un ojo dejé en Los Lagos / por un descuido casual",
    description:
      "La <a href=\"https://es.wikipedia.org/wiki/Región_de_Los_Lagos\" target=\"_blank\" rel=\"noopener noreferrer\">región de los lagos</a> del sur de Chile: un paisaje de aguas color esmeralda entre volcanes nevados, donde bosques milenarios de alerce bajan hasta las costas brumosas de <a href=\"https://es.wikipedia.org/wiki/Chiloé\" target=\"_blank\" rel=\"noopener noreferrer\">Chiloé</a>. En los años 50 y 60, Violeta Parra viajó por estos territorios recopilando canciones, dichos y tradiciones de comunidades rurales que aún guardaban la memoria del mundo antiguo. Dejar un ojo aquí es dejar parte de la propia mirada en una tierra donde el recuerdo vive en el agua y en la madera.",
  },
  parral: {
    name: "Parral",
    coords: [-36.14, -71.83],
    fragment: "El otro ojo",
    verse: "El otro quedó en Parral / en un boliche de tragos",
    description:
      "<a href=\"https://es.wikipedia.org/wiki/Parral_(Chile)\" target=\"_blank\" rel=\"noopener noreferrer\">Parral</a>, cuna de <a href=\"https://es.wikipedia.org/wiki/Pablo_Neruda\" target=\"_blank\" rel=\"noopener noreferrer\">Pablo Neruda</a> en el corazón vinícola de Chile. El «boliche» del verso — esas cantinas modestas donde se juntaban viajeros, trabajadores y artistas de paso — evoca la infancia precaria de Violeta: ella y sus hermanos cantaban en bares y fondas desde niños, ganando monedas para comer. En este pueblo del Valle Central donde las viñas trepan hacia los Andes, poesía y pobreza siempre compartieron mesa.",
  },
  buin: {
    name: "Buín",
    coords: [-33.73, -70.74],
    fragment: "Brazo derecho",
    verse: "Mi brazo derecho en Buín / quedó señores oyentes",
    description:
      "<a href=\"https://es.wikipedia.org/wiki/Buín_(Chile)\" target=\"_blank\" rel=\"noopener noreferrer\">Buín</a> se asienta en el valle del Maipo, a 35 kilómetros al sur de Santiago — tierra de viñedos y huertos donde el campo todavía marca el ritmo de la vida. El «señores oyentes» de Violeta es el saludo de la radio: ella grabó programas para Radio Chilena en los años 50, llevando el canto popular a oyentes invisibles repartidos por todo el país. El brazo que queda aquí es el que sostenía el micrófono, el que alcanzaba a quienes nunca vería en persona.",
  },
  "san-vicente": {
    name: "San Vicente de Tagua Tagua",
    coords: [-34.44, -71.08],
    fragment: "Brazo izquierdo",
    verse: "El otro por San Vicente / quedó no sé con qué fin",
    description:
      "<a href=\"https://es.wikipedia.org/wiki/San_Vicente_de_Tagua_Tagua\" target=\"_blank\" rel=\"noopener noreferrer\">San Vicente de Tagua Tagua</a> — «tagua» es el nombre de la gallareta, un ave acuática que habitaba el antiguo lago — se levanta sobre el lecho de un <a href=\"https://es.wikipedia.org/wiki/Sitio_arqueológico_Tagua_Tagua\" target=\"_blank\" rel=\"noopener noreferrer\">lago prehistórico</a> donde mastodontes vagaron hace más de 12.000 años. Hoy es un pueblo agrícola tranquilo, rodeado de huertos de duraznos y ciruelas. El verso dice que su brazo quedó aquí «no sé con qué fin» — como esos huesos antiguos enterrados en el barro, cuyo propósito ya nadie recuerda, pero que siguen ahí, esperando.",
  },
  curacautin: {
    name: "Curacautín",
    coords: [-38.43, -71.89],
    fragment: "Pecho",
    verse: "Mi pecho en Curacautín / lo veo en un jardincillo",
    description:
      "<a href=\"https://es.wikipedia.org/wiki/Curacautín\" target=\"_blank\" rel=\"noopener noreferrer\">Curacautín</a> — «piedra cortada» en mapudungun — está en el corazón del territorio mapuche, rodeado de bosques de <a href=\"https://es.wikipedia.org/wiki/Araucaria_araucana\" target=\"_blank\" rel=\"noopener noreferrer\">araucarias</a> y volcanes humeantes. El pueblo nació como fuerte militar en 1882, durante la <a href=\"https://es.wikipedia.org/wiki/Ocupación_de_la_Araucanía\" target=\"_blank\" rel=\"noopener noreferrer\">ocupación chilena de las tierras indígenas</a>. Fue por estas tierras del sur donde Violeta viajó en los años 50 recopilando cantos tradicionales mapuche — los <em>ülkantun</em> — que transformarían su música para siempre. El pecho que deja aquí, en un jardincillo cualquiera, guarda el aliento de esas canciones.",
  },
  maitencillo: {
    name: "Maitencillo",
    coords: [-32.65, -71.44],
    fragment: "Manos",
    verse: "Mis manos, en Maitencillo / saludan en Pelequén",
    description:
      "Un <a href=\"https://es.wikipedia.org/wiki/Maitencillo\" target=\"_blank\" rel=\"noopener noreferrer\">pueblo costero</a> azotado por el viento en el litoral central de Chile, donde el Pacífico frío golpea contra rocas y arena rubia. Desde estas orillas se puede alzar la mano hacia el interior y pensar en los valles lejanos — como Pelequén, a horas de distancia. En el verso de Violeta, las manos hacen exactamente eso: saludan desde la costa hacia un lugar que no pueden tocar. Es la imagen perfecta del exilio: estar al borde del mar, despidiéndose de un hogar imposible de alcanzar.",
  },
  pelequen: {
    name: "Pelequén",
    coords: [-34.47, -70.92],
    fragment: "Manos (saludan)",
    verse: "Mis manos, en Maitencillo / saludan en Pelequén",
    description:
      "Un <a href=\"https://es.wikipedia.org/wiki/Pelequén\" target=\"_blank\" rel=\"noopener noreferrer\">nudo ferroviario</a> en el Valle Central donde la línea norte-sur se ramificaba hacia los lagos del interior. La estación de Pelequén, inaugurada en 1862, era el tipo de lugar que los Parra conocían de memoria: la familia pasó años viajando en tren de pueblo en pueblo, cantando para sobrevivir. Los andenes de Chile fueron la infancia de Violeta — lugares de espera, de llegadas inciertas, de manos que se agitan cuando el tren arranca.",
  },
  perquilauquen: {
    name: "Perquilauquén",
    coords: [-35.83, -71.82],
    fragment: "Blusa",
    verse: "Mi blusa en Perquilauquén / recoge unos pececillos",
    description:
      "Un <a href=\"https://es.wikipedia.org/wiki/Río_Perquilauquén\" target=\"_blank\" rel=\"noopener noreferrer\">río</a> que serpentea por los campos de Ñuble, cerca de donde Violeta pasó su infancia. Su nombre en mapudungun junta «perguin» (plumaje) y «lauquen» (lago grande) — aguas con plumas, aguas donde las aves se posan. En el verso, una blusa flota sola por la corriente atrapando pececillos. Las mujeres del campo lavaban la ropa en el río; la imagen de Violeta es la de una prenda que sigue cumpliendo su tarea doméstica aunque su dueña ya no esté.",
  },
  "san-rosendo": {
    name: "San Rosendo",
    coords: [-37.26, -72.72],
    fragment: "Un pie",
    verse: "Se me enredó en San Rosendo / un pie al cruzar una esquina",
    description:
      "<a href=\"https://es.wikipedia.org/wiki/San_Rosendo_(Chile)\" target=\"_blank\" rel=\"noopener noreferrer\">San Rosendo</a> fue la gran estación de trenes del sur de Chile — el punto donde todos los viajes hacia el sur hacían transbordo. En su apogeo, decenas de trenes cruzaban diariamente este <a href=\"https://es.wikipedia.org/wiki/Estación_San_Rosendo\" target=\"_blank\" rel=\"noopener noreferrer\">nudo ferroviario</a>; hoy la antigua estación sigue en pie, gastada, junto a un reemplazo moderno que casi nadie usa. Tropezar aquí, con el pie atrapado en una esquina, es quedarse atrapada en un lugar construido para el movimiento pero donde el movimiento se detuvo.",
  },
  quiriquina: {
    name: "Isla Quiriquina",
    coords: [-36.63, -73.06],
    fragment: "El otro pie",
    verse: "El otro en la Quiriquina / se me hunde mares adentro",
    description:
      "La <a href=\"https://es.wikipedia.org/wiki/Isla_Quiriquina\" target=\"_blank\" rel=\"noopener noreferrer\">Isla Quiriquina</a> guarda la entrada a la Bahía de Concepción, frente a <a href=\"https://es.wikipedia.org/wiki/Talcahuano\" target=\"_blank\" rel=\"noopener noreferrer\">Talcahuano</a>. Su nombre en mapudungun evoca bandadas de zorzales — <em>kirke</em> (zorzal), <em>kina</em> (muchos) — aunque hoy es territorio naval donde la Armada entrena marineros desde principios del siglo XX. En el poema, es el único fragmento de Violeta entregado al océano: un pie que se hunde «mares adentro», tragado por el Pacífico. Años después del poema, tras el golpe de 1973, la isla serviría como centro de detención — otro tipo de hundimiento, otra forma de desaparecer.",
  },
  temuco: {
    name: "Temuco",
    coords: [-38.74, -72.6],
    fragment: "Corazón",
    verse: "Mi corazón descontento / latió con pena en Temuco",
    description:
      "Capital de la <a href=\"https://es.wikipedia.org/wiki/Región_de_la_Araucanía\" target=\"_blank\" rel=\"noopener noreferrer\">Araucanía</a> y corazón del territorio mapuche ancestral. <a href=\"https://es.wikipedia.org/wiki/Temuco\" target=\"_blank\" rel=\"noopener noreferrer\">Temuco</a> fue fundada como fuerte militar en 1881, durante la violenta <a href=\"https://es.wikipedia.org/wiki/Ocupación_de_la_Araucanía\" target=\"_blank\" rel=\"noopener noreferrer\">ocupación chilena de las tierras indígenas</a>. El nombre viene del mapudungun: «agua de temu», por los arrayanes rojos que crecen junto a las vertientes. Violeta creció a 30 kilómetros de aquí, en Lautaro, y volvió muchas veces al sur a recopilar cantos mapuche. Cuando su corazón late «con pena» en Temuco, reconoce siglos de despojo — un duelo que aprendió escuchando a quienes todavía lo recordaban.",
  },
  calbuco: {
    name: "Calbuco",
    coords: [-41.77, -73.13],
    fragment: "Corazón (llora)",
    verse: "Y me ha llorado en Calbuco / de frío por una escarcha",
    description:
      "<a href=\"https://es.wikipedia.org/wiki/Calbuco\" target=\"_blank\" rel=\"noopener noreferrer\">Calbuco</a> — «agua azul» en mapudungun — es el punto más al sur que nombra el poema. Un antiguo pueblo pesquero en el borde de un archipiélago frío, donde casas de colores e iglesias de madera miran hacia los canales grises del Pacífico. Aquí, en el umbral de Chiloé, la escarcha muerde más fuerte y la lluvia casi nunca para. El corazón que llegó latiendo con pena en Temuco ahora llora de frío — el sur profundo le cobra el precio a quien se aventura tan lejos.",
  },
  chacabuco: {
    name: "Cuesta de Chacabuco",
    coords: [-32.97, -70.71],
    fragment: "Marcha",
    verse: "Voy, enderezo mi marcha / a la cuesta de Chacabuco",
    description:
      "Un paso de montaña azotado por el viento al norte de Santiago, donde los Andes empiezan a bajar. En febrero de 1817, <a href=\"https://es.wikipedia.org/wiki/Bernardo_O%27Higgins\" target=\"_blank\" rel=\"noopener noreferrer\">O'Higgins</a> y <a href=\"https://es.wikipedia.org/wiki/José_de_San_Martín\" target=\"_blank\" rel=\"noopener noreferrer\">San Martín</a> derrotaron aquí a los realistas españoles en la <a href=\"https://es.wikipedia.org/wiki/Batalla_de_Chacabuco\" target=\"_blank\" rel=\"noopener noreferrer\">batalla</a> que selló la independencia de Chile. El nombre quedó grabado en la historia oficial como símbolo de victoria y comienzo. Violeta endereza su marcha hacia este lugar de triunfos ajenos — pero llega fragmentada, volviendo del sur, sin saber si el centro del país la reconocerá.",
  },
  graneros: {
    name: "Graneros",
    coords: [-34.07, -70.73],
    fragment: "Nervios",
    verse: "Mis nervios dejo en Graneros",
    description:
      "<a href=\"https://es.wikipedia.org/wiki/Graneros_(Chile)\" target=\"_blank\" rel=\"noopener noreferrer\">Graneros</a> — literalmente, «los graneros» — donde Chile guarda la cosecha del Valle Central. Campos de trigo y viñedos rodean esta comuna agrícola al sur de Santiago. Aquí Violeta deja sus nervios: la parte del cuerpo que siente antes de que el cerebro entienda, los cables expuestos que conectan la piel con el mundo. Dejarlos en un lugar hecho para almacenar alimento es quizás encontrar, por fin, dónde guardar lo que ya no se puede seguir cargando.",
  },
  "san-sebastian": {
    name: "San Sebastián (Yumbel)",
    coords: [-37.08, -72.57],
    fragment: "Sangre",
    verse: "La sangre en San Sebastián",
    description:
      "<a href=\"https://es.wikipedia.org/wiki/Yumbel\" target=\"_blank\" rel=\"noopener noreferrer\">Yumbel</a>, históricamente llamado San Sebastián de Yumbel, es el sitio de peregrinación más importante del sur de Chile. Cada 20 de enero, miles de personas caminan hasta su santuario para venerar una imagen de madera de cedro del <a href=\"https://es.wikipedia.org/wiki/San_Sebastián_de_Yumbel\" target=\"_blank\" rel=\"noopener noreferrer\">santo atravesado por flechas</a> — una estatua que fue escondida en campos y contrabandeada a través de guerras durante siglos. Violeta deja su sangre aquí, en el santuario del mártir, en las tierras de Ñuble donde ella creció.",
  },
  chillan: {
    name: "Chillán",
    coords: [-36.61, -72.1],
    fragment: "Calma",
    verse: "Y en la ciudad de Chillán / la calma me bajó a cero",
    description:
      "<a href=\"https://es.wikipedia.org/wiki/Chillán\" target=\"_blank\" rel=\"noopener noreferrer\">Chillán</a>, capital de Ñuble, fue la ciudad donde Violeta pasó su infancia, aprendió a tocar guitarra y empezó a componer. En enero de 1939, un <a href=\"https://es.wikipedia.org/wiki/Terremoto_de_Chillán_de_1939\" target=\"_blank\" rel=\"noopener noreferrer\">terremoto a medianoche</a> destruyó casi toda la ciudad y mató a cerca de 30.000 personas — Violeta tenía 21 años. Que su calma «baje a cero» aquí es la traición más honda: ni siquiera el lugar que la formó puede darle refugio. La tierra misma se abrió bajo sus pies una vez, y el poema sugiere que nunca dejó de temblar.",
  },
  cabrero: {
    name: "Cabrero",
    coords: [-37.04, -72.4],
    fragment: "Riñones",
    verse: "Mi riñonada en Cabrero / destruye una caminata",
    description:
      "<a href=\"https://es.wikipedia.org/wiki/Cabrero_(Chile)\" target=\"_blank\" rel=\"noopener noreferrer\">Cabrero</a>, un pueblo nacido con el ferrocarril a fines del siglo XIX, cuando las vías abrieron el sur de Chile. Campos de trigo se extienden hasta el <a href=\"https://es.wikipedia.org/wiki/Río_Biobío\" target=\"_blank\" rel=\"noopener noreferrer\">río Biobío</a>. Aquí el cuerpo falla a mitad del camino: la riñonada «destruye una caminata». Es la imagen del viajero que ha llegado demasiado lejos y cuyo propio cuerpo empieza a traicionarlo, incapaz de seguir.",
  },
  itata: {
    name: "Valle del Itata",
    coords: [-36.28, -72.54],
    fragment: "Instrumento",
    verse: "Y en una calle de Itata / se me rompió el instrumento",
    description:
      "El <a href=\"https://es.wikipedia.org/wiki/Río_Itata\" target=\"_blank\" rel=\"noopener noreferrer\">Valle del Itata</a> — «abundante pastizal» en mapudungun — guarda los <a href=\"https://es.wikipedia.org/wiki/Valle_del_Itata#Viticultura\" target=\"_blank\" rel=\"noopener noreferrer\">viñedos más antiguos de Chile</a>: cepas de uva País plantadas por misioneros españoles en 1551, que todavía se cultivan sin riego, a la manera antigua. En una calle de este valle, el instrumento de Violeta se rompe. No importa si era la guitarra o su propio cuerpo lo que cedió — ella sigue adelante, como las viejas parras que sobreviven sacando agua de donde parece no haber.",
  },
  nacimiento: {
    name: "Nacimiento",
    coords: [-37.5, -72.67],
    fragment: "Guitarra (va)",
    verse: "Y endilgó pa' Nacimiento / una mañana de plata",
    description:
      "<a href=\"https://es.wikipedia.org/wiki/Nacimiento_(Chile)\" target=\"_blank\" rel=\"noopener noreferrer\">Nacimiento</a> — «Natividad» — está donde el <a href=\"https://es.wikipedia.org/wiki/Río_Vergara\" target=\"_blank\" rel=\"noopener noreferrer\">Vergara</a> encuentra el Biobío, en el borde del antiguo territorio mapuche. El pueblo nació como fuerte español en Nochebuena de 1603. En el verso, la guitarra rota se va sola hacia este lugar de comienzos, «una mañana de plata». Es una imagen casi de cuento: el instrumento abandonado caminando hacia un sitio que lleva el nacimiento en el nombre, como buscando volver a empezar donde ya no puede.",
  },
  rinihue: {
    name: "Lago Riñihue",
    coords: [-39.83, -72.32],
    fragment: "Violeta entera",
    verse: "Desembarcando en Riñihue / se vio la Violeta Parra",
    description:
      "<a href=\"https://es.wikipedia.org/wiki/Lago_Riñihue\" target=\"_blank\" rel=\"noopener noreferrer\">Lago glaciar</a> en Los Ríos, el último de los <a href=\"https://es.wikipedia.org/wiki/Siete_Lagos_(Chile)\" target=\"_blank\" rel=\"noopener noreferrer\">Siete Lagos</a>. Su nombre en mapudungun significa «lugar de coligües» — las cañas de bambú del sur — conectando con el verso donde Violeta llega «sin hojas en el coligüe». En 1960, después del <a href=\"https://es.wikipedia.org/wiki/Terremoto_de_Valdivia_de_1960\" target=\"_blank\" rel=\"noopener noreferrer\">terremoto más grande registrado en la historia</a>, derrumbes bloquearon el desagüe del lago y el agua empezó a subir, amenazando con inundar Valdivia. Cientos de trabajadores cavaron con palas durante semanas para evitar la catástrofe — el <a href=\"https://es.wikipedia.org/wiki/Riñihuazo\" target=\"_blank\" rel=\"noopener noreferrer\">Riñihuazo</a>, lo llamaron. Aquí desembarca Violeta al final: sin guitarra, sin hojas en la caña, despojada de todo menos su nombre. Los chirigües — pájaros humildes del sur — le dan el último concierto.",
  },
  "rinihue-2": {
    name: "Lago Riñihue",
    coords: [-39.83, -72.32],
    fragment: "Violeta entera",
    verse: "Desembarcando en Riñihue / se vio la Violeta Parra",
    description:
      "<a href=\"https://es.wikipedia.org/wiki/Lago_Riñihue\" target=\"_blank\" rel=\"noopener noreferrer\">Lago glaciar</a> en Los Ríos, el último de los <a href=\"https://es.wikipedia.org/wiki/Siete_Lagos_(Chile)\" target=\"_blank\" rel=\"noopener noreferrer\">Siete Lagos</a>. Su nombre en mapudungun significa «lugar de coligües» — las cañas de bambú del sur — conectando con el verso donde Violeta llega «sin hojas en el coligüe». En 1960, después del <a href=\"https://es.wikipedia.org/wiki/Terremoto_de_Valdivia_de_1960\" target=\"_blank\" rel=\"noopener noreferrer\">terremoto más grande registrado en la historia</a>, derrumbes bloquearon el desagüe del lago y el agua empezó a subir, amenazando con inundar Valdivia. Cientos de trabajadores cavaron con palas durante semanas para evitar la catástrofe — el <a href=\"https://es.wikipedia.org/wiki/Riñihuazo\" target=\"_blank\" rel=\"noopener noreferrer\">Riñihuazo</a>, lo llamaron. Aquí desembarca Violeta al final: sin guitarra, sin hojas en la caña, despojada de todo menos su nombre. Los chirigües — pájaros humildes del sur — le dan el último concierto.",
  },
  "rinihue-3": {
    name: "Lago Riñihue",
    coords: [-39.83, -72.32],
    fragment: "Violeta entera",
    verse: "Desembarcando en Riñihue / se vio la Violeta Parra",
    description:
      "<a href=\"https://es.wikipedia.org/wiki/Lago_Riñihue\" target=\"_blank\" rel=\"noopener noreferrer\">Lago glaciar</a> en Los Ríos, el último de los <a href=\"https://es.wikipedia.org/wiki/Siete_Lagos_(Chile)\" target=\"_blank\" rel=\"noopener noreferrer\">Siete Lagos</a>. Su nombre en mapudungun significa «lugar de coligües» — las cañas de bambú del sur — conectando con el verso donde Violeta llega «sin hojas en el coligüe». En 1960, después del <a href=\"https://es.wikipedia.org/wiki/Terremoto_de_Valdivia_de_1960\" target=\"_blank\" rel=\"noopener noreferrer\">terremoto más grande registrado en la historia</a>, derrumbes bloquearon el desagüe del lago y el agua empezó a subir, amenazando con inundar Valdivia. Cientos de trabajadores cavaron con palas durante semanas para evitar la catástrofe — el <a href=\"https://es.wikipedia.org/wiki/Riñihuazo\" target=\"_blank\" rel=\"noopener noreferrer\">Riñihuazo</a>, lo llamaron. Aquí desembarca Violeta al final: sin guitarra, sin hojas en la caña, despojada de todo menos su nombre. Los chirigües — pájaros humildes del sur — le dan el último concierto.",
  },
};

export const wordDefinitions: Record<string, WordDefinition> = {
  alevosias: {
    word: "alevosías",
    origin: "(del latín «a levare»)",
    definition:
      "Traiciones o engaños cometidos con premeditación y cautela. En el contexto del poema, evoca las injusticias y maltratos sufridos durante una infancia de pobreza.",
  },
  boliche: {
    word: "boliche",
    origin: "(del italiano «boccia», bola)",
    definition:
      "En Chile y Argentina, bar o cantina modesta donde se sirven tragos y a veces comida. Lugar de encuentro popular, frecuentado por trabajadores, viajeros y artistas itinerantes.",
  },
  endilgo: {
    word: "endilgó",
    origin: "(Chile, coloquial)",
    definition:
      "Dirigirse o encaminarse hacia un lugar. Del español antiguo «endilgar», enderezar.",
  },
  coligue: {
    word: "coligüe",
    origin: "(Chusquea culeou)",
    definition:
      "Bambú nativo de los bosques templados de Chile y Argentina. Sus cañas huecas se usan en artesanía, construcción rural y como tutores de plantas.",
    image: "/exiliada-del-sur/coligue.jpg",
  },
  chirigues: {
    word: "chirigüe",
    origin: "(Sicalis luteola)",
    definition:
      "Pequeño pájaro cantor de los pastizales sudamericanos. De plumaje amarillo verdoso con estrías pardas, habita desde Colombia hasta Tierra del Fuego.",
    image: "/exiliada-del-sur/chirique.jpg",
  },
  rinonada: {
    word: "riñonada",
    origin: "(coloquial, rural)",
    definition:
      "La zona de los riñones, el lomo. En el habla popular chilena, se usa para referirse a dolor o malestar en esa parte del cuerpo: «me duele la riñonada».",
  },
};

// Place timings in milliseconds - [timestamp, placeKey, stanzaNumber]
export const placeTimings: PlaceTiming[] = [
  // Estrofa 1
  [26900, "los-lagos", 1],
  [32800, "parral", 1],
  // Estrofa 2
  [54000, "buin", 2],
  [58350, "san-vicente", 2],
  [64000, "curacautin", 2],
  [69800, "maitencillo", 2],
  [73000, "pelequen", 2],
  [75850, "perquilauquen", 2],
  // Estrofa 3 (long stanza with many places)
  [91400, "san-rosendo", 3],
  [96700, "quiriquina", 3],
  [105800, "temuco", 3],
  [108700, "calbuco", 3],
  [116300, "chacabuco", 3],
  [118700, "graneros", 3],
  [120750, "san-sebastian", 3],
  [124000, "chillan", 3],
  [129800, "cabrero", 3],
  [135800, "itata", 3],
  [140800, "nacimiento", 3],
  // Estrofa 4 (final stanza, only riñihue)
  [151500, "rinihue", 4],
  [188000, "rinihue-2", 4],
  [199700, "rinihue-3", 4],

];

// Stanza start times (for highlighting stanzas when they begin, not when first place is mentioned)
export const stanzaStartTimes: [number, number][] = [
  [25000, 1], // Estrofa 1 starts at 0:25
  [52500, 2], // Estrofa 2 starts at 0:52.5
  [90000, 3], // Estrofa 3 starts at 1:30
  [149000, 4], // Estrofa 4 starts at 2:28
];

// Info sheet content
export const poemInfo = {
  title: "Sobre este poema",
  imageUrl: "/exiliada-del-sur/violeta-parra.jpg",
  imageAlt: "Violeta Parra",
  paragraphs: [
    `Imagina un cuerpo disperso por todo un país: un ojo en Los Lagos, el otro en Parral, un brazo en Buín, el corazón latiendo con pena en Temuco. «La Exiliada del Sur» es un mapa del desgarro — Violeta Parra recorre la geografía de Chile dejando pedazos de sí misma en cada pueblo y estación de tren que nombra. Violeta nunca fue expulsada de Chile. Su exilio era otro, más íntimo: el de quien nunca termina de pertenecer a la tierra donde nació.`,
    `Violeta escribió este poema entre 1957 y 1958, recién vuelta a Chile después de dos años en Francia. Allá había grabado sus primeros discos, pero también había perdido a su hija Rosita Clara, de apenas dos años. El poema forma parte de sus <em><a href="https://es.wikipedia.org/wiki/Décimas,_autobiografía_en_verso" target="_blank" rel="noopener noreferrer">Décimas: Autobiografía en verso</a></em> — una colección de 67 poemas donde cuenta su vida entera usando la décima, la estrofa clásica de diez versos que los cantores populares chilenos han usado por siglos para contar historias, improvisar en duelos poéticos y preservar la memoria oral.`,
    `La fragmentación del poema refleja una vida que fue nómada desde el principio. La familia Parra vivía en la pobreza, moviéndose entre Lautaro, Chillán y los pueblos del sur. Desde niños, Violeta y sus hermanos sobrevivían cantando en trenes, cantinas y mercados — cualquier lugar donde alguien pagara unas monedas. Años después, ya adulta, pasó más de una década viajando sola por Chile para rescatar canciones que se estaban perdiendo, sin apoyo oficial, durmiendo donde la recibieran. Conocía de memoria los pueblos que nombra en este poema.`,
    `El poema apareció sin título en las <em>Décimas</em>, publicadas después de la muerte de Violeta. En 1971, <a href="https://es.wikipedia.org/wiki/Patricio_Manns" target="_blank" rel="noopener noreferrer">Patricio Manns</a> lo musicalizó y ese mismo año <a href="https://es.wikipedia.org/wiki/Inti-Illimani" target="_blank" rel="noopener noreferrer">Inti-Illimani</a> grabó su propia versión, más fiel al texto original. Fue el compositor Luis Advis quien le dio el nombre que hoy conocemos: «La exiliada del sur». Décadas después, <a href="https://es.wikipedia.org/wiki/Los_Bunkers" target="_blank" rel="noopener noreferrer">Los Bunkers</a> la llevaron al rock en su álbum <em><a href="https://es.wikipedia.org/wiki/La_culpa_(%C3%A1lbum)" target="_blank" rel="noopener noreferrer">La Culpa</a></em> (2003), presentándola a una nueva generación.`,
  ],
};

// Poem stanzas for rendering
export const stanzas = [
  {
    number: 1,
    lines: [
      { text: "Un ojo dejé en ", place: "los-lagos", placeText: "Los Lagos" },
      { text: "por un descuido casual" },
      { text: "El otro quedó en ", place: "parral", placeText: "Parral" },
      { text: "en un ", word: "boliche", wordText: "boliche", suffix: " de tragos" },
      { text: "Recuerdo que mucho estrago" },
      { text: "de niña vio el alma mía" },
      { text: "Miserias y ", word: "alevosias", wordText: "alevosías" },
      { text: "anudan mis pensamientos" },
      { text: "Entre las aguas y el viento" },
      { text: "me pierdo en la lejanía" },
    ],
  },
  {
    number: 2,
    lines: [
      { text: "Mi brazo derecho en ", place: "buin", placeText: "Buín" },
      { text: "quedó señores oyentes" },
      { text: "El otro por ", place: "san-vicente", placeText: "San Vicente" },
      { text: "quedó no sé con qué fin" },
      { text: "Mi pecho en ", place: "curacautin", placeText: "Curacautín" },
      { text: "lo veo en un jardincillo" },
      { text: "Mis manos, en ", place: "maitencillo", placeText: "Maitencillo" },
      { text: "saludan en ", place: "pelequen", placeText: "Pelequén" },
      { text: "Mi blusa en ", place: "perquilauquen", placeText: "Perquilauquén" },
      { text: "recoge unos pececillos" },
    ],
  },
  {
    number: 3,
    lines: [
      { text: "Se me enredó en ", place: "san-rosendo", placeText: "San Rosendo" },
      { text: "un pie al cruzar una esquina" },
      { text: "El otro en la ", place: "quiriquina", placeText: "Quiriquina" },
      { text: "se me hunde mares adentro" },
      { text: "Mi corazón descontento" },
      { text: "latió con pena en ", place: "temuco", placeText: "Temuco" },
      { text: "Y me ha llorado en ", place: "calbuco", placeText: "Calbuco" },
      { text: "de frío por una escarcha" },
      { text: "Voy, enderezo mi marcha" },
      { text: "a la cuesta de ", place: "chacabuco", placeText: "Chacabuco" },
      { text: "Mis nervios dejo en ", place: "graneros", placeText: "Graneros" },
      { text: "la sangre en ", place: "san-sebastian", placeText: "San Sebastián" },
      { text: "Y en la ciudad de ", place: "chillan", placeText: "Chillán" },
      { text: "la calma me bajó a cero" },
      { text: "Mi ", word: "rinonada", wordText: "riñonada", suffix: " en ", place2: "cabrero", placeText2: "Cabrero" },
      { text: "destruye una caminata" },
      { text: "Y en una calle de ", place: "itata", placeText: "Itata" },
      { text: "se me rompió el instrumento" },
      { text: "Y ", word: "endilgo", wordText: "endilgó", suffix: " pa' ", place2: "nacimiento", placeText2: "Nacimiento" },
      { text: "una mañana de plata" },
    ],
  },
  {
    number: 4,
    lines: [
      { text: "Desembarcando en ", place: "rinihue", placeText: "Riñihue" },
      { text: "se vio la Violeta Parra" },
      { text: "Sin cuerdas en la guitarra" },
      { text: "sin hojas en el ", word: "coligue", wordText: "coligüe" },
      { text: "Una banda de ", word: "chirigues", wordText: "chirigües" },
      { text: "le vino a dar un concierto" },
      { text: "Desembarcando en ", place: "rinihue-2", placeText: "Riñihue" },
      { text: "se vio a la Violeta Parra" },
      { text: "Desembarcando en ", place: "rinihue-3", placeText: "Riñihue" },
      { text: "se vio a la Violeta Parra" },
    ],
  },
];
