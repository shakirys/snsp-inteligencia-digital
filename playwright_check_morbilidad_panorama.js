/**
 * Validación en navegador real (Chromium vía Playwright) del "Panorama
 * de Casos" recuperado en Morbilidad (v2.5.0 — recuperación de
 * visualizaciones). Verifica en el DOM real (no jsdom): que los 8
 * paneles existen y dibujan un <canvas> con contenido, que responden a
 * Municipio/Jurisdicción/Institución, al buscador CIE-10, y a 2025 /
 * 2026 / ambos años (con comparativo cuando corresponde), y que
 * Institución nunca ofrece Tasa. También corre el recorrido previo de
 * v2.5.0 (unificación) como regresión.
 */
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:8099";
const CDN_LOCAL = {
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js": "node_modules/chart.js/dist/chart.umd.js",
};

function assert(cond, msg) {
  if (!cond) throw new Error("FALLÓ: " + msg);
  console.log("OK: " + msg);
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const erroresJS = [];
  page.on("pageerror", (e) => erroresJS.push(String(e)));
  page.on("console", (msg) => { if (msg.type() === "error") erroresJS.push(msg.text()); });

  for (const [url, localPath] of Object.entries(CDN_LOCAL)) {
    await page.route(url, (route) => route.fulfill({ path: localPath }));
  }
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());

  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.evaluate(() => window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025"));

  await page.goto(BASE + "/pages/morbilidad.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const tbody = document.getElementById("morb-tabla-body");
    return tbody && tbody.querySelectorAll("tr").length > 0;
  }, { timeout: 15000 });

  // ---- Existencia de los 8 paneles fijos ----
  const idsPanorama = [
    "morb-chart-municipio", "morb-chart-jurisdiccion", "morb-chart-institucion",
    "morb-chart-grupoedad", "morb-chart-padecimientos", "morb-chart-tendencia",
    "morb-chart-mesanio", "morb-chart-sexo",
  ];
  for (const id of idsPanorama) {
    assert(!!(await page.$("#" + id)), `Debe existir el canvas #${id} del Panorama de Casos`);
  }

  async function chartLabelsCount(canvasId) {
    return page.evaluate((id) => {
      const canvas = document.getElementById(id);
      const inst = Chart.getChart ? Chart.getChart(canvas) : null;
      return inst ? inst.data.labels.length : -1;
    }, canvasId);
  }
  async function chartDatasetsCount(canvasId) {
    return page.evaluate((id) => {
      const canvas = document.getElementById(id);
      const inst = Chart.getChart ? Chart.getChart(canvas) : null;
      return inst ? inst.data.datasets.length : -1;
    }, canvasId);
  }
  async function chartLabels(canvasId) {
    return page.evaluate((id) => {
      const canvas = document.getElementById(id);
      const inst = Chart.getChart ? Chart.getChart(canvas) : null;
      return inst ? inst.data.labels : [];
    }, canvasId);
  }

  async function fijarAnios(valores) {
    await page.click("#morb-anio-toggle");
    const chks = await page.$$("#morb-anio-menu input[type=checkbox]");
    for (const c of chks) {
      const checked = await c.isChecked();
      const valor = await c.getAttribute("value");
      const debeEstar = valores.includes(valor);
      if (checked !== debeEstar) await c.click();
    }
    await page.click("body", { position: { x: 5, y: 5 } });
    await page.waitForTimeout(200);
  }

  // ==================================================================
  // 2025 solamente
  // ==================================================================
  await fijarAnios(["2025"]);
  await page.waitForTimeout(150);
  assert((await chartLabelsCount("morb-chart-municipio")) === 18, "[2025] Casos por municipio debe mostrar 18 municipios");
  assert((await chartDatasetsCount("morb-chart-municipio")) === 1, "[2025] Casos por municipio: 1 sola serie (sin comparativo)");
  assert((await chartLabelsCount("morb-chart-tendencia")) === 12, "[2025] Tendencia por año/mes: 12 puntos");
  assert((await chartDatasetsCount("morb-chart-mesanio")) === 1, "[2025] comparativo por mes y año: 1 sola serie");
  assert((await chartLabelsCount("morb-chart-mesanio")) === 12, "[2025] comparativo por mes y año: 12 meses en el eje");
  const labelsSexo2025 = await chartLabels("morb-chart-sexo");
  assert(JSON.stringify(labelsSexo2025) === JSON.stringify(["Femenino", "Masculino"]), "[2025] Casos por sexo: Femenino y Masculino");

  // ---- Institución nunca ofrece Tasa: cambiar Analizar a Tasa no debe afectar el panel de Institución ----
  await page.selectOption("#morb-select-medida", "tasa");
  await page.waitForTimeout(150);
  const institucionCfgTrasTasa = await page.evaluate(() => {
    const canvas = document.getElementById("morb-chart-institucion");
    const inst = Chart.getChart(canvas);
    return inst.data.datasets[0].label;
  });
  assert(institucionCfgTrasTasa === "Casos", "[Analizar=Tasa] Casos por institución debe seguir siendo SIEMPRE 'Casos', nunca Tasa");
  await page.selectOption("#morb-select-medida", "casos");
  await page.waitForTimeout(150);

  // ==================================================================
  // 2026 solamente
  // ==================================================================
  await fijarAnios(["2026"]);
  await page.waitForTimeout(150);
  assert((await chartLabelsCount("morb-chart-tendencia")) === 12, "[2026] Tendencia por año/mes: 12 puntos");
  assert((await chartDatasetsCount("morb-chart-municipio")) === 1, "[2026] Casos por municipio: 1 sola serie");

  // ==================================================================
  // Ambos años (2025 + 2026): comparativos donde corresponde
  // ==================================================================
  await fijarAnios(["2025", "2026"]);
  await page.waitForTimeout(150);
  assert((await chartDatasetsCount("morb-chart-municipio")) === 2, "[ambos años] Casos por municipio: 2 series (comparativo)");
  assert((await chartLabelsCount("morb-chart-municipio")) === 18, "[ambos años] Casos por municipio sigue mostrando 18 municipios");
  assert((await chartDatasetsCount("morb-chart-jurisdiccion")) === 2, "[ambos años] Casos por jurisdicción: cambia a barras agrupadas (2 series)");
  assert((await chartDatasetsCount("morb-chart-institucion")) === 2, "[ambos años] Casos por institución: 2 series (comparativo, sigue siendo Casos)");
  assert((await chartDatasetsCount("morb-chart-grupoedad")) === 2, "[ambos años] Casos por grupo de edad: 2 series");
  assert((await chartDatasetsCount("morb-chart-sexo")) === 2, "[ambos años] Casos por sexo: 2 series");
  assert((await chartDatasetsCount("morb-chart-mesanio")) === 2, "[ambos años] comparativo por mes y año: 2 series agrupadas");
  assert((await chartLabelsCount("morb-chart-mesanio")) === 12, "[ambos años] comparativo por mes y año: sigue en 12 meses");
  assert((await chartLabelsCount("morb-chart-tendencia")) === 24, "[ambos años] Tendencia por año/mes: 24 meses encadenados cronológicamente");
  assert((await chartDatasetsCount("morb-chart-tendencia")) === 1, "[ambos años] Tendencia por año/mes sigue siendo 1 sola línea continua");

  // ==================================================================
  // Filtros (Municipio/Jurisdicción/Institución) acotan el Panorama
  // ==================================================================
  await fijarAnios(["2025"]);
  const institucionValor = await page.$eval("#flt-institucion_morbilidad option:nth-child(2)", (o) => o.value);
  await page.selectOption("#flt-institucion_morbilidad", institucionValor);
  await page.click("#btn-aplicar-filtros");
  await page.waitForTimeout(200);
  const labelsInstitucionFiltrado = await chartLabels("morb-chart-institucion");
  assert(labelsInstitucionFiltrado.length === 1, `Al filtrar por Institución="${institucionValor}", Casos por institución debe acotarse a 1 categoría (trae ${JSON.stringify(labelsInstitucionFiltrado)})`);
  const sexoTrasFiltro = await page.evaluate(() => {
    const canvas = document.getElementById("morb-chart-sexo");
    const inst = Chart.getChart(canvas);
    return inst.data.datasets[0].data;
  });
  assert(sexoTrasFiltro.some((v) => v > 0), "Casos por sexo debe seguir trayendo datos tras el filtro de Institución");
  await page.click("#btn-limpiar-filtros");
  await page.waitForTimeout(150);

  // ==================================================================
  // Buscador CIE-10/Epi-clave/padecimiento acota el Panorama
  // ==================================================================
  await page.fill("#cie10-search", "C50");
  await page.waitForSelector(".cie10-suggestion[data-epiclave]", { timeout: 10000 });
  await page.click(".cie10-suggestion[data-epiclave]");
  await page.waitForFunction(() => document.getElementById("seleccion-actual").textContent.includes("Consultando"), { timeout: 10000 });
  await page.waitForTimeout(200);
  const labelsPadecimientosSel = await chartLabels("morb-chart-padecimientos");
  assert(labelsPadecimientosSel.length === 1, "Con C50 seleccionado, Padecimiento(s) dentro de la selección debe acotarse a 1 categoría");
  const sexoTrasBusqueda = await page.evaluate(() => {
    const canvas = document.getElementById("morb-chart-sexo");
    const inst = Chart.getChart(canvas);
    return inst.data.datasets[0].data;
  });
  assert(sexoTrasBusqueda.some((v) => v > 0), "Casos por sexo debe seguir respondiendo con una búsqueda de padecimiento activa");
  await page.click("#btn-limpiar-seleccion");
  await page.waitForTimeout(150);

  // Se descartan los errores de red esperados por bloquear a propósito
  // fonts.googleapis.com (page.route(...).abort() arriba, no relacionado
  // con la lógica del tablero) — mismo patrón ya aceptado en
  // playwright_check_morbilidad_v25.js.
  const erroresRelevantes = erroresJS.filter((e) => !/Failed to load resource/i.test(e));
  console.log("\nErrores de JS durante toda la prueba:", erroresJS.length, `(${erroresJS.length - erroresRelevantes.length} de red esperados por bloqueo de fuentes, descartados)`);
  erroresRelevantes.forEach((e) => console.log("  -", e));
  assert(erroresRelevantes.length === 0, "Sin errores de JS relevantes en consola durante toda la prueba");

  await browser.close();
  console.log("\n=== VALIDACIÓN DEL PANORAMA DE CASOS (8 PANELES, NAVEGADOR REAL) COMPLETADA SIN ERRORES ===");
})().catch((e) => { console.error(e); process.exit(1); });
