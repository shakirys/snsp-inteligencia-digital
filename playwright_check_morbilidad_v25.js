/**
 * Validación en navegador real (Chromium vía Playwright) del tablero
 * UNIFICADO de Morbilidad (v2.5.0 — corrección de unificación).
 * Recorre exhaustivamente: 2025 / 2026 / ambos años, Casos / Población /
 * Tasa, y las 4 opciones de "Por", y verifica: sin accesos rápidos, sin
 * "grupo de edad no disponible", sin mención a 2024, Institución fuera de
 * "Por", filtros consistentes, y que el buscador CIE-10 sigue funcionando.
 */
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:8099";
const CDN_LOCAL = {
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js": "node_modules/chart.js/dist/chart.umd.js",
};

function assert(cond, msg) {
  if (!cond) throw new Error("FALLÓ: " + msg);
  console.log("OK: " + msg);
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const erroresJS = [];
  page.on("pageerror", (e) => erroresJS.push(String(e)));
  page.on("console", (msg) => { if (msg.type() === "error") erroresJS.push(msg.text()); });

  for (const [url, localPath] of Object.entries(CDN_LOCAL)) {
    await page.route(url, (route) => route.fulfill({ path: localPath }));
  }
  // Bloquear fuentes de Google (no relevante a la lógica, evita ruido de red del sandbox)
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());

  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.evaluate(() => window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025"));

  await page.goto(BASE + "/pages/morbilidad.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const tbody = document.getElementById("morb-tabla-body");
    return tbody && tbody.querySelectorAll("tr").length > 0;
  }, { timeout: 15000 });

  const bodyHTML = await page.content();
  assert(!bodyHTML.includes("2024"), "La página completa NO debe mencionar 2024 en ningún texto");
  assert(!/no incluye la variable sexo|no incluye la variable grupo de edad|dato pendiente de carga/i.test(bodyHTML) || !bodyHTML.includes("grupo de edad"), "No debe quedar la tarjeta de 'Grupo de edad — dato pendiente de carga'");
  assert(!(await page.$(".quick-code-chip")), "No debe existir ningún acceso rápido (chip) en la página");
  assert(!(await page.$("#accesos-rapidos")), "No debe existir el contenedor de accesos rápidos");

  const opcionesPor = await page.$$eval("#morb-select-dim option", (opts) => opts.map((o) => o.value));
  console.log("Opciones de Por:", opcionesPor);
  assert(JSON.stringify(opcionesPor) === JSON.stringify(["padecimiento", "municipio", "jurisdiccion", "grupo_edad"]), 'Por debe ser EXACTAMENTE Padecimiento/Municipio/Jurisdicción/Grupo de edad, sin Institución');

  const filtrosDisponibles = await page.$$eval("#filter-bar select", (sels) => sels.map((s) => s.id));
  console.log("Filtros disponibles:", filtrosDisponibles);
  assert(filtrosDisponibles.includes("flt-institucion_morbilidad"), "Institución debe seguir disponible como filtro");
  assert(filtrosDisponibles.includes("flt-municipio_morbilidad"), "Municipio debe seguir disponible como filtro");
  assert(filtrosDisponibles.includes("flt-jurisdiccion_morbilidad"), "Jurisdicción debe seguir disponible como filtro");

  // ---- Recorrido exhaustivo: años x analizar x por ----
  const combosAnio = [
    { nombre: "2025", valores: ["2025"] },
    { nombre: "2026", valores: ["2026"] },
    { nombre: "ambos (comparativo)", valores: ["2025", "2026"] },
  ];
  const medidas = ["casos", "poblacion", "tasa"];
  const dims = ["padecimiento", "municipio", "jurisdiccion", "grupo_edad"];

  async function fijarAnios(valores) {
    await page.click("#morb-anio-toggle"); // abre el menú (los checkboxes sólo son clicables visibles con el menú abierto)
    const chks = await page.$$("#morb-anio-menu input[type=checkbox]");
    for (const c of chks) {
      const checked = await c.isChecked();
      const valor = await c.getAttribute("value");
      const debeEstar = valores.includes(valor);
      if (checked !== debeEstar) await c.click();
    }
    await page.click("body", { position: { x: 5, y: 5 } }); // cierra el menú
    await page.waitForTimeout(150);
  }

  let totalCombosProbados = 0;
  for (const combo of combosAnio) {
    await fijarAnios(combo.valores);
    for (const medida of medidas) {
      const tasaDisabled = await page.$eval('#morb-select-medida option[value="tasa"]', (o) => o.disabled);
      if (medida !== "casos" && tasaDisabled) continue;
      await page.selectOption("#morb-select-medida", medida);
      for (const dim of dims) {
        await page.selectOption("#morb-select-dim", dim);
        await page.waitForTimeout(100);
        const filas = await page.$$eval("#morb-tabla-body tr", (trs) => trs.length);
        const headTxt = await page.$eval("#morb-tabla-head", (el) => el.textContent);
        const esComparativo = combo.valores.length === 2;
        if (esComparativo) {
          assert(headTxt.includes("2025") && headTxt.includes("2026"), `[${combo.nombre}/${medida}/${dim}] encabezado debe traer columnas separadas 2025 y 2026`);
        }
        if (filas === 0) throw new Error(`FALLÓ: [${combo.nombre}/${medida}/${dim}] la tabla quedó vacía`);
        totalCombosProbados++;
      }
    }
  }
  console.log(`OK: ${totalCombosProbados} combinaciones (año × analizar × por) probadas sin errores ni tablas vacías`);

  // ---- Verificación numérica cruzada: Tasa = Casos/Población×100,000 ----
  await fijarAnios(["2025"]);
  await page.selectOption("#morb-select-medida", "casos");
  await page.selectOption("#morb-select-dim", "municipio");
  await page.waitForTimeout(150);
  const filasCasos = await page.$$eval("#morb-tabla-body tr", (trs) =>
    trs.map((tr) => { const tds = tr.querySelectorAll("td"); return { categoria: tds[1].textContent.trim(), valor: tds[2].textContent.trim() }; })
  );
  await page.selectOption("#morb-select-medida", "poblacion");
  await page.waitForTimeout(150);
  const filasPoblacion = await page.$$eval("#morb-tabla-body tr", (trs) =>
    trs.map((tr) => { const tds = tr.querySelectorAll("td"); return { categoria: tds[1].textContent.trim(), valor: tds[2].textContent.trim() }; })
  );
  await page.selectOption("#morb-select-medida", "tasa");
  await page.waitForTimeout(150);
  const filasTasa = await page.$$eval("#morb-tabla-body tr", (trs) =>
    trs.map((tr) => { const tds = tr.querySelectorAll("td"); return { categoria: tds[1].textContent.trim(), valor: tds[2].textContent.trim() }; })
  );
  const mapCasos = Object.fromEntries(filasCasos.map((r) => [r.categoria, Number(r.valor.replace(/,/g, ""))]));
  const mapPoblacion = Object.fromEntries(filasPoblacion.map((r) => [r.categoria, Number(r.valor.replace(/,/g, ""))]));
  let verificados = 0;
  for (const r of filasTasa) {
    const casos = mapCasos[r.categoria];
    const poblacion = mapPoblacion[r.categoria];
    if (!poblacion) continue;
    const tasaEsperada = Math.round((casos / poblacion) * 100000 * 10) / 10;
    const tasaMostrada = Number(r.valor.replace(/,/g, ""));
    if (Math.abs(tasaEsperada - tasaMostrada) > 0.05) {
      throw new Error(`FALLÓ: Tasa de ${r.categoria}: esperado ${tasaEsperada}, mostrado ${tasaMostrada} (fórmula Casos/Población×100,000)`);
    }
    verificados++;
  }
  assert(verificados >= 10, `Fórmula de Tasa (Casos/Población×100,000) verificada en ${verificados} municipios, coincide exactamente`);

  // ---- Regresión: buscador CIE-10 sigue funcionando dentro del tablero unificado ----
  await page.selectOption("#morb-select-medida", "casos");
  await page.selectOption("#morb-select-dim", "padecimiento");
  await fijarAnios([]);
  await page.fill("#cie10-search", "C50");
  await page.waitForSelector(".cie10-suggestion[data-epiclave]", { timeout: 10000 });
  await page.click(".cie10-suggestion[data-epiclave]");
  await page.waitForFunction(() => document.getElementById("seleccion-actual").textContent.includes("Consultando"), { timeout: 10000 });
  const filasTrasC50 = await page.$$eval("#morb-tabla-body tr", (trs) => trs.length);
  console.log("Filas tras buscar y seleccionar C50 (Por=Padecimiento):", filasTrasC50);
  assert(filasTrasC50 === 1, "Con un padecimiento específico seleccionado, Por=Padecimiento debe reducirse a 1 categoría");
  await page.click("#btn-limpiar-seleccion");

  console.log("\nErrores de JS durante toda la prueba:", erroresJS.length);
  erroresJS.forEach((e) => console.log("  -", e));
  assert(erroresJS.length === 0, "Sin errores de JS en consola durante toda la prueba");

  await browser.close();
  console.log("\n=== VALIDACIÓN TABLERO UNIFICADO DE MORBILIDAD (v2.5.0) COMPLETADA SIN ERRORES ===");
})().catch((e) => { console.error(e); process.exit(1); });
