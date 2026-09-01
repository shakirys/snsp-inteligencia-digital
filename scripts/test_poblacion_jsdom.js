/**
 * Prueba de humo con jsdom para pages/poblacion.html.
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
        <div class="cie10-search-wrap" id="localidad-search-wrap">
          <input type="text" id="localidad-search">
        </div>
        <div class="filter-bar" id="filter-bar"></div>
        <button id="btn-export-pdf"></button>
        <button id="btn-export-xlsx"></button>
        <div class="indicator-grid" id="kpi-grid"></div>
        <div id="nota-cobertura-edad" style="display:none;"></div>
        <canvas id="chart-piramide"></canvas>
        <canvas id="chart-grupo-edad"></canvas>
        <div class="map-svg-box" id="mapa-municipios"></div>
        <div class="map-legend" id="mapa-leyenda"></div>
        <div id="panel-por-municipio"><canvas id="chart-municipio"></canvas></div>
        <table><tbody id="localidades-body"></tbody></table>
        <p id="localidades-count"></p>
        <span id="source-label"></span>
        <span id="version-tag-module"></span>
      </main>
    </div>
  </div>
</body></html>`, { runScripts: "outside-only", url: "http://localhost/pages/poblacion.html" });

const { window } = dom;

// ---- Stub mínimo de Chart.js ----
window.Chart = function (ctx, cfg) {
  this.destroy = function () {};
  this._cfg = cfg;
  this.ctx = ctx && ctx.getContext ? ctx.getContext("2d") : null;
  this.canvas = ctx;
};
window.Chart.register = function () {};

const scripts = [
  "config/config.js",
  "auth/auth.js",
  "services/dataService.js",
  "services/realDataService.js",
  "services/poblacionDataService.js",
  "data/real/indicadores_2025.js",
  "data/real/poblacion_2025.js",
  "components/sidebar.js",
  "components/topbar.js",
  "components/indicatorCard.js",
  "components/charts.js",
  "components/filterBar.js",
  "components/mapQueretaro.js",
  "modules/poblacionModuleView.js",
];

const context = dom.getInternalVMContext ? dom.getInternalVMContext() : null;
if (context) {
  for (const s of scripts) {
    const code = readFile(s);
    vm.runInContext(code, context, { filename: s });
  }
} else {
  const combined = scripts.map(readFile).join("\n;\n");
  dom.window.eval(combined);
}

// ---- Simular login ----
const loginResult = window.SNSP_AUTH.login("osvaldo.bobadilla@snsp.qro.gob.mx", "SNSP2025");
console.assert(loginResult && loginResult.ok !== false, "Login debería funcionar con el usuario demo");
console.log("Login:", JSON.stringify(loginResult).slice(0, 120));

// ---- Render inicial del módulo ----
window.SNSP_renderPoblacionModulePage({});

const doc = window.document;
function txt(id) { const el = doc.getElementById(id); return el ? el.textContent.trim() : "<<NO EXISTE>>"; }

console.log("\n--- Estado inicial (sin filtros) ---");
console.log("kpi-grid (primeros 500 chars):", txt("kpi-grid").slice(0, 500));
console.log("localidades-count:", txt("localidades-count"));
console.log("localidades-body filas:", doc.querySelectorAll("#localidades-body tr").length);
console.log("panel-por-municipio display:", doc.getElementById("panel-por-municipio").style.display);
console.log("source-label:", txt("source-label"));

// ---- Verificar el total estatal contra la suma directa de localidades ----
const d = window.SNSP_POBLACION_DATA;
let sumaTotal = 0, sumaM = 0, sumaH = 0;
d.localidades.forEach((r) => { sumaTotal += r[5]; sumaM += r[3]; sumaH += r[4]; });
console.log("\nSuma directa de localidades -> total:", sumaTotal, "mujeres:", sumaM, "hombres:", sumaH);
console.assert(sumaTotal === d.meta.total_poblacion, "El total del meta debe coincidir con la suma de localidades");
console.assert(txt("kpi-grid").includes(String(sumaTotal).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) || txt("kpi-grid").includes(String(sumaTotal)), "El KPI debería mostrar el total poblacional");

// ---- Verificar los 18 municipios en el catálogo y en la gráfica ----
const catalogos = window.SNSP_POBLACION_SERVICE.getCatalogos();
console.log("\nMunicipios en catálogo:", catalogos.municipios.length);
console.assert(catalogos.municipios.length === 18, "Debe haber 18 municipios");
const porMun = window.SNSP_POBLACION_SERVICE.getPorMunicipio();
console.assert(porMun.length === 18, "getPorMunicipio debe devolver 18 municipios");
const sumaPorMun = porMun.reduce((s, m) => s + m.total, 0);
console.assert(sumaPorMun === d.meta.total_poblacion, "La suma por municipio debe coincidir con el total estatal");

// ---- Aplicar filtro de municipio = Querétaro ----
console.log("\n--- Aplicando filtro municipio=Querétaro ---");
const selMunicipio = doc.getElementById("flt-municipio_poblacion");
console.assert(selMunicipio, "Debe existir el filtro de municipio");
selMunicipio.value = "Querétaro";
doc.getElementById("btn-aplicar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));

const pmQro = d.por_municipio.find((m) => m.municipio === "Querétaro");
console.log("Población Querétaro (municipio) según datos:", pmQro.total);
console.log("kpi-grid tras filtro (primeros 400 chars):", txt("kpi-grid").slice(0, 400));
console.assert(txt("kpi-grid").includes(pmQro.total.toLocaleString("es-MX")), "El KPI filtrado debería mostrar la población del municipio de Querétaro");
console.log("panel-por-municipio display tras filtrar a un municipio:", doc.getElementById("panel-por-municipio").style.display);
console.assert(doc.getElementById("panel-por-municipio").style.display === "none", "El panel de 18 municipios debe ocultarse cuando ya se filtró a uno solo");

// ---- Probar búsqueda de localidad ----
console.log("\n--- Búsqueda de localidad 'Querétaro' (capital) con municipio ya filtrado ---");
const search = doc.getElementById("localidad-search");
search.value = "Querétaro";
search.dispatchEvent(new window.Event("input", { bubbles: true }));
console.log("localidades-count:", txt("localidades-count"));
console.log("localidades-body filas:", doc.querySelectorAll("#localidades-body tr").length);

console.log("\n=== PRUEBA COMPLETADA SIN ERRORES DE EXCEPCIÓN ===");

// ---- Verificar pirámide: mujeres en negativo, hombres en positivo ----
console.log("\n--- Verificación de la pirámide poblacional (estatal, sin filtro) ---");
selMunicipio.value = "";
doc.getElementById("btn-limpiar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));
const piramide = window.SNSP_POBLACION_SERVICE.getPiramide({});
console.log("Bandas:", piramide.bandas);
console.log("Mujeres por banda:", piramide.mujeres);
console.log("Hombres por banda:", piramide.hombres);
console.assert(piramide.bandas.length === 4, "Deben ser 4 bandas de edad (0-9, 10-19, 20-59, 60+)");
const sumaPiramide = piramide.mujeres.reduce((a, b) => a + b, 0) + piramide.hombres.reduce((a, b) => a + b, 0);
console.log("Suma total de la pirámide (sólo localidades con desglose válido):", sumaPiramide);
console.log("meta.poblacion_con_desglose_edad:", d.meta.poblacion_con_desglose_edad);
console.assert(sumaPiramide === d.meta.poblacion_con_desglose_edad, "La suma de la pirámide debe coincidir con la población CON desglose de edad válido (no con el total estatal)");
console.assert(sumaPiramide < d.meta.total_poblacion, "La pirámide debe excluir a las localidades sin desglose de edad (el total sin filtrar no debe coincidir con el total estatal completo)");

// ---- Verificar que la nota de cobertura de edad se muestre con el porcentaje correcto ----
console.log("\n--- Verificación de la nota de cobertura de edad ---");
console.assert(d.meta.localidades_sin_desglose_edad > 0, "Debe haber localidades sin desglose de edad detectadas en la fuente");
console.log("Localidades sin desglose de edad:", d.meta.localidades_sin_desglose_edad, "/ Población afectada:", d.meta.poblacion_sin_desglose_edad);
const notaEl = doc.getElementById("nota-cobertura-edad");
console.assert(notaEl.style.display === "block", "La nota de cobertura de edad debe mostrarse cuando hay localidades sin desglose");
console.assert(notaEl.innerHTML.includes(String(d.meta.localidades_sin_desglose_edad)), "La nota debe mencionar el número de localidades sin desglose");
console.log("Nota (primeros 200 chars):", notaEl.textContent.slice(0, 200));

console.log("\n=== VERIFICACIÓN DE PIRÁMIDE Y COBERTURA DE EDAD COMPLETADA ===");
