#!/usr/bin/env python3
"""
scripts/verificar_comparativo_vs_base.py  (ACT26b)
-----------------------------------------------------------------------
Verificación INDEPENDIENTE del Comparativo poblacional por años contra la
base original BASE_POBLACION_SUIVE_QRO_2017_2026_PLANA.xlsx.

1) Calcula con openpyxl, directo del Excel, la población por año para las
   23 áreas (estado, 4 jurisdicciones, 18 municipios) y los 3 indicadores
   (total, mujeres, hombres).
2) Ejecuta en Node el servicio real de la plataforma
   (SNSP_POBLACION_HISTORICA_SERVICE.getComparativo) con los 10 años y con
   una selección no consecutiva, y compara valor por valor, incluidas la
   diferencia absoluta y la variación porcentual vs el año seleccionado
   anterior.
Uso: python3 scripts/verificar_comparativo_vs_base.py   (código 1 si falla)
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

NODE = r"""
const fs = require("fs"), vm = require("vm"), path = require("path");
const root = process.argv[1];
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ["data/real/poblacion_historica_2017_2026.js", "services/poblacionHistoricaDataService.js"])
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf-8"), ctx);
const S = ctx.window.SNSP_POBLACION_HISTORICA_SERVICE;
const anios = S.getAnios();
const areas = [{ id: "estado", f: {} }]
  .concat(S.getCatalogos().jurisdicciones.map((j) => ({ id: "js" + j.id, f: { js: j.id } })))
  .concat(S.getCatalogos().municipios.map((m) => ({ id: "mun" + m.cve, f: { cve: m.cve } })));
const out = {};
for (const a of areas) {
  out[a.id] = {
    todos: S.getComparativo(Object.assign({ anios }, a.f)),
    salteados: S.getComparativo(Object.assign({ anios: [2026, 2017, 2020, 2020, 1999] }, a.f)),
  };
}
process.stdout.write(JSON.stringify(out));
"""


def main():
    wb = openpyxl.load_workbook(RAW, read_only=True, data_only=True)
    rows = list(wb["POBLACION_BASE"].iter_rows(values_only=True))
    h = [str(x).strip() for x in rows[0]]
    base = defaultdict(float)  # (area, anio, indicador)
    for r in rows[1:]:
        d = dict(zip(h, r))
        anio = int(d["Año"]); v = float(d["Poblacion"])
        cve = str(d["Municipio"])[:3]; js = int(str(d["Jurisdicción"])[:2])
        ind = "mujeres" if d["Sexo"] == "Femenino" else "hombres"
        for area in ("estado", f"js{js}", f"mun{cve}"):
            base[(area, anio, ind)] += v
            base[(area, anio, "total")] += v

    res = subprocess.run(["node", "-e", NODE, ROOT], capture_output=True, text=True, check=True)
    svc = json.loads(res.stdout)

    errores, n = [], 0
    def cmp(a, b, msg):
        nonlocal n
        n += 1
        if abs(a - b) > 1e-6:
            errores.append(f"{msg}: plataforma={a} base={b}")

    for area, d in svc.items():
        filas = d["todos"]
        if [f["anio"] for f in filas] != list(range(2017, 2027)):
            errores.append(f"{area}: años incorrectos")
        for i, f in enumerate(filas):
            for ind in ("total", "mujeres", "hombres"):
                cmp(f[ind], base[(area, f["anio"], ind)], f"{area} {f['anio']} {ind}")
                if i == 0:
                    if f["referencia"] is not None:
                        errores.append(f"{area}: el primer año debe ser base")
                    continue
                ref = f["referencia"]; prev = f["anio"] - 1
                k = ind.capitalize()
                esperado_dif = base[(area, f["anio"], ind)] - base[(area, prev, ind)]
                cmp(ref["dif" + k], esperado_dif, f"{area} {f['anio']} dif {ind}")
                cmp(ref["var" + k], esperado_dif / base[(area, prev, ind)] * 100, f"{area} {f['anio']} var {ind}")
                if ref["anio"] != prev or not ref["consecutivo"]:
                    errores.append(f"{area} {f['anio']}: referencia incorrecta")
        # selección desordenada, repetida y con un año inexistente -> 2017, 2020, 2026
        s = d["salteados"]
        if [f["anio"] for f in s] != [2017, 2020, 2026]:
            errores.append(f"{area}: selección no consecutiva mal normalizada {[f['anio'] for f in s]}")
        else:
            cmp(s[2]["referencia"]["difTotal"], base[(area, 2026, "total")] - base[(area, 2020, "total")], f"{area} 2026 vs 2020")
            if s[2]["referencia"]["aniosEntre"] != 6 or s[2]["referencia"]["consecutivo"]:
                errores.append(f"{area}: aniosEntre 2020→2026 debe ser 6 y no consecutivo")
        # totales = mujeres + hombres (cada año por separado)
        for f in filas:
            cmp(f["total"], f["mujeres"] + f["hombres"], f"{area} {f['anio']} total=M+H")

    print(f"Áreas: {len(svc)} · comparaciones: {n} · errores: {len(errores)}")
    for e in errores[:20]:
        print("  ERROR", e)
    est = {f["anio"]: round(f["total"]) for f in svc["estado"]["todos"]}
    print("Totales estatales (plataforma):", est)
    sys.exit(1 if errores else 0)


if __name__ == "__main__":
    main()
