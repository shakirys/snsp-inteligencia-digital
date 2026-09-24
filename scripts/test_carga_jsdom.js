/**
 * Prueba de humo con jsdom para pages/carga.html (prototipo de carga de
 * archivos). Dos partes: (1) pruebas de lógica pura contra
 * services/cargaDataService.js con datos sintéticos, (2) flujo completo de
 * UI simulando un archivo real vía File/FileReader de jsdom.
 *
 * v2.6.0-prototipo: se agregan pruebas para el rol "Filtro" independiente
 * de "Dimensión", varios filtros simultáneos combinados con AND, el
 * selector explícito de dimensión/medida cuando hay más de un candidato,
 * y la detección de columnas "código/categoría" (p. ej. Año) para que no
 * se propongan por defecto como Medida.
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
          <button id="btn-carga-mapeo-ignorar-todo"></button>
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
            <div id="carga-poblacion-wrap">
              <input type="file" id="carga-input-poblacion">
              <span id="carga-poblacion-estado"></span>
              <div id="carga-medida-analisis-grid" style="display:none;">
                <select id="carga-select-medida-analisis">
                  <option value="casos">Casos</option>
                  <option value="poblacion">Población</option>
                  <option value="tasa">Tasa (por 100,000 habitantes)</option>
                </select>
              </div>
            </div>
            <div id="carga-config-wrap" style="display:none;">
              <div id="carga-config-grid"></div>
            </div>
            <div id="carga-filtros-wrap" style="display:none;">
              <div id="carga-filtros-grid"></div>
            </div>
            <select id="carga-topn">
              <option value="10">Top 10</option>
              <option value="15" selected>Top 15</option>
              <option value="20">Top 20</option>
              <option value="todas">Todas</option>
            </select>
            <div id="carga-chart-titulo-corto" style="display:none;"></div>
            <div id="carga-chart-wrap" style="height:420px;"><canvas id="carga-chart"></canvas></div>
            <table><thead id="carga-tabla-head"><tr><th>#</th><th>Categoría</th><th>Valor</th></tr></thead><tbody id="carga-tabla-body"></tbody></table>
            <p id="carga-tabla-count"></p>
          </div>
          <button id="btn-carga-cambiar-mapeo"></button>
          <button id="btn-carga-exportar-pdf"></button>
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
  this.update = function () {};
  this.toBase64Image = function () { return "data:image/png;base64,AAAA"; };
  this._cfg = cfg;
  this.data = cfg.data;
  this.options = cfg.options;
  this.ctx = ctx && ctx.getContext ? ctx.getContext("2d") : null;
  this.canvas = ctx || { width: 800, height: 480 };
};
window.Chart.register = function () {};

// ---- Stub mínimo de jsPDF, con bitácora de texto/metadata para poder
// comprobar que la exportación refleja los filtros realmente activos ----
window.__pdfTextLog = [];
window.jspdf = {
  jsPDF: function (opts) {
    window.__pdfTextLog = [];
    window.__pdfAutoTableLog = null;
    window.__pdfLastOptions = opts; // ACT06 — Parte 3: para comprobar la orientación elegida
    window.__pdfAddPageCount = 0;
    this.setFont = function () {};
    this.setFontSize = function () {};
    this.text = function (str) { window.__pdfTextLog.push(str); };
    this.splitTextToSize = function (str) { return [str]; }; // sin word-wrap real en la prueba: 1 línea por texto
    this.addImage = function () {};
    this.addPage = function () { window.__pdfAddPageCount += 1; };
    this.save = function () {};
    this.autoTable = function (opts2) { window.__pdfAutoTableLog = opts2; };
  },
};

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
const csvComillas = '﻿municipio,resultado,casos\n"Querétaro","Positivo, confirmado",120\nCorregidora,Negativo,80\n"El Marqués","Positivo, confirmado",45\n';
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
console.assert(cols[2].pareceCodigo === false, "'casos' no debe marcarse como posible código");

// parseNumero con miles y porcentaje.
console.assert(svc.parseNumero("1,234") === 1234, "Debe interpretar separador de miles");
console.assert(svc.parseNumero("37%") === 37, "Debe interpretar porcentaje");
console.assert(svc.parseNumero("n/d") === null, "Un valor no numérico debe devolver null, no 0");

// Informe de calidad.
const mapeo = { 0: { rol: "dimension" }, 1: { rol: "ignorar" }, 2: { rol: "medida" } };
const informe = svc.generarInformeCalidad(p1.headers, p1.rows, mapeo, cols);
console.log("\nInforme de calidad:", JSON.stringify(informe, null, 2));
console.assert(informe.resumen.total_filas === 3, "El informe debe contar 3 filas");
console.assert(informe.resumen.columnas_dimension === 1 && informe.resumen.columnas_medida === 1, "Debe reflejar el mapeo dado");
console.assert(informe.resumen.columnas_filtro === 0, "Ninguna columna se marcó como filtro en este mapeo");

// Agregación.
const agregadoMunicipio = svc.agregar(p1.rows, 0, 2, null);
console.log("\nAgregado por municipio (suma de casos):", agregadoMunicipio);
const totalCasos = p1.rows.reduce((s, r) => s + Number(r[2]), 0);
const sumaAgregado = agregadoMunicipio.reduce((s, r) => s + r.valor, 0);
console.assert(sumaAgregado === totalCasos, "La suma del agregado debe coincidir con la suma directa de la columna medida");

const valoresUnicosResultado = svc.valoresUnicos(p1.rows, 1);
console.log("Valores únicos de 'resultado':", valoresUnicosResultado);
console.assert(valoresUnicosResultado.length === 2, "Debe haber 2 valores únicos en la columna resultado");

// ---- Nuevo: detección de columnas "código/categoría" (Año, semana, etc.) ----
const csvConAnio = "municipio,Año,casos\nQuerétaro,2025,10\nCorregidora,2026,20\n";
const p3 = svc.parseCSV(csvConAnio);
const cols3 = svc.inferirColumnas(p3.headers, p3.rows);
console.log("\nColumnas con 'Año':", cols3.map((c) => `${c.nombre}:${c.tipo}:pareceCodigo=${c.pareceCodigo}`));
console.assert(cols3[1].tipo === "numero" && cols3[1].pareceCodigo === true, "La columna 'Año' debe inferirse como número Y marcarse como posible código");
console.assert(cols3[0].pareceCodigo === false && cols3[2].pareceCodigo === false, "'municipio' y 'casos' no deben marcarse como posible código");

// Si de todas formas se mapea una columna "código" como medida, debe avisar.
const mapeoAnioComoMedida = { 0: { rol: "dimension" }, 1: { rol: "medida" }, 2: { rol: "ignorar" } };
const informeAnio = svc.generarInformeCalidad(p3.headers, p3.rows, mapeoAnioComoMedida, cols3);
console.log("Avisos con 'Año' forzada a medida:", informeAnio.avisos);
console.assert(informeAnio.avisos.some((a) => a.includes("parece un código")), "Debe avisar si una columna tipo 'Año' se usa como medida");

// ---- Nuevo: agregar() con varios filtros simultáneos (AND) ----
const rowsMulti = [
  ["Querétaro", "2025", "Positivo", "120"],
  ["Corregidora", "2025", "Negativo", "80"],
  ["Corregidora", "2026", "Positivo", "15"],
  ["El Marqués", "2025", "Positivo", "45"],
];
const agSinFiltro = svc.agregar(rowsMulti, 0, 3, null);
console.assert(agSinFiltro.length === 3, "Sin filtros deben verse las 3 categorías de municipio");
const agUnFiltro = svc.agregar(rowsMulti, 0, 3, [{ colIdx: 1, valor: "2025" }]);
console.assert(agUnFiltro.length === 3, "Con Año=2025 deben verse 3 municipios (Querétaro, Corregidora, El Marqués)");
const agDosFiltros = svc.agregar(rowsMulti, 0, 3, [{ colIdx: 1, valor: "2025" }, { colIdx: 2, valor: "Positivo" }]);
console.log("Agregado con Año=2025 Y resultado=Positivo:", agDosFiltros);
console.assert(agDosFiltros.length === 2, "Con Año=2025 Y resultado=Positivo deben verse sólo Querétaro y El Marqués");
console.assert(agDosFiltros.reduce((s, r) => s + r.valor, 0) === 165, "La suma de casos con ambos filtros debe ser 120+45=165");
// Compatibilidad: agregar() también acepta un solo objeto de filtro (no arreglo).
const agFiltroObjeto = svc.agregar(rowsMulti, 0, 3, { colIdx: 1, valor: "2026" });
console.assert(agFiltroObjeto.length === 1 && agFiltroObjeto[0].categoria === "Corregidora", "agregar() debe seguir aceptando un solo objeto de filtro (compatibilidad)");

console.log("\n=== PARTE 1 completada sin errores de aserción ===\n");

/* =========================================================================
   PARTE 2 — Flujo completo de UI (login → subir → mapear → validar → ver)
   ========================================================================= */
