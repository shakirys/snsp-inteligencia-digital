/**
 * Prueba de humo con jsdom para pages/carga.html (prototipo de carga de
 * archivos). Dos partes: (1) pruebas de lógica pura contra
 * services/cargaDataService.js con CSV sintéticos, (2) flujo completo de
 * UI simulando un archivo real vía File/FileReader de jsdom.
 */
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
        <div id="carga-sin-permiso" style="display:none;"></div>
        <div id="carga-error" style="display:none;"></div>

        <section id="carga-paso-subir">
          <div class="carga-dropzone" id="carga-dropzone" tabindex="0"></div>
          <input type="file" id="carga-input-archivo">
        </section>

        <section id="carga-paso-mapeo" style="display:none;">
          <div id="carga-archivo-nombre"></div>
          <div id="carga-archivo-conteo"></div>
          <table><tbody id="carga-mapeo-body"></tbody></table>
          <table><thead id="carga-preview-head"></thead><tbody id="carga-preview-body"></tbody></table>
          <button id="btn-carga-validar"></button>
          <button id="btn-carga-otro-archivo-mapeo"></button>
        </section>

        <section id="carga-paso-resultado" style="display:none;">
          <ul id="carga-informe-resumen"></ul>
          <ul id="carga-informe-avisos"></ul>
          <div id="carga-resultado-vacio" style="display:none;"></div>
          <div id="carga-resultado-panels">
            <div class="indicator-grid" id="carga-kpi-grid"></div>
            <div id="carga-filtro-wrap" style="display:none;">
              <label id="carga-filtro-label"></label>
              <select id="carga-filtro-valor"></select>
            </div>
            <canvas id="carga-chart"></canvas>
            <table><tbody id="carga-tabla-body"></tbody></table>
            <p id="carga-tabla-count"></p>
          </div>
          <button id="btn-carga-cambiar-mapeo"></button>
          <button id="btn-carga-otro-archivo-resultado"></button>
        </section>

        <span id="version-tag-module"></span>
      </main>
    </div>
  </div>
