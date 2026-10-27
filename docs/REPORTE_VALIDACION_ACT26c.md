# Reporte de validación y pruebas — ACT26c

**SNSP Inteligencia Digital · Módulo Población · Versión 2.7.0 (versión de pruebas)**
Fecha: 27 de octubre de 2026 · Copia de trabajo: ACT26b → ACT26c

> **Nota:** las correcciones de cierre (mapa, porcentajes, resumen demográfico y PDF) están en `docs/REPORTE_VALIDACION_ACT26c1.md`; las capturas vigentes están en `docs/capturas_act26c1/`.
>
> Versión de pruebas: no se publicó en GitHub ni se modificó producción. Este reporte complementa `docs/REPORTE_VALIDACION_ACT26.md` (auditoría de la base, conciliación geográfica y comparativo ACT26b), cuyas pruebas se volvieron a ejecutar aquí.

## 1. Resumen

| Concepto | Resultado |
|---|---|
| Estructura y ranking contra el Excel original (`verificar_act26c_vs_base.py`) | **2,430 comparaciones, 0 diferencias** (23 áreas × 10 años) |
| Comparativo multianual contra el Excel (`verificar_comparativo_vs_base.py`, ACT26b) | **2,185 comparaciones, 0 diferencias** |
| Cifras de los PDF descargados contra el Excel | Estado 2026: **25 / 25** · JS 4 2026: **20 / 20** · Landa de Matamoros 2017: **19 / 19** |
| Prueba jsdom de la sección (`test_poblacion_historica_jsdom.js`) | **109 / 109 OK** |
| Pruebas jsdom de los demás módulos (7) | **7 / 7 OK**, sin aserciones fallidas |
| Navegador real, escritorio, tableta y teléfono (`playwright_check_act26_poblacion.js`) | **129 / 129 OK** |
| Carga de las 8 pantallas de la plataforma y la pestaña ASIS | 0 errores en todas |

## 2. Cambios de ACT26c

### 2.1 Barras por sexo y grupo de edad (sustituyen a la pirámide)

