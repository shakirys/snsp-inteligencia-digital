# Prototipo de carga de archivos — SNSP Inteligencia Digital

Etapa 1 del plan acordado: prototipo LOCAL (sin persistencia) de carga de
archivos desde la interfaz, con mapeo de columnas libre (sin patrón fijo).

## ACT16 — 5 correcciones puntuales sobre ACT15: "Seleccionar todos/todas", Vista previa ampliada con zoom, botones fijos con paginación, gráficas del PDF más grandes y nota de municipios con datos

Correcciones puntuales pedidas por la usuaria sobre ACT15 (sin tocar datos, cálculos ni nada ya validado). Los 5 puntos pedidos:

1. **"Seleccionar todos" / "Seleccionar todas" en Mes/Semana**: nuevo botón al inicio de cada menú de chips (`_renderMultiselectChips`, `modules/morbilidadModuleView.js`) que marca de un click SÓLO las opciones actualmente compatibles con el otro filtro activo (las mismas que ya ofrece el menú tras `_poblarSelectsMesSemana` — nunca reintroduce un mes/semana fuera de esa compatibilidad). Cuando quedan todas las opciones disponibles marcadas (ya sea con el botón o a mano), el área de chips colapsa a mostrar simplemente "Todos" (Mes) o "Todas" (Semana), igual que cuando no hay ninguna marcada — ambos casos son equivalentes para el filtro (`_filtrarPorMesSemana`), y `_textoMesSemanaPeriodo()` también los trata igual para no llenar el periodo con "Ene–Dic" cuando en realidad no hay ninguna restricción real.
2. **Vista previa del PDF ampliada + zoom**: el modal pasa a ocupar ~90% de la pantalla (ancho y alto) sólo durante el paso de Vista previa (clase `is-vista-previa-activa`, agregada/quitada por JS al entrar/salir de ese paso — el paso 1, elegir secciones, sigue con el tamaño normal). Se agregaron controles "－"/"＋" (zoom en pasos de 10%, aplicado como `transform: scale(...)` sobre un contenedor único con todas las páginas) y "Ajustar a ancho" (recalcula el zoom para que la hoja aproveche el ancho disponible del visor).
3. **Botones fijos + navegación de páginas**: dentro de la Vista previa, "Volver a editar" y "Generar PDF" quedan en una franja fija fuera del área con scroll (layout de columna: barra de herramientas arriba, lienzo con scroll al centro, botones abajo — ya no hay que recorrer todo el reporte para llegar a ellos), y se agregó navegación "Anterior | Página X de Y | Siguiente" que hace scroll directo a la página pedida.
4. **Gráficas del PDF más grandes / separación gráfica-tabla**: antes, la imagen de cada gráfica quedaba SIEMPRE con un tope fijo del 38% de la altura de página, sin importar qué tan larga fuera la tabla que la acompañaba — la causa real de que Municipio (18 categorías) se viera chica. Ahora se intenta primero un layout combinado con un tope más grande (62%); si aun así título+imagen+tabla no caben legibles en una página limpia, la gráfica pasa a su propia página con un tope de 90% (grande de verdad) y la tabla continúa en la página siguiente ("... (continuación)"). Este cálculo se hace en un solo lugar nuevo, `_construirPlanReportePDF()`, que arma un plan abstracto de páginas consumido tanto por el PDF real (`_dibujarPlanEnJsPDF`) como por la Vista previa (`_renderPlanVistaPreviaHTML`) — un solo generador para los dos, así nunca pueden desalinearse entre sí (reemplaza los 2 simuladores de paginación independientes que traía ACT15).
5. **Municipios con 0 en ambos años**: se revisó la inconsistencia reportada (13 "categorías encontradas" vs. los 18 municipios mostrados). El servicio compartido `services/cargaDataService.js` YA excluía correctamente de sus resultados cualquier categoría sin ninguna fila que la sustente (no había ningún cálculo equivocado) — el panel de Municipio, por diseño, sigue mostrando los 18 municipios con su 0 para poder comparar entre años (`renderChartMunicipio`, sin cambios en esa parte). Lo que faltaba era comunicar ambas cosas juntas: se agregó `_contarCategoriasConDatos()`, que cuenta directamente sobre la gráfica de Municipio YA dibujada cuántas de las 18 tienen al menos 1 caso en algún periodo mostrado, y esa MISMA cuenta alimenta tanto el subtítulo en pantalla ("N de 18 municipios con casos...") como la nota de esa sección en el PDF/Vista previa — nunca vuelven a poder mostrar números distintos entre sí. Ejemplo real reproducido: filtrar por Institución = "02 IMSS_ORD" deja exactamente 13 de los 18 municipios con casos.

**Validación obligatoria repetida**: sin filtros de Mes/Semana, el total general sigue siendo exactamente **1,270,390 casos**, y la selección T63.2, X22 — Intoxicación por picadura de alacrán sigue dando exactamente **10,252 casos** — reconfirmado con jsdom y con Playwright en navegador real tras los 5 ajustes.

**Conservación de lo ya validado**: no se tocó ningún dato, cálculo ni comportamiento de ACT15 — Población sigue siendo estrictamente anual, la lógica de Año/Mes/Semana no cambió, y el resto del PDF/Vista previa/Panorama de Casos se comporta igual salvo los 5 puntos anteriores. Se conserva `v2.5.0` (sin subir de versión).

Archivos modificados: `modules/morbilidadModuleView.js` (botón "Seleccionar todos/todas" y colapso "Todos"/"Todas" en `_renderMultiselectChips`, `_construirPlanReportePDF`/`_dibujarPlanEnJsPDF`/`_renderPlanVistaPreviaHTML` como generador único de páginas con separación gráfica/tabla, zoom y paginación de la Vista previa, `_contarCategoriasConDatos` y nota de Municipio), `pages/morbilidad.html` (`id="morb-subt-municipio"`, barra de herramientas de zoom/paginación y botones fijos de la Vista previa), `styles/main.css` (estilos del botón "Seleccionar todos/todas", del modal ampliado `is-vista-previa-activa` y de la barra de herramientas), `config/config.js` (historial de cambios), `scripts/test_morbilidad_jsdom.js` (pruebas de los 5 puntos), `playwright_check_morbilidad_act16.js` (nuevo — verificación en navegador real: tamaño ~90% del modal, zoom/ajustar a ancho reales, botones fijos sin scroll, separación real de Municipio en 2 páginas con imagen grande, nota "13 de 18" con Institución=IMSS_ORD, validación obligatoria).

Verificado con la suite completa de pruebas jsdom del proyecto (cero errores en los 6 módulos) y con Playwright en Chromium real (cero errores relevantes de consola; se confirmó que Municipio efectivamente se separa en una página de gráfica grande + una página de continuación con la tabla, cuando la tabla comparativa no cabe junto con una imagen legible).

