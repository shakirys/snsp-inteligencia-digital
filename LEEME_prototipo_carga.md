# Prototipo de carga de archivos — SNSP Inteligencia Digital

Etapa 1 del plan acordado: prototipo LOCAL (sin persistencia) de carga de
archivos desde la interfaz, con mapeo de columnas libre (sin patrón fijo).

## Actualización 5 — mapeo rápido, relacionar Casos + Población (Tasa) y PDF adaptable (esta entrega)

Sobre la Actualización 4 (abajo), se pidieron 3 mejoras, implementadas y
validadas en orden (Parte 1 → Parte 2 → Parte 3), cada una con las bases
reales `BASE_CASOS_2025_2026.xlsx` (288,106 filas) y
`BASE_POBLACION_2025_2026.xlsx` (396 filas) antes de pasar a la siguiente:

1. **Mapeo rápido** (Parte 1): en "Mapea tus columnas" hay un botón
   "Marcar todas como Ignorar" que pone TODOS los papeles en Ignorar de un
   clic — útil en bases con muchas columnas (BASE_CASOS trae 12) cuando
   sólo hacen falta unas pocas. Después de usarlo, cada columna sigue
   siendo 100% editable individualmente a Dimensión, Medida o Filtro,
   exactamente igual que si se hubiera elegido cada rol a mano.
2. **Relacionar Casos + Población y calcular Tasa** (Parte 2): además del
   archivo principal, ahora se puede subir opcionalmente un archivo de
   Población (mismo paso de resultado, sin pasar por el mapeo de roles: se
   relaciona por 3 columnas detectadas por NOMBRE — Año, Municipio y Grupo
   de edad — en ambos archivos). Con la relación hecha aparece un selector
   "Analizar": Casos, Población o Tasa (Casos ÷ Población × 100,000),
   respetando los filtros y el comparativo 2025 vs 2026 ya existentes.
   **Sin duplicar población**: el archivo de Casos trae varias filas por
   cada combinación de Año+Municipio+Grupo de edad (una por Padecimiento,
   Sexo, Institución, semana…); para cada categoría de la gráfica se junta
   primero el conjunto de combinaciones ÚNICAS que aparecen en las filas ya
   filtradas y sólo con ese conjunto se suma la población — cada
   combinación cuenta una sola vez sin importar cuántas filas de Casos la
   compartan. Verificado con una suma independiente hecha por fuera del
   navegador (openpyxl) contra el municipio de Querétaro capital en 2025:
   Población = 1,215,147 y Casos = 376,128 coinciden EXACTAMENTE con lo que
   muestra la pantalla. Si el archivo de población no trae las 3 columnas
   de relación (o el archivo principal tampoco), se avisa cuáles faltan y
   el selector "Analizar" permanece oculto — nunca se inventa una relación
   a medias.
3. **PDF adaptable** (Parte 3): la exportación a PDF ahora intenta vertical
   primero y cambia automáticamente a horizontal sólo cuando la tabla
   resumen (por sus columnas y el largo real de las categorías, p. ej.
   Padecimiento en modo comparativo) necesita más ancho del que cabe en
   vertical. Se agregó un tope de alto a la imagen de la gráfica (nunca más
   del 55% del alto disponible de la página) para que no deje a la tabla
   sin espacio ni provoque un salto de página innecesario cuando en
   realidad sobraba lugar; si la tabla completa no cabe en lo que resta de
   la página pero sí cabe entera en una nueva, se prefiere saltar de página
   antes de empezarla (evita partirla a la mitad); las filas de la tabla ya
   no se parten entre dos páginas. El tamaño de letra de la tabla (9pt) no
   se reduce en ningún caso — si una columna necesita más espacio del
   estimado, el texto se ajusta con salto de línea dentro de la celda, no
   con letra más chica. Verificado contra un PDF real generado por la app:
   una tabla simple (Tasa por Municipio, 1 año, 3 columnas) queda en
   vertical (612×792pt); Padecimiento como dimensión + comparativo de años
   (6 columnas, nombres largos) cambia automáticamente a horizontal
   (792×612pt) — confirmado leyendo el `/MediaBox` real de cada PDF
   exportado, no sólo la opción pedida al generarlo.

