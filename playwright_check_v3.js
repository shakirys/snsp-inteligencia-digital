const { chromium } = require("playwright");
const path = require("path");
const fsSync = require("fs");

const BASE = "http://127.0.0.1:8099";
const CDN_LOCAL = {
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js": "node_modules/chart.js/dist/chart.umd.js",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js": "node_modules/xlsx/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js": "node_modules/jspdf/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js": "node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js",
};
const SUIVE_PATH = "/root/.claude/uploads/bd235fb8-47c1-5914-8daa-5273626f148d/b74eb586-SUIVE_BASE_COMPLETA_SNSP_PAGINA__2025-2026.xlsx";
const OUT = "/tmp/claude-0/-home-claude/bd235fb8-47c1-5914-8daa-5273626f148d/scratchpad/screenshots_v3";

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

async function fijarRol(page, nombreColumna, rol) {
  const idx = await page.$$eval(
    "#carga-mapeo-body tr",
    (trs, nombre) => trs.findIndex((tr) => tr.querySelector("td").textContent.trim() === nombre),
    nombreColumna
  );
  if (idx === -1) throw new Error("No se encontró la columna " + nombreColumna);
  const selects = await page.$$(".carga-rol-select");
  await selects[idx].selectOption(rol);
}

async function marcarAnio(page, valor, marcar) {
  await page.click(".carga-anio-toggle");
  const chk = await page.$(`.carga-anio-menu input[type="checkbox"][value="${valor}"]`);
  const checked = await chk.isChecked();
  if (checked !== marcar) await chk.click();
  await page.click("body", { position: { x: 5, y: 5 } });
  await page.waitForTimeout(200);
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

  console.log("=== Cargando plataforma, autenticando y subiendo SUIVE (536,847 filas) ===");
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.evaluate(() => window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025"));
  await page.goto(BASE + "/pages/carga.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#carga-dropzone");

  const t0 = Date.now();
  const input = await page.$("#carga-input-archivo");
  await input.setInputFiles(SUIVE_PATH);
  await esperarPaso(page, "carga-paso-mapeo", 120000);
  console.log(`Archivo procesado en ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Mapeo: Grupo de edad = Dimensión, Padecimiento + Año + Institución = Filtro, Casos = Medida, resto = Ignorar.
  await fijarRol(page, "Año", "filtro");
  await fijarRol(page, "Entidad", "ignorar");
  await fijarRol(page, "Jurisdicción", "ignorar");
  await fijarRol(page, "Municipio", "ignorar");
  await fijarRol(page, "Institución", "filtro");
  await fijarRol(page, "Semana", "ignorar");
  await fijarRol(page, "Mes", "ignorar");
  await fijarRol(page, "Sexo", "ignorar");
  await fijarRol(page, "Grupo de edad", "dimension");
  await fijarRol(page, "Unidad médica", "ignorar");
  await fijarRol(page, "Padecimiento", "filtro");
  await fijarRol(page, "Casos", "medida");
  await page.click("#btn-carga-validar");
  await esperarPaso(page, "carga-paso-resultado", 60000);
  await page.waitForTimeout(300);

  console.log("\n=== PARTE A: buscador de texto en el filtro Padecimiento (157 valores) ===");
  const filtroPadecimiento = await page.$('.carga-filtro-buscable[data-col]');
  assert(!!filtroPadecimiento, "Con 157 valores únicos, Padecimiento debe usar el buscador de texto");

  const nFiltrosSimples = await page.$$eval(".carga-filtro-select:not([hidden])", (s) => s.length);
  console.log("Selectores de filtro simples visibles (Institución, y Año vía chips no cuenta):", nFiltrosSimples);
  assert(nFiltrosSimples === 1, "Sólo Institución (5 valores) debe seguir usando el <select> simple; Padecimiento (157) usa el buscador y Año usa los chips");

  const selectPadecimientoOculto = await page.$('.carga-filtro-select[hidden]');
  assert(!!selectPadecimientoOculto, "El <select> real de Padecimiento debe existir oculto");
  const nOpcionesPadecimiento = await page.$eval('.carga-filtro-select[hidden]', (s) => s.options.length);
  console.log("Opciones en el <select> oculto de Padecimiento (incl. Todos):", nOpcionesPadecimiento);

  // Abrir el buscador y escribir sin acentos.
  const toggleBtn = await page.$(".carga-filtro-buscable-toggle");
  await toggleBtn.click();
  await page.waitForTimeout(150);
  const inputBuscar = await page.$(".carga-filtro-buscable-input");
  await inputBuscar.fill("alacran");
  await page.waitForTimeout(200);
  const opcionesTrasBuscar = await page.$$eval(".carga-filtro-buscable-opcion", (btns) => btns.map((b) => b.textContent.trim()));
  console.log("Opciones tras buscar 'alacran' (sin acento):", opcionesTrasBuscar);
  const matchAlacran = opcionesTrasBuscar.find((t) => t.toLowerCase().includes("alacrán") || t.toLowerCase().includes("alacran"));
  assert(!!matchAlacran, "Buscar 'alacran' (sin acento) debe encontrar el padecimiento con acento en su nombre real de SUIVE");
  console.log("Coincidencia encontrada:", matchAlacran);
  await page.screenshot({ path: `${OUT}/01_buscador_padecimiento_alacran.png`, fullPage: true });

  // Elegir esa opción.
  const botones = await page.$$(".carga-filtro-buscable-opcion");
  let botonElegido = null;
  for (const b of botones) {
    const t = (await b.textContent()).trim();
    if (t === matchAlacran) { botonElegido = b; break; }
  }
  await botonElegido.click();
  await page.waitForTimeout(300);
  const toggleTextoTrasElegir = await page.textContent(".carga-filtro-buscable-toggle");
  console.log("Botón del buscador tras elegir:", toggleTextoTrasElegir.trim());
  assert(toggleTextoTrasElegir.trim() === matchAlacran, "El botón del buscador debe mostrar el padecimiento elegido");

  console.log("\n=== PARTE B: título dinámico con Padecimiento elegido ===");
  const tituloSinAnio = await page.textContent("#carga-chart-titulo-corto");
  const tituloSinAnioDisplay = await page.$eval("#carga-chart-titulo-corto", (el) => el.style.display);
  console.log("Título corto (Padecimiento, sin año):", tituloSinAnio, "| display:", tituloSinAnioDisplay);
  assert(tituloSinAnioDisplay !== "none", "Con Padecimiento elegido (sin año elegido), el título corto debe mostrarse");
  assert(tituloSinAnio.startsWith(matchAlacran) && tituloSinAnio.includes("Casos por Grupo de edad") && !tituloSinAnio.includes("Comparativo"),
    "El título corto debe anteponer el Padecimiento elegido, con 'Casos por Grupo de edad' y sin sufijo de año");
  await page.screenshot({ path: `${OUT}/02_titulo_padecimiento_sin_anio.png`, fullPage: true });

  await marcarAnio(page, "2025", true);
  await marcarAnio(page, "2026", true);
  await page.waitForTimeout(400);
  const tituloComparativo = await page.textContent("#carga-chart-titulo-corto");
  console.log("Título corto (Padecimiento + comparativo):", tituloComparativo);
  assert(tituloComparativo === `${matchAlacran} — Casos por Grupo de edad — Comparativo 2025 vs 2026`,
    "El título corto en comparativo debe leerse '<Padecimiento> — Casos por Grupo de edad — Comparativo 2025 vs 2026'");
  await page.screenshot({ path: `${OUT}/03_titulo_padecimiento_comparativo.png`, fullPage: true });

  // Verifica que el comparativo (tabla/gráfica) sigue funcionando con normalidad.
  const cabeceraComparativo = await page.$$eval("#carga-tabla-head th", (ths) => ths.map((t) => t.textContent.trim()));
  console.log("Encabezado de tabla (comparativo + padecimiento):", cabeceraComparativo);
  assert(cabeceraComparativo.join(",") === "#,Grupo de edad,Casos 2025,Casos 2026,Diferencia,Variación %",
    "La tabla comparativa debe seguir funcionando exactamente igual con un Padecimiento elegido");

  console.log("\n=== PARTE C: exportar a PDF con el título dinámico ===");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.click("#btn-carga-exportar-pdf"),
  ]);
  const pdfPath = `${OUT}/reporte_padecimiento_comparativo.pdf`;
  await download.saveAs(pdfPath);
  const pdfStat = fs.statSync(pdfPath);
  console.log("PDF exportado:", pdfPath, `${(pdfStat.size / 1024).toFixed(1)} KB`);
  assert(pdfStat.size > 1000, "El PDF debe tener contenido (> 1KB)");

  const { PDFParse } = require("pdf-parse");
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfParser = new PDFParse({ data: pdfBuffer });
  const pdfResult = await pdfParser.getText();
  const pdfTexto = pdfResult.text;
  console.log("---- Primeras líneas del PDF ----");
  console.log(pdfTexto.split("\n").slice(0, 10).join("\n"));
  assert(pdfTexto.includes(`Título de la gráfica: ${matchAlacran} — Casos por Grupo de edad — Comparativo 2025 vs 2026`),
    "El PDF debe incluir la línea 'Título de la gráfica' con el mismo texto exacto que se ve en pantalla");

  console.log("\n=== PARTE D: quitar el Padecimiento elegido revierte el título (sin afectar el comparativo) ===");
  await page.click(".carga-filtro-buscable-toggle");
  await page.waitForTimeout(150);
  const inputBuscar2 = await page.$(".carga-filtro-buscable-input");
  await inputBuscar2.fill("");
  await page.waitForTimeout(150);
  const botonesTodos = await page.$$(".carga-filtro-buscable-opcion");
  let botonTodos = null;
  for (const b of botonesTodos) {
    const t = (await b.textContent()).trim();
    if (t === "Todos") { botonTodos = b; break; }
  }
  await botonTodos.click();
  await page.waitForTimeout(300);
  const tituloTrasQuitar = await page.textContent("#carga-chart-titulo-corto");
  console.log("Título corto tras quitar Padecimiento (sigue el comparativo de años):", tituloTrasQuitar);
  assert(tituloTrasQuitar === "Casos por Grupo de edad — Comparativo 2025 vs 2026",
    "Sin Padecimiento elegido, el título corto debe volver a ser exactamente el mismo que antes de este cambio (sin prefijo)");
  await page.screenshot({ path: `${OUT}/04_titulo_sin_padecimiento_tras_quitar.png`, fullPage: true });

  console.log("\n=== PARTE E: filtros existentes (Institución + Año comparativo) siguen funcionando igual ===");
  const selInstitucion = await page.$('.carga-filtro-select:not([hidden])');
  const opcionesInstitucion = await selInstitucion.$$eval("option", (os) => os.map((o) => o.value));
  await selInstitucion.selectOption(opcionesInstitucion[1]);
  await page.waitForTimeout(300);
  const cabeceraConInstitucion = await page.$$eval("#carga-tabla-head th", (ths) => ths.map((t) => t.textContent.trim()));
  assert(cabeceraConInstitucion.join(",") === "#,Grupo de edad,Casos 2025,Casos 2026,Diferencia,Variación %",
    "Combinar el filtro Institución (select simple) con el comparativo de años debe seguir funcionando igual");
  await selInstitucion.selectOption("");
  await page.waitForTimeout(200);

  // Top 10/15/20/Todas siguen sin etiquetas encimadas.
  for (const top of ["10", "20", "todas"]) {
    await page.selectOption("#carga-topn", top);
    await page.waitForTimeout(300);
    const altoPx = await page.$eval("#carga-chart-wrap", (el) => el.style.height);
    const filasTop = await page.$$eval("#carga-tabla-body tr", (trs) => trs.length);
    console.log(`Top ${top}: alto contenedor=${altoPx}, filas tabla=${filasTop}`);
  }

  console.log("\n=== Errores de consola del navegador durante toda la prueba ===");
  console.log(erroresConsola.length ? erroresConsola.join("\n") : "(ninguno)");
  const erroresReales = erroresConsola.filter((e) => !e.includes("ERR_TUNNEL_CONNECTION_FAILED"));
  assert(erroresReales.length === 0, "No debe haber errores de consola del navegador (aparte del bloqueo conocido de Google Fonts en el sandbox): " + erroresReales.join(" | "));

  await browser.close();
  console.log("\n=== FIN — TODAS LAS COMPROBACIONES DE ESTA RONDA PASARON ===");
})().catch(async (e) => {
  console.error("\n!!! ERROR EN LA PRUEBA:", e.message);
  process.exit(1);
});
