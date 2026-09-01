#!/usr/bin/env python3
"""
scripts/build_poblacion.py
-----------------------------------------------------------------------
Transforma data/raw/BASE_POBLACIONAL_ASIS_QUERETARO_2025.xlsx (hoja
"BASE POBLACIONAL ASIS") en:
  - data/processed/poblacion_2025.json   (auditoría, legible)
  - data/real/poblacion_2025.js          (window.SNSP_POBLACION_DATA)

No modifica el archivo original. Es el padrón poblacional oficial 2025,
a nivel LOCALIDAD, con población por sexo y por 4 grupos de edad
(0-9, 10-19, 20-59, 60+) — son los únicos grupos que trae esta fuente,
no se inventan quinquenales. Es exclusivamente estatal (Querétaro, sus
18 municipios y 2,192 localidades).

Este módulo es independiente de CACU/Mama/Morbilidad: no se usa aquí
como denominador de tasas (eso queda para una etapa posterior, ver
README), sino como módulo de consulta poblacional propio (pirámide,
mapa por municipio, tabla por localidad).

No se usan longitud/latitud/altitud: el mapa de la plataforma
(components/mapQueretaro.js) es ilustrativo por municipio, no
cartográfico, así que esas columnas no aportan a esta versión y no se
inventan coordenadas para un mapa que no existe todavía.
-----------------------------------------------------------------------
"""
import json
from collections import defaultdict

import openpyxl

RAW = "data/raw/BASE_POBLACIONAL_ASIS_QUERETARO_2025.xlsx"
OUT_JSON = "data/processed/poblacion_2025.json"
OUT_JS = "data/real/poblacion_2025.js"

BANDAS = ["0-9", "10-19", "20-59", "60+"]


