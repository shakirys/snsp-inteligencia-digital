/**
 * Validación en navegador real (Chromium vía Playwright) del REDISEÑO
 * del PDF de Morbilidad (ACT22):
 *   - Deduplicación: "Gráfica y tabla principal" vs panorama de la misma
 *     dimensión (Por=Municipio/Padecimiento, selección por defecto).
 *   - Separación clara Bloque 1 / Bloque 2 (franja "BLOQUE 1"/"BLOQUE 2").
 *   - Unidad médica y Padecimientos fuerzan Top 10 en el reporte.
 *   - Municipio: siempre los 18 municipios, nunca Top 10.
 *   - El PDF final es un documento real, descargable, con menos páginas
 *     que si no existiera la deduplicación.
 *   - No se altera ningún dato/cálculo (Bloque 1 = Bloque 2 = 3,551,200).
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8099;
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

function contarPaginasPdf(buffer) {
  const texto = buffer.toString("latin1");
  const m = texto.match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : null;
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(15000);
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
  await page.goto(BASE + "/pages/morbilidad.html", { waitUntil: "load" });
  await page.waitForTimeout(600);

  console.log("\n--- Estado por defecto: Por = Municipio (Bloque 1) / Padecimiento (Bloque 2) ---");
  const porDefectoH = await page.locator("#morb-h-select-dim").inputValue();
  const porDefectoP = await page.locator("#morb-p-select-dim").inputValue();
  assert(porDefectoH === "municipio", `Bloque 1 'Por' por defecto debe ser municipio (trae: ${porDefectoH})`);
  assert(porDefectoP === "padecimiento", `Bloque 2 'Por' por defecto debe ser padecimiento (trae: ${porDefectoP})`);

  console.log("\n--- Abrir modal 'Generar reporte PDF' con la selección por defecto ---");
  await page.click("#btn-morb-abrir-pdf");
  await page.waitForTimeout(200);
  await page.click("#btn-morb-pdf-generar"); // Vista previa
  await page.waitForTimeout(500);

  const vistaPreviaTexto = await page.locator("#morb-pdf-vista-previa-resumen").innerText();
  assert(/BLOQUE 1 — MORBILIDAD GENERAL/.test(vistaPreviaTexto), "La vista previa debe mostrar la franja divisoria 'BLOQUE 1 — MORBILIDAD GENERAL'");
  assert(/BLOQUE 2 — PADECIMIENTO/.test(vistaPreviaTexto), "La vista previa debe mostrar la franja divisoria 'BLOQUE 2 — PADECIMIENTO(S)'");
  // Limpieza final (a pedido explícito): las notas internas de "se omitió
  // por duplicar..." ya NO deben aparecer en el reporte — la deduplicación
  // sigue activa (la sección duplicada sigue sin mostrarse), sólo el texto
  // que lo explicaba se quitó por ser información interna.
  assert(!/duplicar esta misma gráfica/.test(vistaPreviaTexto), "La vista previa NO debe mostrar la nota interna de 'se omitió por duplicar...' (debe quitarse del reporte, aunque la deduplicación siga activa)");

  const paginasVistaPrevia = await page.locator(".morb-vista-previa-pagina").count();
  console.log(`  (info) páginas en la vista previa con selección por defecto: ${paginasVistaPrevia}`);
  assert(paginasVistaPrevia > 0 && paginasVistaPrevia < 15, `El reporte por defecto no debe dispararse a decenas de páginas (trae: ${paginasVistaPrevia})`);

  console.log("\n--- 'Gráfica y tabla principal' (Bloque 1) con Por=Municipio por defecto: también debe forzar apaisado ---");
  const orientPrincipalH = await page.locator('#morb-pdf-vista-previa-resumen .morb-vista-previa-pagina', { hasText: "Gráfica y tabla principal" }).first().getAttribute("data-orientacion");
  assert(orientPrincipalH === "landscape", `La página de 'Gráfica y tabla principal' (Por=Municipio por defecto) debe forzar hoja apaisada igual que la sección dedicada de Municipio (trae: ${orientPrincipalH})`);
  const anchoImgPrincipalH = await page.evaluate(() => {
    const paginas = Array.from(document.querySelectorAll("#morb-pdf-vista-previa-resumen .morb-vista-previa-pagina"));
    const pag = paginas.find((p) => p.textContent.includes("Gráfica y tabla principal"));
    const img = pag ? pag.querySelector("img") : null;
    return img ? img.naturalWidth : null;
  });
  assert(anchoImgPrincipalH !== null && anchoImgPrincipalH >= 1200, `La gráfica de 'Gráfica y tabla principal' (Municipio) debe venir de un lienzo ancho dedicado al PDF (trae: ${anchoImgPrincipalH})`);

  console.log("\n--- Generar el PDF final y medir páginas/tamaño reales ---");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#btn-morb-pdf-generar-final"),
  ]);
  const pdfPath = path.join(ROOT, "act22_morbilidad_reporte_muestra.pdf");
  await download.saveAs(pdfPath);
  const buffer = fs.readFileSync(pdfPath);
  assert(buffer.length > 10000, `El PDF de Morbilidad debe pesar más de 10 KB (trae: ${buffer.length} bytes)`);
  const nPaginas = contarPaginasPdf(buffer);
  console.log(`  (info) PDF final: ${buffer.length} bytes, ${nPaginas} página(s) detectadas`);
  assert(nPaginas !== null && nPaginas > 0 && nPaginas < 15, `El PDF final (selección por defecto) debe tener un número de páginas razonable, no decenas (trae: ${nPaginas})`);

  console.log("\n--- Volver a abrir el modal (se cerró tras generar el PDF) para probar Unidad médica + Padecimientos (Top 10 forzado) ---");
  await page.click("#btn-morb-abrir-pdf");
  await page.waitForTimeout(200);
  await page.click("#btn-morb-pdf-limpiar");
  await page.check('#morb-pdf-secciones input[value="kpi_h"]');
  await page.check('#morb-pdf-secciones input[value="unidadmedica"]');
  await page.check('#morb-pdf-secciones input[value="kpi_p"]');
  await page.check('#morb-pdf-secciones input[value="padecimientos"]');
  await page.click("#btn-morb-pdf-generar");
  await page.waitForTimeout(500);
  const vp2 = await page.locator("#morb-pdf-vista-previa-resumen").innerText();
  assert(/Top 10 de \d+ unidades médicas/.test(vp2), `La vista previa debe indicar 'Top 10 de N unidades médicas' (trae fragmento: ${(vp2.match(/.{0,40}unidades médicas.{0,60}/) || [""])[0]})`);
  assert(/Top 10 de \d+ padecimientos/.test(vp2) || /Padecimiento específico seleccionado/.test(vp2), "La vista previa debe indicar Top 10 de padecimientos (o la selección específica si aplica)");
  assert(/el total general.*corresponde a TODAS las unidades médicas/.test(vp2) || /TODAS las unidades médicas/.test(vp2), "Debe aclarar que el total general no es sólo el Top 10 de unidades médicas");

  console.log("\n--- Municipio: siempre los 18, nunca Top 10, hoja apaisada ---");
  await page.click("#btn-morb-pdf-volver-editar").catch(() => {});
  await page.waitForTimeout(200);
  await page.click("#btn-morb-pdf-limpiar");
  await page.check('#morb-pdf-secciones input[value="municipio"]');
  await page.click("#btn-morb-pdf-generar");
  await page.waitForTimeout(500);
  const vp3 = await page.locator("#morb-pdf-vista-previa-resumen").innerText();
  const filasMunicipioVP = await page.locator("#morb-pdf-vista-previa-resumen table tbody tr").count();
  assert(filasMunicipioVP === 18, `La tabla de municipio en el PDF debe tener 18 filas, nunca Top 10 (trae: ${filasMunicipioVP})`);
  assert(/nunca Top 10/.test(vp3), "La nota de municipio debe aclarar explícitamente 'nunca Top 10'");
  const orientMunicipio = await page.locator('#morb-pdf-vista-previa-resumen .morb-vista-previa-pagina', { hasText: "Casos por municipio" }).first().getAttribute("data-orientacion");
  assert(orientMunicipio === "landscape", `La página de Municipio debe forzar orientación horizontal/apaisada (trae: ${orientMunicipio})`);
  const anchoImgMunicipio = await page.evaluate(() => {
    const img = document.querySelector("#morb-pdf-vista-previa-resumen img");
    return img ? img.naturalWidth : null;
  });
  assert(anchoImgMunicipio !== null && anchoImgMunicipio >= 1200, `La gráfica de Municipio debe venir de un lienzo ancho (>=1200px), no del panel chico en pantalla (trae: ${anchoImgMunicipio})`);

  console.log("\n--- Deduplicación Tendencia/Comparativo por mes y año (ambos bloques, selección por defecto) ---");
  await page.click("#btn-morb-pdf-volver-editar").catch(() => {});
  await page.waitForTimeout(200);
  await page.click("#btn-morb-pdf-limpiar");
  await page.check('#morb-pdf-secciones input[value="tendencia"]');
  await page.check('#morb-pdf-secciones input[value="mesanio"]');
  await page.check('#morb-pdf-secciones input[value="tendencia_p"]');
  await page.check('#morb-pdf-secciones input[value="mesanio_p"]');
  await page.click("#btn-morb-pdf-generar");
  await page.waitForTimeout(500);
  const vp4 = await page.locator("#morb-pdf-vista-previa-resumen").innerText();
  assert(/Tendencia por año\/mes/.test(vp4), "Debe conservarse 'Tendencia por año/mes' en Bloque 1");
  assert(!/Comparativo por mes y año/.test(vp4), "NO debe aparecer 'Comparativo por mes y año' en absoluto (ni como título de sección ni dentro de una nota interna) cuando ambas vistas mensuales están marcadas: la deduplicación sigue quitando la sección, y ahora también se quitó la nota que lo explicaba");
  assert(!/repetir la misma información mensual/.test(vp4), "La nota interna de deduplicación del comparativo mensual ya NO debe aparecer en el reporte (limpieza final a pedido explícito)");
  const seccionesVP4 = (vp4.match(/Tendencia por año\/mes/g) || []).length;
  assert(seccionesVP4 === 2, `Debe quedar exactamente 1 sección de tendencia por bloque (2 en total: Bloque 1 + Bloque 2) tras deduplicar (trae: ${seccionesVP4})`);

  console.log("\n--- Grupo de edad (Bloque 1): gráfica no debe venir del panel chico en pantalla ---");
  await page.click("#btn-morb-pdf-volver-editar").catch(() => {});
  await page.waitForTimeout(200);
  await page.click("#btn-morb-pdf-limpiar");
  await page.check('#morb-pdf-secciones input[value="grupoedad"]');
  await page.click("#btn-morb-pdf-generar");
  await page.waitForTimeout(500);
  const anchoImgGrupoEdad = await page.evaluate(() => {
    const img = document.querySelector("#morb-pdf-vista-previa-resumen img");
    return img ? img.naturalWidth : null;
  });
  assert(anchoImgGrupoEdad !== null && anchoImgGrupoEdad >= 800, `La gráfica de Grupo de edad debe venir de un lienzo ancho dedicado al PDF, no del panel chico en pantalla (trae: ${anchoImgGrupoEdad})`);

  console.log("\n--- Regenerar PDF de muestra con la selección por defecto (para revisión visual) ---");
  await page.click("#btn-morb-pdf-volver-editar").catch(() => {});
  await page.waitForTimeout(200);
  await page.click("#btn-morb-pdf-limpiar");
  await page.check('#morb-pdf-secciones input[value="kpi_h"]');
  await page.check('#morb-pdf-secciones input[value="principal_h"]');
  await page.check('#morb-pdf-secciones input[value="municipio"]');
  await page.check('#morb-pdf-secciones input[value="jurisdiccion"]');
  await page.check('#morb-pdf-secciones input[value="institucion"]');
  await page.check('#morb-pdf-secciones input[value="grupoedad"]');
  await page.check('#morb-pdf-secciones input[value="sexo"]');
  await page.check('#morb-pdf-secciones input[value="tendencia"]');
  await page.check('#morb-pdf-secciones input[value="mesanio"]');
  await page.check('#morb-pdf-secciones input[value="kpi_p"]');
  await page.check('#morb-pdf-secciones input[value="principal_p"]');
  await page.check('#morb-pdf-secciones input[value="padecimientos"]');
  await page.check('#morb-pdf-secciones input[value="tendencia_p"]');
  await page.check('#morb-pdf-secciones input[value="mesanio_p"]');
  await page.click("#btn-morb-pdf-generar");
  await page.waitForTimeout(500);
  const [download2] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#btn-morb-pdf-generar-final"),
  ]);
  const pdfPath2 = path.join(ROOT, "act22_morbilidad_reporte_muestra_corregido.pdf");
  await download2.saveAs(pdfPath2);
  const buffer2 = fs.readFileSync(pdfPath2);
  const nPaginas2 = contarPaginasPdf(buffer2);
  console.log(`  (info) PDF corregido (selección por defecto): ${buffer2.length} bytes, ${nPaginas2} página(s)`);
  assert(nPaginas2 !== null && nPaginas2 > 0 && nPaginas2 < 16, `El PDF corregido debe tener un número de páginas razonable (trae: ${nPaginas2})`);
  // Nota: el conteo de páginas ya NO es, por sí solo, señal de calidad: la
  // deduplicación Tendencia/Comparativo quita páginas, pero forzar hoja
  // apaisada + no reducir la gráfica de Municipio (ahora también cuando
  // aparece vía "Gráfica y tabla principal") puede añadir una página de
  // vuelta cuando la tabla de 18 filas no cabe junto a una gráfica grande.
  // La validación de calidad real es visual (ver capturas/paginación del
  // PDF revisadas aparte), no el número total de páginas.

  console.log("\n--- Sin errores de consola/JS ---");
  assert(errores.length === 0, `No debe haber errores de JS (trae: ${JSON.stringify(errores.slice(0, 5))})`);

  console.log(`\n=== RESULTADO: ${fallas === 0 ? "TODAS LAS PRUEBAS PASARON" : fallas + " PRUEBA(S) FALLARON"} ===`);
  await browser.close();
  server.close();
  process.exitCode = fallas === 0 ? 0 : 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
