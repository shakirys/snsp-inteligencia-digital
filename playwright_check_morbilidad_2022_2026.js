/**
 * Validación en navegador real (Chromium vía Playwright) de la
 * actualización Morbilidad 2022-2026 — lo que jsdom no puede verificar de
 * verdad (layout real, canvas real, generación de PDF con imágenes
 * reales, scroll).
 *
 * Cubre las reglas NO NEGOCIABLES de esta actualización:
 *   - Total general y por año EXACTOS (3,551,200 / 794,108 / 725,978 /
 *     729,037 / 779,592 / 522,485) en el Bloque 1 y en el Bloque 2.
 *   - El Bloque 1 y el Bloque 2 nunca se mezclan (un padecimiento elegido
 *     en el Bloque 2 no debe mover el Bloque 1).
 *   - Tasa restringida a Municipio/Jurisdicción/Grupo de edad en el
 *     Bloque 1; deshabilitada para Institución/Unidad médica/Sexo.
 *   - Generación de PDF real (con imágenes de las gráficas) sin errores.
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8099;
const ROOT = __dirname;
const BASE = `http://127.0.0.1:${PORT}`;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

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

let serverRef = null;
let browserRef = null;

(async () => {
  const server = await startServer();
  serverRef = server;
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  browserRef = browser;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erroresJS = [];
  page.on("pageerror", (e) => erroresJS.push(String(e) + "\n" + (e.stack || "")));
  page.on("console", (msg) => { if (msg.type() === "error") erroresJS.push(msg.text()); });

  for (const [url, localPath] of Object.entries(CDN_LOCAL)) {
    await page.route(url, (route) => route.fulfill({ path: localPath }));
  }
  // La app referencia Google Fonts en <link> (Fraunces/Inter/IBM Plex Mono).
  // En este entorno aislado no debe salir a la red real, pero abortar la
  // petición (route.abort()) hace que Chromium registre un
  // "Failed to load resource: net::ERR_FAILED" en la consola de la página,
  // lo cual el propio checklist de "sin errores de JS" detectaría como
  // falso positivo. Se responde con un CSS vacío en su lugar: no hay
  // tráfico de red real y tampoco se genera ningún error de consola.
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "/* fuentes deshabilitadas en pruebas */" })
  );

  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.evaluate(() => window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025"));

  await page.goto(BASE + "/pages/morbilidad.html", { waitUntil: "load" });
  await page.waitForFunction(() => {
    const tbody = document.getElementById("morb-h-tabla-body");
    return tbody && tbody.querySelectorAll("tr").length > 0;
  }, { timeout: 15000 });

  function kpiValorNumero(gridId, label) {
    return page.evaluate(({ gridId, label }) => {
      const tarjetas = Array.from(document.querySelectorAll(`#${gridId} .indicator-card`));
      const card = tarjetas.find((c) => (c.querySelector(".indicator-card__label") || {}).textContent === label);
      if (!card) return null;
      const v = (card.querySelector(".indicator-card__value") || {}).textContent || "";
      if (v.trim() === "No aplica") return "No aplica";
      return parseInt(v.replace(/[^\d-]/g, ""), 10);
    }, { gridId, label });
  }

  async function marcarSoloAnio(anio) {
    // Abrir el menú (se asume cerrado al entrar, tal como queda garantizado
    // al salir de esta misma función la vez anterior).
    await page.click("#morb-anio-toggle");
    await page.waitForSelector("#morb-anio-menu:not([hidden])");
    await page.evaluate((anio) => {
      document.querySelectorAll("#morb-anio-menu input[type=checkbox]").forEach((chk) => {
        const deseado = anio ? chk.value === String(anio) : false;
        if (chk.checked !== deseado) {
          chk.checked = deseado;
          chk.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    }, anio);
    // Cerrar el menú de forma determinista con el propio botón de toggle en
    // lugar de un "click fuera" (p.ej. page.click("body")): el punto de clic
    // calculado por Playwright para "body" puede caer, según el layout,
    // dentro del propio menú desplegado (sobre un <label> de una casilla),
    // lo que desmarcaría silenciosamente el año recién marcado en vez de
    // cerrar el menú. Clicar el toggle de nuevo es inequívoco: el menú ya
    // está abierto en este punto, así que esto siempre lo cierra.
    await page.click("#morb-anio-toggle");
    // Nota: no se usa waitForSelector("#morb-anio-menu[hidden]") porque ese
    // método espera además state:"visible" por defecto, y un elemento con el
    // atributo "hidden" nunca es visible (el timeout sería siempre
    // garantizado). waitForFunction comprueba la propiedad directamente.
    await page.waitForFunction(() => document.getElementById("morb-anio-menu").hidden === true);
    await page.waitForTimeout(150);
  }

  console.log("\n--- Fuente ---");
  const sourceText = await page.textContent("#source-label");
  assert(sourceText.includes("2022") && sourceText.includes("2026"), "source-label debe mencionar 2022 y 2026");
  assert(sourceText.includes("3,551,200"), "source-label debe mencionar 3,551,200 casos");

  // =========================================================================
  // VALIDACIÓN OBLIGATORIA — total general y por año, Bloque 1 y Bloque 2
  // =========================================================================
  console.log("\n--- VALIDACIÓN OBLIGATORIA (navegador real) ---");
  const TOTALES_POR_ANIO = { "2022": 794108, "2023": 725978, "2024": 729037, "2025": 779592, "2026": 522485 };
  for (const anio of Object.keys(TOTALES_POR_ANIO)) {
    await marcarSoloAnio(anio);
    const vH = await kpiValorNumero("kpi-grid-h", "Casos totales");
    assert(vH === TOTALES_POR_ANIO[anio], `Bloque 1 — año ${anio}: Casos totales debe ser ${TOTALES_POR_ANIO[anio]} (trae: ${vH})`);
    const vP = await kpiValorNumero("kpi-grid-p", "Casos totales");
    assert(vP === TOTALES_POR_ANIO[anio], `Bloque 2 — año ${anio}: Casos totales debe ser ${TOTALES_POR_ANIO[anio]} (trae: ${vP})`);
  }
  await marcarSoloAnio(null);
  const totalGeneralH = await kpiValorNumero("kpi-grid-h", "Casos totales");
  const totalGeneralP = await kpiValorNumero("kpi-grid-p", "Casos totales");
  assert(totalGeneralH === 3551200, `Bloque 1 — total general debe ser EXACTAMENTE 3,551,200 (trae: ${totalGeneralH})`);
  assert(totalGeneralP === 3551200, `Bloque 2 — total general debe ser EXACTAMENTE 3,551,200 (trae: ${totalGeneralP})`);

  // =========================================================================
  // Separación Bloque 1 / Bloque 2
  // =========================================================================
  console.log("\n--- Separación Bloque 1 / Bloque 2 ---");
  await page.click("#morb-tab-bloque2");
  await page.waitForTimeout(150);
  await page.fill("#cie10-search", "tifoidea");
  await page.waitForSelector(".cie10-suggestion[data-epiclave]", { timeout: 5000 });
  const totalHAntes = await kpiValorNumero("kpi-grid-h", "Casos totales");
  await page.click(".cie10-suggestion[data-epiclave]");
  await page.waitForTimeout(200);
  const totalHDespues = await kpiValorNumero("kpi-grid-h", "Casos totales");
  const totalPDespues = await kpiValorNumero("kpi-grid-p", "Casos totales");
  assert(totalHAntes === totalHDespues, "Elegir un padecimiento (Bloque 2) no debe mover el KPI del Bloque 1");
  assert(totalPDespues < totalHDespues, "El KPI del Bloque 2 filtrado debe ser menor que el total general");
  await page.click("#btn-limpiar-seleccion");
  await page.waitForTimeout(150);
  await page.click("#morb-tab-bloque1");
  await page.waitForTimeout(150);

  // =========================================================================
  // Tasa restringida por dimensión
  // =========================================================================
  console.log("\n--- Restricción de Tasa por dimensión ---");
  async function tasaDisabled() {
    return page.evaluate(() => {
      const sel = document.getElementById("morb-h-select-medida");
      const opt = Array.from(sel.options).find((o) => o.value === "tasa");
      return opt.disabled;
    });
  }
  async function fijarDim(valor) {
    await page.selectOption("#morb-h-select-dim", valor);
    await page.waitForTimeout(150);
  }
  await fijarDim("municipio");
  assert(!(await tasaDisabled()), "Tasa debe estar habilitada para Por=Municipio");
  await fijarDim("institucion");
  assert(await tasaDisabled(), "Tasa debe estar deshabilitada para Por=Institución");
  await fijarDim("unidad_medica");
  assert(await tasaDisabled(), "Tasa debe estar deshabilitada para Por=Unidad médica");
  await fijarDim("sexo");
  assert(await tasaDisabled(), "Tasa debe estar deshabilitada para Por=Sexo");
  await fijarDim("municipio");

  // =========================================================================
  // Panel de municipio: 18 categorías reales en canvas
  // =========================================================================
  console.log("\n--- Panel de municipio (canvas real) ---");
  const canvasVisible = await page.evaluate(() => {
    const c = document.getElementById("morb-h-chart-municipio");
    return c && c.width > 0 && c.height > 0;
  });
  assert(canvasVisible, "El canvas de 'Casos por municipio' debe tener dimensiones reales (> 0)");

  // =========================================================================
  // Generación de PDF real (con imágenes de gráficas)
  // =========================================================================
  console.log("\n--- Generación de PDF real ---");
  await page.click("#btn-morb-abrir-pdf");
  await page.waitForSelector("#modal-morb-pdf.is-open");
  await page.click("#btn-morb-pdf-generar");
  await page.waitForSelector("#morb-pdf-vista-previa:not([hidden])");
  const vpTieneContenido = await page.evaluate(() => document.getElementById("morb-pdf-vista-previa-resumen").textContent.trim().length > 0);
  assert(vpTieneContenido, "La Vista previa debe tener contenido real");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.click("#btn-morb-pdf-generar-final"),
  ]);
  const nombreArchivo = download.suggestedFilename();
  assert(nombreArchivo.includes("morbilidad") && nombreArchivo.endsWith(".pdf"), `El PDF descargado debe llamarse snsp_morbilidad_reporte_*.pdf (trae: ${nombreArchivo})`);
  const savePath = path.join(ROOT, "_tmp_" + nombreArchivo);
  await download.saveAs(savePath);
  const tamanoBytes = fs.statSync(savePath).size;
  assert(tamanoBytes > 10000, `El PDF generado debe pesar más de 10 KB, es decir, tener contenido real (trae: ${tamanoBytes} bytes)`);
  fs.unlinkSync(savePath);

  console.log("\n--- Errores de JavaScript durante toda la sesión ---");
  assert(erroresJS.length === 0, `No debe haber errores de JS en consola (encontrados: ${erroresJS.length})\n${erroresJS.join("\n---\n")}`);

  await browser.close();
  server.close();

  console.log(`\n=== RESULTADO: ${fallas === 0 ? "TODAS LAS PRUEBAS PASARON" : fallas + " PRUEBA(S) FALLARON"} ===`);
  process.exitCode = fallas === 0 ? 0 : 1;
})().catch(async (e) => {
  console.error("ERROR FATAL:", e);
  process.exitCode = 1;
}).finally(async () => {
  try { await browserRef?.close(); } catch (e) {}
  try { serverRef?.close(); } catch (e) {}
  process.exit(process.exitCode || 0);
});
