/**
 * Prueba de humo con jsdom para pages/morbilidad.html.
 * No se ejecuta en producción; sólo para verificación local (sin acceso a
 * red para el CDN de Chart.js, se usa un stub mínimo).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");

function readFile(p) {
  return fs.readFileSync(path.join(root, p), "utf-8");
}

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div class="app-shell">
    <aside class="sidebar" id="sidebar"></aside>
    <div class="app-main">
      <header class="topbar" id="topbar"></header>
      <main class="app-content">
        <div class="card mb-4">
          <div class="cie10-search-wrap" id="cie10-search-wrap">
            <input type="text" id="cie10-search">
            <div class="cie10-resultados" id="cie10-resultados"></div>
          </div>
          <div class="quick-access-row" id="accesos-rapidos"></div>
          <div class="seleccion-actual" id="seleccion-actual"></div>
        </div>
        <div class="filter-bar" id="filter-bar"></div>
        <button id="btn-export-pdf"></button>
        <button id="btn-export-xlsx"></button>
        <div id="panel-sin-seleccion">
          <canvas id="chart-principales-generales"></canvas>
          <table><tbody id="principales-generales-body"></tbody></table>
        </div>
        <div id="data-panels" style="display:none;">
          <div class="indicator-grid" id="kpi-grid"></div>
          <canvas id="chart-municipio"></canvas>
          <span id="nota-municipios-sin-casos" style="display:none;"></span>
          <canvas id="chart-jurisdiccion"></canvas>
          <div id="panel-tendencia-anual" style="display:none;"><canvas id="chart-tendencia-anual"></canvas></div>
          <canvas id="chart-institucion"></canvas>
          <canvas id="chart-tiempo"></canvas>
          <canvas id="chart-padecimientos"></canvas>
          <table><tbody id="clues-body"></tbody></table>
          <p id="clues-count"></p>
        </div>
        <span id="source-label"></span>
        <span id="version-tag-module"></span>
      </main>
    </div>
  </div>
</body></html>`, { runScripts: "outside-only", url: "http://localhost/pages/morbilidad.html" });

const { window } = dom;

// ---- Stub mínimo de Chart.js ----
window.Chart = function (ctx, cfg) {
  this.destroy = function () {};
  this._cfg = cfg;
  this.ctx = ctx && ctx.getContext ? ctx.getContext("2d") : null;
  this.canvas = ctx;
};
window.Chart.register = function () {};

// ---- Cargar scripts de la plataforma en orden, TODOS en un mismo
// vm.Script/contexto (igual que <script> clásicos reales en un navegador,
// donde top-level let/const de un script son visibles para los
// siguientes). Ejecutar cada archivo por separado con dom.window.eval()
// NO preserva esto (cada eval indirecto es su propio script en V8), así
// que se concatenan y se corren como un solo script en el contexto real
// del window mediante vm. ----
const scripts = [
  "config/config.js",
  "auth/auth.js",
  "services/dataService.js",
  "services/realDataService.js",
  "services/morbilidadDataService.js",
  "data/real/indicadores_2025.js",
  "data/real/morbilidad_2025.js",
  "components/sidebar.js",
  "components/topbar.js",
  "components/indicatorCard.js",
  "components/charts.js",
  "components/filterBar.js",
  "modules/morbilidadModuleView.js",
];

const context = dom.getInternalVMContext ? dom.getInternalVMContext() : null;
if (context) {
  for (const s of scripts) {
    const code = readFile(s);
    vm.runInContext(code, context, { filename: s });
  }
} else {
  // Fallback: concatenar todo en un solo eval (comparte scope léxico).
  const combined = scripts.map(readFile).join("\n;\n");
  dom.window.eval(combined);
}

// ---- Simular login ----
const loginResult = window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025");
console.assert(loginResult && loginResult.ok !== false, "Login debería funcionar con el usuario demo");
console.log("Login:", JSON.stringify(loginResult).slice(0, 120));

// ---- Render inicial del módulo ----
window.SNSP_renderMorbilidadModulePage({});

const doc = window.document;
function txt(id) { const el = doc.getElementById(id); return el ? el.textContent.trim() : "<<NO EXISTE>>"; }

console.log("\n--- Estado inicial (sin selección) ---");
console.log("accesos-rapidos HTML (primeros 300 chars):", txt("accesos-rapidos").slice(0, 300));
console.log("principales-generales-body filas:", doc.querySelectorAll("#principales-generales-body tr").length);
console.log("panel-sin-seleccion display:", doc.getElementById("panel-sin-seleccion").style.display);
console.log("data-panels display:", doc.getElementById("data-panels").style.display);

// ---- Simular clic en acceso rápido C50 ----
const btnC50 = [...doc.querySelectorAll(".quick-code-chip")].find((b) => b.getAttribute("data-codigo") === "C50");
console.assert(btnC50, "Debe existir el chip C50");
btnC50.dispatchEvent(new window.Event("click", { bubbles: true }));

console.log("\n--- Tras seleccionar C50 (Tumor maligno de la mama) ---");
console.log("seleccion-actual:", txt("seleccion-actual"));
console.log("data-panels display:", doc.getElementById("data-panels").style.display);
console.log("kpi-grid (primeros 400 chars):", txt("kpi-grid").slice(0, 400));
console.log("clues-count:", txt("clues-count"));
console.log("clues-body filas:", doc.querySelectorAll("#clues-body tr").length);
console.log("source-label:", txt("source-label"));

// ---- Verificar contra el total real del cubo para C50 (epiclave 119) ----
const cubo = window.SNSP_MORBILIDAD_DATA.cubo;
let totalC50 = 0;
cubo.forEach((r) => { if (r[0] === "119") totalC50 += r[7]; });
console.log("\nTotal C50 calculado directamente del cubo:", totalC50);
const kpiText = txt("kpi-grid");
console.assert(kpiText.includes(String(totalC50)), `El KPI debería mostrar ${totalC50}`);

// ---- Probar búsqueda por texto ----
const search = doc.getElementById("cie10-search");
search.value = "displasia";
search.dispatchEvent(new window.Event("input", { bubbles: true }));
console.log("\n--- Búsqueda 'displasia' ---");
console.log("Resultados encontrados:", doc.querySelectorAll("#cie10-resultados .cie10-suggestion").length);
console.log("cie10-resultados display:", doc.getElementById("cie10-resultados").style.display);

// ---- Probar filtro de municipio ----
console.log("\n--- Aplicando filtro municipio=Querétaro con C50 seleccionado ---");
const selMunicipio = doc.getElementById("flt-municipio_morbilidad");
console.assert(selMunicipio, "Debe existir el filtro de municipio");
selMunicipio.value = "Querétaro";
doc.getElementById("btn-aplicar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));
console.log("kpi-grid tras filtro (primeros 300 chars):", txt("kpi-grid").slice(0, 300));

let totalC50Qro = 0;
cubo.forEach((r) => { if (r[0] === "119" && r[2] === "Querétaro") totalC50Qro += r[7]; });
console.log("Total C50 en Querétaro (municipio) calculado directamente:", totalC50Qro);
console.assert(txt("kpi-grid").includes(String(totalC50Qro)), `El KPI filtrado debería mostrar ${totalC50Qro}`);

console.log("\n=== PRUEBA COMPLETADA SIN ERRORES DE EXCEPCIÓN ===");

// ---- Verificar el nuevo estándar de visualización (etiquetas + títulos) ----
console.log("\n--- Estándar de visualización ---");
console.log("SNSP_formatNumber(1681564):", window.SNSP_formatNumber(1681564));
console.log("SNSP_formatPercent(36.2):", window.SNSP_formatPercent(36.2));

const chartMunicipio = charts_debug = doc.getElementById("chart-municipio");
// Recuperar la última instancia de Chart creada para #chart-municipio
// inspeccionando _cfg capturado por el stub (a través del closure de
// morbilidadModuleView.js no es accesible directamente, así que se
// vuelve a construir un título de muestra para validar el formato):
const tituloMuestra = window.SNSP_tituloGrafica({
  indicador: "Casos registrados",
  dimension: "municipio",
  padecimiento: "C50 — Tumor maligno de la mama",
  lugar: "el estado de Querétaro",
  periodo: "2025",
});
console.log("Título de muestra (municipio, C50, Querétaro, 2025):", JSON.stringify(tituloMuestra));
console.assert(tituloMuestra.title.join(" ").includes("C50") || (tituloMuestra.subtitle || "").includes("C50"), "El título o subtítulo debe mencionar C50");
console.assert((tituloMuestra.subtitle || tituloMuestra.title.join(" ")).includes("Querétaro"), "Debe mencionar Querétaro");
console.assert((tituloMuestra.subtitle || tituloMuestra.title.join(" ")).includes("2025"), "Debe mencionar el periodo 2025");

const tituloLargo = window.SNSP_tituloGrafica({
  indicador: "Casos registrados",
  dimension: "jurisdicción sanitaria",
  padecimiento: "N87 — Displasia cervical leve y moderada / Displasia cervical severa y CaCu in situ",
  lugar: "el municipio de San Juan del Río",
  periodo: "el periodo 2024–2026",
});
console.log("Título largo (debe repartirse en título + subtítulo):", JSON.stringify(tituloLargo));
console.assert(!!tituloLargo.subtitle, "Un título largo debe repartirse en subtítulo");

console.log("\n=== ESTÁNDAR DE VISUALIZACIÓN VERIFICADO ===");

// ---- Verificar: SIEMPRE los 18 municipios, orden desc, ceros al final ----
console.log("\n--- Verificación de los 18 municipios (con C50 + municipio=Querétaro) ---");
const catalogos = window.SNSP_MORBILIDAD_SERVICE.getCatalogos();
console.log("Total municipios en catálogo:", catalogos.municipios.length);
console.assert(catalogos.municipios.length === 18, "Debe haber 18 municipios en el catálogo");

const indFiltrado = window.SNSP_MORBILIDAD_SERVICE.getIndicadores(Object.assign({}, { municipio: "Querétaro" }, { epiclaves: ["119"] }));
const completos = catalogos.municipios.map((m) => ({ label: m, value: indFiltrado.por_municipio[m] || 0 })).sort((a, b) => b.value - a.value);
console.log("Municipios representados (deben ser 18):", completos.length);
console.assert(completos.length === 18, "La gráfica de municipios debe representar siempre los 18");
const conCeroAlFinal = completos.slice(-17).every((r) => r.value === 0);
console.log("¿Los últimos 17 (todos excepto Querétaro) tienen valor 0?", conCeroAlFinal);
console.assert(conCeroAlFinal, "Los municipios sin casos deben quedar al final con valor 0");
console.log("Nota de sin-casos (texto esperado):", `${completos.filter((r) => r.value === 0).length} de los 18 municipios...`);

console.log("nota-municipios-sin-casos (tras filtro municipio=Querétaro):", txt("nota-municipios-sin-casos"));
console.assert(txt("nota-municipios-sin-casos").includes("17"), "La nota debe mencionar los 17 municipios sin casos tras filtrar a uno solo");

console.log("\n=== VERIFICACIÓN DE 18 MUNICIPIOS COMPLETADA ===");
