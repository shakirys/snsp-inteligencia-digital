/**
 * config/config.js
 * -----------------------------------------------------------------------
 * CONFIGURACIÓN GLOBAL DE LA PLATAFORMA
 * Este es el ÚNICO lugar donde deben modificarse nombre, lema, logotipos,
 * colores, tipografía, versión y datos institucionales.
 * Ningún módulo, componente o página debe declarar estos valores por su
 * cuenta: todos deben leerlos desde aquí (window.SNSP_CONFIG).
 * -----------------------------------------------------------------------
 */

window.SNSP_CONFIG = {
  platform: {
    name: "SNSP | Inteligencia Digital",
    shortName: "SNSP",
    slogan: "Datos que impulsan decisiones",
    version: "2.4.1",
    environment: "demo", // demo | staging | production
  },

  institution: {
    fullName: "Servicio Nacional de Salud Pública — Querétaro",
    area: "Dirección de Análisis y Estadística",
    supportEmail: "soporte.analisis@snsp-qro.gob.mx",
    supportPhone: "442 000 0000",
    // Equipo del Proyecto — sólo nombre y cargo institucional (sin
    // etiquetas de "desarrollador" ni roles técnicos), para la sección
    // "Acerca del sistema". Independiente de la lista de usuarios del
    // sistema (esa sí crece/cambia vía administración de usuarios).
    equipo: [
      { nombre: "Lic. Osvaldo Bobadilla Mino", cargo: "Líder de Inteligencia e Información" },
      { nombre: "Ing. Soraya Lizbeth Sánchez Torres", cargo: "Enlace de Análisis y Estadística" },
    ],
  },

  branding: {
    logoPrimary: "/assets/logos/logo-snsp-web.png",
    logoSecretariaSalud: "/assets/logos/logo-secretaria-salud-web.png",
    favicon: "/assets/icons/favicon.svg",
    // Los logotipos son oficiales (proporcionados por la institución) y no
    // deben recrearse, redibujarse ni recolorearse. Los archivos "-oficial.png"
    // conservan la resolución original sin tocar; los "-web.png" son sólo un
    // reescalado (sin recorte ni cambio de color) para no servir 4-5 MB en
    // una pantalla de login. Reemplazables sin tocar ninguna pantalla:
    // basta con sustituir el archivo en /assets/logos manteniendo el nombre,
    // o actualizar la ruta aquí.
  },

  // Paleta institucional — única fuente de verdad para todo el sistema.
  // Los mismos valores se replican como variables CSS en styles/tokens.css
  colors: {
    grisOscuro: "#4D4D4D",
    vino: "#611232",
    verdeOscuro: "#002F2A",
    dorado: "#A57F2C",
    rojoClaro: "#9B2247",
    verdeClaro: "#1E5B4F",
    beige: "#E6D194",
    gris: "#98989A",
  },

  typography: {
    display: "'Fraunces', Georgia, serif",
    body: "'Inter', -apple-system, Segoe UI, Roboto, sans-serif",
    mono: "'IBM Plex Mono', monospace",
  },

  // Módulos habilitados. Al agregar dengue, morbilidad, mortalidad,
  // vacunación, salud mental o crónicas, sólo se agrega una entrada aquí
  // y su carpeta correspondiente en /modules — nada más se modifica.
  modules: [
    { id: "cacu", label: "Cáncer cervicouterino", route: "pages/cacu.html", icon: "cacu", enabled: true },
    { id: "mama", label: "Cáncer de mama", route: "pages/mama.html", icon: "mama", enabled: true },
    { id: "dengue", label: "Dengue", route: "pages/dengue.html", icon: "dengue", enabled: false },
    { id: "morbilidad", label: "Morbilidad (Querétaro)", route: "pages/morbilidad.html", icon: "morbilidad", enabled: true },
    { id: "poblacion", label: "Población (Querétaro)", route: "pages/poblacion.html", icon: "poblacion", enabled: true },
    { id: "mortalidad", label: "Mortalidad", route: "pages/mortalidad.html", icon: "mortalidad", enabled: false },
    { id: "vacunacion", label: "Vacunación", route: "pages/vacunacion.html", icon: "vacunacion", enabled: false },
    { id: "salud_mental", label: "Salud mental", route: "pages/salud_mental.html", icon: "salud_mental", enabled: false },
    { id: "cronicas", label: "Enfermedades crónicas", route: "pages/cronicas.html", icon: "cronicas", enabled: false },
  ],

  // Catálogos usados por los filtros globales. En producción vendrán de
  // Supabase; aquí se listan como catálogo estático de arranque.
  catalogs: {
    anios: [2021, 2022, 2023, 2024, 2025],
    periodos: ["Enero-Marzo", "Abril-Junio", "Julio-Septiembre", "Octubre-Diciembre", "Anual"],
    jurisdicciones: [
      "Jurisdicción I - Querétaro",
      "Jurisdicción II - San Juan del Río",
      "Jurisdicción III - Jalpan de Serra",
    ],
    municipios: [
      "Amealco de Bonfil", "Arroyo Seco", "Cadereyta de Montes", "Colón",
      "Corregidora", "El Marqués", "Ezequiel Montes", "Huimilpan",
      "Jalpan de Serra", "Landa de Matamoros", "Pedro Escobedo",
      "Peñamiller", "Pinal de Amoles", "Querétaro", "San Joaquín",
      "San Juan del Río", "Tequisquiapan", "Tolimán",
    ],
    instituciones: ["SESEQ", "IMSS", "IMSS-BIENESTAR", "ISSSTE", "Privado"],
    gruposEdad: ["0-14", "15-24", "25-34", "35-44", "45-54", "55-64", "65+"],
    sexo: ["Mujer", "Hombre", "No especificado"],
    tiposIndicador: ["Incidencia", "Detección oportuna", "Mortalidad", "Cobertura de tamizaje"],
  },

  dataStatusLabel: "Dato pendiente de carga",

  // Historial de versiones — se muestra en pages/acerca.html. Agregar una
  // entrada nueva aquí cada vez que se libere una versión; no requiere
  // tocar ninguna pantalla.
  changelog: [
    {
      version: "2.4.1",
      fecha: "2026-07-23",
      notas: [
        "Corrección de calidad de datos en el módulo Población: la fuente NO trae desglose por grupo de edad para 526 de las 2,192 localidades (típicamente cabeceras municipales y zonas urbanas grandes, ~79.2% de la población estatal) — en esas filas las bandas 0-9/10-19/60+ venían en cero y todo el total aparecía volcado en '20-59', lo que inflaba esa banda a ~90% del estado y hacía ver la pirámide 'rota' (barras casi invisibles en 0-9, 10-19 y 60+).",
        "La pirámide y la distribución por grupo de edad ahora se calculan SÓLO con las localidades que sí traen desglose de edad válido en la fuente (551,422 habitantes, 20.8% del estado); los totales de población/mujeres/hombres de los KPIs siguen incluyendo a las 2,192 localidades completas, porque esos sí son datos completos.",
        "Se agregó una nota visible en el módulo explicando esta limitación de la fuente, un KPI de 'Con desglose de edad' (% y conteo de localidades) y una columna 'Desglose por edad' (Sí / No disponible) en la tabla de localidades.",
      ],
    },
    {
      version: "2.4.0",
      fecha: "2026-07-23",
      notas: [
        "Nuevo módulo Población (Querétaro): padrón poblacional oficial 2025 a nivel localidad (2,192 localidades, 18 municipios), con pirámide poblacional por sexo y grupo de edad (0-9, 10-19, 20-59, 60+), mapa ilustrativo por municipio, ranking de población por municipio y tabla de localidades con buscador y filtro de municipio.",
        "Módulo independiente: el padrón NO se usa todavía como denominador de tasas/incidencia de CACU, Mama o Morbilidad — es una consulta poblacional propia. Queda preparado como candidato para esa etapa posterior (ver README).",
        "Nueva función reutilizable en components/charts.js (SNSP_renderPopulationPyramid) para gráficas de pirámide poblacional, sin modificar ninguna función existente del estándar de visualización.",
        "Archivos nuevos: scripts/build_poblacion.py, data/real/poblacion_2025.js, data/processed/poblacion_2025.json, services/poblacionDataService.js, modules/poblacionModuleView.js, pages/poblacion.html. Ningún archivo, dato, filtro ni módulo existente (CACU, Mama, Morbilidad, dashboard, login) se modificó.",
      ],
    },
    {
      version: "2.3.0",
      fecha: "2026-07-22",
      notas: [
        "Gráficas más grandes en toda la plataforma (Dashboard, CACU, Mama, Morbilidad) y tipo de gráfica más adecuado por caso: barras horizontales para rankings con etiquetas de texto largas (municipios, instituciones, entidades, resultados, padecimientos), dona para jurisdicciones/planes/resultados con pocas categorías, columnas para el comparativo mensual y una nueva gráfica de tendencia anual (línea con marcadores) cuando hay varios años disponibles.",
        "La gráfica de morbilidad por municipio ahora muestra siempre los 18 municipios de Querétaro, de mayor a menor, con 0 para los que no tienen casos en el periodo/filtros seleccionados — nunca se ocultan — más una nota visible indicando cuántos no registran casos.",
        "Las categorías con valor 0 se pintan en gris institucional (#98989A) en vez de omitirse.",
        "Ninguna etiqueta de categoría se trunca ya con '…': el texto largo se reparte automáticamente en varias líneas.",
        "Nueva gráfica horizontal de 'Principales padecimientos' en Morbilidad (además de la tabla existente, que se conserva).",
        "Paleta de gráficas reordenada (mismos 8 colores institucionales, sólo se fijó el orden de uso: vino=serie principal, verde oscuro=segunda serie, dorado=énfasis, gris=ceros/sin registro, beige=notas discretas).",
        "Ningún dato, filtro, total ni módulo existente se modificó — sólo tamaño, tipo de gráfica y legibilidad.",
      ],
    },
    {
      version: "2.2.0",
      fecha: "2026-07-22",
      notas: [
        "Estándar de visualización centralizado en components/charts.js: todas las gráficas (Dashboard, CACU, Mama, Morbilidad) muestran ahora el valor numérico directamente sobre la gráfica (con separador de miles y porcentaje en donas), sin necesidad de pasar el cursor.",
        "Títulos y subtítulos dinámicos sobre cada gráfica, que indican indicador, dimensión, padecimiento/programa, lugar y periodo, y se recalculan automáticamente al cambiar los filtros.",
        "Ningún dato, filtro, total, color institucional ni módulo existente se modificó — sólo la capa de presentación de las gráficas.",
      ],
    },
    {
      version: "2.1.0",
      fecha: "2026-07-22",
      notas: [
        "Nuevo módulo Morbilidad (Querétaro) — prueba funcional: consulta por código CIE-10, Epi-clave o padecimiento, con accesos rápidos a C50, C53, D06 y N87.",
        "Filtros reales de año, municipio, jurisdicción sanitaria, institución, CLUES y mes sobre la base oficial 2024-2026 (367 unidades médicas, 160 padecimientos).",
        "Enriquecimiento de unidad médica por CLUES contra el catálogo de establecimientos de salud, sin duplicar casos.",
        "Módulo exclusivamente estatal (Querétaro): no incluye comparativo nacional ni tasas — se deja preparado para incorporarlos cuando se reciba una base nacional y un padrón poblacional.",
      ],
    },
    {
      version: "2.0.0",
      fecha: "2026-07-20",
      notas: [
        "Identidad institucional renovada: pantalla de inicio, tarjeta de acceso y perfil de usuario.",
        "Administración de usuarios completa (alta, edición, cambio de contraseña, activar/desactivar, eliminación lógica, búsqueda y filtros).",
        "Catálogo de roles ampliado: Administrador, Supervisor, Analista, Capturista, Consulta.",
        "Nuevo módulo de Configuración y sección Acerca del sistema.",
      ],
    },
    {
      version: "0.2.0-datos-reales",
      fecha: "2026-07-20",
      notas: [
        "Módulos CACU y Cáncer de mama conectados a 6 bases oficiales 2025 (nacional).",
        "Nueva capa de transformación de datos y servicio de indicadores reales.",
        "Mapa nacional ilustrativo por entidad federativa.",
      ],
    },
    {
      version: "0.1.0-mvp",
      fecha: "2026-07-19",
      notas: [
        "Primera versión navegable con datos de ejemplo: login, dashboard, módulos CACU y Mama, administración de usuarios (demostrativa).",
      ],
    },
  ],
};