Entregable de esta entrega: `SNSP_INTELIGENCIA_DIGITAL_ACT16.zip` (se conserva `v2.5.0`, sin subir de versión, tal como se pidió).

## ACT15 — Mes/Semana de selección múltiple, periodo visible, Vista previa visual del PDF y textos de Configuración

Correcciones sobre ACT14, pedidas por la usuaria con el prompt definitivo de ACT15 (BASE_CASOS_2025_2026.xlsx y BASE_POBLACION_2025_2026.xlsx reutilizadas — la BASE_POBLACION_2025.xlsx re-adjuntada en esa ronda traía sólo 198 filas de 2025, subconjunto exacto de las 2025 ya existentes en la base completa de 396 filas con 2025+2026; se conservó la base completa ya validada para no perder la población 2026, ver incidencia reportada a la usuaria). Los 11 puntos pedidos:

1. **Mes y Semana epidemiológica pasan a selección MÚLTIPLE** (chips, igual que Año — uno, varios o todos los meses/semanas), conservando la coherencia Mes↔Semana↔Año de ACT14. Como el servicio compartido `services/cargaDataService.js` (usado también por CACU/Mama/Población/Dashboard/Carga) sólo admite filtros de igualdad de UN valor, la selección múltiple se resuelve pre-filtrando el arreglo de filas ANTES de llamar a `svcCarga.agregar*()` (`_filtrarPorMesSemana()`), sin tocar ese servicio compartido. La Población sigue siendo anual — Mes/Semana filtran sólo Casos, nunca dividen/duplican/desagregan el denominador poblacional.
2. **Periodo seleccionado visible**: subtítulos, tabla, Panorama, Vista previa y PDF muestran el periodo vigente (p. ej. "Comparativo 2025 vs 2026 | Mayo", "Enero–Marzo", "Semanas epidemiológicas 01–04"). Tendencia por año/mes y Comparativo por mes y año sólo dibujan los meses dentro de la selección vigente (`_temporalMesesEnAlcance()`) — un mes excluido a propósito ya no aparece como "Sin información"; esa leyenda queda sólo para cuando el periodo sí está incluido pero de verdad no hay datos.
3. **Etiquetas de las gráficas temporales**: vuelven a NEGRITA (se conserva el tamaño chico de ACT14); en Tendencia por año/mes, 2025 se dibuja arriba del punto y 2026 debajo (`pointLabelSplit`, opción nueva y retrocompatible en `components/charts.js`, no afecta a ningún otro módulo), en pantalla y PDF.
4. **Vista previa VISUAL real del PDF**: reemplaza el resumen de texto de ACT14 por páginas con proporción de hoja carta, mostrando encabezado, periodo/filtros, KPI, gráficas reales (mismo canvas capturado que usa el PDF), tablas reales, Análisis/Observaciones, saltos de página y orientación — reutilizando exactamente las mismas piezas que arma el PDF de verdad (`_construirSeccionesPdfDatos`, `_morbPdfOrientacion`, `_capturarImagenGrafica`), para que nunca puedan desincronizarse. Conserva "Volver a editar" / "Generar PDF".
5. **Distribución/legibilidad del PDF**: se revisó el mecanismo ya construido en ACT14 (orientación por sección según número de categorías/longitud de etiquetas, vertical primero) y se confirmó que ya cumple lo pedido — nunca se reduce una gráfica para forzarla a compartir página con su tabla; si una sección no cabe en lo que resta de la página, pasa entera a una nueva (misma orientación) en vez de comprimirse.
6. **Configuración → Datos institucionales**: "Área: Dirección de Análisis y Estadística" → "Área: Inteligencia e Información" (`config/config.js`, única fuente para `pages/configuracion.html` y `pages/acerca.html`).
7. **Configuración → Catálogos base**: se quitó "(módulos futuros)" de Municipio, Jurisdicción, Institución y Grupo de edad (ya se usan en Morbilidad) — sólo se ajustó el texto de la etiqueta; cantidades y contenido de los catálogos no se tocaron. "Sexo (módulos futuros)" se dejó tal cual, por no estar entre los 4 catálogos explícitamente señalados.
8. **Conservación de lo ya validado**: cálculos de Casos/Población/Tasa, comparación 2025/2026, Top N, Panorama, buscadores sincronizados Padecimiento/CIE-10/Epi-clave, filtros de Municipio/Jurisdicción/Institución, tablas y estructura de datos — sin cambios.
9. **Validación obligatoria**: sin filtros de Mes/Semana, el total general se confirmó en exactamente **1,270,390 casos**, y la selección T63.2, X22 — Intoxicación por picadura de alacrán en exactamente **10,252 casos** — verificado contra las bases originales y dentro de la aplicación corriendo (jsdom + Playwright en navegador real), sin modificar ningún dato para forzar el resultado.
10. **Versionado**: se conserva `v2.5.0`; esta sección documenta ACT15 sin borrar ACT14 ni versiones anteriores.
11. **Alcance**: no se tocó la arquitectura de Cargar datos ni se implementó actualización automática de bases; tampoco Dashboard, login, seguridad, usuarios ni roles.

Archivos modificados: `modules/morbilidadModuleView.js` (chips de Mes/Semana, pre-filtro de filas, textos de periodo, alcance temporal restringido, Vista previa visual, sección compartida `_construirSeccionesPdfDatos`), `pages/morbilidad.html` (markup de chips para Mes/Semana, contenedor de Vista previa ampliado), `components/charts.js` (`pointLabelSplit`, opción retrocompatible), `pages/configuracion.html` (etiquetas de catálogos), `config/config.js` (Área institucional, historial de cambios), `scripts/test_morbilidad_jsdom.js` (pruebas de selección múltiple, periodo visible, Vista previa visual y validación obligatoria de los 2 controles), `playwright_check_morbilidad_act15.js` (nuevo — verificación en navegador real: imágenes reales en Vista previa y en el PDF generado, chips de Mes/Semana, validación obligatoria).

Verificado con la suite completa de pruebas jsdom del proyecto (cero errores en los 6 módulos, 212 aserciones en Morbilidad) y con Playwright en Chromium real (cero errores relevantes de consola, PDF generado con imágenes reales de cada gráfica).

Entregable de esta entrega: `SNSP_INTELIGENCIA_DIGITAL_ACT15.zip` (se conserva `v2.5.0`, sin subir de versión, tal como se pidió).

## ACT14 — Filtros de Mes/Semana epidemiológica, buscadores sincronizados, Vista previa del PDF y menú "Morbilidad"

