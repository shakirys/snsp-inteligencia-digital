/**
 * Validación en navegador real (Chromium vía Playwright) de ACT06 sobre las
 * bases REALES ya provistas y validadas por la usuaria:
 *   - BASE_CASOS_2025_2026.xlsx     (288,106 filas · 12 columnas)
 *   - BASE_POBLACION_2025_2026.xlsx (396 filas · 5 columnas)
 *
 * Cubre, en orden, exactamente lo pedido:
 *   Parte 1 — "Marcar todas como Ignorar" en el mapeo de columnas.
 *   Parte 2 — Relacionar Casos + Población por Año+Municipio+Grupo de edad,
 *             analizar Casos/Población/Tasa, con verificación cruzada de
 *             los números contra una suma independiente hecha con openpyxl.
 *   Parte 3 — PDF adaptable: vertical cuando la tabla es simple, horizontal
 *             cuando no cabe (Padecimiento + comparativo).
 */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = "http://127.0.0.1:8099";
const CDN_LOCAL = {
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js": "node_modules/chart.js/dist/chart.umd.js",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js": "node_modules/xlsx/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js": "node_modules/jspdf/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js": "node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js",
};
const CASOS_PATH = "/root/.claude/uploads/bd235fb8-47c1-5914-8daa-5273626f148d/4e2d2af7-BASE_CASOS_2025_2026.xlsx";
const POBLACION_PATH = "/root/.claude/uploads/bd235fb8-47c1-5914-8daa-5273626f148d/49f461ac-BASE_POBLACION_2025_2026.xlsx";
const OUT = "/tmp/claude-0/-home-claude/bd235fb8-47c1-5914-8daa-5273626f148d/scratchpad/screenshots_act06";

function assert(cond, msg) {
  if (!cond) throw new Error("FALLÓ: " + msg);
  console.log("OK: " + msg);
}

