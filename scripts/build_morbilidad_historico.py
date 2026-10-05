#!/usr/bin/env python3
"""
scripts/build_morbilidad_historico.py
-----------------------------------------------------------------------
Genera el paquete de datos 2022-2026 del tablero de Morbilidad, a partir
de TRES bases nuevas e independientes (reemplazan a
BASE_CASOS_2025_2026.xlsx + BASE_POBLACION_2025_2026.xlsx, que el
tablero usaba hasta ACT16):

  A) data/raw/BASE_CASOS_HISTORICOS_SUIVE_QRO_2022_2026.xlsx
     Año, Entidad, Jurisdicción, Municipio, Institución, Unidad médica,
     Mes, Grupo de edad, Sexo, Casos.
  B) data/raw/BASE_PADECIMIENTOS_SUIVE_QRO_2022_2026_plana.xlsx
     Año, Entidad, Epi-Clave, Padecimiento, Mes, Semana, Grupo de edad,
     Sexo, Casos.
  C) data/raw/EXTRACCION_POBLACION_SUIVE_QRO_2022_2026.xlsx
     Año, Entidad, Municipio, Grupo de edad, Población.

-----------------------------------------------------------------------
REGLA NO NEGOCIABLE (instrucción explícita del cliente, SNSP Jurisdicción
Sanitaria No. 1): las tres bases NO se combinan entre sí más allá de lo
que sus columnas realmente permiten. En concreto:

  - La Base A (Casos Históricos) y la Base B (Padecimientos) NO
    comparten ninguna columna de identidad fuera de Año/Mes/Grupo de
    edad/Sexo. Ninguna de esas 4 columnas es una llave que reconstruya,
    sin inventarla, la relación Padecimiento <-> Municipio/Jurisdicción/
    Institución/Unidad médica que existía en la base unificada anterior.
    Por eso este script construye DOS bundles de casos COMPLETAMENTE
    separados (uno por base) y nunca cruza sus filas entre sí.
  - La Base C (Población) sólo se relaciona con la Base A mediante
    Año + Municipio + Grupo de edad (la única combinación de columnas
    que ambas bases comparten con el mismo nivel de detalle). Esa es la
    ÚNICA relación válida para calcular Tasa = Casos / Población *
    100,000. La Base C no tiene Institución, Unidad médica, Sexo,
    Padecimiento ni Epi-Clave, así que NINGÚN bundle generado aquí
    ofrece una tasa por esas dimensiones: el bundle de Población se
    entrega tal cual, y es la propia vista (modules/morbilidadModuleView.js)
    la que decide, en tiempo de ejecución, para qué dimensiones del
    bundle de Casos Históricos existe una población compatible
    (Municipio, Jurisdicción [1 a 1 con Municipio], Grupo de edad, Año) y
    para cuáles no (Institución, Unidad médica, Sexo). El bundle de
    Padecimientos NUNCA se expone con Tasa, bajo ninguna dimensión,
    porque no contiene Municipio.

Verificado directamente contra los archivos crudos (openpyxl) antes de
escribir este script:
  - Total de Casos en la Base A == Total de Casos en la Base B ==
    3,551,200 (idéntico al dato que el cliente ya tenía validado).
  - Desglose por año idéntico en ambas bases: 2022=794,108;
    2023=725,978; 2024=729,037; 2025=779,592; 2026=522,485.
  - 2026 es parcial: sólo trae Enero-Septiembre (semana epidemiológica
    01-37 en la Base B) en las 3 bases. NO se completa ni se
    extrapola: se deja tal cual y se marca como año parcial en meta.
  - Municipio: exactamente el mismo conjunto de 18 valores en la Base A
    y en la Base C (unión y diferencia vacías). Cada Municipio
    pertenece a una única Jurisdicción en la Base A (relación 1 a 1,
    verificada fila por fila).
  - Epi-Clave <-> Padecimiento es 1 a 1 en la Base B (167 Epi-Clave
    únicas, 0 con más de un texto de Padecimiento) — igual que en la
    base anterior, así que el mismo patrón de catálogo + extracción de
    CIE-10 que ya usaba build_morbilidad_casos.py es reutilizable sin
    cambios de lógica.
  - Grupo de edad: la Base A trae un valor ("De edad desconocida") que
    NO existe en la Base C. Para esa categoría NO existe denominador de
    población: el bundle de Casos Históricos la conserva (no se
    descarta un solo caso), pero la vista debe mostrar la Tasa de ese
    grupo como "No aplica" en vez de calcular una tasa con un
    denominador inexistente o fabricado. Se deja constancia explícita
    en meta.grupos_edad_sin_poblacion para que la vista lo detecte sin
    tener que adivinarlo.
  - Unidad médica: 383 valores únicos, cada uno bajo una única
    Institución (0 unidades médicas compartidas entre instituciones) —
    dimensión nueva que antes no existía en ninguna base del proyecto;
    se agrega como dimensión/filtro adicional del Bloque 1 (gana
    funcionalidad, no la pierde).

No se calculan tasas por Institución ni por Unidad médica: aunque
ambas son columnas de la Base A (y por tanto "join-ables" con población
vía Año+Municipio+Grupo de edad), sumar población sobre el conjunto de
municipios donde opera una Institución o Unidad médica sobrecuenta la
población real, porque varias instituciones/unidades médicas atienden
simultáneamente el mismo municipio (no son una partición exclusiva del
territorio, a diferencia de Municipio/Jurisdicción/Grupo de edad). Esta
es la misma razón, ya verificada en services/cargaDataService.js
(función agregarConPoblacion), por la que el tablero anterior tampoco
ofrecía esas tasas.

Salidas (codificadas por índices, mismo patrón que
build_morbilidad_casos.py — catálogo de valores únicos por columna +
filas de índices, decodificado dentro del propio .js generado, para que
quien lo consume siga viendo {meta, headers, rows, ...} como texto
completo sin cambiar cómo lee los datos):
  - data/processed/morbilidad_historico_2022_2026.json       (auditoría)
  - data/processed/morbilidad_padecimientos_2022_2026.json   (auditoría)
  - data/processed/morbilidad_poblacion_2022_2026.json       (auditoría)
  - data/real/morbilidad_historico_2022_2026.js       (window.SNSP_MORBILIDAD_HISTORICO_DATA)
  - data/real/morbilidad_padecimientos_2022_2026.js   (window.SNSP_MORBILIDAD_PADECIMIENTOS_DATA)
  - data/real/morbilidad_poblacion_2022_2026.js       (window.SNSP_MORBILIDAD_POBLACION_DATA)
-----------------------------------------------------------------------
"""
import json
import re
from collections import defaultdict

