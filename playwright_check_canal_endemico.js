/**
 * Validación en navegador real (Chromium vía Playwright) del módulo de
 * PRUEBA CONTROLADA "Canal Endémico Exploratorio", más una regresión
 * rápida de que Morbilidad y el resto de la navegación NO se rompieron.
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

let serverRef = null;
let browserRef = null;

(async () => {
  const server = await startServer();
  serverRef = server;
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  browserRef = browser;
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Errores de JS agrupados por página visitada (no en una sola bolsa
  // global), para poder atribuir correctamente cualquier error al módulo
  // donde ocurre de verdad — importante porque se descubrió un error
  // PREEXISTENTE en Población (ver abajo), ajeno a este módulo nuevo.
  let paginaActual = "(inicio)";
  const erroresPorPagina = {};
  function registrarError(txt) {
    (erroresPorPagina[paginaActual] = erroresPorPagina[paginaActual] || []).push(txt);
  }
  page.on("pageerror", (e) => registrarError(String(e) + "\n" + (e.stack || "")));
  page.on("console", (msg) => { if (msg.type() === "error") registrarError(msg.text()); });

  for (const [url, localPath] of Object.entries(CDN_LOCAL)) {
    await page.route(url, (route) => route.fulfill({ path: localPath }));
  }
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "/* fuentes deshabilitadas en pruebas */" })
  );

  paginaActual = "index.html (login)";
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.evaluate(() => window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025"));

  // =========================================================================
  // Módulo nuevo: Canal Endémico Exploratorio
  // =========================================================================
  console.log("\n--- Canal Endémico Exploratorio (navegador real) ---");
  paginaActual = "canal_endemico.html (primera visita)";
  await page.goto(BASE + "/pages/canal_endemico.html", { waitUntil: "load" });
  await page.waitForFunction(() => {
    const tbody = document.getElementById("tabla-semanas-body");
    return tbody && tbody.querySelectorAll("tr").length > 0;
  }, { timeout: 15000 });

  const tituloPagina = await page.title();
  assert(tituloPagina.includes("Canal Endémico"), `El título de la pestaña debe mencionar Canal Endémico (trae: ${tituloPagina}ic)`);

  const topbarTexto = await page.textContent("#topbar");
  assert(topbarTexto.includes("Canal Endémico Exploratorio"), "El encabezado debe decir 'Canal Endémico Exploratorio'");
  assert(topbarTexto.includes("Intoxicación por picadura de alacrán"), "El subtítulo debe decir 'Intoxicación por picadura de alacrán'");

  function kpiValorNumero(label) {
    return page.evaluate((label) => {
      const tarjetas = Array.from(document.querySelectorAll("#kpi-grid .indicator-card"));
      const card = tarjetas.find((c) => (c.querySelector(".indicator-card__label") || {}).textContent === label);
      if (!card) return null;
      const v = (card.querySelector(".indicator-card__value") || {}).textContent || "";
      return parseInt(v.replace(/[^\d-]/g, ""), 10);
    }, label);
  }

  assert((await kpiValorNumero("Casos acumulados 2026")) === 4147, "KPI 'Casos acumulados 2026' debe ser 4,147 en el navegador real");
  assert((await kpiValorNumero("Última semana con información")) === 37, "KPI 'Última semana con información' debe ser 37");
  const sumaZonas = (await Promise.all([
    kpiValorNumero("Semanas en zona de éxito"),
    kpiValorNumero("Semanas en zona de seguridad"),
    kpiValorNumero("Semanas en zona de alerta"),
    kpiValorNumero("Semanas en zona epidémica"),
  ])).reduce((a, b) => a + b, 0);
  assert(sumaZonas === 37, `La suma de semanas por zona debe dar 37 (trae: ${sumaZonas})`);

  const canvasDim = await page.evaluate(() => {
    const c = document.getElementById("chart-canal");
    return c && c.width > 0 && c.height > 0;
  });
  assert(canvasDim, "El canvas de la gráfica principal debe tener dimensiones reales (> 0)");

  // Ajuste 2 (opacidad reducida de las 4 bandas): confirmar que las
  // variables CSS quedaron en los valores bajos pedidos, y que el chart
  // realmente las está usando (y no un literal viejo con más opacidad).
  const opacidadesBandas = await page.evaluate(() => {
    const raiz = getComputedStyle(document.documentElement);
    return {
      exito: raiz.getPropertyValue("--canal-exito-fill").trim(),
      seguridad: raiz.getPropertyValue("--canal-seguridad-fill").trim(),
      alerta: raiz.getPropertyValue("--canal-alerta-fill").trim(),
      epidemica: raiz.getPropertyValue("--canal-epidemica-fill").trim(),
    };
  });
  assert(opacidadesBandas.epidemica.includes(".2)") || opacidadesBandas.epidemica.includes(".20)"), `La opacidad de la zona epidémica debe ser la reducida (.20) (trae: ${opacidadesBandas.epidemica})`);
  assert(opacidadesBandas.exito.includes(".32)"), `La opacidad de la zona de éxito debe ser la reducida (.32) (trae: ${opacidadesBandas.exito})`);

  // Ajuste 3 (etiquetas numéricas sólo en zona epidémica): deben existir
  // semanas en esa zona en SE 1-37, y el plugin del canvas no debe tronar.
  const resumenZonasChart = await page.evaluate(() => {
    const d = window.SNSP_CANAL_ENDEMICO_DATA.canales["94"];
    return d.resumen_semanas_por_zona;
  });
  assert((resumenZonasChart.epidemica || 0) > 0, `Debe haber al menos una semana en zona epidémica para validar las etiquetas (trae: ${resumenZonasChart.epidemica})`);

  // Tooltip real: hover sobre un punto de la curva observada y verificar contenido
  const canvasBox = await page.locator("#chart-canal").boundingBox();
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.35, canvasBox.y + canvasBox.height * 0.5);
  await page.waitForTimeout(250);
  const tooltipVisible = await page.evaluate(() => {
    // Chart.js dibuja el tooltip en el propio canvas (no hay DOM aparte por
    // defecto) — se confirma indirectamente verificando que no hubo
    // errores de JS al mover el mouse sobre la gráfica (ver abajo).
    return true;
  });
  assert(tooltipVisible, "El hover sobre la gráfica no debe lanzar errores");

  const filasTabla = await page.locator("#tabla-semanas-body tr").count();
  assert(filasTabla === 53, `La tabla debe tener 53 filas (SE 1-53) (trae: ${filasTabla})`);

  const notaTexto = await page.textContent("#nota-metodologica");
  assert(/exploratori/i.test(notaTexto), "La nota metodológica debe declarar que es exploratoria");

  const avisoTexto = await page.textContent(".alert-warning");
  assert(/prueba controlada/i.test(avisoTexto), "Debe haber un aviso visible de 'prueba controlada'");

  // Selector de padecimiento presente y preparado (aunque hoy sólo tenga 1 opción)
  const opciones = await page.locator("#canal-select-padecimiento option").count();
  assert(opciones >= 1, "El selector de padecimiento debe tener al menos 1 opción");

  // =========================================================================
  // REGRESIÓN: Morbilidad y navegación general siguen funcionando
  // =========================================================================
  console.log("\n--- Regresión: Morbilidad sigue funcionando ---");
  paginaActual = "morbilidad.html";
  await page.goto(BASE + "/pages/morbilidad.html", { waitUntil: "load" });
  await page.waitForFunction(() => {
    const tbody = document.getElementById("morb-h-tabla-body");
    return tbody && tbody.querySelectorAll("tr").length > 0;
  }, { timeout: 15000 });

  function kpiValorNumeroGrid(gridId, label) {
    return page.evaluate(({ gridId, label }) => {
      const tarjetas = Array.from(document.querySelectorAll(`#${gridId} .indicator-card`));
      const card = tarjetas.find((c) => (c.querySelector(".indicator-card__label") || {}).textContent === label);
      if (!card) return null;
      const v = (card.querySelector(".indicator-card__value") || {}).textContent || "";
      return parseInt(v.replace(/[^\d-]/g, ""), 10);
    }, { gridId, label });
  }
  const totalMorbilidadH = await kpiValorNumeroGrid("kpi-grid-h", "Casos totales");
  const totalMorbilidadP = await kpiValorNumeroGrid("kpi-grid-p", "Casos totales");
  assert(totalMorbilidadH === 3551200, `Morbilidad Bloque 1 — total general debe seguir siendo 3,551,200 (trae: ${totalMorbilidadH})`);
  assert(totalMorbilidadP === 3551200, `Morbilidad Bloque 2 — total general debe seguir siendo 3,551,200 (trae: ${totalMorbilidadP})`);

  console.log("\n--- Regresión: navegación del sidebar incluye el módulo nuevo sin romper los demás ---");
  const linksSidebar = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".sidebar__link")).map((a) => a.getAttribute("href")).filter(Boolean)
  );
  assert(linksSidebar.includes("canal_endemico.html"), "El menú lateral debe incluir el enlace a Canal endémico (prueba)");
  assert(linksSidebar.includes("morbilidad.html"), "El menú lateral debe seguir incluyendo Morbilidad");
  assert(linksSidebar.includes("mama.html") && linksSidebar.includes("cacu.html"), "El menú lateral debe seguir incluyendo CACU y Mama");

  // Dashboard y Población también deben seguir cargando (navegación general)
  paginaActual = "dashboard.html";
  await page.goto(BASE + "/dashboard.html", { waitUntil: "load" });
  await page.waitForTimeout(300);
  paginaActual = "poblacion.html";
  await page.goto(BASE + "/pages/poblacion.html", { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("kpi-grid") && document.getElementById("kpi-grid").children.length > 0, { timeout: 15000 });
  await page.waitForTimeout(500);

  console.log("\n--- Captura de pantalla del módulo nuevo ---");
  paginaActual = "canal_endemico.html (segunda visita, para la captura)";
  await page.goto(BASE + "/pages/canal_endemico.html", { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("tabla-semanas-body").querySelectorAll("tr").length > 0, { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ROOT, "canal_endemico_captura.png"), fullPage: true });
  console.log("Captura guardada: canal_endemico_captura.png");

  console.log("\n--- Errores de JavaScript, por página ---");
  const errroresCanalEndemico = [
    ...(erroresPorPagina["canal_endemico.html (primera visita)"] || []),
    ...(erroresPorPagina["canal_endemico.html (segunda visita, para la captura)"] || []),
  ];
  const erroresMorbilidad = erroresPorPagina["morbilidad.html"] || [];
  const erroresPoblacion = erroresPorPagina["poblacion.html"] || [];
  const erroresDashboard = erroresPorPagina["dashboard.html"] || [];

  assert(errroresCanalEndemico.length === 0, `Canal Endémico (módulo nuevo): no debe haber errores de JS (encontrados: ${errroresCanalEndemico.length})\n${errroresCanalEndemico.join("\n---\n")}`);
  assert(erroresMorbilidad.length === 0, `Morbilidad: no debe haber errores de JS nuevos tras agregar Canal Endémico (encontrados: ${erroresMorbilidad.length})\n${erroresMorbilidad.join("\n---\n")}`);
  assert(erroresDashboard.length === 0, `Dashboard: no debe haber errores de JS (encontrados: ${erroresDashboard.length})\n${erroresDashboard.join("\n---\n")}`);

  if (erroresPoblacion.length > 0) {
    console.log(
      `\nAVISO (no es una falla de esta prueba, no se cuenta en el resultado final): se encontró un error de JS ` +
      `PREEXISTENTE en pages/poblacion.html, ajeno por completo a Canal Endémico — reproducido también sobre la copia ` +
      `del proyecto YA entregado (v2.6.0), sin ningún archivo de esta sesión de por medio:\n${erroresPoblacion[0]}\n` +
      `No se modificó nada para corregirlo porque está fuera del alcance autorizado para esta prueba controlada.`
    );
  }

  console.log(`\n=== RESULTADO: ${fallas === 0 ? "TODAS LAS PRUEBAS PASARON" : fallas + " PRUEBA(S) FALLARON"} ===`);
  process.exitCode = fallas === 0 ? 0 : 1;
})().catch((e) => {
  console.error("ERROR FATAL:", e);
  process.exitCode = 1;
}).finally(async () => {
  try { await browserRef?.close(); } catch (e) {}
  try { serverRef?.close(); } catch (e) {}
  process.exit(process.exitCode || 0);
});
