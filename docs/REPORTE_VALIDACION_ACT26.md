# Reporte de validación y pruebas — ACT26

**SNSP Inteligencia Digital · Módulo Población · Versión 2.7.0 (versión de pruebas)**
Fecha: 26 de octubre de 2026 (incluye la ampliación ACT26b: Comparativo poblacional por años) · Preparado para la demostración ante la supervisión nacional del 27 de octubre de 2026.

> Prototipo de pruebas. No se publicó en GitHub ni se modificó producción.
>
> **Nota (ACT26c):** este reporte documenta ACT26 y ACT26b. La pirámide SUIVE se sustituyó en ACT26c por barras por sexo y edad, y las capturas de `docs/capturas_act26/` se reemplazaron por `docs/capturas_act26c/`. Ver `docs/REPORTE_VALIDACION_ACT26c.md`.

## 1. Resumen

| Concepto | Resultado |
|---|---|
| Base SUIVE 2017–2026 | 3,960 registros completos, sin nulos ni duplicados |
| Claves geográficas (GeoJSON, TopoJSON, catálogo Power BI y base) | 18 de 18 coinciden, con jurisdicción idéntica |
| Conciliación 2022–2026 con la población de Morbilidad | 990 celdas idénticas (diferencia 0) |
| Prueba nueva jsdom (`test_poblacion_historica_jsdom.js`) | **95 / 95 OK** (71 base + 24 del comparativo) |
| Comparativo contra el Excel original (`verificar_comparativo_vs_base.py`) | **2,185 comparaciones, 0 diferencias** (23 áreas × 10 años × 3 indicadores, con diferencias y variaciones) |
| Pruebas jsdom existentes (7 módulos) | **7 / 7 OK**, sin aserciones fallidas |
| Validación en navegador real, 3 tamaños de pantalla (`playwright_check_act26_poblacion.js`) | **51 / 51 OK** |
| Carga de las 8 pantallas de la plataforma en navegador (y la pestaña ASIS) | 0 errores en todas |

## 2. Alcance de la versión

- El módulo Población tiene dos pestañas:
    - **Población histórica SUIVE 2017–2026**: es nueva y abre por defecto.
    - **Población por localidad 2025**: el padrón ASIS, con la misma lógica de antes.

    Las dos fuentes **nunca se mezclan**.

- **Filtros:** Año (2026 por defecto), Jurisdicción sanitaria y Municipio, en cascada. Al elegir un municipio, la jurisdicción se ajusta sola.
- **Indicadores:**
    - Población total.
    - Mujeres y hombres.
    - % mujeres / % hombres, con la relación hombres por cada 100 mujeres.
    - Crecimiento contra el año anterior. En 2017 aparece "No disponible" porque es el primer año de la serie.