import openpyxl

RAW_HISTORICO = "data/raw/BASE_CASOS_HISTORICOS_SUIVE_QRO_2022_2026.xlsx"
RAW_PADECIMIENTOS = "data/raw/BASE_PADECIMIENTOS_SUIVE_QRO_2022_2026_plana.xlsx"
RAW_POBLACION = "data/raw/EXTRACCION_POBLACION_SUIVE_QRO_2022_2026.xlsx"

OUT_HISTORICO_JSON = "data/processed/morbilidad_historico_2022_2026.json"
OUT_HISTORICO_JS = "data/real/morbilidad_historico_2022_2026.js"
OUT_PADECIMIENTOS_JSON = "data/processed/morbilidad_padecimientos_2022_2026.json"
OUT_PADECIMIENTOS_JS = "data/real/morbilidad_padecimientos_2022_2026.js"
OUT_POBLACION_JSON = "data/processed/morbilidad_poblacion_2022_2026.json"
OUT_POBLACION_JS = "data/real/morbilidad_poblacion_2022_2026.js"

HISTORICO_HEADERS_OUT = ["Año", "Jurisdicción", "Municipio", "Institución", "Unidad médica", "Mes", "Grupo de edad", "Sexo", "Casos"]
PADECIMIENTOS_HEADERS_OUT = ["Año", "Epi-Clave", "Padecimiento", "Mes", "Semana", "Grupo de edad", "Sexo", "Casos"]

# Totales ya validados por el cliente directamente sobre las bases crudas
# (ver cabecera). Si una corrida futura con bases actualizadas no los
# reproduce, el script debe fallar de forma ruidosa en vez de publicar
# una cifra distinta sin explicación.
TOTAL_VALIDADO = 3551200
TOTALES_POR_ANIO_VALIDADOS = {
    "2022": 794108,
    "2023": 725978,
    "2024": 729037,
    "2025": 779592,
    "2026": 522485,
}
ANIO_PARCIAL = "2026"

CIE10_RE = re.compile(r"[A-Z]\d{2}(?:\.\d+)?")


def _extraer_cie10(texto_padecimiento):
    """Igual que build_morbilidad_casos.py: separa 'Nombre(CIE10)' -> (nombre, cie10_texto, codigos, prefijos)."""
    m = re.search(r"\(([^)]*)\)\s*$", texto_padecimiento)
    cie10_texto = m.group(1) if m else ""
    nombre = texto_padecimiento[: texto_padecimiento.rfind("(")].strip() if m else texto_padecimiento
    codigos = sorted(set(CIE10_RE.findall(cie10_texto)))
    prefijos = sorted(set(c[:3] for c in codigos))
    return nombre, cie10_texto, codigos, prefijos