Sobre ACT13 (y el tercer ajuste de seguimiento a ACT09, abajo), la usuaria adjuntó `BASE_CASOS_2025_2026.xlsx` y `BASE_POBLACION_2025_2026.xlsx` — con esto se desbloquearon los puntos 1 y 2 que habían quedado pendientes por falta de datos en el ajuste anterior. Los 10 puntos pedidos:

1. **Mes y Semana epidemiológica como filtros globales**, extraídos de `BASE_CASOS_2025_2026.xlsx` y relacionados con Año — afectan KPI, gráficas, tablas, Panorama y PDF. La reconstrucción de `data/real/morbilidad_casos_2025_2026.js` y `data/real/morbilidad_temporal_2025_2026.js` (`scripts/build_morbilidad_casos.py`) ahora agrupa también por Mes y Semana (211,032 combinaciones en el bundle principal, antes 20,563 sin esas dos dimensiones); para que el archivo no creciera de forma desproporcionada (~21MB) se usa una codificación de catálogos/índices que decodifica, al cargar, a la MISMA forma `{meta, headers, rows, catalogos, catalogo_padecimientos}` que ya consumía `morbilidadModuleView.js` — nada de la lógica que lee esos datos tuvo que cambiar. La Población sigue siendo anual: no se duplicó ni se desagregó por Mes/Semana (`build_poblacion()` no se tocó). Las opciones de Mes y Semana se acotan entre sí (elegir un Mes limita las semanas ofrecidas a las que de verdad caen en ese mes ese año, y viceversa) usando una tabla de coherencia (`meta.mes_semana`) calculada directamente de los datos crudos — la relación Mes↔Semana no es igual en 2025 que en 2026 (el año no arranca el mismo día de la semana), así que nunca se asumió ni se hardcodeó.
2. **Padecimiento, CIE-10 y Epi-clave separados en 3 buscadores sincronizados**: elegir un resultado en cualquiera de los 3 actualiza los otros 2 y la selección activa ("Consultando…"); "Quitar" limpia los 3 a la vez.
3. **Filtros reordenados**: Analizar | Por | Año | Mes | Semana en la fila superior, Municipio | Jurisdicción | Institución | Aplicar | Limpiar debajo, sin cambiar el tamaño de estos últimos.
4. **Tarjetas KPI ~25-30% más bajas** — nueva clase modificadora `indicator-grid--compact` aplicada sólo en Morbilidad (los demás módulos que comparten `.indicator-card`/`.indicator-grid` no se ven afectados).
5. **Etiquetas de las gráficas temporales** (Tendencia por año/mes y Comparativo por mes y año) más pequeñas y sin negrita, tanto en pantalla como en PDF — se conservan TODOS los valores, y los periodos sin datos se siguen mostrando como "Sin información", nunca como "0".
6. **PDF: orientación por sección.** Antes, si una sola sección (típicamente Municipio, Grupo de edad o Padecimientos) necesitaba horizontal, el documento ENTERO se volvía horizontal. Ahora cada sección decide su propia orientación (jsPDF admite páginas con orientación mixta) y el documento regresa a vertical en cuanto la siguiente sección vuelve a caber. El PDF incluye todos los filtros activos, incluyendo Mes/Semana, en "Filtros aplicados".
7. **"Observaciones" → "Análisis / Observaciones"**, y se agregó un paso de **Vista previa** antes de generar el PDF de verdad: el formulario ya no genera el PDF directamente, sino que muestra un resumen (secciones elegidas, periodo, Analizar/Por, filtros aplicados y el texto de Análisis/Observaciones) con "Volver a editar" (regresa al formulario sin perder lo ya escrito/marcado) o "Generar PDF" (genera con exactamente lo mostrado en el resumen).
8. **Menú global**: "Morbilidad (Querétaro)" → "Morbilidad", con un indicador discreto (punto verde junto a la etiqueta, con `title="Módulo validado"`) que Población todavía no tiene.
9. **Revisión de ambas bases para sugerir (sin implementar) otros filtros/dimensiones** — ver aviso a la usuaria; la principal candidata es Sexo (ya usado en el panel "Casos por sexo" del Panorama, pero no como filtro global que afecte todo el tablero) — con la salvedad de que `BASE_POBLACION_2025_2026.xlsx` no trae Sexo, así que una tasa por sexo necesitaría una fuente de población adicional.
10. **Comparación 2025/2026, Top N, Panorama, tasas y demás funciones ya validadas se conservan sin cambios.** Los totales SIN los nuevos filtros de Mes/Semana coinciden EXACTAMENTE con los de ACT13: el script de construcción de datos colapsa (suma) la nueva agrupación con Mes/Semana y compara contra la agrupación anterior fila por fila, deteniéndose con error si algo no cuadra (no se generó ningún archivo hasta que la verificación pasó); además se comparó contra el JSON de auditoría de la entrega anterior, con cero diferencias en 20,563 filas (bundle principal) y 35,809 filas (bundle temporal), mismo total de Casos (1,270,390) en ambos casos.

Archivos modificados: `scripts/build_morbilidad_casos.py` (reescrito: codificación por catálogos/índices, verificación de colapso Mes/Semana → agrupación anterior, cálculo de `meta.mes_semana`), `modules/morbilidadModuleView.js` (filtros de Mes/Semana con acotamiento mutuo, 3 buscadores sincronizados, Vista previa del PDF, orientación del PDF por sección, "Análisis / Observaciones"), `pages/morbilidad.html` (orden de filtros, selects de Mes/Semana, 3 campos de búsqueda, `indicator-grid--compact`, paso de Vista previa en el modal de PDF), `components/charts.js` (`_snspLabelFont` con peso de fuente configurable), `styles/main.css` (`.indicator-grid--compact`), `components/sidebar.js` (indicador de módulo validado), `config/config.js` (etiqueta del menú, historial de cambios), `scripts/test_morbilidad_jsdom.js` (pruebas nuevas para Mes/Semana, buscadores sincronizados, orientación por sección del PDF y el flujo de Vista previa). No se tocó ningún cálculo, dato ni función ya validada de Casos, Población, Tasa, comparación por años, Top N ni Panorama — ni Dashboard, portada/login, seguridad, usuarios o roles, fuera de alcance explícito de esta entrega.

Verificado con la suite completa de pruebas jsdom del proyecto (cero errores en los 6 módulos, incluyendo 195 aserciones en Morbilidad).

Entregable de esta entrega: `SNSP_INTELIGENCIA_DIGITAL_ACT14.zip` (se conserva `v2.5.0`, sin subir de versión, tal como se pidió).

## Tercer ajuste de seguimiento a ACT09 (mismo día) — Panorama apilado al 100%, PDF con gráficas reales, quitar "demo" del pie

Sobre el segundo ajuste de seguimiento (abajo), se pidieron 5 puntos más; 3 se implementaron (puntos 3, 4 y 5) y 2 quedaron **bloqueados por falta de datos** (puntos 1 y 2 — ver aviso a la usuaria, no documentado aquí como "hecho" porque no se hizo):