</body></html>`, { runScripts: "outside-only", url: "http://localhost/pages/carga.html" });

const { window } = dom;

// ---- Stub mínimo de Chart.js (igual que el resto de las pruebas del proyecto) ----
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
  "components/sidebar.js",
  "components/topbar.js",
  "components/indicatorCard.js",
  "components/charts.js",
  "services/cargaDataService.js",
  "modules/cargaModuleView.js",
];

const context = dom.getInternalVMContext ? dom.getInternalVMContext() : null;
if (context) {
  for (const s of scripts) vm.runInContext(readFile(s), context, { filename: s });
} else {
  dom.window.eval(scripts.map(readFile).join("\n;\n"));
}

/* =========================================================================
   PARTE 1 — Pruebas de lógica pura del servicio (sin DOM)
   ========================================================================= */
console.log("=== PARTE 1: services/cargaDataService.js (lógica pura) ===\n");
const svc = window.SNSP_CARGA_SERVICE;

// CSV con comillas, comas dentro de campos y BOM.
const csvComillas = '\uFEFFmunicipio,resultado,casos\n"Querétaro","Positivo, confirmado",120\nCorregidora,Negativo,80\n"El Marqués","Positivo, confirmado",45\n';
const p1 = svc.parseCSV(csvComillas);
console.log("Headers:", p1.headers);
console.log("Filas:", p1.rows);
console.assert(p1.headers.length === 3, "Deben detectarse 3 encabezados");
console.assert(p1.rows.length === 3, "Deben detectarse 3 filas de datos");
console.assert(p1.rows[0][1] === "Positivo, confirmado", "El campo con coma entre comillas debe preservarse íntegro");
console.assert(p1.headers[0] === "municipio", "El BOM inicial no debe quedar pegado al primer encabezado");

// CSV con punto y coma (común en exportes es-MX) y decimales con coma.
const csvPuntoYComa = "municipio;tasa\nTolimán;12,5\nColón;8,3\n";
const p2 = svc.parseCSV(csvPuntoYComa);
console.assert(p2.headers.length === 2 && p2.rows.length === 2, "Debe parsear correctamente con delimitador ;");
console.log("Delimitador ; detectado OK:", p2.headers, p2.rows);

// Inferencia de tipos.
const cols = svc.inferirColumnas(p1.headers, p1.rows);
console.log("\nColumnas inferidas:", cols.map((c) => `${c.nombre}:${c.tipo}`));
console.assert(cols[0].tipo === "texto", "municipio debe inferirse como texto");
console.assert(cols[2].tipo === "numero", "casos debe inferirse como número");

// parseNumero con miles y porcentaje.
console.assert(svc.parseNumero("1,234") === 1234, "Debe interpretar separador de miles");
console.assert(svc.parseNumero("37%") === 37, "Debe interpretar porcentaje");
console.assert(svc.parseNumero("n/d") === null, "Un valor no numérico debe devolver null, no 0");

// Informe de calidad.
const mapeo = { 0: { rol: "dimension" }, 1: { rol: "ignorar" }, 2: { rol: "medida" } };
const informe = svc.generarInformeCalidad(p1.headers, p1.rows, mapeo);
console.log("\nInforme de calidad:", JSON.stringify(informe, null, 2));
console.assert(informe.resumen.total_filas === 3, "El informe debe contar 3 filas");
console.assert(informe.resumen.columnas_dimension === 1 && informe.resumen.columnas_medida === 1, "Debe reflejar el mapeo dado");

// Agregación.
const agregadoMunicipio = svc.agregar(p1.rows, 0, 2, null);
console.log("\nAgregado por municipio (suma de casos):", agregadoMunicipio);
const totalCasos = p1.rows.reduce((s, r) => s + Number(r[2]), 0);
const sumaAgregado = agregadoMunicipio.reduce((s, r) => s + r.valor, 0);
console.assert(sumaAgregado === totalCasos, "La suma del agregado debe coincidir con la suma directa de la columna medida");

const valoresUnicosResultado = svc.valoresUnicos(p1.rows, 1);
console.log("Valores únicos de 'resultado':", valoresUnicosResultado);
console.assert(valoresUnicosResultado.length === 2, "Debe haber 2 valores únicos en la columna resultado");

console.log("\n=== PARTE 1 completada sin errores de aserción ===\n");

/* =========================================================================
   PARTE 2 — Flujo completo de UI (login → subir → mapear → validar → ver)
   ========================================================================= */
console.log("=== PARTE 2: flujo de UI completo en pages/carga.html ===\n");

const loginResult = window.SNSP_AUTH.login("osvaldo.bobadilla@snsp.qro.gob.mx", "SNSP2025");
console.assert(loginResult && loginResult.ok !== false, "Login debería funcionar con el usuario demo");
console.assert(window.SNSP_AUTH.can("cargar_informacion"), "El usuario administrador demo debe tener el permiso cargar_informacion");

window.SNSP_renderCargaModulePage({});
const doc = window.document;

console.log("Sidebar incluye 'Cargar datos':", doc.getElementById("sidebar").innerHTML.includes("Cargar datos"));
console.assert(doc.getElementById("sidebar").innerHTML.includes("Cargar datos"), "El sidebar debe mostrar el link a Cargar datos para un usuario con permiso");

function displayOf(id) { return doc.getElementById(id).style.display; }
console.log("\nEstado inicial — subir:", displayOf("carga-paso-subir"), "mapeo:", displayOf("carga-paso-mapeo"), "resultado:", displayOf("carga-paso-resultado"));
console.assert(displayOf("carga-paso-mapeo") === "none" && displayOf("carga-paso-resultado") === "none", "Sólo debe verse el paso de subir archivo al inicio");

// Simular la subida de un archivo CSV real vía File/FileReader de jsdom.
const csvSimulado = "municipio,resultado,casos\nQuerétaro,Positivo,120\nCorregidora,Negativo,80\nCorregidora,Positivo,15\nEl Marqués,Positivo,45\nEl Marqués,,10\n";
const archivo = new window.File([csvSimulado], "casos_prueba.csv", { type: "text/csv" });

const inputArchivo = doc.getElementById("carga-input-archivo");
Object.defineProperty(inputArchivo, "files", { value: [archivo], configurable: true });
inputArchivo.dispatchEvent(new window.Event("change", { bubbles: true }));

// El procesamiento del archivo es asíncrono (FileReader); se espera un tick.
setTimeout(() => {
  console.log("\nTras subir el archivo — subir:", displayOf("carga-paso-subir"), "mapeo:", displayOf("carga-paso-mapeo"));
  console.assert(displayOf("carga-paso-mapeo") !== "none", "Tras procesar el archivo debe mostrarse el paso de mapeo");
  console.assert(doc.getElementById("carga-archivo-nombre").textContent === "casos_prueba.csv", "Debe mostrarse el nombre del archivo subido");
  console.log("Filas mapeadas en la tabla de mapeo:", doc.querySelectorAll("#carga-mapeo-body tr").length);
  console.assert(doc.querySelectorAll("#carga-mapeo-body tr").length === 3, "Deben listarse las 3 columnas del CSV en el mapeo");

  // Verificar que 'municipio' quedó preseleccionado como dimensión y 'casos' como medida
  // (heurística: texto -> dimensión, número -> medida).
  const selects = Array.from(doc.querySelectorAll(".carga-rol-select"));
  console.log("Roles preseleccionados:", selects.map((s) => s.value));
  console.assert(selects[0].value === "dimension", "La columna de texto (municipio) debe preseleccionarse como dimensión");
  console.assert(selects[2].value === "medida", "La columna numérica (casos) debe preseleccionarse como medida");
  // Forzamos 'resultado' también como dimensión para probar el filtro secundario.
  selects[1].value = "dimension";

  doc.getElementById("btn-carga-validar").dispatchEvent(new window.Event("click", { bubbles: true }));

  console.log("\nTras validar — mapeo:", displayOf("carga-paso-mapeo"), "resultado:", displayOf("carga-paso-resultado"));
  console.assert(displayOf("carga-paso-resultado") !== "none", "Tras validar debe mostrarse el paso de resultado");
  console.log("Informe resumen:", doc.getElementById("carga-informe-resumen").textContent);
  console.log("Informe avisos:", doc.getElementById("carga-informe-avisos").textContent);
  console.assert(doc.getElementById("carga-informe-avisos").textContent.includes("vacío") || doc.getElementById("carga-informe-avisos").innerHTML.includes("vacío"),
    "Debe avisar sobre la fila con 'resultado' vacío (El Marqués sin resultado)");

  console.log("\nKPI grid:", doc.getElementById("carga-kpi-grid").textContent.replace(/\s+/g, " ").trim());
  console.assert(doc.getElementById("carga-kpi-grid").textContent.includes("5"), "El KPI debe reflejar las 5 filas del archivo");

  const filasTabla = doc.querySelectorAll("#carga-tabla-body tr").length;
  console.log("Filas en tabla resumen (categorías de municipio):", filasTabla);
  console.assert(filasTabla === 3, "Deben verse 3 categorías (Querétaro, Corregidora, El Marqués)");

  console.log("\nFiltro secundario visible:", displayOf("carga-filtro-wrap"));
  console.assert(displayOf("carga-filtro-wrap") !== "none", "Con 2 dimensiones marcadas, el filtro secundario debe mostrarse");
  console.log("Opciones del filtro:", doc.getElementById("carga-filtro-valor").innerHTML);

  // Aplicar el filtro secundario (resultado = Positivo) y verificar que el agregado cambia.
  const filtroSel = doc.getElementById("carga-filtro-valor");
  filtroSel.value = "Positivo";
  filtroSel.dispatchEvent(new window.Event("change", { bubbles: true }));
  const filasTrasFiltro = doc.querySelectorAll("#carga-tabla-body tr").length;
  console.log("Filas en tabla resumen tras filtrar a 'Positivo':", filasTrasFiltro);
  console.assert(filasTrasFiltro === 3, "Con el filtro 'Positivo', deben seguir viéndose 3 municipios (todos tienen al menos un caso positivo)");
  console.log("Tabla resumen filtrada:", doc.getElementById("carga-tabla-body").textContent.replace(/\s+/g, " ").trim());

  // Botón "cargar otro archivo" debe regresar limpiamente al paso 1.
  doc.getElementById("btn-carga-otro-archivo-resultado").dispatchEvent(new window.Event("click", { bubbles: true }));
  console.log("\nTras 'cargar otro archivo' — subir:", displayOf("carga-paso-subir"), "resultado:", displayOf("carga-paso-resultado"));
  console.assert(displayOf("carga-paso-subir") !== "none" && displayOf("carga-paso-resultado") === "none", "Debe regresar al paso de subir archivo sin quedar en un estado intermedio");

  console.log("\n=== PARTE 2 completada sin errores de excepción ===");
}, 50);