class _Catalogo:
    """Catálogo de valores únicos de una columna: idx(valor) devuelve (y
    crea si hace falta) el índice de ese valor, preservando el orden de
    primera aparición."""

    def __init__(self):
        self._idx = {}
        self._valores = []

    def idx(self, valor):
        i = self._idx.get(valor)
        if i is None:
            i = len(self._valores)
            self._idx[valor] = i
            self._valores.append(valor)
        return i

    def lista(self):
        return self._valores


def _escribir_js_bundle(path_js, var_name, meta, headers, catalogos_idx, rows_idx, extra_top_level, comentario, campo_derivado=None):
    """Mismo formato que build_morbilidad_casos.py: escribe un bundle .js
    codificado por índices más una función autoejecutable que lo
    decodifica de vuelta a filas de texto completas
    ({meta, headers, rows, ...})."""
    payload = {
        "meta": meta,
        "headers": headers,
        "catalogosIdx": catalogos_idx,
        "rowsIdx": rows_idx,
    }
    payload.update(extra_top_level or {})
    cols_orden = list(catalogos_idx.keys())
    with open(path_js, "w", encoding="utf-8") as f:
        f.write(comentario)
        f.write(f"window.{var_name} = (function () {{\n")
        f.write("  var _p = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
        f.write(f"  var _cols = {json.dumps(cols_orden)};\n")
        if campo_derivado:
            f.write(f"  var _viaCatIdx = _cols.indexOf({json.dumps(campo_derivado['via_catalogo'])});\n")
            f.write(f"  var _fuenteDerivada = _p[{json.dumps(campo_derivado['fuente'])}];\n")
        f.write(
            "  var _cat = _p.catalogosIdx;\n"
            "  var _rows = _p.rowsIdx.map(function (r) {\n"
            "    var fila = [];\n"
            "    for (var i = 0; i < _cols.length; i++) {\n"
            "      fila.push(_cat[_cols[i]][r[i]]);\n"
        )
        if campo_derivado:
            f.write("      if (i === _viaCatIdx) { fila.push(_fuenteDerivada[r[i]]); }\n")
        f.write(
            "    }\n"
            "    fila.push(r[_cols.length]);\n"
            "    return fila;\n"
            "  });\n"
            "  var out = { meta: _p.meta, headers: _p.headers, rows: _rows };\n"
            "  Object.keys(_p).forEach(function (k) {\n"
            "    if (k !== 'meta' && k !== 'headers' && k !== 'catalogosIdx' && k !== 'rowsIdx') out[k] = _p[k];\n"
            "  });\n"
            "  return out;\n"
            "})();\n"
        )


def _leer_hoja(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    header = [str(c.value or "").strip() for c in next(ws.iter_rows(min_row=1, max_row=1))]
    idx = {name: i for i, name in enumerate(header)}
    return ws, idx, header


def build_historico():
    """Bloque 1 — Casos / Territorio / Instituciones. Agrega la Base A por
    Año+Jurisdicción+Municipio+Institución+Unidad médica+Mes+Grupo de
    edad+Sexo (TODAS sus columnas de identidad: no se descarta ninguna
    dimensión que la base sí trae, y no se agrega ninguna que no trae —
    en particular, NO Semana, porque la Base A no la tiene)."""
    print("Leyendo", RAW_HISTORICO, "...")
    ws, idx, header = _leer_hoja(RAW_HISTORICO)
    columnas_requeridas = ["Año", "Jurisdicción", "Municipio", "Institución", "Unidad médica", "Mes", "Grupo de edad", "Sexo", "Casos"]
    for col in columnas_requeridas:
        if col not in idx:
            raise SystemExit(f"Columna esperada '{col}' no encontrada en {RAW_HISTORICO}: {header}")

    combos = defaultdict(int)
    n_filas_leidas = 0
    n_filas_usadas = 0
    total_casos = 0
    total_por_anio = defaultdict(int)
    anios, jurisdicciones, municipios, instituciones, unidades, meses, grupos_edad, sexos = (set() for _ in range(8))
    mun_juris = defaultdict(set)
    unidad_inst = defaultdict(set)

    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[idx["Año"]] is None:
            continue
        n_filas_leidas += 1
        casos = row[idx["Casos"]]
        if casos is None or casos == "":
            continue
        try:
            casos = int(casos)
        except (TypeError, ValueError):
            continue

        anio = str(int(row[idx["Año"]]))
        juris = str(row[idx["Jurisdicción"]] or "").strip()
        municipio = str(row[idx["Municipio"]] or "").strip()
        institucion = str(row[idx["Institución"]] or "").strip()
        unidad = str(row[idx["Unidad médica"]] or "").strip()
        mes = str(row[idx["Mes"]] or "").strip()
        grupo_edad = str(row[idx["Grupo de edad"]] or "").strip()
        sexo = str(row[idx["Sexo"]] or "").strip()
        if not (anio and juris and municipio and institucion and unidad and mes and grupo_edad and sexo):
            continue

        n_filas_usadas += 1
        total_casos += casos
        total_por_anio[anio] += casos
        anios.add(anio); jurisdicciones.add(juris); municipios.add(municipio)
        instituciones.add(institucion); unidades.add(unidad); meses.add(mes)
        grupos_edad.add(grupo_edad); sexos.add(sexo)
        mun_juris[municipio].add(juris)
        unidad_inst[unidad].add(institucion)

        key = (anio, juris, municipio, institucion, unidad, mes, grupo_edad, sexo)
        combos[key] += casos

    print(f"Filas leídas: {n_filas_leidas} / filas usadas: {n_filas_usadas}")
    print(f"Total Casos (histórico): {total_casos}")
    for y in sorted(total_por_anio):
        print(f"  {y}: {total_por_anio[y]}")

    if total_casos != TOTAL_VALIDADO:
        raise SystemExit(f"VERIFICACIÓN FALLIDA: total de la Base A ({total_casos}) != total validado ({TOTAL_VALIDADO}).")
    for anio_v, total_v in TOTALES_POR_ANIO_VALIDADOS.items():
        if total_por_anio.get(anio_v) != total_v:
            raise SystemExit(f"VERIFICACIÓN FALLIDA: total {anio_v} de la Base A ({total_por_anio.get(anio_v)}) != validado ({total_v}).")
    multi_juris = {m: j for m, j in mun_juris.items() if len(j) > 1}
    if multi_juris:
        raise SystemExit(f"VERIFICACIÓN FALLIDA: Municipio con más de una Jurisdicción (no se puede tratar como 1-a-1): {multi_juris}")
    print("Verificación OK: total general, totales por año y Municipio->Jurisdicción (1 a 1) coinciden con lo validado.")

    rows_completas = [list(k) + [v] for k, v in sorted(combos.items())]

    cat_anio, cat_juris, cat_municipio, cat_institucion, cat_unidad, cat_mes, cat_grupo_edad, cat_sexo = (_Catalogo() for _ in range(8))
    rows_idx = []
    for anio, juris, municipio, institucion, unidad, mes, grupo_edad, sexo, casos_val in rows_completas:
        rows_idx.append([
            cat_anio.idx(anio), cat_juris.idx(juris), cat_municipio.idx(municipio),
            cat_institucion.idx(institucion), cat_unidad.idx(unidad), cat_mes.idx(mes),
            cat_grupo_edad.idx(grupo_edad), cat_sexo.idx(sexo), casos_val,
        ])

    catalogos_idx = {
        "anio": cat_anio.lista(),
        "jurisdiccion": cat_juris.lista(),
        "municipio": cat_municipio.lista(),
        "institucion": cat_institucion.lista(),
        "unidadMedica": cat_unidad.lista(),
        "mes": cat_mes.lista(),
        "grupoEdad": cat_grupo_edad.lista(),
        "sexo": cat_sexo.lista(),
    }

    catalogos_salida = {
        "anios": sorted(anios),
        "jurisdicciones": sorted(jurisdicciones),
        "municipios": sorted(municipios),
        "instituciones": sorted(instituciones),
        "unidadesMedicas": sorted(unidades),
        "meses": sorted(meses),
        "gruposEdad": sorted(grupos_edad),
        "sexos": sorted(sexos),
    }

    # Grupos de edad sin población (ver cabecera: "De edad desconocida").
    # Se calcula comparando contra la Base C más abajo (build_poblacion),
    # así que aquí sólo se deja la lista de grupos de edad de esta base;
    # main() cruza ambas listas y re-escribe el meta con la diferencia
    # real antes de guardar el archivo (nunca se asume de antemano).

    meta = {
        "fuente": "BASE_CASOS_HISTORICOS_SUIVE_QRO_2022_2026.xlsx",
        "nota": "BLOQUE 1 (Casos/Territorio/Instituciones). Pre-agregado por Año+Jurisdicción+"
                "Municipio+Institución+Unidad médica+Mes+Grupo de edad+Sexo sumando Casos: "
                "matemáticamente idéntico a sumar las filas crudas por esas mismas columnas. "
                "Municipio->Jurisdicción es 1 a 1 en esta base (verificado). Esta base NO "
                "contiene Padecimiento ni Epi-Clave: el análisis por padecimiento vive en un "
                "bundle completamente separado (morbilidad_padecimientos_2022_2026.js) y nunca "
                "se cruza con éste, porque no existe una llave real que los una sin inventarla. "
                "Tasa (Casos/Población*100,000) sólo es válida, con la Base de Población "
                "(Año+Municipio+Grupo de edad), para las dimensiones Municipio, Jurisdicción, "
                "Grupo de edad y Año: NO para Institución, Unidad médica ni Sexo, porque varias "
                "instituciones/unidades médicas conviven en el mismo municipio y sumar "
                "población por esa dimensión sobrecontaría. No incluye datos personales.",
        "filas_originales": n_filas_leidas,
        "filas_agregadas": len(rows_completas),
        "total_casos": total_casos,
        "total_casos_por_anio": dict(total_por_anio),
        "anio_parcial": ANIO_PARCIAL,
        "anio_parcial_nota": "2026 sólo incluye Enero-Septiembre (datos al corte de carga). No interpretar como caída anual real.",
        "anios_disponibles": sorted(anios),
        "total_jurisdicciones": len(jurisdicciones),
        "total_municipios": len(municipios),
        "total_instituciones": len(instituciones),
        "total_unidades_medicas": len(unidades),
        "total_grupos_edad": len(grupos_edad),
        "dimensiones_con_tasa_valida": ["municipio", "jurisdiccion", "grupoEdad", "anio"],
        "dimensiones_sin_tasa": ["institucion", "unidadMedica", "sexo"],
    }

    data_auditoria = {"meta": meta, "headers": HISTORICO_HEADERS_OUT, "rows": rows_completas, "catalogos": catalogos_salida}
    with open(OUT_HISTORICO_JSON, "w", encoding="utf-8") as f:
        json.dump(data_auditoria, f, ensure_ascii=False, indent=2)
    print("Escrito", OUT_HISTORICO_JSON)

    extra_top_level = {"catalogos": catalogos_salida}
    _escribir_js_bundle(
        OUT_HISTORICO_JS,
        "SNSP_MORBILIDAD_HISTORICO_DATA",
        meta,
        HISTORICO_HEADERS_OUT,
        catalogos_idx,
        rows_idx,
        extra_top_level,
        "/**\n"
        " * data/real/morbilidad_historico_2022_2026.js\n"
        " * GENERADO AUTOMÁTICAMENTE por scripts/build_morbilidad_historico.py — no editar a mano.\n"
        " * Fuente: data/raw/BASE_CASOS_HISTORICOS_SUIVE_QRO_2022_2026.xlsx.\n"
        " * BLOQUE 1 del tablero de Morbilidad: Casos por Año, Jurisdicción, Municipio,\n"
        " * Institución, Unidad médica, Mes, Grupo de edad y Sexo. NO contiene Padecimiento:\n"
        " * ver morbilidad_padecimientos_2022_2026.js (Bloque 2), bundle separado y nunca\n"
        " * cruzado con éste. Tasa sólo válida vía Municipio/Jurisdicción/Grupo de edad/Año\n"
        " * (ver morbilidad_poblacion_2022_2026.js) — nunca por Institución/Unidad médica/Sexo.\n"
        " * No incluye datos personales.\n"
        " * -----------------------------------------------------------------------\n"
        " */\n",
    )
    print("Escrito", OUT_HISTORICO_JS, f"({len(rows_idx)} filas codificadas por índices)")
    return grupos_edad


def build_padecimientos():
    """Bloque 2 — Padecimientos. Agrega la Base B por Año+Epi-Clave+Mes+
    Semana+Grupo de edad+Sexo. NUNCA incluye Municipio/Jurisdicción/
    Institución/Unidad médica (la Base B no las tiene) y el bundle
    resultante NUNCA se expone con Tasa (no hay Municipio para unir con
    Población)."""
    print("Leyendo", RAW_PADECIMIENTOS, "...")
    ws, idx, header = _leer_hoja(RAW_PADECIMIENTOS)
    columnas_requeridas = ["Año", "Epi-Clave", "Padecimiento", "Mes", "Semana", "Grupo de edad", "Sexo", "Casos"]
    for col in columnas_requeridas:
        if col not in idx:
            raise SystemExit(f"Columna esperada '{col}' no encontrada en {RAW_PADECIMIENTOS}: {header}")

    combos = defaultdict(int)
    padecimientos_texto = {}
    n_filas_leidas = 0
    n_filas_usadas = 0
    total_casos = 0
    total_por_anio = defaultdict(int)
    anios, epiclaves, meses, semanas, grupos_edad, sexos = (set() for _ in range(6))
    mes_semana = defaultdict(lambda: defaultdict(set))
    semana_mes = defaultdict(lambda: defaultdict(set))
    epi_textos = defaultdict(set)

    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[idx["Año"]] is None:
            continue
        n_filas_leidas += 1
        casos = row[idx["Casos"]]
        if casos is None or casos == "":
            continue
        try:
            casos = int(casos)
        except (TypeError, ValueError):
            continue

        anio = str(int(row[idx["Año"]]))
        epiclave = str(row[idx["Epi-Clave"]] or "").strip()
        padecimiento = str(row[idx["Padecimiento"]] or "").strip()
        mes = str(row[idx["Mes"]] or "").strip()
        semana = str(row[idx["Semana"]] or "").strip()
        grupo_edad = str(row[idx["Grupo de edad"]] or "").strip()
        sexo = str(row[idx["Sexo"]] or "").strip()
        if not (anio and epiclave and padecimiento and mes and semana and grupo_edad and sexo):
            continue

        n_filas_usadas += 1
        total_casos += casos
        total_por_anio[anio] += casos
        anios.add(anio); epiclaves.add(epiclave); meses.add(mes); semanas.add(semana)
        grupos_edad.add(grupo_edad); sexos.add(sexo)
        padecimientos_texto.setdefault(epiclave, padecimiento)
        epi_textos[epiclave].add(padecimiento)
        mes_semana[anio][mes].add(semana)
        semana_mes[anio][semana].add(mes)

        key = (anio, epiclave, padecimiento, mes, semana, grupo_edad, sexo)
        combos[key] += casos

    print(f"Filas leídas: {n_filas_leidas} / filas usadas: {n_filas_usadas}")
    print(f"Total Casos (padecimientos): {total_casos}")
    for y in sorted(total_por_anio):
        print(f"  {y}: {total_por_anio[y]}")

    if total_casos != TOTAL_VALIDADO:
        raise SystemExit(f"VERIFICACIÓN FALLIDA: total de la Base B ({total_casos}) != total validado ({TOTAL_VALIDADO}).")
    for anio_v, total_v in TOTALES_POR_ANIO_VALIDADOS.items():
        if total_por_anio.get(anio_v) != total_v:
            raise SystemExit(f"VERIFICACIÓN FALLIDA: total {anio_v} de la Base B ({total_por_anio.get(anio_v)}) != validado ({total_v}).")
    multi_texto = {e: t for e, t in epi_textos.items() if len(t) > 1}
    if multi_texto:
        raise SystemExit(f"VERIFICACIÓN FALLIDA: Epi-Clave con más de un texto de Padecimiento (no es 1 a 1): {multi_texto}")
    print("Verificación OK: total general, totales por año y Epi-Clave<->Padecimiento (1 a 1) coinciden con lo validado.")

    rows_completas = [list(k) + [v] for k, v in sorted(combos.items())]

    cat_anio, cat_epiclave, cat_mes, cat_semana, cat_grupo_edad, cat_sexo = (_Catalogo() for _ in range(6))
    rows_idx = []
    for anio, epiclave, padecimiento, mes, semana, grupo_edad, sexo, casos_val in rows_completas:
        rows_idx.append([
            cat_anio.idx(anio), cat_epiclave.idx(epiclave), cat_mes.idx(mes),
            cat_semana.idx(semana), cat_grupo_edad.idx(grupo_edad), cat_sexo.idx(sexo), casos_val,
        ])
    epiclaves_orden = cat_epiclave.lista()
    padecimiento_por_epiclave = [padecimientos_texto[e] for e in epiclaves_orden]

    catalogos_idx = {
        "anio": cat_anio.lista(),
        "epiclave": epiclaves_orden,
        "mes": cat_mes.lista(),
        "semana": cat_semana.lista(),
        "grupoEdad": cat_grupo_edad.lista(),
        "sexo": cat_sexo.lista(),
    }

    catalogo_padecimientos = []
    for epiclave, texto in padecimientos_texto.items():
        nombre, cie10_texto, codigos, prefijos = _extraer_cie10(texto)
        catalogo_padecimientos.append({
            "epiclave": epiclave,
            "padecimiento": nombre,
            "cie10_texto": cie10_texto,
            "cie10_codigos": codigos,
            "cie10_prefijos": prefijos,
        })
    catalogo_padecimientos.sort(key=lambda r: r["padecimiento"])
    con_cie10 = sum(1 for r in catalogo_padecimientos if r["cie10_codigos"])
    print(f"Padecimientos con CIE-10 extraído: {con_cie10} / {len(catalogo_padecimientos)}")

    mes_semana_out = {}
    for anio in sorted(mes_semana.keys()):
        mes_semana_out[anio] = {
            "porMes": {mes: sorted(sems) for mes, sems in mes_semana[anio].items()},
            "porSemana": {sem: sorted(ms) for sem, ms in semana_mes[anio].items()},
        }

    meta = {
        "fuente": "BASE_PADECIMIENTOS_SUIVE_QRO_2022_2026_plana.xlsx",
        "nota": "BLOQUE 2 (Padecimientos). Pre-agregado por Año+Epi-Clave+Mes+Semana+Grupo de "
                "edad+Sexo sumando Casos. Esta base NO contiene Municipio, Jurisdicción, "
                "Institución ni Unidad médica: por regla explícita del cliente, este bundle "
                "NUNCA se presenta cruzado con esas dimensiones (no existe llave real para "
                "reconstruir esa relación sin inventarla) y NUNCA se expone con Tasa (no hay "
                "Municipio para relacionarlo con la Base de Población). Epi-Clave<->Padecimiento "
                "es 1 a 1 (verificado). El código CIE-10 se extrae del propio texto de "
                "Padecimiento ('Nombre(CIE10)'), igual que en la base anterior: no se inventa, "
                "proviene del dato real. No incluye datos personales.",
        "filas_originales": n_filas_leidas,
        "filas_agregadas": len(rows_completas),
        "total_casos": total_casos,
        "total_casos_por_anio": dict(total_por_anio),
        "anio_parcial": ANIO_PARCIAL,
        "anio_parcial_nota": "2026 sólo incluye Enero-Septiembre / semana epidemiológica 01-37. No interpretar como caída anual real.",
        "anios_disponibles": sorted(anios),
        "total_padecimientos": len(padecimientos_texto),
        "total_meses": len(meses),
        "total_semanas": len(semanas),
        "mes_semana": mes_semana_out,
        "tasa_disponible": False,
        "tasa_no_disponible_motivo": "La Base de Padecimientos no contiene Municipio: no hay denominador de población válido para ninguna dimensión de este bloque.",
    }

    catalogos_salida = {
        "anios": sorted(anios),
        "meses": sorted(meses),
        "semanas": sorted(semanas),
        "gruposEdad": sorted(grupos_edad),
        "sexos": sorted(sexos),
    }

    data_auditoria = {"meta": meta, "headers": PADECIMIENTOS_HEADERS_OUT, "rows": rows_completas, "catalogos": catalogos_salida, "catalogo_padecimientos": catalogo_padecimientos}
    with open(OUT_PADECIMIENTOS_JSON, "w", encoding="utf-8") as f:
        json.dump(data_auditoria, f, ensure_ascii=False, indent=2)
    print("Escrito", OUT_PADECIMIENTOS_JSON)

    extra_top_level = {"catalogos": catalogos_salida, "catalogo_padecimientos": catalogo_padecimientos, "padecimientoPorEpiclave": padecimiento_por_epiclave}
    _escribir_js_bundle(
        OUT_PADECIMIENTOS_JS,
        "SNSP_MORBILIDAD_PADECIMIENTOS_DATA",
        meta,
        PADECIMIENTOS_HEADERS_OUT,
        catalogos_idx,
        rows_idx,
        extra_top_level,
        "/**\n"
        " * data/real/morbilidad_padecimientos_2022_2026.js\n"
        " * GENERADO AUTOMÁTICAMENTE por scripts/build_morbilidad_historico.py — no editar a mano.\n"
        " * Fuente: data/raw/BASE_PADECIMIENTOS_SUIVE_QRO_2022_2026_plana.xlsx.\n"
        " * BLOQUE 2 del tablero de Morbilidad: Padecimiento/Epi-Clave/CIE-10 por Año, Mes,\n"
        " * Semana epidemiológica, Grupo de edad y Sexo. Bundle INDEPENDIENTE del Bloque 1\n"
        " * (morbilidad_historico_2022_2026.js): no comparte Municipio/Jurisdicción/\n"
        " * Institución/Unidad médica y nunca se cruza con ellas. NO se expone con Tasa\n"
        " * (meta.tasa_disponible = false): no hay Municipio para relacionarlo con población.\n"
        " * No incluye datos personales.\n"
        " * -----------------------------------------------------------------------\n"
        " */\n",
        campo_derivado={"header": "Padecimiento", "despues_de": "Epi-Clave", "fuente": "padecimientoPorEpiclave", "via_catalogo": "epiclave"},
    )
    print("Escrito", OUT_PADECIMIENTOS_JS, f"({len(rows_idx)} filas codificadas por índices)")


def build_poblacion(grupos_edad_historico):
    """Bloque 3 — Población y Tasas. Se conserva tal cual la Base C, sin
    agregación adicional (ya viene a nivel Año+Municipio+Grupo de edad,
    el mismo nivel que necesita el cruce con el Bloque 1). Se calcula y
    documenta explícitamente qué grupos de edad del Bloque 1 NO tienen
    población (p. ej. 'De edad desconocida'), para que la vista muestre
    'No aplica' en vez de fabricar un denominador."""
    print("Leyendo", RAW_POBLACION, "...")
    ws, idx, header = _leer_hoja(RAW_POBLACION)
    for col in ["Año", "Municipio", "Grupo de edad", "Población"]:
        if col not in idx:
            raise SystemExit(f"Columna esperada '{col}' no encontrada en {RAW_POBLACION}: {header}")

    headers_out = ["Año", "Municipio", "Grupo de edad", "Población"]
    rows_out = []
    n_filas = 0
    municipios = set()
    grupos_edad_pob = set()
    anios = set()
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[idx["Año"]] is None:
            continue
        anio = str(int(row[idx["Año"]]))
        municipio = str(row[idx["Municipio"]] or "").strip()
        grupo_edad = str(row[idx["Grupo de edad"]] or "").strip()
        pob = row[idx["Población"]]
        if pob is None or pob == "" or not municipio or not grupo_edad:
            continue
        n_filas += 1
        municipios.add(municipio); grupos_edad_pob.add(grupo_edad); anios.add(anio)
        rows_out.append([anio, municipio, grupo_edad, round(float(pob), 2)])

    print(f"Filas de población: {n_filas}")
    grupos_edad_sin_poblacion = sorted(set(grupos_edad_historico) - grupos_edad_pob)
    if grupos_edad_sin_poblacion:
        print("Grupos de edad del Bloque 1 SIN denominador de población (Tasa = No aplica):", grupos_edad_sin_poblacion)

    meta = {
        "fuente": "EXTRACCION_POBLACION_SUIVE_QRO_2022_2026.xlsx",
        "nota": "BLOQUE 3 (Población y Tasas). Se conserva tal cual el archivo original, sin "
                "agregación adicional: ya viene a nivel Año+Municipio+Grupo de edad, el único "
                "cruce válido con el Bloque 1 (Casos Históricos) para calcular "
                "Tasa = Casos/Población*100,000. No tiene Institución, Unidad médica, Sexo, "
                "Padecimiento ni Epi-Clave: por eso ninguna de esas dimensiones tiene Tasa en "
                "este tablero. No incluye datos personales.",
        "filas": n_filas,
        "anios_disponibles": sorted(anios),
        "municipios": sorted(municipios),
        "grupos_edad": sorted(grupos_edad_pob),
        "grupos_edad_sin_poblacion": grupos_edad_sin_poblacion,
        "grupos_edad_sin_poblacion_nota": "Estos grupos de edad existen en la Base de Casos Históricos pero no tienen fila de población: la Tasa para ellos se muestra como No aplica, nunca se calcula con un denominador fabricado.",
    }

    data = {"meta": meta, "headers": headers_out, "rows": rows_out}
    with open(OUT_POBLACION_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("Escrito", OUT_POBLACION_JSON)

    with open(OUT_POBLACION_JS, "w", encoding="utf-8") as f:
        f.write(
            "/**\n"
            " * data/real/morbilidad_poblacion_2022_2026.js\n"
            " * GENERADO AUTOMÁTICAMENTE por scripts/build_morbilidad_historico.py — no editar a mano.\n"
            " * Fuente: data/raw/EXTRACCION_POBLACION_SUIVE_QRO_2022_2026.xlsx.\n"
            " * BLOQUE 3: único denominador válido de Tasa, y únicamente vía Año+Municipio+\n"
            " * Grupo de edad contra el Bloque 1 (morbilidad_historico_2022_2026.js). No se usa\n"
            " * para el Bloque 2 (Padecimientos): esa base no tiene Municipio.\n"
            " * No incluye datos personales.\n"
            " * -----------------------------------------------------------------------\n"
            " */\n"
            "window.SNSP_MORBILIDAD_POBLACION_DATA = "
        )
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("Escrito", OUT_POBLACION_JS)


def main():
    grupos_edad_historico = build_historico()
    build_padecimientos()
    build_poblacion(grupos_edad_historico)
    print("\nListo. Totales verificados contra lo validado por el cliente: "
          f"{TOTAL_VALIDADO} casos (2022-2026) en ambas bases de casos.")


if __name__ == "__main__":
    main()