1. y 2. **Filtros de Mes y Semana epidemiológica — NO implementados.** La base cruda `BASE_CASOS_2025_2026.xlsx` (única fuente con esas columnas) no está disponible en este entorno: el bundle principal (`morbilidad_casos_2025_2026.js`) nunca las tuvo (se soltaron a propósito al construirlo, ver comentario en `scripts/build_morbilidad_casos.py`) y el bundle temporal sólo trae Mes (no Semana), y sin Grupo de edad ni el texto de Padecimiento — insuficiente para que un filtro de Mes/Semana afecte la gráfica/tabla/KPI principal y los 8 paneles del Panorama de manera completa y consistente, como pidió la usuaria. Se le explicó el bloqueo y se le pidió la base cruda para completarlo en una siguiente entrega. Nada de este punto se tocó en el código: cero riesgo de números inventados o inconsistentes.
3. **Tendencia por año/mes y Comparativo por mes y año, apilados al 100% del ancho** del Panorama de Casos (antes `col-span-6`, uno junto al otro): ahora `col-span-12`, uno debajo del otro — cambio puramente de layout (CSS), ningún valor ni cálculo se tocó.
4. **El PDF ahora incluye la gráfica real de cada sección elegida** (imagen capturada del canvas ya dibujado, mismo patrón ya validado en Cargar datos/ACT06: fondo blanco pintado aparte porque JPEG no soporta transparencia, ancho ajustado al disponible con tope de alto), no sólo su tabla — esto revierte, a petición explícita de este turno, el "No captura de pantalla" del ajuste anterior (eran instrucciones de turnos distintos; se siguió la más reciente). Además, las secciones elegidas ahora se EMPACAN en las mismas páginas en vez de forzar una página nueva por cada una: "Indicadores" (tabla corta sin gráfica) comparte la página 1 con el encabezado/metadatos en vez de abrir su propia página casi vacía; una sección se salta a una página nueva únicamente cuando ya no cabe en lo que resta de la vigente.
5. **"v2.5.0 · demo" → "v2.5.0"** en el pie del sidebar (`components/sidebar.js`) — este SÍ es un cambio global (no sólo Morbilidad, a diferencia del resto de esta entrega), porque el texto vive en el componente de sidebar compartido por todos los módulos; se quitó únicamente el `environment` del texto mostrado, sin tocar `config/config.js` (su valor `"demo"` se conserva, por si algo más lo necesitara).

Archivos modificados: `modules/morbilidadModuleView.js` (`_capturarImagenGrafica()`; el bloque de generación del PDF reescrito para empacar secciones en vez de una página por sección, con imagen de gráfica antes de cada tabla), `pages/morbilidad.html` (Tendencia/MesAnio a `col-span-12`), `components/sidebar.js` (quitar `environment` del pie), `scripts/test_morbilidad_jsdom.js` (stub de `autoTable` ahora también fija `lastAutoTable.finalY`, para que la nueva lógica de empacado tenga con qué seguir calculando "y" en las pruebas). No se tocó ningún cálculo, dato, Top N, filtro ni diseño ya validado — ni `components/charts.js`, ni `scripts/build_morbilidad_casos.py`, ni archivos de `data/real/`/`data/processed/`.

Verificado con 6 pruebas jsdom del proyecto (cero errores) + Chromium real (Playwright, `playwright_check_morbilidad_seguimiento3.js`, más `playwright_check_morbilidad_seguimiento2.js` re-corrido con una aserción de conteo de páginas actualizada al nuevo comportamiento esperado — sin cambios de fondo, sólo reflejar el nuevo empacado): Tendencia/MesAnio confirmados al mismo ancho que una tarjeta `col-span-12` ya conocida y uno debajo del otro, con todos los valores intactos; el PDF con las 10 secciones marcadas confirmado con 9 imágenes reales embebidas (una por cada sección con gráfica) e "Indicadores" empacado en la página 1 junto con el encabezado (nunca en una página aparte); el PDF con sólo "Indicadores" marcado confirmado en 1 sola página; "demo" confirmado ausente del pie del sidebar tanto en Morbilidad como en otro módulo (CACU) — cero errores de JS relevantes en consola.

Entregable de esta entrega: `SNSP_Inteligencia_Digital_v2.5.0_morbilidad_act09_seguimiento3.zip` (puntos 1 y 2 pendientes de la base cruda).

## Actualización 9 — Morbilidad: ajustes visuales en las gráficas

Sobre la Actualización 8 (abajo): únicamente ajustes VISUALES a las gráficas de Morbilidad, sin tocar ningún cálculo, dato, filtro, buscador ni la relación Casos+Población ya validada. Cambios:

1. **Selector Top 10 / Top 15 / Top 20 / Todos** en el panel "Padecimiento(s) dentro de la selección" (`#morb-padecimientos-topn`, es la gráfica que más puede crecer: hasta 157 padecimientos sin selección) — predeterminado Top 10. Sólo recorta cuántas barras se DIBUJAN en ese panel; el total real de categorías (antes de recortar) se calcula con la misma agregación ya validada (`agregar`/`agregarComparativo`) y se muestra en el subtítulo ("Top 10 de 150 padecimientos…"). No se agregó a ningún otro panel.
2. **Municipio, Jurisdicción, Institución, Grupo de edad y Sexo siguen mostrando TODAS sus categorías reales**, sin Top N ni recorte — Municipio además sigue 0-rellenando siempre los 18 municipios (sin cambios de esta actualización, ya era así desde la Actualización 8).
3. **Grosor de barra uniforme** en TODAS las gráficas de Morbilidad (la dinámica de Analizar/Por y los 8 paneles del Panorama de Casos): mismo `maxBarThickness` en modo clásico y comparativo, en vez de valores distintos sueltos por gráfica.
4. **Separación uniforme en comparativo**: cuando hay 2025 y 2026 seleccionados, las barras de ambos años quedan pegadas entre sí dentro de su categoría (`barPercentage` alto) y con separación clara respecto a la categoría siguiente (`categoryPercentage` más bajo) — mismo criterio en todas las gráficas comparativas.
5. **Alto de cada gráfica adaptado al número de categorías**: se recalculó la fórmula de alto (antes una heurística suelta) para que se derive directamente del mismo grosor/separación de barra de los puntos 3 y 4 — así ni sobra espacio vacío (pocas categorías, p. ej. Casos por sexo) ni se amontonan las barras (muchas categorías, p. ej. Casos por municipio en comparativo).
6. **Se conservan las 8 gráficas del Panorama de Casos y todos los filtros/buscador/Año actuales** — ninguna funcionalidad se quitó ni se reconstruyó el módulo; sólo se extendieron las funciones de render ya existentes.

