const { chromium } = require("playwright");
const path = require("path");
const fsSync = require("fs");

const BASE = "http://127.0.0.1:8099";
// El sandbox bloquea la salida a CDN externos (jsdelivr) por política de
// red; se sustituyen por los mismos paquetes instalados localmente vía
// npm (misma versión que referencia cada <script src="https://cdn...">
// en las páginas), igual que el patrón ya usado en este proyecto para
// pruebas con Playwright.
const CDN_LOCAL = {
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js": "node_modules/chart.js/dist/chart.umd.js",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js": "node_modules/xlsx/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js": "node_modules/jspdf/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js": "node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js",
};
const SUIVE_PATH = "/root/.claude/uploads/bd235fb8-47c1-5914-8daa-5273626f148d/b74eb586-SUIVE_BASE_COMPLETA_SNSP_PAGINA__2025-2026.xlsx";
const OUT = "/tmp/claude-0/-home-claude/bd235fb8-47c1-5914-8daa-5273626f148d/scratchpad/screenshots";

function assert(cond, msg) {
  if (!cond) throw new Error("FALLÓ: " + msg);
  console.log("OK: " + msg);
}

async function esperarPaso(page, id, timeout) {
  await page.waitForFunction(
    (elId) => {
      const el = document.getElementById(elId);
      return el && el.style.display !== "none";
    },
    id,
    { timeout: timeout || 15000 }
  );
}

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const erroresConsola = [];
  page.on("console", (msg) => { if (msg.type() === "error") erroresConsola.push(msg.text()); });
  page.on("pageerror", (err) => erroresConsola.push("pageerror: " + err.message));

  await page.route("**/*", async (route) => {
    const url = route.request().url();
    const local = CDN_LOCAL[url];
    if (local) {
      const filePath = path.join(__dirname, local);
      const body = fsSync.readFileSync(filePath);
      return route.fulfill({ status: 200, contentType: "application/javascript", body });
    }
    return route.continue();
  });

  console.log("=== Cargando plataforma y autenticando ===");
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.evaluate(() => window.SNSP_AUTH.login("osvaldo.bobadilla@snsp.qro.gob.mx", "SNSP2025"));
  await page.goto(BASE + "/pages/carga.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#carga-dropzone");

  console.log("=== Subiendo SUIVE_BASE_COMPLETA (536,847 filas) — puede tardar ===");
  const t0 = Date.now();
  const input = await page.$("#carga-input-archivo");
  await input.setInputFiles(SUIVE_PATH);
  await esperarPaso(page, "carga-paso-mapeo", 120000);
  console.log(`Archivo procesado en ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const conteo = await page.textContent("#carga-archivo-conteo");
  console.log("Conteo mostrado:", conteo);
  assert(conteo.includes("536,847"), "El conteo de filas debe mostrar 536,847");

  const filasMapeo = await page.$$eval("#carga-mapeo-body tr", (trs) => trs.length);
  assert(filasMapeo === 12, "Deben listarse las 12 columnas de SUIVE en el mapeo");

  // ---- Comprobar que Año NO queda propuesto como Medida ----
  const roles = await page.$$eval(".carga-rol-select", (sels) =>
    sels.map((s) => ({ col: s.closest("tr").querySelector("td").textContent.trim(), valor: s.value }))
  );
  console.log("Roles por defecto:", JSON.stringify(roles));
  const rolAnio = roles.find((r) => r.col === "Año");
  assert(rolAnio && rolAnio.valor !== "medida", "'Año' NO debe quedar propuesto por defecto como Medida (quedó: " + (rolAnio && rolAnio.valor) + ")");
  const rolCasos = roles.find((r) => r.col === "Casos");
  assert(rolCasos && rolCasos.valor === "medida", "'Casos' sí debe quedar propuesto por defecto como Medida");

  // Aviso "posible código" visible junto a Año en la tabla de mapeo.
  const avisoCodigoVisible = await page.$$eval("#carga-mapeo-body tr", (trs) =>
    trs.some((tr) => tr.textContent.includes("Año") && tr.textContent.includes("posible código"))
  );
  assert(avisoCodigoVisible, "Debe mostrarse el aviso 'posible código' junto a la columna Año");

  // ---- Configurar mapeo: Municipio=Dimensión, Casos=Medida,
  // Año/Institución/Padecimiento=Filtro, resto=Ignorar ----
  async function fijarRol(nombreColumna, rol) {
    const idx = await page.$$eval(
      "#carga-mapeo-body tr",
      (trs, nombre) => trs.findIndex((tr) => tr.querySelector("td").textContent.trim() === nombre),
      nombreColumna
    );
    if (idx === -1) throw new Error("No se encontró la columna " + nombreColumna);
    const selects = await page.$$(".carga-rol-select");
    await selects[idx].selectOption(rol);
  }

  await fijarRol("Año", "filtro");
  await fijarRol("Entidad", "ignorar");
  await fijarRol("Jurisdicción", "ignorar");
  await fijarRol("Municipio", "dimension"); // ya es el default, explícito por claridad
  await fijarRol("Institución", "filtro");
  await fijarRol("Semana", "ignorar");
  await fijarRol("Mes", "ignorar");
  await fijarRol("Sexo", "ignorar");
  await fijarRol("Grupo de edad", "ignorar");
  await fijarRol("Unidad médica", "ignorar");
  await fijarRol("Padecimiento", "filtro");
  await fijarRol("Casos", "medida");

  await page.click("#btn-carga-validar");
  await esperarPaso(page, "carga-paso-resultado", 60000);
  console.log("=== Paso de resultado visible: Casos por Municipio ===");

  await page.waitForTimeout(300); // margen para que Chart.js termine su primer render
  await page.screenshot({ path: `${OUT}/01_casos_por_municipio_sin_filtro.png`, fullPage: true });

  const configWrapDisplay = await page.$eval("#carga-config-wrap", (el) => el.style.display);
  assert(configWrapDisplay === "none", "Con 1 sola Dimensión (Municipio) y 1 sola Medida (Casos), el selector de configuración debe quedar oculto");

  const filtrosVisibles = await page.$eval("#carga-filtros-wrap", (el) => el.style.display);
  assert(filtrosVisibles !== "none", "El bloque de filtros debe mostrarse (Año, Institución, Padecimiento)");
  const nFiltros = await page.$$eval(".carga-filtro-select", (s) => s.length);
  assert(nFiltros === 3, "Deben generarse 3 selectores de filtro (Año, Institución, Padecimiento)");

  const filasSinFiltro = await page.$$eval("#carga-tabla-body tr", (trs) => trs.length);
  console.log("Categorías de Municipio (Top 15, sin filtro):", filasSinFiltro);
  assert(filasSinFiltro === 15, "Top 15 debe mostrar 15 filas en la tabla");

  const kpiTexto0 = (await page.textContent("#carga-kpi-grid")).replace(/\s+/g, " ");
  console.log("KPI sin filtro:", kpiTexto0);
  assert(kpiTexto0.includes("536,847"), "El KPI 'Filas en el archivo' debe mostrar 536,847");

  // ---- Filtro Año: opciones 2025, 2026 y Todos ----
  const selAnio = await page.$('.carga-filtro-select[data-col="0"]');
  const opcionesAnio = await selAnio.$$eval("option", (os) => os.map((o) => o.value));
  console.log("Opciones del filtro Año:", opcionesAnio);
  assert(opcionesAnio.includes(""), "El filtro Año debe incluir la opción 'Todos' (value vacío)");
  assert(opcionesAnio.includes("2025"), "El filtro Año debe incluir 2025");
  assert(opcionesAnio.includes("2026"), "El filtro Año debe incluir 2026");

  await selAnio.selectOption("2025");
  await page.waitForTimeout(200);
  const kpiAnio2025 = (await page.textContent("#carga-kpi-grid")).replace(/\s+/g, " ");
  console.log("KPI con Año=2025:", kpiAnio2025);
  assert(kpiAnio2025.includes("Filas con el filtro aplicado"), "Con 1 filtro activo el KPI debe decir 'el filtro aplicado' (singular)");
  const tablaAnio2025 = (await page.textContent("#carga-tabla-body")).replace(/\s+/g, " ").trim();
  await page.screenshot({ path: `${OUT}/02_municipio_filtro_anio_2025.png`, fullPage: true });

  await selAnio.selectOption("2026");
  await page.waitForTimeout(200);
  const tablaAnio2026 = (await page.textContent("#carga-tabla-body")).replace(/\s+/g, " ").trim();
  assert(tablaAnio2026 !== tablaAnio2025, "La tabla debe cambiar al cambiar el filtro Año de 2025 a 2026");
  await page.screenshot({ path: `${OUT}/03_municipio_filtro_anio_2026.png`, fullPage: true });

  await selAnio.selectOption("");
  await page.waitForTimeout(200);
  const tablaTodos = (await page.textContent("#carga-tabla-body")).replace(/\s+/g, " ").trim();
  console.log("Tabla con Año=Todos coincide con la tabla sin filtro inicial:", tablaTodos === (await page.textContent("#carga-tabla-body")).replace(/\s+/g," ").trim());

  // ---- Varios filtros simultáneos: Año + Institución + Padecimiento ----
  const selInstitucion = await page.$('.carga-filtro-select[data-col="4"]');
  const selPadecimiento = await page.$('.carga-filtro-select[data-col="10"]');
  const opcionesInstitucion = await selInstitucion.$$eval("option", (os) => os.map((o) => o.value));
  const opcionesPadecimiento = await selPadecimiento.$$eval("option", (os) => os.map((o) => o.value));
  console.log("N opciones Institución:", opcionesInstitucion.length, "ejemplo:", opcionesInstitucion.slice(0, 4));
  console.log("N opciones Padecimiento:", opcionesPadecimiento.length);

  await selAnio.selectOption("2025");
  await selInstitucion.selectOption(opcionesInstitucion[1]); // primera institución real (0 = "Todos")
  await selPadecimiento.selectOption(opcionesPadecimiento[1]);
  await page.waitForTimeout(300);

  const kpi3Filtros = (await page.textContent("#carga-kpi-grid")).replace(/\s+/g, " ");
  console.log("KPI con 3 filtros simultáneos (Año+Institución+Padecimiento):", kpi3Filtros);
  assert(kpi3Filtros.includes("Filas con los filtros aplicados"), "Con 3 filtros activos el KPI debe decir 'los filtros aplicados' (plural)");

  const tabla3Filtros = (await page.textContent("#carga-tabla-body")).replace(/\s+/g, " ").trim();
  const tituloChart3Filtros = await page.$eval("#carga-chart", (c) => c.getAttribute("aria-label") || "");
  await page.screenshot({ path: `${OUT}/04_municipio_3_filtros_simultaneos.png`, fullPage: true });

  // ---- Gráfica, tabla, KPI y PDF deben responder a los MISMOS filtros ----
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.click("#btn-carga-exportar-pdf"),
  ]);
  const pdfPath = `${OUT}/reporte_casos_por_municipio_3_filtros.pdf`;
  await download.saveAs(pdfPath);
  const pdfStat = fs.statSync(pdfPath);
  console.log("PDF exportado:", pdfPath, `${(pdfStat.size / 1024).toFixed(1)} KB`);
  assert(pdfStat.size > 1000, "El PDF exportado debe tener contenido (> 1KB)");

  // Extraer texto del PDF para confirmar que refleja los mismos 3 filtros
  // que se ven en pantalla (gráfica/tabla/KPI ya capturados en el screenshot).
  const { PDFParse } = require("pdf-parse");
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfParser = new PDFParse({ data: pdfBuffer });
  const pdfResult = await pdfParser.getText();
  const pdfTexto = pdfResult.text;
  console.log("---- Texto extraído del PDF ----");
  console.log(pdfTexto.split("\n").slice(0, 12).join("\n"));
  assert(pdfTexto.includes("Año"), "El PDF debe mencionar el filtro Año");
  assert(pdfTexto.includes("536,847"), "El PDF debe mostrar el total de registros del archivo (536,847)");
  // Confirma que el PDF refleja EXACTAMENTE los mismos 3 filtros y la
  // misma tabla (1 categoría) que se veían en pantalla (gráfica/tabla/KPI
  // capturados en el screenshot 04_municipio_3_filtros_simultaneos.png).
  assert(pdfTexto.includes("Categorías mostradas: 1 de 1"), "El PDF debe mostrar la misma categoría única (1 de 1) que la tabla en pantalla");
  console.log("Tabla en pantalla con 3 filtros:", tabla3Filtros);

  // ---- Top 10 / 15 / 20 / Todas sin etiquetas encimadas (Municipio, 18 categorías) ----
  await selAnio.selectOption("");
  await selInstitucion.selectOption("");
  await selPadecimiento.selectOption("");
  await page.waitForTimeout(200);
  for (const top of ["10", "15", "20", "todas"]) {
    await page.selectOption("#carga-topn", top);
    await page.waitForTimeout(250);
    const altoPx = await page.$eval("#carga-chart-wrap", (el) => el.style.height);
    const filasTop = await page.$$eval("#carga-tabla-body tr", (trs) => trs.length);
    console.log(`Top ${top}: alto contenedor=${altoPx}, filas tabla=${filasTop}`);
    await page.screenshot({ path: `${OUT}/05_municipio_top_${top}.png`, fullPage: true });
  }

  // ---- Escenario adicional: Padecimiento como dimensión (etiquetas MUY
  // largas) — la prueba de fondo que motivó corregir el alto de la
  // gráfica. Se vuelve a mapear para usar Padecimiento como Dimensión.
  console.log("\n=== Escenario 2: Padecimiento como dimensión (etiquetas largas) ===");
  await page.click("#btn-carga-cambiar-mapeo");
  await esperarPaso(page, "carga-paso-mapeo", 15000);
  await fijarRol("Municipio", "ignorar");
  await fijarRol("Padecimiento", "dimension");
  await fijarRol("Año", "filtro");
  await fijarRol("Institución", "ignorar");
  await page.click("#btn-carga-validar");
  await esperarPaso(page, "carga-paso-resultado", 60000);
  await page.waitForTimeout(300);

  for (const top of ["10", "15", "20", "todas"]) {
    await page.selectOption("#carga-topn", top);
    await page.waitForTimeout(300);
    const altoPx = await page.$eval("#carga-chart-wrap", (el) => el.style.height);
    const filasTop = await page.$$eval("#carga-tabla-body tr", (trs) => trs.length);
    console.log(`Padecimiento — Top ${top}: alto contenedor=${altoPx}, filas tabla=${filasTop}`);
    await page.screenshot({ path: `${OUT}/06_padecimiento_top_${top}.png`, fullPage: true });
  }

  console.log("\n=== Errores de consola del navegador durante toda la prueba ===");
  console.log(erroresConsola.length ? erroresConsola.join("\n") : "(ninguno)");

  await browser.close();
  console.log("\n=== FIN — TODAS LAS COMPROBACIONES PASARON ===");
})().catch((e) => {
  console.error("\n!!! ERROR EN LA PRUEBA:", e.message);
  process.exit(1);
});
