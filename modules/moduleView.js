/**
 * modules/moduleView.js
 * -----------------------------------------------------------------------
 * Vista genérica de módulo epidemiológico. CACU y Cáncer de Mama (y los
 * módulos futuros: dengue, morbilidad, mortalidad, vacunación, salud
 * mental, crónicas) reutilizan esta misma función en vez de duplicar
 * HTML/JS por módulo. Cada página sólo pasa su configuración particular.
 * -----------------------------------------------------------------------
 */

function SNSP_renderModulePage(opts) {
  // opts: { moduleId, title, unit, mapUnit, sourceLabel }
  window.SNSP_AUTH.requireAuth("../index.html");

  SNSP_renderSidebar("sidebar", opts.moduleId);
  SNSP_renderTopbar("topbar", { title: opts.title, subtitle: "Módulo epidemiológico — Querétaro", updated: "15/07/2026", rootPath: "../" });

  const moduleData = window.SNSP_DATA_SERVICE.getModuleData(opts.moduleId);
  let currentFilters = {};

  function avg(rows, field) {
    if (!rows.length) return null;
    return Math.round((rows.reduce((s, r) => s + r[field], 0) / rows.length) * 10) / 10;
  }
  function sum(rows, field) {
    return rows.reduce((s, r) => s + r[field], 0);
  }

  let charts = {};
  function destroyCharts() { Object.values(charts).forEach((c) => c && c.destroy()); charts = {}; }

  function renderAll() {
    const rows = window.SNSP_DATA_SERVICE.applyFilters(moduleData.detalle, currentFilters);

    // ---- KPIs ----
    const kpis = [
      { label: "Casos registrados", value: rows.length ? sum(rows, "casos") : null, accent: "var(--c-vino)", footnote: "Suma del periodo filtrado" },
      { label: `Incidencia (x100k)`, value: rows.length ? avg(rows, "incidencia_100k") : null, accent: "var(--c-rojo-claro)", footnote: "Promedio del periodo filtrado" },
      { label: "Cobertura de tamizaje", value: rows.length ? avg(rows, "cobertura_tamizaje_pct") + "%" : null, accent: "var(--c-dorado)", footnote: "Promedio del periodo filtrado" },
      { label: "Mortalidad (x100k)", value: rows.length ? avg(rows, "mortalidad_100k") : null, accent: "var(--c-verde-claro)", footnote: "Promedio del periodo filtrado" },
    ];
    document.getElementById("kpi-grid").innerHTML = kpis.map(SNSP_indicatorCardHTML).join("");

    // ---- Empty state ----
    document.getElementById("empty-state-wrap").style.display = rows.length ? "none" : "block";
    document.getElementById("data-panels").style.display = rows.length ? "" : "none";
    if (!rows.length) { destroyCharts(); return; }

    // ---- Gráfica de tendencia (línea) ----
    destroyCharts();
    const byYear = window.SNSP_DATA_SERVICE.aggregateByYear(rows, "incidencia_100k");
    charts.trend = SNSP_renderLineChart("chart-trend", byYear.map((d) => d.anio), [
      { label: "Incidencia x100k", data: byYear.map((d) => d.value) },
    ], {
      tituloPartes: { indicador: "Incidencia (x100k)", dimension: "año", padecimiento: opts.title, lugar: "el estado de Querétaro", periodo: currentFilters.anio ? String(currentFilters.anio) : "todos los años disponibles" },
    });

    // ---- Gráfica de barras por jurisdicción ----
    const jurisdicciones = window.SNSP_CONFIG.catalogs.jurisdicciones;
    const byJurisdiccion = jurisdicciones.map((j) => avg(rows.filter((r) => r.jurisdiccion === j), "cobertura_tamizaje_pct") || 0);
    charts.bar = SNSP_renderBarChart("chart-jurisdiccion", jurisdicciones.map((j) => j.replace("Jurisdicción ", "J. ")), byJurisdiccion, "Cobertura %", {
      horizontal: true,
      tituloPartes: { indicador: "Cobertura de tamizaje", dimension: "jurisdicción sanitaria", padecimiento: opts.title, lugar: "el estado de Querétaro", periodo: currentFilters.anio ? String(currentFilters.anio) : "todos los años disponibles" },
    });

    // ---- Ranking de municipios ----
    const ranking = window.SNSP_DATA_SERVICE.rankMunicipios(rows, "incidencia_100k", "desc");
    document.getElementById("ranking-body").innerHTML = ranking.slice(0, 10).map((r, i) => `
      <tr>
        <td><span class="rank-badge ${i < 3 ? "top" : ""}">${i + 1}</span></td>
        <td class="col-text">${r.municipio}</td>
        <td>${r.value}</td>
        <td>${r.casos}</td>
      </tr>
    `).join("");

    // ---- Mapa ----
    const mapAgg = window.SNSP_DATA_SERVICE.aggregateByMunicipio(rows, "incidencia_100k");
    SNSP_renderMapQueretaro("map-svg", "map-legend", mapAgg, { unit: opts.mapUnit || "" });

    // ---- Tabla dinámica ----
    document.getElementById("table-body").innerHTML = rows.slice(0, 60).map((r) => `
      <tr>
        <td>${r.anio}</td>
        <td class="col-text">${r.jurisdiccion.replace("Jurisdicción ", "J. ")}</td>
        <td class="col-text">${r.municipio}</td>
        <td class="col-text">${r.institucion}</td>
        <td>${r.casos}</td>
        <td>${r.incidencia_100k}</td>
        <td>${r.cobertura_tamizaje_pct}%</td>
        <td>${r.mortalidad_100k}</td>
      </tr>
    `).join("");
    document.getElementById("table-count").textContent = `Mostrando ${Math.min(rows.length, 60)} de ${rows.length} registros`;
  }

  SNSP_renderFilterBar("filter-bar", ["anio", "periodo", "jurisdiccion", "municipio", "institucion", "grupo_edad"], (filters) => {
    currentFilters = filters;
    renderAll();
    window.SNSP_AUTH.logAction("aplicar_filtros", `Módulo: ${opts.title} — ${JSON.stringify(filters)}`);
  });

  const canDownload = window.SNSP_AUTH.can("descargar");
  document.getElementById("btn-export-pdf").disabled = !canDownload;
  document.getElementById("btn-export-xlsx").disabled = !canDownload;
  if (!canDownload) {
    document.getElementById("btn-export-pdf").title = "Tu perfil no tiene permiso de descarga";
    document.getElementById("btn-export-xlsx").title = "Tu perfil no tiene permiso de descarga";
  }
  document.getElementById("btn-export-pdf").addEventListener("click", () => {
    if (canDownload) alert("Exportación a PDF: función preparada para conectarse en la siguiente fase.");
  });
  document.getElementById("btn-export-xlsx").addEventListener("click", () => {
    if (canDownload) alert("Exportación a Excel: función preparada para conectarse en la siguiente fase.");
  });

  document.getElementById("source-label").textContent = opts.sourceLabel || "Datos de ejemplo — SNSP Querétaro";
  document.getElementById("version-tag-module").textContent = window.SNSP_CONFIG.platform.version;

  renderAll();
}
