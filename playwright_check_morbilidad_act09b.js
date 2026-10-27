/**
 * Validación en navegador real (Chromium vía Playwright) del ajuste de
 * seguimiento a ACT09 en Morbilidad:
 *   1) Top N (10/15/20/Todos, predeterminado Top 10) también en la
 *      gráfica/tabla PRINCIPAL, sin tocar KPI ni totales.
 *   2) Tendencia por año/mes: con 2025+2026, 2 series separadas sobre los
 *      mismos 12 meses (no una sola línea de 24 meses encadenados).
 *   3) Comparativo por mes y año: con 2025+2026 (explícito o implícito,
 *      sin ningún año marcado), 2 barras por mes (nunca sumadas en 1).
 *   4) "Sin información" (meses de 2026 aún no cargados) se distingue de
 *      "0 casos": null en la serie, nunca 0.
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
  async function chartCfg(canvasId) {
    return page.evaluate((id) => {
      const inst = Chart.getChart(document.getElementById(id));
      if (!inst) return null;
      return {
        labels: inst.data.labels,
        datasets: inst.data.datasets.map((d) => ({ label: d.label, data: d.data })),
      };
    }, canvasId);
  }
  async function totalCasosKPI() {
    return page.evaluate(() => {
      const txt = document.getElementById("kpi-grid").textContent.replace(/\s+/g, " ");
      const m = txt.match(/Casos totales\s*([\d,]+)/);
      return m ? m[1] : null;
    });
  }
  async function categoriasEncontradasKPI() {
    return page.evaluate(() => {
      const txt = document.getElementById("kpi-grid").textContent.replace(/\s+/g, " ");
      const m = txt.match(/Categorías encontradas\s*([\d,]+)/);
      return m ? m[1] : null;
    });
  }

  // ================= Top N en la gráfica/tabla PRINCIPAL (2025) =================
  await fijarAnios(["2025"]);
  await page.waitForTimeout(150);
  const topNPrincipalDefault = await page.$eval("#morb-principal-topn", (s) => s.value);
  assert(topNPrincipalDefault === "10", "El selector Top N de la gráfica principal debe venir predeterminado en Top 10");
  const cfgPrincipal10 = await chartCfg("morb-chart");
  assert(cfgPrincipal10.labels.length === 10, "[2025] Con Top 10 predeterminado, la gráfica principal (Por=Padecimiento) debe dibujar 10 barras");
  const filasTabla10 = await page.$$eval("#morb-tabla-body tr", (trs) => trs.length);
  assert(filasTabla10 === 10, "[2025] La tabla principal debe traer 10 filas junto con las 10 barras (Top N aplicado a ambas a la vez)");

  const totalConTop10 = await totalCasosKPI();
  const categoriasConTop10 = await categoriasEncontradasKPI();

  await page.selectOption("#morb-principal-topn", "todos");
  await page.waitForTimeout(200);
  const cfgPrincipalTodos = await chartCfg("morb-chart");
  assert(cfgPrincipalTodos.labels.length > 10, "[2025] Con Todos, la gráfica principal debe mostrar más de 10 categorías");
  assert((await totalCasosKPI()) === totalConTop10, "[2025] Cambiar el Top N de la gráfica principal NO debe modificar el KPI de Casos totales");
  assert((await categoriasEncontradasKPI()) === categoriasConTop10, "[2025] El KPI 'Categorías encontradas' NO debe cambiar entre Top 10 y Todos (reporta el total real, no el recorte)");

  await page.selectOption("#morb-principal-topn", "15");
  await page.waitForTimeout(200);
  assert((await chartCfg("morb-chart")).labels.length === 15, "[2025] Con Top 15, la gráfica principal debe dibujar 15 barras");
  assert((await totalCasosKPI()) === totalConTop10, "[2025] Top 15 en la gráfica principal no debe modificar Casos totales");

  await page.selectOption("#morb-principal-topn", "20");
  await page.waitForTimeout(200);
  assert((await chartCfg("morb-chart")).labels.length === 20, "[2025] Con Top 20, la gráfica principal debe dibujar 20 barras");
  assert((await totalCasosKPI()) === totalConTop10, "[2025] Top 20 en la gráfica principal no debe modificar Casos totales");

  // Con Por != Padecimiento, el selector se deshabilita y NO recorta
  await page.selectOption("#morb-principal-topn", "10");
  await page.selectOption("#morb-select-dim", "municipio");
  await page.waitForTimeout(200);
  const disabledMunicipio = await page.$eval("#morb-principal-topn", (s) => s.disabled);
  assert(disabledMunicipio === true, "[2025] Con Por=Municipio, el selector Top N de la gráfica principal debe deshabilitarse");
  assert((await chartCfg("morb-chart")).labels.length === 18, "[2025] Con Por=Municipio, la gráfica principal sigue mostrando los 18 municipios sin importar el Top N");
  await page.selectOption("#morb-select-dim", "padecimiento");
  await page.waitForTimeout(200);
  assert((await page.$eval("#morb-principal-topn", (s) => s.disabled)) === false, "[2025] Al volver a Por=Padecimiento, el selector Top N principal vuelve a habilitarse");

  // ================= 2026: mismo comportamiento =================
  await fijarAnios(["2026"]);
  await page.waitForTimeout(150);
  assert((await page.$eval("#morb-principal-topn", (s) => s.value)) === "10", "[2026] El Top N principal sigue predeterminado en Top 10 al cambiar de año");
  assert((await chartCfg("morb-chart")).labels.length === 10, "[2026] Top 10 sigue aplicando en la gráfica principal");

  // ================= Ambos años: Tendencia y Comparativo por mes/año =================
  await fijarAnios(["2025", "2026"]);
  await page.waitForTimeout(200);

  const cfgTendencia = await chartCfg("morb-chart-tendencia");
  assert(cfgTendencia.labels.length === 12, "[ambos años] Tendencia por año/mes debe usar los mismos 12 meses (Ene-Dic), no 24 encadenados");
  assert(cfgTendencia.datasets.length === 2, "[ambos años] Tendencia por año/mes debe traer 2 series separadas (2025 y 2026), no una sola línea");
  assert(cfgTendencia.datasets[0].label === "2025" && cfgTendencia.datasets[1].label === "2026", "[ambos años] Las series de Tendencia deben estar identificadas como 2025 y 2026");

  const serieTendencia2026 = cfgTendencia.datasets[1].data;
  console.log("Serie Tendencia 2026:", serieTendencia2026);
  assert(serieTendencia2026.slice(0, 8).every((v) => v !== null), "[ambos años] Tendencia 2026 debe traer valor real Ene-Ago (meses cargados)");
  assert(serieTendencia2026.slice(8).every((v) => v === null), "[ambos años] Tendencia 2026 debe dejar en null (no 0) Sep-Dic (meses aún sin cargar)");
  assert(cfgTendencia.datasets[0].data.every((v) => v !== null), "[ambos años] Tendencia 2025 (12 meses completos) no debe traer ningún null");

  const cfgMesAnio = await chartCfg("morb-chart-mesanio");
  assert(cfgMesAnio.labels.length === 12, "[ambos años] Comparativo por mes y año debe traer 12 meses");
  assert(cfgMesAnio.datasets.length === 2, "[ambos años] Comparativo por mes y año debe traer 2 series (2025/2026), nunca sumadas en 1 sola barra");
  const serieMesAnio2026 = cfgMesAnio.datasets[1].data;
  assert(serieMesAnio2026.slice(0, 8).every((v) => v !== null), "[ambos años] Comparativo por mes y año 2026 debe traer valor real Ene-Ago");
  assert(serieMesAnio2026.slice(8).every((v) => v === null), "[ambos años] Comparativo por mes y año 2026 debe dejar Sep-Dic en null (no 0)");

  // ================= Sin ningún año marcado (alcance implícito: ambos) =================
  await fijarAnios([]);
  await page.waitForTimeout(200);
  const cfgMesAnioImplicito = await chartCfg("morb-chart-mesanio");
  assert(cfgMesAnioImplicito.datasets.length === 2, "[sin año marcado] Comparativo por mes y año debe seguir agrupando 2025/2026, nunca sumarlos en 1 sola barra");
  const cfgTendenciaImplicito = await chartCfg("morb-chart-tendencia");
  assert(cfgTendenciaImplicito.labels.length === 12 && cfgTendenciaImplicito.datasets.length === 2, "[sin año marcado] Tendencia por año/mes también debe traer 2 series sobre 12 meses");

  const erroresRelevantes = erroresJS.filter((e) => !/Failed to load resource/i.test(e));
  console.log("\nErrores de JS relevantes:", erroresRelevantes.length);
  erroresRelevantes.forEach((e) => console.log("  -", e));
  assert(erroresRelevantes.length === 0, "Sin errores de JS relevantes en consola durante toda la prueba");

  await browser.close();
  console.log("\n=== VALIDACIÓN AJUSTE DE SEGUIMIENTO A ACT09 (NAVEGADOR REAL) COMPLETADA SIN ERRORES ===");
})().catch((e) => { console.error(e); process.exit(1); });
