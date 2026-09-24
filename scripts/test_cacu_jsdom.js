const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
function readFile(p) { return fs.readFileSync(path.join(root, p), "utf-8"); }

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div class="app-shell">
    <aside class="sidebar" id="sidebar"></aside>
    <div class="app-main">
      <header class="topbar" id="topbar"></header>
      <main class="app-content">
        <div class="filter-bar" id="filter-bar"></div>
        <button id="btn-export-pdf"></button>
        <button id="btn-export-xlsx"></button>
        <div class="indicator-grid" id="kpi-grid"></div>
        <div id="empty-state-wrap" style="display:none;"></div>
        <div id="data-panels">
          <canvas id="chart-entidad"></canvas>
          <div class="map-svg-box" id="map-svg"></div>
          <div class="map-legend" id="map-legend"></div>
          <canvas id="chart-plan"></canvas>
          <p id="codigo-pendiente-note" style="display:none;"></p>
          <canvas id="chart-resultado"></canvas>
          <canvas id="chart-cit-conv"></canvas>
          <canvas id="chart-cit-bl"></canvas>
          <canvas id="chart-pcr"></canvas>
          <table><tbody id="ranking-body"></tbody></table>
          <span id="table-count"></span>
        </div>
        <span id="source-label"></span>
        <span id="version-tag-module"></span>
      </main>
    </div>
  </div>
</body></html>`, { runScripts: "outside-only", url: "http://localhost/pages/cacu.html" });

const { window } = dom;
window.Chart = function (ctx, cfg) { this.destroy = function () {}; this._cfg = cfg; };
window.Chart.register = function () {};

const scripts = [
  "config/config.js",
  "auth/auth.js",
  "services/dataService.js",
  "services/realDataService.js",
  "data/real/indicadores_2025.js",
  "components/sidebar.js",
  "components/topbar.js",
  "components/indicatorCard.js",
  "components/charts.js",
  "components/filterBar.js",
  "components/mapNacional.js",
  "modules/categoricalModuleView.js",
];

const context = dom.getInternalVMContext();
for (const s of scripts) {
  vm.runInContext(readFile(s), context, { filename: s });
}

window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025");

window.SNSP_renderCategoricalModulePage({
  moduleId: "cacu",
  title: "Cáncer cervicouterino (CACU)",
  sourceLabel: "Bases oficiales 2025 (nacional)",
});

const doc = window.document;
function txt(id) { const el = doc.getElementById(id); return el ? el.textContent.trim() : "<<NO EXISTE>>"; }

console.log("kpi-grid (primeros 200):", txt("kpi-grid").slice(0, 200));
console.log("ranking-body filas:", doc.querySelectorAll("#ranking-body tr").length);
console.log("table-count:", txt("table-count"));

// Verificar total contra la fuente real
const totalReal = window.SNSP_REAL_DATA.cacu_casos.total_casos;
console.assert(txt("kpi-grid").includes(String(totalReal)), `El KPI debería incluir ${totalReal}`);
console.log("Total real CACU:", totalReal, "-> aparece en KPI:", txt("kpi-grid").includes(String(totalReal)));

// Aplicar filtro de entidad y verificar recalculo
const selEntidad = doc.getElementById("flt-entidad");
console.assert(selEntidad, "Debe existir el filtro de entidad");
selEntidad.value = "Querétaro";
doc.getElementById("btn-aplicar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));
console.log("kpi-grid tras filtro Querétaro:", txt("kpi-grid").slice(0, 200));

console.log("\n=== CACU: PRUEBA COMPLETADA SIN EXCEPCIONES ===");