Archivos modificados en esta actualización:
- `pages/carga.html`: botón "Marcar todas como Ignorar" en el paso de
  mapeo; nueva tarjeta "Base de población (opcional)" (input de archivo +
  estado de la relación + selector "Analizar") en el paso de resultado.
- `services/cargaDataService.js`: nuevas funciones puras
  `detectarColumnasClave`, `indexarPoblacion`, `agregarConPoblacion` y
  `agregarComparativoConPoblacion` — ninguna toca `agregar`/
  `agregarComparativo`/`valoresUnicos` existentes.
- `modules/cargaModuleView.js`: listener del botón de mapeo rápido; carga y
  relación del archivo de población (`procesarArchivoPoblacion`,
  `renderMedidaAnalisisSelector`); `_calcularAgregadoClasico`/
  `_calcularAgregadoComparativo` (sustituyen la llamada directa a
  `agregar`/`agregarComparativo` SÓLO cuando hay población relacionada,
  devolviendo la misma forma de datos para no tocar el resto del código ya
  probado); `exportarPDF` reescrito para decidir orientación
  (`_decidirOrientacionPDF`), limitar el alto de la imagen y evitar
  partir la tabla innecesariamente — el contenido de cada línea de texto
  del PDF (incluido "Título de la gráfica") no cambió.
- `scripts/test_carga_jsdom.js`: 3 partes nuevas (Parte 4, 5 y 6) que
  cubren mapeo rápido, la lógica pura de relación Casos+Población (con un
  caso explícito que prueba que la población NO se multiplica por filas de
  Casos repetidas) y la decisión de orientación del PDF.

No se tocó `styles/main.css` (no hizo falta CSS nuevo: todo reutiliza
clases ya existentes). No se tocó ningún otro módulo (CACU, Mama,
Morbilidad, Población, autenticación) ni lo ya construido de ACT05
(buscadores, títulos dinámicos, comparativo de años, Top 10/15/20/Todas,
filtros, gráfica, tabla, usuarios y login).

Verificación de esta actualización:
- `node --check` sin errores en los 2 archivos `.js` modificados.
- Las 6 pruebas de humo jsdom del proyecto pasan sin aserciones fallidas
  (incluidas las Partes 1-6 de `test_carga_jsdom.js`).
- Validación en Chromium real (Playwright) contra las bases reales
  provistas: `BASE_CASOS_2025_2026.xlsx` (288,106 filas) y
  `BASE_POBLACION_2025_2026.xlsx` (396 filas) — mapeo rápido, relación
  Casos+Población con verificación cruzada por fuera del navegador, y las
   2 orientaciones de PDF (vertical/horizontal), sin errores de consola
  del navegador.
- Regresión completa con la base SUIVE real (536,847 filas,
  `playwright_check_v3.js`, sin cambios): buscador de Padecimiento (157
  valores), título dinámico, comparativo 2025 vs 2026, tabla, PDF con el
  título dinámico exacto, filtro de Institución, Top 10/15/20/Todas — todo
  sigue funcionando exactamente igual.

## Actualización 4 — buscador en filtros con muchos valores y título dinámico con Padecimiento

Sobre la Actualización 3 (abajo), se pidieron 2 mejoras puntuales:

