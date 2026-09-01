/**
 * modules/categoricalModuleView.js
 * -----------------------------------------------------------------------
 * Vista de módulo para datos reales agregados por categoría (CACU y
 * Cáncer de Mama, 2025). Sustituye a modules/moduleView.js para estos dos
 * módulos porque las bases oficiales no traen año, municipio,
 * jurisdicción, institución ni población de referencia — sólo entidad y
 * variables categóricas — así que los indicadores posibles son distintos
 * (conteos y distribuciones, no incidencia/cobertura/tendencia).
 *
 * modules/moduleView.js se conserva intacto como plantilla para módulos
 * futuros que sí cuenten con esa granularidad (dengue, mortalidad, etc.).
 * -----------------------------------------------------------------------
 */
function SNSP_renderCategoricalModulePage(opts) {
  // opts: { moduleId: "cacu" | "mama", title, sourceLabel }
  window.SNSP_AUTH.requireAuth("../index.html");

  SNSP_renderSidebar("sidebar", opts.moduleId);
  SNSP_renderTopbar("topbar", {
    title: opts.title,
    subtitle: "Módulo epidemiológico — datos nacionales 2025",
    updated: "Ver fecha de archivo en Metodología",
    rootPath: "../",
  });

  const isCacu = opts.moduleId === "cacu";
  const moduleSourceKeys = isCacu
    ? ["cacu_casos", "cacu_citologia_bl", "cacu_citologias", "cacu_pcr"]
    : ["cama_casos", "cama_mastografias"];

  // El filtro de entidad es dinámico (según qué entidades tengan datos),
  // así que se agrega en tiempo de ejecución al catálogo de filtros.
  // Se usa la UNIÓN de entidades entre todas las fuentes del módulo (no
  // sólo casos confirmados): una entidad puede tener mastografías o
  // citologías sin tener todavía un caso confirmado, y debe seguir siendo
  // una opción válida del filtro.
  // NOTA: SNSP_FILTER_DEFS se declara con `const` en components/filterBar.js
  // como una vinculación global de script clásico (no una propiedad de
  // `window`); como este archivo se carga después en la misma página,
  // comparte ese mismo ámbito léxico y puede extender el objeto
  // directamente por su nombre.
  SNSP_FILTER_DEFS.entidad = {
    label: "Entidad federativa",
    options: () => window.SNSP_REAL_SERVICE.getEntidadesDisponiblesUnion(moduleSourceKeys),
  };

  let currentFilters = {};
  let charts = {};
  function destroyCharts() { Object.values(charts).forEach((c) => c && c.destroy()); charts = {}; }

  function renderAll() {
    const ind = isCacu
      ? window.SNSP_REAL_SERVICE.getCacuIndicadores(currentFilters)
      : window.SNSP_REAL_SERVICE.getMamaIndicadores(currentFilters);

    if (!ind) {
      document.getElementById("empty-state-wrap").style.display = "block";
      document.getElementById("data-panels").style.display = "none";
      return;
    }

    const hasAnyData = isCacu
      ? (ind.casos_confirmados.total > 0 || ind.citologia_convencional.total > 0 || ind.citologia_base_liquida.total > 0 || ind.pcr_vph.total > 0)
      : (ind.casos_confirmados.total > 0 || ind.mastografias.total > 0);
    document.getElementById("empty-state-wrap").style.display = hasAnyData ? "none" : "block";
    document.getElementById("data-panels").style.display = hasAnyData ? "" : "none";
    destroyCharts();
    if (!hasAnyData) return;

    const svc = window.SNSP_REAL_SERVICE;
    const lugarTexto = currentFilters.entidad ? `la entidad ${currentFilters.entidad}` : "el ámbito nacional";
    const periodoTexto = "2025";
    const programaTexto = opts.title;

    // ---- KPIs ----
    const kpis = isCacu ? [
      { label: "Casos confirmados CACU", value: ind.casos_confirmados.total, accent: "var(--c-vino)", footnote: "Total de registros, filtro aplicado" },
      { label: "Citologías convencionales", value: ind.citologia_convencional.total, accent: "var(--c-dorado)", footnote: "Total de pruebas registradas" },
      { label: "Citologías base líquida", value: ind.citologia_base_liquida.total, accent: "var(--c-verde-claro)", footnote: "Total de pruebas registradas" },
      { label: "Pruebas PCR para VPH", value: ind.pcr_vph.total, accent: "var(--c-rojo-claro)", footnote: "Total de pruebas registradas" },
    ] : [
      { label: "Casos confirmados de mama", value: ind.casos_confirmados.total, accent: "var(--c-vino)", footnote: "Total de registros, filtro aplicado" },
      { label: "Mastografías registradas", value: ind.mastografias.total, accent: "var(--c-dorado)", footnote: "Total de estudios registrados" },
    ];
    document.getElementById("kpi-grid").innerHTML = kpis.map(SNSP_indicatorCardHTML).join("");

    // ---- Distribución por entidad (barra + mapa) ----
    const porEntidad = svc.toRankedArray(ind.casos_confirmados.por_entidad, { top: 15 });
    charts.entidad = SNSP_renderBarChart("chart-entidad", porEntidad.map((r) => r.label), porEntidad.map((r) => r.value), "Casos", {
      horizontal: true,
      tituloPartes: { indicador: "Casos confirmados", dimension: "entidad federativa (top 15)", padecimiento: programaTexto, lugar: lugarTexto, periodo: periodoTexto },
    });
    const mapData = {};
    Object.entries(ind.casos_confirmados.por_entidad).forEach(([k, v]) => { mapData[k] = v; });
    SNSP_renderMapNacional("map-svg", "map-legend", mapData, { unit: " casos" });

    // ---- Distribución por plan de tratamiento (donut) ----
    const porPlan = svc.toRankedArray(ind.casos_confirmados.por_plan);
    charts.plan = SNSP_renderDoughnut("chart-plan", porPlan.map((r) => r.label), porPlan.map((r) => r.value), {
      tituloPartes: { indicador: "Casos confirmados", dimension: "plan de tratamiento", padecimiento: programaTexto, lugar: lugarTexto, periodo: periodoTexto },
    });

    // ---- Distribución por resultado histopatológico (barra) ----
    const porResultado = svc.toRankedArray(ind.casos_confirmados.por_resultado, { top: 12 });
    charts.resultado = SNSP_renderBarChart("chart-resultado", porResultado.map((r) => r.label), porResultado.map((r) => r.value), "Casos", {
      horizontal: true,
      tituloPartes: { indicador: "Casos confirmados", dimension: "resultado histopatológico", padecimiento: programaTexto, lugar: lugarTexto, periodo: periodoTexto },
    });
    document.getElementById("codigo-pendiente-note").style.display = (isCacu && ind.catalogo_codigos_pendiente) ? "block" : "none";

    // ---- Tabla ranking por entidad ----
    document.getElementById("ranking-body").innerHTML = porEntidad.map((r, i) => `
      <tr>
        <td><span class="rank-badge ${i < 3 ? "top" : ""}">${i + 1}</span></td>
        <td class="col-text">${r.label}</td>
        <td>${r.value}</td>
        <td>${r.pct}%</td>
      </tr>
    `).join("");
    document.getElementById("table-count").textContent = `${porEntidad.length} entidades con datos de un total de ${porEntidad.length ? Object.keys(ind.casos_confirmados.por_entidad).length : 0}`;

    if (isCacu) {
      const porCitBL = svc.toRankedArray(ind.citologia_base_liquida.por_resultado, { top: 12 });
      charts.citBL = SNSP_renderBarChart("chart-cit-bl", porCitBL.map((r) => r.label), porCitBL.map((r) => r.value), "Pruebas", {
        horizontal: true,
        wrapAt: 40,
        tituloPartes: { indicador: "Pruebas registradas", dimension: "resultado citológico (base líquida)", padecimiento: programaTexto, lugar: lugarTexto, periodo: periodoTexto },
      });

      const porCit = svc.toRankedArray(ind.citologia_convencional.por_resultado, { top: 12 });
      charts.cit = SNSP_renderBarChart("chart-cit-conv", porCit.map((r) => r.label), porCit.map((r) => r.value), "Pruebas", {
        horizontal: true,
        wrapAt: 40,
        tituloPartes: { indicador: "Pruebas registradas", dimension: "resultado citológico (convencional)", padecimiento: programaTexto, lugar: lugarTexto, periodo: periodoTexto },
      });

      const porPcr = svc.toRankedArray(ind.pcr_vph.por_resultado);
      charts.pcr = SNSP_renderDoughnut("chart-pcr", porPcr.map((r) => r.label), porPcr.map((r) => r.value), {
        tituloPartes: { indicador: "Pruebas registradas", dimension: "resultado de PCR para VPH", padecimiento: programaTexto, lugar: lugarTexto, periodo: periodoTexto },
      });
    } else {
      const porMasto = svc.toRankedArray(ind.mastografias.por_resultado, { top: 12 });
      charts.masto = SNSP_renderBarChart("chart-mastografias", porMasto.map((r) => r.label), porMasto.map((r) => r.value), "Estudios", {
        horizontal: true,
        wrapAt: 30,
        tituloPartes: { indicador: "Estudios registrados", dimension: "resultado (BI-RADS)", padecimiento: programaTexto, lugar: lugarTexto, periodo: periodoTexto },
      });
    }
  }

  SNSP_renderFilterBar("filter-bar", ["entidad"], (filters) => {
    currentFilters = filters;
    renderAll();
    window.SNSP_AUTH.logAction("aplicar_filtros", `Módulo: ${opts.title} — ${JSON.stringify(filters)}`);
  });

  const canDownload = window.SNSP_AUTH.can("descargar");
  ["btn-export-pdf", "btn-export-xlsx"].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = true; // Exportación real pendiente de implementar (ver README) — nunca se simula.
    btn.title = "Exportación pendiente de implementar";
  });

  document.getElementById("source-label").textContent = opts.sourceLabel;
  document.getElementById("version-tag-module").textContent = window.SNSP_CONFIG.platform.version;

  renderAll();
}