Cambio de infraestructura compartida, mínimo y retrocompatible: `components/charts.js` (`SNSP_renderBarChart`/`SNSP_renderGroupedBarChart`) ahora acepta `opts.maxBarThickness`/`opts.barPercentage`/`opts.categoryPercentage` como overrides OPCIONALES — si un módulo no los pasa (CACU, Mama, Dashboard, Población, Cargar datos), el comportamiento es exactamente el de siempre. Verificado: las 6 pruebas jsdom del proyecto (incluidos los 5 módulos que NO son Morbilidad) siguen pasando sin cambios.

Archivos modificados en esta actualización: `components/charts.js` (overrides opcionales, retrocompatibles), `modules/morbilidadModuleView.js` (constantes de grosor/separación uniformes, nueva fórmula de alto, selector Top N del panel de Padecimientos), `pages/morbilidad.html` (selector `#morb-padecimientos-topn` + subtítulo dinámico del panel de Padecimientos), `scripts/test_morbilidad_jsdom.js` (nuevas aserciones: Top N no modifica el KPI de Casos totales, grosor uniforme, separación en comparativo, alto adaptado). No se tocó `scripts/build_morbilidad_casos.py` ni ningún archivo de datos (`data/real/*`, `data/processed/*`) — no había ningún cálculo que cambiar.

Verificado con: 6 pruebas jsdom del proyecto (cero errores, incluidas las nuevas aserciones de ACT09) + Chromium real (Playwright, `playwright_check_morbilidad_act09.js`) recorriendo 2025, 2026 y ambos años: Top N predeterminado en 10, cambiar a Todos/15/20 no modifica el KPI "Casos totales" (verificado con los mismos filtros en los 3 escenarios), Municipio/Grupo de edad/Sexo siguen completos sin importar el Top N de Padecimientos, grosor de barra idéntico entre la gráfica dinámica y el Panorama de Casos, barPercentage > categoryPercentage en comparativo (barras pegadas por categoría, separación clara entre categorías), y alto de gráfica proporcional al número de categorías — cero errores de JS relevantes en consola.

### Ajuste de seguimiento a ACT09 (mismo día) — Top N en la gráfica principal, Tendencia y Comparativo por mes/año como series separadas

Revisión visual de ACT09 con 3 pendientes, corregidos sin tocar ningún cálculo, dato, filtro ni buscador:

1. **Top N también en la gráfica/tabla PRINCIPAL** (`#morb-principal-topn`, junto al título "Gráfica"): mismo patrón 10/15/20/Todos, predeterminado Top 10 — antes el selector de ACT09 sólo existía en el panel de Padecimientos del Panorama, y la gráfica principal con Por=Padecimiento seguía creciendo hasta 157 barras. Aplica ÚNICAMENTE cuando Por=Padecimiento (la única dimensión que crece de verdad); con Por=Municipio/Jurisdicción/Grupo de edad el selector se deshabilita visualmente y esas gráficas siguen mostrando siempre todas sus categorías reales, igual que en el resto de Morbilidad. La gráfica y la tabla se recortan juntas (mismo Top N). El KPI "Categorías encontradas" y el aviso "Top N de M" en el subtítulo usan el total ANTES de recortar (mismo `agregar`/`agregarComparativo` ya validado), así que nunca cambian al mover el Top N — sólo cambia cuántas filas/barras se dibujan.
2. **Tendencia por año/mes ya no encadena 24 meses en una sola línea** cuando hay 2+ años en alcance: ahora dibuja una serie por año (2025, 2026…), las dos sobre el MISMO eje de 12 meses (Ene-Dic), para poder comparar la forma de la tendencia mes a mes entre años.
3. **Comparativo por mes y año ya no suma los años en una sola barra** cuando el alcance incluye 2+ años — esto incluía el estado por defecto sin ningún año marcado ("Todos, 2025 y 2026 combinados"), que antes sí los sumaba en una sola barra por mes. Ahora, con 2+ años en alcance (marcados explícitamente o por defecto), siempre dibuja una barra por año, agrupadas por mes, igual que ya hacía cuando el usuario marcaba los 2 años a mano.
4. **"Sin información" ya no se dibuja como "0 casos"**: en Tendencia y en Comparativo por mes y año, un mes SIN ningún registro en la selección vigente (p. ej. 2026 sólo tiene datos cargados hasta agosto; septiembre-diciembre de 2026 aún no existen en la base) se deja como `null`, no como 0 — Chart.js interrumpe la línea o simplemente no dibuja esa barra, en vez de mostrar un valor que podría confundirse con un mes que sí se registró y tuvo 0 casos.

Archivos modificados en este ajuste: `modules/morbilidadModuleView.js` (`_topNPrincipal()`, Top N aplicado a `renderTablero()` — gráfica y tabla principal — antes de dibujar y antes de calcular el KPI "Categorías encontradas"; `renderChartTendencia()` y `renderChartMesAnio()` reescritas para series por año sobre 12 meses fijos, con `null` en los meses sin ningún registro), `pages/morbilidad.html` (selector `#morb-principal-topn` + subtítulo dinámico `#morb-subt-principal` junto al título "Gráfica"), `scripts/test_morbilidad_jsdom.js` (nuevas aserciones para los 4 puntos de arriba). No se tocó `components/charts.js` en este ajuste (ya traía los overrides necesarios desde ACT09), ni `scripts/build_morbilidad_casos.py`, ni ningún archivo de `data/real/*`/`data/processed/*`.

Verificado con: 6 pruebas jsdom del proyecto (cero errores) + Chromium real (Playwright, `playwright_check_morbilidad_act09b.js`, más el script anterior `playwright_check_morbilidad_act09.js` vuelto a correr sin cambios para confirmar que no hay regresión) recorriendo 2025, 2026 y ambos años: Top N de la gráfica principal predeterminado en 10, Todos/15/20 no modifican Casos totales ni Categorías encontradas, se deshabilita solo con Por≠Padecimiento; Tendencia y Comparativo por mes y año muestran 2 series de 12 meses (no 24 encadenados ni sumados) tanto con los 2 años marcados explícitamente como sin ningún año marcado; los meses de 2026 sin información cargada (septiembre-diciembre) quedan en `null` en ambos paneles, nunca en 0 — cero errores de JS relevantes en consola.

### Segundo ajuste de seguimiento a ACT09 — años sin sumar en TODO el Panorama, etiquetas mensuales legibles, "Generar reporte PDF" y limpieza de texto

Cuatro pendientes más sobre Morbilidad, corregidos sin tocar ningún cálculo, dato, Top N, filtro ni diseño ya validado:

