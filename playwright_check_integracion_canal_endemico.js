/**
 * Validación en navegador real (Chromium vía Playwright) de la
 * INTEGRACIÓN del prototipo aprobado "Canal Endémico Exploratorio" sobre
 * la copia local de ACT17/v2.6.0, más los 4 ajustes pedidos junto con la
 * integración:
 *   1. SE53 en la tabla de Canal Endémico → "Referencia insuficiente (n=1)"
 *   2. Menú: "Población (Querétaro)" → "Población"
 *   3. Filtro Año de Morbilidad: "Seleccionar todos"
 *   4. Menú: nuevo módulo como "Canal endémico" (sin "(prueba)")
 * No se modifica nada aquí — sólo se valida.
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8097;
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
  // Ajuste 4 + navegación: el sidebar debe mostrar "Canal endémico" (sin
  // "(prueba)") y "Población" (sin "(Querétaro)"); el resto de módulos
  // intactos.
  // =========================================================================
  console.log("\n--- Menú lateral: etiquetas nuevas ---");
  paginaActual = "dashboard.html";
  await page.goto(BASE + "/dashboard.html", { waitUntil: "load" });
  await page.waitForTimeout(300);
  const linksSidebar = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".sidebar__link")).map((a) => ({
      href: a.getAttribute("href"),
      texto: a.textContent.replace(/\s+/g, " ").trim(),
    }))
  );
  // dashboard.html vive en la raíz, así que el sidebar usa rutas con
  // prefijo "pages/" aquí (a diferencia de cuando se visita desde dentro
  // de pages/*.html) — se compara por sufijo para no depender de eso.
  const linkCanal = linksSidebar.find((l) => l.href.endsWith("canal_endemico.html"));
  const linkPoblacion = linksSidebar.find((l) => l.href.endsWith("poblacion.html"));
  assert(!!linkCanal && linkCanal.texto.includes("Canal endémico") && !linkCanal.texto.includes("(prueba)"),
    `El menú debe decir "Canal endémico" sin "(prueba)" (trae: ${linkCanal ? linkCanal.texto : "NO ENCONTRADO"})`);
  assert(!!linkPoblacion && linkPoblacion.texto.includes("Población") && !linkPoblacion.texto.includes("Querétaro"),
    `El menú debe decir "Población" sin "(Querétaro)" (trae: ${linkPoblacion ? linkPoblacion.texto : "NO ENCONTRADO"})`);
  assert(linksSidebar.some((l) => l.href.endsWith("morbilidad.html") && l.texto.includes("Morbilidad")), "El menú debe seguir incluyendo Morbilidad");
  assert(linksSidebar.some((l) => l.href.endsWith("cacu.html")) && linksSidebar.some((l) => l.href.endsWith("mama.html")), "El menú debe seguir incluyendo CACU y Mama");

  // =========================================================================
  // Canal Endémico integrado: totales, zonas y Ajuste 1 (SE53)
  // =========================================================================
  console.log("\n--- Canal Endémico integrado ---");
  paginaActual = "canal_endemico.html";
  await page.goto(BASE + "/pages/canal_endemico.html", { waitUntil: "load" });
  await page.waitForFunction(() => {
    const tbody = document.getElementById("tabla-semanas-body");
    return tbody && tbody.querySelectorAll("tr").length > 0;
  }, { timeout: 15000 });

  const topbarTexto = await page.textContent("#topbar");
  assert(topbarTexto.includes("Canal Endémico Exploratorio"), "Dentro de la página debe conservarse el título 'Canal Endémico Exploratorio'");
  assert(topbarTexto.includes("Intoxicación por picadura de alacrán"), "El subtítulo debe seguir siendo 'Intoxicación por picadura de alacrán'");
  const avisoTexto = await page.textContent(".alert-warning");
  assert(/herramienta exploratoria/i.test(avisoTexto), "La advertencia metodológica (herramienta exploratoria) debe conservarse");

  console.log("\n--- Limpieza de textos: sin referencias a 'prueba' en el navegador real ---");
  assert(!/prueba/i.test(avisoTexto), `El aviso superior ya no debe mencionar "prueba" (trae: ${avisoTexto.replace(/\s+/g, " ").trim()})`);
  assert(!/prueba/i.test(topbarTexto), `El encabezado ya no debe mencionar "prueba" (trae: ${topbarTexto.replace(/\s+/g, " ").trim()})`);
  const notaTextoReal = await page.textContent("#nota-metodologica");
  assert(!/prueba/i.test(notaTextoReal), `La nota metodológica ya no debe mencionar "prueba" (trae: ${notaTextoReal.replace(/\s+/g, " ").trim()})`);
  const footerTextoReal = await page.textContent(".methodology-footer");
  assert(!/prueba/i.test(footerTextoReal), `El pie de página ya no debe mencionar "prueba" (trae: ${footerTextoReal.replace(/\s+/g, " ").trim()})`);
  assert(/SNSP \| Inteligencia Digital v2\.6\.0/.test(footerTextoReal), `El pie de página debe quedar consistente con "SNSP | Inteligencia Digital v2.6.0" (trae: ${footerTextoReal.replace(/\s+/g, " ").trim()})`);

  function kpiValorNumero(label) {
    return page.evaluate((label) => {
      const tarjetas = Array.from(document.querySelectorAll("#kpi-grid .indicator-card"));
      const card = tarjetas.find((c) => (c.querySelector(".indicator-card__label") || {}).textContent === label);
      if (!card) return null;
      const v = (card.querySelector(".indicator-card__value") || {}).textContent || "";
      return parseInt(v.replace(/[^\d-]/g, ""), 10);
    }, label);
  }
  assert((await kpiValorNumero("Casos acumulados 2026")) === 4147, "Casos acumulados 2026 debe seguir siendo 4,147");
  assert((await kpiValorNumero("Última semana con información")) === 37, "Última semana con información debe seguir siendo 37");
  assert((await kpiValorNumero("Semanas en zona de éxito")) === 12, "Semanas en zona de éxito debe ser 12");
  assert((await kpiValorNumero("Semanas en zona de seguridad")) === 10, "Semanas en zona de seguridad debe ser 10");
  assert((await kpiValorNumero("Semanas en zona de alerta")) === 4, "Semanas en zona de alerta debe ser 4");
  assert((await kpiValorNumero("Semanas en zona epidémica")) === 11, "Semanas en zona epidémica debe ser 11");

  console.log("\n--- Ajuste 1: SE 53 en la tabla ---");
  const filaSE53 = await page.evaluate(() => {
    const filas = Array.from(document.querySelectorAll("#tabla-semanas-body tr"));
    const fila = filas.find((tr) => (tr.children[0] || {}).textContent === "53");
    return fila ? { texto: fila.textContent.replace(/\s+/g, " ").trim(), celdas: fila.querySelectorAll("td").length } : null;
  });
  assert(!!filaSE53, "Debe existir la fila de la SE 53 en la tabla");
  if (filaSE53) {
    assert(filaSE53.texto.includes("Referencia insuficiente (n=1)"), `La SE 53 debe decir "Referencia insuficiente (n=1)" (trae: ${filaSE53.texto})`);
    assert(filaSE53.celdas === 4, `La fila de la SE 53 debe tener 4 celdas visibles (trae: ${filaSE53.celdas})`);
  }
  const filaSE10 = await page.evaluate(() => {
    const filas = Array.from(document.querySelectorAll("#tabla-semanas-body tr"));
    const fila = filas.find((tr) => (tr.children[0] || {}).textContent === "10");
    return fila ? fila.querySelectorAll("td").length : null;
  });
  assert(filaSE10 === 6, `La SE 10 (referencia suficiente, n=4) debe conservar sus 6 celdas normales con Q1/Mediana/Q3 (trae: ${filaSE10})`);

  // =========================================================================
  // Morbilidad: total general sigue en 3,551,200 + Ajuste 3 "Seleccionar todos"
  // =========================================================================
  console.log("\n--- Morbilidad: regresión de totales ---");
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
  const totalMorbilidadH0 = await kpiValorNumeroGrid("kpi-grid-h", "Casos totales");
  const totalMorbilidadP0 = await kpiValorNumeroGrid("kpi-grid-p", "Casos totales");
  assert(totalMorbilidadH0 === 3551200, `Morbilidad Bloque 1 (estado inicial) — debe seguir siendo 3,551,200 (trae: ${totalMorbilidadH0})`);
  assert(totalMorbilidadP0 === 3551200, `Morbilidad Bloque 2 (estado inicial) — debe seguir siendo 3,551,200 (trae: ${totalMorbilidadP0})`);

  console.log("\n--- Ajuste 3: 'Seleccionar todos' en el filtro Año (navegador real) ---");
  await page.click("#morb-anio-toggle");
  await page.waitForSelector("#morb-anio-menu:not([hidden])");

  // Primero, marcar sólo un año (2023) para partir de un estado parcial.
  await page.evaluate(() => {
    document.querySelectorAll("#morb-anio-menu input[type=checkbox][value]").forEach((chk) => {
      const deseado = chk.value === "2023";
      if (chk.checked !== deseado) { chk.checked = deseado; chk.dispatchEvent(new Event("change", { bubbles: true })); }
    });
  });
  await page.waitForTimeout(150);
  let estadoTodos = await page.evaluate(() => document.getElementById("morb-anio-todos-check").checked);
  assert(estadoTodos === false, "Con un solo año marcado (2023), 'Seleccionar todos' debe estar desmarcado");

  // Clic real en "Seleccionar todos": deben quedar marcados todos los años.
  await page.click("#morb-anio-todos-check");
  await page.waitForTimeout(150);
  const todosMarcados = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#morb-anio-menu input[type=checkbox][value]")).every((c) => c.checked)
  );
  assert(todosMarcados, "Un clic real en 'Seleccionar todos' debe marcar todos los años disponibles");
  const totalTrasSeleccionarTodos = await kpiValorNumeroGrid("kpi-grid-h", "Casos totales");
  assert(totalTrasSeleccionarTodos === 3551200, `Con 'Seleccionar todos' marcado por clic, el Bloque 1 debe dar 3,551,200 (trae: ${totalTrasSeleccionarTodos})`);

  // Desmarcar un año individual (clic real) debe desactivar "Seleccionar todos".
  await page.click('#morb-anio-menu input[type=checkbox][value="2022"]');
  await page.waitForTimeout(150);
  estadoTodos = await page.evaluate(() => document.getElementById("morb-anio-todos-check").checked);
  assert(estadoTodos === false, "Clic real: al desmarcar un año (2022), 'Seleccionar todos' debe desactivarse");

  // Volver a marcarlo manualmente: 'Seleccionar todos' debe reflejarse marcado de nuevo.
  await page.click('#morb-anio-menu input[type=checkbox][value="2022"]');
  await page.waitForTimeout(150);
  estadoTodos = await page.evaluate(() => document.getElementById("morb-anio-todos-check").checked);
  assert(estadoTodos === true, "Clic real: al volver a marcar manualmente todos los años, 'Seleccionar todos' debe reflejarse marcado");

  await page.click("#morb-anio-toggle"); // cerrar el menú, dejar el filtro en 'todos' (equivalente al estado inicial sin selección)

  console.log("\n--- Regresión: navegación general (CACU, Mama, Población) ---");
  paginaActual = "cacu.html";
  await page.goto(BASE + "/pages/cacu.html", { waitUntil: "load" });
  await page.waitForTimeout(300);
  paginaActual = "mama.html";
  await page.goto(BASE + "/pages/mama.html", { waitUntil: "load" });
  await page.waitForTimeout(300);
  paginaActual = "poblacion.html";
  await page.goto(BASE + "/pages/poblacion.html", { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("kpi-grid") && document.getElementById("kpi-grid").children.length > 0, { timeout: 15000 });
  await page.waitForTimeout(500);
  const topbarPoblacion = await page.textContent("#topbar");
  assert(/Población/.test(topbarPoblacion), "La página de Población debe seguir cargando con su encabezado");

  console.log("\n--- Errores de JavaScript, por página ---");
  const erroresCanal = erroresPorPagina["canal_endemico.html"] || [];
  const erroresMorbilidad = erroresPorPagina["morbilidad.html"] || [];
  const erroresDashboard = erroresPorPagina["dashboard.html"] || [];
  const erroresCacu = erroresPorPagina["cacu.html"] || [];
  const erroresMama = erroresPorPagina["mama.html"] || [];
  const erroresPoblacion = erroresPorPagina["poblacion.html"] || [];

  assert(erroresCanal.length === 0, `Canal Endémico integrado: no debe haber errores de JS (encontrados: ${erroresCanal.length})\n${erroresCanal.join("\n---\n")}`);
  assert(erroresMorbilidad.length === 0, `Morbilidad: no debe haber errores de JS nuevos (encontrados: ${erroresMorbilidad.length})\n${erroresMorbilidad.join("\n---\n")}`);
  assert(erroresDashboard.length === 0, `Dashboard: no debe haber errores de JS (encontrados: ${erroresDashboard.length})`);
  assert(erroresCacu.length === 0, `CACU: no debe haber errores de JS (encontrados: ${erroresCacu.length})`);
  assert(erroresMama.length === 0, `Mama: no debe haber errores de JS (encontrados: ${erroresMama.length})`);

  if (erroresPoblacion.length > 0) {
    console.log(
      `\nAVISO (no es una falla de esta prueba, no se cuenta en el resultado final): persiste el error de JS ` +
      `PREEXISTENTE en pages/poblacion.html (ver entregas anteriores) — no se tocó para corregirlo porque la usuaria ` +
      `pidió explícitamente no corregirlo todavía:\n${erroresPoblacion[0]}`
    );
  } else {
    console.log("\n(No se reprodujo el aviso de Población en esta corrida puntual — el hallazgo ya reportado sigue sin corregirse de cualquier forma; no se tocó el archivo.)");
  }

  console.log("\n--- Ajuste de colores: cada banda corresponde con su leyenda ---");
  paginaActual = "canal_endemico.html (colores)";
  await page.goto(BASE + "/pages/canal_endemico.html", { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("tabla-semanas-body").querySelectorAll("tr").length > 0, { timeout: 15000 });
  await page.waitForTimeout(300);
  const coloresVsLeyenda = await page.evaluate(() => {
    const raiz = getComputedStyle(document.documentElement);
    const leyenda = {
      exito: raiz.getPropertyValue("--canal-exito").trim(),
      seguridad: raiz.getPropertyValue("--canal-seguridad").trim(),
      alerta: raiz.getPropertyValue("--canal-alerta").trim(),
      epidemica: raiz.getPropertyValue("--canal-epidemica").trim(),
    };
    const hexARgb = (hex) => {
      const m = hex.replace("#", "").match(/.{2}/g);
      return m ? m.map((h) => parseInt(h, 16)).join(",") : null;
    };
    const fill = {
      exito: raiz.getPropertyValue("--canal-exito-fill").trim(),
      seguridad: raiz.getPropertyValue("--canal-seguridad-fill").trim(),
      alerta: raiz.getPropertyValue("--canal-alerta-fill").trim(),
      epidemica: raiz.getPropertyValue("--canal-epidemica-fill").trim(),
    };
    return { leyendaRgb: Object.fromEntries(Object.entries(leyenda).map(([k, v]) => [k, hexARgb(v)])), fill };
  });
  // Éxito/seguridad/alerta: banda casi opaca, mismo rgb que la leyenda (sin
  // cambios respecto a la ronda anterior, confirmados por la usuaria).
  for (const zona of ["exito", "seguridad", "alerta"]) {
    const rgbLeyenda = coloresVsLeyenda.leyendaRgb[zona];
    const fillStr = coloresVsLeyenda.fill[zona];
    assert(fillStr.includes(rgbLeyenda), `La banda de "${zona}" debe usar el MISMO rgb que su leyenda (leyenda: ${rgbLeyenda} / banda: ${fillStr})`);
    const alpha = parseFloat(fillStr.split(",").pop());
    assert(alpha >= 0.8, `La banda de "${zona}" debe ser casi opaca, no transparente (alpha: ${alpha})`);
  }
  // Epidémica: el cuadrito de leyenda se mantiene intenso (mismo rgb,
  // ajuste pedido por la usuaria), pero el ÁREA de fondo debe ser un rosa
  // mucho más claro/suave (opacidad baja) para que la curva 2026 recupere
  // protagonismo — a propósito distinto de las otras 3 bandas.
  const rgbEpidemicaLeyenda = coloresVsLeyenda.leyendaRgb.epidemica;
  const fillEpidemica = coloresVsLeyenda.fill.epidemica;
  assert(fillEpidemica.includes(rgbEpidemicaLeyenda), `La banda epidémica debe conservar el MISMO rgb que su leyenda, sólo con menor opacidad (leyenda: ${rgbEpidemicaLeyenda} / banda: ${fillEpidemica})`);
  const alphaEpidemica = parseFloat(fillEpidemica.split(",").pop());
  assert(alphaEpidemica <= 0.3, `La banda epidémica debe ser un rosa claro/suave, con opacidad baja (trae: ${alphaEpidemica})`);
  assert(alphaEpidemica > 0, `La banda epidémica no debe desaparecer del todo (trae: ${alphaEpidemica})`);

  assert(coloresVsLeyenda.leyendaRgb.exito !== coloresVsLeyenda.leyendaRgb.seguridad, "Éxito y seguridad deben ser colores distintos (no deben leerse como el mismo verde)");

  console.log("\n--- Captura de pantalla (Canal Endémico integrado) ---");
  paginaActual = "canal_endemico.html (captura)";
  await page.goto(BASE + "/pages/canal_endemico.html", { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("tabla-semanas-body").querySelectorAll("tr").length > 0, { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ROOT, "canal_endemico_integrado_captura.png"), fullPage: true });
  console.log("Captura guardada: canal_endemico_integrado_captura.png");

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
