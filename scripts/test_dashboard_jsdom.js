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
        <div class="indicator-grid" id="kpi-grid"></div>
        <canvas id="chart-tendencia"></canvas>
        <canvas id="chart-institucion"></canvas>
        <table><tbody id="bitacora-body"></tbody></table>
        <span id="version-tag"></span>
      </main>
    </div>
  </div>
</body></html>`, { runScripts: "outside-only", url: "http://localhost/dashboard.html" });

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
];

const context = dom.getInternalVMContext();
for (const s of scripts) vm.runInContext(readFile(s), context, { filename: s });

window.SNSP_AUTH.login("osvaldo.bobadilla@snsp.qro.gob.mx", "SNSP2025");

// Ejecutar el script inline de dashboard.html manualmente (extraído del archivo)
const html = readFile("dashboard.html");
const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
vm.runInContext(m[1], context, { filename: "dashboard.html inline" });

const doc = window.document;
function txt(id) { const el = doc.getElementById(id); return el ? el.textContent.trim() : "<<NO EXISTE>>"; }
console.log("kpi-grid (primeros 200):", txt("kpi-grid").slice(0, 200));
console.log("version-tag:", txt("version-tag"));
console.log("\n=== DASHBOARD: PRUEBA COMPLETADA SIN EXCEPCIONES ===");
