/**
 * Validación en navegador real (Chromium vía Playwright) del tercer
 * ajuste de seguimiento a ACT09 en Morbilidad (puntos 3, 4 y 5 de ese
 * turno — los puntos 1 y 2, Mes/Semana epidemiológica como filtros, NO se
 * implementaron: requieren la base cruda BASE_CASOS_2025_2026.xlsx, que
 * no está disponible en este entorno; ver mensaje a la usuaria):
 *   3) Tendencia por año/mes y Comparativo por mes y año, uno debajo del
 *      otro al 100% del ancho del Panorama, conservando todos los valores.
 *   4) El PDF debe incluir las gráficas seleccionadas de verdad (no sólo
 *      tablas) y evitar páginas casi vacías (secciones empacadas en las
 *      mismas páginas en vez de una página nueva por sección).
 *   5) "v2.5.0 · demo" -> "v2.5.0" en el pie del sidebar (global, no sólo
 *      Morbilidad).
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

  // =========================================================================
  // PUNTO 5 — "v2.5.0 · demo" -> "v2.5.0" (sidebar, global)
  // =========================================================================
  console.log("\n--- Punto 5: quitar 'demo' del pie del sidebar ---");
  const sidebarFooterTexto = await page.$eval(".sidebar__footer", (el) => el.textContent.replace(/\s+/g, " ").trim());
  console.log("sidebar__footer:", sidebarFooterTexto);
  assert(!/demo/i.test(sidebarFooterTexto), `El pie del sidebar ya no debe decir "demo" (trae: "${sidebarFooterTexto}")`);
  assert(/v2\.5\.0/.test(sidebarFooterTexto), `El pie del sidebar debe seguir mostrando v2.5.0 (trae: "${sidebarFooterTexto}")`);

  // También en otro módulo (CACU), para confirmar que es un arreglo
  // global y no algo pegado sólo a Morbilidad.
  const p2 = await browser.newPage();
  for (const [url, localPath] of Object.entries(CDN_LOCAL)) {
    await p2.route(url, (route) => route.fulfill({ path: localPath }));
  }
  await p2.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await p2.evaluate(() => window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025"));
  await p2.goto(BASE + "/pages/cacu.html", { waitUntil: "networkidle" });
  const sidebarFooterCACU = await p2.$eval(".sidebar__footer", (el) => el.textContent.replace(/\s+/g, " ").trim());
  assert(!/demo/i.test(sidebarFooterCACU), `El pie del sidebar tampoco debe decir "demo" en otro módulo (CACU) (trae: "${sidebarFooterCACU}")`);
  await p2.close();

  // =========================================================================
  // PUNTO 3 — Tendencia y Comparativo por mes y año, 100% de ancho, uno
  // debajo del otro, conservando todos los valores.
  // =========================================================================
  console.log("\n--- Punto 3: Tendencia/Comparativo por mes y año a ancho completo ---");
  async function chartCfg(canvasId) {
    return page.evaluate((id) => {
      const inst = Chart.getChart(document.getElementById(id));
      if (!inst) return null;
      return { labels: inst.data.labels, datasets: inst.data.datasets.map((d) => ({ label: d.label, data: d.data })) };
    }, canvasId);
  }
  const claseTendencia = await page.$eval("#morb-wrap-tendencia", (el) => el.closest("section").className);
  const claseMesAnio = await page.$eval("#morb-wrap-mesanio", (el) => el.closest("section").className);
  assert(/col-span-12/.test(claseTendencia), `La tarjeta de Tendencia por año/mes debe ser col-span-12 (100% de ancho) (trae: "${claseTendencia}")`);
  assert(/col-span-12/.test(claseMesAnio), `La tarjeta de Comparativo por mes y año debe ser col-span-12 (100% de ancho) (trae: "${claseMesAnio}")`);

  const boxTendencia = await page.$eval("#morb-wrap-tendencia", (el) => el.closest("section").getBoundingClientRect().width);
  const boxMesAnio = await page.$eval("#morb-wrap-mesanio", (el) => el.closest("section").getBoundingClientRect().width);
  const boxGraficaPrincipal = await page.$eval("#morb-chart-wrap", (el) => el.closest("section").getBoundingClientRect().width);
  const boxMunicipio = await page.$eval("#morb-wrap-municipio", (el) => el.closest("section").getBoundingClientRect().width);
  console.log("Ancho (px) — principal:", boxGraficaPrincipal, "| municipio (col-span-6):", boxMunicipio, "| Tendencia:", boxTendencia, "| MesAnio:", boxMesAnio);
  assert(Math.abs(boxTendencia - boxGraficaPrincipal) < 2, `Tendencia debe medir el mismo ancho que una tarjeta col-span-12 ya conocida (Gráfica principal) (Tendencia=${boxTendencia}px, principal=${boxGraficaPrincipal}px)`);
  assert(Math.abs(boxMesAnio - boxGraficaPrincipal) < 2, `Comparativo por mes y año debe medir el mismo ancho que una tarjeta col-span-12 (MesAnio=${boxMesAnio}px, principal=${boxGraficaPrincipal}px)`);
  assert(boxTendencia > boxMunicipio * 1.5, `Tendencia debe ser notablemente más ancha que un panel col-span-6 como Municipio (Tendencia=${boxTendencia}px, Municipio=${boxMunicipio}px)`);

  // Uno debajo del otro: el top de MesAnio debe estar por debajo del
  // bottom de Tendencia (no lado a lado).
  const rectTendencia = await page.$eval("#morb-wrap-tendencia", (el) => { const r = el.closest("section").getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  const rectMesAnio = await page.$eval("#morb-wrap-mesanio", (el) => { const r = el.closest("section").getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  assert(rectMesAnio.top >= rectTendencia.bottom - 1, "Comparativo por mes y año debe quedar DEBAJO de Tendencia por año/mes (apilados, no lado a lado)");

  // Conserva todos los valores: con ambos años, 2 series de 12 meses cada
  // una, igual que antes de este ajuste (cambio puramente de layout).
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
  await fijarAnios(["2025", "2026"]);
  await page.waitForTimeout(200);
  const cfgTendencia = await chartCfg("morb-chart-tendencia");
  const cfgMesAnio = await chartCfg("morb-chart-mesanio");
  assert(cfgTendencia.labels.length === 12 && cfgTendencia.datasets.length === 2, "Tendencia sigue con 12 meses y 2 series (comparativo) tras el cambio de layout");
  assert(cfgMesAnio.labels.length === 12 && cfgMesAnio.datasets.length === 2, "Comparativo por mes y año sigue con 12 meses y 2 series tras el cambio de layout");
  assert(cfgTendencia.datasets[1].data.slice(8).every((v) => v === null), "Tendencia 2026 sigue dejando Sep-Dic en null (sin información) tras el cambio de layout");

  // =========================================================================
  // PUNTO 4 — El PDF incluye las gráficas de verdad (imágenes reales) y
  // evita páginas casi vacías (secciones empacadas, no 1 página c/u).
  // =========================================================================
  console.log("\n--- Punto 4: PDF con gráficas reales y sin páginas casi vacías ---");
  await page.selectOption("#morb-select-dim", "padecimiento");
  await page.waitForTimeout(150);

  await page.click("#btn-morb-abrir-pdf");
  await page.waitForSelector("#modal-morb-pdf.is-open", { timeout: 5000 });
  await page.click("#btn-morb-pdf-todo"); // las 10 secciones, para forzar el peor caso de páginas

  const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
  await page.click("#btn-morb-pdf-generar");
  const download = await downloadPromise;
  const outPath = path.join("/tmp", "morb_reporte_pdf_seguimiento3.pdf");
  await download.saveAs(outPath);
  assert(fs.existsSync(outPath), "El PDF (10 secciones) debe descargarse como archivo real");

  const pdfBuffer = fs.readFileSync(outPath);
  const parser = new PDFParse({ data: pdfBuffer });
  const textResult = await parser.getText();
  const imgResult = await parser.getImage({ imageThreshold: 20 });
  const totalImagenes = (imgResult.pages || []).reduce((s, p) => s + (p.images ? p.images.length : 0), 0);
  await parser.destroy();

  const totalPaginas = textResult.pages.length;
  console.log("Páginas del PDF (10 secciones marcadas):", totalPaginas);
  console.log("Imágenes embebidas encontradas:", totalImagenes, "en", (imgResult.pages || []).filter((p) => p.images && p.images.length).length, "páginas");

  assert(totalImagenes >= 9, `El PDF debe incluir una imagen real por cada sección con gráfica (9 de las 10: KPI no tiene gráfica) — se encontraron ${totalImagenes}`);
  // La medida real de "evitar páginas casi vacías" no es el total de
  // páginas (cada gráfica+tabla de verdad ocupa bastante espacio por sí
  // sola, así que un documento con las 10 secciones sigue siendo largo) —
  // es que ninguna página quede casi en blanco. Antes de este ajuste,
  // "Indicadores" (una tabla corta de 4 filas, sin gráfica) se saltaba a
  // su PROPIA página nueva, dejándola casi vacía; ahora debe compartir la
  // página 1 con el encabezado/metadatos.
  assert(textResult.pages[0].text.includes("Indicadores") && textResult.pages[0].text.includes("Casos totales"), "'Indicadores' (sección corta, sin gráfica) debe empacarse en la página 1 junto con el encabezado, no abrir su propia página casi vacía");
  assert(!textResult.pages[1] || !/^\s*Indicadores/.test(textResult.pages[1].text), "'Indicadores' no debe quedar como el único contenido de una página aparte");
  assert(textResult.text.includes("SNSP Inteligencia Digital"), "El PDF sigue llevando el encabezado del módulo");
  assert(/Página 1 de \d+/.test(textResult.text), "El PDF sigue numerando sus páginas");
  // No debe haber quedado ninguna sección sin su tabla (el cambio fue de
  // layout/imagen, no de contenido de tabla).
  ["Indicadores", "Casos por municipio", "Casos por institución", "Tendencia por año/mes", "Comparativo por mes y año"].forEach((titulo) => {
    assert(textResult.text.includes(titulo), `El PDF debe seguir incluyendo la sección "${titulo}"`);
  });

  // ---- Con pocas secciones cortas (sin gráfica), deben empacarse todas
  // en 1 sola página — antes (1 página por sección) hubieran sido 3
  // (encabezado + kpi + institución) aunque cupieran de sobra juntas. ----
  await page.click("#btn-morb-abrir-pdf");
  await page.waitForSelector("#modal-morb-pdf.is-open", { timeout: 5000 });
  await page.click("#btn-morb-pdf-limpiar");
  await page.check('#morb-pdf-secciones input[value="kpi"]');
  const downloadPromise2 = page.waitForEvent("download", { timeout: 15000 });
  await page.click("#btn-morb-pdf-generar");
  const download2 = await downloadPromise2;
  const outPath2 = path.join("/tmp", "morb_reporte_pdf_seguimiento3_corto.pdf");
  await download2.saveAs(outPath2);
  const parser2 = new PDFParse({ data: fs.readFileSync(outPath2) });
  const textResult2 = await parser2.getText();
  await parser2.destroy();
  console.log("Páginas del PDF (sólo Indicadores):", textResult2.pages.length);
  assert(textResult2.pages.length === 1, `Con sólo "Indicadores" marcado (sin gráfica), el PDF completo debe caber en 1 sola página — trae ${textResult2.pages.length}`);
  assert(textResult2.pages[0].text.includes("Indicadores") && textResult2.pages[0].text.includes("SNSP Inteligencia Digital"), "Esa única página debe traer encabezado + Indicadores juntos");

  const erroresRelevantes = erroresJS.filter((e) => !/Failed to load resource/i.test(e));
  console.log("\nErrores de JS relevantes:", erroresRelevantes.length);
  erroresRelevantes.forEach((e) => console.log("  -", e));
  assert(erroresRelevantes.length === 0, "Sin errores de JS relevantes en consola durante toda la prueba");

  await browser.close();
  console.log("\n=== VALIDACIÓN (NAVEGADOR REAL) DEL TERCER AJUSTE DE SEGUIMIENTO A ACT09 (PUNTOS 3, 4 Y 5) COMPLETADA SIN ERRORES ===");
})().catch((e) => { console.error(e); process.exit(1); });
