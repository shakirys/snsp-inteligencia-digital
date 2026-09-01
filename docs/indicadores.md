# Indicadores — implementados y no implementados

## Implementados

### Módulo CACU
| Indicador | Fuente(s) |
|---|---|
| Total de casos confirmados (filtrable por entidad) | casos_confirmados_CaCu_2025.csv |
| Distribución de casos por entidad + % | casos_confirmados_CaCu_2025.csv |
| Distribución por resultado histopatológico (por código) | casos_confirmados_CaCu_2025.csv |
| Distribución por plan de tratamiento | casos_confirmados_CaCu_2025.csv |
| Total de citologías convencionales | citologias_2025.csv |
| Distribución de resultados — citología convencional | citologias_2025.csv |
| Total de citologías en base líquida | CITOLOGIA_BASE_LIQUIDA_2025.csv |
| Distribución de resultados — citología en base líquida | CITOLOGIA_BASE_LIQUIDA_2025.csv |
| Total de pruebas PCR para VPH | PCR_2025.csv |
| Distribución de resultados PCR | PCR_2025.csv |
| Mapa nacional de casos confirmados por entidad | casos_confirmados_CaCu_2025.csv |
| Ranking de entidades por casos confirmados | casos_confirmados_CaCu_2025.csv |

### Módulo Cáncer de mama
| Indicador | Fuente(s) |
|---|---|
| Total de casos confirmados (filtrable por entidad) | casos_confirmados_CaMa_2025.csv |
| Distribución de casos por entidad + % | casos_confirmados_CaMa_2025.csv |
| Distribución por resultado histopatológico | casos_confirmados_CaMa_2025.csv |
| Distribución por plan de tratamiento | casos_confirmados_CaMa_2025.csv |
| Total de mastografías | mastografias_2025.csv |
| Distribución de resultados de mastografía | mastografias_2025.csv |
| Mapa nacional de casos confirmados por entidad | casos_confirmados_CaMa_2025.csv |
| Ranking de entidades por casos confirmados | casos_confirmados_CaMa_2025.csv |

### Dashboard general
| Indicador | Fuente(s) |
|---|---|
| Totales nacionales CACU y Mama | ambos módulos |
| Comparativo de casos por entidad, CACU vs. Mama | ambos módulos |
| Volumen de pruebas por tipo (citología convencional, base líquida, PCR, mastografía) | 4 bases de prueba |

## No implementados (y motivo)

| Indicador | Motivo |
|---|---|
| Incidencia (x100,000) | No hay población de referencia por entidad en ninguna base |
| Cobertura de tamizaje | No hay padrón de población objetivo |
| Mortalidad | Ninguna base trae defunciones |
| Tendencia temporal / comparativo por año | No hay columna de fecha o año por registro (el "2025" sólo está en el nombre del archivo) |
| Desglose por municipio, jurisdicción, institución, CLUES, unidad médica | Esas columnas no existen en las 6 bases |
| Desglose por edad o sexo | Esas columnas no existen en las 6 bases |
| Nombre real del resultado histopatológico de CACU (sólo hay "Código N") | Falta el catálogo oficial de equivalencias de los códigos 6, 7, 8, 9, 10, 11, 13 |
| Vinculación paciente↔prueba entre citología, PCR y caso confirmado | No hay folio/ID de paciente en ninguna base |
| Exportación real a PDF/Excel | Pendiente de implementar (botones visibles y deshabilitados, marcados "(pendiente)"; nunca se simula una descarga) |
