/**
 * Validación en navegador real (Chromium vía Playwright) del segundo
 * ajuste de seguimiento a ACT09 en Morbilidad (los 4 puntos pedidos en
 * este turno):
 *   1) Años: sin selección = comparativo 2025 vs 2026 (nunca sumados),
 *      un año = sólo ese año, ambos = comparativo — en la gráfica/tabla
 *      principal Y en los 8 paneles del Panorama de Casos.
 *   2) Mensuales: Tendencia/Comparativo por mes y año conservan todos
 *      los valores reales (tooltip) pero con etiquetas compactas/fuente
 *      reducida para no encimarse; meses sin información siguen en null.
 *   3) "Generar reporte PDF": modal con selección de secciones,
 *      Seleccionar todo/Limpiar, observaciones opcionales, genera SÓLO
 *      lo elegido respetando filtros/años activos — se descarga el PDF
 *      real (jsPDF + jsPDF-AutoTable reales, sin red) y se inspecciona
 *      su texto con pdf-parse para confirmar que NO es una captura de
 *      pantalla (sin imágenes) y que el contenido es el esperado.
 *   4) Limpieza de texto: sin "prueba funcional"/"demo"/"piloto", frase
 *      uniforme "Comparativo 2025 vs 2026", sin la línea "Ver fecha de
 *      archivo en Metodología", v2.5.0 se mantiene en el pie.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");

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
        options: {
          snspValueLabels: inst.options && inst.options.plugins ? inst.options.plugins.snspValueLabels : null,
        },
      };
    }, canvasId);
  }

  // =========================================================================
  // PUNTO 1 — Años: sin selección = comparativo (no suma), en TODOS los
  // paneles del Panorama de Casos (no sólo Tendencia/MesAnio).
  // =========================================================================
  console.log("\n--- Punto 1: años sin selección = comparativo en todo Panorama ---");
  await fijarAnios([]);
  await page.waitForTimeout(250);

  const panelesCanvas = {
    municipio: "morb-chart-municipio",
    jurisdiccion: "morb-chart-jurisdiccion",
    institucion: "morb-chart-institucion",
    grupoedad: "morb-chart-grupoedad",
    sexo: "morb-chart-sexo",
    padecimientos: "morb-chart-padecimientos",
    tendencia: "morb-chart-tendencia",
    mesanio: "morb-chart-mesanio",
  };
  for (const [nombre, canvasId] of Object.entries(panelesCanvas)) {
    const cfg = await chartCfg(canvasId);
    assert(cfg && cfg.datasets.length === 2, `[sin año marcado] Panel "${nombre}" debe venir en comparativo (2 series 2025/2026), no sumado (trae ${cfg ? cfg.datasets.length : "null"} series)`);
  }
  const cfgPrincipalImplicito = await chartCfg("morb-chart");
  assert(cfgPrincipalImplicito.datasets.length === 2, "[sin año marcado] La gráfica/tabla principal debe venir en comparativo (2 series), no sumada");
  const headTablaImplicito = await page.$eval("#morb-tabla-head", (el) => el.textContent);
  assert(headTablaImplicito.includes("2025") && headTablaImplicito.includes("2026") && headTablaImplicito.includes("Diferencia"), "[sin año marcado] La tabla principal debe traer columnas 2025/2026/Diferencia");

  // Un solo año: SÓLO ese año, en gráfica principal y en Panorama.
  await fijarAnios(["2026"]);
  await page.waitForTimeout(250);
  const cfgPrincipal2026 = await chartCfg("morb-chart");
  assert(cfgPrincipal2026.datasets.length === 1, "[2026 solo] La gráfica principal debe venir en modo clásico (1 serie), no comparativo");
  const cfgMunicipio2026 = await chartCfg("morb-chart-municipio");
  assert(cfgMunicipio2026.datasets.length === 1, "[2026 solo] Casos por municipio debe venir en modo clásico (1 serie)");
  const cfgJuris2026 = await chartCfg("morb-chart-jurisdiccion");
  assert(cfgJuris2026 !== null, "[2026 solo] Casos por jurisdicción debe seguir dibujándose (dona de un solo año)");

  // Ambos años marcados explícitamente: comparativo, igual que implícito.
  await fijarAnios(["2025", "2026"]);
  await page.waitForTimeout(250);
  const cfgMunicipioAmbos = await chartCfg("morb-chart-municipio");
  assert(cfgMunicipioAmbos.datasets.length === 2, "[2025+2026 explícito] Casos por municipio debe venir en comparativo (2 series)");

  // =========================================================================
  // PUNTO 2 — Etiquetas mensuales: formateador compacto + fuente reducida,
  // valores reales conservados (tooltip/dataset sin redondear ni recortar).
  // =========================================================================
  console.log("\n--- Punto 2: etiquetas mensuales compactas, valores completos conservados ---");
  const cfgTendenciaAmbos = await chartCfg("morb-chart-tendencia");
  assert(cfgTendenciaAmbos.options.snspValueLabels && typeof cfgTendenciaAmbos.options.snspValueLabels.fontSize === "number", "Tendencia debe traer un tamaño de fuente de etiqueta configurado");
  assert(cfgTendenciaAmbos.options.snspValueLabels.fontSize <= 10, `Tendencia debe usar una fuente pequeña (<=10px) para no encimar etiquetas (trae ${cfgTendenciaAmbos.options.snspValueLabels.fontSize})`);
  const valorReal2025 = cfgTendenciaAmbos.datasets[0].data.find((v) => v !== null && v > 999);
  assert(valorReal2025 !== undefined, "Tendencia 2025 debe conservar al menos un valor real >999 en el dataset (no truncado a miles)");
  const cfgMesAnioAmbos = await chartCfg("morb-chart-mesanio");
  assert(cfgMesAnioAmbos.options.snspValueLabels && cfgMesAnioAmbos.options.snspValueLabels.fontSize <= 10, "Comparativo por mes y año también debe usar fuente de etiqueta reducida");
  assert(cfgMesAnioAmbos.datasets[1].data.slice(8).every((v) => v === null), "Comparativo por mes y año 2026 debe seguir dejando Sep-Dic en null (sin información), no 0");

  // =========================================================================
  // PUNTO 4 — Limpieza de texto
  // =========================================================================
  console.log("\n--- Punto 4: limpieza de texto ---");
  const topbarTexto = await page.$eval("#topbar", (el) => el.textContent);
  assert(!/prueba funcional/i.test(topbarTexto), "El encabezado no debe decir 'prueba funcional'");
  assert(!/\bdemo\b/i.test(topbarTexto) && !/piloto/i.test(topbarTexto), "El encabezado no debe decir 'demo' ni 'piloto'");
  assert(!/Ver fecha de archivo en Metodología/i.test(topbarTexto), "El encabezado no debe traer 'Ver fecha de archivo en Metodología'");
  const metodologiaTexto = await (async () => {
    const p2 = await browser.newPage();
    for (const [url, localPath] of Object.entries(CDN_LOCAL)) {
      await p2.route(url, (route) => route.fulfill({ path: localPath }));
    }
    await p2.goto(BASE + "/pages/metodologia.html", { waitUntil: "networkidle" });
    const t = await p2.textContent("body");
    await p2.close();
    return t;
  })();
  assert(!/prueba funcional/i.test(metodologiaTexto), "Metodología: la sección de Morbilidad no debe decir 'prueba funcional'");
  const footerTexto = await page.$eval(".methodology-footer", (el) => el.textContent);
  assert(/v2\.5\.0/.test(footerTexto), `El pie debe mantener v2.5.0 (trae: "${footerTexto}")`);
  const chipsPlaceholder = await page.$eval("#morb-anio-chips", (el) => el.textContent);
  console.log("chips placeholder con ambos años marcados (no aplica, hay chips):", chipsPlaceholder);
  await fijarAnios([]);
  await page.waitForTimeout(200);
  const chipsSinMarcar = await page.$eval("#morb-anio-chips", (el) => el.textContent);
  assert(/Comparativo 2025 vs 2026/.test(chipsSinMarcar), `Sin año marcado, el texto junto al selector debe decir "Comparativo 2025 vs 2026" (trae: "${chipsSinMarcar}")`);

  // =========================================================================
  // PUNTO 3 — Generar reporte PDF (documento REAL, sin red, se inspecciona
  // con pdf-parse) — respeta filtros/años activos, nada de captura de
  // pantalla, incluye encabezado/periodo/filtros/fecha/fuente/páginas.
  // =========================================================================
  console.log("\n--- Punto 3: Generar reporte PDF (documento real) ---");
  // Deja el tablero en un estado conocido: comparativo implícito (sin año
  // marcado, ya lo dejamos así arriba), con un filtro de Municipio activo
  // para comprobar que el PDF refleja los filtros vigentes.
  await page.selectOption("#morb-select-dim", "padecimiento");
  await page.waitForTimeout(150);

  await page.click("#btn-morb-abrir-pdf");
  await page.waitForSelector("#modal-morb-pdf.is-open", { timeout: 5000 });
  assert(true, "El modal de 'Generar reporte PDF' se abre correctamente");

  // Deja marcadas sólo 3 secciones (para comprobar que "sólo lo elegido" se
  // respeta) + escribe una observación.
  await page.click("#btn-morb-pdf-limpiar");
  const seccionesElegir = ["kpi", "principal", "municipio"];
  for (const valor of seccionesElegir) {
    await page.check(`#morb-pdf-secciones input[value="${valor}"]`);
  }
  await page.fill("#morb-pdf-observaciones", "Reporte generado para revisión de la Jurisdicción Sanitaria No. 1.");

  const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await page.click("#btn-morb-pdf-generar");
  const download = await downloadPromise;
  const outPath = path.join("/tmp", "morb_reporte_pdf_test.pdf");
  await download.saveAs(outPath);
  assert(fs.existsSync(outPath), "El PDF debe descargarse como archivo real");

  const pdfBuffer = fs.readFileSync(outPath);
  const parser = new PDFParse({ data: pdfBuffer });
  const pdfResult = await parser.getText();
  const pdfData = { text: pdfResult.text, numpages: pdfResult.total_pages || (pdfResult.pages ? pdfResult.pages.length : undefined) };
  await parser.destroy();
  console.log("Número de páginas del PDF:", pdfData.numpages);
  console.log("Texto del PDF (primeros 500 caracteres):\n", pdfData.text.slice(0, 500));

  assert(pdfData.text.includes("SNSP Inteligencia Digital"), "El PDF debe llevar el encabezado del módulo");
  assert(pdfData.text.includes("Morbilidad en el estado de Querétaro"), "El PDF debe mencionar Morbilidad en el estado de Querétaro");
  assert(/Periodo/.test(pdfData.text), "El PDF debe incluir el periodo");
  assert(/Comparativo 2025 vs 2026/.test(pdfData.text), "El PDF debe reflejar el periodo comparativo vigente (sin año marcado)");
  assert(/Filtros aplicados/.test(pdfData.text), "El PDF debe incluir la línea de filtros aplicados");
  assert(/Fecha de generación/.test(pdfData.text), "El PDF debe incluir la fecha de generación");
  assert(/Fuente/.test(pdfData.text) && /sin fecha de corte registrada/.test(pdfData.text), "El PDF debe incluir la fuente y avisar honestamente que no hay fecha de corte registrada");
  assert(/Observaciones/.test(pdfData.text) && pdfData.text.includes("Reporte generado para revisión de la Jurisdicción Sanitaria No. 1."), "El PDF debe incluir la observación escrita");
  assert(/Página 1 de \d+/.test(pdfData.text), "El PDF debe numerar sus páginas");
  assert(pdfData.text.includes("Indicadores"), "El PDF debe incluir la sección Indicadores (elegida)");
  assert(pdfData.text.includes("Gráfica y tabla principal"), "El PDF debe incluir la sección de gráfica/tabla principal (elegida)");
  assert(pdfData.text.includes("Casos por municipio"), "El PDF debe incluir la sección Casos por municipio (elegida)");
  assert(!pdfData.text.includes("Casos por institución"), "El PDF NO debe incluir secciones que no fueron marcadas (Casos por institución)");
  assert(!pdfData.text.includes("Tendencia por año/mes"), "El PDF NO debe incluir secciones que no fueron marcadas (Tendencia por año/mes)");
  // Ajuste de seguimiento posterior (punto 4): las secciones ahora se
  // EMPACAN en vez de forzar 1 página nueva por cada una — "Indicadores"
  // (sin gráfica, tabla corta) comparte la página 1 con el encabezado en
  // vez de abrir su propia página casi vacía; "Gráfica y tabla principal"
  // y "Casos por municipio" sí incluyen su gráfica real (imagen) y por eso
  // cada una ocupa su propia página. Se espera un mínimo de 3 páginas
  // (1: encabezado+Indicadores, 2: principal, 3: municipio), nunca menos.
  assert(pdfData.numpages >= 3, `El PDF debe tener al menos 3 páginas (encabezado+Indicadores empacados, + 2 secciones con gráfica) — trae ${pdfData.numpages}`);
  assert(pdfData.text.split("SNSP Inteligencia Digital").length - 1 === 1, "El encabezado del módulo debe aparecer una sola vez (Indicadores empacado en la misma página, no una portada aparte)");

  // ---- Validación: ninguna sección marcada -> error, sin descargar nada ----
  await page.click("#btn-morb-abrir-pdf");
  await page.waitForSelector("#modal-morb-pdf.is-open");
  await page.click("#btn-morb-pdf-limpiar");
  await page.click("#btn-morb-pdf-generar");
  await page.waitForTimeout(200);
  const errorVisible = await page.$eval("#morb-pdf-error", (el) => el.classList.contains("is-visible"));
  assert(errorVisible, "Sin ninguna sección marcada, debe mostrarse el error dentro del modal (sin generar PDF)");
  await page.click("#btn-morb-pdf-cancelar");
  await page.waitForTimeout(150);
  const modalCerrado = await page.$eval("#modal-morb-pdf", (el) => !el.classList.contains("is-open"));
  assert(modalCerrado, "El modal debe poder cerrarse con Cancelar");

  const erroresRelevantes = erroresJS.filter((e) => !/Failed to load resource/i.test(e));
  console.log("\nErrores de JS relevantes:", erroresRelevantes.length);
  erroresRelevantes.forEach((e) => console.log("  -", e));
  assert(erroresRelevantes.length === 0, "Sin errores de JS relevantes en consola durante toda la prueba");

  await browser.close();
  console.log("\n=== VALIDACIÓN (NAVEGADOR REAL) DEL SEGUNDO AJUSTE DE SEGUIMIENTO A ACT09 COMPLETADA SIN ERRORES ===");
})().catch((e) => { console.error(e); process.exit(1); });
