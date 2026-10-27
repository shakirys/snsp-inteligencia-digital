/**
 * Prueba de humo con jsdom para pages/canal_endemico.html (PRUEBA
 * CONTROLADA — módulo exploratorio). Mismo patrón que el resto de
 * pruebas jsdom del proyecto (ver scripts/test_poblacion_jsdom.js).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
function readFile(p) { return fs.readFileSync(path.join(root, p), "utf-8"); }

let fallas = 0;
function assert(cond, msg) {
  if (!cond) { fallas++; console.log("FALLÓ: " + msg); }
  else console.log("OK: " + msg);
}

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div class="app-shell">
    <aside class="sidebar" id="sidebar"></aside>
    <div class="app-main">
      <header class="topbar" id="topbar"></header>
      <main class="app-content">
        <div class="canal-controles">
          <input type="text" id="canal-buscador-padecimiento">
          <select id="canal-select-padecimiento"></select>
          <div id="canal-buscador-contador"></div>
          <div id="canal-info-anio-observado"></div>
          <div id="canal-info-periodo-referencia"></div>
          <button type="button" id="btn-canal-pdf">Generar reporte PDF</button>
        </div>
        <div id="canal-aviso-no-disponible" class="canal-aviso-no-disponible"></div>
        <div class="indicator-grid" id="kpi-grid"></div>
        <div id="chart-titulo"></div>
        <div id="chart-subtitulo"></div>
        <canvas id="chart-canal"></canvas>
        <p id="nota-semana53"></p>
        <table><tbody id="tabla-semanas-body"></tbody></table>
        <table><tbody id="tabla-totales-anio-body"></tbody></table>
        <table><tbody id="tabla-resumen-zonas-body"></tbody></table>
        <div id="subt-distribucion-zonas"></div>
        <div id="nota-metodologica"></div>
        <span id="source-label"></span>
        <span id="version-tag-module"></span>
      </main>
    </div>
  </div>
</body></html>`, { runScripts: "outside-only", url: "http://localhost/pages/canal_endemico.html" });

const { window } = dom;

// ---- Stub mínimo de Chart.js (mismo patrón que el resto del proyecto) ----
window.Chart = function (canvasEl, cfg) {
  this.destroy = function () {};
  this._cfg = cfg;
  this.canvas = canvasEl;
  this.scales = { x: { getPixelForValue: () => 0, top: 0, right: 100 }, y: { top: 0, bottom: 100 } };
  this.ctx = canvasEl && canvasEl.getContext ? canvasEl.getContext("2d") : null;
};
window.Chart.register = function () {};

const scripts = [
  "config/config.js",
  "auth/auth.js",
  "data/real/canal_endemico_2022_2026.js",
  "components/sidebar.js",
  "components/topbar.js",
  "components/indicatorCard.js",
  "components/charts.js",
  "modules/canalEndemicoModuleView.js",
];

const context = dom.getInternalVMContext ? dom.getInternalVMContext() : null;
if (context) {
  for (const s of scripts) vm.runInContext(readFile(s), context, { filename: s });
} else {
  dom.window.eval(scripts.map(readFile).join("\n;\n"));
}

const loginResult = window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025");
assert(loginResult && loginResult.ok !== false, "Login debería funcionar con el usuario demo");

window.SNSP_renderCanalEndemicoModulePage({});

function kpiValor(label) {
  const tarjetas = Array.from(window.document.querySelectorAll("#kpi-grid .indicator-card"));
  const card = tarjetas.find((c) => (c.querySelector(".indicator-card__label") || {}).textContent === label);
  if (!card) return null;
  return (card.querySelector(".indicator-card__value") || {}).textContent || "";
}
function kpiValorNumero(label) {
  const v = kpiValor(label);
  if (v == null) return null;
  return parseInt(String(v).replace(/[^\d-]/g, ""), 10);
}

console.log("\n--- Validación de totales anuales (contra lo confirmado por la usuaria) ---");
const DATA = window.SNSP_CANAL_ENDEMICO_DATA;
const canal = DATA.canales["94"];
const TOTALES_ESPERADOS = { "2022": 4477, "2023": 5788, "2024": 5951, "2025": 6436, "2026": 4147 };
for (const anio of Object.keys(TOTALES_ESPERADOS)) {
  assert(canal.total_por_anio[anio] === TOTALES_ESPERADOS[anio], `Año ${anio}: total debe ser ${TOTALES_ESPERADOS[anio]} (trae: ${canal.total_por_anio[anio]})`);
}

console.log("\n--- KPIs en pantalla ---");
assert(kpiValorNumero("Casos acumulados 2026") === 4147, `KPI 'Casos acumulados 2026' debe ser 4147 (trae: ${kpiValor("Casos acumulados 2026")})`);
assert(kpiValorNumero("Última semana con información") === 37, `KPI 'Última semana con información' debe ser 37 (trae: ${kpiValor("Última semana con información")})`);
const sumaKpiZonas = ["Semanas en zona de éxito", "Semanas en zona de seguridad", "Semanas en zona de alerta", "Semanas en zona epidémica"]
  .map(kpiValorNumero).reduce((a, b) => a + b, 0);
assert(sumaKpiZonas === 37, `La suma de semanas por zona en los KPIs debe dar 37 (SE 1-37) (trae: ${sumaKpiZonas})`);

console.log("\n--- No imputación de ceros en semanas futuras de 2026 ---");
const semana40 = canal.semanas.find((s) => s.se === 40);
assert(semana40.casos_2026 === null, `SE 40 (futura, sin información real) debe tener casos_2026 = null, NUNCA 0 (trae: ${semana40.casos_2026})`);
assert(semana40.zona === null, `SE 40 sin información no debe tener zona asignada (trae: ${semana40.zona})`);
const semana37 = canal.semanas.find((s) => s.se === 37);
assert(semana37.casos_2026 !== null, `SE 37 (última con información) sí debe traer un valor real (trae: ${semana37.casos_2026})`);

console.log("\n--- Clasificación de zonas (≤Q1 éxito · ≤mediana seguridad · ≤Q3 alerta · >Q3 epidémica) ---");
let clasificacionOk = true;
for (const s of canal.semanas) {
  if (s.casos_2026 == null || s.q1 == null) continue;
  let esperada;
  if (s.casos_2026 <= s.q1) esperada = "exito";
  else if (s.casos_2026 <= s.mediana) esperada = "seguridad";
  else if (s.casos_2026 <= s.q3) esperada = "alerta";
  else esperada = "epidemica";
  if (s.zona !== esperada) { clasificacionOk = false; console.log(`  discrepancia en SE${s.se}: esperado ${esperada}, trae ${s.zona}`); }
}
assert(clasificacionOk, "La zona de cada semana observada debe coincidir con la fórmula ≤Q1/≤mediana/≤Q3/>Q3");

console.log("\n--- Cuartiles calculados únicamente con años que sí tienen esa semana (sin fabricar) ---");
const semana53 = canal.semanas.find((s) => s.se === 53);
assert(!!semana53, "La semana 53 debe existir en los datos (sólo 2025 la tuvo)");
assert(semana53.n_historico === 1, `La SE 53 debe calcularse con exactamente 1 año histórico (trae: ${semana53.n_historico})`);
const semana10 = canal.semanas.find((s) => s.se === 10);
assert(semana10.n_historico === 4, `La SE 10 (presente en los 4 años) debe calcularse con 4 años (trae: ${semana10.n_historico})`);

console.log("\n--- Tabla semanal en pantalla ---");
const filasTabla = window.document.querySelectorAll("#tabla-semanas-body tr");
assert(filasTabla.length === canal.semanas.length, `La tabla debe tener ${canal.semanas.length} filas, una por semana incluida la 53 (trae: ${filasTabla.length})`);

console.log("\n--- Ajuste: SE 53 (n=1) debe mostrar 'Referencia insuficiente', no Q1/Mediana/Q3 numéricos ---");
const filaSemana53 = Array.from(filasTabla).find((tr) => (tr.children[0] || {}).textContent === "53");
assert(!!filaSemana53, "Debe existir la fila de la SE 53 en la tabla");
if (filaSemana53) {
  const textoFila = filaSemana53.textContent;
  assert(/Referencia insuficiente \(n=1\)/.test(textoFila), `La fila de la SE 53 debe decir "Referencia insuficiente (n=1)" (trae: ${textoFila.replace(/\s+/g, " ").trim()})`);
  assert(filaSemana53.querySelectorAll("td").length === 4, `La fila de la SE 53 debe tener 4 celdas (SE, referencia insuficiente a 3 columnas, Casos, Zona) (trae: ${filaSemana53.querySelectorAll("td").length})`);
}
const filaSemana10 = Array.from(filasTabla).find((tr) => (tr.children[0] || {}).textContent === "10");
assert(!!filaSemana10 && filaSemana10.querySelectorAll("td").length === 6, "La fila de la SE 10 (n=4, referencia suficiente) debe conservar sus 6 celdas normales con Q1/Mediana/Q3 numéricos");

console.log("\n--- Selector con buscador: múltiples padecimientos (ACT22) ---");
const opcionesSelect = window.document.querySelectorAll("#canal-select-padecimiento option");
assert(opcionesSelect.length === DATA.catalogo_padecimientos.length, `El selector debe tener ${DATA.catalogo_padecimientos.length} opción(es), una por cada padecimiento del catálogo (trae: ${opcionesSelect.length})`);
assert(DATA.catalogo_padecimientos.length > 100, `El catálogo debe traer muchos padecimientos de la base real, no sólo alacrán (trae: ${DATA.catalogo_padecimientos.length})`);
assert(window.document.getElementById("canal-select-padecimiento").value === "94", "El selector debe iniciar en Epi-Clave 94 (alacrán), la línea base ya aprobada");

const disponibles = DATA.catalogo_padecimientos.filter((p) => p.disponible);
const noDisponibles = DATA.catalogo_padecimientos.filter((p) => !p.disponible);
assert(disponibles.length >= 60 && disponibles.length < DATA.catalogo_padecimientos.length, `Debe haber un subconjunto de padecimientos con canal disponible, no todos ni ninguno (trae: ${disponibles.length} de ${DATA.catalogo_padecimientos.length})`);
assert(noDisponibles.length > 0 && noDisponibles.every((p) => typeof p.motivo === "string" && p.motivo.length > 0), "Todo padecimiento no disponible debe traer un 'motivo' explícito (no vacío)");
assert(disponibles.every((p) => !!DATA.canales[p.epiclave]), "Todo padecimiento marcado disponible debe tener su canal construido en DATA.canales");
assert(noDisponibles.every((p) => !DATA.canales[p.epiclave]), "Ningún padecimiento no disponible debe tener un canal fabricado en DATA.canales");

console.log("\n--- Filtro del buscador por nombre y por Epi-Clave ---");
const buscadorEl = window.document.getElementById("canal-buscador-padecimiento");
function _simularEscritura(texto) {
  buscadorEl.value = texto;
  buscadorEl.dispatchEvent(new window.Event("input"));
}
_simularEscritura("alacrán");
let visiblesAlacran = Array.from(opcionesSelect).filter((o) => !o.hidden);
assert(visiblesAlacran.length === 1 && visiblesAlacran[0].value === "94", `Buscar "alacrán" debe filtrar a 1 opción (Epi-Clave 94) (trae: ${visiblesAlacran.length})`);
_simularEscritura("94");
visiblesAlacran = Array.from(opcionesSelect).filter((o) => !o.hidden);
assert(visiblesAlacran.some((o) => o.value === "94"), `Buscar por Epi-Clave "94" debe incluir la opción 94 entre las visibles`);
_simularEscritura("xyznoexiste123");
const visiblesVacio = Array.from(opcionesSelect).filter((o) => !o.hidden);
assert(visiblesVacio.length === 0, `Un término sin coincidencias debe ocultar todas las opciones (trae: ${visiblesVacio.length} visibles)`);
_simularEscritura("");
const visiblesTodo = Array.from(opcionesSelect).filter((o) => !o.hidden);
assert(visiblesTodo.length === opcionesSelect.length, "Al vaciar el buscador deben volver a verse todas las opciones");

console.log("\n--- Aviso claro para padecimiento sin canal disponible (no fabrica resultados) ---");
if (noDisponibles.length) {
  const ejemploNoDisponible = noDisponibles[0];
  window.document.getElementById("canal-select-padecimiento").value = ejemploNoDisponible.epiclave;
  window.document.getElementById("canal-select-padecimiento").dispatchEvent(new window.Event("change"));
  const avisoEl = window.document.getElementById("canal-aviso-no-disponible");
  assert(avisoEl.classList.contains("is-visible"), "El aviso de 'sin canal disponible' debe mostrarse al elegir un padecimiento sin información suficiente");
  assert(avisoEl.textContent.includes(ejemploNoDisponible.padecimiento), "El aviso debe mencionar el nombre del padecimiento elegido");
  const kpiTrasNoDisponible = window.document.getElementById("kpi-grid").querySelectorAll(".indicator-card").length;
  assert(kpiTrasNoDisponible === 0, `No debe haber tarjetas KPI fabricadas para un padecimiento sin canal disponible (trae: ${kpiTrasNoDisponible})`);
  const filasTablaNoDisp = window.document.querySelectorAll("#tabla-semanas-body tr");
  assert(filasTablaNoDisp.length === 1 && /Sin canal disponible/i.test(filasTablaNoDisp[0].textContent), "La tabla semanal debe mostrar un único mensaje de 'sin canal disponible', sin filas numéricas fabricadas");
  // Regresar a Epi-Clave 94 para no afectar las validaciones posteriores de este script
  window.document.getElementById("canal-select-padecimiento").value = "94";
  window.document.getElementById("canal-select-padecimiento").dispatchEvent(new window.Event("change"));
  assert(!window.document.getElementById("canal-aviso-no-disponible").classList.contains("is-visible"), "Al volver a Epi-Clave 94 el aviso debe desaparecer");
} else {
  assert(false, "Debe existir al menos un padecimiento no disponible para probar el aviso (criterio de elegibilidad demasiado permisivo)");
}

console.log("\n--- Botón de reporte PDF presente ---");
assert(!!window.document.getElementById("btn-canal-pdf"), "Debe existir el botón 'Generar reporte PDF' del Canal Endémico");

console.log("\n--- Totales anuales también en la tabla de validación ---");
const filasTotales = window.document.querySelectorAll("#tabla-totales-anio-body tr");
assert(filasTotales.length === 5, `La tabla de totales anuales debe tener 5 filas (2022-2026) (trae: ${filasTotales.length})`);

console.log("\n--- Fuente y nota metodológica visibles ---");
assert(window.document.getElementById("source-label").textContent.includes("BASE_PADECIMIENTOS"), "La fuente debe mencionar la base real de Padecimientos");
const notaTexto = window.document.getElementById("nota-metodologica").textContent;
assert(notaTexto.includes("exploratoria") || notaTexto.includes("Exploratoria") || notaTexto.includes("EXPLORATORIA") || notaTexto.toLowerCase().includes("exploratori"), "La nota metodológica debe declarar explícitamente que es exploratoria");
assert(notaTexto.toLowerCase().includes("no es") || notaTexto.toLowerCase().includes("no una declaración") || notaTexto.toLowerCase().includes("no sustituye") || DATA.meta.clasificacion_zonas.toLowerCase().includes("no una declaración"), "Debe aclarar que la zona epidémica no es una declaración oficial");

console.log("\n--- Limpieza de textos: ya integrado, sin referencias a 'prueba' ---");
const sourceLabelTexto = window.document.getElementById("source-label").textContent;
const topbarUpdatedTexto = window.document.getElementById("topbar").textContent;
const versionTexto = window.document.getElementById("version-tag-module").textContent;
assert(!/prueba/i.test(notaTexto), `La nota metodológica ya no debe mencionar "prueba" (trae: ${notaTexto})`);
assert(!/prueba/i.test(sourceLabelTexto), `La etiqueta de fuente ya no debe mencionar "prueba" (trae: ${sourceLabelTexto})`);
assert(!/prueba/i.test(topbarUpdatedTexto), `El encabezado ya no debe mencionar "prueba" (trae: ${topbarUpdatedTexto.replace(/\s+/g, " ").trim()})`);
assert(versionTexto === window.SNSP_CONFIG.platform.version, `El pie de página debe mostrar la versión real de la plataforma (trae: ${versionTexto})`);
assert(/exploratori/i.test(topbarUpdatedTexto), "El encabezado debe seguir señalando que es un módulo/herramienta exploratoria");

console.log(`\n=== RESULTADO: ${fallas === 0 ? "TODAS LAS PRUEBAS PASARON" : fallas + " PRUEBA(S) FALLARON"} ===`);
process.exitCode = fallas === 0 ? 0 : 1;
