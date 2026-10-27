/**
 * Validación en navegador real (Chromium vía Playwright) de v2.5.0:
 *   - Versión visible v2.5.0 · demo en sidebar/topbar y en Morbilidad.
 *   - Morbilidad: panel nuevo "Analizar / Por" (Casos/Población/Tasa)
 *     renderiza con datos reales y responde a ambos selectores.
 *   - Morbilidad: la búsqueda CIE-10/Epi-clave existente sigue funcionando
 *     sin cambios (regresión).
 */
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:8099";
const CDN_LOCAL = {
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js": "node_modules/chart.js/dist/chart.umd.js",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js": "node_modules/xlsx/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js": "node_modules/jspdf/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js": "node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js",
};

function assert(cond, msg) {
  if (!cond) throw new Error("FALLÓ: " + msg);
  console.log("OK: " + msg);
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (msg) => { if (msg.type() === "error") errores.push(msg.text()); });

  for (const [url, localPath] of Object.entries(CDN_LOCAL)) {
    await page.route(url, (route) => route.fulfill({ path: localPath }));
  }

  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.evaluate(() => window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025"));

  await page.goto(BASE + "/dashboard.html", { waitUntil: "networkidle" });
  const verSidebar = await page.$eval("#sidebar", (el) => el.textContent).catch(() => "");
  assert(verSidebar.includes("v2.5.0"), "Sidebar muestra v2.5.0 en el dashboard");
  assert(!verSidebar.includes("2.4.1"), "Sidebar NO muestra 2.4.1");

  await page.goto(BASE + "/pages/morbilidad.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#morb-cp-card", { state: "visible", timeout: 15000 });

  const verModulo = await page.$eval("#version-tag-module", (el) => el.textContent.trim());
  assert(verModulo === "2.5.0", `version-tag-module = "${verModulo}" (esperado 2.5.0)`);

  // ---- Panel nuevo: Analizar/Por ----
  await page.waitForFunction(() => {
    const tbody = document.getElementById("morb-cp-tabla-body");
    return tbody && tbody.querySelectorAll("tr").length > 0;
  }, { timeout: 15000 });

  const filasIniciales = await page.$$eval("#morb-cp-tabla-body tr", (trs) => trs.length);
  const headInicial = await page.$eval("#morb-cp-tabla-head", (el) => el.textContent.trim());
  console.log("Filas iniciales (Por=Padecimiento):", filasIniciales);
  console.log("Encabezado inicial:", headInicial);
  assert(filasIniciales > 100, "Con Por=Padecimiento debe haber más de 100 categorías (padecimientos reales)");
  assert(headInicial.includes("Casos"), "Por defecto Analizar=Casos");

  await page.selectOption("#morb-cp-select-dim", "municipio");
  await page.waitForTimeout(300);
  const filasMunicipio = await page.$$eval("#morb-cp-tabla-body tr", (trs) => trs.length);
  console.log("Filas tras Por=Municipio:", filasMunicipio);
  assert(filasMunicipio > 0 && filasMunicipio <= 18, "Por=Municipio no debe exceder los 18 municipios de Querétaro");

  const tasaHabilitada = await page.$eval('#morb-cp-select-medida option[value="tasa"]', (o) => !o.disabled);
  assert(tasaHabilitada, "Tasa debe estar habilitada (BASE_POBLACION real trae Año+Municipio+Grupo de edad+Población)");

  await page.selectOption("#morb-cp-select-medida", "tasa");
  await page.waitForTimeout(300);
  const headTasa = await page.$eval("#morb-cp-tabla-head", (el) => el.textContent.trim());
  const primeraCategoria = await page.$eval("#morb-cp-tabla-body tr:first-child td:nth-child(2)", (el) => el.textContent.trim());
  const primerValor = await page.$eval("#morb-cp-tabla-body tr:first-child td:last-child", (el) => el.textContent.trim());
  console.log("Encabezado tras Analizar=Tasa:", headTasa);
  console.log(`Municipio con mayor Tasa: ${primeraCategoria} = ${primerValor}`);
  assert(headTasa.includes("Tasa"), "El encabezado debe reflejar Analizar=Tasa dinámicamente");

  await page.selectOption("#morb-cp-select-medida", "poblacion");
  await page.waitForTimeout(300);
  const headPoblacion = await page.$eval("#morb-cp-tabla-head", (el) => el.textContent.trim());
  assert(headPoblacion.includes("Población"), "El encabezado debe reflejar Analizar=Población dinámicamente");

  // Volver al estado por defecto y confirmar que no quedó nada "pegado"
  await page.selectOption("#morb-cp-select-medida", "casos");
  await page.selectOption("#morb-cp-select-dim", "institucion");
  await page.waitForTimeout(300);
  const filasInstitucion = await page.$$eval("#morb-cp-tabla-body tr", (trs) => trs.length);
  console.log("Filas tras Por=Institución:", filasInstitucion);
  assert(filasInstitucion > 0 && filasInstitucion <= 10, "Por=Institución debe dar un puñado de instituciones (5 reales en la base)");

  // ---- Regresión: búsqueda CIE-10 existente sigue funcionando ----
  await page.fill("#cie10-search", "C50");
  await page.waitForSelector(".cie10-suggestion[data-epiclave]", { timeout: 10000 });
  await page.click(".cie10-suggestion[data-epiclave]");
  await page.waitForFunction(() => document.getElementById("data-panels").style.display !== "none", { timeout: 10000 });
  const kpiTexto = await page.$eval("#kpi-grid", (el) => el.textContent);
  console.log("KPI tras seleccionar C50 (primeros 100 chars):", kpiTexto.slice(0, 100).replace(/\s+/g, " "));
  assert(kpiTexto.includes("Casos en Querétaro"), "La búsqueda CIE-10 sigue funcionando: KPI de casos presente tras seleccionar C50");
  assert(await page.isVisible("#morb-cp-card"), "El panel nuevo sigue visible/independiente tras usar la búsqueda CIE-10");

  console.log("\nErrores de consola/página durante toda la prueba:", errores.length);
  errores.forEach((e) => console.log("  -", e));
  assert(errores.length === 0, "Sin errores de JS en consola durante toda la prueba");

  await browser.close();
  console.log("\n=== VALIDACIÓN v2.5.0 (MORBILIDAD + VERSIÓN) COMPLETADA SIN ERRORES ===");
})().catch((e) => { console.error(e); process.exit(1); });
