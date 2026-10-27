/**
 * Validación en navegador real (Chromium vía Playwright) de ACT16 en
 * Morbilidad — las 5 correcciones puntuales sobre ACT15 que jsdom no
 * puede verificar de verdad (layout/tamaño real, canvas real, scroll):
 *   1) "Seleccionar todos/todas" en Mes/Semana + colapso a "Todos"/"Todas".
 *   2) Vista previa ampliada (~90% de pantalla) + zoom/ajustar a ancho.
 *   3) Botones "Volver a editar"/"Generar PDF" SIEMPRE visibles (sin
 *      necesidad de hacer scroll) + navegación Anterior|Página X de Y|Siguiente.
 *   4) Gráficas del PDF más grandes; si gráfica+tabla no caben legibles
 *      (caso Municipio, 18 categorías), se separan en 2 páginas.
 *   5) Municipios con 0 en ambos años no cuentan como "categorías
 *      encontradas" (nota dinámica), pero se siguen mostrando los 18.
 * + VALIDACIÓN OBLIGATORIA: 1,270,390 casos sin filtros; 10,252 casos
 *   para T63.2, X22 — Intoxicación por picadura de alacrán.
 */
const { chromium } = require("playwright");

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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

  function casosTotalesKpi() {
    return page.evaluate(() => {
      const m = document.getElementById("kpi-grid").textContent.replace(/\s+/g, " ").match(/Casos totales\s*([\d,]+)/);
      return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
    });
  }

  // =========================================================================
  // VALIDACIÓN OBLIGATORIA (re-confirmar en ACT16, sin filtros temporales)
  // =========================================================================
  console.log("\n--- VALIDACIÓN OBLIGATORIA (ACT16, navegador real) ---");
  const totalInicial = await casosTotalesKpi();
  assert(totalInicial === 1270390, `Sin filtros de Mes/Semana, Casos totales debe ser EXACTAMENTE 1,270,390 (trae: ${totalInicial})`);

  await page.fill("#cie10-search", "alacrán");
  await page.waitForSelector(".cie10-suggestion[data-epiclave='94']", { timeout: 5000 });
  await page.click(".cie10-suggestion[data-epiclave='94']");
  await page.waitForTimeout(150);
  const totalAlacran = await casosTotalesKpi();
  assert(totalAlacran === 10252, `T63.2, X22 — Intoxicación por picadura de alacrán debe dar EXACTAMENTE 10,252 casos (trae: ${totalAlacran})`);
  await page.click("#btn-limpiar-seleccion");
  await page.waitForTimeout(150);
  assert((await casosTotalesKpi()) === 1270390, "Al limpiar la selección, Casos totales debe volver a 1,270,390");

  // =========================================================================
  // ACT16 punto 1 — "Seleccionar todos/todas" en Mes/Semana
  // =========================================================================
  console.log("\n--- ACT16 punto 1: 'Seleccionar todos/todas' (Mes/Semana) ---");
  await page.click("#morb-mes-toggle");
  await page.waitForSelector("#morb-mes-menu:not([hidden])");
  const btnSeleccionarTodosMesTxt = await page.$eval('#morb-mes-menu [data-accion="seleccionar-todos"]', (el) => el.textContent);
  assert(/todos/i.test(btnSeleccionarTodosMesTxt), `El botón del menú de Mes debe decir 'Seleccionar todos' (trae: "${btnSeleccionarTodosMesTxt}")`);
  await page.click('#morb-mes-menu [data-accion="seleccionar-todos"]');
  await page.waitForTimeout(150);
  const mesesMarcadosTodos = await page.$$eval("#morb-mes-menu input[type=checkbox]:checked", (els) => els.length);
  assert(mesesMarcadosTodos === 12, `'Seleccionar todos' debe marcar los 12 meses (trae ${mesesMarcadosTodos})`);
  const chipsMesTexto = await page.$eval("#morb-mes-chips", (el) => el.textContent.trim());
  assert(chipsMesTexto === "Todos", `Con los 12 meses marcados, el área de chips debe colapsar a 'Todos' (trae: "${chipsMesTexto}")`);
  const casosConTodosLosMeses = await casosTotalesKpi();
  assert(casosConTodosLosMeses === totalInicial, `Marcar explícitamente TODOS los meses debe dar el mismo total que no filtrar (sin filtro: ${totalInicial}, con los 12: ${casosConTodosLosMeses})`);

  // Limpiar (clic en el chip colapsado no aplica — se limpia desde el menú;
  // el menú de Mes ya sigue abierto tras "Seleccionar todos", que detiene
  // la propagación del click y no lo cierra).
  let pendientesMes;
  do {
    pendientesMes = await page.$$("#morb-mes-menu input[type=checkbox]:checked");
    if (pendientesMes.length) { await pendientesMes[0].click(); await page.waitForTimeout(60); }
  } while (pendientesMes.length);
  await page.waitForTimeout(150);
  assert((await casosTotalesKpi()) === totalInicial, "Al desmarcar todos los meses, Casos totales debe volver al valor original");

  // El menú de Mes quedó abierto (ver arriba); cerrarlo con un click fuera
  // antes de abrir el de Semana, para no dejar 2 menús abiertos a la vez.
  await page.click("body", { position: { x: 5, y: 5 } });
  await page.waitForSelector("#morb-mes-menu", { state: "hidden" });
  await page.click("#morb-semana-toggle");
  await page.waitForSelector("#morb-semana-menu:not([hidden])");
  const btnSeleccionarTodasSemanaTxt = await page.$eval('#morb-semana-menu [data-accion="seleccionar-todos"]', (el) => el.textContent);
  assert(/todas/i.test(btnSeleccionarTodasSemanaTxt), `El botón del menú de Semana debe decir 'Seleccionar todas' (trae: "${btnSeleccionarTodasSemanaTxt}")`);
  await page.click('#morb-semana-menu [data-accion="seleccionar-todos"]');
  await page.waitForTimeout(150);
  const chipsSemanaTexto = await page.$eval("#morb-semana-chips", (el) => el.textContent.trim());
  assert(chipsSemanaTexto === "Todas", `Con todas las semanas marcadas, el área de chips debe colapsar a 'Todas' (trae: "${chipsSemanaTexto}")`);
  let pendientesSemana;
  do {
    pendientesSemana = await page.$$("#morb-semana-menu input[type=checkbox]:checked");
    if (pendientesSemana.length) { await pendientesSemana[0].click(); await page.waitForTimeout(60); }
  } while (pendientesSemana.length);
  await page.waitForTimeout(150);
  assert((await casosTotalesKpi()) === totalInicial, "Al desmarcar todas las semanas, Casos totales debe volver al valor original");
  // El menú de Semana queda abierto (mismo motivo que el de Mes) — cerrarlo
  // antes de continuar.
  await page.click("body", { position: { x: 5, y: 5 } });
  await page.waitForSelector("#morb-semana-menu", { state: "hidden" });

  // =========================================================================
  // ACT16 puntos 2, 3 y 4 — Vista previa ampliada, zoom, botones fijos,
  // paginación y separación gráfica/tabla (Municipio, 18 categorías)
  // =========================================================================
  console.log("\n--- ACT16 puntos 2, 3 y 4: Vista previa ampliada, zoom, botones fijos, paginación y separación gráfica/tabla ---");
  // Comparativo 2025 vs 2026 + todas las secciones: el escenario más
  // propenso a necesitar la separación gráfica/tabla (Municipio con
  // Diferencia/Variación % agregadas a la tabla).
  await page.click("#morb-anio-toggle");
  await page.waitForSelector("#morb-anio-menu:not([hidden])");
  const chksAnio = await page.$$("#morb-anio-menu input[type=checkbox]");
  for (const c of chksAnio) { if (!(await c.isChecked())) await c.check(); }
  await page.waitForTimeout(150);

  await page.click("#btn-morb-abrir-pdf");
  await page.waitForSelector("#modal-morb-pdf.is-open");
  await page.click("#btn-morb-pdf-generar");
  await page.waitForSelector("#morb-pdf-vista-previa:not([hidden])");
  await page.waitForTimeout(400); // deja terminar de capturar las imágenes de las gráficas

  // --- Punto 2: el modal debe ocupar ~90% de la pantalla ---
  const cajaModal = await page.$eval("#modal-morb-pdf .modal-box", (el) => {
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
  const viewport = page.viewportSize();
  const pctAncho = cajaModal.width / viewport.width;
  const pctAlto = cajaModal.height / viewport.height;
  console.log(`Modal de Vista previa: ${cajaModal.width}x${cajaModal.height} (viewport ${viewport.width}x${viewport.height}) = ${(pctAncho * 100).toFixed(0)}% x ${(pctAlto * 100).toFixed(0)}%`);
  assert(pctAncho >= 0.85 && pctAncho <= 0.95, `El modal de Vista previa debe ocupar ~90% del ancho de pantalla (trae ${(pctAncho * 100).toFixed(0)}%)`);
  assert(pctAlto >= 0.85 && pctAlto <= 0.95, `El modal de Vista previa debe ocupar ~90% del alto de pantalla (trae ${(pctAlto * 100).toFixed(0)}%)`);

  // --- Punto 2: zoom +/- y "Ajustar a ancho" cambian el tamaño real en pantalla ---
  const anchoHojaInicial = await page.$eval(".morb-vista-previa-hoja", (el) => el.getBoundingClientRect().width);
  await page.click("#btn-morb-vp-zoom-mas");
  await page.waitForTimeout(100);
  const anchoHojaZoomMas = await page.$eval(".morb-vista-previa-hoja", (el) => el.getBoundingClientRect().width);
  assert(anchoHojaZoomMas > anchoHojaInicial, `'+' debe agrandar visualmente la hoja (antes: ${anchoHojaInicial.toFixed(0)}px, después: ${anchoHojaZoomMas.toFixed(0)}px)`);
  assert((await page.$eval("#morb-vp-zoom-nivel", (el) => el.textContent)) === "110%", "El indicador de zoom debe mostrar 110% tras un clic en '+'");
  await page.click("#btn-morb-vp-zoom-ajustar");
  await page.waitForTimeout(100);
  const anchoHojaAjustada = await page.$eval(".morb-vista-previa-hoja", (el) => el.getBoundingClientRect().width);
  const anchoLienzo = await page.$eval("#morb-pdf-vista-previa-resumen", (el) => el.clientWidth);
  console.log(`Ajustar a ancho: hoja=${anchoHojaAjustada.toFixed(0)}px, lienzo disponible=${anchoLienzo}px`);
  assert(anchoHojaAjustada <= anchoLienzo + 4, `'Ajustar a ancho' no debe dejar la hoja más ancha que el lienzo disponible (hoja: ${anchoHojaAjustada.toFixed(0)}px, lienzo: ${anchoLienzo}px)`);
  assert(anchoHojaAjustada > anchoLienzo * 0.85, `'Ajustar a ancho' debe aprovechar el ancho disponible, no dejarlo chico (hoja: ${anchoHojaAjustada.toFixed(0)}px, ${(anchoHojaAjustada / anchoLienzo * 100).toFixed(0)}% del lienzo)`);

  // --- Punto 3: botones fijos SIEMPRE visibles (sin necesidad de scroll) ---
  const totalPaginasReal = await page.$$eval(".morb-vista-previa-pagina", (els) => els.length);
  console.log(`Páginas generadas en la Vista previa (comparativo, todas las secciones): ${totalPaginasReal}`);
  assert(totalPaginasReal > 1, `Debe haber varias páginas con todas las secciones en comparativo (trae ${totalPaginasReal})`);
  const botonesVisiblesSinScroll = await page.evaluate(() => {
    const btn = document.getElementById("btn-morb-pdf-generar-final");
    const r = btn.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0 && r.height > 0;
  });
  assert(botonesVisiblesSinScroll, "'Generar PDF' debe estar visible en pantalla SIN necesidad de hacer scroll, incluso con varias páginas en la Vista previa");
  const btnVolverVisibleSinScroll = await page.evaluate(() => {
    const btn = document.getElementById("btn-morb-pdf-volver-editar");
    const r = btn.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0 && r.height > 0;
  });
  assert(btnVolverVisibleSinScroll, "'Volver a editar' debe estar visible en pantalla SIN necesidad de hacer scroll");

  // --- Punto 3: navegación Anterior | Página X de Y | Siguiente ---
  assert((await page.$eval("#morb-vp-pagina-indicador", (el) => el.textContent)) === `Página 1 de ${totalPaginasReal}`, "El indicador de página debe arrancar en 'Página 1 de N'");
  assert(await page.$eval("#btn-morb-vp-pagina-anterior", (el) => el.disabled), "'Anterior' debe estar deshabilitado en la página 1");
  await page.click("#btn-morb-vp-pagina-siguiente");
  await page.waitForTimeout(500); // scroll suave
  assert((await page.$eval("#morb-vp-pagina-indicador", (el) => el.textContent)) === `Página 2 de ${totalPaginasReal}`, "'Siguiente' debe avanzar a 'Página 2 de N'");
  const pagina2VisibleTrasNav = await page.evaluate(() => {
    const pag = document.querySelector('.morb-vista-previa-pagina[data-pagina="2"]');
    const r = pag.getBoundingClientRect();
    // Visible dentro del lienzo con scroll (no necesariamente ventana completa)
    return r.top < window.innerHeight && r.bottom > 0;
  });
  assert(pagina2VisibleTrasNav, "'Siguiente' debe llevar la página 2 a la vista dentro del lienzo con scroll");
  await page.click("#btn-morb-vp-pagina-anterior");
  await page.waitForTimeout(500);
  assert((await page.$eval("#morb-vp-pagina-indicador", (el) => el.textContent)) === `Página 1 de ${totalPaginasReal}`, "'Anterior' debe regresar a 'Página 1 de N'");

  // --- Punto 4: Municipio (18 categorías, con Diferencia/Variación %) debe
  // traer una gráfica visiblemente grande; si no cupo junto con la tabla,
  // debe haber quedado en su propia página seguida de una página de
  // continuación sólo con la tabla ("... (continuación)"). ---
  const infoMunicipioPdf = await page.evaluate(() => {
    const paginas = Array.from(document.querySelectorAll(".morb-vista-previa-pagina"));
    let paginaImagen = null, paginaContinuacion = null;
    paginas.forEach((pag, i) => {
      const titulos = Array.from(pag.querySelectorAll("div")).map((d) => d.textContent);
      if (titulos.some((t) => /^Casos por municipio$/.test((t || "").trim()))) paginaImagen = i + 1;
      if (titulos.some((t) => /Casos por municipio \(continuación\)/.test(t || ""))) paginaContinuacion = i + 1;
    });
    const img = document.querySelector(".morb-vista-previa-pagina img");
    return {
      paginaImagen, paginaContinuacion,
      totalPaginas: paginas.length,
      hayImagen: !!img,
      anchoImagen: img ? img.getBoundingClientRect().width : 0,
      altoImagen: img ? img.getBoundingClientRect().height : 0,
    };
  });
  console.log("Municipio en la Vista previa:", infoMunicipioPdf);
  assert(infoMunicipioPdf.hayImagen, "La Vista previa debe incluir al menos 1 gráfica real capturada (canvas -> <img>)");
  assert(infoMunicipioPdf.altoImagen > 150, `Las imágenes de gráfica deben verse con un tamaño aprovechado (alto real: ${infoMunicipioPdf.altoImagen.toFixed(0)}px, se esperaba > 150px con el nuevo tope de hasta 90%/62% de la página)`);
  if (infoMunicipioPdf.paginaContinuacion) {
    assert(infoMunicipioPdf.paginaContinuacion === infoMunicipioPdf.paginaImagen + 1, `Cuando Municipio se separa, la tabla de continuación debe ir en la página SIGUIENTE a la de la gráfica grande (gráfica: ${infoMunicipioPdf.paginaImagen}, continuación: ${infoMunicipioPdf.paginaContinuacion})`);
    console.log("Municipio SÍ se separó en 2 páginas (gráfica grande + tabla de continuación) — comportamiento esperado cuando no caben juntas legibles.");
  } else {
    console.log("Municipio cupo junto con su tabla en una sola página con estos datos (no se necesitó separar) — la gráfica igual debe verse grande (validado arriba).");
  }

  // "Volver a editar" quita la ampliación del modal (paso 1 no la necesita).
  await page.click("#btn-morb-pdf-volver-editar");
  await page.waitForTimeout(150);
  const modalAmpliadoTrasVolver = await page.$eval("#modal-morb-pdf .modal-box", (el) => el.classList.contains("is-vista-previa-activa"));
  assert(!modalAmpliadoTrasVolver, "'Volver a editar' debe quitar la ampliación del modal (is-vista-previa-activa)");
  await page.click("#btn-morb-pdf-cancelar");
  await page.waitForTimeout(150);

  // Deja el tablero neutro (sin año marcado).
  await page.click("#morb-anio-toggle");
  await page.waitForSelector("#morb-anio-menu:not([hidden])");
  let pendientesAnio;
  do {
    pendientesAnio = await page.$$("#morb-anio-menu input[type=checkbox]:checked");
    if (pendientesAnio.length) { await pendientesAnio[0].click(); await page.waitForTimeout(60); }
  } while (pendientesAnio.length);

  // =========================================================================
  // ACT16 punto 5 — nota "N de 18 municipios con datos" (Institución=IMSS_ORD
  // deja exactamente 13 de 18 con casos en la base real)
  // =========================================================================
  console.log("\n--- ACT16 punto 5: nota '13 de 18 municipios con datos' (Institución=IMSS_ORD) ---");
  const valorImss = await page.$$eval("#flt-institucion_morbilidad option", (opts) => {
    const o = opts.find((op) => /IMSS_ORD/.test(op.value));
    return o ? o.value : null;
  });
  assert(!!valorImss, "Debe existir la opción de Institución '02 IMSS_ORD'");
  await page.selectOption("#flt-institucion_morbilidad", valorImss);
  await page.click("#btn-aplicar-filtros");
  await page.waitForTimeout(200);
  const subtMunicipioReal = await page.$eval("#morb-subt-municipio", (el) => el.textContent.trim());
  console.log("Subtítulo de Municipio (navegador real):", subtMunicipioReal);
  assert(/13 de 18 municipios con casos/.test(subtMunicipioReal), `Debe mostrar '13 de 18 municipios con casos...' (trae: "${subtMunicipioReal}")`);
  // El panel de Municipio debe seguir renderizándose (canvas real) con el filtro activo.
  const alturaCanvasMunicipio = await page.$eval("#morb-chart-municipio", (el) => el.getBoundingClientRect().height);
  assert(alturaCanvasMunicipio > 0, "El panel de Municipio debe seguir renderizándose con Institución filtrada");
  await page.click("#btn-limpiar-filtros");
  await page.waitForTimeout(200);
  const subtMunicipioSinFiltro = await page.$eval("#morb-subt-municipio", (el) => el.textContent.trim());
  assert(/Los 18 municipios, incluidos los que no registran casos/.test(subtMunicipioSinFiltro), `Sin filtros, el subtítulo debe volver al texto por defecto (trae: "${subtMunicipioSinFiltro}")`);

  const erroresRelevantes = erroresJS.filter((e) => !/Failed to load resource/i.test(e));
  assert(erroresRelevantes.length === 0, "No debe haber errores de JS relevantes en consola durante todo el flujo de ACT16 (trae: " + JSON.stringify(erroresRelevantes.slice(0, 3)) + ")");

  console.log("\n=== ACT16 (Playwright, navegador real) VERIFICADO SIN ERRORES ===");
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
