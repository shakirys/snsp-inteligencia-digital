# Diccionario de datos — SNSP Inteligencia Digital (CACU y Cáncer de mama, 2025)

## 1. Bases originales (`data/raw/`, sin modificar)

### casos_confirmados_CaCu_2025.csv (607 registros)
| Columna | Tipo | Descripción | Valores observados |
|---|---|---|---|
| `entidad` | texto | Entidad federativa del caso | 32 entidades (con variantes de acentuación) |
| `resultado_histopatologico` | entero | Código de resultado histopatológico. **Sin catálogo de equivalencias adjunto.** | 6, 7, 8, 9, 10, 11, 13 |
| `plan_tratamiento` | texto | Tratamiento indicado | Conización con bisturí, Criocirugía, Electrocirugía, Laserterapia, Tratamiento farmacológico, Vigilancia periódica |

### casos_confirmados_CaMa_2025.csv (2,388 registros)
| Columna | Tipo | Descripción | Valores observados |
|---|---|---|---|
| `entidad` | texto | Entidad federativa del caso | 29 entidades (faltan Chiapas, Estado de México, Tlaxcala) |
| `resultado_histopatologico` | texto | Diagnóstico histopatológico | 10 categorías (Carcinoma Ductal Invasor, Carcinoma Lobulillar Invasor/in situ, Otro maligno, etc.) |
| `plan_tratamiento` | texto | Tratamiento indicado | Primario, Secundario (la base trae la errata "Primaro", corregida sólo en la capa de transformación) |

### citologias_2025.csv (246,953 registros) y CITOLOGIA_BASE_LIQUIDA_2025.csv (48,247 registros)
| Columna | Tipo | Descripción | Valores observados |
|---|---|---|---|
| `entidad` | texto | Entidad federativa de la prueba | 31–32 entidades |
| `resultado_citologico` | texto | Categoría Bethesda del resultado | 12 categorías (Negativa, ASC-US, ASC-H, AGC, lesiones de bajo/alto grado, carcinoma, adenocarcinoma, inadecuado/sin dato) — redacción con variantes menores entre las dos bases |

### PCR_2025.csv (378,141 registros)
| Columna | Tipo | Descripción | Valores observados |
|---|---|---|---|
| `entidad` | texto | Entidad federativa de la prueba | 32 entidades |
| `resultado` | texto | Resultado de PCR para VPH | Positivo, Negativo, Inadecuado |

### mastografias_2025.csv (537,218 registros)
| Columna | Tipo | Descripción | Valores observados |
|---|---|---|---|
| `entidad` | texto | Entidad federativa del estudio | 32 entidades |
| `resultado` | texto | Categoría tipo BI-RADS | 9 categorías (Benigna, Probablemente Benigna, Riesgo Intermedio/Moderado, Anormalidad Sospechosa, Altamente Sugestiva a Malignidad, etc.) |

**Ninguna de las 6 bases tiene:** fecha, folio/ID de paciente, edad, sexo,
municipio, jurisdicción, institución, CLUES, unidad médica ni año explícito
por registro (el año 2025 sólo está en el nombre del archivo).

## 2. Campos derivados por `scripts/build_data.py` (`data/processed/`, `data/real/`)

| Campo | Cómo se calcula | Dónde se usa |
|---|---|---|
| `entidad` (canónica) | Normalización de acentos + catálogo de 32 entidades INEGI | Todas las fuentes |
| `Código N` (CACU) | `"Código " + resultado_histopatologico` (el número original, sin traducir) | `cacu_casos.por_resultado_histopatologico_codigo` |
| Categoría citológica unificada | Mapa de equivalencia texto→texto entre `citologias_2025` y `CITOLOGIA_BASE_LIQUIDA_2025` | `cacu_citologias.por_resultado`, `cacu_citologia_bl.por_resultado` |
| `plan_tratamiento` corregido (CaMa) | `"Primaro"` → `"Primario"` (sólo presentación, el CSV original no se toca) | `cama_casos.por_plan_tratamiento` |
| `por_entidad` | Conteo de registros agrupado por entidad | Mapa, ranking, gráfica de barras |
| `por_resultado` / `por_plan_tratamiento` | Conteo de registros agrupado por categoría | Gráficas de distribución |
| `por_entidad_detalle` | Tabla cruzada entidad × categoría (2 o 3 dimensiones) | Permite que el filtro de entidad recalcule TODOS los desgloses sin volver a leer el CSV |
| `%` (porcentaje) | `(conteo de la categoría ÷ total del subconjunto filtrado) × 100`, redondeado a 1 decimal | Todas las tablas de ranking y tarjetas |

## 3. Qué NO se calcula (y por qué)