console.log("=== PARTE 2: flujo de UI completo en pages/carga.html ===\n");

const loginResult = window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025");
console.assert(loginResult && loginResult.ok !== false, "Login debería funcionar con el usuario demo");
console.assert(window.SNSP_AUTH.can("cargar_informacion"), "El usuario administrador demo debe tener el permiso cargar_informacion");

window.SNSP_renderCargaModulePage({});
const doc = window.document;

console.log("Sidebar incluye 'Cargar datos':", doc.getElementById("sidebar").innerHTML.includes("Cargar datos"));
console.assert(doc.getElementById("sidebar").innerHTML.includes("Cargar datos"), "El sidebar debe mostrar el link a Cargar datos para un usuario con permiso");

function displayOf(id) { return doc.getElementById(id).style.display; }
console.log("\nEstado inicial — subir:", displayOf("carga-paso-subir"), "mapeo:", displayOf("carga-paso-mapeo"), "resultado:", displayOf("carga-paso-resultado"));
console.assert(displayOf("carga-paso-mapeo") === "none" && displayOf("carga-paso-resultado") === "none", "Sólo debe verse el paso de subir archivo al inicio");

// Archivo simulado con: 2 columnas de texto (municipio, resultado), una
// columna "Año" (código/categoría disfrazada de número) y una medida real
// (casos). Una fila con municipio vacío para probar el aviso de "vacío".
const csvSimulado = "municipio,resultado,Año,casos\nQuerétaro,Positivo,2025,120\nCorregidora,Negativo,2025,80\nCorregidora,Positivo,2026,15\nEl Marqués,Positivo,2025,45\n,Positivo,2026,10\n";
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
  console.assert(doc.querySelectorAll("#carga-mapeo-body tr").length === 4, "Deben listarse las 4 columnas del CSV en el mapeo");

  // Roles preseleccionados: municipio y resultado (texto) -> dimensión;
  // Año, aunque es numérico, NO debe preseleccionarse como medida por ser
  // "posible código"; casos (numérico normal) sí debe preseleccionarse
  // como medida.
  const selects = Array.from(doc.querySelectorAll(".carga-rol-select"));
  console.log("Roles preseleccionados:", selects.map((s) => s.value));
  console.assert(selects[0].value === "dimension", "municipio (texto) debe preseleccionarse como dimensión");
  console.assert(selects[1].value === "dimension", "resultado (texto) debe preseleccionarse como dimensión");
  console.assert(selects[2].value === "dimension", "Año (posible código) NO debe preseleccionarse como medida");
  console.assert(selects[3].value === "medida", "casos (número normal) debe preseleccionarse como medida");

  // La opción "Medida" sigue deshabilitada sólo para columnas de tipo
  // TEXTO; una columna numérica "posible código" como Año debe seguir
  // siendo elegible como medida si el usuario de verdad lo necesita.
  function opcionMedida(sel) { return Array.from(sel.options).find((o) => o.value === "medida"); }
  console.assert(opcionMedida(selects[0]).disabled === true, "Medida debe estar deshabilitada para la columna de texto 'municipio'");
  console.assert(opcionMedida(selects[1]).disabled === true, "Medida debe estar deshabilitada para la columna de texto 'resultado'");
  console.assert(opcionMedida(selects[2]).disabled === false, "Medida debe seguir habilitada (aunque no preseleccionada) para 'Año'");
  console.assert(opcionMedida(selects[3]).disabled === false, "Medida debe estar habilitada para la columna numérica 'casos'");
  console.log("Reglas de habilitación/preselección de 'Medida': OK");

  // Marcamos 'resultado' y 'Año' como Filtro (papel nuevo, independiente
  // de Dimensión) para probar varios filtros simultáneos.
  selects[1].value = "filtro";
  selects[2].value = "filtro";

  doc.getElementById("btn-carga-validar").dispatchEvent(new window.Event("click", { bubbles: true }));

  console.log("\nTras validar — mapeo:", displayOf("carga-paso-mapeo"), "resultado:", displayOf("carga-paso-resultado"));
  console.assert(displayOf("carga-paso-resultado") !== "none", "Tras validar debe mostrarse el paso de resultado");
  console.log("Informe resumen:", doc.getElementById("carga-informe-resumen").textContent.replace(/\s+/g, " ").trim());
  console.log("Informe avisos:", doc.getElementById("carga-informe-avisos").textContent);
  const resumenTexto = doc.getElementById("carga-informe-resumen").textContent.replace(/\s+/g, " ");
  console.assert(resumenTexto.includes("1") && resumenTexto.includes("columna(s) marcada(s) como dimensión"), "El resumen debe reflejar 1 columna como dimensión (municipio)");
  console.assert(resumenTexto.includes("2") && resumenTexto.includes("como filtro"), "El resumen debe reflejar 2 columnas como filtro (resultado, Año)");
  console.assert(doc.getElementById("carga-informe-avisos").textContent.includes("vacío"),
    "Debe avisar sobre la fila con 'municipio' vacío");
  console.assert(!doc.getElementById("carga-informe-avisos").textContent.includes("parece un código"),
    "No debe avisar sobre 'código usado como medida': Año no se mapeó como medida");

  console.log("\nKPI grid:", doc.getElementById("carga-kpi-grid").textContent.replace(/\s+/g, " ").trim());
  console.assert(doc.getElementById("carga-kpi-grid").textContent.includes("5"), "El KPI debe reflejar las 5 filas del archivo");

  // Sólo hay 1 candidato a Dimensión (municipio) y 1 a Medida (casos): el
  // bloque de configuración (selector explícito) no debe mostrarse.
  console.assert(displayOf("carga-config-wrap") === "none", "Con un solo candidato de dimensión/medida, el selector de configuración debe permanecer oculto");

  // Con 2 columnas marcadas como Filtro, el bloque de filtros SÍ debe
  // mostrarse. "resultado" (texto normal) usa el <select> sencillo de
  // siempre; "Año" (detectada como esAnio) usa en cambio el nuevo
  // selector múltiple de chips, así que sólo debe generarse 1
  // ".carga-filtro-select".
  console.assert(displayOf("carga-filtros-wrap") !== "none", "Con columnas marcadas como Filtro, el bloque de filtros debe mostrarse");
  const filtroSelects = Array.from(doc.querySelectorAll(".carga-filtro-select"));
  console.log("Selectores de filtro (select simple) generados:", filtroSelects.map((s) => s.dataset.col));
  console.assert(filtroSelects.length === 1, "Debe generarse 1 solo <select> de filtro (resultado); Año usa el multiselector de chips");
  const selResultado = filtroSelects.find((s) => Number(s.dataset.col) === 1);
  console.assert(!!selResultado, "El <select> de filtro generado debe corresponder a la columna 'resultado' (índice 1)");

  const multiAnio = doc.querySelector('.carga-anio-multiselect[data-col="2"]');
  console.assert(!!multiAnio, "La columna 'Año' (índice 2) debe renderizarse como selector múltiple de chips");
  const anioMenu = multiAnio.querySelector(".carga-anio-menu");
  const anioOpciones = Array.from(anioMenu.querySelectorAll('input[type="checkbox"]')).map((i) => i.value).sort();
  console.log("Opciones del multiselector de Año:", anioOpciones);
  console.assert(anioOpciones.join(",") === "2025,2026", "El multiselector de Año debe ofrecer 2025 y 2026 (únicos valores del archivo)");
  function anioCheckbox(valor) { return Array.from(anioMenu.querySelectorAll('input[type="checkbox"]')).find((i) => i.value === valor); }
  function marcarAnio(valor, marcado) {
    const chk = anioCheckbox(valor);
    chk.checked = marcado;
    chk.dispatchEvent(new window.Event("change", { bubbles: true }));
  }
  // Encabezados de la tabla como arreglo de textos (uno por <th>): más
  // confiable que textContent (que no inserta espacios entre <th>
  // adyacentes sin texto de por medio en el HTML fuente).
  function encabezadosTabla() { return Array.from(doc.querySelectorAll("#carga-tabla-head th")).map((th) => th.textContent.trim()); }

  const filasSinFiltro = doc.querySelectorAll("#carga-tabla-body tr").length;
  console.log("Filas en tabla resumen sin filtros (categorías de municipio):", filasSinFiltro);
  console.assert(filasSinFiltro === 4, "Deben verse 4 categorías: Querétaro, Corregidora, El Marqués, (vacío)");

  // ---- Aplicar UN solo año (Año = 2025): debe seguir funcionando en modo
  // clásico (0/1 año elegido), agregando el año como un filtro más, y el
  // título corto debe mostrar el año elegido. ----
  marcarAnio("2025", true);
  let filasTrasFiltro = doc.querySelectorAll("#carga-tabla-body tr").length;
  console.log("Filas en tabla con Año=2025:", filasTrasFiltro);
  console.assert(filasTrasFiltro === 3, "Con Año=2025 deben verse 3 municipios (Querétaro, Corregidora, El Marqués)");
  console.assert(doc.getElementById("carga-kpi-grid").textContent.includes("Filas con el filtro aplicado"), "Con 1 filtro activo el KPI debe decir 'el filtro aplicado' (singular)");
  console.assert(doc.getElementById("carga-kpi-grid").textContent.includes("3"), "El KPI de filas filtradas debe mostrar 3 (filas con Año=2025)");
  console.assert(encabezadosTabla().join(",") === "#,Categoría,Valor",
    "Con un solo año elegido, el encabezado de la tabla debe seguir siendo el clásico (#, Categoría, Valor)");
  const tituloCortoUnAnio = doc.getElementById("carga-chart-titulo-corto");
  console.log("Título corto con 1 año:", tituloCortoUnAnio.textContent, "display:", tituloCortoUnAnio.style.display);
  console.assert(tituloCortoUnAnio.style.display !== "none" && tituloCortoUnAnio.textContent.includes("2025"),
    "Con 1 año elegido, el título corto debe mostrarse e indicar el año (ej. '— 2025')");

  // ---- Aplicar un SEGUNDO filtro simultáneo (resultado = Positivo), combinado con AND con el año elegido ----
  selResultado.value = "Positivo";
  selResultado.dispatchEvent(new window.Event("change", { bubbles: true }));
  filasTrasFiltro = doc.querySelectorAll("#carga-tabla-body tr").length;
  console.log("Filas en tabla con Año=2025 Y resultado=Positivo:", filasTrasFiltro);
  console.assert(filasTrasFiltro === 2, "Con Año=2025 Y resultado=Positivo deben verse sólo Querétaro y El Marqués");
  console.assert(doc.getElementById("carga-kpi-grid").textContent.includes("Filas con los filtros aplicados"), "Con resultado=Positivo Y Año=2025 (el año se agrega como filtro adicional en modo clásico de 1 año) el KPI debe decir 'los filtros aplicados' (plural)");
  console.assert(doc.getElementById("carga-kpi-grid").textContent.includes("2"), "El KPI de filas filtradas debe mostrar 2 (Querétaro y El Marqués, únicas filas con resultado=Positivo Y Año=2025)");
  console.log("Tabla resumen con ambos filtros:", doc.getElementById("carga-tabla-body").textContent.replace(/\s+/g, " ").trim());

  // La gráfica, la tabla y los KPI ya se comprobaron arriba con los mismos
  // filtros activos; ahora se exporta a PDF con esos MISMOS filtros
  // activos (resultado=Positivo + Año=2025) y se revisa la bitácora del
  // stub de jsPDF para confirmar que el PDF también los refleja.
  let pdfError = null;
  try {
    doc.getElementById("btn-carga-exportar-pdf").dispatchEvent(new window.Event("click", { bubbles: true }));
  } catch (e) {
    pdfError = e;
  }
  console.assert(pdfError === null, "El botón 'Exportar a PDF' no debe lanzar excepciones: " + (pdfError && pdfError.message));
  let pdfTexto = window.__pdfTextLog.join(" | ");
  console.log("Texto capturado del PDF (modo clásico, 1 año + 1 filtro):", pdfTexto);
  console.assert(pdfTexto.includes('resultado = "Positivo"'), "El PDF debe listar el filtro resultado = Positivo");
  console.assert(pdfTexto.includes("Año = 2025"), "El PDF debe listar el año elegido (Año = 2025) aunque no sea un '.carga-filtro-select'");
  console.log("Exportar a PDF con 1 año + 1 filtro simultáneo (gráfica/tabla/KPI/PDF consistentes): OK");

  // Quitamos el filtro 'resultado' pero dejamos el año 2025 marcado, para
  // encadenar directamente con la prueba de modo comparativo de abajo.
  selResultado.value = "";
  selResultado.dispatchEvent(new window.Event("change", { bubbles: true }));

  // ---- Modo comparativo: marcar un SEGUNDO año (2026) además del 2025 ya
  // marcado activa el modo comparativo (barras agrupadas + tabla con
  // Diferencia/Variación %), sin tocar el filtro 'resultado' (queda como
  // filtro base combinado con AND, igual que antes). ----
  marcarAnio("2026", true);
  const cabeceraComparativo = encabezadosTabla();
  console.log("Encabezado de tabla en modo comparativo:", cabeceraComparativo);
  console.assert(cabeceraComparativo.join(",") === "#,municipio,casos 2025,casos 2026,Diferencia,Variación %",
    "Con 2 años elegidos, el encabezado debe mostrar una columna por año más Diferencia/Variación %");

  const filasComparativo = Array.from(doc.querySelectorAll("#carga-tabla-body tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim()));
  console.log("Filas de la tabla comparativa:", filasComparativo);
  console.assert(filasComparativo.length === 4, "Deben verse 4 categorías de municipio en el comparativo (Querétaro, Corregidora, El Marqués y vacío)");
  const filaQueretaro = filasComparativo.find((f) => f[1] === "Querétaro");
  console.assert(!!filaQueretaro && filaQueretaro[2] === "120" && filaQueretaro[3] === "0",
    "Querétaro sólo tiene filas en 2025 (120 casos); en 2026 debe mostrar 0");
  const filaCorregidora = filasComparativo.find((f) => f[1] === "Corregidora");
  console.assert(!!filaCorregidora && filaCorregidora[2] === "80" && filaCorregidora[3] === "15" && filaCorregidora[4] === "-65",
    "Corregidora: 80 casos en 2025, 15 en 2026, Diferencia = 15-80 = -65");
  console.assert(filaCorregidora[5].includes("-81.3%"), "Corregidora: Variación % = (15-80)/80*100 = -81.3%");

  const tituloCortoComparativo = doc.getElementById("carga-chart-titulo-corto");
  console.log("Título corto en modo comparativo:", tituloCortoComparativo.textContent);
  console.assert(tituloCortoComparativo.textContent.includes("Comparativo 2025 vs 2026"),
    "El título corto en modo comparativo debe indicar 'Comparativo 2025 vs 2026'");

  console.assert(doc.getElementById("carga-kpi-grid").textContent.includes("5"),
    "El KPI 'Filas en los años comparados' debe reflejar las 5 filas del archivo (todas caen en 2025 o 2026)");

  // Exportar a PDF también debe funcionar sin errores en modo comparativo,
  // con una tabla de cabecera distinta (una columna por año + Diferencia y
  // Variación %).
  let pdfErrorComparativo = null;
  try {
    doc.getElementById("btn-carga-exportar-pdf").dispatchEvent(new window.Event("click", { bubbles: true }));
  } catch (e) {
    pdfErrorComparativo = e;
  }
  console.assert(pdfErrorComparativo === null, "'Exportar a PDF' en modo comparativo no debe lanzar excepciones: " + (pdfErrorComparativo && pdfErrorComparativo.message));
  console.assert(window.__pdfAutoTableLog && window.__pdfAutoTableLog.head[0].join(",") === "#,municipio,casos 2025,casos 2026,Diferencia,Variación %",
    "La tabla del PDF en modo comparativo debe traer una columna por año más Diferencia/Variación %");
  pdfTexto = window.__pdfTextLog.join(" | ");
  console.assert(pdfTexto.includes("Comparativo de años: 2025 vs 2026"), "El PDF debe indicar explícitamente el comparativo de años elegido");
  console.log("Exportar a PDF en modo comparativo (2 años): OK");

  // Quitamos ambos años marcados para volver al modo clásico sin filtros,
  // como esperan las pruebas siguientes (Top N, etc.).
  marcarAnio("2025", false);
  marcarAnio("2026", false);
  console.assert(doc.querySelectorAll("#carga-tabla-body tr").length === 4, "Al quitar ambos años deben volver a verse las 4 categorías en modo clásico");
  console.assert(encabezadosTabla().join(",") === "#,Categoría,Valor",
    "Al quitar ambos años, el encabezado de la tabla debe volver al clásico (#, Categoría, Valor)");
  console.assert(doc.getElementById("carga-chart-titulo-corto").style.display === "none", "Al quitar ambos años, el título corto debe volver a ocultarse");

  // Mejora previa (se conserva): selector de cantidad de categorías (Top
  // 10/15/20/Todas) debe limitar tanto la gráfica como la tabla resumen.
  const topSel = doc.getElementById("carga-topn");
  console.assert(topSel.value === "15", "El selector de categorías debe iniciar en 'Top 15'");
  topSel.value = "todas";
  topSel.dispatchEvent(new window.Event("change", { bubbles: true }));
  const filasTrasTodas = doc.querySelectorAll("#carga-tabla-body tr").length;
  console.log("Filas en tabla con 'Todas':", filasTrasTodas);
  console.assert(filasTrasTodas === 4, "Con 4 categorías en el archivo, 'Todas' debe mostrar las 4");
  console.assert(doc.getElementById("carga-tabla-count").textContent.includes("todas"), "El contador de la tabla debe indicar que se muestran todas las categorías");

  // Alto del contenedor de la gráfica: con etiquetas cortas (nombres de
  // municipio) y 4 categorías, debe usar el alto mínimo (420px) porque
  // 4 categorías * 26px/barra + 90px = 194px < 420px.
  const altoChart = doc.getElementById("carga-chart-wrap").style.height;
  console.log("Alto del contenedor de la gráfica (etiquetas cortas):", altoChart);
  console.assert(altoChart === "420px", "Con etiquetas cortas y pocas categorías debe usarse el alto mínimo de 420px");

  // "Cambiar mapeo" debe regresar al paso 2 SIN volver a leer el archivo,
  // conservando los 4 roles ya elegidos (incluido el nuevo rol "filtro").
  doc.getElementById("btn-carga-cambiar-mapeo").dispatchEvent(new window.Event("click", { bubbles: true }));
  console.assert(displayOf("carga-paso-mapeo") !== "none", "'Cambiar mapeo' debe mostrar de nuevo el paso de mapeo");
  console.assert(doc.getElementById("carga-archivo-nombre").textContent === "casos_prueba.csv", "El archivo ya leído debe seguir disponible sin tener que volver a subirlo");
  console.assert(Array.from(doc.querySelectorAll(".carga-rol-select")).map((s) => s.value).join(",") === "dimension,filtro,filtro,medida",
    "Las selecciones de rol previas (municipio=dimensión, resultado=filtro, Año=filtro, casos=medida) deben conservarse al volver al mapeo");
  doc.getElementById("btn-carga-validar").dispatchEvent(new window.Event("click", { bubbles: true }));
  console.assert(displayOf("carga-paso-resultado") !== "none", "Tras re-validar debe regresar al paso de resultado, con el mismo archivo");
  console.log("'Cambiar mapeo' sin recargar archivo, con el rol 'filtro' conservado: OK");

  // Botón "cargar otro archivo" debe regresar limpiamente al paso 1.
  doc.getElementById("btn-carga-otro-archivo-resultado").dispatchEvent(new window.Event("click", { bubbles: true }));
  console.log("\nTras 'cargar otro archivo' — subir:", displayOf("carga-paso-subir"), "resultado:", displayOf("carga-paso-resultado"));
  console.assert(displayOf("carga-paso-subir") !== "none" && displayOf("carga-paso-resultado") === "none", "Debe regresar al paso de subir archivo sin quedar en un estado intermedio");

  console.log("\n=== PARTE 2 completada sin errores de excepción ===");

  /* =========================================================================
     PARTE 3 — Buscador de texto en filtros con muchos valores + título
     dinámico con Padecimiento (v2.8.0-prototipo)
     ========================================================================= */
  console.log("\n=== PARTE 3: buscador en filtros y título dinámico con Padecimiento ===\n");

  // Archivo con una columna "Padecimiento" de 22 valores únicos (> el
  // umbral de 20 que activa el buscador), incluido uno con acento
  // ("Intoxicación por picadura de alacrán" — el mismo ejemplo dado por la
  // usuaria) para probar que el buscador encuentra coincidencias parciales
  // sin importar los acentos (escribiendo "alacran").
  const padecimientos = [];
  for (let i = 1; i <= 21; i++) padecimientos.push(`Padecimiento ${String(i).padStart(2, "0")}`);
  padecimientos.push("Intoxicación por picadura de alacrán"); // 22 valores únicos > 20
  const gruposEdad = ["0-4", "5-9"];
  const aniosParte3 = ["2025", "2026"];
  const filasCsv3 = ["Grupo de edad,Padecimiento,Año,casos"];
  let contadorCasos = 1;
  padecimientos.forEach((pad) => {
    gruposEdad.forEach((grupo) => {
      aniosParte3.forEach((anio) => {
        filasCsv3.push(`${grupo},"${pad}",${anio},${contadorCasos}`);
        contadorCasos++;
      });
    });
  });
  const csvParte3 = filasCsv3.join("\n") + "\n";
  const archivo3 = new window.File([csvParte3], "padecimientos_prueba.csv", { type: "text/csv" });

  const inputArchivo3 = doc.getElementById("carga-input-archivo");
  Object.defineProperty(inputArchivo3, "files", { value: [archivo3], configurable: true });
  inputArchivo3.dispatchEvent(new window.Event("change", { bubbles: true }));

  setTimeout(() => {
    console.assert(displayOf("carga-paso-mapeo") !== "none", "Tras subir el archivo de Parte 3 debe mostrarse el paso de mapeo");
    const selects3 = Array.from(doc.querySelectorAll(".carga-rol-select"));
    console.log("Columnas del archivo de Parte 3:", selects3.length);
    console.assert(selects3.length === 4, "Deben listarse las 4 columnas (Grupo de edad, Padecimiento, Año, casos)");
    // Grupo de edad queda como dimensión (default, texto); Padecimiento y
    // Año se marcan como Filtro; casos ya queda preseleccionada como Medida.
    selects3[1].value = "filtro"; // Padecimiento
    selects3[2].value = "filtro"; // Año
    doc.getElementById("btn-carga-validar").dispatchEvent(new window.Event("click", { bubbles: true }));

    console.assert(displayOf("carga-paso-resultado") !== "none", "Tras validar el archivo de Parte 3 debe mostrarse el paso de resultado");

    // ---- Buscador de texto: con 22 valores únicos (> 20), Padecimiento
    // debe usar el buscador en vez del <select> sencillo ----
    const filtroPadecimiento = doc.querySelector('.carga-filtro-buscable[data-col="1"]');
    console.assert(!!filtroPadecimiento, "Con 22 valores únicos (> 20), Padecimiento debe usar el buscador de texto en vez del <select> sencillo");
    const selectPadecimientoOculto = doc.querySelector('.carga-filtro-select[data-col="1"]');
    console.assert(!!selectPadecimientoOculto && selectPadecimientoOculto.hidden === true, "El <select> real de Padecimiento debe seguir existiendo, oculto, con el valor elegido");
    console.assert(selectPadecimientoOculto.options.length === 23, "El <select> oculto debe tener 22 padecimientos + la opción 'Todos'");

    const toggleBtn = filtroPadecimiento.querySelector(".carga-filtro-buscable-toggle");
    const menuBuscable = filtroPadecimiento.querySelector(".carga-filtro-buscable-menu");
    const inputBuscable = filtroPadecimiento.querySelector(".carga-filtro-buscable-input");
    const listaBuscable = filtroPadecimiento.querySelector(".carga-filtro-buscable-opciones");

    console.assert(toggleBtn.textContent.trim() === "Todos", "Sin nada elegido, el botón del buscador debe decir 'Todos'");
    console.assert(menuBuscable.hidden === true, "El menú del buscador debe iniciar cerrado");

    toggleBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
    console.assert(menuBuscable.hidden === false, "Al hacer clic en el botón, el menú del buscador debe abrirse");
    console.assert(listaBuscable.querySelectorAll(".carga-filtro-buscable-opcion").length === 23, "Sin texto de búsqueda deben listarse las 23 opciones (22 padecimientos + Todos)");

    // Búsqueda parcial SIN acentos: "alacran" debe encontrar "Intoxicación
    // por picadura de alacrán" (con acento) — coincidencia parcial e
    // insensible a acentos/mayúsculas, tal como lo pidió la usuaria.
    inputBuscable.value = "alacran";
    inputBuscable.dispatchEvent(new window.Event("input", { bubbles: true }));
    const opcionesFiltradas = Array.from(listaBuscable.querySelectorAll(".carga-filtro-buscable-opcion")).map((b) => b.textContent.trim());
    console.log("Opciones tras buscar 'alacran' (sin acento):", opcionesFiltradas);
    console.assert(opcionesFiltradas.includes("Todos"), "'Todos' debe seguir visible aunque haya texto de búsqueda, para poder quitar el filtro");
    console.assert(opcionesFiltradas.includes("Intoxicación por picadura de alacrán"), "Buscar 'alacran' (sin acento) debe encontrar 'Intoxicación por picadura de alacrán' (con acento)");
    console.assert(opcionesFiltradas.length === 2, "Sólo 'Todos' y el padecimiento del alacrán deben coincidir con 'alacran'");

    // Búsqueda sin coincidencias.
    inputBuscable.value = "zzz_no_existe";
    inputBuscable.dispatchEvent(new window.Event("input", { bubbles: true }));
    console.assert(listaBuscable.textContent.includes("Sin coincidencias"), "Una búsqueda sin resultados debe mostrar 'Sin coincidencias'");

    // Se vuelve a buscar "alacran" y se elige esa opción.
    inputBuscable.value = "alacran";
    inputBuscable.dispatchEvent(new window.Event("input", { bubbles: true }));
    const btnAlacran = Array.from(listaBuscable.querySelectorAll(".carga-filtro-buscable-opcion")).find((b) => b.textContent.trim().includes("alacrán"));
    btnAlacran.dispatchEvent(new window.Event("click", { bubbles: true }));

    console.assert(menuBuscable.hidden === true, "Al elegir una opción, el menú debe cerrarse");
    console.assert(toggleBtn.textContent.trim() === "Intoxicación por picadura de alacrán", "El botón del buscador debe mostrar el valor elegido");
    console.assert(selectPadecimientoOculto.value === "Intoxicación por picadura de alacrán", "El <select> oculto debe tomar el valor elegido en el buscador");

    // La tabla debe filtrarse: sólo quedan las filas de ese padecimiento (2
    // categorías de Grupo de edad, sumando ambos años ya que Año no está filtrado).
    const filasPadecimientoAlacran = doc.querySelectorAll("#carga-tabla-body tr").length;
    console.log("Filas en tabla con Padecimiento=alacrán (sin filtrar por año):", filasPadecimientoAlacran);
    console.assert(filasPadecimientoAlacran === 2, "Con el padecimiento del alacrán elegido deben verse las 2 categorías de Grupo de edad (0-4 y 5-9)");

    // ---- Título dinámico con Padecimiento ----
    // Con Padecimiento elegido pero SIN año elegido: el título corto ahora
    // debe mostrarse (antes se mantenía oculto sin año) con el padecimiento
    // antepuesto y sin sufijo de año.
    const tituloCortoEl3 = doc.getElementById("carga-chart-titulo-corto");
    console.log("Título corto (Padecimiento, sin año):", tituloCortoEl3.textContent, "display:", tituloCortoEl3.style.display);
    console.assert(tituloCortoEl3.style.display !== "none", "Con un Padecimiento elegido (aunque no haya año elegido), el título corto debe mostrarse");
    console.assert(tituloCortoEl3.textContent === "Intoxicación por picadura de alacrán — Casos por Grupo de edad",
      "El título corto debe anteponer el Padecimiento elegido, sin sufijo de año (0 años elegidos)");

    // Se elige 1 año: el sufijo de año se agrega después del padecimiento.
    const menuAnio3 = doc.querySelector(".carga-anio-multiselect .carga-anio-menu");
    const chk2025 = Array.from(menuAnio3.querySelectorAll('input[type="checkbox"]')).find((i) => i.value === "2025");
    chk2025.checked = true;
    chk2025.dispatchEvent(new window.Event("change", { bubbles: true }));
    console.log("Título corto (Padecimiento + 1 año):", tituloCortoEl3.textContent);
    console.assert(tituloCortoEl3.textContent === "Intoxicación por picadura de alacrán — Casos por Grupo de edad — 2025",
      "Con 1 año elegido, el sufijo de año debe ir después del padecimiento");

    // Se elige un segundo año: modo comparativo, con el mismo formato del
    // ejemplo dado por la usuaria.
    const chk2026 = Array.from(menuAnio3.querySelectorAll('input[type="checkbox"]')).find((i) => i.value === "2026");
    chk2026.checked = true;
    chk2026.dispatchEvent(new window.Event("change", { bubbles: true }));
    console.log("Título corto (Padecimiento + comparativo):", tituloCortoEl3.textContent);
    console.assert(tituloCortoEl3.textContent === "Intoxicación por picadura de alacrán — Casos por Grupo de edad — Comparativo 2025 vs 2026",
      "En modo comparativo con Padecimiento elegido, el título debe leerse '<Padecimiento> — Casos por Grupo de edad — Comparativo 2025 vs 2026' (mismo formato del ejemplo dado)");

    // El PDF debe traer ese mismo texto como línea de 'Título de la gráfica'.
    let pdfErrorParte3 = null;
    try {
      doc.getElementById("btn-carga-exportar-pdf").dispatchEvent(new window.Event("click", { bubbles: true }));
    } catch (e) {
      pdfErrorParte3 = e;
    }
    console.assert(pdfErrorParte3 === null, "'Exportar a PDF' con Padecimiento + comparativo no debe lanzar excepciones: " + (pdfErrorParte3 && pdfErrorParte3.message));
    const pdfTextoParte3 = window.__pdfTextLog.join(" | ");
    console.assert(pdfTextoParte3.includes("Título de la gráfica: Intoxicación por picadura de alacrán — Casos por Grupo de edad — Comparativo 2025 vs 2026"),
      "El PDF debe incluir la línea 'Título de la gráfica' con el mismo texto que se ve en pantalla");
    console.log("PDF con título dinámico (Padecimiento + comparativo): OK");

    // Se quita el Padecimiento elegido (se vuelve a 'Todos'): el título
    // debe volver a leerse exactamente como en v2.7.0 (sin el padecimiento
    // antepuesto) — "conserva el título actual" cuando no hay padecimiento.
    toggleBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
    inputBuscable.value = "";
    inputBuscable.dispatchEvent(new window.Event("input", { bubbles: true }));
    const btnTodos = Array.from(listaBuscable.querySelectorAll(".carga-filtro-buscable-opcion")).find((b) => b.textContent.trim() === "Todos");
    btnTodos.dispatchEvent(new window.Event("click", { bubbles: true }));
    console.assert(selectPadecimientoOculto.value === "", "Al elegir 'Todos' en el buscador, el <select> oculto debe volver a quedar vacío");
    console.assert(toggleBtn.textContent.trim() === "Todos", "El botón del buscador debe volver a decir 'Todos'");
    console.log("Título corto (sin Padecimiento, comparativo 2 años):", tituloCortoEl3.textContent);
    console.assert(tituloCortoEl3.textContent === "Casos por Grupo de edad — Comparativo 2025 vs 2026",
      "Sin Padecimiento elegido, el título corto vuelve a ser exactamente el mismo que en v2.7.0 (sin cambios)");

    console.log("\n=== PARTE 3 completada sin errores de excepción ===");

    /* =========================================================================
       ACT06 — Partes 1, 2 y 3 sobre ACT05: mapeo rápido, Casos+Población+Tasa,
       PDF adaptable. ENCADENADO dentro del mismo callback (no un setTimeout
       hermano independiente) para garantizar que corre estrictamente DESPUÉS
       de que termina la Parte 3 y no compite por el mismo estado del módulo
       (estado.headers/estado.rows es una sola variable compartida — si dos
       cargas de archivo se dispararan en paralelo, la más lenta en resolver
       su FileReader pisaría el resultado de la otra).
       ========================================================================= */
    setTimeout(() => {
      /* =========================================================================
         PARTE 4 (ACT06) — Mapeo rápido: "Marcar todas como Ignorar"
         ========================================================================= */
  console.log("\n=== PARTE 4 (ACT06): mapeo rápido — Marcar todas como Ignorar ===\n");
  const csvIgnorarTodo = "municipio,resultado,Año,casos,extra\nQuerétaro,Positivo,2025,120,x\nCorregidora,Negativo,2025,80,y\n";
  const archivo4 = new window.File([csvIgnorarTodo], "ignorar_todo_prueba.csv", { type: "text/csv" });
  const inputArchivo4 = doc.getElementById("carga-input-archivo");
  Object.defineProperty(inputArchivo4, "files", { value: [archivo4], configurable: true });
  inputArchivo4.dispatchEvent(new window.Event("change", { bubbles: true }));

  setTimeout(() => {
    const selects4 = Array.from(doc.querySelectorAll(".carga-rol-select"));
    console.log("Roles antes de 'Marcar todas como Ignorar':", selects4.map((s) => s.value));
    console.assert(selects4.some((s) => s.value !== "ignorar"), "Antes del clic debe haber al menos una columna con rol distinto de Ignorar (para que la prueba sea significativa)");

    doc.getElementById("btn-carga-mapeo-ignorar-todo").dispatchEvent(new window.Event("click", { bubbles: true }));
    const rolesTrasIgnorarTodo = Array.from(doc.querySelectorAll(".carga-rol-select")).map((s) => s.value);
    console.log("Roles tras 'Marcar todas como Ignorar':", rolesTrasIgnorarTodo);
    console.assert(rolesTrasIgnorarTodo.every((v) => v === "ignorar"), "Tras el clic, TODAS las columnas deben quedar en 'Ignorar'");

    // Debe poder cambiarse individualmente después del clic.
    selects4[0].value = "dimension"; // municipio
    selects4[3].value = "medida"; // casos
    console.assert(selects4[0].value === "dimension" && selects4[3].value === "medida",
      "Después de 'Marcar todas como Ignorar' debe poderse cambiar columnas individualmente a Dimensión/Medida/Filtro");
    console.assert(selects4[1].value === "ignorar" && selects4[2].value === "ignorar" && selects4[4].value === "ignorar",
      "Las columnas que NO se cambiaron a mano deben seguir en Ignorar");

    doc.getElementById("btn-carga-validar").dispatchEvent(new window.Event("click", { bubbles: true }));
    console.assert(displayOf("carga-paso-resultado") !== "none", "Debe poder validarse con el mapeo resultante tras usar 'Marcar todas como Ignorar' + ajustes individuales");
    const resumenTexto4 = doc.getElementById("carga-informe-resumen").textContent.replace(/\s+/g, " ");
    console.assert(resumenTexto4.includes("1") && resumenTexto4.includes("columna(s) marcada(s) como dimensión"),
      "El informe debe reflejar 1 columna como dimensión (municipio)");
    console.log("=== PARTE 4 (ACT06) completada sin errores de aserción ===");

    /* =========================================================================
       PARTE 5 (ACT06) — Relacionar Casos + Población y calcular Tasa
       ========================================================================= */
    console.log("\n=== PARTE 5 (ACT06): Casos + Población -> Tasa (sin duplicar población) ===\n");

    // ---- Lógica pura primero (sin DOM), replicando la estructura real: ----
    // BASE_CASOS trae VARIAS filas por Año+Municipio+Grupo de edad (una por
    // Padecimiento/Sexo/Institución/Semana…); BASE_POBLACION trae UNA sola
    // fila por esa combinación. Esto prueba directamente que
    // agregarConPoblacion() NO multiplica la población por el número de
    // filas de Casos que comparten la misma combinación.
    const headersCasosSint = ["Año", "Municipio", "Grupo de edad", "Sexo", "Padecimiento", "Casos"];
    const rowsCasosSint = [
      // Corregidora, 2025, "De 00 años": 3 filas de Casos (distintos
      // Padecimiento/Sexo) que comparten la MISMA combinación de relación.
      ["2025", "Corregidora", "De 00 años", "Femenino", "Infecciones respiratorias", "4"],
      ["2025", "Corregidora", "De 00 años", "Masculino", "Infecciones respiratorias", "3"],
      ["2025", "Corregidora", "De 00 años", "Femenino", "Conjuntivitis", "1"],
      // Querétaro, 2025, "De 00 años": 2 filas.
      ["2025", "Querétaro", "De 00 años", "Femenino", "Infecciones respiratorias", "10"],
      ["2025", "Querétaro", "De 00 años", "Masculino", "Infecciones respiratorias", "5"],
      // Corregidora, 2026, "De 00 años": otro año, no debe mezclarse con 2025.
      ["2026", "Corregidora", "De 00 años", "Femenino", "Infecciones respiratorias", "2"],
    ];
    const headersPobSint = ["Año", "Municipio", "Grupo de edad", "Población"];
    const rowsPobSint = [
      ["2025", "Corregidora", "De 00 años", "1000"],
      ["2025", "Querétaro", "De 00 años", "2000"],
      ["2026", "Corregidora", "De 00 años", "1100"],
    ];

    const joinCols = svc.detectarColumnasClave(headersCasosSint);
    console.log("Columnas de relación detectadas en Casos:", joinCols);
    console.assert(joinCols.colAnio === 0 && joinCols.colMunicipio === 1 && joinCols.colGrupoEdad === 2,
      "detectarColumnasClave debe encontrar Año/Municipio/Grupo de edad por nombre en el archivo de Casos");

    const idxPob = svc.indexarPoblacion(headersPobSint, rowsPobSint);
    console.assert(idxPob.completo === true, "indexarPoblacion debe reconocer las 4 columnas necesarias en el archivo de población sintético");
    console.assert(idxPob.mapa.size === 3, "El índice de población debe tener 3 llaves (una por combinación Año+Municipio+Grupo de edad)");

    // Agrupando por Municipio (dimIdx=1), sumando Casos (medidaIdx=5), sin otros filtros, para 2025.
    const resultado2025 = svc.agregarConPoblacion(rowsCasosSint, 1, 5, [{ colIdx: 0, valor: "2025" }], joinCols, idxPob.mapa);
    console.log("agregarConPoblacion (Municipio, 2025):", resultado2025);
    const filaCorregidora2025 = resultado2025.find((r) => r.categoria === "Corregidora");
    const filaQueretaro2025 = resultado2025.find((r) => r.categoria === "Querétaro");
    console.assert(filaCorregidora2025.valorCasos === 8, "Corregidora 2025: Casos = 4+3+1 = 8 (suma normal, sin cambios)");
    console.assert(filaCorregidora2025.poblacion === 1000,
      "Corregidora 2025: Población debe ser 1000 UNA SOLA VEZ, aunque haya 3 filas de Casos con la misma combinación Año+Municipio+Grupo de edad (evita duplicar población)");
    console.assert(filaCorregidora2025.poblacion !== 3000,
      "La población de Corregidora NO debe multiplicarse por las 3 filas de Casos que comparten la combinación (esto es justo lo que pide evitar la usuaria)");
    console.assert(Math.abs(filaCorregidora2025.tasa - 800) < 0.001, "Corregidora 2025: Tasa = (8/1000)*100000 = 800");
    console.assert(filaQueretaro2025.valorCasos === 15 && filaQueretaro2025.poblacion === 2000,
      "Querétaro 2025: Casos = 10+5 = 15, Población = 2000 (una sola vez, aunque hay 2 filas de Casos que comparten la combinación)");

    // 2026 debe usar la población de 2026 (1100), no mezclarse con 2025.
    const resultado2026 = svc.agregarConPoblacion(rowsCasosSint, 1, 5, [{ colIdx: 0, valor: "2026" }], joinCols, idxPob.mapa);
    const filaCorregidora2026 = resultado2026.find((r) => r.categoria === "Corregidora");
    console.assert(filaCorregidora2026.poblacion === 1100, "Corregidora 2026 debe usar la población de 2026 (1100), no la de 2025");

    // Comparativo 2025 vs 2026 (agregarComparativoConPoblacion): cada año
    // debe traer SU PROPIA población, sin mezclarse entre años.
    const comparativoPob = svc.agregarComparativoConPoblacion(rowsCasosSint, 1, 5, [], 0, ["2025", "2026"], joinCols, idxPob.mapa);
    const corregidoraComparativo = comparativoPob.find((r) => r.categoria === "Corregidora");
    console.log("Comparativo Corregidora 2025 vs 2026:", corregidoraComparativo.valores);
    console.assert(corregidoraComparativo.valores["2025"].poblacion === 1000 && corregidoraComparativo.valores["2026"].poblacion === 1100,
      "El comparativo debe traer la población correcta de CADA año por separado, sin mezclarlas");
    console.assert(corregidoraComparativo.valores["2025"].valorCasos === 8 && corregidoraComparativo.valores["2026"].valorCasos === 2,
      "El comparativo debe traer los Casos correctos de cada año");

    console.log("=== Lógica pura de Casos+Población (sin DOM) completada sin errores de aserción ===\n");

    // ---- Flujo completo de UI: subir Casos, mapear, subir Población,
    // elegir 'Analizar', verificar gráfica/tabla/PDF. ----
    const csvCasosUI = ["Año,Municipio,Grupo de edad,Padecimiento,Casos"];
    csvCasosUI.push('2025,Corregidora,"De 00 años",Infecciones respiratorias,4');
    csvCasosUI.push('2025,Corregidora,"De 00 años",Conjuntivitis,3');
    csvCasosUI.push('2025,"Querétaro","De 00 años",Infecciones respiratorias,10');
    csvCasosUI.push('2025,"Querétaro","De 05 a 09 años",Infecciones respiratorias,6');
    csvCasosUI.push('2026,Corregidora,"De 00 años",Infecciones respiratorias,2');
    const archivoCasosUI = new window.File([csvCasosUI.join("\n") + "\n"], "casos_poblacion_prueba.csv", { type: "text/csv" });
    const inputArchivoUI = doc.getElementById("carga-input-archivo");
    Object.defineProperty(inputArchivoUI, "files", { value: [archivoCasosUI], configurable: true });
    inputArchivoUI.dispatchEvent(new window.Event("change", { bubbles: true }));

    setTimeout(() => {
      // Orden de columnas: Año, Municipio, Grupo de edad, Padecimiento, Casos.
      const selectsUI = Array.from(doc.querySelectorAll(".carga-rol-select"));
      console.log("Columnas del archivo Casos+Población (UI):", selectsUI.length);
      selectsUI[0].value = "filtro"; // Año
      selectsUI[1].value = "dimension"; // Municipio
      selectsUI[2].value = "ignorar"; // Grupo de edad
      selectsUI[3].value = "ignorar"; // Padecimiento
      selectsUI[4].value = "medida"; // Casos
      doc.getElementById("btn-carga-validar").dispatchEvent(new window.Event("click", { bubbles: true }));
      console.assert(displayOf("carga-paso-resultado") !== "none", "Debe llegar al paso de resultado con el archivo de Casos+Población");

      // Sin población cargada: el selector 'Analizar' debe seguir oculto.
      console.assert(displayOf("carga-medida-analisis-grid") === "none", "Sin base de población cargada, el selector 'Analizar' debe permanecer oculto");

      // Sube la base de Población.
      const csvPobUI = "Año,Municipio,Grupo de edad,Población\n2025,Corregidora,De 00 años,1000\n2025,Querétaro,De 00 años,2000\n2025,Querétaro,De 05 a 09 años,500\n2026,Corregidora,De 00 años,1100\n";
      const archivoPobUI = new window.File([csvPobUI], "poblacion_prueba.csv", { type: "text/csv" });
      const inputPobUI = doc.getElementById("carga-input-poblacion");
      Object.defineProperty(inputPobUI, "files", { value: [archivoPobUI], configurable: true });
      inputPobUI.dispatchEvent(new window.Event("change", { bubbles: true }));

      setTimeout(() => {
        console.log("Estado de relación con población:", doc.getElementById("carga-poblacion-estado").textContent);
        console.assert(displayOf("carga-medida-analisis-grid") !== "none", "Con la base de población relacionada correctamente, el selector 'Analizar' debe mostrarse");

        // Por defecto sigue analizando Casos: no debe cambiar nada de lo ya probado.
        const filasCasosPorDefecto = Array.from(doc.querySelectorAll("#carga-tabla-body tr")).map((tr) =>
          Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim()));
        console.log("Tabla con 'Analizar=Casos' (por defecto):", filasCasosPorDefecto);
        const filaCorregidoraCasos = filasCasosPorDefecto.find((f) => f[1] === "Corregidora");
        console.assert(filaCorregidoraCasos && filaCorregidoraCasos[2] === "9", "Por defecto ('Analizar'=Casos), Corregidora debe sumar 4+3+2=9 casos (sin año filtrado: 2025 y 2026 juntos)");

        // Cambia 'Analizar' a Población.
        const selMedida = doc.getElementById("carga-select-medida-analisis");
        selMedida.value = "poblacion";
        selMedida.dispatchEvent(new window.Event("change", { bubbles: true }));
        const filasPoblacion = Array.from(doc.querySelectorAll("#carga-tabla-body tr")).map((tr) =>
          Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim()));
        console.log("Tabla con 'Analizar=Población':", filasPoblacion);
        const filaCorregidoraPob = filasPoblacion.find((f) => f[1] === "Corregidora");
        // Sin año filtrado: Corregidora aparece en 2025 (De 00 años, pob 1000) y 2026
        // (De 00 años, pob 1100) -> combinaciones DISTINTAS (años distintos) -> 1000+1100=2100.
        console.assert(filaCorregidoraPob && filaCorregidoraPob[2] === "2,100",
          "Corregidora (Población, sin año filtrado): 1000 (2025) + 1100 (2026) = 2,100 — dos combinaciones distintas, cada una contada una sola vez");
        const filaQueretaroPob = filasPoblacion.find((f) => f[1] === "Querétaro");
        console.assert(filaQueretaroPob && filaQueretaroPob[2] === "2,500",
          "Querétaro (Población, sin año filtrado): 2000 (De 00 años) + 500 (De 05 a 09 años) = 2,500");

        // Filtra a Año=2025 y cambia 'Analizar' a Tasa.
        const menuAnioUI = doc.querySelector(".carga-anio-multiselect .carga-anio-menu");
        const chk2025UI = Array.from(menuAnioUI.querySelectorAll('input[type="checkbox"]')).find((i) => i.value === "2025");
        chk2025UI.checked = true;
        chk2025UI.dispatchEvent(new window.Event("change", { bubbles: true }));
        selMedida.value = "tasa";
        selMedida.dispatchEvent(new window.Event("change", { bubbles: true }));
        const filasTasa = Array.from(doc.querySelectorAll("#carga-tabla-body tr")).map((tr) =>
          Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim()));
        console.log("Tabla con 'Analizar=Tasa', Año=2025:", filasTasa);
        const filaCorregidoraTasa = filasTasa.find((f) => f[1] === "Corregidora");
        // Corregidora 2025: Casos=7 (4+3), Población=1000 -> Tasa=(7/1000)*100000=700
        console.assert(filaCorregidoraTasa && filaCorregidoraTasa[2] === "700",
          "Corregidora (Tasa, Año=2025): (7 casos / 1000 hab) * 100,000 = 700");

        // El PDF debe reflejar 'Tasa (por 100,000 hab.)' como medida.
        let pdfErrorTasa = null;
        try {
          doc.getElementById("btn-carga-exportar-pdf").dispatchEvent(new window.Event("click", { bubbles: true }));
        } catch (e) { pdfErrorTasa = e; }
        console.assert(pdfErrorTasa === null, "Exportar a PDF con 'Analizar=Tasa' no debe lanzar excepciones: " + (pdfErrorTasa && pdfErrorTasa.message));
        const pdfTextoTasa = window.__pdfTextLog.join(" | ");
        console.assert(pdfTextoTasa.includes("Medida: Tasa (por 100,000 hab.)"), "El PDF debe indicar 'Medida: Tasa (por 100,000 hab.)' cuando se analiza Tasa");
        console.log("PDF con 'Analizar=Tasa': OK");

        console.log("=== PARTE 5 (ACT06) completada sin errores de aserción ===");

        /* =========================================================================
           PARTE 6 (ACT06) — PDF adaptable: vertical primero, horizontal si no cabe
           ========================================================================= */
        console.log("\n=== PARTE 6 (ACT06): orientación adaptable del PDF ===\n");

        // Caso simple (pocas columnas, categorías cortas): debe quedarse en
        // vertical — el comportamiento por defecto no debe cambiar sin necesidad.
        selMedida.value = "casos";
        selMedida.dispatchEvent(new window.Event("change", { bubbles: true }));
        chk2025UI.checked = false;
        chk2025UI.dispatchEvent(new window.Event("change", { bubbles: true }));
        doc.getElementById("btn-carga-exportar-pdf").dispatchEvent(new window.Event("click", { bubbles: true }));
        console.log("Orientación con tabla simple (pocas columnas, nombres cortos):", window.__pdfLastOptions);
        console.assert(window.__pdfLastOptions.orientation === "portrait",
          "Con una tabla de pocas columnas y categorías cortas, debe usarse orientación vertical (portrait)");

        // Caso comparativo con categorías largas: debe forzar horizontal. Se
        // sube un archivo con nombres de categoría muy largos (simula
        // Padecimiento) y se eligen 2 años (agrega Diferencia/Variación%).
        const catLarga1 = "Intoxicación por picadura de alacrán y otros artrópodos ponzoñosos diagnosticados";
        const catLarga2 = "Infecciones respiratorias agudas de vías superiores no especificadas en otra parte";
        const csvLargo = [
          "Año,Municipio,Padecimiento,Casos",
          `2025,Corregidora,"${catLarga1}",12`,
          `2026,Corregidora,"${catLarga1}",18`,
          `2025,Querétaro,"${catLarga2}",30`,
          `2026,Querétaro,"${catLarga2}",22`,
        ].join("\n") + "\n";
        const archivoLargo = new window.File([csvLargo], "padecimientos_largos_prueba.csv", { type: "text/csv" });
        const inputArchivoLargo = doc.getElementById("carga-input-archivo");
        Object.defineProperty(inputArchivoLargo, "files", { value: [archivoLargo], configurable: true });
        inputArchivoLargo.dispatchEvent(new window.Event("change", { bubbles: true }));

        setTimeout(() => {
          const selectsLargo = Array.from(doc.querySelectorAll(".carga-rol-select"));
          selectsLargo[0].value = "filtro"; // Año
          selectsLargo[1].value = "ignorar"; // Municipio
          selectsLargo[2].value = "dimension"; // Padecimiento (categorías largas)
          selectsLargo[3].value = "medida"; // Casos
          doc.getElementById("btn-carga-validar").dispatchEvent(new window.Event("click", { bubbles: true }));

          const menuAnioLargo = doc.querySelector(".carga-anio-multiselect .carga-anio-menu");
          const chk2025L = Array.from(menuAnioLargo.querySelectorAll('input[type="checkbox"]')).find((i) => i.value === "2025");
          const chk2026L = Array.from(menuAnioLargo.querySelectorAll('input[type="checkbox"]')).find((i) => i.value === "2026");
          chk2025L.checked = true; chk2025L.dispatchEvent(new window.Event("change", { bubbles: true }));
          chk2026L.checked = true; chk2026L.dispatchEvent(new window.Event("change", { bubbles: true }));

          doc.getElementById("btn-carga-exportar-pdf").dispatchEvent(new window.Event("click", { bubbles: true }));
          console.log("Orientación con tabla comparativa + categorías largas:", window.__pdfLastOptions);
          console.assert(window.__pdfLastOptions.orientation === "landscape",
            "Con una tabla comparativa (6 columnas) y categorías de Padecimiento muy largas, debe cambiar automáticamente a horizontal (landscape)");
          console.assert(window.__pdfAutoTableLog && window.__pdfAutoTableLog.rowPageBreak === "avoid",
            "La tabla del PDF debe evitar partir una fila entre dos páginas (rowPageBreak: 'avoid')");
          const anchoTotalCol = Object.values(window.__pdfAutoTableLog.columnStyles).reduce((s, c) => s + c.cellWidth, 0);
          console.log("Ancho total de columnas asignado en landscape:", anchoTotalCol, "(disponible:", 792 - 80, ")");
          console.assert(anchoTotalCol <= 792 - 80 + 6, "El ancho total de columnas asignado no debe exceder (con tolerancia de redondeo) el ancho disponible de la página en horizontal");

          console.log("=== PARTE 6 (ACT06) completada sin errores de aserción ===");
          console.log("\n=== TODAS LAS PRUEBAS DE ACT06 (Partes 1, 2 y 3) COMPLETADAS ===");
        }, 50); // cierra PARTE 6 (G)
      }, 50); // cierra PARTE 5 - subida de Población (F)
    }, 50); // cierra PARTE 5 - subida de Casos+Población (E)
  }, 50); // cierra PARTE 4 (D)
    }, 50); // cierra el bloque ACT06 completo (C)
  }, 50); // cierra la Parte 3 original (B)
}, 50); // cierra la Parte 2 original (A)
