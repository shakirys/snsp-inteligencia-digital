# Informe de calidad — bases oficiales 2025

## 1. Calidad de las 6 bases originales

| Base | Registros | Hallazgo | Severidad | Tratamiento |
|---|---|---|---|---|
| casos_confirmados_CaCu_2025.csv | 607 | `resultado_histopatologico` es un código numérico (6,7,8,9,10,11,13) sin catálogo de equivalencias adjunto | **Alta** — impide mostrar el nombre real del resultado | Se muestra como "Código N"; pendiente de catálogo oficial del usuario |
| casos_confirmados_CaMa_2025.csv | 2,388 | Errata de captura: `"Primaro"` en vez de `"Primario"` | Baja | Corregido sólo en presentación (capa de transformación), CSV original intacto |
| casos_confirmados_CaMa_2025.csv | 2,388 | Cobertura de entidades incompleta: faltan Chiapas, Estado de México y Tlaxcala frente a las demás bases | Media | No se rellena con ceros ficticios; esas entidades simplemente no muestran casos confirmados de mama (pueden sí tener mastografías) |
| CITOLOGIA_BASE_LIQUIDA_2025.csv | 48,247 | Un valor de categoría con carácter inválido (`\x1f` en "significado") por mala recodificación de origen | Baja | Corregido en la capa de transformación (`fix_mojibake`) |
| citologias_2025.csv vs. CITOLOGIA_BASE_LIQUIDA_2025.csv | — | Mismas 12 categorías Bethesda, redactadas con variantes menores (acentos, "sin dato" vs. "inadecuado") | Media | Se unifican a un catálogo común sólo para lectura consistente; se presentan como pruebas independientes, nunca se suman entre sí |
| Las 6 bases | — | Entre 82% y 99.8% de filas duplicadas exactamente | Ninguna (esperado) | Con sólo 2–3 columnas categóricas y sin folio de paciente, cada fila es un registro individual; los duplicados son normales, no error de carga. Se conservan todos para el conteo. |
| Las 6 bases | — | `mastografias_2025.csv` viene en codificación cp1252; el resto en utf-8 | Baja | El script de transformación detecta y normaliza la codificación automáticamente |

**Entidades no reconocidas por el catálogo canónico tras la normalización: 0**
(las 32 entidades de las 6 bases fueron mapeadas correctamente; ver `data/processed/reporte_calidad.json` para el detalle programático).

## 2. Incidencias detectadas y corregidas durante la verificación funcional

Estas dos incidencias se encontraron probando la plataforma extremo a extremo
(no sólo revisando el código), y se corrigieron antes de la entrega:

1. **Filtro de entidad no se registraba.** El módulo nuevo intentaba agregar
   la opción "Entidad federativa" escribiendo en `window.SNSP_FILTER_DEFS`,
   pero `components/filterBar.js` declara `SNSP_FILTER_DEFS` con `const` en
   el ámbito global de script clásico (no como propiedad de `window`). El
   filtro se habría renderizado vacío. *Corregido: se referencia el mismo
   identificador global compartido entre scripts.*

2. **Entidades con datos secundarios pero sin caso confirmado quedaban
   fuera del filtro.** Ej. Chiapas no tiene casos confirmados de mama en
   `casos_confirmados_CaMa_2025.csv`, pero sí 28,423 mastografías en
   `mastografias_2025.csv`. El filtro sólo listaba entidades con casos
   confirmados, así que "Chiapas" no era una opción válida del `<select>` y
   la selección se ignoraba silenciosamente (el navegador descarta un
   `value` que no corresponde a ninguna `<option>`). *Corregido: el filtro
   ahora usa la unión de entidades de todas las fuentes de cada módulo.*

Ambas se verificaron con pruebas automatizadas después del arreglo (ver
`README.md`, sección "Verificación realizada antes de entregar").

## 3. Pendiente que depende de terceros

- Catálogo oficial de códigos 6, 7, 8, 9, 10, 11, 13 de
  `resultado_histopatologico` (CACU). Sin este catálogo, ese desglose seguirá
  mostrando "Código N" en vez del nombre del diagnóstico.
