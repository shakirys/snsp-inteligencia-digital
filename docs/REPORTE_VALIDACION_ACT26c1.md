# Reporte de validación — ACT26c.1 (correcciones de cierre)

**SNSP Inteligencia Digital · Módulo Población · Versión 2.7.0 (versión de pruebas)**
Fecha: 27 de octubre de 2026 · Copia de trabajo: ACT26c → ACT26c.1

> Versión de pruebas: no se publicó en GitHub ni se modificó producción. Complementa `docs/REPORTE_VALIDACION_ACT26c.md` y `docs/REPORTE_VALIDACION_ACT26.md`, cuyas pruebas se volvieron a ejecutar.

## 1. Resumen

| Concepto | Resultado |
|---|---|
| Excel contra la plataforma: estructura, ranking, 11 grupos con %, índices y clases del mapa (`verificar_act26c_vs_base.py`) | **13,110 comparaciones, 0 diferencias** |
| Excel contra la plataforma: comparativo multianual (`verificar_comparativo_vs_base.py`) | **2,185 comparaciones, 0 diferencias** |
| Cifras del PDF del Estado 2026 leídas del archivo descargado contra el Excel | **61 / 61** cifras y **5 / 5** rangos del mapa |
| Páginas del PDF | **5** en todos los escenarios probados, incluido el comparativo con los 10 años |
| Prueba jsdom de la sección | **127 / 127 OK** |
| Pruebas jsdom de los demás módulos (7) | **7 / 7 OK** |
| Navegador real: escritorio, tableta y teléfono, con descarga del PDF | **178 / 178 OK** |
| Carga de las 8 pantallas de la plataforma y la pestaña ASIS | 0 errores |

## 2. Revisión previa (para no duplicar)

Antes de modificar se revisó lo que ya existía:

- **Ya existía y se reutilizó:**
    - Los índices de dependencia y envejecimiento ya se mostraban en la tarjeta de grandes grupos del tablero, pero se calculaban dentro de la vista. Se trasladaron al servicio (`getEstructura`), de modo que el tablero y el PDF usan la misma fuente.
    - Los grupos 0–14, 15–64 y 65 y más ya estaban en el servicio.
- **Problemas detectados en el mapa:**
    - Había dos clasificaciones distintas, una en el tablero y otra en el PDF.
    - Las dos usaban cortes interpolados, por eso la leyenda mostraba rangos que compartían límite: "22,791 - 34,993" y "34,993 - 70,885".
    - Las dos primeras clases eran casi iguales en color.
    - Los límites eran blancos y no se distinguían sobre los colores claros.
- **Ya existía y se corrigió:** en el PDF, la gráfica por sexo y edad omitía la mitad de las etiquetas de edad (1–4, 10–14, 20–24, 45–49 y 60–64) por el ajuste automático de Chart.js.
- **No se agregaron gráficas nuevas.** El resumen demográfico del PDF reemplaza la tabla de grandes grupos que ya estaba en la página de distribución por edad, así que no se duplica.

## 3. Mapa municipal (tablero y PDF)

- **Colores:** cinco clases institucionales con mayor contraste:
    - `#F2E6C2` (beige)
    - `#D9B867` (dorado claro)
    - `#A57F2C` (dorado)
    - `#9B2247` (rojo claro)
    - `#4A0B24` (vino oscuro)

    Los pasos de luminosidad CIELAB entre clases van de 15 a 21 (antes, de 13 a 23), y la clase más oscura queda bien separada.

- **Límites:** doble trazo, blanco más gris oscuro, visible sobre cualquiera de los cinco colores.
- **Selección:** el municipio o la jurisdicción seleccionados llevan halo blanco y contorno oscuro; el municipio incluye su nombre. Se conserva el mapa estatal completo, con el resto atenuado.
- **Intervalos sin ambigüedad:**
    - Las clases son quintiles por rango (4, 4, 3, 4 y 3 municipios).
    - Cada clase se describe con los valores mínimo y máximo reales de sus municipios, así que los rangos no se traslapan ni comparten límites.
    - Ejemplo 2026: 288,481 a 1,243,610 · 71,324 a 245,855 · 48,563 a 70,775 · 28,067 a 36,462 · 7,789 a 19,273.
- **Leyenda:**
    - Tablero: una columna de 14 px, ordenada de mayor a menor, con el número de municipios de cada clase; en teléfono el conteo pasa debajo del rango.
    - PDF: muestras de 18 × 14 pt y texto de 9.6 pt.
- **Una sola clasificación** (`SNSP_clasificarMunicipiosQuintiles`) para el tablero y el PDF.

## 4. Porcentajes con denominador explícito

- **Tarjetas:** "51.0% de la población total". En la fila de estructura se muestra el cálculo completo, por ejemplo "1,376,643 ÷ 2,700,978 hab. (población total)".
- **Tabla de los 11 grupos:** en el tablero es plegable y de ancho completo; en el PDF va en la página 3. Columnas:
    - Población del grupo y su % del total.
    - Hombres y mujeres, cada uno con su % dentro del grupo (ambos suman 100%).
    - Una fila Total.
    - Una nota que explica cada denominador.
- **Información emergente de la gráfica:** % del grupo de edad y % de la población total.
- **Ejemplo verificado** (25–44, 2026): 890,344 (33.0% del total). Hombres 440,118 (49.4% del grupo); mujeres 450,226 (50.6% del grupo).

## 5. Comparativo multianual