- **Pirámide interactiva:**
    - Hombres a la izquierda (dorado #A57F2C) y mujeres a la derecha (vino #611232).
    - Eje central y grupos de mayor edad arriba.
    - Los 11 grupos de la fuente, cada uno con su amplitud.
    - Modo Absolutos / %.
    - Al pasar el cursor: población, % del total y % dentro de su sexo.
- **Mapa coroplético de los 18 municipios:**
    - Usa los límites reales de `Municipios_Queretaro_18`.
    - Colores por quintiles.
    - Al pasar el cursor muestra el detalle; un clic filtra por ese municipio.
    - Si hay una jurisdicción seleccionada, los municipios de otras jurisdicciones se ven atenuados.
- **Gráficas complementarias:**
    - Evolución 2017–2026: total o por sexo.
    - Población por jurisdicción.
    - Municipios ordenados de mayor a menor.
    - Grandes grupos de edad, con índices de dependencia y envejecimiento.
    - **Comparativo poblacional por años** (ACT26b), ver sección 6.
- **Notas metodológicas** visibles en la propia pantalla.

## 3. Auditoría de la base de población

- **Estructura:** 10 años × 18 municipios × 2 sexos × 11 grupos de edad = 3,960 registros. No hay nulos, duplicados, negativos ni ceros.
- **Grupos de edad de amplitud desigual:** 0 años (1), 1–4 (4), 25–44 (20), 50–59 (10), 65 y más (abierto); los demás son de 5 años. Se respetan tal cual y no se generaron grupos quinquenales.
- **Decimales (2,356 filas):**
    - 1,636 filas tienen ruido de exportación (±0.000001).
    - 720 filas tienen fracciones reales, solo en "De 00 años" y "De 01 a 04 años". En cada año, municipio y sexo, esos dos grupos suman un entero; es decir, la fuente prorrateó el grupo 0–4.
    - **Tratamiento:** se conservan los valores originales, se suma con precisión completa y se redondea solo al mostrar.
- **Fuente metodológica de la proyección:** pendiente de confirmar. No se atribuye a CONAPO ni a ninguna otra institución.

Totales anuales verificados (base cruda = datos generados = interfaz):

| Año | Total | Mujeres | Hombres | JS 1 Querétaro | JS 2 San Juan del Río | JS 3 Cadereyta | JS 4 Jalpan |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2017 | 2,233,603 | 1,136,530 | 1,097,073 | 1,405,963 | 567,512 | 172,910 | 87,218 |
| 2018 | 2,298,993 | 1,170,302 | 1,128,691 | 1,460,758 | 577,362 | 173,124 | 87,749 |
| 2019 | 2,364,645 | 1,204,362 | 1,160,283 | 1,516,509 | 586,765 | 173,182 | 88,189 |
| 2020 | 2,419,819 | 1,233,182 | 1,186,637 | 1,568,418 | 591,682 | 171,833 | 87,886 |
| 2021 | 2,462,684 | 1,255,751 | 1,206,933 | 1,606,073 | 596,787 | 172,029 | 87,795 |
| 2022 | 2,508,214 | 1,279,210 | 1,229,004 | 1,645,722 | 602,339 | 172,376 | 87,777 |
| 2023 | 2,557,915 | 1,304,260 | 1,253,655 | 1,688,435 | 608,665 | 172,937 | 87,878 |
| 2024 | 2,606,698 | 1,328,867 | 1,277,831 | 1,730,862 | 614,561 | 173,378 | 87,897 |
| 2025 | 2,654,421 | 1,352,999 | 1,301,422 | 1,772,893 | 619,989 | 173,680 | 87,859 |
| 2026 | 2,700,978 | 1,376,643 | 1,324,335 | 1,814,408 | 624,937 | 173,868 | 87,765 |

**Separación de fuentes:** en 2025 el total estatal del SUIVE (2,654,421) y el del padrón ASIS (2,655,609) casi coinciden. Sin embargo, por municipio difieren entre −16% y +8%, así que se mantienen en pestañas separadas.

## 4. Conciliación geográfica

- **Archivos revisados:**
    - `Municipios_Queretaro_18.geojson` (CRS84) y `.topojson`.
    - `.qmd` (metadatos QGIS; CRS de origen Mexico ITRF2008 / LCC).
    - `GEOGRAFIA_QUERETARO_POWER_BI.xlsx` (hoja `DIM_GEOGRAFIA_MUNICIPAL`).
- **Coincidencia de claves:** las 18 claves `CVE_MUN` / `CVEGEO` (22001–22018) coinciden en las cuatro fuentes. La jurisdicción (campo `JS`) es idéntica a la de la base SUIVE en los 18 municipios.
- **Geometría:** las 18 geometrías son válidas, no se traslapan entre sí (la unión tiene la misma área que la suma) y forman un solo bloque estatal.
- **Relación por clave, no por texto:**
    - En 12 de los 18 municipios, la columna `MUNICIPIO_SUIVE` del catálogo Power BI no es igual al texto real de la base SUIVE. Por ejemplo, el catálogo dice "001 Amealco de Bonfil" y la base dice "001 Amealco"; el catálogo dice "011 El Marqués" y la base dice "011 Marques; El".
    - Por eso la relación se hace siempre por clave y nunca por nombre. El script de construcción se detiene si alguna clave o jurisdicción no coincide.
- **Uso en la web:**
    - El TopoJSON se simplificó solo para visualización (Douglas-Peucker sobre arcos compartidos, tolerancia de unos 67 m, 4,166 vértices en total). Como se simplifican arcos compartidos, los bordes entre municipios no quedan con huecos.
    - El mapa se dibuja en SVG, sin librerías ni mosaicos externos, y funciona sin conexión.

## 5. Corrección de un error preexistente (ACT25)

- **Qué pasaba:** en ACT25, la pirámide del padrón ASIS 2025 (`SNSP_renderPopulationPyramid`, en `components/charts.js`) lanzaba `TypeError: Cannot convert object to primitive value`. Chart.js invocaba su formateador de etiquetas con un objeto de contexto en lugar de un número, y por eso sus etiquetas no se dibujaban.
- **Por qué había que corregirlo:** al convivir en la misma página con las gráficas nuevas, ese error detenía el ciclo de dibujo que Chart.js comparte entre todas las gráficas y las dejaba en blanco.
- **Corrección mínima:** se cambió una sola función interna. El formateador devuelve su propia referencia cuando no recibe un número. No cambió ninguna otra parte de `charts.js` y ningún otro módulo usa esa función.
- **Verificación:** la pirámide ASIS ya dibuja sus etiquetas; las 8 pantallas cargan con 0 errores.

## 6. Comparativo poblacional por años (ACT26b)

- **Selector de años independiente:** botones de 2017 a 2026 que se activan y desactivan uno por uno. También hay atajos para "Mostrar todos", "Quitar todos" y "Últimos 5" (selección por defecto: 2022–2026).
- **Indicadores a comparar:** Población total (verde oscuro), Mujeres (vino) y Hombres (dorado). Se pueden activar o desactivar; la gráfica y la tabla se ajustan.
- **Gráfica de barras agrupadas:** un grupo por año con etiquetas de población. En computadora las barras son verticales (las etiquetas se giran si la barra es angosta). En teléfono las barras son horizontales para que las etiquetas se lean.
- **Misma área geográfica:** respeta los filtros de Jurisdicción y Municipio (incluida la selección desde el mapa). El filtro **Año** de la parte superior no afecta al comparativo: los indicadores, la pirámide y el mapa siguen con un solo año de referencia.
- **Cada barra es la población de su propio año.** No se suma la población de distintos años; el servicio calcula cada año por separado (`getComparativo`).
- **Tabla comparativa:** año, referencia, población, diferencia absoluta y variación porcentual para cada indicador elegido.
    - La diferencia y la variación se calculan contra el **año seleccionado inmediatamente anterior**. La columna "Referencia" lo indica ("vs 2025") y el primer año se marca como "Año base".
    - Si los años no son consecutivos, se señala ("vs 2017 (3 años)") y una nota aclara que la variación abarca varios años y no es una tasa anual.
    - En teléfono la tabla se desliza hacia los lados con la columna Año fija.
- **Ejemplos verificados:**
    - Estado 2026 vs 2025: 2,700,978 hab.; +46,557; +1.75%.
    - Estado 2026 vs 2017 (sin años intermedios): +467,375; +20.92%.
    - JS 2 San Juan del Río 2017 / 2020 / 2023 / 2026: 567,512 / 591,682 / 608,665 / 624,937.
    - Landa de Matamoros 2022–2026: 18,502 / 18,247 / 17,979 / 17,703 / 17,426 (disminuciones con signo negativo).

## 7. Pruebas realizadas

1. **Construcción de datos** (`python3 scripts/build_poblacion_historica.py`): valida encabezados, completitud, duplicados, sexos, grupos, claves y jurisdicciones contra las tres fuentes geográficas, y concilia con Morbilidad. Deja el reporte en `data/processed/auditoria_poblacion_historica.json`.
2. **jsdom, 95 verificaciones**, usando el HTML real de la página:
    - Totales de los 10 años.
    - Por año, la suma de los 18 municipios, la de las 4 jurisdicciones y el total estatal coinciden.
    - Mujeres + hombres = total; la pirámide = total.
    - Pedir datos sin año marca error (no hay forma de sumar años).
    - Orientación de la pirámide y modo % (suma 100).
    - Filtros en cascada y selección en el mapa.
    - Regresión de la pestaña ASIS.
    - Comparativo (24 verificaciones): años por defecto, seleccionar y deseleccionar, Mostrar todos, Quitar todos (mensaje de selección vacía), activar y desactivar indicadores, cada barra igual al total de su año, referencia y variación en años consecutivos y no consecutivos, filtros de Jurisdicción y Municipio, signo negativo en disminuciones, que el filtro Año no altere el comparativo y que la pirámide y el mapa sigan con un solo año.
3. **Verificación del comparativo contra el Excel original** (`python3 scripts/verificar_comparativo_vs_base.py`): calcula directamente del Excel la población de las 23 áreas (estado, 4 jurisdicciones y 18 municipios) en los 10 años y los 3 indicadores, y la compara con lo que devuelve el servicio real de la plataforma, incluidas diferencias y variaciones; también prueba una selección desordenada, con años repetidos y un año inexistente. Resultado: 2,185 comparaciones y 0 diferencias.
4. **Las 7 pruebas jsdom existentes** (Dashboard, CACU, Mama, Morbilidad, Canal endémico, Carga, Población) pasan sin cambios.
5. **Navegador real (Chromium), 51 verificaciones:**
    - Valores de los indicadores.
    - Información del mapa al pasar el cursor (Querétaro 2026: 1,243,610).
    - Clic en el mapa = filtro.
    - Atenuación por jurisdicción.
    - Cascada de filtros.
    - Pirámide en modo %.
    - Pestaña ASIS (total 2,655,609; 80 localidades; las gráficas se ajustan al cambiar de pestaña).
    - Sin desplazamiento horizontal en tableta y teléfono.
    - Comparativo: las 10 barras coinciden con los totales anuales, selección libre de años con JS 2, referencia "vs 2017 (3 años)", barras horizontales en teléfono y sin desplazamiento horizontal de la página.
    - Sin errores de consola.
6. **Carga de las 8 pantallas de la plataforma:** 0 errores; la versión 2.7.0 aparece en la barra lateral.

Capturas en `docs/capturas_act26/`: escritorio, información del mapa, pirámide en %, San Joaquín 2017, pestaña ASIS, tableta y teléfono, y el comparativo (10 años; JS 2 con años salteados; tableta; teléfono).

## 8. Archivos

- **Nuevos:**
    - `scripts/build_poblacion_historica.py`
    - `data/raw/BASE_POBLACION_SUIVE_QRO_2017_2026_PLANA.xlsx`
    - `data/raw/GEOGRAFIA_QUERETARO_POWER_BI.xlsx`
    - `data/geo/Municipios_Queretaro_18.{geojson,topojson,qmd}`
    - `data/real/poblacion_historica_2017_2026.js`
    - `data/real/geo_municipios_queretaro.js`
    - `data/processed/poblacion_historica_2017_2026.json`
    - `data/processed/auditoria_poblacion_historica.json`
    - `services/poblacionHistoricaDataService.js`
    - `components/pyramidChart.js`
    - `components/mapaCoropleticoQro.js`
    - `modules/poblacionHistoricaModuleView.js`
    - `styles/poblacion-historica.css`
    - `scripts/test_poblacion_historica_jsdom.js`
    - `scripts/verificar_comparativo_vs_base.py` (ACT26b)
    - `playwright_check_act26_poblacion.js`
    - `docs/REPORTE_VALIDACION_ACT26.md`
    - `docs/capturas_act26/`
- **Modificados:**
    - `pages/poblacion.html`: pestañas. El contenido de la sección ASIS se conserva tal cual.
    - `components/charts.js`: una sola función, ver sección 5.
    - `config/config.js`: versión 2.7.0 e historial de cambios.
    - `README.md`
- **Ampliación ACT26b (comparativo):** solo cambiaron archivos de la sección SUIVE: `pages/poblacion.html` (tarjeta nueva), `modules/poblacionHistoricaModuleView.js`, `services/poblacionHistoricaDataService.js` (función nueva `getComparativo`), `components/pyramidChart.js` (función nueva `SNSP_renderComparativoAnios`), `styles/poblacion-historica.css` y las pruebas. `components/charts.js`, la sección ASIS 2025 y los demás módulos no se tocaron en esta ampliación.
- **Sin tocar:** CACU, Cáncer de Mama, Morbilidad, Canal endémico, Carga, Dashboard, login, usuarios y roles.

## 9. Pendientes y limitaciones

- **Fuente metodológica de la proyección:** hay que confirmarla antes de citarla. Mientras tanto se presenta como "base de población SUIVE".
- **2017–2021:** no se pudo conciliar contra otra fuente del proyecto. El crecimiento baja de 2.9% (2018–2019) a 1.8% después, y en 2020 algunos municipios caen. Puede deberse a un cambio de serie, pero hay que verificarlo con la fuente.
- **Apartado metodológico:** `pages/metodologia.html` no se actualizó en esta versión. Las notas metodológicas están dentro de la propia sección.
- **Exportación:** la exportación a PDF/Excel del módulo sigue pendiente, igual que en ACT25.
- **Geometría:** está simplificada solo para visualización; no debe usarse para cálculos de área.

## 10. Cómo ejecutar la demostración

1. En la carpeta raíz: `python3 -m http.server 8080`.
2. Abrir `http://localhost:8080`, iniciar sesión y entrar a **Población**.
3. **Guion sugerido:**
    1. Estado 2026: indicadores y pirámide.
    2. Pasar el cursor por el mapa y hacer clic en un municipio: todo el tablero se filtra.
    3. Cambiar a una jurisdicción.
    4. Cambiar el año.
    5. Activar la pirámide en %.
    6. Mostrar la evolución por sexo.
    7. En el comparativo: "Mostrar todos", luego elegir algunos años (por ejemplo 2017, 2020, 2023 y 2026) y una jurisdicción; señalar la tabla con la referencia de cada variación.
    8. Abrir la pestaña "Población por localidad 2025" para mostrar que las fuentes se conservan separadas.

Para la demostración se requiere conexión, para cargar Chart.js desde el CDN, igual que en el resto de la plataforma.