1. **Años — sin selección ya NO suma 2025+2026 en ningún panel del Panorama de Casos** (antes el ajuste anterior sólo corrigió esto en Tendencia y Comparativo por mes y año): se agregó un único helper, `_aniosEnAlcance()` — sin ningún año marcado, trata el catálogo completo de años como "en alcance" (comparativo), en vez de dejar `aniosSeleccionados` vacío (que antes hacía que cada panel sumara ambos años sin darse cuenta). `renderTablero()` y `renderPanoramaCasos()` son los ÚNICOS 2 lugares que lo usan; como cada uno de los 8 paneles y la gráfica/tabla principal ya recibían `aniosSeleccionados`/`modoComparativo` como parámetro y ya sabían dibujar clásico vs. comparativo correctamente, el arreglo fue mínimo — ningún panel necesitó cambios propios. Un año marcado sigue mostrando sólo ese año; los 2 años (marcados o por defecto) siempre comparativo, nunca sumados.
2. **Etiquetas mensuales (Tendencia y Comparativo por mes y año) ya no se encimaban** con 2 series muy juntas por mes: se agregó un formateador numérico compacto sólo para esos 2 paneles ("81k" en vez de "81,046" — el valor completo se conserva íntegro en el dato y en el tooltip, esto sólo cambia el texto IMPRESO sobre la barra/punto) y una fuente de etiqueta más chica (9px, antes 10-13px según categorías). También se corrigió que, en Tendencia, las etiquetas de 2 series en el mismo mes ya no se dibujan exactamente en el mismo punto (cada serie se desplaza un poco más arriba que la anterior). Los meses sin información cargada se siguen dejando en `null`, nunca en `0` (sin cambios de comportamiento, ya corregido en el ajuste anterior). Cambio compartido y retrocompatible en `components/charts.js`: `opts.valueLabelFontSize` (override opcional, `undefined` por defecto) y el desplazamiento por serie en gráficas de línea — verificado que los otros 5 módulos (que no pasan esta opción) siguen exactamente igual.
3. **Nuevo: "Generar reporte PDF"** — botón junto a los indicadores, abre un modal con una casilla por sección (Indicadores, Gráfica y tabla principal, y cada uno de los 8 paneles del Panorama de Casos), botones "Seleccionar todo"/"Limpiar", un campo de Observaciones opcional, y genera SÓLO lo elegido — siempre respetando los filtros, la búsqueda y el/los Año(s) vigentes en el tablero (nunca se recalcula nada aparte: Indicadores y la tabla principal se leen directo del DOM ya renderizado —mismo Top N que se ve en pantalla— y cada panel del Panorama se lee directo de su instancia de Chart.js ya dibujada). El documento es SIEMPRE texto y tablas (jsPDF + jsPDF-AutoTable, mismo patrón de orientación adaptable ya validado en Cargar datos/ACT06 — vertical primero, horizontal sólo si no cabe, nunca reduce la letra) — **nunca una captura de pantalla de las gráficas** (no hay ningún `canvas.toDataURL`/`doc.addImage` en todo el flujo). Incluye encabezado, periodo (con la frase uniforme del punto 4), filtros aplicados, fecha de generación, fuente — avisando honestamente que no hay fecha de corte registrada en el sistema, sin inventar una — y numeración de páginas. Con 2 series (comparativo 2025 vs 2026) cada tabla agrega columnas Diferencia/Variación %, igual que la tabla en pantalla; un mes sin información se imprime como "Sin información", nunca como "0". Si no se marca ninguna sección, se avisa dentro del modal y no se genera nada.
4. **Limpieza de texto**: se quitó "(prueba funcional)" del encabezado de Morbilidad y de su sección en Metodología (no se tocó ningún otro módulo ni `config/config.js`); no había ningún texto "demo"/"piloto" en Morbilidad. Se unificó la frase "Comparativo 2025 vs 2026" en todos los textos sueltos (chip del selector de Año, subtítulos de los paneles, conteo de la tabla) — se dejó sin tocar el uso ya existente dentro de la oración de título de cada gráfica ("... durante comparativo 2025 vs 2026"), que es una construcción gramatical distinta y ya validada. Se quitó la línea "Actualizado: Ver fecha de archivo en Metodología" del encabezado (esta base no trae una fecha de corte registrada; en vez de inventarla o dejar un texto que se remite a sí mismo, simplemente no se muestra esa línea — la fuente completa sigue en el pie de página y en Metodología). Se mantiene v2.5.0 en el pie, sin cambios.

Archivos modificados en este ajuste: `modules/morbilidadModuleView.js` (`_aniosEnAlcance()`, `_textoComparativo()`, `_morbFormatoCompacto()`, todo el bloque de "Generar reporte PDF" — helpers de lectura DOM/Chart.js, orientación adaptable, `generarReportePDFMorbilidad()`, wiring del modal), `components/charts.js` (`opts.valueLabelFontSize` opcional + desplazamiento por serie en línea, ambos retrocompatibles, más un formatter defensivo que nunca rompe el dibujado si recibe un valor atípico), `pages/morbilidad.html` (botón "Generar reporte PDF", modal de selección de secciones, `<script>` de jsPDF/jsPDF-AutoTable), `pages/metodologia.html` (quitar "prueba funcional"), `styles/main.css` (estilo de `textarea` para el campo Observaciones, variante `.modal-box--wide`), `scripts/test_morbilidad_jsdom.js` (nuevas aserciones para los 4 puntos, incluido un stub de jsPDF/AutoTable). No se tocó ningún cálculo, `scripts/build_morbilidad_casos.py`, ni ningún archivo de `data/real/*`/`data/processed/*`.

Verificado con: 6 pruebas jsdom del proyecto (cero errores, incluidas ~30 aserciones nuevas de este ajuste, con un stub de jsPDF/jsPDF-AutoTable) + Chromium real (Playwright, `playwright_check_morbilidad_seguimiento2.js`) con las bases reales: los 8 paneles del Panorama confirmados en comparativo sin ningún año marcado (no sólo Tendencia/MesAnio), 1 año = modo clásico, 2 años = comparativo; etiquetas de Tendencia/Comparativo por mes y año con fuente reducida y valores completos conservados en el dataset; limpieza de texto confirmada en Morbilidad y en Metodología, v2.5.0 en el pie; y el PDF se generó como archivo REAL (sin red) y se inspeccionó con `pdf-parse`: encabezado, periodo comparativo vigente, filtros, fecha, fuente (con el aviso honesto de "sin fecha de corte registrada"), observación escrita, numeración de páginas, sólo las 3 secciones elegidas presentes (las no elegidas confirmadas AUSENTES) y validación de "elige al menos una sección" al no marcar ninguna — cero errores de JS relevantes en consola en ambos scripts.

## Actualización 8 — Morbilidad: recuperación de visualizaciones ("Panorama de Casos")

