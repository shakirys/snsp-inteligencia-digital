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
const OUT = "/tmp/claude-0/-home-claude/bd235fb8-47c1-5914-8daa-5273626f148d/scratchpad/screenshots_v2";

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
  await page.click("body", { position: { x: 5, y: 5 } }); // cierra el menú (click fuera)
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

  console.log("=== PARTE A: corrección del usuario de login (Osvaldo inactivo, Iván Borja nuevo) ===");
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });

  const chipsTexto = await page.$$eval(".role-chip", (chips) => chips.map((c) => c.textContent.trim()));
  console.log("Chips de acceso rápido en login:", chipsTexto);
  assert(!chipsTexto.some((t) => t.includes("Bobadilla")), "Osvaldo Bobadilla Mino NO debe aparecer en los chips de acceso rápido");
  assert(chipsTexto.some((t) => t.includes("Sánchez Torres")), "Soraya Sánchez Torres debe seguir apareciendo en los chips");
  assert(chipsTexto.some((t) => t.includes("Borja González")), "Luis Iván Borja González (nuevo usuario activo) debe aparecer en los chips");

  const loginOsvaldo = await page.evaluate(() => window.SNSP_AUTH.login("osvaldo.bobadilla@snsp.qro.gob.mx", "SNSP2025"));
  console.log("Intento de login de Osvaldo (inactivo):", JSON.stringify(loginOsvaldo));
  assert(loginOsvaldo.ok === false, "Osvaldo (inactivo) NO debe poder iniciar sesión");
  await page.evaluate(() => window.SNSP_AUTH.logout());

  const loginIvan = await page.evaluate(() => window.SNSP_AUTH.login("ivanborja.snsp@gmail.com", "SNSP2025"));
  console.log("Login de Luis Iván Borja González:", JSON.stringify({ ok: loginIvan.ok, nombre: loginIvan.user && loginIvan.user.nombre }));
  assert(loginIvan.ok === true, "Luis Iván Borja González (nuevo usuario activo) debe poder iniciar sesión");
  assert(loginIvan.user.role === "administrador", "Luis Iván Borja González debe tener rol administrador");
  await page.evaluate(() => window.SNSP_AUTH.logout());

  console.log("=== PARTE A completada: login corregido sin afectar la lógica general de autenticación ===\n");

  console.log("=== PARTE B: comparación de años en la gráfica (módulo Cargar datos) ===");
  await page.evaluate(() => window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025"));
  await page.goto(BASE + "/pages/carga.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#carga-dropzone");

  console.log("Subiendo SUIVE_BASE_COMPLETA (536,847 filas) — puede tardar...");
  const t0 = Date.now();
  const input = await page.$("#carga-input-archivo");
  await input.setInputFiles(SUIVE_PATH);
  await esperarPaso(page, "carga-paso-mapeo", 120000);
  console.log(`Archivo procesado en ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // ---- Escenario 1: Casos por Municipio, Año como filtro comparable ----
  await fijarRol(page, "Año", "filtro");
  await fijarRol(page, "Entidad", "ignorar");
  await fijarRol(page, "Jurisdicción", "ignorar");
  await fijarRol(page, "Municipio", "dimension");
  await fijarRol(page, "Institución", "filtro");
  await fijarRol(page, "Semana", "ignorar");
  await fijarRol(page, "Mes", "ignorar");
  await fijarRol(page, "Sexo", "ignorar");
  await fijarRol(page, "Grupo de edad", "ignorar");
  await fijarRol(page, "Unidad médica", "ignorar");
  await fijarRol(page, "Padecimiento", "filtro");
  await fijarRol(page, "Casos", "medida");
  await page.click("#btn-carga-validar");
  await esperarPaso(page, "carga-paso-resultado", 60000);
  await page.waitForTimeout(300);

  // Sin años elegidos: debe comportarse igual que antes (título corto oculto).
  const tituloCortoOculto = await page.$eval("#carga-chart-titulo-corto", (el) => el.style.display);
  assert(tituloCortoOculto === "none", "Sin años elegidos, el título corto no debe mostrarse (comportamiento clásico intacto)");
  await page.screenshot({ path: `${OUT}/01_municipio_sin_filtro_anio.png`, fullPage: true });

  // ---- Un solo año elegido: modo clásico, con título indicando el año ----
  await marcarAnio(page, "2025", true);
  await page.waitForTimeout(300);
  const tituloUnAnio = await page.textContent("#carga-chart-titulo-corto");
  console.log("Título corto con 1 año (Municipio):", tituloUnAnio);
  assert(tituloUnAnio.includes("Municipio") && tituloUnAnio.includes("2025") && !tituloUnAnio.includes("vs"),
    "Con 1 año elegido, el título corto debe indicar el año sin 'vs' (ej. 'Casos por Municipio — 2025')");
  const cabeceraUnAnio = await page.$$eval("#carga-tabla-head th", (ths) => ths.map((t) => t.textContent.trim()));
  assert(cabeceraUnAnio.join(",") === "#,Categoría,Valor", "Con 1 año elegido, la tabla debe seguir siendo la clásica de 3 columnas");
  await page.screenshot({ path: `${OUT}/02_municipio_un_anio_2025.png`, fullPage: true });

  // ---- Dos años elegidos: modo comparativo ----
  await marcarAnio(page, "2026", true);
  await page.waitForTimeout(400);
  const tituloComparativo = await page.textContent("#carga-chart-titulo-corto");
  console.log("Título corto en comparativo (Municipio):", tituloComparativo);
  assert(tituloComparativo.includes("Casos por Municipio") && tituloComparativo.includes("Comparativo 2025 vs 2026"),
    "El título corto en modo comparativo debe leerse 'Casos por Municipio — Comparativo 2025 vs 2026'");
  const cabeceraComparativo = await page.$$eval("#carga-tabla-head th", (ths) => ths.map((t) => t.textContent.trim()));
  console.log("Encabezado de tabla comparativa:", cabeceraComparativo);
  assert(cabeceraComparativo.join(",") === "#,Municipio,Casos 2025,Casos 2026,Diferencia,Variación %",
    "El encabezado comparativo debe traer Categoría|Casos 2025|Casos 2026|Diferencia|Variación %");
  const filasComparativo = await page.$$eval("#carga-tabla-body tr", (trs) => trs.length);
  assert(filasComparativo === 15, "Top 15 (default) debe limitar la tabla comparativa a 15 filas también");
  await page.screenshot({ path: `${OUT}/03_municipio_comparativo_2025_vs_2026.png`, fullPage: true });

  // Verifica que la gráfica sea de barras agrupadas (2 datasets, uno por año).
  const nDatasets = await page.$eval("#carga-chart", (c) => (window.Chart && window.Chart.getChart ? window.Chart.getChart(c).data.datasets.length : null));
  console.log("Número de series (datasets) en la gráfica comparativa:", nDatasets);
  assert(nDatasets === 2, "La gráfica comparativa debe tener 2 series (una por año), barras agrupadas");

  // ---- Top 10/15/20/Todas en modo comparativo sin etiquetas encimadas ----
  for (const top of ["10", "15", "20", "todas"]) {
    await page.selectOption("#carga-topn", top);
    await page.waitForTimeout(300);
    const altoPx = await page.$eval("#carga-chart-wrap", (el) => el.style.height);
    const filasTop = await page.$$eval("#carga-tabla-body tr", (trs) => trs.length);
    console.log(`Comparativo Municipio — Top ${top}: alto contenedor=${altoPx}, filas tabla=${filasTop}`);
    await page.screenshot({ path: `${OUT}/04_municipio_comparativo_top_${top}.png`, fullPage: true });
  }
  await page.selectOption("#carga-topn", "15");

  // ---- Filtro adicional simultáneo (Institución) combinado con el comparativo de años ----
  const selInstitucion = await page.$('.carga-filtro-select[data-col="4"]');
  const opcionesInstitucion = await selInstitucion.$$eval("option", (os) => os.map((o) => o.value));
  await selInstitucion.selectOption(opcionesInstitucion[1]);
  await page.waitForTimeout(300);
  const cabeceraConFiltro = await page.$$eval("#carga-tabla-head th", (ths) => ths.map((t) => t.textContent.trim()));
  assert(cabeceraConFiltro.join(",") === "#,Municipio,Casos 2025,Casos 2026,Diferencia,Variación %",
    "El comparativo debe seguir funcionando igual al combinarse con un filtro adicional (Institución)");
  await page.screenshot({ path: `${OUT}/05_municipio_comparativo_mas_institucion.png`, fullPage: true });
  await selInstitucion.selectOption("");
  await page.waitForTimeout(200);

  // ---- Exportar a PDF en modo comparativo ----
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.click("#btn-carga-exportar-pdf"),
  ]);
  const pdfPath = `${OUT}/reporte_comparativo_municipio.pdf`;
  await download.saveAs(pdfPath);
  const pdfStat = fs.statSync(pdfPath);
  console.log("PDF comparativo exportado:", pdfPath, `${(pdfStat.size / 1024).toFixed(1)} KB`);
  assert(pdfStat.size > 1000, "El PDF comparativo debe tener contenido (> 1KB)");

  const { PDFParse } = require("pdf-parse");
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfParser = new PDFParse({ data: pdfBuffer });
  const pdfResult = await pdfParser.getText();
  const pdfTexto = pdfResult.text;
  console.log("---- Texto extraído del PDF comparativo (primeras líneas) ----");
  console.log(pdfTexto.split("\n").slice(0, 14).join("\n"));
  assert(pdfTexto.includes("Comparativo de años: 2025 vs 2026"), "El PDF debe indicar explícitamente el comparativo de años");
  assert(pdfTexto.includes("Diferencia") || pdfTexto.includes("Variaci"), "La tabla del PDF debe incluir las columnas Diferencia/Variación %");

  // ---- Escenario 2: Casos por Padecimiento — Comparativo (ejemplo del usuario, etiquetas MUY largas) ----
  console.log("\n=== Escenario 2: Casos por Padecimiento — Comparativo 2025 vs 2026 (etiquetas largas) ===");
  await page.click("#btn-carga-cambiar-mapeo");
  await esperarPaso(page, "carga-paso-mapeo", 15000);
  await fijarRol(page, "Municipio", "ignorar");
  await fijarRol(page, "Padecimiento", "dimension");
  await fijarRol(page, "Institución", "ignorar");
  await page.click("#btn-carga-validar");
  await esperarPaso(page, "carga-paso-resultado", 60000);
  await page.waitForTimeout(300);

  await marcarAnio(page, "2025", true);
  await marcarAnio(page, "2026", true);
  await page.waitForTimeout(400);
  const tituloPadecimiento = await page.textContent("#carga-chart-titulo-corto");
  console.log("Título corto comparativo (Padecimiento):", tituloPadecimiento);
  assert(tituloPadecimiento.includes("Casos por Padecimiento") && tituloPadecimiento.includes("Comparativo 2025 vs 2026"),
    "El título corto debe leerse 'Casos por Padecimiento — Comparativo 2025 vs 2026', igual al ejemplo de referencia del usuario");

  for (const top of ["10", "15", "20", "todas"]) {
    await page.selectOption("#carga-topn", top);
    await page.waitForTimeout(350);
    const altoPx = await page.$eval("#carga-chart-wrap", (el) => el.style.height);
    const filasTop = await page.$$eval("#carga-tabla-body tr", (trs) => trs.length);
    console.log(`Comparativo Padecimiento (etiquetas largas) — Top ${top}: alto contenedor=${altoPx}, filas tabla=${filasTop}`);
    await page.screenshot({ path: `${OUT}/06_padecimiento_comparativo_top_${top}.png`, fullPage: true });
  }

  console.log("\n=== Errores de consola del navegador durante toda la prueba ===");
  console.log(erroresConsola.length ? erroresConsola.join("\n") : "(ninguno)");
  // ERR_TUNNEL_CONNECTION_FAILED al cargar la tipografía de Google Fonts
  // (styles/main.css, @import ya existente desde antes de esta ronda) es
  // un artefacto conocido del sandbox (sin salida a fonts.googleapis.com),
  // no una regresión de este cambio — se tolera explícitamente aquí; se
  // marca como fallo cualquier otro tipo de error de consola.
  const erroresReales = erroresConsola.filter((e) => !e.includes("ERR_TUNNEL_CONNECTION_FAILED"));
  assert(erroresReales.length === 0, "No debe haber errores de consola del navegador (aparte del bloqueo conocido de Google Fonts en el sandbox): " + erroresReales.join(" | "));

  await browser.close();
  console.log("\n=== FIN — TODAS LAS COMPROBACIONES DE ESTA RONDA PASARON ===");
})().catch(async (e) => {
  console.error("\n!!! ERROR EN LA PRUEBA:", e.message);
  process.exit(1);
});