1. **Buscador de texto en filtros con muchos valores**: cualquier columna
   marcada como Filtro con más de 20 valores únicos (p. ej. Padecimiento,
   157 valores en SUIVE; Unidad médica, 360) ahora se dibuja con un
   buscador de texto en vez del `<select>` sencillo con todas las opciones
   visibles. Acepta coincidencia parcial en cualquier parte del valor (no
   sólo al inicio) y no distingue acentos ni mayúsculas/minúsculas — por
   ejemplo, escribir "alacran" encuentra "Intoxicación por picadura de
   alacrán(T63.2, X22)". "Todos" siempre queda visible en la lista, con o
   sin texto de búsqueda, para poder quitar el filtro sin borrar antes lo
   escrito. **Reutilizable**: la regla (más de 20 valores únicos → se usa
   el buscador) se aplica automáticamente a cualquier columna que la
   necesite, no es un caso especial de una sola columna — filtros con
   pocos valores (Municipio, Institución, Jurisdicción, Sexo, Grupo de
   edad) siguen usando el `<select>` sencillo, sin cambios. Por dentro, el
   buscador sigue controlando un `<select>` real (oculto) con las mismas
   opciones, así que toda la lógica ya probada de combinar filtros con AND,
   KPI, tabla y exportar a PDF sigue funcionando exactamente igual, sin
   duplicarse.
2. **Título dinámico con Padecimiento**: si la columna "Padecimiento"
   existe y tiene un valor elegido en su filtro (no "Todos"), el título
   corto de la gráfica lo antepone automáticamente, por ejemplo:
   `Intoxicación por picadura de alacrán(T63.2, X22) — Casos por Grupo de
   edad — Comparativo 2025 vs 2026`. Si no hay Padecimiento elegido, el
   título corto funciona exactamente igual que en la Actualización 3 (por
   año, por comparativo, o ninguno si no hay año ni Padecimiento
   elegidos). El mismo texto se agrega también como línea "Título de la
   gráfica" en el PDF exportado.

Archivos modificados en esta actualización: `modules/cargaModuleView.js`
(nuevas `renderBloqueFiltroBuscable`/`inicializarFiltroBuscable` y el
umbral `UMBRAL_FILTRO_BUSCABLE`; nuevas `_normalizarBusqueda`,
`_colPadecimiento`, `_valorPadecimientoActivo` y `_fijarTituloCorto`, que
reemplazan la asignación directa del título corto en el modo clásico y en
el comparativo; nueva línea "Título de la gráfica" en `exportarPDF`),
`styles/main.css` (estilos nuevos del buscador, al final del archivo, sin
tocar ninguna regla existente — incluye un `min-width` en el campo del
buscador: sin él, el campo se encogía junto a los demás filtros de la fila
por usar recorte de texto con "…", un detalle que se detectó y corrigió
durante la propia verificación visual de esta entrega). No se tocó
`pages/carga.html` ni `services/cargaDataService.js` — ninguno de los dos
lo necesitaba. No se tocó ningún otro módulo (CACU, Mama, Morbilidad,
Población, autenticación).

Verificación de esta actualización:
- `node --check` sin errores en `modules/cargaModuleView.js`.
- Las 6 pruebas de humo jsdom del proyecto pasan sin aserciones fallidas,
  incluyendo una Parte 3 nueva en `test_carga_jsdom.js`: un archivo con una
  columna de 22 valores únicos (incluido uno con acento) que activa el
  buscador, la búsqueda parcial sin acentos ("alacran" encuentra el valor
  con acento), la opción "Sin coincidencias" cuando no hay resultados
  reales (sin contar "Todos", que sigue siempre visible), el título
  dinámico en sus 3 variantes (sin año, con 1 año, comparativo) y que el
  PDF incluya la misma línea de título, y que quitar el Padecimiento
  revierta el título exactamente al comportamiento previo.