Sobre la Actualización 7 (abajo): la unificación había quedado bien, pero redujo Morbilidad a una sola gráfica+tabla dinámica (Analizar/Por), perdiendo las visualizaciones fijas que traía la versión anterior. Se pidió reincorporarlas SIN volver a la fuente anterior ni crear un segundo tablero. Cambios:

1. **Se conserva el tablero unificado actual y su fuente única** (BASE_CASOS_2025_2026 + BASE_POBLACION_2025_2026): la gráfica dinámica de Analizar/Por, el buscador CIE-10/Epi-clave/padecimiento, los filtros Municipio/Jurisdicción/Institución y el selector de Año — nada de eso se tocó ni se eliminó.
2. **Nueva sección "Panorama de Casos"**, debajo del tablero dinámico, con las 8 gráficas pedidas: Casos por municipio (los 18 municipios, 0-rellenados), Casos por jurisdicción sanitaria (dona; barras agrupadas por año si hay comparativo), Casos por institución, Casos por grupo de edad, Padecimiento(s) dentro de la selección, Tendencia por año/mes (línea continua, 12 meses con un año, 24 encadenados con ambos), comparativo por mes y año (12 meses fijos, barras agrupadas por año con comparativo) y Casos por sexo.
3. **Todas responden a los mismos filtros, buscador y Año** que el tablero: se recalculan dentro de la misma `renderTablero()`, recibiendo los mismos `filtrosActivos`/`aniosSeleccionados`/`modoComparativo` ya calculados ahí — no hay un cálculo ni un estado independiente por panel.
4. **Comparativo 2025 vs 2026 donde corresponde**: cuando ambos años están seleccionados, los 8 paneles cambian automáticamente a series agrupadas por año (nunca se suman), reutilizando `agregarComparativo`/`agregarComparativoConPoblacion` ya validados.
5. **Institución es SIEMPRE Casos, nunca Tasa**: la población de esta base no está desagregada por institución, así que ese panel (y los otros 7 del "Panorama de Casos") son exclusivamente de Casos, ignorando a propósito el selector global Analizar — no se inventó ningún denominador.
6. **Segundo bundle de datos, ligero, sólo para Mes/Sexo**: agregar Mes y Sexo directamente al bundle principal habría dado ~133,000 filas (de 20,563); se generó un bundle SEPARADO (`morbilidad_temporal_2025_2026.js`, agrupado por Año+Jurisdicción+Municipio+Institución+Mes+Sexo+Epi-Clave, sin Grupo de edad) que quedó en 35,809 filas — usado únicamente por Tendencia por año/mes, comparativo por mes y año y Casos por sexo. El bundle principal (20,563 filas) no cambió.
7. **No se eliminó ninguna funcionalidad actual**: Analizar (Casos/Población/Tasa), Por (Padecimiento/Municipio/Jurisdicción/Grupo de edad), Año (comparar), filtros, buscador y KPIs siguen exactamente igual.

Archivos modificados en esta actualización: `scripts/build_morbilidad_casos.py` (se agregó `build_temporal()`, genera el bundle secundario; `build_casos()` no cambió), `data/real/morbilidad_temporal_2025_2026.js` y `data/processed/morbilidad_temporal_2025_2026.json` (nuevos), `pages/morbilidad.html` (se agregó la sección "Panorama de Casos" con 8 paneles + script del bundle temporal), `modules/morbilidadModuleView.js` (se agregaron las 8 funciones de render del Panorama, llamadas desde `renderTablero()`), `pages/metodologia.html` (apartado de Morbilidad actualizado: bundle temporal, Panorama de Casos, limitación de Tasa por institución/mes/sexo), `scripts/test_morbilidad_jsdom.js` (nuevas aserciones para los 8 paneles, año único y comparativo, filtros y búsqueda). `data/real/morbilidad_casos_2025_2026.js` y `data/processed/morbilidad_casos_2025_2026.json` no cambiaron de contenido (mismo bundle principal, sólo se regeneraron para confirmar que siguen idénticos).

Verificado con: las 6 pruebas de humo jsdom del proyecto (incluida `test_morbilidad`, ampliada) pasan sin aserciones fallidas; Chromium real (Playwright, `playwright_check_morbilidad_panorama.js`) recorriendo 2025 solo, 2026 solo y ambos años comparativo sobre los 8 paneles (número de series y categorías correctas en cada caso), Institución confirmado como SIEMPRE "Casos" incluso con Analizar=Tasa activo globalmente, filtro de Institución acotando Casos por institución y Casos por sexo a la vez, y búsqueda CIE-10 (C50) acotando Padecimiento(s) dentro de la selección y Casos por sexo a la vez — cero errores de JS relevantes en consola (se descartan los 2 errores de red esperados por bloquear a propósito fonts.googleapis.com, mismo patrón que ya tenía `playwright_check_morbilidad_v25.js`).

## Actualización 7 — Morbilidad como UN SOLO tablero unificado

Corrección sobre la Actualización 6 (abajo): Morbilidad tenía "el módulo anterior (cubo CIE-10) + un panel independiente abajo (Casos/Población/Tasa)". Se pidió unificarlo en un solo tablero, sin eliminar funcionalidades que ya sirven ni cambiar la lógica de cálculo validada. Cambios, en orden de la petición:

1. **Buscador conservado, accesos rápidos eliminados**: el buscador por CIE-10/Epi-clave/padecimiento sigue funcionando igual (mismo tipo de coincidencia por texto); se quitaron los chips C50/C53/D05/D06/N87.
2. **Una sola fuente de datos**: todo el tablero (buscador, filtros, Analizar, Por, gráfica, tabla) se calcula ahora sobre BASE_CASOS_2025_2026 + BASE_POBLACION_2025_2026 — la misma base ya validada en Cargar datos. El cubo anterior (CUBOS_DE_MORBILIDAD) dejó de usarse en esta página porque no traía Grupo de edad, Población ni el mismo rango de años, y mantener dos fuentes habría mostrado números distintos para lo mismo. Ningún archivo de otro módulo se tocó ni se borró; `morbilidad_2025.js` y `services/morbilidadDataService.js` siguen en el proyecto, sólo que `pages/morbilidad.html` ya no los referencia.
3. **Analizar**: Casos / Población / Tasa por 100,000 habitantes (igual que antes, ahora integrado).
4. **Por**: Padecimiento / Municipio / Jurisdicción / Grupo de edad.
5. **Institución**: se quitó de "Por" y quedó únicamente como filtro.
6. **Año (comparar)**: selector múltiple de chips — 2025, 2026 o ambos, reutilizando EXACTAMENTE la lógica de comparación anual ya validada en Cargar datos (`agregarComparativoConPoblacion`); con ambos años elegidos se muestran como dos series separadas (gráfica agrupada + columnas "Casos 2025"/"Casos 2026"/Diferencia/Variación %), nunca sumadas en una sola barra.
7. **Filtros consistentes**: Municipio, Jurisdicción e Institución (con "Aplicar filtros"/"Limpiar", mismo componente `SNSP_renderFilterBar` ya validado) afectan a la vez las tarjetas KPI, la gráfica y la tabla.
8. **"Grupo de edad — dato pendiente de carga" corregido**: ya no existe ese aviso; Grupo de edad es una opción real de "Por" con datos reales de BASE_CASOS_2025_2026.
9. **Periodo corregido**: todo el texto de la página (fuente, subtítulo, metodología) dice 2025-2026, nunca 2024-2026 — se revisó y corrigió también `pages/metodologia.html` (apartado de Morbilidad), que documentaba el cubo anterior con años 2024-2026.
10. **Sin duplicar controles**: una sola gráfica y una sola tabla (las que ya se habían generado en la Actualización 6), integradas al tablero — no hay dos secciones separadas.
11. **Tasa**: exclusivamente Casos ÷ Población × 100,000, misma fórmula y función (`agregarConPoblacion`/`agregarComparativoConPoblacion`) ya validada en Cargar datos — no se generó ningún cálculo alterno.
12. No se modificó ningún otro módulo, usuarios, autenticación, Cargar datos, seguridad ni persistencia.

