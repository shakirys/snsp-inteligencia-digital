/**
 * Validación en navegador real (Chromium vía Playwright) de ACT09 —
 * ajustes visuales en las gráficas de Morbilidad: selector Top N en el
 * panel de Padecimientos (predeterminado Top 10, sin tocar totales),
 * Municipio/Jurisdicción/Grupo de edad/Sexo siempre completos, grosor de
 * barra uniforme, y separación clara entre categorías en comparativo.
 * Recorre 2025, 2026 y ambos años.
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
  async function chartLabelsCount(canvasId) {
    return page.evaluate((id) => {
      const inst = Chart.getChart(document.getElementById(id));
      return inst ? inst.data.labels.length : -1;
    }, canvasId);
  }
  async function chartMaxBarThickness(canvasId, datasetIndex) {
    return page.evaluate(({ id, i }) => {
      const inst = Chart.getChart(document.getElementById(id));
      return inst ? inst.data.datasets[i || 0].maxBarThickness : null;
    }, { id: canvasId, i: datasetIndex });
  }
  async function totalCasosKPI() {
    return page.evaluate(() => {
      const txt = document.getElementById("kpi-grid").textContent.replace(/\s+/g, " ");
      const m = txt.match(/Casos totales\s*([\d,]+)/);
      return m ? m[1] : null;
    });
  }

  // ================= Top N por defecto = Top 10 =================
  await fijarAnios(["2025"]);
  await page.waitForTimeout(150);
  const selValorDefault = await page.$eval("#morb-padecimientos-topn", (s) => s.value);
  assert(selValorDefault === "10", "El selector Top N debe venir predeterminado en Top 10");
  assert((await chartLabelsCount("morb-chart-padecimientos")) === 10, "[2025] Con Top 10 predeterminado, Padecimientos debe dibujar 10 barras");

  const totalTop10 = await totalCasosKPI();

  // ---- Cambiar a Todos no debe tocar el KPI de Casos totales ----
  await page.selectOption("#morb-padecimientos-topn", "todos");
  await page.waitForTimeout(200);
  const totalTodos = await totalCasosKPI();
  const labelsTodos = await chartLabelsCount("morb-chart-padecimientos");
  assert(labelsTodos > 10, `[2025] Con Todos, Padecimientos debe mostrar más de 10 categorías (trae ${labelsTodos})`);
  assert(totalTodos === totalTop10, `[2025] Cambiar Top N no debe modificar Casos totales (Top10=${totalTop10}, Todos=${totalTodos})`);

  // ---- Top 15 / Top 20 ----
  await page.selectOption("#morb-padecimientos-topn", "15");
  await page.waitForTimeout(200);
  assert((await chartLabelsCount("morb-chart-padecimientos")) === 15, "[2025] Con Top 15, Padecimientos debe dibujar 15 barras");
  assert((await totalCasosKPI()) === totalTop10, "[2025] Top 15 no debe modificar Casos totales");

  await page.selectOption("#morb-padecimientos-topn", "20");
  await page.waitForTimeout(200);
  assert((await chartLabelsCount("morb-chart-padecimientos")) === 20, "[2025] Con Top 20, Padecimientos debe dibujar 20 barras");
  assert((await totalCasosKPI()) === totalTop10, "[2025] Top 20 no debe modificar Casos totales");

  // ---- Municipio/Jurisdicción/Grupo de edad/Sexo: siempre completos, sin importar el Top N ----
  assert((await chartLabelsCount("morb-chart-municipio")) === 18, "[2025] Municipio debe seguir mostrando 18 municipios con Top 20 de Padecimientos activo");
  const labelsGrupoEdad = await chartLabelsCount("morb-chart-grupoedad");
  const labelsSexo = await chartLabelsCount("morb-chart-sexo");
  assert(labelsSexo === 2, "[2025] Sexo debe seguir mostrando 2 categorías (Femenino/Masculino)");
  console.log(`[2025] Grupo de edad muestra ${labelsGrupoEdad} categorías reales (independiente del Top N de Padecimientos)`);

  await page.selectOption("#morb-padecimientos-topn", "10");
  await page.waitForTimeout(150);

  // ================= 2026 =================
  await fijarAnios(["2026"]);
  await page.waitForTimeout(150);
  assert((await chartLabelsCount("morb-chart-municipio")) === 18, "[2026] Municipio debe mostrar 18 municipios");
  assert((await chartLabelsCount("morb-chart-padecimientos")) === 10, "[2026] Top 10 sigue aplicando (predeterminado tras recargar filtros de año)");

  // ================= Ambos años: grosor uniforme + separación =================
  await fijarAnios(["2025", "2026"]);
  await page.waitForTimeout(200);
  assert((await chartLabelsCount("morb-chart-municipio")) === 18, "[ambos años] Municipio sigue mostrando 18 municipios");
  assert((await chartLabelsCount("morb-chart-sexo")) === 2, "[ambos años] Sexo sigue mostrando 2 categorías");

  const grosorClasico = await chartMaxBarThickness("morb-chart-institucion", 0); // institución no cambia con comparativo mode aquí, pero probamos con municipio comparativo abajo
  const grosorMunicipioA = await chartMaxBarThickness("morb-chart-municipio", 0);
  const grosorMunicipioB = await chartMaxBarThickness("morb-chart-municipio", 1);
  assert(grosorMunicipioA === grosorMunicipioB, "[ambos años] Las barras de 2025 y 2026 (Casos por municipio) deben tener el mismo grosor entre sí");

  const grosorPrincipal = await chartMaxBarThickness("morb-chart", 0);
  assert(grosorPrincipal === grosorMunicipioA, "El grosor de barra debe ser el MISMO en la gráfica dinámica y en el Panorama de Casos (uniforme en toda la página)");

  const spacingInfo = await page.evaluate(() => {
    const inst = Chart.getChart(document.getElementById("morb-chart-municipio"));
    return { barPercentage: inst.data.datasets[0].barPercentage, categoryPercentage: inst.data.datasets[0].categoryPercentage };
  });
  console.log("Casos por municipio (comparativo) — barPercentage:", spacingInfo.barPercentage, "categoryPercentage:", spacingInfo.categoryPercentage);
  assert(spacingInfo.barPercentage > spacingInfo.categoryPercentage, "En comparativo, las barras dentro de una categoría deben ir más pegadas (barPercentage alto) que la separación entre categorías (categoryPercentage más bajo)");

  // ---- Alto adaptado: gráfica con más categorías debe medir más que una con menos ----
  const altoMunicipio = await page.$eval("#morb-wrap-municipio", (el) => parseFloat(el.style.height));
  const altoSexo = await page.$eval("#morb-wrap-sexo", (el) => parseFloat(el.style.height));
  console.log(`Alto Casos por municipio (18 cat.): ${altoMunicipio}px — Alto Casos por sexo (2 cat.): ${altoSexo}px`);
  assert(altoMunicipio > altoSexo, "Casos por municipio (18 categorías) debe medir más alto que Casos por sexo (2 categorías)");
  assert(altoSexo < 400, "Casos por sexo no debe tener un alto exagerado con sólo 2 categorías");

  const erroresRelevantes = erroresJS.filter((e) => !/Failed to load resource/i.test(e));
  console.log("\nErrores de JS relevantes:", erroresRelevantes.length);
  erroresRelevantes.forEach((e) => console.log("  -", e));
  assert(erroresRelevantes.length === 0, "Sin errores de JS relevantes en consola durante toda la prueba");

  // Captura para inspección visual
  await fijarAnios(["2025"]);
  await page.waitForTimeout(200);
  await page.screenshot({ path: "act09_morbilidad_2025.png", fullPage: true });

  await browser.close();
  console.log("\n=== VALIDACIÓN ACT09 (AJUSTES VISUALES DE MORBILIDAD, NAVEGADOR REAL) COMPLETADA SIN ERRORES ===");
})().catch((e) => { console.error(e); process.exit(1); });
