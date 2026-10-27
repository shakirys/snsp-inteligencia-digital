/**
 * Prueba de humo con jsdom para pages/morbilidad.html — versión 2022-2026
 * (Bloque 1: Casos/Territorio/Instituciones + Bloque 2: Padecimientos,
 * sobre tres bases independientes). No se ejecuta en producción; sólo
 * para verificación local (sin acceso a red para el CDN de Chart.js, se
 * usa un stub mínimo).
 *
 * Cubre, sobre todo, las reglas NO NEGOCIABLES de esta actualización:
 *   - El total general y el desglose por año deben coincidir EXACTAMENTE
 *     con lo validado por la usuaria (3,551,200 / 794,108 / 725,978 /
 *     729,037 / 779,592 / 522,485), tanto en el Bloque 1 como en el
 *     Bloque 2.
 *   - El Bloque 1 y el Bloque 2 nunca comparten un filtro: seleccionar un
 *     padecimiento (Bloque 2) NO debe mover ni un solo KPI del Bloque 1.
 *   - Tasa sólo está disponible en el Bloque 1 para Municipio/Jurisdicción/
 *     Grupo de edad — se deshabilita para Institución/Unidad médica/Sexo.
 *   - El grupo de edad sin población ("De edad desconocida") muestra
 *     "No aplica" en Tasa, nunca 0.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
function readFile(p) { return fs.readFileSync(path.join(root, p), "utf-8"); }

function multiselectHtml(prefix, label) {
  return `
    <div class="carga-anio-multiselect" id="${prefix}-multiselect">
      <div class="carga-anio-chips" id="${prefix}-chips"></div>
      <button type="button" class="carga-anio-toggle" id="${prefix}-toggle">+ ${label}</button>
      <div class="carga-anio-menu" id="${prefix}-menu" hidden></div>
    </div>`;
}

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div class="app-shell">
    <aside class="sidebar" id="sidebar"></aside>
    <div class="app-main">
      <header class="topbar" id="topbar"></header>
      <main class="app-content">

        <div class="field">
          ${multiselectHtml("morb-anio", "Año")}
        </div>

        <button type="button" class="morb-tab-btn is-active" id="morb-tab-bloque1">Bloque 1</button>
        <button type="button" class="morb-tab-btn" id="morb-tab-bloque2">Bloque 2</button>
        <button type="button" id="btn-morb-abrir-pdf">Generar reporte PDF</button>

        <div id="morb-bloque1-panel">
          <select id="morb-h-select-medida">
            <option value="casos">Casos</option>
            <option value="poblacion">Población</option>
            <option value="tasa">Tasa (por 100,000 habitantes)</option>
          </select>
          <select id="morb-h-select-dim">
            <option value="municipio">Municipio</option>
            <option value="jurisdiccion">Jurisdicción sanitaria</option>
            <option value="institucion">Institución</option>
            <option value="unidad_medica">Unidad médica</option>
            <option value="grupo_edad">Grupo de edad</option>
            <option value="sexo">Sexo</option>
          </select>
          ${multiselectHtml("morb-h-mes", "Mes")}
          <div class="filter-bar" id="filter-bar-h"></div>

          <div class="indicator-grid" id="kpi-grid-h"></div>
          <span id="morb-h-subt-principal"></span>
          <select id="morb-h-principal-topn">
            <option value="10">Top 10</option>
            <option value="15">Top 15</option>
            <option value="20" selected>Top 20</option>
            <option value="todos">Todos</option>
          </select>
          <div id="morb-h-chart-wrap"><canvas id="morb-h-chart"></canvas></div>
          <table><thead id="morb-h-tabla-head"></thead><tbody id="morb-h-tabla-body"></tbody></table>
          <p id="morb-h-tabla-count"></p>

          <span id="morb-h-subt-municipio"></span><div id="morb-h-wrap-municipio"><canvas id="morb-h-chart-municipio"></canvas></div>
          <span id="morb-h-subt-jurisdiccion"></span><div id="morb-h-wrap-jurisdiccion"><canvas id="morb-h-chart-jurisdiccion"></canvas></div>
          <div id="morb-h-wrap-institucion"><canvas id="morb-h-chart-institucion"></canvas></div>
          <span id="morb-h-subt-unidadmedica"></span><div id="morb-h-wrap-unidadmedica"><canvas id="morb-h-chart-unidadmedica"></canvas></div>
          <div id="morb-h-wrap-grupoedad"><canvas id="morb-h-chart-grupoedad"></canvas></div>
          <span id="morb-h-subt-sexo"></span><div id="morb-h-wrap-sexo"><canvas id="morb-h-chart-sexo"></canvas></div>
          <span id="morb-h-subt-tendencia"></span><div id="morb-h-wrap-tendencia"><canvas id="morb-h-chart-tendencia"></canvas></div>
          <span id="morb-h-subt-mesanio"></span><div id="morb-h-wrap-mesanio"><canvas id="morb-h-chart-mesanio"></canvas></div>
        </div>

        <div id="morb-bloque2-panel" hidden>
          <div class="cie10-search-wrap" id="cie10-search-wrap">
            <input type="text" id="cie10-search">
            <div class="cie10-resultados" id="cie10-resultados"></div>
          </div>
          <div class="cie10-search-wrap" id="cie10-search-wrap-cie10">
            <input type="text" id="cie10-search-cie10">
            <div class="cie10-resultados" id="cie10-resultados-cie10"></div>
          </div>
          <div class="cie10-search-wrap" id="cie10-search-wrap-epiclave">
            <input type="text" id="cie10-search-epiclave">
            <div class="cie10-resultados" id="cie10-resultados-epiclave"></div>
          </div>
          <div class="seleccion-actual" id="seleccion-actual"></div>

          <select id="morb-p-select-dim">
            <option value="padecimiento">Padecimiento</option>
            <option value="grupo_edad">Grupo de edad</option>
            <option value="sexo">Sexo</option>
          </select>
          ${multiselectHtml("morb-p-mes", "Mes")}
          ${multiselectHtml("morb-p-semana", "Semana")}

          <div class="indicator-grid" id="kpi-grid-p"></div>
          <span id="morb-p-subt-principal"></span>
          <select id="morb-p-principal-topn">
            <option value="10" selected>Top 10</option>
            <option value="15">Top 15</option>
            <option value="20">Top 20</option>
            <option value="todos">Todos</option>
          </select>
          <div id="morb-p-chart-wrap"><canvas id="morb-p-chart"></canvas></div>
          <table><thead id="morb-p-tabla-head"></thead><tbody id="morb-p-tabla-body"></tbody></table>
          <p id="morb-p-tabla-count"></p>

          <span id="morb-p-subt-padecimientos"></span>
          <select id="morb-p-padecimientos-topn">
            <option value="10" selected>Top 10</option>
            <option value="15">Top 15</option>
            <option value="20">Top 20</option>
            <option value="todos">Todos</option>
          </select>
          <div id="morb-p-wrap-padecimientos"><canvas id="morb-p-chart-padecimientos"></canvas></div>
          <span id="morb-p-subt-grupoedad"></span><div id="morb-p-wrap-grupoedad"><canvas id="morb-p-chart-grupoedad"></canvas></div>
          <span id="morb-p-subt-sexo"></span><div id="morb-p-wrap-sexo"><canvas id="morb-p-chart-sexo"></canvas></div>
          <span id="morb-p-subt-tendencia"></span><div id="morb-p-wrap-tendencia"><canvas id="morb-p-chart-tendencia"></canvas></div>
          <span id="morb-p-subt-mesanio"></span><div id="morb-p-wrap-mesanio"><canvas id="morb-p-chart-mesanio"></canvas></div>
        </div>

        <span id="source-label"></span>
        <span id="version-tag-module"></span>
      </main>
    </div>
  </div>

  <div class="modal-overlay" id="modal-morb-pdf">
    <div class="modal-box modal-box--wide">
      <form id="form-morb-pdf">
        <div id="morb-pdf-secciones">
          <label><input type="checkbox" name="morb-pdf-seccion" value="kpi_h" checked></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="principal_h" checked></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="municipio" checked></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="jurisdiccion" checked></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="institucion" checked></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="unidadmedica"></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="grupoedad" checked></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="sexo" checked></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="tendencia" checked></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="mesanio" checked></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="kpi_p" checked></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="principal_p" checked></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="padecimientos" checked></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="grupoedad_p"></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="sexo_p"></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="tendencia_p" checked></label>
          <label><input type="checkbox" name="morb-pdf-seccion" value="mesanio_p" checked></label>
        </div>
        <textarea id="morb-pdf-observaciones" rows="3"></textarea>
        <div class="modal-box__error" id="morb-pdf-error"></div>
        <div class="modal-box__actions">
          <button type="button" id="btn-morb-pdf-cancelar">Cancelar</button>
          <button type="button" id="btn-morb-pdf-todo">Seleccionar todo</button>
          <button type="button" id="btn-morb-pdf-limpiar">Limpiar</button>
          <button type="submit" id="btn-morb-pdf-generar">Vista previa</button>
        </div>
      </form>
      <div id="morb-pdf-vista-previa" hidden>
        <div class="morb-vp-toolbar">
          <div class="morb-vp-toolbar__grupo">
            <button type="button" id="btn-morb-vp-zoom-menos">－</button>
            <span id="morb-vp-zoom-nivel">100%</span>
            <button type="button" id="btn-morb-vp-zoom-mas">＋</button>
            <button type="button" id="btn-morb-vp-zoom-ajustar">Ajustar a ancho</button>
          </div>
          <div class="morb-vp-toolbar__grupo">
            <button type="button" id="btn-morb-vp-pagina-anterior">Anterior</button>
            <span id="morb-vp-pagina-indicador">Página 1 de 1</span>
            <button type="button" id="btn-morb-vp-pagina-siguiente">Siguiente</button>
          </div>
        </div>
        <div id="morb-pdf-vista-previa-resumen"></div>
        <div class="modal-box__error" id="morb-pdf-vista-previa-error"></div>
        <div class="modal-box__actions">
          <button type="button" id="btn-morb-pdf-volver-editar">Volver a editar</button>
          <button type="button" id="btn-morb-pdf-generar-final">Generar PDF</button>
        </div>
      </div>
    </div>
  </div>
</body></html>`, { runScripts: "outside-only", url: "http://localhost/pages/morbilidad.html" });

const { window } = dom;

// ---- Stub mínimo de Chart.js ----
const chartInstancesById = {};
window.Chart = function (ctx, cfg) {
  this.destroy = function () {};
  this._cfg = cfg;
  this.data = cfg && cfg.data ? cfg.data : { labels: [], datasets: [] };
  this.ctx = ctx && ctx.getContext ? ctx.getContext("2d") : null;
  this.canvas = ctx;
  this.options = cfg && cfg.options ? cfg.options : {};
  this.update = function () {};
  this.resize = function () {};
  this.draw = function () {};
  if (ctx && ctx.id) chartInstancesById[ctx.id] = this;
};
window.Chart.register = function () {};

// ---- Stub mínimo de jsPDF + jsPDF-AutoTable ----
window.__pdfTextLog = [];
window.__pdfAutoTableLogs = [];
window.__pdfAddImageCalls = 0;
window.jspdf = {
  jsPDF: function (opts) {
    window.__pdfTextLog = [];
    window.__pdfAutoTableLogs = [];
    window.__pdfAddImageCalls = 0;
    window.__pdfLastOptions = opts;
    window.__pdfPageCount = 1;
    window.__pdfCurrentPage = 1;
    window.__pdfSavedName = null;
    window.__pdfPageOrientations = [null, (opts && opts.orientation) || "portrait"];
    this.setFont = function () {};
    this.setFontSize = function () {};
    this.setFillColor = function () {};
    this.setTextColor = function () {};
    this.rect = function () { window.__pdfRectCalls = (window.__pdfRectCalls || 0) + 1; };
    this.text = function (str) { window.__pdfTextLog.push(str); };
    this.splitTextToSize = function (str) { return [str]; };
    this.addImage = function () { window.__pdfAddImageCalls += 1; };
    this.addPage = function (format, orientation) {
      window.__pdfPageCount += 1;
      window.__pdfCurrentPage = window.__pdfPageCount;
      window.__pdfPageOrientations[window.__pdfCurrentPage] = orientation || window.__pdfPageOrientations[window.__pdfCurrentPage - 1] || "portrait";
    };
    this.setPage = function (p) { window.__pdfCurrentPage = p; };
    this.save = function (name) { window.__pdfSavedName = name; };
    this.autoTable = function (opts2) {
      window.__pdfAutoTableLogs.push(opts2);
      const filas = (opts2.body || []).length;
      this.lastAutoTable = { finalY: (opts2.startY || 0) + 20 + filas * 16 };
    };
    this.internal = {
      getNumberOfPages: function () { return window.__pdfPageCount; },
      pageSize: {
        getWidth: function () { return window.__pdfPageOrientations[window.__pdfCurrentPage] === "landscape" ? 792 : 612; },
        getHeight: function () { return window.__pdfPageOrientations[window.__pdfCurrentPage] === "landscape" ? 612 : 792; },
      },
    };
  },
};

const scripts = [
  "config/config.js",
  "auth/auth.js",
  "services/dataService.js",
  "services/realDataService.js",
  "services/cargaDataService.js",
  "data/real/morbilidad_historico_2022_2026.js",
  "data/real/morbilidad_padecimientos_2022_2026.js",
  "data/real/morbilidad_poblacion_2022_2026.js",
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
  const combined = scripts.map(readFile).join("\n;\n");
  dom.window.eval(combined);
}

let fallas = 0;
function assert(cond, msg) {
  if (!cond) { fallas++; console.log("FALLÓ: " + msg); }
  else console.log("OK: " + msg);
}

const doc = window.document;
function txt(id) { const el = doc.getElementById(id); return el ? el.textContent.trim() : "<<NO EXISTE>>"; }

// Lee el valor numérico de una tarjeta KPI por su label (texto exacto del
// div .indicator-card__label), dentro del grid indicado.
function kpiValor(gridId, label) {
  const tarjetas = Array.from(doc.querySelectorAll(`#${gridId} .indicator-card`));
  const card = tarjetas.find((c) => (c.querySelector(".indicator-card__label") || {}).textContent === label);
  if (!card) return null;
  const valorTxt = (card.querySelector(".indicator-card__value") || {}).textContent || "";
  return valorTxt.trim();
}
function kpiValorNumero(gridId, label) {
  const v = kpiValor(gridId, label);
  if (v === null || v === "No aplica") return null;
  return parseInt(v.replace(/[^\d-]/g, ""), 10);
}

function marcarSoloAnio(anio) {
  const menu = doc.getElementById("morb-anio-menu");
  Array.from(menu.querySelectorAll("input[type=checkbox]")).forEach((chk) => {
    chk.checked = anio ? chk.value === String(anio) : false;
    chk.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}

// ---- Login + render inicial ----
const loginResult = window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025");
console.log("Login:", JSON.stringify(loginResult).slice(0, 120));
window.SNSP_renderMorbilidadModulePage({});

console.log("\n--- Fuente y versión ---");
console.log("source-label:", txt("source-label"));
assert(txt("source-label").includes("2022") && txt("source-label").includes("2026"), "source-label debe mencionar 2022 y 2026");
assert(txt("source-label").includes("3,551,200"), "source-label debe mencionar el total validado 3,551,200 casos");
assert(txt("source-label").includes("BASE_CASOS_HISTORICOS") && txt("source-label").includes("BASE_PADECIMIENTOS") && txt("source-label").includes("EXTRACCION_POBLACION"),
  "source-label debe nombrar las 3 bases nuevas");

// =====================================================================
// VALIDACIÓN OBLIGATORIA — total general y por año, Bloque 1 y Bloque 2
// =====================================================================
console.log("\n--- Validación obligatoria: totales por año (Bloque 1) ---");
const TOTALES_POR_ANIO = { "2022": 794108, "2023": 725978, "2024": 729037, "2025": 779592, "2026": 522485 };
Object.keys(TOTALES_POR_ANIO).forEach((anio) => {
  marcarSoloAnio(anio);
  const v = kpiValorNumero("kpi-grid-h", "Casos totales");
  assert(v === TOTALES_POR_ANIO[anio], `Bloque 1 — año ${anio}: Casos totales debe ser ${TOTALES_POR_ANIO[anio]} (trae: ${v})`);
});
console.log("\n--- Validación obligatoria: totales por año (Bloque 2) ---");
Object.keys(TOTALES_POR_ANIO).forEach((anio) => {
  marcarSoloAnio(anio);
  const v = kpiValorNumero("kpi-grid-p", "Casos totales");
  assert(v === TOTALES_POR_ANIO[anio], `Bloque 2 — año ${anio}: Casos totales debe ser ${TOTALES_POR_ANIO[anio]} (trae: ${v})`);
});

console.log("\n--- Validación obligatoria: total general (todos los años) ---");
marcarSoloAnio(null); // ningún año marcado = alcance completo (comparativo)
const totalGeneralH = kpiValorNumero("kpi-grid-h", "Casos totales");
const totalGeneralP = kpiValorNumero("kpi-grid-p", "Casos totales");
assert(totalGeneralH === 3551200, `Bloque 1 — total general debe ser EXACTAMENTE 3,551,200 (trae: ${totalGeneralH})`);
assert(totalGeneralP === 3551200, `Bloque 2 — total general debe ser EXACTAMENTE 3,551,200 (trae: ${totalGeneralP})`);
assert(txt("morb-h-tabla-head").includes("2022") && txt("morb-h-tabla-head").includes("2026"),
  "Sin ningún año marcado, la tabla del Bloque 1 debe venir en modo comparativo (una columna por cada uno de los 5 años)");

// =====================================================================
// Ajuste solicitado por la usuaria: "Seleccionar todos" en el filtro Año,
// sincronizado con la selección individual (no cambia metodología ni
// cálculos — sólo agrega esta opción al filtro ya existente).
// =====================================================================
console.log("\n--- Ajuste: 'Seleccionar todos' en el filtro Año ---");
const menuAnioEl = doc.getElementById("morb-anio-menu");
const chkTodosEl = doc.getElementById("morb-anio-todos-check");
const chksAnioEl = () => Array.from(menuAnioEl.querySelectorAll("input[type=checkbox][value]"));

marcarSoloAnio(null);
assert(chkTodosEl.checked === false, "Con ningún año marcado, 'Seleccionar todos' debe estar desmarcado");

chkTodosEl.checked = true;
chkTodosEl.dispatchEvent(new window.Event("change", { bubbles: true }));
assert(chksAnioEl().every((c) => c.checked), "Al marcar 'Seleccionar todos' deben quedar marcados todos los años disponibles de una vez");
assert(kpiValorNumero("kpi-grid-h", "Casos totales") === 3551200, "Con 'Seleccionar todos' marcado, el Bloque 1 debe dar el total general 3,551,200");

const primerChkAnio = chksAnioEl()[0];
primerChkAnio.checked = false;
primerChkAnio.dispatchEvent(new window.Event("change", { bubbles: true }));
assert(chkTodosEl.checked === false, "Al desmarcar un año individual, 'Seleccionar todos' debe desactivarse");

primerChkAnio.checked = true;
primerChkAnio.dispatchEvent(new window.Event("change", { bubbles: true }));
assert(chkTodosEl.checked === true, "Si vuelven a quedar todos los años marcados individualmente, 'Seleccionar todos' debe reflejarse marcado de nuevo");

marcarSoloAnio("2022");
assert(chkTodosEl.checked === false, "Con un solo año marcado individualmente, 'Seleccionar todos' debe quedar desmarcado");
assert(kpiValorNumero("kpi-grid-h", "Casos totales") === TOTALES_POR_ANIO["2022"], "La selección individual de un solo año sigue funcionando igual que antes de agregar 'Seleccionar todos'");

marcarSoloAnio(null); // deja el filtro limpio para el resto de las pruebas existentes

// =====================================================================
// Separación Bloque 1 / Bloque 2: el buscador de padecimiento NUNCA debe
// mover el Bloque 1.
// =====================================================================
console.log("\n--- Separación Bloque 1 / Bloque 2 ---");
const inputBuscar = doc.getElementById("cie10-search");
inputBuscar.value = "tifoidea";
inputBuscar.dispatchEvent(new window.Event("input", { bubbles: true }));
const sugerencia = doc.querySelector(".cie10-suggestion[data-epiclave]");
assert(!!sugerencia, "Debe existir al menos una sugerencia al buscar 'tifoidea'");
const totalHAntes = kpiValorNumero("kpi-grid-h", "Casos totales");
sugerencia.dispatchEvent(new window.Event("click", { bubbles: true }));
const totalHDespues = kpiValorNumero("kpi-grid-h", "Casos totales");
const totalPDespues = kpiValorNumero("kpi-grid-p", "Casos totales");
assert(totalHAntes === totalHDespues, "Seleccionar un padecimiento (Bloque 2) NO debe cambiar el KPI 'Casos totales' del Bloque 1");
assert(totalPDespues < totalHDespues, "El KPI del Bloque 2 filtrado por un padecimiento debe ser menor que el total general");
assert(txt("seleccion-actual").length > 0, "Debe mostrarse la selección vigente de padecimiento");
doc.getElementById("btn-limpiar-seleccion").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(kpiValorNumero("kpi-grid-p", "Casos totales") === 3551200, "Al limpiar la selección, el Bloque 2 vuelve al total general 3,551,200");

// =====================================================================
// Tasa: sólo disponible para Municipio/Jurisdicción/Grupo de edad
// =====================================================================
console.log("\n--- Restricción de Tasa por dimensión (Bloque 1) ---");
const selMedidaH = doc.getElementById("morb-h-select-medida");
const selDimH = doc.getElementById("morb-h-select-dim");
const tasaOpt = Array.from(selMedidaH.options).find((o) => o.value === "tasa");

function fijarDim(valor) {
  selDimH.value = valor;
  selDimH.dispatchEvent(new window.Event("change", { bubbles: true }));
}

fijarDim("municipio");
assert(!tasaOpt.disabled, "Tasa debe estar HABILITADA para Por=Municipio");
fijarDim("jurisdiccion");
assert(!tasaOpt.disabled, "Tasa debe estar HABILITADA para Por=Jurisdicción");
fijarDim("grupo_edad");
assert(!tasaOpt.disabled, "Tasa debe estar HABILITADA para Por=Grupo de edad");
fijarDim("institucion");
assert(tasaOpt.disabled, "Tasa debe estar DESHABILITADA para Por=Institución");
fijarDim("unidad_medica");
assert(tasaOpt.disabled, "Tasa debe estar DESHABILITADA para Por=Unidad médica");
fijarDim("sexo");
assert(tasaOpt.disabled, "Tasa debe estar DESHABILITADA para Por=Sexo");
assert(selMedidaH.value === "casos", "Al pasar a una dimensión sin Tasa válida, Analizar debe volver a Casos automáticamente");

console.log("\n--- 'De edad desconocida' debe mostrar Tasa = No aplica ---");
// 'De edad desconocida' sólo tiene casos registrados en 2026 (7 casos, ver
// build_morbilidad_historico.py) — se usa ese año a propósito para esta
// prueba, no porque la categoría exista todos los años.
marcarSoloAnio("2026");
fijarDim("grupo_edad");
selMedidaH.value = "tasa";
selMedidaH.dispatchEvent(new window.Event("change", { bubbles: true }));
const filasGrupoEdad = Array.from(doc.querySelectorAll("#morb-h-tabla-body tr"));
const filaDesconocida = filasGrupoEdad.find((tr) => tr.textContent.includes("desconocida"));
assert(!!filaDesconocida, "Debe existir una fila para 'De edad desconocida' en Por=Grupo de edad");
if (filaDesconocida) {
  const celdas = filaDesconocida.querySelectorAll("td");
  const valorTasa = celdas[celdas.length - 1].textContent.trim();
  assert(valorTasa === "No aplica", `'De edad desconocida' debe mostrar Tasa = 'No aplica' (trae: '${valorTasa}')`);
}
selMedidaH.value = "casos";
selMedidaH.dispatchEvent(new window.Event("change", { bubbles: true }));
marcarSoloAnio(null);

// =====================================================================
// Municipio: debe seguir mostrando los 18 municipios (0-rellenados)
// =====================================================================
console.log("\n--- Panorama Bloque 1: Casos por municipio (18 municipios) ---");
const catMunicipios = (window.SNSP_MORBILIDAD_HISTORICO_DATA.catalogos.municipios || []);
assert(catMunicipios.length === 18, `Catálogo de municipios debe tener 18 valores (trae: ${catMunicipios.length})`);
const labelsMunicipio = (chartInstancesById["morb-h-chart-municipio"] || {}).data ? chartInstancesById["morb-h-chart-municipio"].data.labels : [];
assert(labelsMunicipio.length === 18, `El panel de municipio debe dibujar 18 categorías (trae: ${labelsMunicipio.length})`);

// =====================================================================
// Unidad médica: dimensión nueva, 383 valores
// =====================================================================
console.log("\n--- Unidad médica (dimensión nueva) ---");
const catUnidades = (window.SNSP_MORBILIDAD_HISTORICO_DATA.catalogos.unidadesMedicas || []);
assert(catUnidades.length === 383, `Catálogo de unidades médicas debe tener 383 valores (trae: ${catUnidades.length})`);
assert(txt("morb-h-subt-unidadmedica").length > 0, "Debe haber un subtítulo dinámico para el panel de unidad médica");

// =====================================================================
// Tabs: alternar Bloque 1 / Bloque 2
// =====================================================================
console.log("\n--- Tabs Bloque 1 / Bloque 2 ---");
doc.getElementById("morb-tab-bloque2").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(doc.getElementById("morb-bloque1-panel").hidden === true, "Al activar Bloque 2, el panel del Bloque 1 debe quedar oculto");
assert(doc.getElementById("morb-bloque2-panel").hidden === false, "Al activar Bloque 2, su panel debe quedar visible");
doc.getElementById("morb-tab-bloque1").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(doc.getElementById("morb-bloque1-panel").hidden === false, "Al activar Bloque 1 de nuevo, su panel debe quedar visible");

// =====================================================================
// CIE-10: 166 de 167 padecimientos con código identificado
// =====================================================================
console.log("\n--- CIE-10 ---");
const catalogoPad = window.SNSP_MORBILIDAD_PADECIMIENTOS_DATA.catalogo_padecimientos || [];
assert(catalogoPad.length === 167, `Catálogo de padecimientos debe tener 167 valores (trae: ${catalogoPad.length})`);
const conCie10 = catalogoPad.filter((p) => (p.cie10_codigos || []).length > 0).length;
assert(conCie10 === 166, `166 de 167 padecimientos deben tener CIE-10 identificado (trae: ${conCie10})`);

// =====================================================================
// PDF: debe generarse sin excepciones, con secciones de ambos bloques
// =====================================================================
console.log("\n--- Generación de PDF (ambos bloques) ---");
doc.getElementById("btn-morb-abrir-pdf").dispatchEvent(new window.Event("click", { bubbles: true }));
doc.getElementById("form-morb-pdf").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
assert(doc.getElementById("morb-pdf-vista-previa").hidden === false, "Tras enviar el formulario, debe mostrarse la Vista previa");
assert(txt("morb-pdf-vista-previa-resumen").length > 0, "La Vista previa debe tener contenido");
let pdfLanzoExcepcion = false;
try {
  doc.getElementById("btn-morb-pdf-generar-final").dispatchEvent(new window.Event("click", { bubbles: true }));
} catch (e) {
  pdfLanzoExcepcion = true;
  console.log("Excepción al generar PDF:", e.stack);
}
assert(!pdfLanzoExcepcion, "La generación del PDF no debe lanzar ninguna excepción");
assert(window.__pdfSavedName && window.__pdfSavedName.includes("morbilidad"), "El PDF debe guardarse con un nombre que incluya 'morbilidad'");
assert(window.__pdfTextLog.some((t) => String(t).includes("2022-2026")), "El encabezado del PDF debe mencionar 2022-2026");

console.log(`\n=== RESULTADO: ${fallas === 0 ? "TODAS LAS PRUEBAS PASARON" : fallas + " PRUEBA(S) FALLARON"} ===`);
process.exitCode = fallas === 0 ? 0 : 1;