**Pérdida de funcionalidad, documentada con transparencia** (consecuencia de usar una sola fuente, no pedida explícitamente pero necesaria para evitar duplicar información): la tabla de detalle por CLUES/unidad médica ya no está disponible en Morbilidad, porque BASE_CASOS_2025_2026 no trae esa columna (sólo la traía el cubo anterior). Se documentó en `pages/metodologia.html` como limitación conocida. Si esta pérdida no es aceptable, es reversible mostrando de nuevo esa tabla con el cubo anterior como fuente adicional — pero eso reintroduciría dos fuentes de datos en la misma página.

Archivos modificados: `scripts/build_morbilidad_casos.py` (se agregó Jurisdicción y Epi-Clave a la agregación — sin costo, son relaciones 1 a 1 verificadas, sigue en 20,563 filas — y un catálogo de padecimientos para el buscador), `data/real/morbilidad_casos_2025_2026.js` y `data/processed/morbilidad_casos_2025_2026.json` (regenerados con las columnas nuevas), `pages/morbilidad.html` (reescrita: un solo tablero), `modules/morbilidadModuleView.js` (reescrito), `pages/metodologia.html` (apartado de Morbilidad actualizado), `scripts/test_morbilidad_jsdom.js` (reescrito para el nuevo tablero).

Verificado con: 6 pruebas jsdom (todas pasan, cero errores) + Chromium real (Playwright) recorriendo las 3 combinaciones de año (2025, 2026, ambos) × 3 de Analizar (Casos/Población/Tasa) × 4 de Por (Padecimiento/Municipio/Jurisdicción/Grupo de edad) = 36 combinaciones, todas con resultados; verificación cruzada de la fórmula de Tasa contra Casos/Población calculados independientemente (coincide exactamente en los 18 municipios); confirmación de que ningún texto de la página menciona 2024; confirmación de que "Por" no incluye Institución; regresión del buscador CIE-10 dentro del tablero unificado — cero errores de JS en consola.

## Actualización 6 — panel Casos/Población/Tasa en Morbilidad, v2.5.0 y propuestas de arquitectura

Sobre la Actualización 5 (abajo), se pidió una actualización con 5 partes.
Se implementaron las partes 1 y 4; las partes 2 y 3 quedaron **sólo como
propuesta por escrito, sin implementar**, tal como se pidió explícitamente
("detente y explícame la propuesta antes de implementarlo").

1. **Morbilidad — panel Analizar/Por (implementado)**: se agregó al
   módulo Morbilidad un panel nuevo, "Análisis por Casos, Población y
   Tasa", con los mismos dos controles ya validados en Cargar datos:
   **Analizar** (Casos / Población / Tasa por 100,000 habitantes) y
   **Por** (Padecimiento / Municipio / Grupo de edad / Institución), que
   actualizan gráfica y tabla dinámicamente. Reutiliza
   `window.SNSP_CARGA_SERVICE.agregarConPoblacion()` tal cual (no se
   recalculó nada distinto). Es aditivo: la búsqueda CIE-10/Epi-clave, sus
   filtros y sus gráficas no se tocaron. Usa las mismas bases reales de
   Cargar datos (`BASE_CASOS_2025_2026.xlsx` + `BASE_POBLACION_2025_2026.xlsx`),
   pre-agregadas por `scripts/build_morbilidad_casos.py` de 288,106 a
   20,563 filas (suma idéntica, sin cambiar el resultado) para no enviar
   al navegador columnas que este panel no usa. Sin Top N ni otras
   funciones nuevas, según lo pedido.
2. **Persistencia de datos (propuesta, NO implementada)**: ver
   `PROPUESTA_ARQUITECTURA_PERSISTENCIA.md` — se recomienda Supabase
   (Postgres + Storage), consistente con lo que `auth/auth.js` ya
   anticipaba, para que una base aprobada sobreviva a cerrar/recargar la
   página y sea la misma para todos los usuarios (algo que ningún
   almacenamiento del navegador, incluyendo `localStorage`, puede
   garantizar). No se implementó nada de esto.
3. **Seguridad y roles (propuesta, NO implementada)**: ver
   `PROPUESTA_ARQUITECTURA_SEGURIDAD.md` — se propone mover la
   autenticación/roles ya existentes en `auth/auth.js` (que hoy sólo se
   aplican en el navegador) a Supabase Auth + Row Level Security, para que
   "sólo usuarios autorizados pueden cargar, validar y publicar" se
   cumpla de verdad del lado del servidor, con bitácora persistente,
   versionado/respaldo y archivos institucionales en un bucket privado
   (nunca públicos en el repositorio). No se implementó nada de esto.
4. **Versión v2.4.1 → v2.5.0 (implementado)**: `config/config.js`
   (`platform.version`) actualizado; nueva entrada en el historial de
   cambios (`changelog`) y nueva sección en `README.md`, conservando las
   entradas anteriores como historia. Confirmado que no queda ninguna
   referencia activa a `2.4.1`/`v2.4.1` fuera de esas dos menciones
   históricas intencionales.
5. No se eliminó ni modificó ninguna función ya validada de Casos,
   Población, Tasa, comparación por años, filtros, gráficas, PDF, usuarios
   o carga de archivos — las 6 pruebas de humo (jsdom) de la plataforma se
   corrieron sin errores tras estos cambios.

## Actualización 5 — mapeo rápido, relacionar Casos + Población (Tasa) y PDF adaptable

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