- La serie se llama ahora "Población total (mujeres + hombres)" en la gráfica, la tabla y el PDF.
- El tablero y el PDF aclaran: "son tres vistas de la misma población, no tres poblaciones independientes; no deben sumarse entre sí".

## 6. Reporte ejecutivo PDF

| Página | Contenido |
|---|---|
| 1 | Encabezado, ficha de consulta, tarjetas (con denominador), interpretación descriptiva (conservada) y **recuadro de resumen demográfico**: 0–14, 15–64 y 65 y más (cantidad y %), índice de dependencia e índice de envejecimiento, con sus definiciones. |
| 2 | Territorio: mapa corregido, más grande, con leyenda legible, y ranking municipal (tablas a 9 pt). |
| 3 | Gráfica por sexo y edad con los 11 grupos siempre rotulados, más la tabla de los 11 grupos con denominadores. |
| 4 | Evolución 2017–2026: gráfica más grande y tabla a 9.6 pt, con el año de referencia resaltado. |
| 5 | Comparativo con la aclaración sobre el total, más la fuente y las notas metodológicas (compactadas). |

- **Gráficas:** se generan a un tamaño menor y se escalan, así que sus etiquetas salen más grandes en el PDF (≈ 8.5 pt contra ≈ 6.5 pt antes).
- **Se mantienen:** encabezados, pies de página, colores institucionales y la interpretación automática de la página 1.
- **La interpretación ya no repite literalmente el recuadro:** la línea de estructura ahora expresa la dependencia en forma narrativa.
- **Páginas por escenario:**
    - Estado 2026: 5.
    - JS 4 Jalpan 2026 (un año en el comparativo): 5.
    - Landa de Matamoros 2017 (sin comparativo): 5.
    - Estado, JS 2 y San Juan del Río con los 10 años en el comparativo: 5.

## 7. Rigor metodológico (sin cambios)

- Se respetan los 11 intervalos originales; no se estiman quinquenios.
- Cada barra, fila y tarjeta corresponde a un solo año; la plataforma no suma años.
- La base se identifica como "base de población utilizada en SUIVE Querétaro". CONAPO solo aparece para aclarar que no se le atribuye la base; la prueba lo verifica en cada PDF.
- ASIS 2025 sigue en su pestaña, sin cambios: total 2,655,609 y 80 localidades verificadas.

## 8. Validación realizada

1. **`verificar_act26c_vs_base.py`** calcula del Excel, para 23 áreas × 10 años:
    - % de mujeres y de hombres y la población de 65 y más.
    - Los índices de dependencia y envejecimiento.
    - Los 11 grupos: total, % del total y % de hombres y de mujeres dentro del grupo.
    - El ranking y la posición de cada municipio.
    - Las clases del mapa, con mínimo, máximo, número de municipios y ausencia de traslape.

    Lo compara con el servicio real de la plataforma: 13,110 comparaciones y 0 diferencias.

2. **PDF descargado con el botón y leído con `pdf-parse`:** aparecen todas las cifras esperadas calculadas del Excel (61 en el Estado 2026: totales, sexo, 65 y más, los 11 grupos por sexo, grandes grupos, índices, la serie, el comparativo y el ranking) y los 5 rangos del mapa. También se verifican:
    - Las frases obligatorias (resumen demográfico, denominadores, la aclaración del total).
    - Que tenga 5 páginas.
3. **Navegador** (1440, 820 y 390 px):
    - La leyenda del tablero es igual a los rangos calculados del Excel.
    - Se dibujan los 18 límites y el resalte de Corregidora.
    - La leyenda es legible (≥ 13 px).
    - La tabla de 11 grupos se ve completa en escritorio.
    - Sin desplazamiento horizontal de la página.
    - El PDF se descarga en los tres tamaños.
4. **Regresión:**
    - Comparativo, ranking, filtros, selección desde el mapa, pestaña ASIS y los 7 módulos restantes sin cambios de comportamiento.
    - Datos regenerados idénticos (solo cambia la fecha de generación).

## 9. Archivos modificados en ACT26c.1

- `components/mapaCoropleticoQro.js`: clasificación compartida, rampa, límites, resalte y leyenda.
- `modules/poblacionReportePDF.js`: distribución de páginas, mapa, resumen demográfico, tablas y notas.
- `modules/poblacionHistoricaModuleView.js`: denominadores, tabla de 11 grupos e índices desde el servicio.
- `services/poblacionHistoricaDataService.js`: `getTablaEdad` e índices en `getEstructura`.
- `components/pyramidChart.js`: etiquetas sin ajuste automático, información emergente con % del grupo y etiqueta del total.
- `pages/poblacion.html`: tarjeta plegable de 11 grupos, aclaración del comparativo y título "Resumen demográfico".
- `styles/poblacion-historica.css`
- Las pruebas, `config/config.js` y `README.md`.
- **Sin cambios:** `components/charts.js`, la pestaña ASIS y los demás módulos.

## 10. Limitaciones (vigentes)

- **Conexión:** el PDF requiere conexión para cargar jsPDF desde el CDN; si falla, el tablero muestra un mensaje de error.
- **Navegadores probados:** solo Chromium, con tamaños de pantalla simulados; no se probó en Safari ni en dispositivos físicos.
- **Formato del PDF:** las gráficas y el mapa son imágenes, la tipografía es Helvetica, y sin servidor (archivo local) se genera sin logotipo.
- **Tabla de 11 grupos en teléfono:** se desliza horizontalmente dentro de su recuadro, con aviso; la página no se desplaza.
- **Pendientes:** confirmar la procedencia de la base y actualizar `pages/metodologia.html`.