- Prueba en navegador real (Chromium vía Playwright) con la base SUIVE
  completa (536,847 filas), mapeando Padecimiento (157 valores reales) e
  Institución (5 valores) como Filtro y Grupo de edad como Dimensión:
  - Padecimiento usa el buscador (Institución, con sólo 5 valores, sigue
    usando el `<select>` simple); buscar "alacran" encuentra
    "Intoxicación por picadura de alacrán(T63.2, X22)" en los datos reales
    de SUIVE.
  - Al elegirlo, sin año elegido, el título corto se muestra con el
    Padecimiento antepuesto y sin sufijo de año.
  - Con los 2 años elegidos (modo comparativo), el título se lee
    "Intoxicación por picadura de alacrán(T63.2, X22) — Casos por Grupo de
    edad — Comparativo 2025 vs 2026" y la tabla comparativa (con
    Diferencia/Variación %) sigue funcionando igual.
  - El PDF exportado incluye esa misma línea como "Título de la gráfica".
  - Al quitar el Padecimiento elegido, el título vuelve a ser exactamente
    el mismo que antes de esta entrega ("Casos por Grupo de edad —
    Comparativo 2025 vs 2026").
  - Combinar el buscador de Padecimiento con el filtro simple de
    Institución y el comparativo de años sigue funcionando igual (AND
    entre los tres), y Top 10/20/Todas sigue sin etiquetas encimadas.
  - Sin errores de consola del navegador durante toda la prueba (aparte
    del bloqueo ya conocido, y ajeno a este cambio, de Google Fonts en el
    sandbox de pruebas).
- Se comparó el proyecto completo contra la copia entregada en la
  Actualización 3: sólo difieren los 2 archivos de la lista de arriba.

## Actualización 3 — comparación de años en la misma gráfica y corrección del usuario de login

Sobre la Actualización 2 (abajo), se pidieron 2 ajustes puntuales:

1. **Comparación de años en la misma gráfica**: la columna Filtro detectada
   como Año (`esAnio`, ver Actualización 2, punto 3) ahora se dibuja como
   un selector múltiple de chips ("+ Año") en vez de un `<select>` sencillo.
   - Con **0 o 1 año elegido**, todo funciona exactamente igual que antes
     (modo clásico): si se elige 1 año, se agrega como un filtro más y el
     título de la gráfica indica el año (p. ej. "Casos por Padecimiento —
     2025").
   - Con **2 o más años elegidos**, la gráfica y la tabla entran en modo
     **comparativo**: la gráfica dibuja barras horizontales agrupadas (una
     serie por año, con leyenda, vía `SNSP_renderGroupedBarChart` — ya
     existente en `components/charts.js`, sin tocar ese archivo) y el
     título corto cambia a, por ejemplo, "Casos por Padecimiento —
     Comparativo 2025 vs 2026". La tabla resumen cambia sus columnas a
     `Categoría | Casos 2025 | Casos 2026 | Diferencia | Variación %`
     (Diferencia/Variación % sólo aparecen con exactamente 2 años elegidos;
     Variación % muestra "—" en vez de un valor inválido cuando el año base
     tiene 0 casos).
   - Funciona con **cualquier Dimensión** elegida (Municipio, Jurisdicción,
     Padecimiento, Institución, Unidad médica, Sexo, Grupo de edad, etc.),
     se probó explícitamente con Municipio (18 categorías, etiquetas
     cortas) y Padecimiento (157 categorías, etiquetas muy largas) — en
     ambos casos, Top 10/15/20/Todas se ven sin etiquetas encimadas
     (mismo mecanismo de alto dinámico de la Actualización 2, extendido
     para 2 barras por categoría en vez de 1).
   - Respeta los demás filtros simultáneos ya existentes (p. ej. Año
     comparado + Institución a la vez, combinados con AND) y "Exportar a
     PDF" (la tabla y el texto de filtros del PDF cambian igual que en
     pantalla cuando el modo es comparativo).
2. **Corrección del usuario de login**: el Lic. Osvaldo Bobadilla Mino
   pasó a `status: "inactivo"` en `auth/auth.js` — ya NO aparece en los
   chips de acceso rápido del login (que ya filtraban por
   `status: "activo"`, sin necesidad de tocar `index.html`) y ya no puede
   iniciar sesión. Se agregó un nuevo usuario activo, el Mtro. Luis Iván
   Borja González (administrador). No se modificó ningún otro dato de
   usuario ya correcto (Ing. Soraya Lizbeth Sánchez Torres sigue igual)
   ni la lógica general de autenticación (`login`, `logout`, permisos,
   roles) en `auth/auth.js`.

Archivos modificados en esta actualización: `auth/auth.js` (sólo los datos
de `DEFAULT_USERS`, según lo descrito arriba), `services/cargaDataService.js`
(nueva función `agregarComparativo`, que reutiliza `agregar()` una vez por
año elegido y junta los resultados por categoría), `modules/cargaModuleView.js`
(selector múltiple de chips para la columna Año, modo comparativo de
gráfica/tabla/KPI/PDF, título corto), `pages/carga.html` (id nuevo en el
`<thead>` de la tabla resumen para poder cambiar sus columnas, contenedor
para el título corto), `styles/main.css` (estilos nuevos del selector de
chips, al final del archivo, sin tocar ninguna regla existente). También
se corrigieron las credenciales de login usadas por las 6 pruebas de humo
jsdom del proyecto (`scripts/test_*_jsdom.js`, ver "Verificación" abajo) —
única consecuencia obligatoria de que Osvaldo ya no pueda iniciar sesión;
ningún otro módulo (CACU, Mama, Morbilidad, Población, Dashboard) fue
tocado más allá de esa línea de login en su prueba.

Verificación de esta actualización:
- `node --check` sin errores en los 3 archivos JS modificados
  (`auth/auth.js`, `services/cargaDataService.js`, `modules/cargaModuleView.js`).
- Las 6 pruebas de humo jsdom del proyecto pasan sin aserciones fallidas
  (`test_cacu`, `test_carga`, `test_dashboard`, `test_mama`,
  `test_morbilidad`, `test_poblacion`), incluyendo casos nuevos para el
  multiselector de Año, el modo comparativo (2 años, con Diferencia y
  Variación % verificados con valores exactos), el modo de 1 solo año, y
  que "Exportar a PDF" refleje la tabla comparativa correcta.
- Prueba en navegador real (Chromium vía Playwright) con la base SUIVE
  completa (536,847 filas):
  - Login: Osvaldo Bobadilla Mino NO aparece en los chips de acceso
    rápido y su intento de inicio de sesión es rechazado
    ("Este usuario está desactivado..."); Ing. Soraya Lizbeth Sánchez
    Torres y Mtro. Luis Iván Borja González sí aparecen y ambos pueden
    iniciar sesión correctamente como administrador.
  - "Casos por Municipio": sin años elegidos se comporta igual que antes;
    con 1 año (2025) el título corto indica el año; con 2 años (2025 y
    2026) entra en modo comparativo con barras agrupadas, encabezado
    `# | Municipio | Casos 2025 | Casos 2026 | Diferencia | Variación %`
    y valores de Diferencia/Variación % verificados en pantalla.
  - El comparativo de años combinado con un filtro adicional (Institución)
    sigue funcionando correctamente (AND entre ambos).
  - Top 10/15/20/Todas en modo comparativo, tanto en Municipio como en
    Padecimiento (157 categorías, etiquetas muy largas), sin etiquetas
    encimadas.
  - "Casos por Padecimiento — Comparativo 2025 vs 2026" (ejemplo dado por
    el usuario) reproducido exactamente con ese título.
  - Exportar a PDF en modo comparativo: PDF generado correctamente, con
    "Comparativo de años: 2025 vs 2026" y las columnas Diferencia/
    Variación % en su tabla.
  - Sin errores de consola del navegador durante toda la prueba (aparte
    del bloqueo ya conocido, y ajeno a este cambio, de la fuente de
    Google Fonts en el sandbox de pruebas).
- Se comparó el proyecto completo contra la copia original sin tocar:
  sólo difieren los archivos de la lista de arriba (más los 5 archivos de
  prueba jsdom de otros módulos, sólo en su línea de login).

## Actualización 2 — filtros múltiples independientes y columnas tipo código

Se probó el módulo con la base real `SUIVE_BASE_COMPLETA_SNSP_PAGINA
_2025-2026.xlsx` (536,847 filas, 12 columnas: Año, Entidad, Jurisdicción,
Municipio, Institución, Semana, Mes, Sexo, Grupo de edad, Unidad médica,
Padecimiento, Casos). Con esa base real funcionando ya correctamente la
carga, el mapeo, la validación, Top N y exportar a PDF, se pidieron 5
ajustes puntuales:

1. **Dimensión, Medida y Filtro ahora son roles independientes**: se
   agregó un cuarto papel, **Filtro**, en el paso de mapeo. Antes, si se
   marcaban dos columnas como Dimensión, la SEGUNDA se usaba
   automáticamente como filtro — dependía del orden en que se marcaban
   las columnas. Ahora cada columna se marca explícitamente como
   Dimensión, Medida o Filtro; si se marca más de una candidata a
   Dimensión o a Medida, el paso de resultado muestra un selector
   explícito para elegir cuál usa la gráfica (por defecto, la primera
   marcada).
2. **Varios filtros simultáneos**: cada columna marcada como Filtro
   obtiene su propio selector con "Todos" por defecto. Todos los filtros
   activos se combinan con AND (p. ej. Año=2025 y Institución=01 SSA y
   Padecimiento=X a la vez) y aplican, exactamente igual, a la gráfica,
   la tabla resumen, los KPI y la exportación a PDF.
3. **Columnas tipo "código/categoría" ya no se proponen como Medida por
   defecto**: una columna numérica cuyo nombre coincide con año, semana,
   mes, clave, folio, código o id — o cuyos valores caen todos en un
   rango típico de año (1900-2100) — se marca como "posible código" y se
   preselecciona como Dimensión, no como Medida (sigue siendo elegible
   como Medida manualmente si de verdad hace falta). Se probó con la
   columna real "Año" de SUIVE: antes quedaba propuesta como Medida
   (sumar años no tiene sentido); ahora no. "Semana" recibe el mismo
   tratamiento. Una medida real con pocos valores distintos, como
   "Casos" (enteros 1-127 en el archivo completo), NO se ve afectada —
   sigue proponiéndose correctamente como Medida.
4. **Alto de la gráfica corregido para Top 10/15/20/Todas**: en vez de
   asumir 1 línea por etiqueta, ahora se calcula cuántas líneas ocupará
   realmente la etiqueta más larga entre las categorías visibles (mismo
   ajuste de texto ya existente, `SNSP_wrapLabel`) y el contenedor crece
   según eso. Se verificó con Municipio (18 categorías, etiquetas cortas)
   y con Padecimiento (157 categorías, etiquetas muy largas como
   "Infecciones respiratorias agudas(J00-J06, J20, J21 EXCEPTO J02.0 Y
   J03.0)"): en ambos casos, Top 10/15/20/Todas se ven sin etiquetas
   encimadas.
5. Se conserva sin cambios todo lo demás: validación de tipo de columna,
   informe de calidad, duplicados informativos, "Cambiar mapeo" sin
   releer el archivo, exportar a PDF en el navegador.

Archivos modificados en esta actualización: `services/cargaDataService.js`
(detección de columnas "código", varios filtros en `agregar()`, aviso de
calidad si una columna código se usa como medida), `modules/cargaModuleView.js`
(rol "Filtro", selector de dimensión/medida cuando hay varios candidatos,
filtros múltiples dinámicos, alto de gráfica por líneas reales de
etiqueta), `pages/carga.html` (bloques de configuración y filtros
dinámicos, texto explicativo actualizado), `scripts/test_carga_jsdom.js`
(pruebas ampliadas). No se tocó ningún otro módulo (CACU, Mama,
Morbilidad, Población, autenticación) ni `config/config.js`.

Verificación de esta actualización:
- `node --check` sin errores en los 2 archivos JS modificados.
- Las 6 pruebas de humo jsdom del proyecto pasan sin aserciones fallidas
  (`test_cacu`, `test_carga`, `test_dashboard`, `test_mama`,
  `test_morbilidad`, `test_poblacion`), incluyendo casos nuevos para el
  rol "Filtro", varios filtros simultáneos combinados con AND, el
  selector de dimensión/medida y la detección de columnas "código".
- Prueba en navegador real (Chromium vía Playwright) con la base SUIVE
  completa (536,847 filas): "Casos por Municipio" (18 municipios), filtro
  Año con 2025/2026/Todos funcionando, 3 filtros simultáneos (Año +
  Institución + Padecimiento) acotando correctamente gráfica + tabla +
  KPI + PDF a la misma categoría, columna "Año" NO propuesta como Medida
  (con aviso "posible código" visible en el mapeo), y Top 10/15/20/Todas
  sin etiquetas encimadas tanto en Municipio (etiquetas cortas) como en
  Padecimiento (etiquetas muy largas, 157 categorías).
- Se comparó el proyecto completo contra la copia original sin tocar:
  sólo difieren los 4 archivos de la lista de arriba.

## Actualización 1 — correcciones reportadas en pruebas

Sobre la base de la etapa 1, se corrigieron 7 puntos detectados al probar
el módulo con la base real `CITOLOGIA BASE LIQUIDA 2025.csv`:

1. **Validación de tipo de variable**: la opción "Medida (número a sumar)"
   ahora aparece deshabilitada en el selector de rol para cualquier
   columna detectada como TEXTO (además, `btn-carga-validar` la ignora
   como resguardo aunque se fuerce por otra vía).
2. **Etiquetas de las gráficas**: se desactivó el recorte automático de
   etiquetas del eje de categorías (`autoSkip`) y el contenedor de la
   gráfica ahora crece según la cantidad de categorías mostradas, para
   que **todas** las barras visibles muestren su nombre completo.
3. **Cantidad de categorías**: nuevo selector "Categorías a mostrar" (Top
   10 / Top 15 / Top 20 / Todas) que controla, a la vez, la gráfica y la
   tabla resumen.
4. **Exportar a PDF**: nuevo botón "Exportar a PDF" en el paso de
   resultado. Genera un PDF (jsPDF + jsPDF-AutoTable, cargados por CDN
   igual que Chart.js/XLSX) con nombre de la base, fecha de generación,
   total de registros, filtro aplicado, la gráfica y la tabla resumen
   completa (paginada si hace falta). Todo se genera en el navegador, sin
   enviar nada a ningún servidor.
5. **Cambiar mapeo**: se conservó/confirmó el botón "Cambiar mapeo" (ya
   existía) — regresa al paso 2 sin volver a leer el archivo, conservando
   las columnas y selecciones de rol ya hechas.
6. **Lógica de mapeo**: sin cambios — primera dimensión marcada = categoría
   principal, segunda dimensión marcada = filtro.
7. **Duplicados**: sin cambios — se siguen reportando como informativos en
   el informe de calidad, nunca se eliminan filas automáticamente.

Archivos modificados en esta actualización: `pages/carga.html`,
`modules/cargaModuleView.js`, `scripts/test_carga_jsdom.js` (pruebas
ampliadas). `services/cargaDataService.js` no cambió (la lógica de
duplicados/agregación ya cumplía lo pedido). No se tocó ningún otro
módulo (CACU, Mama, Morbilidad, Población, autenticación).

Verificación de esta actualización: además de las 6 pruebas de humo
jsdom del proyecto (todas siguen pasando), se probó manualmente en un
navegador real (Chromium vía Playwright) cargando la base real
`CITOLOGIA BASE LIQUIDA 2025.csv` (48,247 filas) tanto en `.csv` como
convertida a `.xlsx`: carga, mapeo (Medida deshabilitada al ser ambas
columnas de texto), validación, filtro secundario, selector Top/Todas
(10/15/20/31), que las 31 categorías se dibujan completas en la gráfica,
"Cambiar mapeo" sin recargar el archivo, y exportación a PDF con gráfica
y tabla completas.

## Qué incluye este paquete

Archivos **nuevos** (cópialos a las mismas rutas dentro de tu proyecto):
- `services/cargaDataService.js` — lógica pura: parseo CSV, inferencia de
  tipos de columna, informe de calidad, agregación y valores únicos.
  Sin dependencias externas, sin tocar ningún `window.SNSP_*_DATA` real.
- `modules/cargaModuleView.js` — wiring de UI (subir → mapear → validar →
  previsualizar), protegido por el permiso `cargar_informacion` que ya
  existía en `auth/auth.js`.
- `pages/carga.html` — la página. Agrega SheetJS (`xlsx`) por CDN, igual
  patrón que Chart.js, para poder leer también archivos `.xlsx` además de
  `.csv`.
- `scripts/test_carga_jsdom.js` — prueba de humo jsdom: Parte 1 prueba la
  lógica pura del servicio (parseo con comillas/BOM/delimitador `;`,
  inferencia de tipos, informe de calidad, agregación); Parte 2 simula el
  flujo completo de UI con un archivo real vía `File`/`FileReader` de
  jsdom (sube → mapea → valida → filtra → reinicia). Corre igual que las
  demás pruebas del proyecto: `node scripts/test_carga_jsdom.js` (requiere
  `npm install jsdom --no-save` si no lo tienes ya instalado localmente).

Archivos **modificados** (cambios aditivos, no se tocó ninguna regla ni
función existente):
- `components/sidebar.js` — se agregó una sección "Herramientas" con el
  link a "Cargar datos · prototipo", visible sólo para roles con el
  permiso `cargar_informacion` (Administrador, Supervisor, Capturista).
- `styles/main.css` — se agregaron clases nuevas al final del archivo
  (`.carga-dropzone`, `.carga-informe-list`, `.mb-1`, `.mb-3`); ninguna
  regla existente se modificó.

**No se tocó**: `config/config.js`, ningún módulo real (CACU, Mama,
Morbilidad, Población), ningún `data/real/*.js`, ningún script de Python.

## Verificación realizada

- `node --check` sin errores en los 3 archivos JS nuevos y en
  `sidebar.js` modificado.
- Las 6 pruebas de humo jsdom del proyecto (incluida la nueva) pasan sin
  aserciones fallidas: `test_cacu`, `test_carga` (nueva), `test_dashboard`,
  `test_mama`, `test_morbilidad`, `test_poblacion`.

## Cómo probarlo

```bash
cd snsp   # tu carpeta del proyecto, con estos archivos ya copiados encima
python3 -m http.server 8080
```
Entra con cualquiera de los 2 usuarios demo → en el menú lateral aparece
"Herramientas → Cargar datos · prototipo". Sube un CSV o XLSX, marca qué
columnas son categoría (dimensión) y cuáles son números (medida), valida,
y verás un KPI + una gráfica + una tabla + un filtro reales alimentados
por tu archivo — todo en memoria de la pestaña, se pierde al recargar.

## Recordatorio de alcance (para no generar expectativas de más)

Esto es explícitamente un **prototipo local**: no hay backend, no hay
persistencia entre sesiones, no reemplaza los scripts de Python para los
módulos reales. Es la base para decidir, en la siguiente conversación, si
conectamos Supabase para que la carga sea duradera, o seguimos iterando
la experiencia de mapeo primero.
