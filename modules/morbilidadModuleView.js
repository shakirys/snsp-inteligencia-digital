/**
 * modules/morbilidadModuleView.js
 * -----------------------------------------------------------------------
 * Vista del módulo de Morbilidad — ESTADO DE QUERÉTARO (2024-2026).
 * Primera prueba funcional: consulta por código CIE-10 / Epi-clave /
 * padecimiento, con filtros de año, municipio, jurisdicción, institución,
 * CLUES y mes. No incluye comparativos nacionales ni filtro de entidad —
 * la fuente sólo trae Querétaro. Ver README / metodología para el plan de
 * incorporar una base nacional más adelante sin rediseñar este módulo.
 *
 * Sigue el mismo patrón que modules/categoricalModuleView.js (KPIs,
 * gráficas, ranking, tabla) pero con lógica propia porque el cubo de
 * morbilidad tiene una dimensión adicional (el padecimiento a consultar)
 * y más variables reales (municipio, jurisdicción, institución, año, mes,
 * CLUES) que CACU/Mama.
 * -----------------------------------------------------------------------
 */
function SNSP_renderMorbilidadModulePage(opts) {
  window.SNSP_AUTH.requireAuth("../index.html");

  SNSP_renderSidebar("sidebar", "morbilidad");
  SNSP_renderTopbar("topbar", {
    title: "Morbilidad en el estado de Querétaro",
    subtitle: "Módulo epidemiológico — datos estatales 2024-2026 (prueba funcional)",
    updated: "Ver fecha de archivo en Metodología",
    rootPath: "../",
  });

  const svc = window.SNSP_MORBILIDAD_SERVICE;
  const ambito = svc.getAmbito();
  const catalogos = svc.getCatalogos();

  // ---- Lugar y periodo para los títulos dinámicos de las gráficas ----
  // Prioridad de lugar: municipio > jurisdicción > institución > estado de
  // Querétaro (la base es exclusivamente estatal, no hay comparativo
  // nacional). `excluir` evita mencionar el mismo nivel que ya es la
  // dimensión de la gráfica (p. ej. no repetir "en el municipio de X" en
  // la gráfica que precisamente desglosa "por municipio").
  function lugarTexto(excluir) {
    const f = currentFilters;
    if (f.municipio && excluir !== "municipio") return `el municipio de ${f.municipio}`;
    if (f.jurisdiccion && excluir !== "jurisdiccion") return `la Jurisdicción Sanitaria de ${f.jurisdiccion}`;
    if (f.institucion && excluir !== "institucion") return `la institución ${f.institucion}`;
    return "el estado de Querétaro";
  }
  function periodoTexto() {
    const f = currentFilters;
    const mesLimpio = f.mes ? f.mes.replace(/^\d+\s*/, "") : null;
    if (f.anio && mesLimpio) return `${mesLimpio} de ${f.anio}`;
    if (f.anio) return `${f.anio}`;
    if (mesLimpio) return `${mesLimpio} (todos los años disponibles)`;
    const anios = (catalogos.anios || []).slice().sort();
    if (anios.length > 1) return `el periodo ${anios[0]}–${anios[anios.length - 1]}`;
    return anios.length ? `${anios[0]}` : "todos los años disponibles";
  }

  // Los 18 municipios de Querétaro SIEMPRE se muestran, orden mayor a
  // menor, con 0 para los que no tengan casos en la selección/filtros
  // actuales — nunca se ocultan por tener pocos o ningún caso.
  function municipiosCompletos(porMunicipio) {
    const completos = (catalogos.municipios || []).map((m) => ({ label: m, value: porMunicipio[m] || 0 }));
    completos.sort((a, b) => b.value - a.value);
    return completos;
  }

  let seleccion = { epiclaves: [], etiqueta: "" };
  let currentFilters = {};
  let charts = {};
  let chartsGenerales = {};
  function destroyCharts() { Object.values(charts).forEach((c) => c && c.destroy()); charts = {}; }
  function destroyChartsGenerales() { Object.values(chartsGenerales).forEach((c) => c && c.destroy()); chartsGenerales = {}; }

  // ---- Catálogo CIE-10 / búsqueda ----
  function renderResultadosBusqueda(texto) {
    const box = document.getElementById("cie10-resultados");
    const resultados = svc.buscarPadecimientos(texto, { limit: 25 });
    if (!texto) { box.innerHTML = ""; box.style.display = "none"; return; }
    if (!resultados.length) {
      box.innerHTML = `<div class="cie10-suggestion cie10-suggestion--empty">Sin coincidencias en el catálogo disponible</div>`;
      box.style.display = "block";
      return;
    }
    box.innerHTML = resultados.map((p) => `
      <button type="button" class="cie10-suggestion" data-epiclave="${p.epiclave}">
        <span class="cie10-suggestion__code">${p.cie10_texto || "s/c"}</span>
        <span class="cie10-suggestion__label">${p.padecimiento}</span>
        <span class="cie10-suggestion__epi">Epi-clave ${p.epiclave}</span>
      </button>
    `).join("");
    box.style.display = "block";
    box.querySelectorAll(".cie10-suggestion[data-epiclave]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = svc.getPadecimiento(btn.getAttribute("data-epiclave"));
        seleccionarPadecimientos([p.epiclave], `${p.cie10_texto ? p.cie10_texto + " — " : ""}${p.padecimiento}`);
        document.getElementById("cie10-search").value = p.padecimiento;
        box.style.display = "none";
      });
    });
  }

  function seleccionarPadecimientos(epiclaves, etiqueta) {
    seleccion = { epiclaves, etiqueta };
    document.getElementById("seleccion-actual").innerHTML = etiqueta
      ? `Consultando: <strong>${etiqueta}</strong> <button type="button" class="btn btn-ghost btn-sm" id="btn-limpiar-seleccion">Quitar</button>`
      : "";
    const limpiarBtn = document.getElementById("btn-limpiar-seleccion");
    if (limpiarBtn) limpiarBtn.addEventListener("click", () => {
      seleccionarPadecimientos([], "");
      document.getElementById("cie10-search").value = "";
    });
    renderAll();
  }

  // ---- Accesos rápidos ----
  function renderAccesosRapidos() {
    const accesos = svc.getAccesosRapidos();
    document.getElementById("accesos-rapidos").innerHTML = accesos.map((a) => `
      <button type="button" class="quick-code-chip ${a.disponible ? "" : "is-disabled"}"
              data-codigo="${a.codigo}" ${a.disponible ? "" : "disabled title=\"No presente en esta base\""}>
        ${a.codigo}
      </button>
    `).join("");
    document.querySelectorAll(".quick-code-chip[data-codigo]:not(.is-disabled)").forEach((btn) => {
      btn.addEventListener("click", () => {
        const codigo = btn.getAttribute("data-codigo");
        const acceso = accesos.find((a) => a.codigo === codigo);
        if (!acceso || !acceso.disponible) return;
        const nombres = acceso.epiclaves.map((e) => (svc.getPadecimiento(e) || {}).padecimiento).join(" / ");
        seleccionarPadecimientos(acceso.epiclaves, `${codigo} — ${nombres}`);
        document.getElementById("cie10-search").value = codigo;
        document.getElementById("cie10-resultados").style.display = "none";
      });
    });
  }

  function renderAll() {
    const hasSeleccion = seleccion.epiclaves.length > 0;
    document.getElementById("panel-sin-seleccion").style.display = hasSeleccion ? "none" : "block";
    document.getElementById("data-panels").style.display = hasSeleccion ? "" : "none";

    // ---- Panel general (sin selección): principales padecimientos con
    // los filtros transversales aplicados, para orientar la búsqueda.
    // Se muestran como gráfica de barras horizontales (más fácil de leer
    // que sólo la tabla) y también en la tabla de detalle, sin quitar
    // ninguna de las dos. ----
    const principalesGenerales = svc.getPrincipalesPadecimientos(currentFilters, 12);
    document.getElementById("principales-generales-body").innerHTML = principalesGenerales.map((r, i) => `
      <tr>
        <td><span class="rank-badge ${i < 3 ? "top" : ""}">${i + 1}</span></td>
        <td class="col-text">${r.padecimiento}</td>
        <td class="col-text">${r.cie10_texto || "—"}</td>
        <td>${r.casos}</td>
      </tr>
    `).join("");

    destroyChartsGenerales();
    if (!hasSeleccion) {
      chartsGenerales.principales = SNSP_renderBarChart(
        "chart-principales-generales",
        principalesGenerales.map((r) => `${r.padecimiento}${r.cie10_texto ? " (" + r.cie10_texto + ")" : ""}`),
        principalesGenerales.map((r) => r.casos),
        "Casos",
        {
          horizontal: true,
          wrapAt: 36,
          tituloPartes: { indicador: "Principales padecimientos registrados", dimension: null, padecimiento: null, lugar: lugarTexto(), periodo: periodoTexto() },
        }
      );
    }

    if (!hasSeleccion) { destroyCharts(); return; }

    const ind = svc.getIndicadores(Object.assign({}, currentFilters, { epiclaves: seleccion.epiclaves }));
    destroyCharts();

    // ---- KPI: total de casos ----
    document.getElementById("kpi-grid").innerHTML = [
      { label: "Casos en Querétaro", value: ind.total, accent: "var(--c-vino)", footnote: seleccion.etiqueta },
      { label: "Municipios con casos", value: Object.keys(ind.por_municipio).length || null, accent: "var(--c-dorado)", footnote: "Con al menos un caso, filtro aplicado" },
      { label: "Unidades médicas (CLUES)", value: Object.keys(ind.por_clues).length || null, accent: "var(--c-verde-claro)", footnote: "Con al menos un caso, filtro aplicado" },
      { label: "Grupo de edad", value: null, accent: "var(--c-rojo-claro)", footnote: "No disponible en esta fuente" },
    ].map(SNSP_indicatorCardHTML).join("");

    if (!ind.total) { return; }

    // ---- Casos por municipio: SIEMPRE los 18 municipios de Querétaro,
    // de mayor a menor, con 0 para los que no tengan casos (nunca se
    // ocultan) ----
    const porMunCompletos = municipiosCompletos(ind.por_municipio);
    charts.municipio = SNSP_renderBarChart("chart-municipio", porMunCompletos.map((r) => r.label), porMunCompletos.map((r) => r.value), "Casos", {
      horizontal: true,
      tituloPartes: { indicador: "Casos registrados", dimension: "municipio", padecimiento: seleccion.etiqueta, lugar: lugarTexto("municipio"), periodo: periodoTexto() },
    });
    const sinCasos = porMunCompletos.filter((r) => r.value === 0).length;
    const notaMun = document.getElementById("nota-municipios-sin-casos");
    if (notaMun) {
      notaMun.style.display = sinCasos > 0 ? "inline-block" : "none";
      notaMun.textContent = sinCasos > 0
        ? `${sinCasos} de los 18 municipios de Querétaro no registran casos en el periodo/filtros seleccionados.`
        : "";
    }

    // ---- Casos por jurisdicción ----
    const porJuris = svc.toRankedArray(ind.por_jurisdiccion);
    charts.jurisdiccion = SNSP_renderDoughnut("chart-jurisdiccion", porJuris.map((r) => r.label), porJuris.map((r) => r.value), {
      tituloPartes: { indicador: "Casos registrados", dimension: "jurisdicción sanitaria", padecimiento: seleccion.etiqueta, lugar: lugarTexto("jurisdiccion"), periodo: periodoTexto() },
    });

    // ---- Casos por institución ----
    const porInsti = svc.toRankedArray(ind.por_institucion);
    charts.institucion = SNSP_renderBarChart("chart-institucion", porInsti.map((r) => r.label), porInsti.map((r) => r.value), "Casos", {
      horizontal: true,
      wrapAt: 24,
      tituloPartes: { indicador: "Casos registrados", dimension: "institución de salud", padecimiento: seleccion.etiqueta, lugar: lugarTexto("institucion"), periodo: periodoTexto() },
    });

    // ---- Casos por mes y año (serie) ----
    const anios = catalogos.anios.slice().sort();
    const mesesSerie = catalogos.meses;
    const seriesPorAnio = anios.map((anio) => ({
      label: String(anio),
      data: mesesSerie.map((mes) => ind.por_anio_mes[anio + "|" + mes] || 0),
    })).filter((s) => s.data.some((v) => v > 0));
    charts.tiempo = SNSP_renderGroupedBarChart("chart-tiempo", mesesSerie.map((m) => m.slice(3, 6)), seriesPorAnio, "Casos", {
      tituloPartes: { indicador: "Distribución mensual de casos registrados", dimension: null, padecimiento: seleccion.etiqueta, lugar: lugarTexto(), periodo: periodoTexto() },
    });

    // ---- Tendencia anual: sólo aporta valor si hay más de un año
    // disponible y no se filtró ya a un año específico (en ese caso no
    // habría variación que mostrar). ----
    const panelTendenciaAnual = document.getElementById("panel-tendencia-anual");
    if (!currentFilters.anio && anios.length > 1) {
      panelTendenciaAnual.style.display = "";
      const dataAnual = anios.map((a) => ind.por_anio[a] || 0);
      charts.tendenciaAnual = SNSP_renderLineChart("chart-tendencia-anual", anios.map(String), [
        { label: "Casos", data: dataAnual },
      ], {
        tituloPartes: { indicador: "Casos registrados", dimension: "año", padecimiento: seleccion.etiqueta, lugar: lugarTexto(), periodo: `el periodo ${anios[0]}–${anios[anios.length - 1]}` },
      });
    } else {
      panelTendenciaAnual.style.display = "none";
    }

    // ---- Grupo de edad / sexo: no disponibles, panel explícito ----
    // (los contenedores respectivos ya muestran el aviso fijo en el HTML)

    // ---- Principales padecimientos dentro de la selección (si el
    // acceso rápido agrupa más de un epi-clave, p.ej. N87) ----
    const porPad = Object.entries(ind.por_padecimiento).map(([epi, casos]) => {
      const p = svc.getPadecimiento(epi);
      return { label: p ? `${p.padecimiento}${p.cie10_texto ? " (" + p.cie10_texto + ")" : ""}` : epi, value: casos };
    }).sort((a, b) => b.value - a.value);
    charts.padecimientos = SNSP_renderBarChart("chart-padecimientos", porPad.map((r) => r.label), porPad.map((r) => r.value), "Casos", {
      horizontal: true,
      wrapAt: 34,
      tituloPartes: { indicador: "Casos registrados", dimension: "padecimiento (Epi-clave)", padecimiento: seleccion.etiqueta, lugar: lugarTexto(), periodo: periodoTexto() },
    });

    // ---- Detalle por CLUES / unidad médica ----
    const porCluesArr = svc.toRankedArray(ind.por_clues, { top: 60 });
    document.getElementById("clues-body").innerHTML = porCluesArr.map((r) => {
      const info = svc.getClues(r.label) || {};
      const nombre = info.nombre_unidad_oficial || info.unidad_medica || r.label;
      return `
        <tr>
          <td class="col-text">${r.label}</td>
          <td class="col-text">${nombre}</td>
          <td class="col-text">${info.municipio || "—"}</td>
          <td class="col-text">${info.institucion || "—"}</td>
          <td>${r.value}</td>
        </tr>
      `;
    }).join("");
    document.getElementById("clues-count").textContent = `Mostrando ${porCluesArr.length} de ${Object.keys(ind.por_clues).length} CLUES con casos`;
  }

  // ---- Filtros transversales (año, municipio, jurisdicción, institución, mes) ----
  const filterDefs = {
    anio_morbilidad: { label: "Año", options: () => catalogos.anios },
    municipio_morbilidad: { label: "Municipio", options: () => catalogos.municipios },
    jurisdiccion_morbilidad: { label: "Jurisdicción sanitaria", options: () => catalogos.jurisdicciones },
    institucion_morbilidad: { label: "Institución", options: () => catalogos.instituciones },
    mes_morbilidad: { label: "Mes", options: () => catalogos.meses },
  };
  Object.assign(SNSP_FILTER_DEFS, filterDefs);
  SNSP_renderFilterBar("filter-bar", Object.keys(filterDefs), (filters) => {
    currentFilters = {
      anio: filters.anio_morbilidad,
      municipio: filters.municipio_morbilidad,
      jurisdiccion: filters.jurisdiccion_morbilidad,
      institucion: filters.institucion_morbilidad,
      mes: filters.mes_morbilidad,
    };
    renderAll();
    window.SNSP_AUTH.logAction("aplicar_filtros", `Módulo: Morbilidad — ${JSON.stringify(currentFilters)} — selección: ${seleccion.etiqueta || "(ninguna)"}`);
  });

  document.getElementById("cie10-search").addEventListener("input", (e) => renderResultadosBusqueda(e.target.value));
  document.addEventListener("click", (e) => {
    const wrap = document.getElementById("cie10-search-wrap");
    if (wrap && !wrap.contains(e.target)) document.getElementById("cie10-resultados").style.display = "none";
  });

  const canDownload = window.SNSP_AUTH.can("descargar");
  ["btn-export-pdf", "btn-export-xlsx"].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = true;
    btn.title = "Exportación pendiente de implementar";
  });

  document.getElementById("source-label").textContent = `Base oficial de morbilidad, estado de Querétaro (${ambito ? ambito.anios_disponibles.join("-") : ""}) — 160 padecimientos, ${ambito ? ambito.total_clues : 0} CLUES`;
  document.getElementById("version-tag-module").textContent = window.SNSP_CONFIG.platform.version;

  renderAccesosRapidos();
  renderAll();
}
