/**
 * modules/poblacionModuleView.js
 * -----------------------------------------------------------------------
 * Vista del módulo de Población — ESTADO DE QUERÉTARO (padrón 2025).
 * Módulo independiente de consulta poblacional: pirámide por sexo/grupo
 * de edad, mapa ilustrativo por municipio, ranking de municipios y tabla
 * de localidades con búsqueda. No calcula tasas ni incidencia de otros
 * módulos (CACU, Mama, Morbilidad): es el padrón, no un denominador
 * aplicado — ver README para el plan de usarlo como tal más adelante.
 * -----------------------------------------------------------------------
 */
function SNSP_renderPoblacionModulePage(opts) {
  window.SNSP_AUTH.requireAuth("../index.html");

  SNSP_renderSidebar("sidebar", "poblacion");
  SNSP_renderTopbar("topbar", {
    title: "Población del estado de Querétaro",
    subtitle: "Padrón poblacional 2025 — por municipio y localidad",
    updated: "Ver fecha de archivo en Metodología",
    rootPath: "../",
  });

  const svc = window.SNSP_POBLACION_SERVICE;
  const ambito = svc.getAmbito();
  const catalogos = svc.getCatalogos();

  let currentFilters = {}; // { municipio }
  let busquedaLocalidad = "";
  let charts = {};
  function destroyCharts() { Object.values(charts).forEach((c) => c && c.destroy()); charts = {}; }

  function lugarTexto() {
    return currentFilters.municipio ? `el municipio de ${currentFilters.municipio}` : "el estado de Querétaro";
  }

  const TABLA_LIMITE = 80;

  function renderAll() {
    const resumen = svc.getResumen(currentFilters);
    destroyCharts();

    // ---- KPIs ----
    const localidadTop = svc.getLocalidadMasPoblada(currentFilters);
    document.getElementById("kpi-grid").innerHTML = [
      { label: "Población total", value: SNSP_formatNumber(resumen.total), accent: "var(--c-vino)", footnote: lugarTexto() },
      { label: "Mujeres", value: SNSP_formatNumber(resumen.mujeres), accent: "var(--c-rojo-claro)", footnote: resumen.total ? SNSP_formatPercent((resumen.mujeres / resumen.total) * 100) + " del total" : "" },
      { label: "Hombres", value: SNSP_formatNumber(resumen.hombres), accent: "var(--c-verde-claro)", footnote: resumen.total ? SNSP_formatPercent((resumen.hombres / resumen.total) * 100) + " del total" : "" },
      { label: "Localidades", value: SNSP_formatNumber(resumen.localidades), accent: "var(--c-dorado)", footnote: currentFilters.municipio ? `En ${currentFilters.municipio}` : `En los ${resumen.municipios} municipios` },
      { label: "Localidad más poblada", value: localidadTop ? SNSP_formatNumber(localidadTop.total) : null, accent: "var(--c-gris-oscuro)", footnote: localidadTop ? `${localidadTop.localidad} (${localidadTop.municipio})` : "" },
      { label: "Con desglose de edad", value: resumen.total ? SNSP_formatPercent((resumen.poblacion_con_desglose_edad / resumen.total) * 100) : null, accent: "var(--c-beige)", footnote: `${SNSP_formatNumber(resumen.localidades - resumen.localidades_sin_desglose_edad)} de ${SNSP_formatNumber(resumen.localidades)} localidades` },
    ].map(SNSP_indicatorCardHTML).join("");

    // ---- Pirámide poblacional ----
    // La fuente no trae desglose por grupo de edad para las localidades
    // más grandes (cabeceras municipales, zonas urbanas): ahí las 3 bandas
    // jóvenes/mayores vienen en cero y todo el total aparece volcado en
    // "20-59" (ver build_poblacion.py). Esas localidades se excluyen del
    // cálculo de la pirámide para no mostrar una banda 20-59 inflada
    // artificialmente; se avisa explícitamente qué porcentaje de la
    // población queda fuera de esta gráfica en particular.
    const piramide = svc.getPiramide(currentFilters);
    const lugarPiramide = resumen.poblacion_con_desglose_edad
      ? `${lugarTexto()} (sólo localidades con desglose de edad en la fuente)`
      : lugarTexto();
    charts.piramide = SNSP_renderPopulationPyramid("chart-piramide", piramide.bandas, piramide.mujeres, piramide.hombres, {
      tituloPartes: { indicador: "Población", dimension: "sexo y grupo de edad", padecimiento: null, lugar: lugarPiramide, periodo: "2025" },
    });

    const notaEdad = document.getElementById("nota-cobertura-edad");
    if (resumen.poblacion_sin_desglose_edad > 0) {
      const pct = Math.round((resumen.poblacion_sin_desglose_edad / resumen.total) * 1000) / 10;
      notaEdad.style.display = "block";
      notaEdad.innerHTML = `<strong>Cobertura de datos:</strong> la fuente no trae desglose por grupo de edad para ` +
        `${SNSP_formatNumber(resumen.localidades_sin_desglose_edad)} localidades de ${lugarTexto()} ` +
        `(típicamente cabeceras municipales y zonas urbanas grandes) — ` +
        `${SNSP_formatNumber(resumen.poblacion_sin_desglose_edad)} habitantes (${SNSP_formatPercent(pct)} del total mostrado en los KPIs). ` +
        `La pirámide y la distribución por grupo de edad de abajo se calculan únicamente con las ` +
        `${SNSP_formatNumber(resumen.poblacion_con_desglose_edad)} personas de localidades que sí cuentan con ese desglose en la fuente; ` +
        `los totales de población, mujeres y hombres de los KPIs sí incluyen a todas las localidades.`;
    } else {
      notaEdad.style.display = "none";
    }

    // ---- Distribución por grupo de edad (dona, mujeres + hombres) ----
    const bandasLabels = piramide.bandas;
    const bandasTotales = bandasLabels.map((_, i) => piramide.mujeres[i] + piramide.hombres[i]);
    charts.edad = SNSP_renderDoughnut("chart-grupo-edad", bandasLabels, bandasTotales, {
      tituloPartes: { indicador: "Población", dimension: "grupo de edad", padecimiento: null, lugar: lugarPiramide, periodo: "2025" },
    });

    // ---- Población por municipio (siempre los 18, de mayor a menor) —
    // sólo se muestra/tiene sentido cuando no hay un municipio ya
    // seleccionado en el filtro (si no, el mapa y la barra serían un
    // único valor). ----
    const panelMunicipios = document.getElementById("panel-por-municipio");
    if (!currentFilters.municipio) {
      panelMunicipios.style.display = "";
      const porMun = svc.getPorMunicipio().slice().sort((a, b) => b.total - a.total);
      charts.municipio = SNSP_renderBarChart("chart-municipio", porMun.map((m) => m.municipio), porMun.map((m) => m.total), "Población", {
        horizontal: true,
        tituloPartes: { indicador: "Población total", dimension: "municipio", padecimiento: null, lugar: "el estado de Querétaro", periodo: "2025" },
      });
      SNSP_renderMapQueretaro("mapa-municipios", "mapa-leyenda", porMun.map((m) => ({ municipio: m.municipio, value: m.total })), { unit: " hab." });
    } else {
      panelMunicipios.style.display = "none";
    }

    // ---- Tabla de localidades ----
    const filtrosTabla = Object.assign({}, currentFilters, { busqueda: busquedaLocalidad, limit: TABLA_LIMITE });
    const localidades = svc.buscarLocalidades(filtrosTabla);
    const totalCoincidencias = svc.contarLocalidades(Object.assign({}, currentFilters, { busqueda: busquedaLocalidad }));
    document.getElementById("localidades-body").innerHTML = localidades.map((l) => `
      <tr>
        <td class="col-text">${l.localidad}</td>
        <td class="col-text">${l.municipio}</td>
        <td>${SNSP_formatNumber(l.total)}</td>
        <td>${SNSP_formatNumber(l.mujeres)}</td>
        <td>${SNSP_formatNumber(l.hombres)}</td>
        <td>${l.desglose_edad_valido ? "Sí" : "<span class=\"text-muted\">No disponible</span>"}</td>
      </tr>
    `).join("") || `<tr><td colspan="6" class="text-muted">Sin coincidencias</td></tr>`;
    document.getElementById("localidades-count").textContent =
      `Mostrando ${localidades.length} de ${totalCoincidencias} localidades` +
      (totalCoincidencias > TABLA_LIMITE ? ` (usa el buscador o el filtro de municipio para acotar)` : "");
  }

  // ---- Filtro de municipio (barra estándar) ----
  const filterDefs = {
    municipio_poblacion: { label: "Municipio", options: () => catalogos.municipios },
  };
  Object.assign(SNSP_FILTER_DEFS, filterDefs);
  SNSP_renderFilterBar("filter-bar", Object.keys(filterDefs), (filters) => {
    currentFilters = { municipio: filters.municipio_poblacion };
    renderAll();
    window.SNSP_AUTH.logAction("aplicar_filtros", `Módulo: Población — ${JSON.stringify(currentFilters)} — búsqueda: ${busquedaLocalidad || "(ninguna)"}`);
  });

  // ---- Búsqueda de localidad (independiente, sobre la tabla) ----
  document.getElementById("localidad-search").addEventListener("input", (e) => {
    busquedaLocalidad = e.target.value;
    renderAll();
  });

  const canDownload = window.SNSP_AUTH.can("descargar");
  ["btn-export-pdf", "btn-export-xlsx"].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = true;
    btn.title = "Exportación pendiente de implementar";
  });

  document.getElementById("source-label").textContent =
    `Padrón poblacional oficial, estado de Querétaro (${ambito ? ambito.anio : ""}) — ${ambito ? SNSP_formatNumber(ambito.total_localidades) : 0} localidades, ${ambito ? ambito.total_municipios : 0} municipios`;
  document.getElementById("version-tag-module").textContent = window.SNSP_CONFIG.platform.version;

  renderAll();
}
