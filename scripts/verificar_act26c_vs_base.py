#!/usr/bin/env python3
"""
scripts/verificar_act26c_vs_base.py  (ACT26c)
-----------------------------------------------------------------------
Verificación INDEPENDIENTE, contra el Excel original, de lo nuevo en ACT26c:
  * Estructura: % mujeres, % hombres, 65 y más (número y %), para las 23
    áreas (estado, 4 jurisdicciones, 18 municipios) y los 10 años.
  * Ranking municipal 5 más / 5 menos poblados, con el mismo universo que
    la plataforma (estado -> 18; jurisdicción -> sus municipios; municipio ->
    su jurisdicción) y la posición del municipio en jurisdicción y estado.
  * ACT26c.1: tabla de los 11 grupos (población, % del total, % de hombres
    y mujeres dentro del grupo), índices de dependencia y envejecimiento, y
    clases del mapa (quintiles por rango con min/max reales).
Compara contra el servicio real de la plataforma (ejecutado en Node).

Con --esperados RUTA.json escribe además las cifras esperadas (calculadas
sólo del Excel, ya formateadas como aparecen en el PDF) para los escenarios
de la prueba de navegador del reporte PDF.
Uso: python3 scripts/verificar_act26c_vs_base.py [--esperados ruta.json]
-----------------------------------------------------------------------
"""
import json
import os
import subprocess
import sys
from collections import defaultdict

import openpyxl

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RAW = os.path.join(ROOT, "data/raw/BASE_POBLACION_SUIVE_QRO_2017_2026_PLANA.xlsx")
NOMBRES = {"001": "Amealco de Bonfil", "002": "Pinal de Amoles", "003": "Arroyo Seco", "004": "Cadereyta de Montes",
           "005": "Colón", "006": "Corregidora", "007": "Ezequiel Montes", "008": "Huimilpan", "009": "Jalpan de Serra",
           "010": "Landa de Matamoros", "011": "El Marqués", "012": "Pedro Escobedo", "013": "Peñamiller",
           "014": "Querétaro", "015": "San Joaquín", "016": "San Juan del Río", "017": "Tequisquiapan", "018": "Tolimán"}

NODE = r"""
const fs = require("fs"), vm = require("vm"), path = require("path");
const root = process.argv[1];
const ctx = { window: {}, getComputedStyle: () => ({ getPropertyValue: () => "" }) }; vm.createContext(ctx);
for (const f of ["data/real/poblacion_historica_2017_2026.js", "services/poblacionHistoricaDataService.js", "components/mapaCoropleticoQro.js"])
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf-8"), ctx);
const S = ctx.window.SNSP_POBLACION_HISTORICA_SERVICE;
const areas = [{ id: "estado", f: {} }]
  .concat(S.getCatalogos().jurisdicciones.map((j) => ({ id: "js" + j.id, f: { js: j.id } })))
  .concat(S.getCatalogos().municipios.map((m) => ({ id: "mun" + m.cve, f: { cve: m.cve } })));
const out = {};
for (const a of areas) for (const anio of S.getAnios()) {
  const f = Object.assign({ anio }, a.f);
  out[a.id + "|" + anio] = {
    est: S.getEstructura(f),
    top: S.getRanking(Object.assign({ tipo: "top" }, f)),
    bottom: S.getRanking(Object.assign({ tipo: "bottom" }, f)),
    tabla: S.getTablaEdad(f),
  };
  if (a.id === "estado") {
    const v = {}; S.getPorMunicipio({ anio }).forEach((m) => { v[m.cve] = m.total; });
    out["mapa|" + anio] = vm.runInContext("SNSP_clasificarMunicipiosQuintiles", ctx)(v, 5);
  }
}
process.stdout.write(JSON.stringify(out));
"""


def n0(v):
    return f"{round(v):,}"


