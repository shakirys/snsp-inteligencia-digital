/**
 * Validación en navegador real (Chromium vía Playwright) de la ronda
 * ACT22 sobre el módulo Canal Endémico Exploratorio:
 *   1. Selector con buscador por nombre/Epi-Clave (muchos padecimientos).
 *   2. Actualización automática completa al cambiar de padecimiento.
 *   3. Aviso claro (sin fabricar resultados) para padecimientos sin canal.
 *   4. Línea de Casos observados visualmente al frente de las bandas.
 *   5. Botón "Generar reporte PDF" produce un PDF real.
 *   6. Regresión: Epi-Clave 94 (alacrán) conserva exactamente sus KPIs
 *      y totales ya aprobados.
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8098;
const ROOT = __dirname;
const BASE = `http://127.0.0.1:${PORT}`;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split("?")[0]);
      if (urlPath === "/") urlPath = "/index.html";
      const filePath = path.join(ROOT, urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end("not found: " + urlPath); return; }
        const ext = path.extname(filePath);
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

const CDN_LOCAL = {
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js": "node_modules/chart.js/dist/chart.umd.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js": "node_modules/jspdf/dist/jspdf.umd.js",
  "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js": "node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.js",
};

let fallas = 0;
function assert(cond, msg) {
  if (!cond) { fallas++; console.log("FALLÓ: " + msg); }
  else console.log("OK: " + msg);
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (msg) => { if (msg.type() === "error") errores.push(msg.text()); });

  for (const [url, localPath] of Object.entries(CDN_LOCAL)) {
    await page.route(url, (route) => route.fulfill({ path: localPath }));
  }
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "/* fuentes deshabilitadas en pruebas */" })
  );

  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.evaluate(() => window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025"));

  await page.goto(BASE + "/pages/canal_endemico.html", { waitUntil: "load" });
  await page.waitForTimeout(400);

  console.log("\n--- Regresión: Epi-Clave 94 (alacrán) al cargar ---");
  const kpis94 = await page.evaluate(() => Array.from(document.querySelectorAll("#kpi-grid .indicator-card")).map((c) => ({
    label: (c.querySelector(".indicator-card__label") || {}).textContent,
    value: (c.querySelector(".indicator-card__value") || {}).textContent,
  })));
  const kpiCasos = kpis94.find((k) => k.label === "Casos acumulados 2026");
  const kpiSemana = kpis94.find((k) => k.label === "Última semana con información");
  assert(kpiCasos && kpiCasos.value.replace(/\D/g, "") === "4147", `KPI Casos acumulados 2026 debe ser 4,147 (trae: ${kpiCasos && kpiCasos.value})`);
  assert(kpiSemana && kpiSemana.value === "37", `KPI Última semana debe ser 37 (trae: ${kpiSemana && kpiSemana.value})`);
  const selectorValorInicial = await page.locator("#canal-select-padecimiento").inputValue();
  assert(selectorValorInicial === "94", `El selector debe iniciar en Epi-Clave 94 (trae: ${selectorValorInicial})`);

  console.log("\n--- Buscador: cuenta de opciones y filtrado por nombre/Epi-Clave ---");
  const totalOpciones = await page.locator("#canal-select-padecimiento option").count();
  assert(totalOpciones > 100, `Debe haber más de 100 padecimientos en el selector (trae: ${totalOpciones})`);
  await page.fill("#canal-buscador-padecimiento", "alacran"); // sin acento, debe seguir encontrando "alacrán"
  await page.waitForTimeout(150);
  const visiblesAlacran = await page.locator("#canal-select-padecimiento option:not([hidden])").count();
  assert(visiblesAlacran === 1, `Buscar "alacran" (sin acento) debe filtrar a 1 opción (trae: ${visiblesAlacran})`);
  await page.fill("#canal-buscador-padecimiento", "");
  await page.waitForTimeout(150);

  console.log("\n--- Padecimiento sin canal disponible: aviso claro, sin datos fabricados ---");
  const epiclaveNoDisp = await page.evaluate(() => {
    const entry = window.SNSP_CANAL_ENDEMICO_DATA.catalogo_padecimientos.find((p) => !p.disponible);
    return entry ? entry.epiclave : null;
  });
  assert(!!epiclaveNoDisp, "Debe existir al menos un padecimiento sin canal disponible para esta prueba");
  await page.selectOption("#canal-select-padecimiento", epiclaveNoDisp);
  await page.waitForTimeout(200);
  const avisoVisibleClase = await page.locator("#canal-aviso-no-disponible").evaluate((el) => el.classList.contains("is-visible"));
  assert(avisoVisibleClase, "El aviso 'sin canal disponible' debe mostrarse (clase is-visible)");
  const kpisTrasNoDisp = await page.locator("#kpi-grid .indicator-card").count();
  assert(kpisTrasNoDisp === 0, `No debe haber tarjetas KPI fabricadas (trae: ${kpisTrasNoDisp})`);
  const avisoTexto = await page.locator("#canal-aviso-no-disponible").textContent();
  assert(/no.*disponible|insuficiente/i.test(avisoTexto), `El aviso debe explicar por qué no hay canal (trae: ${avisoTexto.slice(0, 160)})`);

  console.log("\n--- Vuelta a Epi-Clave 94: todo se re-sincroniza ---");
  await page.selectOption("#canal-select-padecimiento", "94");
  await page.waitForTimeout(300);
  const kpisVuelta = await page.locator("#kpi-grid .indicator-card").count();
  assert(kpisVuelta === 6, `Deben volver a verse los 6 KPI al regresar a alacrán (trae: ${kpisVuelta})`);
  const avisoOcultoVuelta = await page.locator("#canal-aviso-no-disponible").evaluate((el) => !el.classList.contains("is-visible"));
  assert(avisoOcultoVuelta, "El aviso debe ocultarse de nuevo al volver a un padecimiento disponible");
  const tituloChart = await page.locator("#chart-titulo").textContent();
  assert(/alacrán/i.test(tituloChart), `El título de la gráfica debe mencionar alacrán de nuevo (trae: ${tituloChart})`);

  console.log("\n--- Captura de evidencia visual (línea observada al frente de las bandas) ---");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ROOT, "act22_canal_endemico_captura.png"), fullPage: false });
  const chartHandle = page.locator("#chart-canal");
  await chartHandle.screenshot({ path: path.join(ROOT, "act22_canal_endemico_grafica_recorte.png") });

  console.log("\n--- Botón 'Generar reporte PDF' produce un PDF real ---");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#btn-canal-pdf"),
  ]);
  const pdfPath = path.join(ROOT, "act22_canal_endemico_reporte_muestra.pdf");
  await download.saveAs(pdfPath);
  const pdfStat = fs.statSync(pdfPath);
  assert(pdfStat.size > 5000, `El PDF de Canal Endémico generado debe pesar más de 5 KB (trae: ${pdfStat.size} bytes)`);
  assert(/snsp_canal_endemico/.test(download.suggestedFilename()), `El nombre del PDF debe iniciar con snsp_canal_endemico (trae: ${download.suggestedFilename()})`);

  console.log("\n--- Sin errores de consola/JS inesperados en esta página ---");
  const erroresRelevantes = errores.filter((e) => !/favicon/i.test(e));
  assert(erroresRelevantes.length === 0, `No debe haber errores de JS en canal_endemico.html (trae: ${JSON.stringify(erroresRelevantes.slice(0, 5))})`);

  console.log(`\n=== RESULTADO: ${fallas === 0 ? "TODAS LAS PRUEBAS PASARON" : fallas + " PRUEBA(S) FALLARON"} ===`);
  await browser.close();
  server.close();
  process.exitCode = fallas === 0 ? 0 : 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