- **Tipo de gráfica:** barras horizontales agrupadas. Cada grupo de edad tiene dos barras desde cero: Hombres (dorado #A57F2C) y Mujeres (vino #611232).
- **Grupos de edad:** los 11 grupos de la base, tal como vienen, sin estimar quinquenios. Los grupos con amplitud distinta a 5 años la muestran en el eje: 0 años (1 año), 1–4 (4 años), 25–44 (20 años), 50–59 (10 años) y 65 y más (abierto).
- **Nota metodológica visible:** como los intervalos tienen amplitudes desiguales, las barras no se comparan como si fueran quinquenios.
- **Se conservan:**
    - El modo Absolutos / % (en %, todas las barras suman 100).
    - La información emergente al pasar el cursor (población, % del total y % dentro del sexo).
    - El año único de referencia.
- **Orden:** los grupos van de 0 años (arriba) a 65 y más (abajo), en orden de lectura. Ya no se usa el orden invertido propio de una pirámide.
- **Sin cambios:** la pirámide de la pestaña ASIS 2025.

### 2.2 Indicadores de estructura poblacional

Hay una fila nueva, "Estructura poblacional": % Mujeres, % Hombres, población de 65 años y más y % de 65 años y más.

- El grupo de 65 y más es exactamente "De 65 y más años" de la base.
- Los cuatro indicadores responden al año y al área seleccionados.
- La fila "Volumen de población" se conserva: total, mujeres, hombres y crecimiento anual. La tarjeta combinada "Mujeres / Hombres" se sustituyó por las dos tarjetas de porcentaje.

Ejemplo verificado (estado 2026): 51.0% mujeres, 49.0% hombres y 206,954 personas de 65 y más (7.7%).

### 2.3 Ranking municipal

Tiene un selector "5 más poblados / 5 menos poblados", usa el año del filtro superior y responde a los filtros geográficos:

| Ámbito | Municipios que compara | Ejemplo verificado (2026) |
|---|---|---|
| Estado | Los 18 municipios | Más poblados: Querétaro 1,243,610 · San Juan del Río 321,932 · El Marqués 288,481 · Corregidora 245,855 · Pedro Escobedo 84,736. Menos poblados: San Joaquín 7,789 · Arroyo Seco 13,022 · Landa de Matamoros 17,426 · Peñamiller 19,273 · Tolimán 28,067. |
| Jurisdicción | Sus municipios. Si son 5 o menos, se muestran todos y se avisa. | JS 4 Jalpan: 4 municipios, se muestran todos. |
| Municipio | Los municipios de su jurisdicción; el municipio aparece resaltado y se indica su lugar en la jurisdicción y en el estado. | Landa de Matamoros 2017: lugar 3 de 4 en JS 4 y 16 de 18 en el estado. |

La gráfica "Población por municipio" con todos los municipios ordenados se conserva.

### 2.4 Reporte ejecutivo descargable en PDF

El botón «Descargar reporte poblacional» está en la parte superior de la sección; en teléfono ocupa todo el ancho. El PDF se genera en el navegador con jsPDF y jsPDF-AutoTable, en las mismas versiones que ya usan Morbilidad y Canal endémico, así que no se agregaron dependencias nuevas. Toma el año, el área y los años del comparativo seleccionados en ese momento. Al terminar aparece un mensaje de confirmación y, si algo falla, un mensaje de error visible.

**Contenido del PDF** (todas las cifras se calculan de la base, ninguna se escribe a mano):

1. **Encabezado:** logotipo SNSP, "SNSP Querétaro — Inteligencia e Información" y el título "Reporte ejecutivo de población".
2. **Ficha de consulta:** ámbito geográfico (con CVEGEO y jurisdicción cuando es un municipio), año de referencia, años del comparativo, años consultados, fuente y fecha de generación.
3. **Tarjetas:** población total (con su variación contra el año anterior), mujeres y hombres (cifra y %) y 65 años y más (cifra y %).
4. **Interpretación descriptiva:** frases construidas solo con los datos (volumen, sexo, estructura por edad, cambio anual, serie 2017–2026, comparativo y ranking), sin atribuir causas.
5. **Territorio:** mapa de los 18 municipios por quintiles. El área seleccionada lleva contorno dorado y el resto aparece atenuado. Se incluye la leyenda.
6. **Ranking municipal**, según el ámbito (ver 2.3).
7. **Distribución por sexo y grupo de edad:** gráfica, tabla de los 11 grupos con su amplitud, y grandes grupos (0–14, 15–64, 65+).
8. **Evolución histórica 2017–2026:** gráfica y tabla con la diferencia y la variación anual.
9. **Comparativo entre los años seleccionados:** gráfica y tabla con diferencias absolutas y porcentuales; indica la referencia y señala los años no consecutivos.
10. **Fuente y notas metodológicas**, y pie de página en cada página con fuente, fecha y número de página.

**Apartados que no aplican:** se identifican en el reporte y no se generan datos ficticios.

- Sin años en el comparativo: "No aplica: no se seleccionaron años en el comparativo multianual".
- Con un solo año: se muestra la tabla sin diferencias y una nota de que se requieren al menos dos años.
- Jurisdicción con 5 municipios o menos: no se repite la lista inversa de los menos poblados.
- Municipio: el ranking se presenta como su posición en la jurisdicción y en el estado.

**Fuente:** la base se identifica como "base de población utilizada en SUIVE Querétaro". La única mención de CONAPO es para aclarar que la base no se le atribuye; la prueba lo verifica en cada PDF.

**Diseño:** carta vertical, con la paleta institucional: vino, dorado, beige y gris; el verde oscuro solo se usa en la serie "Población total", igual que en el tablero. Ejemplo: `11_reporte_ejemplo_Queretaro_2026.pdf`, de 5 páginas.

## 3. Validación

1. **Excel contra la plataforma (estructura y ranking):** `scripts/verificar_act26c_vs_base.py` calcula directamente del Excel, para cada área y año, el % de mujeres, el % de hombres, la población de 65 y más y su %, los 5 municipios más y menos poblados y la posición de cada municipio. Luego lo compara con el servicio real de la plataforma. Resultado: 2,430 comparaciones y 0 diferencias.
2. **Comparativo (ACT26b), vuelto a ejecutar:** 2,185 comparaciones y 0 diferencias.
3. **Contenido de los PDF:** la prueba de navegador hace clic en el botón visible, guarda el archivo, lo lee con `pdf-parse` y busca todas las cifras esperadas, calculadas solo del Excel: total, mujeres, hombres, 65 y más, porcentajes, la serie 2017–2026, el comparativo con sus diferencias y el ranking. También verifica:
    - Las frases obligatorias: encabezado, título, fuente, interpretación, notas y fecha.
    - Los avisos de lo que no aplica.
    - Que CONAPO solo aparezca para negar la atribución.
4. **Escenarios del PDF probados:**
    - Estado 2026 con el comparativo 2022–2026.
    - JS 4 Jalpan 2026 con un solo año en el comparativo.
    - Landa de Matamoros 2017 sin comparativo.
    - El PDF del estado generado también desde tableta y teléfono.
5. **No se suman años:** cada barra del comparativo y cada fila de la evolución es la población de su propio año (pruebas jsdom y de navegador). La suma de las barras por sexo y edad es igual al total del año de referencia (2,700,978 en 2026).
6. **Computadora y teléfono:**
    - Sin desplazamiento horizontal a 1440, 820 y 390 px.
    - Ranking con 5 municipios.
    - Comparativo en barras horizontales en teléfono.
    - PDF descargable en los tres tamaños.
    - En teléfono, la barra superior de esta página se ajusta para que el título no se encime con las pestañas. El ajuste vive solo en el CSS del módulo; no se tocó la hoja global.
7. **Regresión:**
    - Pestaña ASIS 2025: total 2,655,609, 80 localidades y su pirámide sin cambios.
    - Las 7 pruebas jsdom de los demás módulos pasan.
    - Las 8 pantallas cargan sin errores.
    - Los datos regenerados son idénticos a los de ACT26b, salvo la fecha de generación.

## 4. Archivos

- **Nuevos:**
    - `modules/poblacionReportePDF.js` (generador del PDF)
    - `scripts/verificar_act26c_vs_base.py`
    - `docs/REPORTE_VALIDACION_ACT26c.md`
    - `docs/capturas_act26c/` (capturas y PDF de ejemplo y de prueba)
- **Modificados (solo de la sección SUIVE):**
    - `pages/poblacion.html`: tarjetas, gráfica por sexo y edad, ranking, botón, scripts de jsPDF y notas.
    - `modules/poblacionHistoricaModuleView.js`
    - `services/poblacionHistoricaDataService.js`: `getEstructura` y `getRanking`, ambas nuevas.
    - `components/pyramidChart.js`: `SNSP_renderBarrasSexoEdad` y `SNSP_renderRankingMunicipal`, ambas nuevas, más la opción `paraPDF` en las gráficas existentes.
    - `styles/poblacion-historica.css`
    - Las pruebas, `config/config.js` (historial de cambios) y `README.md`.
- **Sin cambios:**
    - `components/charts.js`.
    - Las secciones ASIS 2025, CACU, Mama, Morbilidad, Canal endémico, Carga y Dashboard.
    - Login, usuarios y roles.
- Las capturas anteriores (`docs/capturas_act26/`) se sustituyeron por `docs/capturas_act26c/`.

## 5. Limitaciones conocidas

- **Conexión:** el PDF necesita la librería jsPDF, que se carga desde el CDN igual que Chart.js. Sin conexión no se genera; el tablero muestra un mensaje de error y no simula la descarga.
- **Navegadores probados:** las pruebas se hicieron en Chromium, con tamaños de pantalla de computadora, tableta y teléfono simulados. No se probó en Safari ni en un iPhone o Android físico.
- **Gráficas y mapa en el PDF:** se insertan como imágenes, no editables. El mapa usa la geometría simplificada para web, no sirve para mediciones y requiere un navegador moderno (Path2D); si no está disponible, el PDF lo indica y continúa.
- **Tipografía del PDF:** se usa Helvetica, la fuente integrada de jsPDF, en lugar de la tipografía del tablero.
- **Logotipo:** se carga del servidor. Si la página se abre como archivo local (sin servidor), el PDF se genera sin logotipo.
- **Fecha de generación:** se toma del reloj del dispositivo.
- **Interpretación descriptiva:** se arma con plantillas a partir de las cifras. No sustituye el análisis epidemiológico ni explica causas.
- **Pendientes de versiones anteriores:**
    - Confirmar la procedencia y la fuente metodológica de la base.
    - Actualizar `pages/metodologia.html`.
    - Revisar si los formateadores de etiquetas de otros módulos se ven afectados por el mismo comportamiento de Chart.js que se corrigió en ACT26.

## 6. Cómo probar

1. En la carpeta raíz: `python3 -m http.server 8080`. Abrir `http://localhost:8080`, iniciar sesión y entrar a **Población**.
2. Elegir el año, el área y los años del comparativo, y pulsar **Descargar reporte poblacional**.
3. **Pruebas automáticas:**
    - `node scripts/test_poblacion_historica_jsdom.js`
    - `python3 scripts/verificar_act26c_vs_base.py`
    - `python3 scripts/verificar_comparativo_vs_base.py`
    - Con el servidor en el puerto 8099: `SNSP_BASE=http://127.0.0.1:8099 node playwright_check_act26_poblacion.js docs/capturas_act26c`