def main():
    wb = openpyxl.load_workbook(RAW, read_only=True, data_only=True)
    rows = list(wb["POBLACION_BASE"].iter_rows(values_only=True))
    h = [str(x).strip() for x in rows[0]]
    B = defaultdict(float)
    mun_js = {}
    for r in rows[1:]:
        d = dict(zip(h, r))
        anio = int(d["Año"]); v = float(d["Poblacion"])
        cve = str(d["Municipio"])[:3]; js = int(str(d["Jurisdicción"])[:2]); mun_js[cve] = js
        sexo = "M" if d["Sexo"] == "Femenino" else "H"
        g = d["Grupo de edad"]
        es65 = g == "De 65 y más años"
        bloque = "014" if g in ("De 00 años", "De 01 a 04 años", "De 05 a 09 años", "De 10 a 14 años") else ("65" if es65 else "1564")
        for area in ("estado", f"js{js}", f"mun{cve}"):
            B[(area, anio, "T")] += v
            B[(area, anio, sexo)] += v
            B[(area, anio, "G", g, sexo)] += v
            B[(area, anio, "B", bloque)] += v
            if es65:
                B[(area, anio, "65")] += v

    res = subprocess.run(["node", "-e", NODE, ROOT], capture_output=True, text=True, check=True)
    svc = json.loads(res.stdout)
    errores, n = [], 0

    def cmp(a, b, msg, tol=1e-6):
        nonlocal n
        n += 1
        if abs(a - b) > tol:
            errores.append(f"{msg}: plataforma={a} base={b}")

    GRUPOS = ["De 00 años", "De 01 a 04 años", "De 05 a 09 años", "De 10 a 14 años", "De 15 a 19 años", "De 20 a 24 años",
              "De 25 a 44 años", "De 45 a 49 años", "De 50 a 59 años", "De 60 a 64 años", "De 65 y más años"]
    for key, d in svc.items():
        if key.startswith("mapa|"):
            anio = int(key.split("|")[1])
            vals = sorted(((B[(f"mun{c}", anio, "T")], c) for c in NOMBRES))
            clases = [[] for _ in range(5)]
            for i, (v, c) in enumerate(vals):
                clases[min(4, (i * 5) // 18)].append(v)
            for k, cl in enumerate(clases):
                cmp(d["clases"][k]["min"], min(cl), f"mapa {anio} clase {k} min")
                cmp(d["clases"][k]["max"], max(cl), f"mapa {anio} clase {k} max")
                if d["clases"][k]["n"] != len(cl):
                    errores.append(f"mapa {anio} clase {k} n")
                if k and not d["clases"][k]["min"] > d["clases"][k - 1]["max"]:
                    errores.append(f"mapa {anio} clases traslapadas")
            continue
        area, anio = key.split("|"); anio = int(anio)
        T = B[(area, anio, "T")]
        e = d["est"]
        cmp(e["total"], T, f"{key} total")
        cmp(e["pctMujeres"], B[(area, anio, "M")] / T * 100, f"{key} %M")
        cmp(e["pctHombres"], B[(area, anio, "H")] / T * 100, f"{key} %H")
        cmp(e["pob65"], B[(area, anio, "65")], f"{key} 65+")
        cmp(e["pct65"], B[(area, anio, "65")] / T * 100, f"{key} %65+")
        b014, b1564, b65 = B[(area, anio, "B", "014")], B[(area, anio, "B", "1564")], B[(area, anio, "B", "65")]
        cmp(e["indiceDependencia"], (b014 + b65) / b1564 * 100, f"{key} dependencia")
        cmp(e["indiceEnvejecimiento"], b65 / b014 * 100, f"{key} envejecimiento")
        for gi, g in enumerate(GRUPOS):
            r = d["tabla"]["filas"][gi]
            h = B[(area, anio, "G", g, "H")]; m = B[(area, anio, "G", g, "M")]
            cmp(r["total"], h + m, f"{key} {g} total")
            cmp(r["pctDelTotal"], (h + m) / T * 100, f"{key} {g} %total")
            cmp(r["pctHombresDelGrupo"], h / (h + m) * 100, f"{key} {g} %H grupo")
            cmp(r["pctMujeresDelGrupo"], m / (h + m) * 100, f"{key} {g} %M grupo")
        # ranking esperado
        js_u = int(area[2:]) if area.startswith("js") else (mun_js[area[3:]] if area.startswith("mun") else None)
        estado = sorted(NOMBRES, key=lambda c: -B[(f"mun{c}", anio, "T")])
        univ = [c for c in estado if js_u is None or mun_js[c] == js_u]
        top = univ[:5]; bottom = list(reversed(univ))[:5]
        if [NOMBRES[c] for c in top] != [m["nombre"] for m in d["top"]["items"]]:
            errores.append(f"{key} ranking top distinto")
        if [NOMBRES[c] for c in bottom] != [m["nombre"] for m in d["bottom"]["items"]]:
            errores.append(f"{key} ranking bottom distinto")
        for m, c in zip(d["top"]["items"], top):
            cmp(m["total"], B[(f"mun{c}", anio, "T")], f"{key} top {c}")
        if area.startswith("mun"):
            c = area[3:]; p = d["top"]["posicion"]
            if p["enEstado"] != estado.index(c) + 1 or p["enJurisdiccion"] != univ.index(c) + 1 or p["deJurisdiccion"] != len(univ):
                errores.append(f"{key} posición incorrecta {p}")
        n += 1

    print(f"Áreas×años: {len(svc)} · comparaciones: {n} · errores: {len(errores)}")
    for e in errores[:20]:
        print("  ERROR", e)

    if "--esperados" in sys.argv:
        ruta = sys.argv[sys.argv.index("--esperados") + 1]
        def esc(area, anio, cmp_anios):
            T = B[(area, anio, "T")]
            js_u = int(area[2:]) if area.startswith("js") else (mun_js[area[3:]] if area.startswith("mun") else None)
            estado = sorted(NOMBRES, key=lambda c: -B[(f"mun{c}", anio, "T")])
            univ = [c for c in estado if js_u is None or mun_js[c] == js_u]
            num = [n0(T), n0(B[(area, anio, "M")]), n0(B[(area, anio, "H")]), n0(B[(area, anio, "65")]),
                   f"{B[(area, anio, 'M')] / T * 100:.1f}%", f"{B[(area, anio, 'H')] / T * 100:.1f}%", f"{B[(area, anio, '65')] / T * 100:.1f}%"]
            num += [n0(B[(area, a, "T")]) for a in range(2017, 2027)]  # evolución
            prev = None
            for a in cmp_anios:  # comparativo
                num.append(n0(B[(area, a, "T")]))
                if prev:
                    dif = B[(area, a, "T")] - B[(area, prev, "T")]
                    num.append(("+" if dif > 0 else "-" if dif < 0 else "") + n0(abs(dif)))
                prev = a
            num += [n0(B[(f"mun{c}", anio, "T")]) for c in univ[:5]]  # ranking
            for g in ["De 00 años", "De 01 a 04 años", "De 05 a 09 años", "De 10 a 14 años", "De 15 a 19 años", "De 20 a 24 años",
                      "De 25 a 44 años", "De 45 a 49 años", "De 50 a 59 años", "De 60 a 64 años", "De 65 y más años"]:
                h = B[(area, anio, "G", g, "H")]; m = B[(area, anio, "G", g, "M")]
                num += [n0(h + m), n0(h), n0(m)]
            b014, b1564, b65 = B[(area, anio, "B", "014")], B[(area, anio, "B", "1564")], B[(area, anio, "B", "65")]
            num += [n0(b014), n0(b1564), f"{(b014 + b65) / b1564 * 100:.1f}", f"{b65 / b014 * 100:.1f}"]
            vals = sorted(B[(f"mun{c}", anio, "T")] for c in NOMBRES)
            clases = [[] for _ in range(5)]
            for i, v in enumerate(vals):
                clases[min(4, (i * 5) // 18)].append(v)
            rangos = [f"{n0(min(c))} a {n0(max(c))}" for c in clases]
            return {"numeros": sorted(set(num)), "rangos_mapa": rangos, "ranking": [NOMBRES[c] for c in univ[:5]],
                    "ranking_bottom": [NOMBRES[c] for c in list(reversed(univ))[:5]]}
        json.dump({
            "estado_2026": esc("estado", 2026, [2022, 2023, 2024, 2025, 2026]),
            "js4_2026": esc("js4", 2026, [2020]),
            "mun010_2017": esc("mun010", 2017, []),
        }, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("Esperados escritos en", ruta)
    sys.exit(1 if errores else 0)


if __name__ == "__main__":
    main()