def main():
    print("Leyendo", RAW, "...")
    wb = openpyxl.load_workbook(RAW, data_only=True)
    ws = wb["BASE POBLACIONAL ASIS"]
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    idx = {name: i for i, name in enumerate(header)}

    localidades = []  # compacto: [cvegeo, municipio, localidad, mujeres, hombres, total, m09,h09,t09, m1019,h1019,t1019, m2059,h2059,t2059, m60,h60,t60, desglose_edad_valido]
    por_municipio = defaultdict(lambda: defaultdict(int))
    municipios = set()
    total_mujeres = total_hombres = total_poblacion = 0
    total_bandas_m = {b: 0 for b in BANDAS}
    total_bandas_h = {b: 0 for b in BANDAS}
    n_localidades = 0
    n_sin_desglose_edad = 0
    poblacion_sin_desglose_edad = 0

    for r in rows[1:]:
        if not r or r[idx["Municipio"]] is None:
            continue
        cvegeo = r[idx["CVEGEO"]]
        municipio = r[idx["Municipio"]]
        localidad = r[idx["Localidad"]]
        mujeres = r[idx["Mujeres 2025"]] or 0
        hombres = r[idx["Hombres 2025"]] or 0
        total = r[idx["Población total 2025"]] or 0
        m09 = r[idx["Mujeres 0-9"]] or 0
        h09 = r[idx["Hombres 0-9"]] or 0
        m1019 = r[idx["Mujeres 10-19"]] or 0
        h1019 = r[idx["Hombres 10-19"]] or 0
        m2059 = r[idx["Mujeres 20-59"]] or 0
        h2059 = r[idx["Hombres 20-59"]] or 0
        m60 = r[idx["Mujeres 60+"]] or 0
        h60 = r[idx["Hombres 60+"]] or 0

        n_localidades += 1
        municipios.add(municipio)
        total_mujeres += mujeres
        total_hombres += hombres
        total_poblacion += total

        # La fuente, para las localidades más grandes (cabeceras
        # municipales, zonas urbanas), no trae el desglose por grupo de
        # edad: las bandas 0-9, 10-19 y 60+ vienen en cero y TODA la
        # población queda volcada en "20-59" (verificado contra el
        # archivo original: 526 de 2,192 localidades, ~79% de la
        # población estatal). Ese patrón infla artificialmente la banda
        # 20-59 si se toma tal cual. Se detecta explícitamente y esas
        # localidades se EXCLUYEN del cálculo de pirámide/grupo de edad
        # (no se inventa un desglose que la fuente no trae), pero SÍ
        # cuentan en los totales de población, mujeres y hombres, que sí
        # son datos reales y completos.
        desglose_valido = not (total > 0 and m09 == 0 and h09 == 0 and m1019 == 0 and h1019 == 0 and m60 == 0 and h60 == 0 and (m2059 + h2059) == total)
        if not desglose_valido:
            n_sin_desglose_edad += 1
            poblacion_sin_desglose_edad += total
        else:
            total_bandas_m["0-9"] += m09
            total_bandas_h["0-9"] += h09
            total_bandas_m["10-19"] += m1019
            total_bandas_h["10-19"] += h1019
            total_bandas_m["20-59"] += m2059
            total_bandas_h["20-59"] += h2059
            total_bandas_m["60+"] += m60
            total_bandas_h["60+"] += h60

        pm = por_municipio[municipio]
        pm["mujeres"] += mujeres
        pm["hombres"] += hombres
        pm["total"] += total
        pm["localidades"] = pm.get("localidades", 0) + 1
        if desglose_valido:
            pm["m_0_9"] += m09
            pm["h_0_9"] += h09
            pm["m_10_19"] += m1019
            pm["h_10_19"] += h1019
            pm["m_20_59"] += m2059
            pm["h_20_59"] += h2059
            pm["m_60"] += m60
            pm["h_60"] += h60
        else:
            pm["localidades_sin_desglose"] = pm.get("localidades_sin_desglose", 0) + 1
            pm["poblacion_sin_desglose"] = pm.get("poblacion_sin_desglose", 0) + total

        localidades.append([
            cvegeo, municipio, localidad, mujeres, hombres, total,
            m09, h09, m1019, h1019, m2059, h2059, m60, h60, desglose_valido,
        ])

    print(f"Localidades: {n_localidades} / Municipios: {len(municipios)}")
    print(f"Población total: {total_poblacion} (mujeres {total_mujeres}, hombres {total_hombres})")
    print(f"Localidades SIN desglose de edad en la fuente: {n_sin_desglose_edad} "
          f"({poblacion_sin_desglose_edad} habitantes, "
          f"{poblacion_sin_desglose_edad / total_poblacion * 100:.1f}% del total)")

    localidades.sort(key=lambda r: r[5], reverse=True)

    municipios_arr = []
    for m in sorted(por_municipio.keys()):
        pm = por_municipio[m]
        municipios_arr.append({
            "municipio": m,
            "localidades": pm["localidades"],
            "mujeres": pm["mujeres"],
            "hombres": pm["hombres"],
            "total": pm["total"],
            "localidades_sin_desglose_edad": pm.get("localidades_sin_desglose", 0),
            "poblacion_sin_desglose_edad": pm.get("poblacion_sin_desglose", 0),
            "bandas": {
                "0-9": {"mujeres": pm["m_0_9"], "hombres": pm["h_0_9"]},
                "10-19": {"mujeres": pm["m_10_19"], "hombres": pm["h_10_19"]},
                "20-59": {"mujeres": pm["m_20_59"], "hombres": pm["h_20_59"]},
                "60+": {"mujeres": pm["m_60"], "hombres": pm["h_60"]},
            },
        })
    municipios_arr.sort(key=lambda r: r["total"], reverse=True)

    data = {
        "meta": {
            "entidad": "Querétaro",
            "alcance": "estatal",
            "anio": 2025,
            "fuente": "BASE_POBLACIONAL_ASIS_QUERETARO_2025.xlsx — hoja 'BASE POBLACIONAL ASIS' (padrón ASIS por localidad)",
            "total_localidades": n_localidades,
            "total_municipios": len(municipios),
            "total_poblacion": total_poblacion,
            "total_mujeres": total_mujeres,
            "total_hombres": total_hombres,
            "localidades_sin_desglose_edad": n_sin_desglose_edad,
            "poblacion_sin_desglose_edad": poblacion_sin_desglose_edad,
            "poblacion_con_desglose_edad": total_poblacion - poblacion_sin_desglose_edad,
            "nota": "Padrón poblacional 2025, exclusivamente Querétaro, a nivel "
                    "localidad. Sólo trae 4 grupos de edad (0-9, 10-19, 20-59, "
                    "60+): no se inventan grupos quinquenales. No se usa aquí "
                    "como denominador de tasas de otros módulos (ver README); "
                    "es un módulo de consulta poblacional independiente.",
            "nota_calidad_edad": f"La fuente NO trae desglose por grupo de edad para "
                    f"{n_sin_desglose_edad} localidades (típicamente las cabeceras "
                    f"municipales y zonas urbanas grandes): sus 3 bandas jóvenes/"
                    f"mayores vienen en cero y todo el total aparece volcado en "
                    f"'20-59', lo que infla esa banda si se toma tal cual "
                    f"({poblacion_sin_desglose_edad} habitantes, "
                    f"{round(poblacion_sin_desglose_edad / total_poblacion * 100, 1)}% del "
                    f"total estatal). La pirámide y la distribución por grupo de edad "
                    f"se calculan SÓLO con las localidades que sí traen desglose "
                    f"válido; los totales de población, mujeres y hombres si "
                    f"incluyen a todas las localidades (esos datos sí son completos).",
        },
        "grupos_edad": BANDAS,
        "resumen_estatal": {
            "bandas": {b: {"mujeres": total_bandas_m[b], "hombres": total_bandas_h[b]} for b in BANDAS},
        },
        "catalogos": {
            "municipios": sorted(municipios),
        },
        "por_municipio": municipios_arr,
        "localidades_campos": [
            "cvegeo", "municipio", "localidad", "mujeres", "hombres", "total",
            "mujeres_0_9", "hombres_0_9", "mujeres_10_19", "hombres_10_19",
            "mujeres_20_59", "hombres_20_59", "mujeres_60", "hombres_60",
            "desglose_edad_valido",
        ],
        "localidades": localidades,
    }

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("Escrito", OUT_JSON)

    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write(
            "/**\n"
            " * data/real/poblacion_2025.js\n"
            " * GENERADO AUTOMÁTICAMENTE por scripts/build_poblacion.py — no editar a mano.\n"
            " * Fuente: data/raw/BASE_POBLACIONAL_ASIS_QUERETARO_2025.xlsx (Querétaro).\n"
            " * Datos agregados por localidad/municipio, sin datos personales.\n"
            " * -----------------------------------------------------------------------\n"
            " */\n"
            "window.SNSP_POBLACION_DATA = "
        )
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("Escrito", OUT_JS)


if __name__ == "__main__":
    main()
