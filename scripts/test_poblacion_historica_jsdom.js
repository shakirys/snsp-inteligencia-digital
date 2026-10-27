/**
 * scripts/test_poblacion_historica_jsdom.js  (ACT26)
 * Prueba de humo + validación numérica de la sección "Población histórica
 * SUIVE 2017-2026" usando el HTML REAL de pages/poblacion.html (sin CDN:
 * stub mínimo de Chart.js). A diferencia de console.assert, cualquier
 * falla termina con código de salida 1.
 * Uso: node scripts/test_poblacion_historica_jsdom.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf-8");
let ok = 0, fail = 0;
function check(cond, msg) { if (cond) { ok++; console.log("OK  ", msg); } else { fail++; console.log("FALLA", msg); } }

// HTML real de la página, sin <script> (se ejecutan abajo en orden).
const html = read("pages/poblacion.html").replace(/<script[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/pages/poblacion.html" });
const { window } = dom;

const creados = {};
window.Chart = function (ctx, cfg) {
  this._cfg = cfg; this.data = cfg.data; this.options = cfg.options; this.canvas = ctx;
  this.destroy = function () {}; this.update = function () {};
  creados[ctx.id] = this;
};
window.Chart.register = function () {};

const scripts = [
  "config/config.js", "auth/auth.js", "services/dataService.js", "services/realDataService.js",
  "services/poblacionDataService.js", "data/real/indicadores_2025.js", "data/real/poblacion_2025.js",
  "components/sidebar.js", "components/topbar.js", "components/indicatorCard.js", "components/charts.js",
  "components/filterBar.js", "components/mapQueretaro.js", "modules/poblacionModuleView.js",
  "data/real/poblacion_historica_2017_2026.js", "data/real/geo_municipios_queretaro.js",
  "services/poblacionHistoricaDataService.js", "components/pyramidChart.js",
  "components/mapaCoropleticoQro.js", "modules/poblacionReportePDF.js", "modules/poblacionHistoricaModuleView.js",
];
const ctx = dom.getInternalVMContext();
for (const s of scripts) vm.runInContext(read(s), ctx, { filename: s });

window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025");

// ---------- 1. Datos y servicio ----------
const D = window.SNSP_POBLACION_HISTORICA_DATA;
const S = window.SNSP_POBLACION_HISTORICA_SERVICE;
const ESPERADO = { 2017: 2233603, 2018: 2298993, 2019: 2364645, 2020: 2419819, 2021: 2462684, 2022: 2508214, 2023: 2557915, 2024: 2606698, 2025: 2654421, 2026: 2700978 };
check(D.registros.length === 3960, "3,960 registros en el bundle");
check(D.catalogos.municipios.length === 18 && D.catalogos.jurisdicciones.length === 4, "18 municipios y 4 jurisdicciones");
check(D.catalogos.grupos_edad.length === 11, "11 grupos de edad, como en la fuente");
check(D.registros.some((r) => Math.abs(r[4] - Math.round(r[4])) > 1e-4), "Se conservan los decimales originales (no se redondeó en origen)");
let threw = false; try { S.getResumen({}); } catch (e) { threw = true; }
check(threw, "getResumen sin año lanza error (nunca se suman años)");

for (const [anio, tot] of Object.entries(ESPERADO)) {
  const r = S.getResumen({ anio: Number(anio) });
  check(Math.round(r.total) === tot, `Total estatal ${anio} = ${tot.toLocaleString("en-US")}`);
  const sumMun = S.getPorMunicipio({ anio: Number(anio) }).reduce((a, m) => a + m.total, 0);
  const sumJs = S.getPorJurisdiccion({ anio: Number(anio) }).reduce((a, j) => a + j.total, 0);
  check(Math.round(sumMun) === tot && Math.round(sumJs) === tot, `${anio}: Σ18 municipios = Σ4 jurisdicciones = total estatal`);
  check(Math.round(r.mujeres + r.hombres) === tot, `${anio}: mujeres + hombres = total`);
  const p = S.getPiramide({ anio: Number(anio) });
  check(Math.round(p.hombres.concat(p.mujeres).reduce((a, b) => a + b, 0)) === tot, `${anio}: suma de la pirámide = total`);
}
const r25 = S.getResumen({ anio: 2025 });
check(Math.round(r25.mujeres) === 1352999 && Math.round(r25.hombres) === 1301422, "2025: mujeres 1,352,999 y hombres 1,301,422");
check(S.getResumen({ anio: 2017 }).crecimientoPct === null, "2017: crecimiento no disponible (sin año anterior)");
check(Math.abs(S.getResumen({ anio: 2026 }).crecimientoPct - 1.7537) < 0.001, "2026 vs 2025: +1.75%");
const serie = S.getSerie({});
check(serie.length === 10 && serie.every((s) => Math.round(s.total) === ESPERADO[s.anio]), "Serie 2017-2026: un valor independiente por año (no acumulado)");
check(Math.round(S.getResumen({ anio: 2026, js: 2 }).total) === 624937, "JS 2 San Juan del Río 2026 = 624,937");
check(Math.round(S.getResumen({ anio: 2026, cve: "014" }).total) === 1243610, "Querétaro (014) 2026 = 1,243,610");
check(S.getMunicipios(4).map((m) => m.cve).join() === "002,003,009,010", "JS 4 Jalpan = 002, 003, 009, 010");
check(D.auditoria.conciliacion_morbilidad_2022_2026.identica === true, "2022-2026 idéntico a la población de Morbilidad");

// ---------- 2. Geometría ----------
const G = window.SNSP_GEO_QRO_MUNICIPIOS;
check(G.features.length === 18, "Geometría: 18 municipios");
check(G.features.every((f) => D.catalogos.municipios.some((m) => m.cve === f.cve && m.js === f.js && m.cvegeo === f.cvegeo)), "Cada polígono concilia con la base por clave y jurisdicción");

// ---------- 3. Render de la sección con el HTML real ----------
window.SNSP_renderPoblacionModulePage({}); // sección ASIS 2025 (regresión)
const view = window.SNSP_renderPoblacionHistoricaSection({ containerId: "ph-panel-suive" });
const doc = window.document;
const SNSP_pct = (v) => Number(v).toFixed(1) + "%";
const kpi = (i) => doc.querySelectorAll("#ph-kpis .indicator-card__value")[i].textContent.trim();
check(doc.querySelectorAll("#ph-kpis .indicator-card").length === 4, "4 tarjetas de volumen (total, mujeres, hombres, crecimiento)");
check(doc.querySelectorAll("#ph-kpis-estructura .indicator-card").length === 4, "4 tarjetas de estructura (% mujeres, % hombres, 65+ número y %)");
check(kpi(0) === (2700978).toLocaleString("es-MX"), "KPI total inicial = 2026 estatal");
check(doc.querySelectorAll("#ph-mapa path.ph-mapa__mun").length === 18, "Mapa: 18 trayectorias SVG");
check(["ph-chart-sexoedad", "ph-chart-evol", "ph-chart-js", "ph-chart-mun", "ph-chart-rank"].every((id) => creados[id]), "Se crean sexo y edad, evolución, jurisdicciones, municipios y ranking");
check(!doc.getElementById("ph-chart-piramide") && !creados["ph-chart-piramide"], "ACT26c: la pirámide SUIVE fue sustituida (ya no existe)");
const se = creados["ph-chart-sexoedad"];
check(se._cfg.type === "bar" && se.options.indexAxis === "y", "Sexo y edad: barras horizontales");
check(se.data.datasets.map((d) => d.label).join() === "Hombres,Mujeres", "Sexo y edad: dos series agrupadas (Hombres, Mujeres)");
check(se.data.datasets.every((d) => d.data.every((v) => v >= 0)), "Sexo y edad: barras desde cero (no espejadas)");
check(se.data.labels.length === 11 && JSON.stringify(se.data.labels[0]).includes("0 años") && JSON.stringify(se.data.labels[10]).includes("65 y más"), "Sexo y edad: 11 grupos de la fuente, 0 años a 65 y más");
check(JSON.stringify(se.data.labels[6]).includes("20 años") && JSON.stringify(se.data.labels[8]).includes("10 años"), "Etiquetas muestran amplitud desigual (25–44: 20 años; 50–59: 10 años)");
check(/sin estimar quinquenios/.test(doc.querySelector("#ph-panel-suive .ph-card--protagonista .ph-nota-edad").textContent), "Nota metodológica de amplitud desigual visible");
check(Math.round(se.data.datasets[0].data.concat(se.data.datasets[1].data).reduce((a, b) => a + b, 0)) === 2700978, "Suma de barras sexo y edad = total 2026");
const kpiE = (i) => doc.querySelectorAll("#ph-kpis-estructura .indicator-card__value")[i].textContent.trim();
check(kpiE(0) === "51.0%" && kpiE(1) === "49.0%", "Estructura 2026: 51.0% mujeres y 49.0% hombres");
check(kpiE(2) === (206954).toLocaleString("es-MX") && kpiE(3) === "7.7%", "Estructura 2026: 65+ = 206,954 (7.7%)");
// Ranking
const rk = () => creados["ph-chart-rank"].data;
check(rk().labels.join("|") === "1. Querétaro|2. San Juan del Río|3. El Marqués|4. Corregidora|5. Pedro Escobedo", "Ranking 2026: 5 más poblados del estado");
doc.querySelector('[data-ph-rank="bottom"]').click();
check(rk().labels.join("|") === "18. San Joaquín|17. Arroyo Seco|16. Landa de Matamoros|15. Peñamiller|14. Tolimán" && Math.round(rk().datasets[0].data[0]) === 7789, "Ranking 2026: 5 menos poblados (San Joaquín 7,789)");
doc.querySelector('[data-ph-rank="top"]').click();
check(typeof window.SNSP_generarReportePoblacionPDF === "function" && !!doc.getElementById("ph-btn-pdf") && /Descargar reporte poblacional/.test(doc.getElementById("ph-btn-pdf").textContent), "Botón 'Descargar reporte poblacional' y generador PDF disponibles");

// Filtros
const sel = (id, v) => { const e = doc.getElementById(id); e.value = v; e.dispatchEvent(new window.Event("change")); };
sel("ph-f-js", "3");
check(doc.querySelectorAll("#ph-f-mun option[value]:not([value=''])").length === 5, "Cascada: JS 3 tiene 5 municipios");
check(kpi(0) === (173868).toLocaleString("es-MX"), "KPI JS 3 Cadereyta 2026 = 173,868");
const e3 = S.getEstructura({ anio: 2026, js: 3 });
check(kpiE(2) === Math.round(e3.pob65).toLocaleString("es-MX") && kpiE(3) === SNSP_pct(e3.pct65), "Estructura responde a la jurisdicción (65+ de JS 3)");
check(rk().labels.length === 5 && rk().labels[0] === "1. Cadereyta de Montes", "Ranking responde a la jurisdicción (JS 3: 5 municipios, 1. Cadereyta de Montes)");
check(doc.querySelectorAll("#ph-mapa path.is-fuera").length === 13, "Mapa atenúa los 13 municipios fuera de JS 3");
sel("ph-f-mun", "015"); sel("ph-f-anio", "2017");
check(kpi(0) === (9169).toLocaleString("es-MX") && kpi(3) === "No disponible", "San Joaquín 2017 = 9,169; crecimiento No disponible");
check(/lugar <strong>5 de 5<\/strong>/.test(doc.getElementById("ph-rank-nota").innerHTML) && /18 de 18/.test(doc.getElementById("ph-rank-nota").textContent), "Municipio: ranking indica lugar en jurisdicción (5 de 5) y estado (18 de 18) en 2017");
check(doc.querySelectorAll("#ph-mapa path.is-sel").length === 1, "Mapa resalta el municipio seleccionado");
doc.querySelector('[data-ph-modo="pct"]').click();
const pp = creados["ph-chart-sexoedad"].data.datasets;
const sumPct = pp[0].data.reduce((a, b) => a + b, 0) + pp[1].data.reduce((a, b) => a + b, 0);
check(Math.abs(sumPct - 100) < 1e-9, "Modo %: suman 100");
doc.getElementById("ph-f-limpiar").click();
check(kpi(0) === (2700978).toLocaleString("es-MX") && view.getState().js === null, "Limpiar filtros restablece estado 2026");

// Regresión ASIS 2025
const kAsis = doc.querySelector("#kpi-grid .indicator-card__value").textContent;
check(kAsis.replace(/\D/g, "") === "2655609", "Sección ASIS 2025 intacta (total 2,655,609)");
check(doc.querySelectorAll("#localidades-body tr").length === 80, "Tabla de localidades ASIS: 80 filas");


// ---------- 4. ACT26b: Comparativo poblacional por años ----------
const pressedAnios = () => Array.from(doc.querySelectorAll("[data-ph-cmp-anio][aria-pressed='true']")).map((b) => Number(b.dataset.phCmpAnio));
const cmpChart = () => creados["ph-chart-cmp"];
check(doc.querySelectorAll("[data-ph-cmp-anio]").length === 10, "Comparativo: 10 chips de año (2017-2026)");
check(pressedAnios().join() === "2022,2023,2024,2025,2026", "Comparativo: por defecto los últimos 5 años");
check(cmpChart().data.labels.join() === "2022,2023,2024,2025,2026", "Gráfica: una categoría por año seleccionado");
check(cmpChart().data.datasets.map((d) => d.label).join() === "Población total (mujeres + hombres),Mujeres,Hombres", "Gráfica: series Total (mujeres + hombres), Mujeres y Hombres");
check(/no tres poblaciones independientes/.test(doc.getElementById("ph-cmp-nota").textContent) && /incluye a mujeres y hombres/.test(doc.getElementById("ph-cmp-sub").textContent), "Comparativo aclara que el total incluye a mujeres y hombres");
const dsT = cmpChart().data.datasets[0].data;
check(dsT.every((v, i) => Math.round(v) === ESPERADO[2022 + i]), "Cada barra = población de su propio año (no se suman años)");
const filasTabla = () => Array.from(doc.querySelectorAll("#ph-cmp-tabla tbody tr")).map((tr) => Array.from(tr.cells).map((c) => c.textContent.trim()));
let ft = filasTabla();
check(ft.length === 5 && ft[0][1] === "Año base", "Tabla: 5 filas; el primer año es la base");
check(ft[4][1] === "vs 2025" && ft[4][2] === (2700978).toLocaleString("es-MX") && ft[4][3] === "+46,557" && ft[4][4] === "+1.75%", "Tabla 2026: 2,700,978; +46,557; +1.75% vs 2025");
// Seleccionar/deseleccionar
const chip = (a) => doc.querySelector(`[data-ph-cmp-anio="${a}"]`);
chip(2023).click(); chip(2024).click(); chip(2025).click(); chip(2022).click(); chip(2017).click();
check(pressedAnios().join() === "2017,2026", "Seleccionar/deseleccionar años: quedan 2017 y 2026");
ft = filasTabla();
check(ft[1][1].includes("vs 2017") && ft[1][1].includes("9 años") && ft[1][3] === "+467,375", "Años no consecutivos: referencia 'vs 2017 (9 años)', +467,375");
const R = S.getComparativo({ anios: [2017, 2026] })[1].referencia;
check(R.aniosEntre === 9 && !R.consecutivo && Math.abs(R.varTotal - 20.9247) < 0.001, "Servicio: variación 2017→2026 = +20.92% (no anual)");
doc.getElementById("ph-cmp-todos").click();
check(pressedAnios().length === 10 && cmpChart().data.labels.length === 10, "Mostrar todos: 10 años");
const sumaBarras = cmpChart().data.datasets[0].data;
check(sumaBarras.every((v, i) => Math.round(v) === ESPERADO[2017 + i]), "Mostrar todos: las 10 barras coinciden con los totales anuales");
doc.getElementById("ph-cmp-ninguno").click();
check(pressedAnios().length === 0 && !doc.getElementById("ph-cmp-vacio").hidden && doc.getElementById("ph-cmp-box").hidden, "Quitar todos: mensaje de selección vacía, sin gráfica");
doc.getElementById("ph-cmp-ultimos").click();
// Series
doc.querySelector('[data-ph-serie="mujeres"]').click();
check(cmpChart().data.datasets.map((d) => d._clave).join() === "total,hombres", "Quitar Mujeres: quedan Total y Hombres");
check(doc.querySelectorAll("#ph-cmp-tabla thead th.ph-grupo").length === 2, "Tabla se ajusta a los indicadores elegidos");
doc.querySelector('[data-ph-serie="mujeres"]').click();
check(cmpChart().data.datasets.map((d) => d._clave).join() === "total,mujeres,hombres", "Volver a activar Mujeres respeta el orden Total, Mujeres, Hombres");
// Geografía: los filtros de jurisdicción y municipio aplican al comparativo
sel("ph-f-js", "4");
check(cmpChart().data.datasets[0].data.every((v, i) => Math.abs(v - S.getResumen({ anio: 2022 + i, js: 4 }).total) < 1e-6), "JS 4: cada barra = población de JS 4 en su año");
check(Math.round(cmpChart().data.datasets[0].data[4]) === 87765, "JS 4 Jalpan 2026 = 87,765");
sel("ph-f-mun", "010");
const landa = cmpChart().data.datasets[0].data.map(Math.round);
check(landa.join() === "18502,18247,17979,17703,17426", "Landa de Matamoros 2022-2026 = 18,502 / 18,247 / 17,979 / 17,703 / 17,426");
check(filasTabla()[1][3] === "−255" && filasTabla()[1][4].startsWith("−"), "Disminución se muestra con signo negativo (Landa 2023: −255)");
// El filtro Año NO cambia el comparativo; sexo y edad y mapa siguen con un solo año
sel("ph-f-anio", "2019");
check(pressedAnios().join() === "2022,2023,2024,2025,2026", "Cambiar el Año del filtro superior no altera los años del comparativo");
const pirL = creados["ph-chart-sexoedad"].data.datasets;
const sumPirL = Math.round(pirL[0].data.reduce((a, b) => a + b, 0) + pirL[1].data.reduce((a, b) => a + b, 0));
check(sumPirL === Math.round(S.getResumen({ anio: 2019, cve: "010" }).total), "Sexo y edad sigue con un solo año (Landa 2019)");
check(doc.getElementById("ph-mapa-titulo").textContent.includes("2019"), "Mapa sigue con un solo año de referencia (2019)");
doc.getElementById("ph-f-limpiar").click();
check(pressedAnios().join() === "2022,2023,2024,2025,2026" && cmpChart().data.datasets.length === 3, "Limpiar filtros restablece también el comparativo");


// ---------- 5. ACT26c.1: mapa, porcentajes con denominador, resumen demográfico ----------
sel("ph-f-anio", "2026");
const G2 = window.SNSP_GEO_QRO_MUNICIPIOS;
const valsMapa = {}; S.getPorMunicipio({ anio: 2026 }).forEach((m) => { valsMapa[m.cve] = m.total; });
const cl = window.SNSP_clasificarMunicipiosQuintiles(valsMapa, 5);
check(cl.clases.map((c) => c.n).join() === "4,4,3,4,3" && cl.clases.reduce((a, c) => a + c.n, 0) === 18, "Mapa: 5 clases por rango (4,4,3,4,3 municipios = 18)");
check(cl.clases.every((c, i) => i === 0 || c.min > cl.clases[i - 1].max), "Mapa: los rangos de las clases no se traslapan ni comparten límites");
check(Math.round(cl.clases[0].min) === 7789 && Math.round(cl.clases[4].max) === 1243610, "Mapa: rango total 7,789 a 1,243,610 (2026)");
const itemsLey = Array.from(doc.querySelectorAll("#ph-mapa-leyenda .ph-mapa__leyenda-item")).map((e) => e.textContent.replace(/\s+/g, " ").trim());
check(itemsLey.length === 5 && itemsLey[0].startsWith("288,481 a 1,243,610 hab.") && itemsLey[4].startsWith("7,789 a 19,273 hab."), "Leyenda: rangos reales de mayor a menor (288,481 a 1,243,610 … 7,789 a 19,273)");
check(doc.querySelectorAll("#ph-mapa .ph-mapa__limites path").length === 18, "Mapa: capa de límites municipales (18 trazos)");
const colores = new Set(Array.from(doc.querySelectorAll("#ph-mapa path.ph-mapa__mun")).map((p) => p.getAttribute("fill")));
check(colores.size === 5 && [...colores].every((c) => window.SNSP_MAPA_RAMPA.includes(c)), "Mapa: 5 colores de la nueva rampa institucional");
sel("ph-f-mun", "006");
check(doc.querySelectorAll("#ph-mapa .ph-mapa__resalte.is-mun .ph-mapa__resalte-linea").length === 1, "Mapa: municipio seleccionado con contorno de resalte");
doc.getElementById("ph-f-limpiar").click();
// Tabla de 11 grupos con denominadores
const filasTE = Array.from(doc.querySelectorAll("#ph-tabla-edad tbody tr")).map((tr) => Array.from(tr.cells).map((c) => c.textContent.trim()));
check(filasTE.length === 11, "Tabla de 11 grupos presente en el tablero");
check(filasTE[6].join("|") === "25–44|20|890,344|33.0%|440,118|49.4%|450,226|50.6%", "Fila 25–44: 890,344 (33.0% del total); H 440,118 (49.4% del grupo); M 450,226 (50.6% del grupo)");
check(filasTE.every((r) => Math.abs(parseFloat(r[5]) + parseFloat(r[7]) - 100) < 0.11), "En cada grupo, % hombres + % mujeres del grupo = 100%");
const pie = Array.from(doc.querySelectorAll("#ph-tabla-edad tfoot td")).map((c) => c.textContent.trim());
check(pie.join("|") === "Total||2,700,978|100.0%|1,324,335|49.0%|1,376,643|51.0%", "Fila total: 2,700,978; H 49.0% y M 51.0% de la población total");
check(/Denominadores/.test(doc.getElementById("ph-tabla-edad").textContent) && /población del grupo/.test(doc.getElementById("ph-tabla-edad").textContent), "Tabla explica sus denominadores");
check(/de la población total/.test(doc.querySelectorAll("#ph-kpis .indicator-card__footnote")[1].textContent), "KPI Mujeres indica denominador (población total)");
check(/÷ 2,700,978 hab\. \(población total\)/.test(doc.querySelectorAll("#ph-kpis-estructura .indicator-card__footnote")[0].textContent), "Estructura % Mujeres muestra numerador ÷ denominador");
// Resumen demográfico (reutiliza los índices del servicio)
const est26 = S.getEstructura({ anio: 2026 });
check(est26.indiceDependencia.toFixed(1) === "43.7" && est26.indiceEnvejecimiento.toFixed(1) === "33.7", "Índices 2026: dependencia 43.7, envejecimiento 33.7");
const comp = doc.getElementById("ph-composicion").textContent;
check(comp.includes("43.7") && comp.includes("33.7") && /÷ 15–64 × 100/.test(comp) && /65 y más ÷ 0–14 × 100/.test(comp), "Resumen demográfico del tablero: índices con su definición");
check(Math.round(est26.pob0a14 + est26.pob15a64 + est26.pob65) === 2700978, "0–14 + 15–64 + 65 y más = población total");

console.log(`\n${ok} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
