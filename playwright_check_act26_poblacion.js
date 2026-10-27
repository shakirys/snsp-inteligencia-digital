/**
 * ACT26 — Validación en navegador real (Chromium/Playwright) del módulo
 * Población: sección histórica SUIVE 2017-2026 + regresión de la sección
 * padrón ASIS 2025. Toma capturas en escritorio, tableta y teléfono.
 * Uso: python3 -m http.server 8099 (en la raíz) y luego
 *      node playwright_check_act26_poblacion.js [carpetaCapturas]
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.SNSP_BASE || "http://127.0.0.1:8099";
const OUT = process.argv[2] || "docs/capturas_act26";
fs.mkdirSync(OUT, { recursive: true });
const CDN_LOCAL = {
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js": "node_modules/chart.js/dist/chart.umd.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js": "node_modules/jspdf/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js": "node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js",
};
// ACT26c: cifras esperadas del PDF calculadas SÓLO del Excel original
const { execFileSync } = require("child_process");
const ESP_RUTA = path.join(require("os").tmpdir(), "snsp_esperados_act26c.json");
execFileSync("python3", ["scripts/verificar_act26c_vs_base.py", "--esperados", ESP_RUTA], { stdio: "ignore" });
const ESPERADOS = JSON.parse(fs.readFileSync(ESP_RUTA, "utf-8"));
const { PDFParse } = require("pdf-parse");

// Descarga el PDF con el botón visible, lo guarda y valida su texto.
async function verificarPDF(pg, archivo, esperado, frases, etiqueta) {
  const [dl] = await Promise.all([pg.waitForEvent("download", { timeout: 30000 }), pg.click("#ph-btn-pdf")]);
  const destino = path.join(OUT, archivo);
  await dl.saveAs(destino);
  const buf = fs.readFileSync(destino);
  assert(buf.slice(0, 5).toString() === "%PDF-" && buf.length > 50000, `${etiqueta}: se descarga un PDF válido (${dl.suggestedFilename()}, ${Math.round(buf.length / 1024)} KB)`);
  const parsed = await new PDFParse({ data: buf }).getText();
  const txt = parsed.text.replace(/\s+/g, " ");
  const paginas = parsed.total || (parsed.pages || []).length;
  assert(paginas >= 4 && paginas <= 6, `${etiqueta}: ${paginas} páginas (máximo 6)`);
  if (esperado.rangos_mapa) {
    const faltanR = esperado.rangos_mapa.filter((r) => !txt.includes(r));
    assert(!faltanR.length, `${etiqueta}: leyenda del mapa con los 5 rangos reales sin traslape` + (faltanR.length ? " — faltan: " + faltanR.join(", ") : ""));
  }
  const faltan = esperado.numeros.filter((x) => !txt.includes(x));
  assert(!faltan.length, `${etiqueta}: las ${esperado.numeros.length} cifras esperadas (calculadas del Excel) aparecen en el PDF` + (faltan.length ? " — faltan: " + faltan.join(", ") : ""));
  const nombres = esperado.ranking.filter((x) => !txt.includes(x));
  assert(!nombres.length, `${etiqueta}: ranking con los municipios esperados` + (nombres.length ? " — faltan: " + nombres.join(", ") : ""));
  ["SNSP Querétaro — Inteligencia e Información", "Reporte ejecutivo de población", "base de población utilizada en SUIVE Querétaro", "Interpretación descriptiva", "Fuente de información y notas metodológicas", "Fecha de generación",
   "Resumen demográfico", "Índice de dependencia", "Índice de envejecimiento", "% del grupo", "% del total", "Denominadores", "de la población total"].concat(frases || [])
    .forEach((f) => assert(txt.toLowerCase().includes(f.toLowerCase()), `${etiqueta}: contiene "${f}"`));
  const conapo = [...txt.matchAll(/CONAPO/g)].map((m) => txt.slice(Math.max(0, m.index - 30), m.index));
  assert(conapo.every((ctx) => /no se atribuye a\s*$/.test(ctx)), `${etiqueta}: CONAPO sólo aparece para aclarar que NO se le atribuye la base (${conapo.length} menciones)`);
  const rep = await pg.evaluate(() => window.SNSP_PH_ULTIMO_REPORTE);
  return { txt, paginas, rep };
}
const resultados = [];
function assert(cond, msg) {
  resultados.push({ ok: !!cond, msg });
  console.log((cond ? "OK: " : "FALLÓ: ") + msg);
}

async function nuevaPagina(browser, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 700 ? 2 : 1, acceptDownloads: true });
  const page = await ctx.newPage();
  page._errores = [];
  page._preexistentes = [];
  // Error PREEXISTENTE de ACT25 (no introducido en ACT26): la pirámide del
  // padrón ASIS 2025 (SNSP_renderPopulationPyramid, components/charts.js)
  // pasa su formatter por las opciones de Chart.js, que lo invoca como
  // opción "scriptable" con un objeto de contexto -> TypeError en
  // absFormatter. Se registra aparte y se reporta; charts.js no se tocó.
  page.on("pageerror", (e) => {
    const st = String(e.stack || e);
    (st.includes("absFormatter") ? page._preexistentes : page._errores).push(String(e));
  });
  // Las fuentes de Google se bloquean a propósito en la prueba (sin red).
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page._errores.push(m.text()); });
  page.on("requestfailed", (r) => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) page._errores.push("requestfailed " + r.url()); });
  for (const [url, local] of Object.entries(CDN_LOCAL)) await page.route(url, (r) => r.fulfill({ path: local }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.evaluate(() => window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025"));
  await page.goto(BASE + "/pages/poblacion.html", { waitUntil: "load" });
  await page.waitForSelector("#ph-kpis .indicator-card", { timeout: 15000 });
  await page.waitForTimeout(1200);
  return page;
}

// Captura de una tarjeta completa en coordenadas del documento (evita que la
// barra de filtros fija tape el título al desplazarse).
async function capturaTarjeta(pg, selector, archivo) {
  const r = await pg.$eval(selector, (e) => { const b = e.getBoundingClientRect(); return { x: b.x + window.scrollX, y: b.y + window.scrollY, width: b.width, height: b.height }; });
  await pg.evaluate(() => window.scrollTo(0, 0));
  await pg.waitForTimeout(200);
  await pg.screenshot({ path: archivo, fullPage: true, clip: { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: r.width + 8, height: r.height + 8 } });
}

const kpi = (page, i) => page.$eval(`#ph-kpis .indicator-card:nth-child(${i}) .indicator-card__value`, (e) => e.textContent.trim());
const num = (t) => Number(String(t).replace(/[^\d-]/g, ""));

(async () => {
  const browser = await chromium.launch();

  // ================= ESCRITORIO =================
  const page = await nuevaPagina(browser, { width: 1440, height: 900 });
  assert(await page.$eval("#ph-tab-suive", (e) => e.getAttribute("aria-selected")) === "true", "Pestaña SUIVE abre por defecto");
  assert(await page.$eval("#ph-panel-asis", (e) => e.hidden), "Panel ASIS 2025 oculto al inicio");
  assert(await page.$eval("#ph-f-anio", (e) => e.value) === "2026", "Año por defecto = 2026");
  assert(num(await kpi(page, 1)) === 2700978, "KPI total estatal 2026 = 2,700,978");
  assert(num(await kpi(page, 2)) === 1376643, "KPI mujeres 2026 = 1,376,643");
  assert(num(await kpi(page, 3)) === 1324335, "KPI hombres 2026 = 1,324,335");
  assert((await kpi(page, 4)).includes("1.75"), "Crecimiento 2026 vs 2025 = +1.75%");
  const kE = (i) => page.$eval(`#ph-kpis-estructura .indicator-card:nth-child(${i}) .indicator-card__value`, (e) => e.textContent.trim());
  assert(await kE(1) === "51.0%" && await kE(2) === "49.0%", "Estructura: 51.0% mujeres, 49.0% hombres");
  assert(num(await kE(3)) === 206954 && await kE(4) === "7.7%", "Estructura: 65 años y más = 206,954 (7.7%)");
  assert(await page.isVisible("#ph-btn-pdf") && /Descargar reporte poblacional/.test(await page.textContent("#ph-btn-pdf")), "Botón visible «Descargar reporte poblacional»");
  assert(await page.$$eval("#ph-mapa path.ph-mapa__mun", (p) => p.length) === 18, "Mapa dibuja 18 municipios");
  assert(await page.$$eval("#ph-mapa-leyenda .ph-mapa__leyenda-item", (p) => p.length) === 5, "Leyenda del mapa con 5 clases");
  const ley = await page.$$eval("#ph-mapa-leyenda .ph-mapa__leyenda-rango", (p) => p.map((e) => e.textContent.trim()));
  assert(ley.join("|") === ESPERADOS.estado_2026.rangos_mapa.slice().reverse().map((r) => r + " hab.").join("|"), "Leyenda del tablero = rangos reales calculados del Excel (sin traslape)");
  assert(await page.$$eval("#ph-mapa .ph-mapa__limites path", (p) => p.length) === 18, "Mapa: límites de los 18 municipios trazados");
  const fs1 = await page.$eval(".ph-mapa__leyenda-item", (e) => parseFloat(getComputedStyle(e).fontSize));
  assert(fs1 >= 13, `Leyenda legible (fuente ${fs1}px)`);
  await page.evaluate(() => { document.getElementById("ph-mapa").closest(".ph-card").id = "ph-mapa-card"; });
  await capturaTarjeta(page, "#ph-mapa-card", path.join(OUT, "14_mapa_corregido_estado_2026.png"));
  assert(!(await page.$("#ph-chart-piramide")), "ACT26c: la pirámide SUIVE fue sustituida");
  const piramide = await page.evaluate(() => {
    const c = Chart.getChart("ph-chart-sexoedad");
    return { labels: c.data.labels, h: c.data.datasets[0], m: c.data.datasets[1] };
  });
  assert(piramide.h.label === "Hombres" && piramide.m.label === "Mujeres" && piramide.h.data.concat(piramide.m.data).every((v) => v >= 0), "Sexo y edad: barras horizontales agrupadas Hombres / Mujeres desde cero");
  assert(piramide.h.backgroundColor === "#A57F2C" && piramide.m.backgroundColor === "#611232", "Colores institucionales: dorado (hombres) y vino (mujeres)");
  assert(JSON.stringify(piramide.labels[0]).includes("0 años") && JSON.stringify(piramide.labels[10]).includes("65 y más"), "Grupos en orden de edad (0 años a 65 y más)");
  assert(piramide.labels.length === 11, "Los 11 grupos de la fuente");
  const sumPir = Math.round(piramide.h.data.reduce((a, b) => a + b, 0) + piramide.m.data.reduce((a, b) => a + b, 0));
  assert(sumPir === 2700978, "Suma de barras por sexo y edad = KPI total");
  await capturaTarjeta(page, ".ph-card--protagonista", path.join(OUT, "03_sexo_edad_2026.png"));
  await page.click("#ph-te summary");
  await page.waitForTimeout(200);
  assert(await page.$eval("#ph-tabla-edad", (e) => e.scrollWidth - e.clientWidth) <= 1, "Tabla de 11 grupos completa sin desplazamiento en escritorio");
  const f25 = await page.$$eval("#ph-tabla-edad tbody tr:nth-child(7) td", (t) => t.map((c) => c.textContent.trim()).join("|"));
  assert(f25 === "25–44|20|890,344|33.0%|440,118|49.4%|450,226|50.6%", "Tabla 11 grupos (25–44) con % del total y % del grupo");
  await page.evaluate(() => { document.querySelector(".ph-te-card").id = "ph-te-card"; });
  await capturaTarjeta(page, "#ph-te-card", path.join(OUT, "16_tabla_11_grupos.png"));
  await page.click("#ph-te summary");
  // Ranking
  const rkL = () => page.evaluate(() => Chart.getChart("ph-chart-rank").data.labels.join("|"));
  assert(await rkL() === "1. Querétaro|2. San Juan del Río|3. El Marqués|4. Corregidora|5. Pedro Escobedo", "Ranking: 5 más poblados 2026");
  await page.click('[data-ph-rank="bottom"]');
  await page.waitForTimeout(300);
  assert(await rkL() === "18. San Joaquín|17. Arroyo Seco|16. Landa de Matamoros|15. Peñamiller|14. Tolimán", "Ranking: 5 menos poblados 2026");
  await capturaTarjeta(page, "#ph-ranking", path.join(OUT, "10_ranking_menos_poblados.png"));
  await page.click('[data-ph-rank="top"]');
  await page.screenshot({ path: path.join(OUT, "01_escritorio_estado_2026.png"), fullPage: true });

  // Hover en el mapa (Querétaro)
  await page.locator("#ph-mapa").scrollIntoViewIfNeeded();
  const box = await page.$eval('#ph-mapa path[data-cve="014"]', (p) => { const r = p.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(200);
  const tip = await page.$eval(".ph-mapa__tip", (t) => (t.hidden ? "" : t.textContent));
  assert(tip.includes("Querétaro") && tip.includes("1,243,610"), "Tooltip del mapa: Querétaro 1,243,610 (2026)");
  const mb = await page.$eval("#ph-mapa", (e) => { const r = e.closest(".ph-card").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  await page.screenshot({ path: path.join(OUT, "02_mapa_tooltip.png"), clip: mb });

  // Modo porcentaje
  await page.click('[data-ph-modo="pct"]');
  await page.waitForTimeout(400);
  const sumPct = await page.evaluate(() => {
    const c = Chart.getChart("ph-chart-sexoedad");
    return c.data.datasets[0].data.reduce((a, b) => a + b, 0) + c.data.datasets[1].data.reduce((a, b) => a + b, 0);
  });
  assert(Math.abs(sumPct - 100) < 1e-6, "Modo %: todas las barras suman 100%");
  await page.click('[data-ph-modo="abs"]');

  // Jurisdicción 2 → municipios en cascada
  await page.selectOption("#ph-f-js", "2");
  await page.waitForTimeout(300);
  const munOpts = await page.$$eval("#ph-f-mun option", (o) => o.filter((x) => x.value).map((x) => x.value));
  assert(munOpts.length === 5 && ["001", "005", "012", "016", "017"].every((c) => munOpts.includes(c)), "Cascada: JS 2 muestra sus 5 municipios");
  assert(num(await kpi(page, 1)) === 624937, "KPI JS 2 San Juan del Río 2026 = 624,937");
  assert(await page.$$eval("#ph-mapa path.is-fuera", (p) => p.length) === 13, "Mapa atenúa 13 municipios fuera de JS 2");

  // Clic en mapa = filtrar municipio (Corregidora pertenece a JS 1 → cambia JS)
  const b2 = await page.$eval('#ph-mapa path[data-cve="006"]', (p) => { const r = p.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(b2.x, b2.y);
  await page.waitForTimeout(400);
  assert(await page.$eval("#ph-f-mun", (e) => e.value) === "006", "Clic en mapa selecciona Corregidora");
  assert(await page.$eval("#ph-f-js", (e) => e.value) === "1", "La jurisdicción se ajusta a la del municipio (JS 1)");
  assert(num(await kpi(page, 1)) === 245855, "KPI Corregidora 2026 = 245,855");
  await page.evaluate(() => { document.getElementById("ph-mapa").closest(".ph-card").id = "ph-mapa-card"; });
  await capturaTarjeta(page, "#ph-mapa-card", path.join(OUT, "15_mapa_corregido_Corregidora_2026.png"));
  assert(await page.$$eval("#ph-mapa .ph-mapa__resalte.is-mun .ph-mapa__resalte-linea", (p) => p.length) === 1, "Mapa: Corregidora resaltada con contorno oscuro");

  // Año 2017 en un municipio: crecimiento no disponible
  assert(!(await page.$$eval("#ph-f-mun option", (o) => o.map((x) => x.value))).includes("015"), "Cascada: San Joaquín (JS 3) no aparece con JS 1 activa");
  await page.selectOption("#ph-f-js", "");
  await page.selectOption("#ph-f-mun", "015");
  await page.selectOption("#ph-f-anio", "2017");
  await page.waitForTimeout(400);
  assert(num(await kpi(page, 1)) === 9169, "KPI San Joaquín 2017 = 9,169");
  assert((await kpi(page, 4)) === "No disponible", "Crecimiento 2017 = No disponible");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, "04_escritorio_san_joaquin_2017.png"), fullPage: true });

  // Evolución por sexo y limpiar
  await page.click("#ph-f-limpiar");
  await page.click('[data-ph-evol="sexo"]');
  await page.waitForTimeout(300);
  const evol = await page.evaluate(() => Chart.getChart("ph-chart-evol").data.datasets.map((d) => d.label));
  assert(evol.join() === "Mujeres,Hombres", "Evolución por sexo: Mujeres y Hombres");
  assert(num(await kpi(page, 1)) === 2700978, "Limpiar filtros regresa a estado 2026");

  // ---- ACT26b: Comparativo poblacional por años ----
  const cmpLabels = () => page.evaluate(() => Chart.getChart("ph-chart-cmp").data.labels.join());
  assert(await cmpLabels() === "2022,2023,2024,2025,2026", "Comparativo: por defecto 2022-2026");
  await page.click("#ph-cmp-todos");
  await page.waitForTimeout(400);
  const cmpData = await page.evaluate(() => Chart.getChart("ph-chart-cmp").data.datasets.map((d) => d.data.map(Math.round)));
  assert(cmpData[0].join() === "2233603,2298993,2364645,2419819,2462684,2508214,2557915,2606698,2654421,2700978", "Mostrar todos: 10 barras = totales anuales SUIVE");
  assert(cmpData[1][9] === 1376643 && cmpData[2][9] === 1324335, "2026: Mujeres 1,376,643 y Hombres 1,324,335");
  await capturaTarjeta(page, "#ph-cmp", path.join(OUT, "08_comparativo_10_anios.png"));
  await page.click("#ph-cmp-ninguno");
  for (const a of ["2017", "2020", "2023", "2026"]) await page.click(`[data-ph-cmp-anio="${a}"]`);
  await page.selectOption("#ph-f-js", "2");
  await page.waitForTimeout(400);
  assert(await cmpLabels() === "2017,2020,2023,2026", "Selección libre de años: 2017, 2020, 2023, 2026");
  const filaRef = await page.$$eval("#ph-cmp-tabla tbody tr", (t) => t.map((r) => r.cells[1].textContent.trim()));
  assert(filaRef[0] === "Año base" && filaRef[1].includes("vs 2017") && filaRef[1].includes("3 años"), "Tabla indica la referencia (vs 2017, 3 años)");
  const jsTot = await page.evaluate(() => Chart.getChart("ph-chart-cmp").data.datasets[0].data.map(Math.round));
  assert(jsTot.join() === "567512,591682,608665,624937", "JS 2 San Juan del Río: 567,512 / 591,682 / 608,665 / 624,937");
  assert(await page.$eval("#ph-f-anio", (e) => e.value) === "2026" && await page.$eval("#ph-mapa-titulo", (e) => e.textContent.includes("2026")), "Sexo y edad y mapa siguen con un solo año (2026)");
  const lblsOk = await page.evaluate(() => { const c = Chart.getChart("ph-chart-cmp"); return c.getDatasetMeta(0).data.every((b) => b.width > 8); });
  assert(lblsOk, "Barras con ancho suficiente para leerse");
  await capturaTarjeta(page, "#ph-cmp", path.join(OUT, "09_comparativo_js2_salteado.png"));
  await page.click("#ph-f-limpiar");
  await page.waitForTimeout(300);

  // ---- ACT26c: Reporte PDF (estado, jurisdicción y municipio) ----
  const r1 = await verificarPDF(page, "11_reporte_ejemplo_Queretaro_2026.pdf", ESPERADOS.estado_2026,
    ["Estado de Querétaro", "Años del comparativo 2022, 2023, 2024, 2025, 2026", "5 menos poblados", "Territorio", "no tres poblaciones independientes", "Población total (mujeres + hombres)"], "PDF estado 2026");
  assert(r1.paginas === 5, "PDF estado 2026: conserva la estructura de 5 páginas");
  assert(ESPERADOS.estado_2026.ranking_bottom.every((n) => r1.txt.includes(n)), "PDF estado: incluye los 5 menos poblados");
  assert(r1.rep.contenido.mapa && r1.rep.contenido.logo, "PDF estado: incluye mapa y logotipo");
  await page.selectOption("#ph-f-js", "4");
  await page.click("#ph-cmp-ninguno"); await page.click('[data-ph-cmp-anio="2020"]');
  await page.waitForTimeout(300);
  await verificarPDF(page, "12_reporte_JS4_Jalpan_2026.pdf", ESPERADOS.js4_2026,
    ["Jurisdicción Sanitaria 4 Jalpan", "se requieren al menos dos para calcular diferencias", "tiene 4 municipios: se muestran todos"], "PDF JS 4 (1 año en comparativo)");
  await page.selectOption("#ph-f-mun", "010");
  await page.click("#ph-cmp-ninguno");
  await page.selectOption("#ph-f-anio", "2017");
  await page.waitForTimeout(300);
  const r3 = await verificarPDF(page, "13_reporte_Landa_2017.pdf", ESPERADOS.mun010_2017,
    ["Landa de Matamoros", "No aplica: no se seleccionaron años", "ocupa el lugar 16 de 18", "primer año de la serie"], "PDF municipio 010 2017 (sin comparativo)");
  assert(r3.rep.contenido.posicion && r3.rep.contenido.posicion.enEstado === 16 && r3.rep.contenido.posicion.enJurisdiccion === 3, "PDF municipio: posición 16/18 estado y 3/4 jurisdicción");
  assert(/Reporte generado: Reporte_poblacion_SUIVE_Landa_de_Matamoros_2017\.pdf/.test(await page.textContent("#ph-pdf-estado")), "Mensaje de confirmación visible tras generar el PDF");
  await page.click("#ph-f-limpiar");
  await page.waitForTimeout(300);

  // ---- Regresión ASIS 2025 ----
  await page.click("#ph-tab-asis");
  await page.waitForTimeout(600);
  assert(!(await page.$eval("#ph-panel-asis", (e) => e.hidden)), "Pestaña ASIS 2025 visible al activarla");
  const totASIS = await page.$eval("#kpi-grid .indicator-card:nth-child(1) .indicator-card__value", (e) => e.textContent.trim());
  assert(num(totASIS) === 2655609, "Sección ASIS 2025 sin cambios: total 2,655,609");
  const filas = await page.$$eval("#localidades-body tr", (t) => t.length);
  assert(filas === 80, "Tabla de localidades ASIS muestra 80 filas");
  const anchoPir = await page.evaluate(() => Chart.getChart("chart-piramide").width);
  assert(anchoPir > 300, "Pirámide ASIS se redimensiona al mostrar la pestaña");
  await page.screenshot({ path: path.join(OUT, "05_asis_2025_regresion.png"), fullPage: false });
  assert(page._preexistentes.length === 0, "Pirámide ASIS 2025 sin el TypeError preexistente de ACT25 (corregido)");
  resultados.push({ ok: true, msg: `Informativo: ${page._preexistentes.length} error(es) en la pirámide ASIS 2025 (el error preexistente de ACT25 se corrigió en ACT26; esperado 0)` });
  assert(page._errores.length === 0, "Sin errores NUEVOS de consola en escritorio" + (page._errores.length ? ": " + page._errores.join(" | ") : ""));

  // ================= TABLETA Y TELÉFONO =================
  for (const [nombre, vp] of [["06_tableta", { width: 820, height: 1180 }], ["07_telefono", { width: 390, height: 844 }]]) {
    const p = await nuevaPagina(browser, vp);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 1, `${nombre}: sin desplazamiento horizontal (exceso ${overflow}px)`);
    assert(num(await kpi(p, 1)) === 2700978, `${nombre}: KPI total correcto`);
    await p.screenshot({ path: path.join(OUT, `${nombre}.png`), fullPage: true });
    // Comparativo en este tamaño de pantalla
    await p.click("#ph-cmp-todos");
    await p.waitForTimeout(400);
    const horiz = await p.evaluate(() => Chart.getChart("ph-chart-cmp").options.indexAxis);
    if (vp.width < 640) assert(horiz === "y", `${nombre}: comparativo en barras horizontales para legibilidad`);
    const ov2 = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(ov2 <= 1, `${nombre}: comparativo sin desplazamiento horizontal de la página`);
    await capturaTarjeta(p, "#ph-cmp", path.join(OUT, `${nombre}_comparativo.png`));
    await p.click("#ph-cmp-ultimos");
    await p.waitForTimeout(300);
    // ACT26c: el PDF también se genera desde este tamaño de pantalla
    await verificarPDF(p, `${nombre}_reporte.pdf`, ESPERADOS.estado_2026, [], `${nombre}: PDF`);
    const rkOk = await p.evaluate(() => Chart.getChart("ph-chart-rank").data.labels.length === 5);
    assert(rkOk, `${nombre}: ranking visible con 5 municipios`);
    assert(p._errores.length === 0, `${nombre}: sin errores NUEVOS de consola` + (p._errores.length ? ": " + p._errores.join(" | ") : ""));
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "resultados_playwright.json"), JSON.stringify(resultados, null, 2));
  const fallas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - fallas}/${resultados.length} verificaciones OK`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
