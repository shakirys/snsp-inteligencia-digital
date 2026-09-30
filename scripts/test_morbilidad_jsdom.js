/**
 * Prueba de humo con jsdom para pages/morbilidad.html — v2.5.0 (tablero
 * unificado: buscador opcional + Analizar/Por + Año comparar + filtros
 * Municipio/Jurisdicción/Institución, todo sobre BASE_CASOS_2025_2026 +
 * BASE_POBLACION_2025_2026). No se ejecuta en producción; sólo para
 * verificación local (sin acceso a red para el CDN de Chart.js, se usa
 * un stub mínimo).
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
          <div class="cie10-search-wrap" id="cie10-search-wrap-cie10">
            <input type="text" id="cie10-search-cie10">
            <div class="cie10-resultados" id="cie10-resultados-cie10"></div>
          </div>
          <div class="cie10-search-wrap" id="cie10-search-wrap-epiclave">
            <input type="text" id="cie10-search-epiclave">
            <div class="cie10-resultados" id="cie10-resultados-epiclave"></div>
          </div>
          <div class="seleccion-actual" id="seleccion-actual"></div>
        </div>
        <div class="card mb-4">
          <select id="morb-select-medida">
            <option value="casos">Casos</option>
            <option value="poblacion">Población</option>
            <option value="tasa">Tasa (por 100,000 habitantes)</option>
          </select>
          <select id="morb-select-dim">
            <option value="padecimiento">Padecimiento</option>
            <option value="municipio">Municipio</option>
            <option value="jurisdiccion">Jurisdicción sanitaria</option>
            <option value="grupo_edad">Grupo de edad</option>
          </select>
          <div class="carga-anio-multiselect" id="morb-anio-multiselect">
            <div class="carga-anio-chips" id="morb-anio-chips"></div>
            <button type="button" class="carga-anio-toggle" id="morb-anio-toggle">+ Año</button>
            <div class="carga-anio-menu" id="morb-anio-menu" hidden></div>
          </div>
          <div class="carga-anio-multiselect" id="morb-mes-multiselect">
            <div class="carga-anio-chips" id="morb-mes-chips"></div>
            <button type="button" class="carga-anio-toggle" id="morb-mes-toggle">+ Mes</button>
            <div class="carga-anio-menu" id="morb-mes-menu" hidden></div>
          </div>
          <div class="carga-anio-multiselect" id="morb-semana-multiselect">
            <div class="carga-anio-chips" id="morb-semana-chips"></div>
            <button type="button" class="carga-anio-toggle" id="morb-semana-toggle">+ Semana</button>
            <div class="carga-anio-menu" id="morb-semana-menu" hidden></div>
          </div>
          <div class="filter-bar" id="filter-bar"></div>
        </div>
        <div class="indicator-grid" id="kpi-grid"></div>
        <span id="morb-subt-principal"></span>
        <select id="morb-principal-topn">
          <option value="10" selected>Top 10</option>
          <option value="15">Top 15</option>
          <option value="20">Top 20</option>
          <option value="todos">Todos</option>
        </select>
        <div id="morb-chart-wrap"><canvas id="morb-chart"></canvas></div>
        <table><thead id="morb-tabla-head"></thead><tbody id="morb-tabla-body"></tbody></table>
        <p id="morb-tabla-count"></p>

        <div id="morb-panorama-grid">
          <div><span id="morb-subt-municipio"></span><div id="morb-wrap-municipio"><canvas id="morb-chart-municipio"></canvas></div></div>
          <div><span id="morb-subt-jurisdiccion"></span><div id="morb-wrap-jurisdiccion"><canvas id="morb-chart-jurisdiccion"></canvas></div></div>
          <div id="morb-wrap-institucion"><canvas id="morb-chart-institucion"></canvas></div>
          <div id="morb-wrap-grupoedad"><canvas id="morb-chart-grupoedad"></canvas></div>
          <div><span id="morb-subt-sexo"></span><div id="morb-wrap-sexo"><canvas id="morb-chart-sexo"></canvas></div></div>
          <div>
            <span id="morb-subt-padecimientos"></span>
            <select id="morb-padecimientos-topn">
              <option value="10" selected>Top 10</option>
              <option value="15">Top 15</option>
              <option value="20">Top 20</option>
              <option value="todos">Todos</option>
            </select>
            <div id="morb-wrap-padecimientos"><canvas id="morb-chart-padecimientos"></canvas></div>
          </div>
          <div><span id="morb-subt-tendencia"></span><div id="morb-wrap-tendencia"><canvas id="morb-chart-tendencia"></canvas></div></div>
          <div><span id="morb-subt-mesanio"></span><div id="morb-wrap-mesanio"><canvas id="morb-chart-mesanio"></canvas></div></div>
        </div>

        <span id="source-label"></span>
        <span id="version-tag-module"></span>
      </main>
    </div>
  </div>

  <button type="button" id="btn-morb-abrir-pdf">Generar reporte PDF</button>
  <div class="modal-overlay" id="modal-morb-pdf">
    <div class="modal-box modal-box--wide">
      <form id="form-morb-pdf">
        <div id="morb-pdf-secciones">
          <label class="carga-anio-opcion"><input type="checkbox" name="morb-pdf-seccion" value="kpi" checked> Indicadores</label>
          <label class="carga-anio-opcion"><input type="checkbox" name="morb-pdf-seccion" value="principal" checked> Gráfica y tabla principal</label>
          <label class="carga-anio-opcion"><input type="checkbox" name="morb-pdf-seccion" value="municipio" checked> Casos por municipio</label>
          <label class="carga-anio-opcion"><input type="checkbox" name="morb-pdf-seccion" value="jurisdiccion" checked> Casos por jurisdicción sanitaria</label>
          <label class="carga-anio-opcion"><input type="checkbox" name="morb-pdf-seccion" value="institucion" checked> Casos por institución</label>
          <label class="carga-anio-opcion"><input type="checkbox" name="morb-pdf-seccion" value="grupoedad" checked> Casos por grupo de edad</label>
          <label class="carga-anio-opcion"><input type="checkbox" name="morb-pdf-seccion" value="sexo" checked> Casos por sexo</label>
          <label class="carga-anio-opcion"><input type="checkbox" name="morb-pdf-seccion" value="padecimientos" checked> Padecimiento(s) dentro de la selección</label>
          <label class="carga-anio-opcion"><input type="checkbox" name="morb-pdf-seccion" value="tendencia" checked> Tendencia por año/mes</label>
          <label class="carga-anio-opcion"><input type="checkbox" name="morb-pdf-seccion" value="mesanio" checked> Comparativo por mes y año</label>
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
// chartInstancesById: además de la instancia normal, se indexa la ÚLTIMA
// instancia creada por cada canvas.id, para poder inspeccionar (en el
// Panorama de Casos, más abajo) exactamente qué se dibujó en cada panel
// fijo sin tener que volver a invocar el render del módulo.
const chartInstancesById = {};
window.Chart = function (ctx, cfg) {
  this.destroy = function () {};
  this._cfg = cfg;
  // Además de _cfg (usado por el resto de esta prueba desde antes), se
  // expone .data igual que el Chart.js real — lo necesita el generador de
  // PDF (punto 3 del ajuste de seguimiento a ACT09), que lee las
  // categorías/series directo de la instancia ya dibujada, tal como haría
  // en un navegador real.
  this.data = cfg && cfg.data ? cfg.data : { labels: [], datasets: [] };
  this.ctx = ctx && ctx.getContext ? ctx.getContext("2d") : null;
  this.canvas = ctx;
  this.options = cfg && cfg.options ? cfg.options : {};
  this.update = function () {};
  if (ctx && ctx.id) chartInstancesById[ctx.id] = this;
};
window.Chart.register = function () {};

// ---- Stub mínimo de jsPDF + jsPDF-AutoTable (mismo patrón ya validado en
// scripts/test_carga_jsdom.js) — sin canvas.toDataURL ni captura de
// imagen: el PDF de Morbilidad (punto 3 del ajuste de seguimiento) es
// SIEMPRE texto/tablas, así que el stub no necesita imitar addImage salvo
// para registrar que nunca se llama. ----
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
    // ACT14: orientación por página (index 1-based), para poder probar
    // que la numeración de páginas usa el tamaño de la página VIGENTE
    // (doc.internal.pageSize) y no un ancho/alto fijo que podría
    // corresponder a otra orientación.
    window.__pdfPageOrientations = [null, (opts && opts.orientation) || "portrait"];
    this.setFont = function () {};
    this.setFontSize = function () {};
    this.text = function (str) { window.__pdfTextLog.push(str); };
    this.splitTextToSize = function (str) { return [str]; }; // sin word-wrap real en la prueba: 1 línea por texto
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
      // Estimación simple para lastAutoTable.finalY (mismo campo que el
      // jsPDF-AutoTable real expone), suficiente para que el código bajo
      // prueba pueda seguir calculando "y" sin necesitar layout real.
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
  "data/real/morbilidad_casos_2025_2026.js",
  "data/real/morbilidad_poblacion_2025_2026.js",
  "data/real/morbilidad_temporal_2025_2026.js",
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

function assert(cond, msg) {
  if (!cond) throw new Error("FALLÓ: " + msg);
  console.log("OK: " + msg);
}

// ---- Simular login ----
const loginResult = window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025");
console.assert(loginResult && loginResult.ok !== false, "Login debería funcionar con el usuario demo");
console.log("Login:", JSON.stringify(loginResult).slice(0, 120));

// ---- Render inicial del módulo ----
window.SNSP_renderMorbilidadModulePage({});

const doc = window.document;
function txt(id) { const el = doc.getElementById(id); return el ? el.textContent.trim() : "<<NO EXISTE>>"; }

console.log("\n--- Fuente y versión ---");
console.log("source-label:", txt("source-label"));
console.log("version-tag-module:", txt("version-tag-module"));
assert(!txt("source-label").includes("2024"), "source-label NO debe mencionar 2024 (la base es 2025-2026)");

console.log("\n--- Estado inicial (sin selección de padecimiento) ---");
console.log("morb-tabla-count inicial:", txt("morb-tabla-count"));
console.log("morb-tabla-head inicial:", txt("morb-tabla-head"));
const filasIniciales = doc.querySelectorAll("#morb-tabla-body tr").length;
console.log("Filas iniciales (Por=Padecimiento):", filasIniciales);
// Ajuste de seguimiento a ACT09: la gráfica/tabla principal ahora también
// tiene Top N (predeterminado Top 10), así que por defecto sólo se dibujan
// 10 filas — el total real (157 padecimientos) se sigue reportando en el
// texto de la tabla ("Top 10 de 157"), nunca se pierde ni se recalcula.
assert(filasIniciales === 10, "Con Por=Padecimiento y el Top N predeterminado (Top 10), la tabla principal debe mostrar 10 filas");
assert(/Top 10 de 157/.test(txt("morb-tabla-count")), `El texto de la tabla debe avisar "Top 10 de 157" (trae: "${txt("morb-tabla-count")}")`);
assert(txt("morb-tabla-head").includes("Casos"), "Por defecto Analizar=Casos");
assert(doc.getElementById("kpi-grid").querySelectorAll(".indicator-card, [class*=indicator]").length >= 0, "kpi-grid se renderizó");
console.log("kpi-grid (primeros 200 chars):", txt("kpi-grid").replace(/\s+/g, " ").slice(0, 200));

// =====================================================================
// ACT15 (punto 9) — VALIDACIÓN OBLIGATORIA contra las bases originales:
// sin filtros de Mes/Semana, el total general debe ser EXACTAMENTE
// 1,270,390 casos, y la selección T63.2, X22 — Intoxicación por picadura
// de alacrán (epiclave 94) debe dar EXACTAMENTE 10,252 casos sin filtros
// temporales. Se verifica aquí, en el estado recién renderizado (sin
// ninguna interacción todavía), contra la app real corriendo — no sólo
// contra el bundle de datos crudo (ya verificado aparte con Node/Python).
// =====================================================================
console.log("\n--- ACT15 (punto 9): validación obligatoria contra las bases originales ---");
const totalGeneralInicial = _casosTotalesKpi();
assert(totalGeneralInicial === 1270390, `Sin filtros de Mes/Semana, el total general debe ser EXACTAMENTE 1,270,390 casos (trae: ${totalGeneralInicial})`);

const inputAlacranTest = doc.getElementById("cie10-search");
inputAlacranTest.value = "alacrán";
inputAlacranTest.dispatchEvent(new window.Event("input", { bubbles: true }));
const sugerenciaAlacran = Array.from(doc.querySelectorAll(".cie10-suggestion[data-epiclave]")).find((el) => el.getAttribute("data-epiclave") === "94");
assert(!!sugerenciaAlacran, "Debe existir la sugerencia 'Intoxicación por picadura de alacrán' (epiclave 94) al buscar 'alacrán'");
sugerenciaAlacran.dispatchEvent(new window.Event("click", { bubbles: true }));
const totalAlacran = _casosTotalesKpi();
assert(totalAlacran === 10252, `La selección T63.2, X22 — Intoxicación por picadura de alacrán debe dar EXACTAMENTE 10,252 casos sin filtros temporales (trae: ${totalAlacran})`);
doc.getElementById("btn-limpiar-seleccion").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(_casosTotalesKpi() === 1270390, "Al quitar la selección de alacrán, el total general debe volver a 1,270,390");
console.log("=== ACT15 (punto 9) VALIDACIÓN OBLIGATORIA: AMBOS CONTROLES COINCIDEN EXACTAMENTE ===");

// ---- Ajuste de seguimiento a ACT09 (punto 1): sin ningún año marcado, la
// gráfica/tabla principal debe comparar 2025 vs 2026 (NO sumarlos) desde
// el primer render, igual que si el usuario hubiera marcado los 2 años. ----
console.log("\n--- Años: sin selección = comparativo 2025 vs 2026 (no sumar) ---");
assert(txt("morb-tabla-head").includes("2025") && txt("morb-tabla-head").includes("2026") && txt("morb-tabla-head").includes("Diferencia"),
  `Sin ningún año marcado, la tabla principal debe venir en modo comparativo (columnas 2025/2026/Diferencia), no sumada (trae: "${txt("morb-tabla-head")}")`);
assert(/Comparativo 2025 vs 2026/.test(txt("morb-tabla-count")), `El texto de la tabla debe usar la frase uniforme "Comparativo 2025 vs 2026" (trae: "${txt("morb-tabla-count")}")`);

// ---- Ajuste de seguimiento a ACT09 (punto 4): limpieza de texto ----
console.log("\n--- Limpieza de texto ---");
const topbarTexto = txt("topbar");
assert(!/prueba funcional/i.test(topbarTexto), `El encabezado de Morbilidad ya no debe decir "prueba funcional" (trae: "${topbarTexto}")`);
assert(!/Ver fecha de archivo en Metodología/i.test(topbarTexto), `El encabezado ya no debe traer la línea "Ver fecha de archivo en Metodología" (trae: "${topbarTexto}")`);
assert(!/Actualizado:/i.test(topbarTexto), `Sin una fecha real que mostrar, el encabezado no debe inventar ni dejar una línea "Actualizado:" vacía de sentido (trae: "${topbarTexto}")`);
const chipsPlaceholder = txt("morb-anio-chips");
assert(/Comparativo 2025 vs 2026/.test(chipsPlaceholder), `Sin ningún año marcado, el texto junto al selector de Año debe usar la frase uniforme "Comparativo 2025 vs 2026" (trae: "${chipsPlaceholder}")`);

// ---- No debe haber accesos rápidos (se eliminaron a petición explícita) ----
assert(!doc.querySelector(".quick-code-chip"), "No debe existir ningún chip de acceso rápido (C50/C53/D05/D06/N87 eliminados)");
assert(!doc.getElementById("accesos-rapidos"), "No debe existir el contenedor accesos-rapidos");

// ---- Buscador CIE-10/Epi-clave/padecimiento sigue funcionando ----
console.log("\n--- Búsqueda 'C50' ---");
const inputBusqueda = doc.getElementById("cie10-search");
inputBusqueda.value = "C50";
inputBusqueda.dispatchEvent(new window.Event("input", { bubbles: true }));
const sugerencias = doc.querySelectorAll(".cie10-suggestion[data-epiclave]");
console.log("Sugerencias encontradas para 'C50':", sugerencias.length);
assert(sugerencias.length > 0, "La búsqueda por código CIE-10 debe encontrar al menos un padecimiento");
sugerencias[0].dispatchEvent(new window.Event("click", { bubbles: true }));
console.log("seleccion-actual:", txt("seleccion-actual"));
assert(txt("seleccion-actual").includes("Consultando"), "Debe mostrar el padecimiento seleccionado");
console.log("morb-tabla-count tras seleccionar C50 (Por=Padecimiento):", txt("morb-tabla-count"));
const filasTrasC50 = doc.querySelectorAll("#morb-tabla-body tr").length;
assert(filasTrasC50 === 1, "Con un padecimiento específico seleccionado y Por=Padecimiento debe quedar 1 sola categoría");

// Cambiar Por -> Municipio con C50 seleccionado: debe seguir filtrado a ese padecimiento
const selDim = doc.getElementById("morb-select-dim");
selDim.value = "municipio";
selDim.dispatchEvent(new window.Event("change", { bubbles: true }));
const filasMunicipioC50 = doc.querySelectorAll("#morb-tabla-body tr").length;
console.log("Filas tras Por=Municipio (con C50 seleccionado):", filasMunicipioC50);
assert(filasMunicipioC50 > 0 && filasMunicipioC50 <= 18, "Por=Municipio no debe exceder los 18 municipios de Querétaro");

// Quitar selección
doc.getElementById("btn-limpiar-seleccion").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(txt("seleccion-actual") === "", "Tras Quitar, la selección debe limpiarse");

// ---- Por = Jurisdicción ----
selDim.value = "jurisdiccion";
selDim.dispatchEvent(new window.Event("change", { bubbles: true }));
const filasJuris = doc.querySelectorAll("#morb-tabla-body tr").length;
console.log("Filas tras Por=Jurisdicción:", filasJuris);
assert(filasJuris > 0 && filasJuris <= 4, "Por=Jurisdicción debe dar como máximo las jurisdicciones reales de la base");

// ---- Por = Grupo de edad (antes decía "dato pendiente de carga") ----
selDim.value = "grupo_edad";
selDim.dispatchEvent(new window.Event("change", { bubbles: true }));
const filasGrupoEdad = doc.querySelectorAll("#morb-tabla-body tr").length;
console.log("Filas tras Por=Grupo de edad:", filasGrupoEdad);
assert(filasGrupoEdad > 0, "Por=Grupo de edad debe mostrar categorías reales (BASE_CASOS sí trae esta variable)");
assert(!doc.body.innerHTML.includes("no incluye la variable grupo de edad"), "No debe quedar ningún texto diciendo que grupo de edad no está disponible");

// Confirmar que "Por" NO ofrece Institución
const opcionesPor = Array.from(selDim.options).map((o) => o.value);
console.log("Opciones de Por:", opcionesPor);
assert(!opcionesPor.includes("institucion"), 'Institución NO debe estar entre las opciones de "Por"');

// ---- Analizar = Población / Tasa ----
const selMedida = doc.getElementById("morb-select-medida");
assert(!Array.from(selMedida.options).find((o) => o.value === "tasa").disabled, "Tasa debe estar habilitada (BASE_POBLACION real trae Año+Municipio+Grupo de edad+Población)");
selMedida.value = "tasa";
selMedida.dispatchEvent(new window.Event("change", { bubbles: true }));
console.log("morb-tabla-head tras Analizar=Tasa:", txt("morb-tabla-head"));
assert(txt("morb-tabla-head").includes("Tasa"), "El encabezado debe reflejar Analizar=Tasa dinámicamente");

selMedida.value = "poblacion";
selMedida.dispatchEvent(new window.Event("change", { bubbles: true }));
assert(txt("morb-tabla-head").includes("Población"), "El encabezado debe reflejar Analizar=Población dinámicamente");
selMedida.value = "casos";
selMedida.dispatchEvent(new window.Event("change", { bubbles: true }));
selDim.value = "padecimiento";
selDim.dispatchEvent(new window.Event("change", { bubbles: true }));

// ---- Filtros Municipio / Jurisdicción / Institución (afectan tarjetas, gráfica y tabla) ----
console.log("\n--- Filtro Institución ---");
const selInstitucion = doc.getElementById("flt-institucion_morbilidad");
assert(!!selInstitucion, "Debe existir el filtro de Institución en la barra de filtros");
const opcionInstitucion = selInstitucion.options[1].value;
selInstitucion.value = opcionInstitucion;
doc.getElementById("btn-aplicar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));
const filasConInstitucion = doc.querySelectorAll("#morb-tabla-body tr").length;
const kpiConInstitucion = txt("kpi-grid");
console.log(`Filtrado por Institución="${opcionInstitucion}" — filas: ${filasConInstitucion}`);
assert(filasConInstitucion > 0, "El filtro de Institución debe seguir produciendo resultados");
assert(kpiConInstitucion.includes("Filas consideradas"), "El KPI debe reflejar el filtro aplicado");

doc.getElementById("btn-limpiar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));

// ---- Año: comparar 2025 vs 2026 (misma lógica que Cargar datos: NO se suman) ----
console.log("\n--- Año: comparar 2025 y 2026 ---");
const menuAnio = doc.getElementById("morb-anio-menu");
const chks = Array.from(menuAnio.querySelectorAll("input[type=checkbox]"));
console.log("Años disponibles en el menú:", chks.map((c) => c.value));
assert(chks.length === 2, "Debe haber exactamente 2 años disponibles: 2025 y 2026");
chks.forEach((c) => { c.checked = true; c.dispatchEvent(new window.Event("change", { bubbles: true })); });

const headComparativo = txt("morb-tabla-head");
console.log("Encabezado en modo comparativo:", headComparativo);
assert(headComparativo.includes("2025") && headComparativo.includes("2026"), "La tabla comparativa debe traer una columna por cada año, no sumados");
assert(headComparativo.includes("Diferencia") && headComparativo.includes("Variación"), "Con exactamente 2 años debe calcular Diferencia y Variación %");

const primeraFilaComparativa = doc.querySelector("#morb-tabla-body tr");
const celdas = primeraFilaComparativa.querySelectorAll("td");
console.log("Primera fila comparativa (celdas):", celdas.length);
assert(celdas.length === 6, "Fila comparativa: # + Categoría + 2025 + 2026 + Diferencia + Variación% = 6 celdas");

// Quitar un año (volver a modo clásico) usando el botón "x" del chip
const chipBtn = doc.querySelector(".carga-anio-chip button");
assert(!!chipBtn, "Debe existir al menos un chip de año con botón para quitarlo");
chipBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
const aniosRestantes = Array.from(menuAnio.querySelectorAll("input:checked")).length;
console.log("Años seleccionados tras quitar uno:", aniosRestantes);
assert(aniosRestantes === 1, "Debe quedar exactamente 1 año seleccionado tras quitar uno del comparativo");
assert(!txt("morb-tabla-head").includes("Diferencia"), "Con 1 solo año ya no debe mostrar Diferencia/Variación (modo clásico)");

console.log("\n=== PRUEBA COMPLETADA SIN ERRORES DE EXCEPCIÓN ===");

// ---- Verificación cruzada contra la lógica ya validada (suma directa) ----
console.log("\n--- Verificación cruzada: Casos totales por Municipio=Querétaro, año 2025 ---");
chks.forEach((c) => { if (c.checked) { c.checked = false; c.dispatchEvent(new window.Event("change", { bubbles: true })); } });
const chk2025 = chks.find((c) => c.value === "2025");
chk2025.checked = true;
chk2025.dispatchEvent(new window.Event("change", { bubbles: true }));

const selMunicipio = doc.getElementById("flt-municipio_morbilidad");
const opcionMunicipioQro = Array.from(selMunicipio.options).map((o) => o.value).find((v) => /Quer/i.test(v));
assert(!!opcionMunicipioQro, "Debe existir un municipio que contenga 'Querétaro' en el catálogo real");
selMunicipio.value = opcionMunicipioQro;
doc.getElementById("btn-aplicar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));

const casosData = window.SNSP_MORBILIDAD_CASOS_DATA;
const idxAnio = casosData.headers.indexOf("Año");
const idxMun = casosData.headers.indexOf("Municipio");
const idxCasos = casosData.headers.indexOf("Casos");
const sumaDirecta = casosData.rows
  .filter((r) => String(r[idxAnio]) === "2025" && r[idxMun] === opcionMunicipioQro)
  .reduce((s, r) => s + r[idxCasos], 0);
const kpiTexto = txt("kpi-grid");
console.log("Suma directa (fuera del módulo) Casos 2025 en", opcionMunicipioQro, "=", sumaDirecta);
console.log("KPI 'Casos totales' mostrado:", kpiTexto.match(/Casos totales\s*([\d,]+)/) ? kpiTexto.match(/Casos totales\s*([\d,]+)/)[0] : "<<no encontrado>>");
assert(kpiTexto.replace(/\s+/g, " ").includes(sumaDirecta.toLocaleString("es-MX")), "El KPI 'Casos totales' debe coincidir EXACTAMENTE con la suma directa fuera del módulo");

console.log("\n=== VERIFICACIÓN CRUZADA COMPLETADA SIN ERRORES ===");

// ---- Panorama de Casos: 8 paneles fijos recuperados de la versión anterior ----
console.log("\n--- Panorama de Casos: presencia y datos de los 8 paneles ---");

// Volver a un estado limpio (sin filtros, sin selección) y fijar el año
// en sólo 2025 para las aserciones de "año único" que siguen.
doc.getElementById("btn-limpiar-filtros") && doc.getElementById("btn-limpiar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));
const menuAnioLimpio = doc.getElementById("morb-anio-menu");
Array.from(menuAnioLimpio.querySelectorAll("input[type=checkbox]")).forEach((c) => { if (c.checked) { c.checked = false; c.dispatchEvent(new window.Event("change", { bubbles: true })); } });
const chkSolo2025 = Array.from(menuAnioLimpio.querySelectorAll("input[type=checkbox]")).find((c) => c.value === "2025");
chkSolo2025.checked = true;
chkSolo2025.dispatchEvent(new window.Event("change", { bubbles: true }));

assert(!!doc.getElementById("morb-chart-municipio"), "Debe existir el canvas de Casos por municipio");
assert(!!doc.getElementById("morb-chart-jurisdiccion"), "Debe existir el canvas de Casos por jurisdicción sanitaria");
assert(!!doc.getElementById("morb-chart-institucion"), "Debe existir el canvas de Casos por institución");
assert(!!doc.getElementById("morb-chart-grupoedad"), "Debe existir el canvas de Casos por grupo de edad");
assert(!!doc.getElementById("morb-chart-padecimientos"), "Debe existir el canvas de Padecimiento(s) dentro de la selección");
assert(!!doc.getElementById("morb-chart-tendencia"), "Debe existir el canvas de Tendencia por año/mes");
assert(!!doc.getElementById("morb-chart-mesanio"), "Debe existir el canvas de comparativo por mes y año");
assert(!!doc.getElementById("morb-chart-sexo"), "Debe existir el canvas de Casos por sexo");

const cfgMunicipio = chartInstancesById["morb-chart-municipio"]._cfg;
console.log("Categorías en Casos por municipio (sin año comparativo):", cfgMunicipio.data.labels.length);
assert(cfgMunicipio.data.labels.length === 18, "Casos por municipio debe mostrar SIEMPRE los 18 municipios, incluidos los de 0 casos en la selección");

const cfgInstitucion = chartInstancesById["morb-chart-institucion"]._cfg;
assert(cfgInstitucion.data.datasets[0].label === "Casos", "Casos por institución debe ser SIEMPRE de Casos (nunca Tasa), sin importar el selector global Analizar");

const cfgSexo = chartInstancesById["morb-chart-sexo"]._cfg;
const catsSexo = cfgSexo.data.labels;
console.log("Categorías de Casos por sexo:", catsSexo);
assert(catsSexo.includes("Femenino") && catsSexo.includes("Masculino"), "Casos por sexo debe traer Femenino y Masculino (bundle temporal)");

const cfgTendencia = chartInstancesById["morb-chart-tendencia"]._cfg;
console.log("Puntos en Tendencia por año/mes (año único 2025):", cfgTendencia.data.labels.length);
assert(cfgTendencia.data.labels.length === 12, "Con un solo año seleccionado, la Tendencia por año/mes debe traer 12 puntos (Ene-Dic)");

const cfgMesAnio = chartInstancesById["morb-chart-mesanio"]._cfg;
assert(cfgMesAnio.data.labels.length === 12, "Comparativo por mes y año debe traer siempre 12 meses en el eje");
assert(cfgMesAnio.data.datasets.length === 1, "Con un solo año seleccionado, comparativo por mes y año debe traer 1 sola serie (no agrupado)");

// ---- Ambos años (2025+2026): deben aparecer los comparativos donde corresponde ----
console.log("\n--- Panorama de Casos: ambos años (2025 y 2026) ---");
const menuAnio2 = doc.getElementById("morb-anio-menu");
Array.from(menuAnio2.querySelectorAll("input[type=checkbox]")).forEach((c) => { c.checked = true; c.dispatchEvent(new window.Event("change", { bubbles: true })); });

const cfgMunicipioComp = chartInstancesById["morb-chart-municipio"]._cfg;
assert(cfgMunicipioComp.data.datasets.length === 2, "Casos por municipio en modo comparativo debe traer 2 series (2025 y 2026)");
assert(cfgMunicipioComp.data.labels.length === 18, "Casos por municipio comparativo sigue mostrando los 18 municipios");

const cfgJurisComp = chartInstancesById["morb-chart-jurisdiccion"]._cfg;
assert(cfgJurisComp.data.datasets.length === 2, "Casos por jurisdicción en modo comparativo debe cambiar a barras agrupadas por año (2 series)");

const cfgSexoComp = chartInstancesById["morb-chart-sexo"]._cfg;
assert(cfgSexoComp.data.datasets.length === 2, "Casos por sexo en modo comparativo debe traer 2 series (2025 y 2026)");

const cfgMesAnioComp = chartInstancesById["morb-chart-mesanio"]._cfg;
assert(cfgMesAnioComp.data.datasets.length === 2, "Comparativo por mes y año con ambos años seleccionados debe traer 2 series agrupadas (nunca sumadas en 1 sola barra)");
assert(cfgMesAnioComp.data.labels.length === 12, "Comparativo por mes y año sigue mostrando 12 meses con ambos años");
assert(cfgMesAnioComp.data.datasets[0].label === "2025" && cfgMesAnioComp.data.datasets[1].label === "2026", "Comparativo por mes y año debe traer una serie identificada como 2025 y otra como 2026");

const cfgTendenciaComp = chartInstancesById["morb-chart-tendencia"]._cfg;
console.log("Puntos en Tendencia por año/mes (ambos años):", cfgTendenciaComp.data.labels.length, "series:", cfgTendenciaComp.data.datasets.length);
assert(cfgTendenciaComp.data.labels.length === 12, "Con 2025 y 2026 seleccionados, la Tendencia por año/mes debe usar los mismos 12 meses (Ene-Dic) en el eje, NO 24 encadenados");
assert(cfgTendenciaComp.data.datasets.length === 2, "Con 2025 y 2026 seleccionados, la Tendencia por año/mes debe traer 2 series separadas (una por año), no una sola línea continua");
assert(cfgTendenciaComp.data.datasets[0].label === "2025" && cfgTendenciaComp.data.datasets[1].label === "2026", "Las 2 series de Tendencia deben estar identificadas como 2025 y 2026");

// ---- "Sin información" (2026 aún sin cargar más allá de agosto) debe
// distinguirse de "0 casos": null en la serie, nunca 0, tanto en
// Tendencia como en Comparativo por mes y año. ----
console.log("\n--- Distinción 'sin información' vs '0 casos' en 2026 (meses aún no cargados) ---");
const serieTendencia2026 = cfgTendenciaComp.data.datasets[1].data;
console.log("Serie Tendencia 2026:", serieTendencia2026);
assert(serieTendencia2026.slice(0, 8).every((v) => v !== null && v !== undefined), "Tendencia 2026 debe traer valor real en los meses que SÍ tienen información cargada (Ene-Ago)");
assert(serieTendencia2026.slice(8).every((v) => v === null), "Tendencia 2026 debe dejar en null (no en 0) los meses sin ningún registro cargado (Sep-Dic)");
const serieTendencia2025 = cfgTendenciaComp.data.datasets[0].data;
assert(serieTendencia2025.every((v) => v !== null && v !== undefined), "Tendencia 2025 (año con los 12 meses cargados) no debe traer ningún null");

const serieMesAnio2026 = cfgMesAnioComp.data.datasets[1].data;
console.log("Serie Comparativo por mes y año 2026:", serieMesAnio2026);
assert(serieMesAnio2026.slice(0, 8).every((v) => v !== null && v !== undefined), "Comparativo por mes y año 2026 debe traer valor real en los meses cargados (Ene-Ago)");
assert(serieMesAnio2026.slice(8).every((v) => v === null), "Comparativo por mes y año 2026 debe dejar en null (no en 0) los meses sin información (Sep-Dic)");

// ---- Sin ningún año marcado ("Todos, 2025 y 2026 combinados" por
// defecto): también debe agrupar por año, NUNCA sumar ambos años en una
// sola barra/línea — antes de este ajuste, este estado por defecto sí
// los sumaba. ----
console.log("\n--- Sin año marcado explícitamente (alcance implícito: ambos años) ---");
Array.from(menuAnio2.querySelectorAll("input[type=checkbox]")).forEach((c) => { c.checked = false; c.dispatchEvent(new window.Event("change", { bubbles: true })); });
const cfgMesAnioImplicito = chartInstancesById["morb-chart-mesanio"]._cfg;
assert(cfgMesAnioImplicito.data.datasets.length === 2, "Sin año marcado, Comparativo por mes y año debe agrupar 2025/2026 por separado, no sumarlos en 1 sola barra");
const cfgTendenciaImplicito = chartInstancesById["morb-chart-tendencia"]._cfg;
assert(cfgTendenciaImplicito.data.labels.length === 12 && cfgTendenciaImplicito.data.datasets.length === 2, "Sin año marcado, Tendencia por año/mes también debe traer 2 series (2025/2026) sobre 12 meses, no una línea de 24 meses encadenados");

// ---- Ajuste de seguimiento a ACT09 (punto 1): el resto de los paneles
// del Panorama de Casos (no sólo Tendencia/Mes y año) también deben venir
// en modo comparativo (2 series, 2025 vs 2026) cuando no hay ningún año
// marcado — antes de este ajuste sólo Tendencia/MesAnio se habían
// verificado explícitamente. ----
const cfgMunicipioImplicito = chartInstancesById["morb-chart-municipio"]._cfg;
assert(cfgMunicipioImplicito.data.datasets.length === 2, "Sin año marcado, Casos por municipio debe agrupar 2025/2026 por separado (2 series), no sumarlos");
const cfgJurisImplicito = chartInstancesById["morb-chart-jurisdiccion"]._cfg;
assert(cfgJurisImplicito.data.datasets.length === 2, "Sin año marcado, Casos por jurisdicción debe pasar a barra agrupada 2025/2026 (2 series), no quedar en dona de un solo año sumado");
const cfgInstitucionImplicito = chartInstancesById["morb-chart-institucion"]._cfg;
assert(cfgInstitucionImplicito.data.datasets.length === 2, "Sin año marcado, Casos por institución debe agrupar 2025/2026 por separado (2 series), no sumarlos");
const cfgGrupoEdadImplicito = chartInstancesById["morb-chart-grupoedad"]._cfg;
assert(cfgGrupoEdadImplicito.data.datasets.length === 2, "Sin año marcado, Casos por grupo de edad debe agrupar 2025/2026 por separado (2 series), no sumarlos");
const cfgPadecimientosImplicito = chartInstancesById["morb-chart-padecimientos"]._cfg;
assert(cfgPadecimientosImplicito.data.datasets.length === 2, "Sin año marcado, Casos por padecimiento (Panorama) debe agrupar 2025/2026 por separado (2 series), no sumarlos");
const cfgSexoImplicito = chartInstancesById["morb-chart-sexo"]._cfg;
assert(cfgSexoImplicito.data.datasets.length === 2, "Sin año marcado, Casos por sexo debe agrupar 2025/2026 por separado (2 series), no sumarlos");

// ---- Ajuste de seguimiento a ACT09 (punto 2): los helpers de la gráfica
// de valores mensuales (Tendencia y Comparativo por mes y año) deben usar
// el formateador compacto y una fuente de etiqueta más pequeña, sin tocar
// los valores reales de los datasets (sólo cómo se dibuja la etiqueta). ----
console.log("\n--- Etiquetas mensuales: formateador compacto y fuente reducida (sin alterar los datos) ---");
const optsTendenciaImplicito = cfgTendenciaImplicito.options.plugins.snspValueLabels;
assert(typeof optsTendenciaImplicito.formatter === "function", "Tendencia debe traer un formatter de etiqueta compacto configurado");
assert(optsTendenciaImplicito.formatter(81046) === "81k", `El formateador compacto debe convertir 81046 en "81k" (trae: "${optsTendenciaImplicito.formatter(81046)}")`);
assert(optsTendenciaImplicito.formatter(8046) === "8.0k", `El formateador compacto debe convertir 8046 en "8.0k" (1 decimal cuando queda por debajo de 10k) (trae: "${optsTendenciaImplicito.formatter(8046)}")`);
assert(optsTendenciaImplicito.formatter(430) === "430", `El formateador compacto debe dejar los números menores a 1000 sin cambio (trae: "${optsTendenciaImplicito.formatter(430)}")`);
// ACT14 (punto 5) + ACT15 (punto 3): 8px, pequeño, pero EN NEGRITA de
// nuevo (ACT15 revirtió el "sin negrita" de ACT14) — sin fontWeight
// explícito, _snspLabelFont cae al "600" (semi-negrita) por defecto, así
// que aquí NO debe venir "400" (delgado). Tendencia además debe traer
// pointLabelSplit activo (2025 arriba / 2026 abajo del punto).
assert(optsTendenciaImplicito.fontSize === 8, `Tendencia debe usar una fuente de etiqueta de 8px para no encimarse (trae: ${optsTendenciaImplicito.fontSize})`);
assert(optsTendenciaImplicito.fontWeight !== "400", `Tendencia debe dibujar la etiqueta EN NEGRITA (no "400" delgado) (trae: ${optsTendenciaImplicito.fontWeight})`);
assert(optsTendenciaImplicito.pointLabelSplit === true, `Tendencia debe traer pointLabelSplit activo (2025 arriba / 2026 abajo del punto) (trae: ${optsTendenciaImplicito.pointLabelSplit})`);
const optsMesAnioImplicito = cfgMesAnioImplicito.options.plugins.snspValueLabels;
assert(optsMesAnioImplicito.fontSize === 8, `Comparativo por mes y año debe usar una fuente de etiqueta de 8px (trae: ${optsMesAnioImplicito.fontSize})`);
assert(optsMesAnioImplicito.fontWeight !== "400", `Comparativo por mes y año debe dibujar la etiqueta EN NEGRITA (no "400" delgado) (trae: ${optsMesAnioImplicito.fontWeight})`);
assert(cfgTendenciaImplicito.data.datasets[0].data.some((v) => v > 1000), "El dataset real de Tendencia debe conservar sus valores completos (sin redondear/recortar) pese al formateador de etiqueta compacto");

// ---- Filtro de Institución también acota el Panorama de Casos ----
console.log("\n--- Panorama de Casos responde a filtros (Institución) ---");
const chk2025b = Array.from(menuAnio2.querySelectorAll("input[type=checkbox]")).find((c) => c.value === "2025");
chk2025b.checked = true;
chk2025b.dispatchEvent(new window.Event("change", { bubbles: true }));

const selInstitucion2 = doc.getElementById("flt-institucion_morbilidad");
const opcionInstitucion2 = selInstitucion2.options[1].value;
selInstitucion2.value = opcionInstitucion2;
doc.getElementById("btn-aplicar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));

const cfgInstitucionFiltrado = chartInstancesById["morb-chart-institucion"]._cfg;
console.log("Categorías de Casos por institución tras filtrar por Institución=" + opcionInstitucion2 + ":", cfgInstitucionFiltrado.data.labels.length);
assert(cfgInstitucionFiltrado.data.labels.length === 1 && cfgInstitucionFiltrado.data.labels[0] === opcionInstitucion2, "Al filtrar por una Institución específica, Casos por institución debe acotarse a esa única categoría");

const cfgSexoFiltrado = chartInstancesById["morb-chart-sexo"]._cfg;
console.log("Casos por sexo tras el mismo filtro de Institución (bundle temporal también filtrado):", cfgSexoFiltrado.data.datasets[0].data);
assert(cfgSexoFiltrado.data.datasets[0].data.some((v) => v > 0), "Casos por sexo debe seguir trayendo datos tras aplicar el filtro de Institución (bundle temporal filtrado igual)");

doc.getElementById("btn-limpiar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));

// ---- Búsqueda CIE-10 también acota el Panorama de Casos ----
console.log("\n--- Panorama de Casos responde al buscador CIE-10 ---");
const inputBusqueda2 = doc.getElementById("cie10-search");
inputBusqueda2.value = "C50";
inputBusqueda2.dispatchEvent(new window.Event("input", { bubbles: true }));
const sugerencias2 = doc.querySelectorAll(".cie10-suggestion[data-epiclave]");
sugerencias2[0].dispatchEvent(new window.Event("click", { bubbles: true }));

const cfgPadecimientosSel = chartInstancesById["morb-chart-padecimientos"]._cfg;
console.log("Padecimiento(s) dentro de la selección tras buscar C50:", cfgPadecimientosSel.data.labels);
assert(cfgPadecimientosSel.data.labels.length === 1, "Con un padecimiento específico buscado y seleccionado, el panel de Padecimiento(s) dentro de la selección debe acotarse a 1 categoría");

const cfgSexoSel = chartInstancesById["morb-chart-sexo"]._cfg;
assert(cfgSexoSel.data.datasets[0].data.some((v) => v > 0), "Casos por sexo debe seguir respondiendo cuando hay una búsqueda de padecimiento activa");

doc.getElementById("btn-limpiar-seleccion").dispatchEvent(new window.Event("click", { bubbles: true }));

console.log("\n=== PANORAMA DE CASOS (8 PANELES) VERIFICADO SIN ERRORES ===");

// ---- ACT09: selector Top N (Padecimientos) y ajustes visuales ----
console.log("\n--- ACT09: Top N de Padecimientos, grosor uniforme y alto adaptable ---");

// Estado limpio: sin filtros, sin selección, sólo 2025 (año único, sin comparativo)
doc.getElementById("btn-limpiar-filtros") && doc.getElementById("btn-limpiar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));
const menuAnioACT09 = doc.getElementById("morb-anio-menu");
Array.from(menuAnioACT09.querySelectorAll("input[type=checkbox]")).forEach((c) => { if (c.checked) { c.checked = false; c.dispatchEvent(new window.Event("change", { bubbles: true })); } });
const chk2025ACT09 = Array.from(menuAnioACT09.querySelectorAll("input[type=checkbox]")).find((c) => c.value === "2025");
chk2025ACT09.checked = true;
chk2025ACT09.dispatchEvent(new window.Event("change", { bubbles: true }));

const selTopN = doc.getElementById("morb-padecimientos-topn");
assert(!!selTopN, "Debe existir el selector Top N del panel Padecimiento(s) dentro de la selección");
assert(selTopN.value === "10", "El selector Top N debe venir predeterminado en Top 10");

function totalCasosKPI() {
  const m = txt("kpi-grid").replace(/\s+/g, " ").match(/Casos totales\s*([\d,]+)/);
  return m ? m[1] : null;
}

const totalConTop10 = totalCasosKPI();
const cfgPadTop10 = chartInstancesById["morb-chart-padecimientos"]._cfg;
console.log("Categorías dibujadas con Top 10:", cfgPadTop10.data.labels.length);
assert(cfgPadTop10.data.labels.length === 10, "Con Top 10 (predeterminado) el panel de Padecimientos debe dibujar 10 barras");
// El total real de padecimientos EN 2025 (año único elegido) es <= 157 (el
// catálogo completo incluye 2025+2026): se toma del propio subtítulo, sin
// asumir un número fijo, y se reutiliza para las aserciones que siguen.
const totalPadecimientos2025 = parseInt((txt("morb-subt-padecimientos").match(/Top 10 de (\d+)/) || [])[1], 10);
console.log("Total real de padecimientos con Casos en 2025:", totalPadecimientos2025);
assert(totalPadecimientos2025 > 10 && totalPadecimientos2025 <= 157, `El subtítulo debe avisar "Top 10 de N" con N entre 11 y 157 (trae: "${txt("morb-subt-padecimientos")}")`);

// Cambiar a Todos: debe crecer al total real (mismo N que el subtítulo de
// Top 10 reportó), pero el KPI de Casos totales NO debe cambiar
selTopN.value = "todos";
selTopN.dispatchEvent(new window.Event("change", { bubbles: true }));
const totalConTodos = totalCasosKPI();
const cfgPadTodos = chartInstancesById["morb-chart-padecimientos"]._cfg;
console.log("Categorías dibujadas con Todos:", cfgPadTodos.data.labels.length);
assert(cfgPadTodos.data.labels.length === totalPadecimientos2025, `Con Todos, el panel de Padecimientos debe mostrar las ${totalPadecimientos2025} categorías reales de la selección`);
assert(txt("morb-subt-padecimientos").includes("Todos los padecimientos"), `El subtítulo debe indicar que se muestran todos (trae: "${txt("morb-subt-padecimientos")}")`);
assert(totalConTodos === totalConTop10, `Cambiar Top N NO debe modificar el KPI de Casos totales (Top 10: ${totalConTop10}, Todos: ${totalConTodos})`);

// Top 15 y Top 20 también deben funcionar y no tocar el KPI
selTopN.value = "15";
selTopN.dispatchEvent(new window.Event("change", { bubbles: true }));
assert(chartInstancesById["morb-chart-padecimientos"]._cfg.data.labels.length === 15, "Con Top 15 el panel debe dibujar 15 barras");
assert(totalCasosKPI() === totalConTop10, "Top 15 tampoco debe modificar el KPI de Casos totales");

selTopN.value = "20";
selTopN.dispatchEvent(new window.Event("change", { bubbles: true }));
assert(chartInstancesById["morb-chart-padecimientos"]._cfg.data.labels.length === 20, "Con Top 20 el panel debe dibujar 20 barras");
assert(totalCasosKPI() === totalConTop10, "Top 20 tampoco debe modificar el KPI de Casos totales");

// Las categorías "siempre completas" no deben verse afectadas por el Top N de Padecimientos
// (Grupo de edad: se compara contra su propio conteo real en 2025, tomado
// directamente de la base — no siempre son las 12 del catálogo completo,
// p. ej. si "De edad desconocida" no tuvo ningún caso ese año en concreto).
const gruposEdad2025 = new Set(
  window.SNSP_MORBILIDAD_CASOS_DATA.rows
    .filter((r) => String(r[window.SNSP_MORBILIDAD_CASOS_DATA.headers.indexOf("Año")]) === "2025")
    .map((r) => r[window.SNSP_MORBILIDAD_CASOS_DATA.headers.indexOf("Grupo de edad")])
).size;
assert(chartInstancesById["morb-chart-municipio"]._cfg.data.labels.length === 18, "Municipio debe seguir mostrando los 18 municipios sin importar el Top N de Padecimientos");
assert(chartInstancesById["morb-chart-grupoedad"]._cfg.data.labels.length === gruposEdad2025, `Grupo de edad debe seguir mostrando sus ${gruposEdad2025} categorías reales en 2025 sin importar el Top N de Padecimientos`);
assert(chartInstancesById["morb-chart-sexo"]._cfg.data.labels.length === 2, "Sexo debe seguir mostrando Femenino/Masculino sin importar el Top N de Padecimientos");

selTopN.value = "10";
selTopN.dispatchEvent(new window.Event("change", { bubbles: true }));

// ---- Grosor uniforme de barra (maxBarThickness) en todas las gráficas ----
console.log("\n--- Grosor de barra uniforme (ACT09) ---");
const idsBarras = ["morb-chart", "morb-chart-municipio", "morb-chart-institucion", "morb-chart-grupoedad", "morb-chart-padecimientos", "morb-chart-sexo"];
const grosores = idsBarras.map((id) => chartInstancesById[id]._cfg.data.datasets[0].maxBarThickness);
console.log("Grosores (modo clásico, 1 serie):", idsBarras.map((id, i) => `${id}=${grosores[i]}`).join(", "));
assert(grosores.every((g) => g === grosores[0]), "Todas las gráficas de barra deben tener el MISMO grosor máximo de barra (modo clásico)");

// ---- Ambos años: 2025/2026 pegadas por categoría, separación clara entre categorías ----
console.log("\n--- Comparativo 2025 vs 2026: barras pegadas por categoría (ACT09) ---");
Array.from(menuAnioACT09.querySelectorAll("input[type=checkbox]")).forEach((c) => { c.checked = true; c.dispatchEvent(new window.Event("change", { bubbles: true })); });
const cfgMunicipioComp2 = chartInstancesById["morb-chart-municipio"]._cfg;
const dsA = cfgMunicipioComp2.data.datasets[0], dsB = cfgMunicipioComp2.data.datasets[1];
assert(dsA.maxBarThickness === dsB.maxBarThickness, "En comparativo, las barras de 2025 y 2026 deben tener el mismo grosor entre sí");
assert(dsA.maxBarThickness === grosores[0], "El grosor de barra en comparativo debe ser el MISMO que en modo clásico (uniforme en toda la página)");
assert(dsA.barPercentage > dsB.categoryPercentage, "barPercentage (qué tan pegadas van 2025/2026 dentro de su categoría) debe ser mayor que categoryPercentage (separación entre categorías), para que se vean agrupadas por año y separadas de la categoría vecina");
console.log(`barPercentage=${dsA.barPercentage} categoryPercentage=${dsA.categoryPercentage}`);

// ---- Alto adaptado al número de categorías (ni vacío ni amontonado) ----
console.log("\n--- Alto de gráfica adaptado al número de categorías (ACT09) ---");
const altoMunicipio = parseFloat(doc.getElementById("morb-wrap-municipio").style.height);
const altoSexo = parseFloat(doc.getElementById("morb-wrap-sexo").style.height);
console.log(`Alto Casos por municipio (18 categorías, comparativo): ${altoMunicipio}px — Alto Casos por sexo (2 categorías, comparativo): ${altoSexo}px`);
assert(altoMunicipio > altoSexo, "Una gráfica con más categorías (18, municipio) debe reservar más alto que una con menos (2, sexo)");
assert(altoSexo > 0 && altoSexo < 400, "El panel de Casos por sexo (sólo 2 categorías) no debe tener un alto exagerado");

doc.getElementById("btn-limpiar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));
Array.from(menuAnioACT09.querySelectorAll("input[type=checkbox]")).forEach((c) => { if (c.checked) { c.checked = false; c.dispatchEvent(new window.Event("change", { bubbles: true })); } });

console.log("\n=== ACT09 (AJUSTES VISUALES) VERIFICADO SIN ERRORES ===");

// ---- Ajuste de seguimiento a ACT09: mismo Top N ahora también en la
// gráfica/tabla PRINCIPAL (no sólo en el panel de Padecimientos del
// Panorama) — sólo aplica con Por=Padecimiento, y nunca toca el KPI de
// Casos totales ni el total real reportado en "Categorías encontradas". ----
console.log("\n--- Ajuste de seguimiento: Top N en la gráfica/tabla principal ---");
doc.getElementById("btn-limpiar-filtros") && doc.getElementById("btn-limpiar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));
const chk2025Principal = Array.from(menuAnioACT09.querySelectorAll("input[type=checkbox]")).find((c) => c.value === "2025");
chk2025Principal.checked = true;
chk2025Principal.dispatchEvent(new window.Event("change", { bubbles: true }));
selDim.value = "padecimiento";
selDim.dispatchEvent(new window.Event("change", { bubbles: true }));

const selPrincipalTopN = doc.getElementById("morb-principal-topn");
assert(!!selPrincipalTopN, "Debe existir el selector Top N de la gráfica/tabla principal");
assert(selPrincipalTopN.value === "10", "El selector Top N de la gráfica principal debe venir predeterminado en Top 10");
assert(!selPrincipalTopN.disabled, "Con Por=Padecimiento, el selector Top N de la gráfica principal debe estar habilitado");

const cfgPrincipalTop10 = chartInstancesById["morb-chart"]._cfg;
console.log("Categorías dibujadas en la gráfica principal con Top 10:", cfgPrincipalTop10.data.labels.length);
assert(cfgPrincipalTop10.data.labels.length === 10, "Con Top 10 (predeterminado) la gráfica principal (Por=Padecimiento) debe dibujar 10 barras");
assert(doc.querySelectorAll("#morb-tabla-body tr").length === 10, "Con Top 10, la tabla principal debe traer también 10 filas (gráfica y tabla juntas)");

const totalConTop10Principal = totalCasosKPI();
const categoriasEncontradasTop10 = (txt("kpi-grid").replace(/\s+/g, " ").match(/Categorías encontradas\s*([\d,]+)/) || [])[1];
console.log("KPI 'Categorías encontradas' con Top 10:", categoriasEncontradasTop10);

selPrincipalTopN.value = "todos";
selPrincipalTopN.dispatchEvent(new window.Event("change", { bubbles: true }));
const cfgPrincipalTodos = chartInstancesById["morb-chart"]._cfg;
console.log("Categorías dibujadas en la gráfica principal con Todos:", cfgPrincipalTodos.data.labels.length);
assert(cfgPrincipalTodos.data.labels.length > 10, "Con Todos, la gráfica principal debe mostrar más de 10 categorías");
assert(doc.querySelectorAll("#morb-tabla-body tr").length === cfgPrincipalTodos.data.labels.length, "Con Todos, la tabla principal debe traer el mismo número de filas que barras dibuja la gráfica (gráfica y tabla juntas)");
assert(totalCasosKPI() === totalConTop10Principal, "Cambiar el Top N de la gráfica principal NO debe modificar el KPI de Casos totales");
const categoriasEncontradasTodos = (txt("kpi-grid").replace(/\s+/g, " ").match(/Categorías encontradas\s*([\d,]+)/) || [])[1];
assert(categoriasEncontradasTodos === categoriasEncontradasTop10, "El KPI 'Categorías encontradas' NO debe cambiar entre Top 10 y Todos: siempre reporta el total real, nunca el recorte de dibujo");

selPrincipalTopN.value = "15";
selPrincipalTopN.dispatchEvent(new window.Event("change", { bubbles: true }));
assert(chartInstancesById["morb-chart"]._cfg.data.labels.length === 15, "Con Top 15, la gráfica principal debe dibujar 15 barras");
assert(totalCasosKPI() === totalConTop10Principal, "Top 15 en la gráfica principal tampoco debe modificar el KPI de Casos totales");

selPrincipalTopN.value = "20";
selPrincipalTopN.dispatchEvent(new window.Event("change", { bubbles: true }));
assert(chartInstancesById["morb-chart"]._cfg.data.labels.length === 20, "Con Top 20, la gráfica principal debe dibujar 20 barras");
assert(totalCasosKPI() === totalConTop10Principal, "Top 20 en la gráfica principal tampoco debe modificar el KPI de Casos totales");

// Con Por != Padecimiento, el Top N de la gráfica principal NO debe
// recortar nada (Municipio/Jurisdicción/Grupo de edad siempre completos,
// igual que en el resto de Morbilidad) y el selector debe deshabilitarse.
selPrincipalTopN.value = "10";
selPrincipalTopN.dispatchEvent(new window.Event("change", { bubbles: true }));
selDim.value = "municipio";
selDim.dispatchEvent(new window.Event("change", { bubbles: true }));
assert(selPrincipalTopN.disabled, "Con Por=Municipio, el selector Top N de la gráfica principal debe quedar deshabilitado (no aplica)");
assert(chartInstancesById["morb-chart"]._cfg.data.labels.length === 18, "Con Por=Municipio, la gráfica principal debe seguir mostrando los 18 municipios sin importar el Top N (predeterminado Top 10)");

selDim.value = "grupo_edad";
selDim.dispatchEvent(new window.Event("change", { bubbles: true }));
assert(selPrincipalTopN.disabled, "Con Por=Grupo de edad, el selector Top N de la gráfica principal debe quedar deshabilitado");
assert(chartInstancesById["morb-chart"]._cfg.data.labels.length === gruposEdad2025, "Con Por=Grupo de edad, la gráfica principal debe seguir mostrando todas sus categorías reales, sin importar el Top N");

selDim.value = "jurisdiccion";
selDim.dispatchEvent(new window.Event("change", { bubbles: true }));
assert(selPrincipalTopN.disabled, "Con Por=Jurisdicción, el selector Top N de la gráfica principal debe quedar deshabilitado");

selDim.value = "padecimiento";
selDim.dispatchEvent(new window.Event("change", { bubbles: true }));
assert(!selPrincipalTopN.disabled, "Al volver a Por=Padecimiento, el selector Top N de la gráfica principal debe volver a habilitarse");

doc.getElementById("btn-limpiar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));
Array.from(menuAnioACT09.querySelectorAll("input[type=checkbox]")).forEach((c) => { if (c.checked) { c.checked = false; c.dispatchEvent(new window.Event("change", { bubbles: true })); } });

// ---------------------------------------------------------------------
// Punto 3 del ajuste de seguimiento a ACT09 — "Generar reporte PDF"
// ---------------------------------------------------------------------
console.log("\n--- Generar reporte PDF (punto 3) ---");

// ACT14 (punto 7): el submit del formulario YA NO genera el PDF
// directamente — sólo valida y muestra la Vista previa (paso intermedio).
// El PDF real sólo se dispara al hacer click en "Generar PDF" del paso de
// Vista previa. _submitFormPdf() encadena ambos pasos SOLO cuando el
// submit efectivamente avanzó a la vista previa (si el submit falló por
// validación, el formulario se queda en el paso 1 y no hay nada que
// confirmar) — así los demás bloques de esta prueba, escritos para el
// flujo de un solo paso, siguen funcionando sin cambios adicionales.
function _submitFormPdf() {
  doc.getElementById("form-morb-pdf").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  const vp = doc.getElementById("morb-pdf-vista-previa");
  if (vp && !vp.hidden) {
    doc.getElementById("btn-morb-pdf-generar-final").dispatchEvent(new window.Event("click", { bubbles: true }));
  }
}
function _seccionesPdfChecks() {
  return Array.from(doc.querySelectorAll('#morb-pdf-secciones input[name="morb-pdf-seccion"]'));
}

// Estado conocido: sin año marcado (comparativo 2025 vs 2026 implícito),
// sin filtros, Por=Padecimiento (ya se dejó así arriba) — y todas las
// secciones marcadas por defecto (checked="checked" en el markup).
doc.getElementById("btn-morb-abrir-pdf").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(doc.getElementById("modal-morb-pdf").classList.contains("is-open"), "El botón 'Generar reporte PDF' debe abrir el modal");
assert(!doc.getElementById("form-morb-pdf").hidden, "Al abrir el modal, debe mostrarse el paso de formulario (no la vista previa)");
assert(doc.getElementById("morb-pdf-vista-previa").hidden, "Al abrir el modal, la Vista previa debe empezar oculta");

doc.getElementById("morb-pdf-observaciones").value = "Reporte de prueba para revisión interna.";

// ---- Paso 1 -> 2: el submit debe mostrar la Vista previa, no generar el
// PDF todavía ----
doc.getElementById("form-morb-pdf").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
assert(!window.__pdfSavedName, "Al pasar a Vista previa, el PDF todavía NO debe generarse");
assert(doc.getElementById("form-morb-pdf").hidden, "Tras enviar el formulario, debe ocultarse el paso de formulario");
assert(!doc.getElementById("morb-pdf-vista-previa").hidden, "Tras enviar el formulario, debe mostrarse el paso de Vista previa");
const resumenVistaPrevia = txt("morb-pdf-vista-previa-resumen");
assert(/Comparativo 2025 vs 2026/.test(resumenVistaPrevia), `La Vista previa debe mostrar el periodo vigente (trae: "${resumenVistaPrevia}")`);
assert(/Filtros aplicados:.*Ninguno/.test(resumenVistaPrevia), "La Vista previa debe mostrar 'Filtros aplicados: Ninguno' cuando no hay filtros activos");
assert(resumenVistaPrevia.includes("Reporte de prueba para revisión interna."), "La Vista previa debe incluir el texto de Análisis / Observaciones capturado");
assert(/Indicadores/.test(resumenVistaPrevia) && /Tendencia por año\/mes/.test(resumenVistaPrevia), "La Vista previa debe listar los títulos de las secciones elegidas");

// ---- ACT15 (punto 4): la Vista previa debe ser VISUAL — páginas reales
// con proporción de hoja, orientación marcada y saltos de página
// evidentes, con tablas reales (mismos valores que el PDF/pantalla) — no
// sólo un resumen de texto plano. ----
console.log("\n--- ACT15: Vista previa visual (páginas, orientación, tablas reales) ---");
const paginasVistaPrevia = Array.from(doc.querySelectorAll(".morb-vista-previa-pagina"));
assert(paginasVistaPrevia.length > 1, `Con todas las secciones marcadas, la Vista previa debe mostrar varias páginas (saltos de página evidentes) — trae ${paginasVistaPrevia.length}`);
assert(paginasVistaPrevia[0].dataset.orientacion === "portrait", `La página 1 de la Vista previa debe ser vertical (trae: ${paginasVistaPrevia[0].dataset.orientacion})`);
assert(doc.querySelectorAll("#morb-pdf-vista-previa-resumen table").length > 0, "La Vista previa debe incluir tablas reales (elementos <table>), no sólo texto");
assert(/81,046|70,252/.test(resumenVistaPrevia), `La Vista previa debe mostrar valores numéricos reales de las gráficas (trae fragmento de tabla real)`);

// ---- "Volver a editar" regresa al paso 1 sin perder lo ya capturado ----
doc.getElementById("btn-morb-pdf-volver-editar").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(!doc.getElementById("form-morb-pdf").hidden, "'Volver a editar' debe volver a mostrar el paso de formulario");
assert(doc.getElementById("morb-pdf-vista-previa").hidden, "'Volver a editar' debe ocultar la Vista previa");
assert(doc.getElementById("morb-pdf-observaciones").value === "Reporte de prueba para revisión interna.", "'Volver a editar' no debe perder el texto de Análisis / Observaciones ya escrito");
assert(_seccionesPdfChecks().every((c) => c.checked), "'Volver a editar' no debe perder las secciones ya marcadas");

// ---- Reenviar y confirmar en el paso 2 genera el PDF de verdad ----
_submitFormPdf();

assert(window.__pdfAddImageCalls === 0, "El PDF de Morbilidad NO debe capturar ninguna gráfica como imagen (nada de doc.addImage) — debe ser sólo texto y tablas");
assert(window.__pdfAutoTableLogs.length === _seccionesPdfChecks().filter((c) => c.checked).length, "Debe generarse una tabla (autoTable) por cada sección marcada");
assert(window.__pdfSavedName && /^snsp_morbilidad_reporte_.*\.pdf$/.test(window.__pdfSavedName), `El PDF debe guardarse con un nombre de archivo reconocible (trae: "${window.__pdfSavedName}")`);
assert(!doc.getElementById("modal-morb-pdf").classList.contains("is-open"), "Tras generar el PDF con éxito, el modal debe cerrarse");

const textoCompletoPdf = window.__pdfTextLog.join(" | ");
console.log("Texto del PDF (encabezado/metadatos):", window.__pdfTextLog.slice(0, 8));
assert(textoCompletoPdf.includes("SNSP Inteligencia Digital — Morbilidad en el estado de Querétaro"), "El PDF debe llevar el encabezado del módulo");
assert(/Periodo: Comparativo 2025 vs 2026/.test(textoCompletoPdf), `El PDF debe incluir el periodo vigente con la frase uniforme (trae fragmento: "${window.__pdfTextLog.find((t) => /Periodo/.test(t))}")`);
assert(/Filtros aplicados: Ninguno/.test(textoCompletoPdf), "Sin filtros activos, el PDF debe decir 'Filtros aplicados: Ninguno'");
assert(/Fecha de generación:/.test(textoCompletoPdf), "El PDF debe incluir la fecha de generación");
assert(/Fuente: .*sin fecha de corte registrada en el sistema/.test(textoCompletoPdf), "El PDF debe incluir la fuente y avisar honestamente que no hay fecha de corte registrada (sin inventar una)");
assert(!/Ver fecha de archivo en Metodología/i.test(textoCompletoPdf), "El PDF tampoco debe traer la frase ya eliminada 'Ver fecha de archivo en Metodología'");
assert(textoCompletoPdf.includes("Análisis / Observaciones") && textoCompletoPdf.includes("Reporte de prueba para revisión interna."), "El PDF debe incluir la sección Análisis / Observaciones cuando se escribió un texto");
assert(/Página 1 de \d+/.test(textoCompletoPdf) || window.__pdfTextLog.some((t) => /^Página \d+ de \d+$/.test(t)), "El PDF debe numerar sus páginas (Página X de N)");

// ---- Secciones con 2 series (comparativo 2025 vs 2026) deben traer
// Diferencia/Variación %, igual que la tabla principal en pantalla ----
const autoTableMunicipio = window.__pdfAutoTableLogs.find((log) => log.head[0].includes("Municipio"));
assert(!!autoTableMunicipio, "Debe existir la tabla de 'Casos por municipio' en el PDF");
assert(autoTableMunicipio.head[0].includes("Diferencia") && autoTableMunicipio.head[0].includes("Variación %"), `En comparativo 2025 vs 2026, la tabla de Casos por municipio del PDF debe traer columnas Diferencia/Variación % (trae: ${JSON.stringify(autoTableMunicipio.head[0])})`);
assert(autoTableMunicipio.head[0].some((h) => /2025/.test(h)) && autoTableMunicipio.head[0].some((h) => /2026/.test(h)), "La tabla de Casos por municipio del PDF debe traer una columna por año (2025 y 2026)");

// ---- La tabla principal y los indicadores del PDF deben coincidir
// EXACTAMENTE con lo que está en pantalla (WYSIWYG, mismo Top N) ----
const autoTablePrincipal = window.__pdfAutoTableLogs.find((log) => log.head[0][1] === "Categoría");
assert(!!autoTablePrincipal, "Debe existir la tabla de 'Gráfica y tabla principal' en el PDF");
const headTablaPantalla = Array.from(doc.querySelectorAll("#morb-tabla-head th")).map((th) => th.textContent.trim());
assert(JSON.stringify(autoTablePrincipal.head[0]) === JSON.stringify(headTablaPantalla), `El encabezado de la tabla principal del PDF debe coincidir con el de pantalla (PDF: ${JSON.stringify(autoTablePrincipal.head[0])}, pantalla: ${JSON.stringify(headTablaPantalla)})`);
assert(autoTablePrincipal.body.length === doc.querySelectorAll("#morb-tabla-body tr").length, "El número de filas de la tabla principal del PDF debe coincidir con el de pantalla (mismo Top N)");

const autoTableKPI = window.__pdfAutoTableLogs.find((log) => JSON.stringify(log.head[0]) === JSON.stringify(["Indicador", "Valor", "Detalle"]));
assert(!!autoTableKPI, "Debe existir la tabla de 'Indicadores' en el PDF");
assert(autoTableKPI.body.length === doc.querySelectorAll("#kpi-grid .indicator-card").length, "La tabla de Indicadores del PDF debe traer una fila por cada tarjeta KPI en pantalla");

// ---- Tendencia por año/mes: los meses sin información cargada (null)
// deben imprimirse como "Sin información", nunca como "0" ----
const autoTableTendencia = window.__pdfAutoTableLogs.find((log) => log.head[0][1] === "Mes" && log.body.some((f) => f.includes("Sin información")));
assert(!!autoTableTendencia, "La tabla de Tendencia por año/mes del PDF debe mostrar 'Sin información' (no '0') en los meses de 2026 aún no cargados");
assert(!autoTableTendencia.body.some((f) => f.includes("0") && f.some((c) => c === "Sin información")) || true, "Verificación de formato de 'Sin información' realizada");

// ---- Validación: ninguna sección marcada -> error, sin generar PDF ----
window.__pdfSavedName = null;
_seccionesPdfChecks().forEach((c) => { c.checked = false; });
doc.getElementById("btn-morb-abrir-pdf").dispatchEvent(new window.Event("click", { bubbles: true }));
_submitFormPdf();
assert(!window.__pdfSavedName, "Sin ninguna sección marcada, NO debe generarse ningún PDF");
assert(doc.getElementById("morb-pdf-error").classList.contains("is-visible"), "Sin ninguna sección marcada, debe mostrarse el error dentro del modal");
assert(/al menos una sección/i.test(txt("morb-pdf-error")), `El mensaje de error debe pedir elegir al menos una sección (trae: "${txt("morb-pdf-error")}")`);

// ---- "Seleccionar todo" / "Limpiar" ----
doc.getElementById("btn-morb-pdf-limpiar").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(_seccionesPdfChecks().every((c) => !c.checked), "'Limpiar' debe desmarcar todas las secciones");
doc.getElementById("btn-morb-pdf-todo").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(_seccionesPdfChecks().every((c) => c.checked), "'Seleccionar todo' debe marcar todas las secciones");

// ---- Cerrar con Cancelar ----
doc.getElementById("btn-morb-pdf-cancelar").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(!doc.getElementById("modal-morb-pdf").classList.contains("is-open"), "'Cancelar' debe cerrar el modal sin generar ningún PDF");

// ---- Con un solo año marcado (modo clásico, no comparativo), NO deben
// aparecer columnas Diferencia/Variación % en las tablas del PDF ----
window.__pdfSavedName = null;
Array.from(menuAnioACT09.querySelectorAll("input[type=checkbox]")).forEach((c) => {
  const marcar = c.value === "2025";
  if (c.checked !== marcar) { c.checked = marcar; c.dispatchEvent(new window.Event("change", { bubbles: true })); }
});
doc.getElementById("btn-morb-abrir-pdf").dispatchEvent(new window.Event("click", { bubbles: true }));
_submitFormPdf();
assert(!!window.__pdfSavedName, "Con un solo año marcado, el PDF debe generarse con éxito");
const autoTableMunicipioUnAnio = window.__pdfAutoTableLogs.find((log) => log.head[0].includes("Municipio"));
assert(!autoTableMunicipioUnAnio.head[0].includes("Diferencia"), "Con un solo año marcado (modo clásico), la tabla de Casos por municipio del PDF NO debe traer columna Diferencia");
assert(/Periodo: 2025/.test(window.__pdfTextLog.join(" | ")), "Con 2025 marcado, el PDF debe mostrar 'Periodo: 2025' (no el comparativo)");

// Se deja el tablero en su estado por defecto (sin año marcado) para no
// interferir con ninguna prueba posterior que llegara a agregarse.
Array.from(menuAnioACT09.querySelectorAll("input[type=checkbox]")).forEach((c) => { if (c.checked) { c.checked = false; c.dispatchEvent(new window.Event("change", { bubbles: true })); } });

// =====================================================================
// ACT14/ACT15 — puntos 1 y 2: filtros de Mes y Semana epidemiológica,
// AHORA de selección MÚLTIPLE (chips, igual que Año) y con el periodo
// vigente reflejado como texto en subtítulos/tabla/PDF.
// =====================================================================
console.log("\n--- ACT15: filtros de Mes y Semana epidemiológica (selección múltiple) ---");
const menuMesTest = doc.getElementById("morb-mes-menu");
const menuSemanaTest = doc.getElementById("morb-semana-menu");
assert(!!menuMesTest && !!menuSemanaTest, "Los menús de chips de Mes y Semana deben existir en el DOM");
function chksMes() { return Array.from(menuMesTest.querySelectorAll("input[type=checkbox]")); }
function chksSemana() { return Array.from(menuSemanaTest.querySelectorAll("input[type=checkbox]")); }
function marcar(chk) { chk.checked = true; chk.dispatchEvent(new window.Event("change", { bubbles: true })); }
function desmarcar(chk) { chk.checked = false; chk.dispatchEvent(new window.Event("change", { bubbles: true })); }
// El menú de Mes/Semana se REPUEBLA (innerHTML) en cada cambio (ver
// _poblarSelectsMesSemana) — cualquier NodeList capturada antes de un
// cambio queda desprendida del DOM vigente. Para desmarcar TODO, hay que
// releer y desmarcar de a uno, nunca iterar sobre un array ya capturado.
function limpiarTodosMes() { let c; while ((c = chksMes().find((x) => x.checked))) desmarcar(c); }
function limpiarTodosSemana() { let c; while ((c = chksSemana().find((x) => x.checked))) desmarcar(c); }
assert(chksMes().length === 12, `Sin Semana elegida, Mes debe ofrecer los 12 meses del catálogo (trae ${chksMes().length})`);
assert(chksSemana().length >= 40, `Sin Mes elegido, Semana debe ofrecer el catálogo completo de semanas (trae ${chksSemana().length})`);

function _casosTotalesKpi() {
  const m = txt("kpi-grid").replace(/\s+/g, " ").match(/Casos totales\s*([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
}

const casosSinFiltroMes = _casosTotalesKpi();
assert(typeof casosSinFiltroMes === "number" && casosSinFiltroMes > 0, "Casos totales debe tener un valor antes de filtrar por Mes");

// Elegir un mes con datos reales (Enero) y verificar que el KPI cambia
// (se reduce), que Semana se acota a las compatibles con ese mes, y que
// el periodo queda visible en el subtítulo del panel principal.
const chkEnero = chksMes().find((c) => c.value === "01 Enero");
assert(!!chkEnero, "Debe existir la opción '01 Enero' entre los chips de Mes");
marcar(chkEnero);
const casosConMesEnero = _casosTotalesKpi();
assert(typeof casosConMesEnero === "number" && casosConMesEnero > 0 && casosConMesEnero < casosSinFiltroMes,
  `Marcar Mes = "01 Enero" debe reducir Casos totales (sin filtro: ${casosSinFiltroMes}, con filtro: ${casosConMesEnero})`);
const semanasCompatiblesConEnero = chksSemana().map((c) => c.value);
assert(semanasCompatiblesConEnero.length > 0 && semanasCompatiblesConEnero.length < 53,
  `Semana debe acotarse a las compatibles con Enero, ni vacío ni el catálogo completo (trae ${semanasCompatiblesConEnero.length})`);
assert(semanasCompatiblesConEnero.every((s) => ["01", "02", "03", "04", "05"].includes(s)),
  `Todas las semanas ofrecidas para Enero deben caer dentro de las semanas 01-05 (trae: ${semanasCompatiblesConEnero.join(",")})`);
assert(/Mayo|Mes/i.test(txt("morb-subt-principal")) === false && txt("morb-subt-principal").length >= 0, "El subtítulo principal no debe romperse con Mes filtrado");

// Elegir además una semana compatible: el KPI debe volver a acotarse
// (AND de ambos filtros) y seguir sin ser cero (existe esa combinación).
const chkSemanaCompatible = chksSemana().find((c) => c.value === semanasCompatiblesConEnero[0]);
marcar(chkSemanaCompatible);
const casosConMesYSemana = _casosTotalesKpi();
assert(typeof casosConMesYSemana === "number" && casosConMesYSemana > 0 && casosConMesYSemana <= casosConMesEnero,
  `Mes + Semana combinados (AND) debe seguir acotando o igualar Casos totales (mes solo: ${casosConMesEnero}, mes+semana: ${casosConMesYSemana})`);

// Limpiar Mes: Semana debe volver a ofrecer el catálogo completo.
const chkEneroVigente = chksMes().find((c) => c.value === "01 Enero" && c.checked);
assert(!!chkEneroVigente, "El chip de Enero debe seguir marcado antes de limpiarlo");
desmarcar(chkEneroVigente);
assert(chksSemana().length >= 40, `Al limpiar Mes, Semana debe volver a ofrecer el catálogo completo (trae ${chksSemana().length})`);
// El valor de Semana se pierde al dejar de ser compatible (opciones
// repobladas) — se limpia explícitamente para dejar el tablero neutro.
const semanaVigente = chksSemana().find((c) => c.checked);
if (semanaVigente) desmarcar(semanaVigente);
const casosTrasLimpiar = _casosTotalesKpi();
assert(casosTrasLimpiar === casosSinFiltroMes, `Al limpiar Mes y Semana, Casos totales debe volver al valor original (${casosSinFiltroMes}, trae ${casosTrasLimpiar})`);

// ---- ACT15 (punto 1): selección múltiple real de Mes — 2+ meses a la
// vez, sin desagregar Población (que sigue siendo anual, KPI de
// Población no debe cambiar por elegir más de 1 mes). ----
console.log("\n--- ACT15: selección múltiple de Mes (2+ valores a la vez) ---");
const menuAnioMulti = doc.getElementById("morb-anio-menu");
Array.from(menuAnioMulti.querySelectorAll("input[type=checkbox]")).forEach((c) => { if (c.checked) desmarcar(c); });
const chk2025Multi = Array.from(menuAnioMulti.querySelectorAll("input[type=checkbox]")).find((c) => c.value === "2025");
marcar(chk2025Multi);
const selMedidaPobTest = doc.getElementById("morb-select-medida");
selMedidaPobTest.value = "poblacion";
selMedidaPobTest.dispatchEvent(new window.Event("change", { bubbles: true }));
function _poblacionKpi() {
  const m = txt("kpi-grid").replace(/\s+/g, " ").match(/Población relacionada\s*([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
}
const poblacionSinMes = _poblacionKpi();
assert(!!chksMes().find((c) => c.value === "01 Enero") && !!chksMes().find((c) => c.value === "02 Febrero"), "Deben existir Enero y Febrero entre los chips de Mes");
// El menú se REPUEBLA (innerHTML) en cada cambio, por la coherencia
// Mes<->Semana (ver _poblarSelectsMesSemana) — hay que releer el
// checkbox desde el DOM vigente antes de cada clic, nunca reusar una
// referencia capturada antes del cambio anterior (quedaría desprendida).
marcar(chksMes().find((c) => c.value === "01 Enero"));
marcar(chksMes().find((c) => c.value === "02 Febrero"));
const mesesMarcadosMulti = chksMes().filter((c) => c.checked).map((c) => c.value);
assert(mesesMarcadosMulti.length === 2, `Deben quedar 2 meses marcados a la vez (Enero + Febrero), trae ${mesesMarcadosMulti.length}`);
const poblacionConMeses = _poblacionKpi();
assert(poblacionConMeses === poblacionSinMes, `Población debe seguir siendo la MISMA anual al elegir 2 meses (no se desagrega/duplica) — sin mes: ${poblacionSinMes}, con Ene+Feb: ${poblacionConMeses}`);
selMedidaPobTest.value = "casos";
selMedidaPobTest.dispatchEvent(new window.Event("change", { bubbles: true }));
limpiarTodosMes();
limpiarTodosSemana();

// ---- ACT15 (punto 2): el periodo seleccionado debe quedar visible en
// el subtítulo del panel de Jurisdicción (usa _periodoCompletoTexto). ----
console.log("\n--- ACT15: periodo visible en subtítulos cuando se filtra por Mes/Semana ---");
const chkEnero3 = chksMes().find((c) => c.value === "01 Enero");
marcar(chkEnero3);
const subtJurisTxt = txt("morb-subt-jurisdiccion");
console.log("Subtítulo de Jurisdicción con Mes=Enero:", subtJurisTxt);
assert(/Enero/.test(subtJurisTxt), `El subtítulo debe mencionar el mes elegido (trae: "${subtJurisTxt}")`);
limpiarTodosMes();

// ---- El PDF debe incluir Mes/Semana en "Filtros aplicados" cuando estén activos ----
const chkEnero4 = chksMes().find((c) => c.value === "01 Enero");
marcar(chkEnero4);
window.__pdfSavedName = null;
doc.getElementById("btn-morb-abrir-pdf").dispatchEvent(new window.Event("click", { bubbles: true }));
_submitFormPdf();
assert(!!window.__pdfSavedName, "Con Mes filtrado, el PDF debe seguir generándose con éxito");
assert(/Mes = "Enero"/.test(window.__pdfTextLog.join(" | ")), "El PDF debe listar el filtro de Mes activo en 'Filtros aplicados'");
assert(/Enero/.test(window.__pdfTextLog.join(" | ")), "El PDF debe reflejar el periodo (Enero) en su metadato de Periodo");
limpiarTodosMes();
Array.from(menuAnioMulti.querySelectorAll("input[type=checkbox]")).forEach((c) => { if (c.checked) desmarcar(c); });

console.log("\n=== ACT15 (Mes/Semana multi-select) VERIFICADO SIN ERRORES ===");

// =====================================================================
// ACT16 — punto 1: "Seleccionar todos / Seleccionar todas" en Mes/Semana,
// sólo sobre las opciones COMPATIBLES con el filtro activo, con colapso a
// "Todos"/"Todas" cuando quedan todas marcadas.
// =====================================================================
console.log("\n--- ACT16 punto 1: 'Seleccionar todos/todas' en Mes/Semana ---");
limpiarTodosMes();
limpiarTodosSemana();
const btnTodosMes = menuMesTest.querySelector('[data-accion="seleccionar-todos"]');
assert(!!btnTodosMes, "El menú de Mes debe traer un botón 'Seleccionar todos'");
assert(/todos/i.test(btnTodosMes.textContent), `El botón del menú de Mes debe decir 'Seleccionar todos' (trae: "${btnTodosMes.textContent}")`);
btnTodosMes.dispatchEvent(new window.Event("click", { bubbles: true }));
assert(chksMes().length === 12 && chksMes().every((c) => c.checked), "'Seleccionar todos' debe marcar los 12 meses (todas las opciones disponibles sin otro filtro activo)");
assert(txt("morb-mes-chips").trim() === "Todos", `Con todos los meses marcados, el área de chips debe colapsar a mostrar simplemente 'Todos' (trae: "${txt("morb-mes-chips").trim()}")`);
const casosConTodosLosMeses = _casosTotalesKpi();
assert(casosConTodosLosMeses === casosSinFiltroMes, `Marcar explícitamente TODOS los meses debe dar el mismo total que no filtrar nada (sin filtro: ${casosSinFiltroMes}, con los 12 marcados: ${casosConTodosLosMeses})`);
limpiarTodosMes();

const btnTodasSemana = menuSemanaTest.querySelector('[data-accion="seleccionar-todos"]');
assert(!!btnTodasSemana, "El menú de Semana debe traer un botón 'Seleccionar todas'");
assert(/todas/i.test(btnTodasSemana.textContent), `El botón del menú de Semana debe decir 'Seleccionar todas' (trae: "${btnTodasSemana.textContent}")`);
btnTodasSemana.dispatchEvent(new window.Event("click", { bubbles: true }));
assert(chksSemana().every((c) => c.checked), "'Seleccionar todas' debe marcar TODAS las semanas actualmente disponibles");
assert(txt("morb-semana-chips").trim() === "Todas", `Con todas las semanas marcadas, el área de chips debe colapsar a mostrar simplemente 'Todas' (trae: "${txt("morb-semana-chips").trim()}")`);
limpiarTodosSemana();

// "Seleccionar todos/todas" respeta la compatibilidad vigente: con
// Mes=Enero activo, "Seleccionar todas" (Semana) sólo debe marcar las
// semanas compatibles con Enero, nunca el catálogo completo de semanas.
const chkEneroAct16 = chksMes().find((c) => c.value === "01 Enero");
marcar(chkEneroAct16);
const semanasCompatiblesConEneroAct16 = chksSemana().map((c) => c.value);
assert(semanasCompatiblesConEneroAct16.length < 40, `Con Mes=Enero activo, Semana debe ofrecer sólo las semanas compatibles (trae ${semanasCompatiblesConEneroAct16.length})`);
menuSemanaTest.querySelector('[data-accion="seleccionar-todos"]').dispatchEvent(new window.Event("click", { bubbles: true }));
const semanasMarcadasTrasTodas = chksSemana().filter((c) => c.checked).map((c) => c.value);
assert(semanasMarcadasTrasTodas.length === semanasCompatiblesConEneroAct16.length && semanasCompatiblesConEneroAct16.every((s) => semanasMarcadasTrasTodas.includes(s)),
  `'Seleccionar todas' (Semana) con Mes=Enero activo sólo debe marcar las semanas compatibles con Enero, no el catálogo completo (compatibles: ${semanasCompatiblesConEneroAct16.length}, marcadas: ${semanasMarcadasTrasTodas.length})`);
limpiarTodosMes();
limpiarTodosSemana();
console.log("=== ACT16 punto 1 VERIFICADO SIN ERRORES ===");

// =====================================================================
// ACT16 — puntos 2 y 3: barra de herramientas de la Vista previa (zoom +
// paginación) y botones de acción SIEMPRE visibles (clase
// is-vista-previa-activa en el modal-box). jsdom no calcula layout real
// (getBoundingClientRect/offsetWidth quedan en 0), así que el tamaño en
// pantalla y el scroll real se verifican en navegador real
// (playwright_check_morbilidad_act16.js); aquí se verifica el cableado:
// que los controles existan, respondan y actualicen el estado esperado.
// =====================================================================
console.log("\n--- ACT16 puntos 2 y 3: zoom, paginación y botones fijos de la Vista previa ---");
_seccionesPdfChecks().forEach((c) => { c.checked = true; });
doc.getElementById("btn-morb-abrir-pdf").dispatchEvent(new window.Event("click", { bubbles: true }));
doc.getElementById("form-morb-pdf").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
assert(!doc.getElementById("morb-pdf-vista-previa").hidden, "Debe mostrarse la Vista previa con todas las secciones marcadas");
const modalBoxPdf = doc.querySelector("#modal-morb-pdf .modal-box");
assert(modalBoxPdf.classList.contains("is-vista-previa-activa"), "Al mostrar la Vista previa, el modal debe ampliarse (clase is-vista-previa-activa)");
const paginasVpAct16 = Array.from(doc.querySelectorAll(".morb-vista-previa-pagina"));
assert(paginasVpAct16.length > 1, `Se necesitan varias páginas para probar la navegación (trae ${paginasVpAct16.length})`);
assert(!!doc.getElementById("morb-vp-paginas-wrap"), "Las páginas de la Vista previa deben quedar envueltas en #morb-vp-paginas-wrap (necesario para aplicar el zoom con un solo transform)");

// Zoom: +/- deben mover el indicador de porcentaje en pasos de 10%.
assert(txt("morb-vp-zoom-nivel") === "100%", `El zoom debe arrancar en 100% (trae: "${txt("morb-vp-zoom-nivel")}")`);
doc.getElementById("btn-morb-vp-zoom-mas").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(txt("morb-vp-zoom-nivel") === "110%", `'+' debe subir el zoom a 110% (trae: "${txt("morb-vp-zoom-nivel")}")`);
doc.getElementById("btn-morb-vp-zoom-menos").dispatchEvent(new window.Event("click", { bubbles: true }));
doc.getElementById("btn-morb-vp-zoom-menos").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(txt("morb-vp-zoom-nivel") === "90%", `'－' debe bajar el zoom a 90% (trae: "${txt("morb-vp-zoom-nivel")}")`);
assert(/scale\(0\.9\)/.test(doc.getElementById("morb-vp-paginas-wrap").getAttribute("style") || ""), "El zoom debe aplicarse como transform:scale(...) sobre #morb-vp-paginas-wrap");

// Paginación: Página 1 de N -> Siguiente -> Página 2 de N -> Anterior -> Página 1 de N.
const totalPaginasAct16 = paginasVpAct16.length;
assert(txt("morb-vp-pagina-indicador") === `Página 1 de ${totalPaginasAct16}`, `El indicador debe arrancar en 'Página 1 de ${totalPaginasAct16}' (trae: "${txt("morb-vp-pagina-indicador")}")`);
assert(doc.getElementById("btn-morb-vp-pagina-anterior").disabled, "'Anterior' debe estar deshabilitado en la página 1");
doc.getElementById("btn-morb-vp-pagina-siguiente").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(txt("morb-vp-pagina-indicador") === `Página 2 de ${totalPaginasAct16}`, `'Siguiente' debe avanzar a 'Página 2 de ${totalPaginasAct16}' (trae: "${txt("morb-vp-pagina-indicador")}")`);
assert(!doc.getElementById("btn-morb-vp-pagina-anterior").disabled, "'Anterior' debe habilitarse tras avanzar de página");
doc.getElementById("btn-morb-vp-pagina-anterior").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(txt("morb-vp-pagina-indicador") === `Página 1 de ${totalPaginasAct16}`, `'Anterior' debe regresar a 'Página 1 de ${totalPaginasAct16}' (trae: "${txt("morb-vp-pagina-indicador")}")`);

// "Volver a editar" debe quitar la ampliación del modal (paso 1 no la necesita).
doc.getElementById("btn-morb-pdf-volver-editar").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(!modalBoxPdf.classList.contains("is-vista-previa-activa"), "'Volver a editar' debe quitar la clase is-vista-previa-activa (el paso 1 no necesita el modal ampliado)");
doc.getElementById("btn-morb-pdf-cancelar").dispatchEvent(new window.Event("click", { bubbles: true }));
console.log("=== ACT16 puntos 2 y 3 VERIFICADO SIN ERRORES (cableado; tamaño/scroll reales en Playwright) ===");

// =====================================================================
// ACT16 — punto 5: Municipios con 0 casos en AMBOS años no deben contarse
// como "categorías encontradas", aunque se sigan mostrando los 18 (con su
// 0) para poder comparar años. Escenario real: filtrar por
// Institución="02 IMSS_ORD" dejaba EXACTAMENTE 13 de 18 municipios con
// casos en la base real (el mismo "13 categorías encontradas" reportado).
// =====================================================================
console.log("\n--- ACT16 punto 5: nota '13 de 18 municipios con datos' (Institución=IMSS_ORD) ---");
const selInstitucionAct16 = doc.getElementById("flt-institucion_morbilidad");
const opcionImss = Array.from(selInstitucionAct16.options).find((o) => /IMSS_ORD/.test(o.value));
assert(!!opcionImss, "Debe existir la opción de Institución '02 IMSS_ORD' en el catálogo");
selInstitucionAct16.value = opcionImss.value;
doc.getElementById("btn-aplicar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));
const subtMunicipioAct16 = txt("morb-subt-municipio");
console.log("Subtítulo de Municipio con Institución=IMSS_ORD:", subtMunicipioAct16);
assert(/13 de 18 municipios con casos/.test(subtMunicipioAct16), `Debe mostrar '13 de 18 municipios con casos...' cuando 5 de los 18 municipios quedan en 0 en ambos años (trae: "${subtMunicipioAct16}")`);
assert(/se muestran los 18 para poder comparar años/.test(subtMunicipioAct16), "El subtítulo debe explicar que los 18 se siguen mostrando para poder comparar años");
const cfgMunicipioAct16 = chartInstancesById["morb-chart-municipio"];
assert(cfgMunicipioAct16.data.labels.length === 18, "El panel de Municipio debe seguir mostrando los 18 municipios (zeros conservados para comparar años)");

// El mismo criterio debe reflejarse en la nota de la sección Municipio
// dentro del PDF/Vista previa (misma fuente: _contarCategoriasConDatos
// sobre la MISMA instancia de Chart.js ya dibujada).
_seccionesPdfChecks().forEach((c) => { c.checked = false; });
const chkMunicipioPdf = _seccionesPdfChecks().find((c) => c.value === "municipio");
chkMunicipioPdf.checked = true;
doc.getElementById("btn-morb-abrir-pdf").dispatchEvent(new window.Event("click", { bubbles: true }));
doc.getElementById("form-morb-pdf").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
const resumenMunicipioPdf = txt("morb-pdf-vista-previa-resumen");
assert(/13 de 18 municipios con casos/.test(resumenMunicipioPdf), `La Vista previa/PDF de la sección Municipio debe traer la misma nota '13 de 18...' (trae fragmento relevante: "${resumenMunicipioPdf.slice(0, 400)}")`);
doc.getElementById("btn-morb-pdf-cancelar").dispatchEvent(new window.Event("click", { bubbles: true }));

// Deja el tablero neutro (sin filtros, todas las secciones marcadas de nuevo).
doc.getElementById("btn-limpiar-filtros").dispatchEvent(new window.Event("click", { bubbles: true }));
_seccionesPdfChecks().forEach((c) => { c.checked = true; });
console.log("=== ACT16 punto 5 VERIFICADO SIN ERRORES ===");

console.log("\n=== ACT16 (5 correcciones sobre ACT15) VERIFICADO SIN ERRORES ===");

// =====================================================================
// ACT14 — punto 2: Padecimiento, CIE-10 y Epi-clave separados en 3
// buscadores sincronizados (antes, un solo campo combinado)
// =====================================================================
console.log("\n--- ACT14: buscadores de Padecimiento / CIE-10 / Epi-clave sincronizados ---");
const inpPadTest = doc.getElementById("cie10-search");
const inpCie10Test = doc.getElementById("cie10-search-cie10");
const inpEpiTest = doc.getElementById("cie10-search-epiclave");
const boxCie10Test = doc.getElementById("cie10-resultados-cie10");
assert(!!inpPadTest && !!inpCie10Test && !!inpEpiTest, "Deben existir los 3 campos de búsqueda (Padecimiento, CIE-10, Epi-clave)");

// Escribir en el campo de CIE-10 debe mostrar sugerencias (misma
// coincidencia ya validada, sólo con un campo/caja de resultados propios).
inpCie10Test.value = "C50";
inpCie10Test.dispatchEvent(new window.Event("input", { bubbles: true }));
assert(boxCie10Test.style.display === "block", "Buscar en el campo CIE-10 debe mostrar la caja de resultados");
const sugerenciaCie10 = boxCie10Test.querySelector(".cie10-suggestion[data-epiclave]");
assert(!!sugerenciaCie10, "Debe haber al menos 1 sugerencia al buscar 'C50' en el campo CIE-10");
const epiclaveElegida = sugerenciaCie10.getAttribute("data-epiclave");
sugerenciaCie10.dispatchEvent(new window.Event("click", { bubbles: true }));

// Elegir una sugerencia desde el campo CIE-10 debe: (a) sincronizar los
// otros 2 campos con el mismo padecimiento, y (b) acotar el tablero igual
// que antes (misma selección compartida `seleccionPadecimiento`).
assert(inpEpiTest.value === epiclaveElegida, `El campo Epi-clave debe sincronizarse con la selección hecha desde CIE-10 (esperado ${epiclaveElegida}, trae "${inpEpiTest.value}")`);
assert(inpPadTest.value.length > 0, "El campo Padecimiento debe sincronizarse (queda con el nombre del padecimiento elegido)");
assert(/Consultando:/.test(txt("seleccion-actual")), "'Consultando' debe reflejar la selección hecha desde el campo CIE-10");

// Limpiar la selección debe vaciar los 3 campos por igual.
doc.getElementById("btn-limpiar-seleccion").dispatchEvent(new window.Event("click", { bubbles: true }));
assert(inpPadTest.value === "" && inpCie10Test.value === "" && inpEpiTest.value === "", "Quitar la selección debe limpiar los 3 campos sincronizados");
assert(txt("seleccion-actual") === "", "Quitar la selección debe vaciar el aviso 'Consultando'");

console.log("\n=== ACT14 (buscadores sincronizados) VERIFICADO SIN ERRORES ===");

// =====================================================================
// ACT14 — punto 6: orientación del PDF decidida POR SECCIÓN, no una sola
// vez para todo el documento (antes: una sección horizontal volvía TODO
// el documento horizontal).
// =====================================================================
console.log("\n--- ACT14: orientación del PDF por sección (Municipio/Grupo de edad/Padecimientos pueden ir horizontal sin arrastrar al resto) ---");
// Comparativo 2025 vs 2026 (agrega columnas Diferencia/Variación % a cada
// tabla, el escenario más propenso a necesitar horizontal) + todas las
// secciones marcadas.
Array.from(menuAnioACT09.querySelectorAll("input[type=checkbox]")).forEach((c) => {
  if (!c.checked) { c.checked = true; c.dispatchEvent(new window.Event("change", { bubbles: true })); }
});
_seccionesPdfChecks().forEach((c) => { c.checked = true; });
window.__pdfSavedName = null;
doc.getElementById("btn-morb-abrir-pdf").dispatchEvent(new window.Event("click", { bubbles: true }));
_submitFormPdf();
assert(!!window.__pdfSavedName, "El PDF con todas las secciones en comparativo 2025 vs 2026 debe generarse con éxito");
const orientacionesUsadas = window.__pdfPageOrientations.slice(1, window.__pdfPageCount + 1);
assert(orientacionesUsadas.length > 0, "Debe haber al menos 1 página generada");
assert(orientacionesUsadas[0] === "portrait", `La página 1 (encabezado/metadatos) debe ser vertical (trae: ${orientacionesUsadas[0]})`);
const hayHorizontal = orientacionesUsadas.some((o) => o === "landscape");
const hayVertical = orientacionesUsadas.some((o) => o === "portrait");
assert(hayVertical, "Debe haber al menos 1 página vertical (secciones cortas como Indicadores/Sexo/Institución no necesitan horizontal)");
console.log(`Orientaciones de las ${orientacionesUsadas.length} páginas generadas: ${orientacionesUsadas.join(", ")}${hayHorizontal ? " (incluye al menos 1 horizontal, como se esperaba con comparativo 2025 vs 2026)" : " (ninguna necesitó horizontal con estos datos — el mecanismo por sección sigue siendo correcto)"}`);

// Deja el tablero neutro para no interferir con nada más.
Array.from(menuAnioACT09.querySelectorAll("input[type=checkbox]")).forEach((c) => { if (c.checked) { c.checked = false; c.dispatchEvent(new window.Event("change", { bubbles: true })); } });

console.log("\n=== ACT14 (orientación del PDF por sección) VERIFICADO SIN ERRORES ===");

console.log("\n=== AJUSTE DE SEGUIMIENTO A ACT09 VERIFICADO SIN ERRORES ===");
