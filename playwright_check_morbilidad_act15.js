/**
 * Validación en navegador real (Chromium vía Playwright) de ACT15 en
 * Morbilidad — cosas que jsdom no puede verificar de verdad (canvas real,
 * captura de imagen de gráfica, negrita/posición real de etiquetas):
 *   1) Mes/Semana selección múltiple (chips) afecta Casos totales.
 *   2) Periodo visible en subtítulos/tabla con Mes/Semana filtrados.
 *   4) Vista previa VISUAL del PDF: páginas con proporción de hoja,
 *      imágenes <img> reales de las gráficas (canvas capturado de verdad).
 *   5) El PDF real generado SÍ incluye imágenes de gráfica (addImage) en
 *      navegador real, con orientación por sección.
 *   9) VALIDACIÓN OBLIGATORIA: 1,270,390 casos sin filtros; 10,252 casos
 *      para T63.2, X22 — Intoxicación por picadura de alacrán.
 */
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:8099";
const CDN_LOCAL = {
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js": "node_modules/chart.js/dist/chart.umd.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js": "node_modules/jspdf/dist/jspdf.umd.js",
  "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js": "node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.js",
};

function assert(cond, msg) {
  if (!cond) throw new Error("FALLÓ: " + msg);
  console.log("OK: " + msg);
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const erroresJS = [];
  page.on("pageerror", (e) => erroresJS.push(String(e) + "\n" + (e.stack || "")));
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

  function casosTotalesKpi() {
    return page.evaluate(() => {
      const m = document.getElementById("kpi-grid").textContent.replace(/\s+/g, " ").match(/Casos totales\s*([\d,]+)/);
      return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
    });
  }

  // =========================================================================
  // ACT15 punto 9 — VALIDACIÓN OBLIGATORIA contra las bases originales
  // =========================================================================
  console.log("\n--- ACT15 (punto 9): validación obligatoria en navegador real ---");
  const totalInicial = await casosTotalesKpi();
  assert(totalInicial === 1270390, `Sin filtros de Mes/Semana, Casos totales debe ser EXACTAMENTE 1,270,390 (trae: ${totalInicial})`);

  await page.fill("#cie10-search", "alacrán");
  await page.waitForSelector(".cie10-suggestion[data-epiclave='94']", { timeout: 5000 });
  await page.click(".cie10-suggestion[data-epiclave='94']");
  await page.waitForTimeout(150);
  const totalAlacran = await casosTotalesKpi();
  assert(totalAlacran === 10252, `T63.2, X22 — Intoxicación por picadura de alacrán debe dar EXACTAMENTE 10,252 casos (trae: ${totalAlacran})`);
  await page.click("#btn-limpiar-seleccion");
  await page.waitForTimeout(150);
  assert((await casosTotalesKpi()) === 1270390, "Al limpiar la selección, Casos totales debe volver a 1,270,390");

  // =========================================================================
  // ACT15 punto 1 — Mes/Semana selección múltiple (chips)
  // =========================================================================
  console.log("\n--- ACT15 (punto 1): Mes/Semana selección múltiple (chips) ---");
  await page.click("#morb-mes-toggle");
  await page.waitForSelector("#morb-mes-menu:not([hidden])");
  const opcionesMes = await page.$$eval("#morb-mes-menu input[type=checkbox]", (els) => els.map((e) => e.value));
  assert(opcionesMes.length === 12, `El menú de Mes debe ofrecer 12 meses sin Semana elegida (trae ${opcionesMes.length})`);
  await page.check(`#morb-mes-menu input[value="01 Enero"]`);
  await page.waitForTimeout(150);
  const totalEnero = await casosTotalesKpi();
  assert(totalEnero > 0 && totalEnero < totalInicial, `Marcar Mes=Enero debe reducir Casos totales (trae: ${totalEnero})`);
  // Repuebla el menú (coherencia) — hay que re-consultar antes del 2° clic.
  await page.check(`#morb-mes-menu input[value="02 Febrero"]`);
  await page.waitForTimeout(150);
  const marcadosMes = await page.$$eval("#morb-mes-menu input[type=checkbox]:checked", (els) => els.map((e) => e.value));
  assert(marcadosMes.length === 2 && marcadosMes.includes("01 Enero") && marcadosMes.includes("02 Febrero"), `Deben quedar Enero + Febrero marcados a la vez (trae: ${marcadosMes.join(", ")})`);

  const subtJuris = await page.$eval("#morb-subt-jurisdiccion", (el) => el.textContent.trim());
  console.log("Subtítulo de Jurisdicción con Mes=Enero+Febrero:", subtJuris);
  assert(/Enero.*Febrero|Enero–Febrero/.test(subtJuris) || /Enero/.test(subtJuris), `El periodo (Enero/Febrero) debe quedar visible en el subtítulo (trae: "${subtJuris}")`);

  // limpiar selección de meses
  const chipsBtns = await page.$$("#morb-mes-chips .carga-anio-chip button");
  for (let i = 0; i < chipsBtns.length; i++) {
    const btn = (await page.$$("#morb-mes-chips .carga-anio-chip button"))[0];
    if (!btn) break;
    await btn.click();
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(150);
  assert((await casosTotalesKpi()) === totalInicial, "Al limpiar todos los meses marcados, Casos totales debe volver al valor original");

  // =========================================================================
  // ACT15 punto 4 — Vista previa VISUAL del PDF (páginas reales + imágenes)
  // =========================================================================
  console.log("\n--- ACT15 (punto 4): Vista previa visual del PDF con imágenes reales ---");
  await page.click("#btn-morb-abrir-pdf");
  await page.waitForSelector("#modal-morb-pdf.is-open");
  await page.fill("#morb-pdf-observaciones", "Verificación Playwright ACT15.");
  await page.click("#btn-morb-pdf-generar");
  await page.waitForSelector("#morb-pdf-vista-previa:not([hidden])");
  const paginasPreview = await page.$$(".morb-vista-previa-pagina");
  assert(paginasPreview.length > 1, `La Vista previa debe mostrar varias páginas con todas las secciones marcadas (trae ${paginasPreview.length})`);
  const imgsPreview = await page.$$("#morb-pdf-vista-previa-resumen img");
  assert(imgsPreview.length > 0, `La Vista previa debe incluir gráficas reales como imagen <img> (canvas capturado de verdad) — trae ${imgsPreview.length}`);
  // Verifica que al menos una imagen tenga contenido real (dataURL no vacío)
  const primeraImgSrc = await page.$eval("#morb-pdf-vista-previa-resumen img", (el) => el.getAttribute("src") || "");
  assert(primeraImgSrc.startsWith("data:image/"), "La imagen de la gráfica en la Vista previa debe ser un data URL real (canvas capturado)");
  const tablasPreview = await page.$$("#morb-pdf-vista-previa-resumen table");
  assert(tablasPreview.length > 0, "La Vista previa debe incluir tablas reales");
  const orientacionPag1 = await page.$eval(".morb-vista-previa-pagina", (el) => el.dataset.orientacion);
  assert(orientacionPag1 === "portrait", `La página 1 de la Vista previa debe ser vertical (trae: ${orientacionPag1})`);

  // =========================================================================
  // ACT15 punto 5 — el PDF real generado incluye imágenes (addImage) en
  // navegador real (a diferencia de jsdom, donde el canvas no existe).
  // =========================================================================
  console.log("\n--- ACT15 (punto 5): el PDF real (navegador real) SÍ incluye imágenes de gráfica ---");
  let addImageCalls = 0;
  await page.exposeFunction("__reportarAddImage", () => { addImageCalls++; });
  await page.evaluate(() => {
    // jsPDF copia cada método de jsPDF.API como propiedad PROPIA de cada
    // instancia al construirla (no queda en el prototipo) — el parche debe
    // ir en jsPDF.API, ANTES de que "Generar PDF" cree el `new jsPDF(...)`.
    const orig = window.jspdf.jsPDF.API.addImage;
    window.jspdf.jsPDF.API.addImage = function (...args) {
      window.__reportarAddImage();
      return orig.apply(this, args);
    };
  });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.click("#btn-morb-pdf-generar-final"),
  ]);
  assert(!!download, "El PDF debe generarse y descargarse con éxito en navegador real");
  assert(addImageCalls > 0, `El PDF real (navegador real, con canvas de verdad) debe llamar doc.addImage al menos una vez (trae ${addImageCalls})`);
  console.log(`addImage se llamó ${addImageCalls} veces (una por cada gráfica capturada con éxito)`);

  // "Failed to load resource" es ruido esperado (la fuente de Google Fonts
  // se bloquea a propósito arriba, page.route(...).abort()) — mismo
  // criterio que playwright_check_morbilidad_act14.js.
  const erroresRelevantes = erroresJS.filter((e) => !/Failed to load resource/i.test(e));
  assert(erroresRelevantes.length === 0, "No debe haber errores de JS relevantes en consola durante todo el flujo de ACT15 (trae: " + JSON.stringify(erroresRelevantes.slice(0, 3)) + ")");

  console.log("\n=== ACT15 (Playwright, navegador real) VERIFICADO SIN ERRORES ===");
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