| Indicador | Por qué no se calcula |
|---|---|
| Incidencia (x100,000) | No hay población de referencia por entidad en estas bases |
| Cobertura de tamizaje | No hay padrón de población objetivo |
| Mortalidad | Estas bases no incluyen defunciones |
| Tendencia temporal / por año | No hay columna de fecha o año por registro |
| Indicadores por municipio, jurisdicción, institución, CLUES, edad, sexo | Esas columnas no existen en ninguna de las 6 bases |

## 4. Morbilidad — estado de Querétaro (agregado en esta versión)

### CUBOS_DE_MORBILIDAD_2025_CON_CUBOS.xlsx, hoja "Sheet 1" (201,047 registros, sin modificar)
| Columna usada | Tipo | Descripción | Valores observados |
|---|---|---|---|
| `Año` | entero | Año del registro | 2024, 2025, 2026 |
| `Entidad` | texto | Siempre "22 Queretaro" — **esta base es exclusivamente estatal** | 1 valor |
| `CLUES` | texto | Clave única de establecimiento de salud | 367 CLUES |
| `Unidad médica` | texto | Nombre de la unidad, tal como la reporta la base de morbilidad | — |
| `Institución` | texto | Institución que reporta | 7 instituciones + "-" |
| `Jurisdicción` | texto | Jurisdicción sanitaria | Querétaro, San Juan del Río, Cadereyta de Montes, Jalpan de Serra |
| `Municipio` | texto | Municipio del establecimiento | 18 municipios de Querétaro |
| `Epi-Clave` | texto | Código epidemiológico interno (SUIVE), **no es el CIE-10** | 160 valores |
| `Mes` | texto | Mes del registro, formato "01 Enero" … "12 Diciembre" | 12 meses |
| `Padecimiento` | texto | Nombre del padecimiento **con el código o rango CIE-10 entre paréntesis al final**, p. ej. `"Tumor maligno de la mama(C50)"` | 160 valores únicos |
| `Casos confirmados` | entero | Número de casos de esa combinación | — |

**No están en esta base:** sexo, grupo de edad, folio/ID de paciente,
población de referencia. No se generan ni se infieren.

### ESTABLECIMIENTO_SALUD_202601.xlsx, hoja "CLUES_202601" (uso: sólo Querétaro, 862 de 63,478 filas)
Se usa **únicamente** para complementar, por CLUES (relación 1 a 1, sin
duplicar casos), el nombre oficial de la unidad, tipo de establecimiento,
nivel de atención y estatus de operación. 365 de los 367 CLUES de
morbilidad encontraron coincidencia; los 2 restantes se muestran con el
nombre que ya trae la propia base de morbilidad.

### Microregionalización_20260210_PARA_SELECCIONAR_LA_CLUES.xlsx
**No se usa todavía.** Trae población por localidad de influencia y
CLUES — queda identificado como el candidato para, en una etapa
posterior, calcular coberturas o tasas reales. No se desarrolla en esta
prueba funcional (ver `pages/metodologia.html`).

### Campos derivados por `scripts/build_morbilidad.py`
| Campo | Cómo se calcula |
|---|---|
| Municipio / Jurisdicción / Institución (canónicos) | Corrección de acentuación y capitalización contra un catálogo fijo (igual que `build_data.py` hace con `entidad` para CACU/Mama); no se inventa ningún valor nuevo |
| `cie10_texto`, `cie10_codigos`, `cie10_prefijos` | Extraídos del texto entre paréntesis al final de `Padecimiento` con una expresión regular (`[A-Z]\d{2}(\.\d+)?`); si el padecimiento no trae paréntesis, quedan vacíos |
| `accesos_rapidos` (C50, C53, D05, D06, N87) | Búsqueda del código dentro de `cie10_codigos`/`cie10_prefijos` de los 160 padecimientos; **D05 no aparece en la base y se marca `disponible: false`** |
| `cubo` (`[epiclave, anio, municipio, jurisdiccion, institucion, clues, mes, casos]`) | Suma de `Casos confirmados` agrupada por esas 7 dimensiones (88,453 combinaciones) — permite filtrar y graficar en el navegador sin cargar las 201,047 filas originales ni recalcular tasas |

### Qué NO se calcula en Morbilidad (y por qué)
| Indicador | Por qué no se calcula |
|---|---|
| Casos por sexo / grupo de edad | Esas columnas no existen en esta base |
| Incidencia, tasas, cobertura | No hay denominador poblacional validado todavía (ver Microregionalización) |
| Comparativo nacional | La base sólo trae Querétaro; el módulo queda preparado para agregar "entidad" como dimensión cuando llegue una fuente nacional |