async function esperarPaso(page, id, timeout) {
  await page.waitForFunction(
    (elId) => { const el = document.getElementById(elId); return el && el.style.display !== "none"; },
    id, { timeout: timeout || 15000 }
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

async function leerTablaResumen(page) {
  return page.$$eval("#carga-tabla-body tr", (trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim())));
}

function mediaBoxDePDF(bufferPdf) {
  // Sin dependencias extra: el diccionario de página de un PDF generado por
  // jsPDF trae "/MediaBox [0 0 W H]" en texto plano (no comprimido) — basta
  // con buscarlo por regex para saber si la página es vertical u horizontal.
  const texto = bufferPdf.toString("latin1");
  const m = texto.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (!m) return null;
  const w = parseFloat(m[3]) - parseFloat(m[1]);
  const h = parseFloat(m[4]) - parseFloat(m[2]);
  return { w, h, orientation: w > h ? "landscape" : "portrait" };
}

(async () => {
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
      const body = fs.readFileSync(filePath);
      return route.fulfill({ status: 200, contentType: "application/javascript", body });
    }
    return route.continue();
  });

  console.log("=== Cargando plataforma, autenticando y subiendo BASE_CASOS_2025_2026.xlsx (288,106 filas) ===");
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.evaluate(() => window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025"));
  await page.goto(BASE + "/pages/carga.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#carga-dropzone");

  const t0 = Date.now();
  const inputArchivo = await page.$("#carga-input-archivo");
  await inputArchivo.setInputFiles(CASOS_PATH);
  await esperarPaso(page, "carga-paso-mapeo", 120000);
  console.log(`Archivo de Casos procesado en ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  console.log("\n=== PARTE 1: mapeo rápido — 'Marcar todas como Ignorar' ===");
  const botonIgnorarTodo = await page.$("#btn-carga-mapeo-ignorar-todo");
  assert(!!botonIgnorarTodo, "El botón 'Marcar todas como Ignorar' debe existir en el paso de mapeo");
  await botonIgnorarTodo.click();
  const rolesTrasClic = await page.$$eval(".carga-rol-select", (sels) => sels.map((s) => s.value));
  console.log("Roles tras el clic:", rolesTrasClic);
  assert(rolesTrasClic.every((v) => v === "ignorar"), "Tras el clic, las 12 columnas de BASE_CASOS deben quedar en 'Ignorar'");
  await page.screenshot({ path: `${OUT}/01_mapeo_ignorar_todo.png`, fullPage: true });

  // Ahora se ajustan individualmente sólo las columnas que hacen falta —
  // justo lo que pide la usuaria: "después debo poder cambiar
  // individualmente las necesarias".
  await fijarRol(page, "Año", "filtro");
  await fijarRol(page, "Municipio", "dimension");
  await fijarRol(page, "Grupo de edad", "filtro");
  await fijarRol(page, "Padecimiento", "filtro");
  await fijarRol(page, "Casos", "medida");
  const rolesTrasAjuste = await page.$$eval(
    "#carga-mapeo-body tr",
    (trs) => trs.map((tr) => ({
      col: tr.querySelector("td").textContent.trim(),
      rol: tr.querySelector(".carga-rol-select").value,
    }))
  );
  console.log("Roles tras ajuste individual:", rolesTrasAjuste);
  const rolAnio = rolesTrasAjuste.find((r) => r.col === "Año").rol;
  const rolMunicipio = rolesTrasAjuste.find((r) => r.col === "Municipio").rol;
  const rolCasos = rolesTrasAjuste.find((r) => r.col === "Casos").rol;
  const rolInstitucion = rolesTrasAjuste.find((r) => r.col === "Institución").rol;
  assert(rolAnio === "filtro" && rolMunicipio === "dimension" && rolCasos === "medida",
    "Año/Municipio/Casos deben reflejar los cambios individuales hechos después de 'Marcar todas como Ignorar'");
  assert(rolInstitucion === "ignorar", "Las columnas NO tocadas a mano (p. ej. Institución) deben seguir en 'Ignorar'");

  await page.click("#btn-carga-validar");
  await esperarPaso(page, "carga-paso-resultado", 90000);
  await page.waitForTimeout(400);
  console.log("=== PARTE 1 completada: mapeo rápido funciona con la base real ===\n");

  console.log("=== PARTE 2: relacionar Casos + Población y calcular Tasa (sin duplicar población) ===\n");
  assert((await page.isHidden("#carga-medida-analisis-grid")), "Antes de subir Población, el selector 'Analizar' debe estar oculto");

  const inputPoblacion = await page.$("#carga-input-poblacion");
  await inputPoblacion.setInputFiles(POBLACION_PATH);
  await page.waitForFunction(() => {
    const el = document.getElementById("carga-poblacion-estado");
    return el && el.textContent && el.textContent.length > 0;
  }, { timeout: 30000 });
  const estadoPoblacion = await page.textContent("#carga-poblacion-estado");
  console.log("Estado de relación con Población:", estadoPoblacion);
  assert(estadoPoblacion.includes("relacionar"), "El archivo de Población debe quedar relacionado correctamente por Año, Municipio y Grupo de edad");
  assert((await page.isVisible("#carga-medida-analisis-grid")), "Con Población relacionada, el selector 'Analizar' debe mostrarse");
  await page.screenshot({ path: `${OUT}/02_poblacion_relacionada.png`, fullPage: true });

  // Filtra a Año=2025 para poder comparar contra una suma independiente
  // (hecha con openpyxl fuera del navegador) de la población real 2025.
  await marcarAnio(page, "2025", true);
  await page.waitForTimeout(300);

  await page.selectOption("#carga-select-medida-analisis", "poblacion");
  await page.waitForTimeout(300);
  const filasPoblacion = await leerTablaResumen(page);
  console.log("Tabla 'Analizar=Población', Año=2025 (primeras filas):", filasPoblacion.slice(0, 5));
  const filaQueretaroPob = filasPoblacion.find((f) => f[1] === "014 Queretaro");
  assert(!!filaQueretaroPob, "Debe aparecer el municipio '014 Queretaro' analizando Población");
  const poblacionQueretaro2025Mostrada = Number(filaQueretaroPob[2].replace(/,/g, ""));
  console.log("Población 2025 de '014 Queretaro' mostrada en la tabla:", poblacionQueretaro2025Mostrada);

  await page.selectOption("#carga-select-medida-analisis", "casos");
  await page.waitForTimeout(300);
  const filasCasos = await leerTablaResumen(page);
  const filaQueretaroCasos = filasCasos.find((f) => f[1] === "014 Queretaro");
  const casosQueretaro2025 = Number(filaQueretaroCasos[2].replace(/,/g, ""));
  console.log("Casos 2025 de '014 Queretaro' mostrados en la tabla:", casosQueretaro2025);

  await page.selectOption("#carga-select-medida-analisis", "tasa");
  await page.waitForTimeout(300);
  const filasTasa = await leerTablaResumen(page);
  const filaQueretaroTasa = filasTasa.find((f) => f[1] === "014 Queretaro");
  const tasaQueretaro2025Mostrada = Number(filaQueretaroTasa[2].replace(/,/g, ""));
  console.log("Tasa 2025 de '014 Queretaro' mostrada en la tabla:", tasaQueretaro2025Mostrada);
  const tasaEsperadaDesdeTabla = Math.round((casosQueretaro2025 / poblacionQueretaro2025Mostrada) * 100000 * 10) / 10;
  assert(Math.abs(tasaQueretaro2025Mostrada - tasaEsperadaDesdeTabla) < 0.2,
    "La Tasa mostrada debe ser (Casos/Población)*100,000 usando los mismos Casos y Población que ya se ven en pantalla");
  await page.screenshot({ path: `${OUT}/03_analizar_tasa.png`, fullPage: true });

  // Verificación cruzada con una suma INDEPENDIENTE hecha por fuera
  // (openpyxl, ver más abajo en el shell) — se compara contra un archivo
  // que este mismo script escribe a disco para que el runner externo la
  // pueda leer sin duplicar la lógica de lectura de Excel en Playwright.
  fs.writeFileSync(`${OUT}/verificacion_poblacion_queretaro_2025.json`, JSON.stringify({
    poblacionMostrada: poblacionQueretaro2025Mostrada,
    casosMostrados: casosQueretaro2025,
    tasaMostrada: tasaQueretaro2025Mostrada,
  }, null, 2));

  console.log("\n=== PARTE 2 completada: Casos/Población/Tasa funcionan con las bases reales ===\n");

  console.log("=== PARTE 3: PDF adaptable (vertical primero, horizontal si no cabe) ===\n");

  // Caso simple: Municipio (nombres cortos) como dimensión, Analizar=Tasa,
  // Año=2025 (sin comparativo) -> tabla de 3 columnas, debe quedarse vertical.
  const [downloadSimple] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.click("#btn-carga-exportar-pdf"),
  ]);
  const pdfSimplePath = `${OUT}/pdf_simple_vertical.pdf`;
  await downloadSimple.saveAs(pdfSimplePath);
  const mbSimple = mediaBoxDePDF(fs.readFileSync(pdfSimplePath));
  console.log("PDF caso simple (Tasa por Municipio, 1 año) — MediaBox:", mbSimple);
  assert(mbSimple && mbSimple.orientation === "portrait", "Con una tabla simple (3 columnas, nombres cortos) el PDF debe quedar en vertical");

  // Caso que fuerza horizontal: Padecimiento (nombres largos) como
  // dimensión + comparativo 2025 vs 2026 (6 columnas, incl. Diferencia y
  // Variación %).
  await page.selectOption("#carga-select-medida-analisis", "casos");
  await page.click("#btn-carga-cambiar-mapeo");
  await esperarPaso(page, "carga-paso-mapeo", 15000);
  await fijarRol(page, "Municipio", "ignorar");
  await fijarRol(page, "Grupo de edad", "ignorar");
  await fijarRol(page, "Padecimiento", "dimension");
  await page.click("#btn-carga-validar");
  await esperarPaso(page, "carga-paso-resultado", 30000);
  await page.waitForTimeout(300);
  const diag = await page.evaluate(() => ({
    vacio: document.getElementById("carga-resultado-vacio").style.display,
    panels: document.getElementById("carga-resultado-panels").style.display,
    filtrosWrapVisible: document.getElementById("carga-filtros-wrap").style.display,
    nAnioMultiselect: document.querySelectorAll(".carga-anio-multiselect").length,
  }));
  console.log("Diagnóstico tras re-validar con Padecimiento=dimension:", diag);
  await marcarAnio(page, "2025", true);
  await marcarAnio(page, "2026", true);
  await page.waitForTimeout(300);
  const cabeceraLarga = await page.$$eval("#carga-tabla-head th", (ths) => ths.map((t) => t.textContent.trim()));
  console.log("Encabezado con Padecimiento + comparativo:", cabeceraLarga);
  assert(cabeceraLarga.length === 6, "Con Padecimiento como dimensión y comparativo 2025 vs 2026, la tabla debe tener 6 columnas");
  await page.screenshot({ path: `${OUT}/04_padecimiento_comparativo_antes_pdf.png`, fullPage: true });

  const [downloadLargo] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.click("#btn-carga-exportar-pdf"),
  ]);
  const pdfLargoPath = `${OUT}/pdf_padecimiento_comparativo_horizontal.pdf`;
  await downloadLargo.saveAs(pdfLargoPath);
  const bufLargo = fs.readFileSync(pdfLargoPath);
  const mbLargo = mediaBoxDePDF(bufLargo);
  console.log("PDF Padecimiento+comparativo — MediaBox:", mbLargo, `(${(bufLargo.length / 1024).toFixed(1)} KB)`);
  assert(mbLargo && mbLargo.orientation === "landscape",
    "Con Padecimiento (nombres largos) como dimensión y comparativo de años (6 columnas), el PDF debe cambiar automáticamente a horizontal");

  const { PDFParse } = require("pdf-parse");
  const pdfParser = new PDFParse({ data: bufLargo });
  const pdfResult = await pdfParser.getText();
  console.log("---- Primeras líneas del PDF horizontal ----");
  console.log(pdfResult.text.split("\n").slice(0, 9).join("\n"));
  assert(pdfResult.text.includes("Comparativo de años: 2025 vs 2026"), "El PDF horizontal debe seguir incluyendo la línea de comparativo de años, igual que antes");
  assert(pdfResult.text.includes("Medida: Casos"), "El PDF horizontal debe indicar 'Medida: Casos' (se había dejado 'Analizar=Casos' antes de este PDF)");

  console.log("\n=== PARTE 3 completada: el PDF elige vertical u horizontal según la tabla real ===\n");

  console.log("=== Errores de consola del navegador durante toda la prueba ===");
  const erroresRelevantes = erroresConsola.filter((e) => !e.includes("ERR_TUNNEL_CONNECTION_FAILED") && !e.includes("fonts.googleapis"));
  console.log(erroresConsola.join("\n") || "(ninguno)");
  assert(erroresRelevantes.length === 0, "No debe haber errores de consola del navegador (aparte de bloqueos de red conocidos del sandbox)");

  console.log("\n=== FIN — ACT06 (Partes 1, 2 y 3) VALIDADO CON LAS BASES REALES ===");
  await browser.close();
})().catch((err) => {
  console.error("\n!!! ERROR EN LA PRUEBA:", err.message);
  process.exit(1);
});
