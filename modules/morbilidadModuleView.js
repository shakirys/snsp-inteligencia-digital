/**
 * modules/morbilidadModuleView.js
 * -----------------------------------------------------------------------
 * Vista del módulo de Morbilidad — ESTADO DE QUERÉTARO (2022-2026).
 * Reescritura completa (reemplaza la versión 2025-2026/ACT16) a partir de
 * TRES bases nuevas e independientes:
 *   - data/real/morbilidad_historico_2022_2026.js       (BLOQUE 1)
 *   - data/real/morbilidad_padecimientos_2022_2026.js   (BLOQUE 2)
 *   - data/real/morbilidad_poblacion_2022_2026.js       (BLOQUE 3)
 *
 * REGLA NO NEGOCIABLE (instrucción explícita de la usuaria, SNSP
 * Jurisdicción Sanitaria No. 1): estas tres bases NO se cruzan entre sí
 * más allá de lo que sus columnas realmente permiten (ver cabecera de
 * scripts/build_morbilidad_historico.py para el detalle verificado
 * contra los archivos crudos). En concreto, en ESTE archivo:
 *
 *   - BLOQUE 1 (Casos/Territorio/Instituciones) y BLOQUE 2
 *     (Padecimientos) son DOS TABLEROS COMPLETAMENTE SEPARADOS, con sus
 *     propios filtros, su propia gráfica/tabla principal y su propio
 *     Panorama de Casos — nunca comparten un filtro ni un cálculo. El
 *     Bloque 1 NO tiene acceso a Padecimiento/Epi-Clave/CIE-10 (viven
 *     sólo en el Bloque 2) y el Bloque 2 NO tiene acceso a
 *     Municipio/Jurisdicción/Institución/Unidad médica (viven sólo en
 *     el Bloque 1). El buscador de Padecimiento/CIE-10/Epi-clave sólo
 *     filtra el Bloque 2.
 *   - Tasa (Casos/Población×100,000) SÓLO se ofrece dentro del Bloque 1,
 *     y SÓLO para "Por" = Municipio, Jurisdicción sanitaria o Grupo de
 *     edad (las únicas dimensiones que, junto con Año, la Base de
 *     Población sí desagrega) — nunca por Institución, Unidad médica ni
 *     Sexo: varias instituciones/unidades médicas atienden
 *     simultáneamente el mismo municipio, así que sumar población por
 *     esa dimensión sobrecontaría (mismo razonamiento ya usado por
 *     services/cargaDataService.js, agregarConPoblacion, que NUNCA se
 *     modifica aquí). El Bloque 2 NUNCA ofrece Tasa ni Población, bajo
 *     ninguna dimensión: su base no tiene Municipio, así que no existe
 *     una relación válida con la Base de Población.
 *   - Un Grupo de edad sin fila de población ("De edad desconocida", ver
 *     meta.grupos_edad_sin_poblacion del bundle de Población) muestra
 *     Tasa como "No aplica", nunca 0% ni un valor calculado con un
 *     denominador inventado — services/cargaDataService.js ya devuelve
 *     `tasa: null` en ese caso; este archivo sólo decide cómo se
 *     IMPRIME ese null (nunca lo convierte a 0).
 *
 * CIE-10 se conserva: se extrae del propio texto de Padecimiento
 * ("Nombre(CIE10)") de la Base de Padecimientos, con la misma lógica de
 * siempre (ver build_morbilidad_historico.py) — no se fabrica ninguna
 * relación nueva.
 *
 * Ya no se usa un bundle "temporal" aparte (como en 2025-2026): la Base
 * de Casos Históricos ya trae Mes+Sexo+Grupo de edad+Municipio+
 * Institución+Unidad médica juntos en cada fila, así que Tendencia,
 * Comparativo por mes y año y Casos por sexo del Bloque 1 se calculan
 * directo del bundle principal. El Bloque 2 sí trae Semana (el Bloque 1
 * no), así que sus propias gráficas temporales pueden filtrarse también
 * por semana epidemiológica.
 * -----------------------------------------------------------------------
 */
function SNSP_renderMorbilidadModulePage(opts) {
  window.SNSP_AUTH.requireAuth("../index.html");

  SNSP_renderSidebar("sidebar", "morbilidad");
  SNSP_renderTopbar("topbar", {
    title: "Morbilidad en el estado de Querétaro",
    subtitle: "Módulo epidemiológico — datos estatales 2022-2026",
    rootPath: "../",
  });

  const datosH = window.SNSP_MORBILIDAD_HISTORICO_DATA;
  const datosP = window.SNSP_MORBILIDAD_PADECIMIENTOS_DATA;
  const poblacionData = window.SNSP_MORBILIDAD_POBLACION_DATA;
  const svcCarga = window.SNSP_CARGA_SERVICE;

  if (!datosH || !datosP || !svcCarga) {
    document.querySelector(".app-content").innerHTML =
      '<div class="empty-state"><h3>Dato pendiente de carga</h3><p class="text-muted">No se encontraron las bases de Morbilidad 2022-2026. Verifica que data/real/morbilidad_historico_2022_2026.js y data/real/morbilidad_padecimientos_2022_2026.js estén incluidos.</p></div>';
    return;
  }

  // =======================================================================
  // BLOQUE 1 — Casos / Territorio / Instituciones
  // =======================================================================
  const headersH = datosH.headers; // ["Año","Jurisdicción","Municipio","Institución","Unidad médica","Mes","Grupo de edad","Sexo","Casos"]
  const rowsH = datosH.rows;
  const idxH = {
    anio: headersH.indexOf("Año"),
    jurisdiccion: headersH.indexOf("Jurisdicción"),
    municipio: headersH.indexOf("Municipio"),
    institucion: headersH.indexOf("Institución"),
    unidad_medica: headersH.indexOf("Unidad médica"),
    mes: headersH.indexOf("Mes"),
    grupo_edad: headersH.indexOf("Grupo de edad"),
    sexo: headersH.indexOf("Sexo"),
    casos: headersH.indexOf("Casos"),
  };
  const catH = datosH.catalogos || { anios: [], jurisdicciones: [], municipios: [], instituciones: [], unidadesMedicas: [], meses: [], gruposEdad: [], sexos: [] };

  const joinCols = svcCarga.detectarColumnasClave(headersH);
  const poblacionIndex = poblacionData
    ? svcCarga.indexarPoblacion(poblacionData.headers, poblacionData.rows)
    : { completo: false, mapa: new Map() };
  const poblacionDisponible = poblacionIndex.completo &&
    joinCols.colAnio !== -1 && joinCols.colMunicipio !== -1 && joinCols.colGrupoEdad !== -1;
  const gruposEdadSinPoblacion = new Set((poblacionData && poblacionData.meta && poblacionData.meta.grupos_edad_sin_poblacion) || []);

  const dimColMapH = {
    municipio: idxH.municipio, jurisdiccion: idxH.jurisdiccion, institucion: idxH.institucion,
    unidad_medica: idxH.unidad_medica, grupo_edad: idxH.grupo_edad, sexo: idxH.sexo,
  };
  const dimLabelMapH = {
    municipio: "municipio", jurisdiccion: "jurisdicción sanitaria", institucion: "institución",
    unidad_medica: "unidad médica", grupo_edad: "grupo de edad", sexo: "sexo",
  };
  // Única razón real de esta lista: son las ÚNICAS dimensiones para las que
  // la Base de Población (Año+Municipio+Grupo de edad) ofrece un
  // denominador sin sobrecontar (ver cabecera del archivo). Institución,
  // Unidad médica y Sexo quedan fuera a propósito.
  const DIMENSIONES_CON_TASA_VALIDA = new Set(["municipio", "jurisdiccion", "grupo_edad"]);

  let currentFiltersH = {}; // { municipio_morbilidad, jurisdiccion_morbilidad, institucion_morbilidad, unidad_medica_morbilidad }
  let chartH = null;
  let rowsHFiltradas = rowsH;

  // =======================================================================
  // BLOQUE 2 — Padecimientos
  // =======================================================================
  const headersP = datosP.headers; // ["Año","Epi-Clave","Padecimiento","Mes","Semana","Grupo de edad","Sexo","Casos"]
  const rowsP = datosP.rows;
  const idxP = {
    anio: headersP.indexOf("Año"),
    epiclave: headersP.indexOf("Epi-Clave"),
    padecimiento: headersP.indexOf("Padecimiento"),
    mes: headersP.indexOf("Mes"),
    semana: headersP.indexOf("Semana"),
    grupo_edad: headersP.indexOf("Grupo de edad"),
    sexo: headersP.indexOf("Sexo"),
    casos: headersP.indexOf("Casos"),
  };
  const catP = datosP.catalogos || { anios: [], meses: [], semanas: [], gruposEdad: [], sexos: [] };
  const catalogoPadecimientos = datosP.catalogo_padecimientos || [];
  const mesSemanaMeta = (datosP.meta && datosP.meta.mes_semana) || {};

  const dimColMapP = { padecimiento: idxP.padecimiento, grupo_edad: idxP.grupo_edad, sexo: idxP.sexo };
  const dimLabelMapP = { padecimiento: "padecimiento", grupo_edad: "grupo de edad", sexo: "sexo" };

  let seleccionPadecimiento = null; // {epiclave, padecimiento, cie10_texto, ...} | null
  let chartP = null;
  let rowsPFiltradas = rowsP;

  // Año: catálogo único — ambas bases cubren exactamente los mismos años
  // (verificado al construir los bundles); se usa el del Bloque 1 como
  // referencia y se aplica a los dos tableros a la vez.
  const catalogosAnio = (catH.anios && catH.anios.length ? catH.anios : catP.anios) || [];
  const ANIO_PARCIAL = (datosH.meta && datosH.meta.anio_parcial) || (datosP.meta && datosP.meta.anio_parcial) || null;
  const ANIO_PARCIAL_NOTA = (datosH.meta && datosH.meta.anio_parcial_nota) || "";

  // -----------------------------------------------------------------------
  // Utilidades genéricas (sin depender de qué bloque las usa)
  // -----------------------------------------------------------------------
  function _norm(s) { return (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  function _nombreMes(mes) {
    const m = /^\d{2}\s+(.+)$/.exec(mes || "");
    const nombre = m ? m[1] : (mes || "");
    return nombre.slice(0, 3);
  }
  function _nombreMesLargo(mesCat) {
    const m = /^\d{2}\s+(.+)$/.exec(mesCat || "");
    return m ? m[1] : (mesCat || "");
  }

  function _morbFormatoCompacto(n) {
    let v;
    try {
      if (n === null || n === undefined) return "0";
      v = Number(n);
    } catch (e) {
      return "0";
    }
    if (!isFinite(v)) return "0";
    if (Math.abs(v) < 1000) return SNSP_formatNumber(v);
    const miles = v / 1000;
    return miles.toLocaleString("es-MX", { minimumFractionDigits: Math.abs(miles) < 10 ? 1 : 0, maximumFractionDigits: Math.abs(miles) < 10 ? 1 : 0 }) + "k";
  }
  const MORB_OPTS_ETIQUETA_MENSUAL = { formatter: _morbFormatoCompacto, valueLabelFontSize: 8, pointLabelSplit: true };

  function _lineasEtiquetaMorb(categoria, wrapAt) {
    wrapAt = wrapAt || 26;
    if (typeof categoria !== "string" || categoria.length <= wrapAt) return 1;
    if (typeof SNSP_wrapLabel === "function") {
      const lineas = SNSP_wrapLabel(categoria, wrapAt);
      return Array.isArray(lineas) ? lineas.length : 1;
    }
    return Math.ceil(categoria.length / wrapAt);
  }

  const MORB_BAR_THICKNESS = 22;
  const MORB_BAR_PCT_CLASICO = 0.85;
  const MORB_CAT_PCT_CLASICO = 0.85;
  const MORB_BAR_PCT_COMPARATIVO = 0.92;
  const MORB_CAT_PCT_COMPARATIVO = 0.65;

  function _morbBarraOpts(comparativo) {
    return comparativo
      ? { maxBarThickness: MORB_BAR_THICKNESS, barPercentage: MORB_BAR_PCT_COMPARATIVO, categoryPercentage: MORB_CAT_PCT_COMPARATIVO }
      : { maxBarThickness: MORB_BAR_THICKNESS, barPercentage: MORB_BAR_PCT_CLASICO, categoryPercentage: MORB_CAT_PCT_CLASICO };
  }
  function _alturaCategoriaBarras(comparativo, nSeries) {
    const barPct = comparativo ? MORB_BAR_PCT_COMPARATIVO : MORB_BAR_PCT_CLASICO;
    const catPct = comparativo ? MORB_CAT_PCT_COMPARATIVO : MORB_CAT_PCT_CLASICO;
    const series = comparativo ? Math.max(nSeries || 2, 2) : 1;
    const gapEntreBarras = MORB_BAR_THICKNESS * (1 / barPct - 1);
    const altoBarras = series * MORB_BAR_THICKNESS + Math.max(0, series - 1) * gapEntreBarras;
    return altoBarras / catPct;
  }
  function _ajustarAlturaBarra(wrapId, categorias, comparativo, nSeries) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const alturaPorSeries = _alturaCategoriaBarras(comparativo, nSeries);
    const maxLineas = categorias.reduce((m, c) => Math.max(m, _lineasEtiquetaMorb(c, 26)), 1);
    const alturaPorEtiqueta = maxLineas * 16;
    const alturaPorCategoria = Math.max(alturaPorSeries, alturaPorEtiqueta);
    wrap.style.height = Math.max(260, categorias.length * alturaPorCategoria + 90) + "px";
  }

  function _contarCategoriasConDatos(chartInst) {
    if (!chartInst || !chartInst.data) return null;
    const labels = chartInst.data.labels || [];
    const datasets = chartInst.data.datasets || [];
    let conDatos = 0;
    labels.forEach((_, i) => {
      const algunoConValor = datasets.some((ds) => {
        const v = (ds.data || [])[i];
        return typeof v === "number" && v > 0;
      });
      if (algunoConValor) conDatos++;
    });
    return { conDatos, total: labels.length };
  }

  // ---- Chips multiselect genérico (Año / Mes / Semana) — un solo render,
  // reutilizado por los 2 bloques (Mes y Semana de cada uno son listas
  // independientes, nunca compartidas). ----
  function _renderMultiselectChips(menuId, chipsId, opciones, etiquetaFn, seleccionados, onChange, etiquetaTodo) {
    const menu = document.getElementById(menuId);
    const chipsEl = document.getElementById(chipsId);
    if (!menu || !chipsEl) return;
    const textoTodo = etiquetaTodo || "Todos";
    const seleccionSet = new Set(seleccionados || []);
    const opcionesHtml = opciones.map((v) => `
      <label class="carga-anio-opcion"><input type="checkbox" value="${v}" ${seleccionSet.has(v) ? "checked" : ""}> ${etiquetaFn(v)}</label>
    `).join("");
    menu.innerHTML = opciones.length
      ? `<button type="button" class="carga-anio-opcion-todos" data-accion="seleccionar-todos">Seleccionar ${textoTodo === "Todas" ? "todas" : "todos"}</button>${opcionesHtml}`
      : opcionesHtml;
    function renderChips() {
      const marcados = Array.from(menu.querySelectorAll("input:checked")).map((i) => i.value);
      const todoMarcado = opciones.length > 0 && marcados.length === opciones.length;
      chipsEl.innerHTML = (!marcados.length || todoMarcado)
        ? `<span class="text-muted" style="font-size:var(--fs-body-sm);">${textoTodo}</span>`
        : marcados.map((v) => `<span class="carga-anio-chip" data-valor="${v}">${etiquetaFn(v)} <button type="button" aria-label="Quitar ${etiquetaFn(v)}">&times;</button></span>`).join("");
    }
    renderChips();
    menu.querySelectorAll("input[type=checkbox]").forEach((chk) => {
      chk.addEventListener("change", () => { renderChips(); onChange(); });
    });
    const btnTodos = menu.querySelector('[data-accion="seleccionar-todos"]');
    if (btnTodos) {
      btnTodos.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.querySelectorAll("input[type=checkbox]").forEach((chk) => { chk.checked = true; });
        renderChips();
        onChange();
      });
    }
    chipsEl.onclick = (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const valor = btn.closest(".carga-anio-chip").dataset.valor;
      const chk = Array.from(menu.querySelectorAll("input[type=checkbox]")).find((i) => i.value === valor);
      if (chk) { chk.checked = false; renderChips(); onChange(); }
    };
  }
  function _initToggleMultiselect(toggleId, menuId, contId) {
    const toggleBtn = document.getElementById(toggleId);
    const menu = document.getElementById(menuId);
    const cont = document.getElementById(contId);
    if (!toggleBtn || !menu || !cont) return;
    toggleBtn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener("click", (e) => { if (!cont.contains(e.target)) menu.hidden = true; });
  }
  function _leerMarcados(menuId) {
    const menu = document.getElementById(menuId);
    // [value] excluye controles auxiliares sin atributo value propio, como
    // el checkbox "Seleccionar todos" del filtro Año (ver
    // inicializarFiltroAnio) — nunca debe colarse como si fuera un año.
    return menu ? Array.from(menu.querySelectorAll("input[type=checkbox][value]:checked")).map((i) => i.value) : [];
  }

  // ---- Año (comparar) — global para ambos bloques. ----
  function leerAniosSeleccionados() { return _leerMarcados("morb-anio-menu"); }
  function _aniosEnAlcance() {
    const marcados = leerAniosSeleccionados();
    return marcados.length ? marcados.slice().sort() : catalogosAnio.slice().sort();
  }
  function _textoComparativo(anios) { return `Comparativo ${anios.join(" vs ")}`; }
  function periodoTexto(aniosSeleccionados) {
    if (aniosSeleccionados.length === 1) return `${aniosSeleccionados[0]}`;
    const anios = catalogosAnio.slice().sort();
    return anios.length > 1 ? `el periodo ${anios[0]}–${anios[anios.length - 1]}` : (anios[0] ? `${anios[0]}` : "el periodo disponible");
  }
  function _notaAnioParcial(aniosSeleccionados) {
    return (ANIO_PARCIAL && aniosSeleccionados.includes(ANIO_PARCIAL)) ? ` (${ANIO_PARCIAL} parcial: Ene-Sep)` : "";
  }

  function inicializarFiltroAnio() {
    const menu = document.getElementById("morb-anio-menu");
    const chipsEl = document.getElementById("morb-anio-chips");
    const toggleBtn = document.getElementById("morb-anio-toggle");
    const cont = document.getElementById("morb-anio-multiselect");
    if (!menu || !chipsEl || !toggleBtn || !cont) return;
    const valores = catalogosAnio.slice().sort();
    // "Seleccionar todos" es un checkbox propio, SIN atributo value (por
    // eso _leerMarcados lo excluye con el selector input[value]) — se
    // sincroniza con el estado real de los años: marcado sólo cuando los
    // 4-5 años están todos marcados a la vez, y se desmarca en cuanto se
    // desmarca cualquiera de ellos. La selección individual y la
    // multiselección existentes no cambian.
    menu.innerHTML = `
      <label class="carga-anio-opcion carga-anio-opcion-todos-check">
        <input type="checkbox" id="morb-anio-todos-check"> Seleccionar todos
      </label>
      ${valores.map((v) => `
      <label class="carga-anio-opcion"><input type="checkbox" value="${v}"> ${v}${v === ANIO_PARCIAL ? " (parcial)" : ""}</label>
    `).join("")}`;
    const chkTodos = document.getElementById("morb-anio-todos-check");
    function _checksAnio() { return Array.from(menu.querySelectorAll("input[type=checkbox][value]")); }
    function _sincronizarTodos() {
      const chks = _checksAnio();
      const marcados = chks.filter((c) => c.checked).length;
      chkTodos.checked = chks.length > 0 && marcados === chks.length;
      chkTodos.indeterminate = marcados > 0 && marcados < chks.length;
    }
    function renderChips() {
      const seleccionados = _checksAnio().filter((c) => c.checked).map((i) => i.value);
      chipsEl.innerHTML = seleccionados.length
        ? seleccionados.map((v) => `<span class="carga-anio-chip" data-valor="${v}">${v}${v === ANIO_PARCIAL ? " ⚠" : ""} <button type="button" aria-label="Quitar ${v}">&times;</button></span>`).join("")
        : `<span class="text-muted" style="font-size:var(--fs-body-sm);">${_textoComparativo(valores)} (ningún año marcado)</span>`;
      _sincronizarTodos();
    }
    renderChips();
    function _refrescarMesSemanaSiAplica() {
      if (typeof _poblarSelectsMesSemanaP === "function") _poblarSelectsMesSemanaP();
    }
    _checksAnio().forEach((chk) => {
      chk.addEventListener("change", () => { renderChips(); _refrescarMesSemanaSiAplica(); renderTableroH(); renderTableroP(); });
    });
    chkTodos.addEventListener("change", () => {
      _checksAnio().forEach((c) => { c.checked = chkTodos.checked; });
      renderChips();
      _refrescarMesSemanaSiAplica();
      renderTableroH();
      renderTableroP();
    });
    chipsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const valor = btn.closest(".carga-anio-chip").dataset.valor;
      const chk = _checksAnio().find((i) => i.value === valor);
      if (chk) { chk.checked = false; renderChips(); _refrescarMesSemanaSiAplica(); renderTableroH(); renderTableroP(); }
    });
    toggleBtn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener("click", (e) => { if (!cont.contains(e.target)) menu.hidden = true; });
  }
  inicializarFiltroAnio();

  // =======================================================================
  // BLOQUE 1 — Mes (sin Semana: la Base de Casos Históricos no la trae)
  // =======================================================================
  function _mesesSeleccionadosH() { return _leerMarcados("morb-h-mes-menu"); }
  function _poblarMesH() {
    if (!document.getElementById("morb-h-mes-menu")) return;
    const mesesActuales = _mesesSeleccionadosH();
    const disponibles = (catH.meses || []).slice();
    const validos = mesesActuales.filter((m) => disponibles.includes(m));
    _renderMultiselectChips("morb-h-mes-menu", "morb-h-mes-chips", disponibles, (v) => v, validos, renderTableroH, "Todos");
  }
  if (document.getElementById("morb-h-mes-menu")) {
    _initToggleMultiselect("morb-h-mes-toggle", "morb-h-mes-menu", "morb-h-mes-multiselect");
    _poblarMesH();
  }
  function _filtrarPorMesH(rowsBase) {
    const meses = _mesesSeleccionadosH();
    if (!meses.length) return rowsBase;
    const set = new Set(meses);
    return rowsBase.filter((r) => set.has(String(r[idxH.mes])));
  }
  function _textoMesPeriodoH() {
    const sel = _mesesSeleccionadosH();
    if (!sel.length || sel.length === (catH.meses || []).length) return "";
    const ordenados = sel.slice().sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    if (ordenados.length === 1) return _nombreMesLargo(ordenados[0]);
    const contiguo = ordenados.every((m, i) => i === 0 || parseInt(m, 10) === parseInt(ordenados[i - 1], 10) + 1);
    return contiguo ? `${_nombreMesLargo(ordenados[0])}–${_nombreMesLargo(ordenados[ordenados.length - 1])}` : ordenados.map(_nombreMesLargo).join(", ");
  }
  function _periodoCompletoTextoH(aniosSeleccionados, modoComparativo) {
    const base = modoComparativo ? _textoComparativo(aniosSeleccionados) : periodoTexto(aniosSeleccionados);
    const sufijo = _textoMesPeriodoH();
    return (sufijo ? `${base} | ${sufijo}` : base) + _notaAnioParcial(aniosSeleccionados);
  }
  function _periodoTituloTextoH(aniosSeleccionados, modoComparativo) {
    const base = modoComparativo ? `comparativo ${aniosSeleccionados.join(" vs ")}` : periodoTexto(aniosSeleccionados);
    const sufijo = _textoMesPeriodoH();
    return sufijo ? `${base} | ${sufijo}` : base;
  }
  function _conSufijoPeriodoH(texto) {
    const sufijo = _textoMesPeriodoH();
    return sufijo ? `${texto} — ${sufijo}` : texto;
  }
  function _mesesEnAlcanceH() {
    const sel = _mesesSeleccionadosH();
    const catalogo = (catH.meses || []).slice();
    return sel.length ? catalogo.filter((m) => sel.includes(m)) : catalogo;
  }

  // ---- Filtros Bloque 1: Municipio / Jurisdicción / Institución / Unidad
  // médica (Unidad médica es dimensión NUEVA: antes no existía en ninguna
  // base del proyecto) ----
  const filterDefsH = {
    municipio_morbilidad: { label: "Municipio", options: () => catH.municipios },
    jurisdiccion_morbilidad: { label: "Jurisdicción sanitaria", options: () => catH.jurisdicciones },
    institucion_morbilidad: { label: "Institución", options: () => catH.instituciones },
    unidad_medica_morbilidad: { label: "Unidad médica", options: () => catH.unidadesMedicas },
  };
  Object.assign(SNSP_FILTER_DEFS, filterDefsH);
  SNSP_renderFilterBar("filter-bar-h", Object.keys(filterDefsH), (filters) => {
    currentFiltersH = filters;
    renderTableroH();
    window.SNSP_AUTH.logAction("aplicar_filtros", `Módulo: Morbilidad (Bloque 1) — ${JSON.stringify(currentFiltersH)}`);
  });

  const selMedidaH = document.getElementById("morb-h-select-medida");
  const selDimH = document.getElementById("morb-h-select-dim");
  if (!poblacionDisponible && selMedidaH) {
    Array.from(selMedidaH.options).forEach((opt) => { if (opt.value !== "casos") opt.disabled = true; });
    selMedidaH.value = "casos";
  }
  // Tasa sólo disponible para Municipio/Jurisdicción/Grupo de edad (ver
  // DIMENSIONES_CON_TASA_VALIDA) — nunca Institución/Unidad médica/Sexo.
  function _actualizarDisponibilidadTasaH() {
    if (!selMedidaH || !selDimH) return;
    const tasaOpt = Array.from(selMedidaH.options).find((o) => o.value === "tasa");
    if (!tasaOpt) return;
    const valido = poblacionDisponible && DIMENSIONES_CON_TASA_VALIDA.has(selDimH.value);
    tasaOpt.disabled = !valido;
    if (!valido && selMedidaH.value === "tasa") selMedidaH.value = "casos";
  }
  if (selMedidaH) selMedidaH.addEventListener("change", renderTableroH);
  if (selDimH) selDimH.addEventListener("change", () => { _actualizarDisponibilidadTasaH(); renderTableroH(); });
  _actualizarDisponibilidadTasaH();

  const selPrincipalTopNH = document.getElementById("morb-h-principal-topn");
  if (selPrincipalTopNH) selPrincipalTopNH.addEventListener("change", renderTableroH);

  function nombreMedidaH() {
    if (!selMedidaH) return "Casos";
    if (selMedidaH.value === "poblacion") return "Población";
    if (selMedidaH.value === "tasa") return "Tasa (por 100,000 hab.)";
    return "Casos";
  }
  function _filtrosActivosH() {
    const list = [];
    if (currentFiltersH.municipio_morbilidad) list.push({ colIdx: idxH.municipio, valor: currentFiltersH.municipio_morbilidad });
    if (currentFiltersH.jurisdiccion_morbilidad) list.push({ colIdx: idxH.jurisdiccion, valor: currentFiltersH.jurisdiccion_morbilidad });
    if (currentFiltersH.institucion_morbilidad) list.push({ colIdx: idxH.institucion, valor: currentFiltersH.institucion_morbilidad });
    if (currentFiltersH.unidad_medica_morbilidad) list.push({ colIdx: idxH.unidad_medica, valor: currentFiltersH.unidad_medica_morbilidad });
    return list;
  }
  function lugarTextoH() {
    const f = currentFiltersH;
    if (f.municipio_morbilidad) return `el municipio de ${f.municipio_morbilidad}`;
    if (f.jurisdiccion_morbilidad) return `la Jurisdicción Sanitaria de ${f.jurisdiccion_morbilidad}`;
    if (f.institucion_morbilidad) return `la institución ${f.institucion_morbilidad}`;
    if (f.unidad_medica_morbilidad) return `la unidad médica ${f.unidad_medica_morbilidad}`;
    return "el estado de Querétaro";
  }

  // ACT24 fix: antes recibía sólo los filtros y agregaba siempre sobre
  // TODAS las filas de rowsHFiltradas (sin restringir por año salvo que
  // hubiera exactamente 1 año marcado) — así, al dejar 2+ años marcados
  // pero no todos (p. ej. quitar 2022 y dejar 2023-2026), el KPI "Casos
  // totales" seguía sumando los 5 años completos. Ahora recibe también
  // las filas YA restringidas a los años seleccionados (rowsBase, ver
  // rowsHEnAlcanceAnio en renderTableroH) para que siempre coincida con
  // lo que muestran la gráfica y la tabla.
  function _calcularTotalesH(filtrosParaAgregar, rowsBase) {
    const resultados = svcCarga.agregarConPoblacion(rowsBase, idxH.municipio, idxH.casos, filtrosParaAgregar, joinCols, poblacionIndex.mapa);
    let totalCasos = 0, totalPoblacion = 0, hayPoblacion = false;
    resultados.forEach((r) => {
      totalCasos += r.valorCasos;
      if (r.poblacion !== null && r.poblacion !== undefined) { totalPoblacion += r.poblacion; hayPoblacion = true; }
    });
    const tasaGlobal = (hayPoblacion && totalPoblacion > 0) ? (totalCasos / totalPoblacion) * 100000 : null;
    return { totalCasos, totalPoblacion: hayPoblacion ? totalPoblacion : null, tasaGlobal };
  }

  // -----------------------------------------------------------------------
  // Panorama de Casos — Bloque 1: Municipio, Jurisdicción, Institución,
  // Unidad médica (NUEVO), Grupo de edad, Sexo, Tendencia por año/mes,
  // Comparativo por mes y año. Todos de Casos únicamente.
  // -----------------------------------------------------------------------
  const panoramaCharts = {}; // canvasId -> instancia Chart (compartido entre los 2 bloques: ids únicos)
  function _destruirPanorama(canvasId) {
    if (panoramaCharts[canvasId]) { panoramaCharts[canvasId].destroy(); panoramaCharts[canvasId] = null; }
  }

  function renderChartMunicipio(filtrosActivos, aniosSeleccionados, modoComparativo) {
    _destruirPanorama("morb-h-chart-municipio");
    const municipiosTodos = (catH.municipios || []).slice();
    const tituloPartes = { indicador: "Casos", dimension: "municipio", padecimiento: null, lugar: lugarTextoH(), periodo: _periodoTituloTextoH(aniosSeleccionados, modoComparativo) };
    let categorias;
    if (modoComparativo) {
      const resultados = svcCarga.agregarComparativo(rowsHFiltradas, idxH.municipio, idxH.casos, filtrosActivos, idxH.anio, aniosSeleccionados);
      const mapa = {};
      resultados.forEach((r) => { mapa[r.categoria] = r.valores; });
      categorias = municipiosTodos.slice().sort((a, b) => {
        const ta = aniosSeleccionados.reduce((s, y) => s + ((mapa[a] && mapa[a][y]) || 0), 0);
        const tb = aniosSeleccionados.reduce((s, y) => s + ((mapa[b] && mapa[b][y]) || 0), 0);
        return tb - ta;
      });
      const seriesPorAnio = aniosSeleccionados.map((y) => ({ label: y, data: categorias.map((c) => (mapa[c] && mapa[c][y]) || 0) }));
      _ajustarAlturaBarra("morb-h-wrap-municipio", categorias, modoComparativo, aniosSeleccionados.length);
      panoramaCharts["morb-h-chart-municipio"] = SNSP_renderGroupedBarChart("morb-h-chart-municipio", categorias, seriesPorAnio, "Casos", Object.assign({ horizontal: true, wrapAt: 26, tituloPartes }, _morbBarraOpts(modoComparativo)));
    } else {
      const filtrosConAnio = aniosSeleccionados.length === 1 ? filtrosActivos.concat([{ colIdx: idxH.anio, valor: aniosSeleccionados[0] }]) : filtrosActivos;
      const resultados = svcCarga.agregar(rowsHFiltradas, idxH.municipio, idxH.casos, filtrosConAnio);
      const mapa = {};
      resultados.forEach((r) => { mapa[r.categoria] = r.valor; });
      categorias = municipiosTodos.slice().sort((a, b) => (mapa[b] || 0) - (mapa[a] || 0));
      _ajustarAlturaBarra("morb-h-wrap-municipio", categorias, modoComparativo, aniosSeleccionados.length);
      panoramaCharts["morb-h-chart-municipio"] = SNSP_renderBarChart("morb-h-chart-municipio", categorias, categorias.map((c) => mapa[c] || 0), "Casos", Object.assign({ horizontal: true, wrapAt: 26, tituloPartes }, _morbBarraOpts(modoComparativo)));
    }
    const subt = document.getElementById("morb-h-subt-municipio");
    if (subt) {
      const conteo = _contarCategoriasConDatos(panoramaCharts["morb-h-chart-municipio"]);
      subt.textContent = (conteo && conteo.conDatos < conteo.total)
        ? `${conteo.conDatos} de ${conteo.total} municipios con casos en el periodo — se muestran los ${conteo.total} para poder comparar años (0 = sin casos registrados)`
        : `Los 18 municipios, incluidos los que no registran casos en la selección`;
    }
  }

  function _renderPanelH(canvasId, wrapId, dimIdx, nombreDim, filtrosActivos, aniosSeleccionados, modoComparativo, opts) {
    opts = opts || {};
    _destruirPanorama(canvasId);
    let categorias, valores, seriesPorAnio, totalCategorias;
    if (modoComparativo) {
      let resultados = svcCarga.agregarComparativo(rowsHFiltradas, dimIdx, idxH.casos, filtrosActivos, idxH.anio, aniosSeleccionados);
      totalCategorias = resultados.length;
      if (opts.limitTop) resultados = resultados.slice(0, opts.limitTop);
      categorias = resultados.map((r) => r.categoria);
      seriesPorAnio = aniosSeleccionados.map((y) => ({ label: y, data: resultados.map((r) => r.valores[y] || 0) }));
    } else {
      const filtrosConAnio = aniosSeleccionados.length === 1 ? filtrosActivos.concat([{ colIdx: idxH.anio, valor: aniosSeleccionados[0] }]) : filtrosActivos;
      let resultados = svcCarga.agregar(rowsHFiltradas, dimIdx, idxH.casos, filtrosConAnio);
      totalCategorias = resultados.length;
      if (opts.limitTop) resultados = resultados.slice(0, opts.limitTop);
      categorias = resultados.map((r) => r.categoria);
      valores = resultados.map((r) => r.valor);
    }
    _ajustarAlturaBarra(wrapId, categorias, modoComparativo, aniosSeleccionados.length);
    const tituloPartes = { indicador: "Casos", dimension: nombreDim, padecimiento: null, lugar: lugarTextoH(), periodo: _periodoTituloTextoH(aniosSeleccionados, modoComparativo) };
    const barraOpts = Object.assign({ horizontal: true, wrapAt: 26, tituloPartes }, _morbBarraOpts(modoComparativo));
    if (modoComparativo) {
      panoramaCharts[canvasId] = SNSP_renderGroupedBarChart(canvasId, categorias, seriesPorAnio, "Casos", barraOpts);
    } else {
      panoramaCharts[canvasId] = SNSP_renderBarChart(canvasId, categorias, valores, "Casos", barraOpts);
    }
    return { mostradas: categorias.length, total: totalCategorias };
  }

  function renderChartJurisdiccion(filtrosActivos, aniosSeleccionados, modoComparativo) {
    _destruirPanorama("morb-h-chart-jurisdiccion");
    const subt = document.getElementById("morb-h-subt-jurisdiccion");
    if (modoComparativo) {
      if (subt) subt.textContent = _periodoCompletoTextoH(aniosSeleccionados, true);
      _renderPanelH("morb-h-chart-jurisdiccion", "morb-h-wrap-jurisdiccion", idxH.jurisdiccion, "jurisdicción sanitaria", filtrosActivos, aniosSeleccionados, true);
    } else {
      if (subt) subt.textContent = _conSufijoPeriodoH("Distribución porcentual dentro de la selección vigente");
      const filtrosConAnio = aniosSeleccionados.length === 1 ? filtrosActivos.concat([{ colIdx: idxH.anio, valor: aniosSeleccionados[0] }]) : filtrosActivos;
      const resultados = svcCarga.agregar(rowsHFiltradas, idxH.jurisdiccion, idxH.casos, filtrosConAnio);
      document.getElementById("morb-h-wrap-jurisdiccion").style.height = "380px";
      const tituloPartes = { indicador: "Casos", dimension: "jurisdicción sanitaria", padecimiento: null, lugar: lugarTextoH(), periodo: _periodoTituloTextoH(aniosSeleccionados, false) };
      panoramaCharts["morb-h-chart-jurisdiccion"] = SNSP_renderDoughnut("morb-h-chart-jurisdiccion", resultados.map((r) => r.categoria), resultados.map((r) => r.valor), { tituloPartes });
    }
  }
  function renderChartInstitucion(filtrosActivos, aniosSeleccionados, modoComparativo) {
    _renderPanelH("morb-h-chart-institucion", "morb-h-wrap-institucion", idxH.institucion, "institución", filtrosActivos, aniosSeleccionados, modoComparativo);
  }
  function renderChartUnidadMedica(filtrosActivos, aniosSeleccionados, modoComparativo) {
    const topN = 20; // 383 unidades médicas: se recorta a las 20 de mayor valor para que el panel sea legible; el total real se muestra en el subtítulo.
    const resultado = _renderPanelH("morb-h-chart-unidadmedica", "morb-h-wrap-unidadmedica", idxH.unidad_medica, "unidad médica", filtrosActivos, aniosSeleccionados, modoComparativo, { limitTop: topN });
    const subt = document.getElementById("morb-h-subt-unidadmedica");
    if (subt) {
      subt.textContent = resultado.total > topN
        ? `Top ${topN} de ${resultado.total} unidades médicas con casos en la selección vigente`
        : `Todas las unidades médicas con casos en la selección vigente (${resultado.total})`;
    }
  }
  function renderChartGrupoEdad(filtrosActivos, aniosSeleccionados, modoComparativo) {
    _renderPanelH("morb-h-chart-grupoedad", "morb-h-wrap-grupoedad", idxH.grupo_edad, "grupo de edad", filtrosActivos, aniosSeleccionados, modoComparativo);
  }
  function renderChartSexoH(filtrosActivos, aniosSeleccionados, modoComparativo) {
    _destruirPanorama("morb-h-chart-sexo");
    const subt = document.getElementById("morb-h-subt-sexo");
    if (subt) subt.textContent = modoComparativo ? _periodoCompletoTextoH(aniosSeleccionados, true) : _conSufijoPeriodoH("Distribución dentro de la selección vigente");
    _renderPanelH("morb-h-chart-sexo", "morb-h-wrap-sexo", idxH.sexo, "sexo", filtrosActivos, aniosSeleccionados, modoComparativo);
  }

  function renderChartTendenciaH(filtrosActivos, aniosSeleccionados) {
    _destruirPanorama("morb-h-chart-tendencia");
    const subt = document.getElementById("morb-h-subt-tendencia");
    const aniosEnAlcance = aniosSeleccionados.length ? aniosSeleccionados.slice().sort() : catalogosAnio.slice().sort();
    const multiAnio = aniosEnAlcance.length > 1;
    if (subt) subt.textContent = multiAnio ? _periodoCompletoTextoH(aniosEnAlcance, true) : _conSufijoPeriodoH(`Evolución mensual ${aniosEnAlcance[0] || ""}`) + _notaAnioParcial(aniosEnAlcance);
    const mesesEnAlcance = _mesesEnAlcanceH();
    function serieDeAnio(anio) {
      return mesesEnAlcance.map((mes) => {
        const filtros = filtrosActivos.concat([{ colIdx: idxH.anio, valor: anio }, { colIdx: idxH.mes, valor: mes }]);
        const resultados = svcCarga.agregar(rowsHFiltradas, idxH.mes, idxH.casos, filtros);
        if (!resultados.length) return null;
        return resultados.reduce((s, r) => s + r.valor, 0);
      });
    }
    const etiquetas = mesesEnAlcance.map(_nombreMes);
    const series = aniosEnAlcance.map((anio) => ({ label: anio, data: serieDeAnio(anio) }));
    const tituloPartes = { indicador: "Casos", dimension: "mes", padecimiento: null, lugar: lugarTextoH(), periodo: _periodoTituloTextoH(aniosEnAlcance, multiAnio) };
    panoramaCharts["morb-h-chart-tendencia"] = SNSP_renderLineChart("morb-h-chart-tendencia", etiquetas, series, Object.assign({ tituloPartes }, MORB_OPTS_ETIQUETA_MENSUAL));
  }
  function renderChartMesAnioH(filtrosActivos, aniosSeleccionados) {
    _destruirPanorama("morb-h-chart-mesanio");
    const subt = document.getElementById("morb-h-subt-mesanio");
    const aniosEnAlcance = aniosSeleccionados.length ? aniosSeleccionados.slice().sort() : catalogosAnio.slice().sort();
    const multiAnio = aniosEnAlcance.length > 1;
    if (subt) subt.textContent = (multiAnio ? _periodoCompletoTextoH(aniosEnAlcance, true) : _conSufijoPeriodoH(`Estacionalidad ${aniosEnAlcance[0] || ""}`)) + (multiAnio ? "" : _notaAnioParcial(aniosEnAlcance));
    const mesesEnAlcance = _mesesEnAlcanceH();
    const etiquetas = mesesEnAlcance.map(_nombreMes);
    const tituloPartes = { indicador: "Casos", dimension: "mes", padecimiento: null, lugar: lugarTextoH(), periodo: _periodoTituloTextoH(aniosEnAlcance, multiAnio) };
    function valoresDeAnio(anio) {
      return mesesEnAlcance.map((mes) => {
        const filtros = filtrosActivos.concat([{ colIdx: idxH.anio, valor: anio }, { colIdx: idxH.mes, valor: mes }]);
        const resultados = svcCarga.agregar(rowsHFiltradas, idxH.mes, idxH.casos, filtros);
        if (!resultados.length) return null;
        return resultados.reduce((s, r) => s + r.valor, 0);
      });
    }
    if (multiAnio) {
      const series = aniosEnAlcance.map((anio) => ({ label: anio, data: valoresDeAnio(anio) }));
      panoramaCharts["morb-h-chart-mesanio"] = SNSP_renderGroupedBarChart("morb-h-chart-mesanio", etiquetas, series, "Casos", Object.assign({ wrapAt: 26, tituloPartes }, _morbBarraOpts(true), MORB_OPTS_ETIQUETA_MENSUAL));
    } else {
      const valores = valoresDeAnio(aniosEnAlcance[0]);
      panoramaCharts["morb-h-chart-mesanio"] = SNSP_renderBarChart("morb-h-chart-mesanio", etiquetas, valores, "Casos", Object.assign({ wrapAt: 26, tituloPartes }, _morbBarraOpts(false), MORB_OPTS_ETIQUETA_MENSUAL));
    }
  }

  function renderPanoramaH() {
    const filtrosActivos = _filtrosActivosH();
    const aniosSeleccionados = _aniosEnAlcance();
    const modoComparativo = aniosSeleccionados.length >= 2;
    renderChartMunicipio(filtrosActivos, aniosSeleccionados, modoComparativo);
    renderChartJurisdiccion(filtrosActivos, aniosSeleccionados, modoComparativo);
    renderChartInstitucion(filtrosActivos, aniosSeleccionados, modoComparativo);
    renderChartUnidadMedica(filtrosActivos, aniosSeleccionados, modoComparativo);
    renderChartGrupoEdad(filtrosActivos, aniosSeleccionados, modoComparativo);
    renderChartSexoH(filtrosActivos, aniosSeleccionados, modoComparativo);
    renderChartTendenciaH(filtrosActivos, aniosSeleccionados);
    renderChartMesAnioH(filtrosActivos, aniosSeleccionados);
  }

  function renderTableroH() {
    if (!document.getElementById("morb-h-chart")) return; // Bloque 1 no está en el DOM (defensivo, pruebas)
    if (chartH) { chartH.destroy(); chartH = null; }
    rowsHFiltradas = _filtrarPorMesH(rowsH);

    const filtrosActivos = _filtrosActivosH();
    const aniosSeleccionados = _aniosEnAlcance();
    const modoComparativo = aniosSeleccionados.length >= 2;
    const dimKey = selDimH.value;
    const dimIdx = dimColMapH[dimKey];
    const nombreDim = dimLabelMapH[dimKey];
    const medida = nombreMedidaH();
    const campo = selMedidaH.value === "poblacion" ? "poblacion" : (selMedidaH.value === "tasa" ? "tasa" : "valorCasos");

    const filtrosParaTotales = aniosSeleccionados.length === 1
      ? filtrosActivos.concat([{ colIdx: idxH.anio, valor: aniosSeleccionados[0] }])
      : filtrosActivos;
    // ACT24 fix: filas restringidas a los años ACTUALMENTE seleccionados
    // (0 marcados = todos los años del catálogo, igual que
    // _aniosEnAlcance()) — antes sólo se restringía por año cuando había
    // EXACTAMENTE 1 año marcado, así que dejar 2+ años marcados sin ser
    // todos (p. ej. quitar 2022) no recortaba nada y el KPI mostraba el
    // total de los 5 años completos.
    const rowsHEnAlcanceAnio = rowsHFiltradas.filter((r) => aniosSeleccionados.includes(String(r[idxH.anio] || "").trim()));
    const filasConsideradas = rowsHEnAlcanceAnio.filter((r) =>
      filtrosActivos.every((f) => String(r[f.colIdx] || "").trim() === f.valor)
    ).length;

    let agregado;
    if (modoComparativo) {
      const resultados = svcCarga.agregarComparativoConPoblacion(
        rowsHFiltradas, dimIdx, idxH.casos, filtrosActivos, idxH.anio, aniosSeleccionados, joinCols, poblacionIndex.mapa
      );
      agregado = resultados.map((r) => {
        const valores = {};
        aniosSeleccionados.forEach((y) => {
          const datoAnio = r.valores[y];
          let v = datoAnio ? datoAnio[campo] : null;
          if (campo === "tasa") { if (v !== null && v !== undefined) v = Math.round(v * 10) / 10; }
          else if (v === null || v === undefined) v = 0;
          valores[y] = v;
        });
        return { categoria: r.categoria, valores };
      });
      agregado.sort((a, b) => {
        const totalA = aniosSeleccionados.reduce((s, y) => s + (typeof a.valores[y] === "number" ? a.valores[y] : 0), 0);
        const totalB = aniosSeleccionados.reduce((s, y) => s + (typeof b.valores[y] === "number" ? b.valores[y] : 0), 0);
        return totalB - totalA;
      });
    } else {
      const resultados = svcCarga.agregarConPoblacion(rowsHFiltradas, dimIdx, idxH.casos, filtrosParaTotales, joinCols, poblacionIndex.mapa);
      agregado = resultados.map((r) => {
        let v = r[campo];
        if (campo === "tasa") { if (v !== null && v !== undefined) v = Math.round(v * 10) / 10; }
        else if (v === null || v === undefined) v = 0;
        return { categoria: r.categoria, valor: v };
      });
      agregado.sort((a, b) => (typeof b.valor === "number" ? b.valor : -1) - (typeof a.valor === "number" ? a.valor : -1));
    }

    const totalCategorias = agregado.length;
    // El selector "Mostrar" aplica a CUALQUIER "Por" (a diferencia de la
    // versión 2025-2026, donde sólo hacía falta para Padecimiento): ahora
    // Unidad médica puede llegar a 383 categorías, así que el recorte es
    // igual de necesario ahí. Para Municipio/Jurisdicción/Institución/
    // Grupo de edad/Sexo (≤18 categorías) el Top N por defecto (20) nunca
    // recorta nada en la práctica — se deja aplicado de todas formas por
    // simplicidad, sin cambiar ningún total ni KPI (esos se calculan ANTES
    // de recortar, ver totalCategorias arriba).
    const topNAplicado = selPrincipalTopNH ? _leerTopN(selPrincipalTopNH) : null;
    const agregadoDibujo = topNAplicado ? agregado.slice(0, topNAplicado) : agregado;
    const subtPrincipal = document.getElementById("morb-h-subt-principal");
    if (subtPrincipal) {
      subtPrincipal.textContent = (topNAplicado && totalCategorias > topNAplicado)
        ? `Se actualiza automáticamente con Analizar, Por, Año y los filtros — Top ${topNAplicado} de ${totalCategorias} categorías de ${nombreDim}`
        : "Se actualiza automáticamente con Analizar, Por, Año y los filtros";
    }

    _ajustarAlturaBarra("morb-h-chart-wrap", agregadoDibujo.map((r) => r.categoria), modoComparativo, aniosSeleccionados.length);
    const chartWrapMinimo = document.getElementById("morb-h-chart-wrap");
    if (chartWrapMinimo && parseFloat(chartWrapMinimo.style.height) < 420) chartWrapMinimo.style.height = "420px";

    const tituloPartes = { indicador: medida, dimension: nombreDim, padecimiento: null, lugar: lugarTextoH(), periodo: _periodoTituloTextoH(aniosSeleccionados, modoComparativo) };

    if (modoComparativo) {
      chartH = SNSP_renderGroupedBarChart(
        "morb-h-chart", agregadoDibujo.map((r) => r.categoria),
        aniosSeleccionados.map((y) => ({ label: y, data: agregadoDibujo.map((r) => (typeof r.valores[y] === "number" ? r.valores[y] : 0)) })),
        medida, Object.assign({ horizontal: true, wrapAt: 34, tituloPartes }, _morbBarraOpts(modoComparativo))
      );
    } else {
      chartH = SNSP_renderBarChart(
        "morb-h-chart", agregadoDibujo.map((r) => r.categoria), agregadoDibujo.map((r) => (typeof r.valor === "number" ? r.valor : 0)),
        medida, Object.assign({ horizontal: true, wrapAt: 34, tituloPartes }, _morbBarraOpts(modoComparativo))
      );
    }
    if (chartH) {
      if (!chartH.options.scales) chartH.options.scales = {};
      if (!chartH.options.scales.y) chartH.options.scales.y = {};
      chartH.options.scales.y.ticks = Object.assign({}, chartH.options.scales.y.ticks, { autoSkip: false });
      chartH.options.animation = false;
      chartH.update();
    }

    function _fmtValor(v) {
      if (v === null || v === undefined) return "No aplica";
      return campo === "tasa" ? v.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : Math.round(v).toLocaleString("es-MX");
    }

    if (modoComparativo) {
      const hayDiferencia = aniosSeleccionados.length === 2;
      document.getElementById("morb-h-tabla-head").innerHTML =
        `<tr><th>#</th><th>Categoría</th>` + aniosSeleccionados.map((y) => `<th>${medida} ${y}</th>`).join("") +
        (hayDiferencia ? `<th>Diferencia</th><th>Variación %</th>` : "") + `</tr>`;
      document.getElementById("morb-h-tabla-body").innerHTML = agregadoDibujo.map((r, i) => {
        const vals = aniosSeleccionados.map((y) => r.valores[y]);
        let extra = "";
        if (hayDiferencia) {
          const a = vals[0], b = vals[1];
          if (typeof a !== "number" || typeof b !== "number") {
            extra = `<td>—</td><td>—</td>`;
          } else {
            const diff = b - a;
            const variacion = a > 0 ? (diff / a) * 100 : null;
            const color = diff > 0 ? "var(--accent-positive)" : (diff < 0 ? "var(--accent-alert)" : "inherit");
            const signo = diff > 0 ? "+" : "";
            extra = `<td style="color:${color};">${signo}${campo === "tasa" ? diff.toFixed(1) : diff.toLocaleString("es-MX")}</td>` +
              `<td style="color:${color};">${variacion === null ? "—" : (variacion > 0 ? "+" : "") + variacion.toFixed(1) + "%"}</td>`;
          }
        }
        return `<tr><td><span class="rank-badge ${i < 3 ? "top" : ""}">${i + 1}</span></td><td class="col-text">${r.categoria}</td>${vals.map((v) => `<td>${_fmtValor(v)}</td>`).join("")}${extra}</tr>`;
      }).join("");
      document.getElementById("morb-h-tabla-count").textContent =
        `${agregadoDibujo.length.toLocaleString("es-MX")} categorías de ${nombreDim}` +
        (topNAplicado && totalCategorias > topNAplicado ? ` (Top ${topNAplicado} de ${totalCategorias})` : "") +
        ` — ${_periodoCompletoTextoH(aniosSeleccionados, true)}`;
    } else {
      document.getElementById("morb-h-tabla-head").innerHTML = `<tr><th>#</th><th>Categoría</th><th>${medida}</th></tr>`;
      document.getElementById("morb-h-tabla-body").innerHTML = agregadoDibujo.map((r, i) => `
        <tr><td><span class="rank-badge ${i < 3 ? "top" : ""}">${i + 1}</span></td><td class="col-text">${r.categoria}</td><td>${_fmtValor(r.valor)}</td></tr>
      `).join("");
      document.getElementById("morb-h-tabla-count").textContent =
        `${agregadoDibujo.length.toLocaleString("es-MX")} categorías de ${nombreDim}` +
        (topNAplicado && totalCategorias > topNAplicado ? ` (Top ${topNAplicado} de ${totalCategorias})` : "");
    }

    const totales = _calcularTotalesH(filtrosActivos, rowsHEnAlcanceAnio);
    let kpiValor, kpiLabel, kpiFootnote;
    if (selMedidaH.value === "poblacion") {
      kpiLabel = "Población relacionada";
      kpiValor = totales.totalPoblacion !== null ? Math.round(totales.totalPoblacion).toLocaleString("es-MX") : "No aplica";
      kpiFootnote = totales.totalPoblacion !== null ? "Suma sin duplicar, por Año+Municipio+Grupo de edad" : "Sin población relacionada para esta selección";
    } else if (selMedidaH.value === "tasa") {
      kpiLabel = "Tasa global (por 100,000 hab.)";
      kpiValor = totales.tasaGlobal !== null ? totales.tasaGlobal.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "No aplica";
      kpiFootnote = totales.tasaGlobal !== null
        ? `${totales.totalCasos.toLocaleString("es-MX")} casos / ${Math.round(totales.totalPoblacion).toLocaleString("es-MX")} hab.`
        : "Sin población relacionada para esta selección";
    } else {
      kpiLabel = "Casos totales";
      kpiValor = totales.totalCasos.toLocaleString("es-MX");
      kpiFootnote = lugarTextoH();
    }

    document.getElementById("kpi-grid-h").innerHTML = [
      { label: "Combinaciones en la base", value: rowsH.length.toLocaleString("es-MX"), accent: "var(--c-vino)", footnote: `${datosH.meta.filas_originales.toLocaleString("es-MX")} filas originales agregadas` },
      { label: "Filas consideradas", value: filasConsideradas.toLocaleString("es-MX"), accent: "var(--c-dorado)", footnote: filtrosActivos.length ? "Con los filtros aplicados" : "Sin filtros aplicados" },
      { label: "Categorías encontradas", value: totalCategorias.toLocaleString("es-MX"), accent: "var(--c-verde-claro)", footnote: (topNAplicado && totalCategorias > topNAplicado) ? `${nombreDim} — mostrando Top ${topNAplicado}` : nombreDim },
      { label: kpiLabel, value: kpiValor, accent: "var(--c-rojo-claro)", footnote: kpiFootnote },
    ].map(SNSP_indicatorCardHTML).join("");

    renderPanoramaH();
  }

  function _leerTopN(sel) {
    if (!sel) return 10;
    if (sel.value === "todos") return null;
    const n = parseInt(sel.value, 10);
    return isNaN(n) ? 10 : n;
  }

  // =======================================================================
  // BLOQUE 2 — Padecimientos (Casos únicamente; NUNCA Población/Tasa, NUNCA
  // cruzado con Municipio/Jurisdicción/Institución/Unidad médica)
  // =======================================================================
  function buscarPadecimientos(texto, limit) {
    const q = _norm(texto);
    let results = catalogoPadecimientos;
    if (q) {
      results = results.filter((p) =>
        _norm(p.padecimiento).includes(q) ||
        _norm(p.epiclave).includes(q) ||
        _norm(p.cie10_texto).includes(q) ||
        (p.cie10_codigos || []).some((c) => _norm(c).includes(q)) ||
        (p.cie10_prefijos || []).some((c) => _norm(c).includes(q))
      );
    }
    return limit ? results.slice(0, limit) : results;
  }

  const BUSCADORES_PADECIMIENTO = [
    { inputId: "cie10-search", boxId: "cie10-resultados" },
    { inputId: "cie10-search-cie10", boxId: "cie10-resultados-cie10" },
    { inputId: "cie10-search-epiclave", boxId: "cie10-resultados-epiclave" },
  ];

  function renderResultadosBusqueda(texto, boxId) {
    const box = document.getElementById(boxId);
    if (!box) return;
    const resultados = buscarPadecimientos(texto, 25);
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
        seleccionarPadecimiento(btn.getAttribute("data-epiclave"));
        box.style.display = "none";
      });
    });
  }

  function seleccionarPadecimiento(epiclave) {
    const p = catalogoPadecimientos.find((x) => x.epiclave === String(epiclave));
    seleccionPadecimiento = p || null;
    const etiqueta = p ? `${p.cie10_texto ? p.cie10_texto + " — " : ""}${p.padecimiento}` : "";
    const selActual = document.getElementById("seleccion-actual");
    if (selActual) {
      selActual.innerHTML = etiqueta
        ? `Consultando: <strong>${etiqueta}</strong> <button type="button" class="btn btn-ghost btn-sm" id="btn-limpiar-seleccion">Quitar</button>`
        : "";
    }
    const limpiarBtn = document.getElementById("btn-limpiar-seleccion");
    if (limpiarBtn) limpiarBtn.addEventListener("click", () => {
      seleccionPadecimiento = null;
      if (selActual) selActual.innerHTML = "";
      BUSCADORES_PADECIMIENTO.forEach((b) => { const inp = document.getElementById(b.inputId); if (inp) inp.value = ""; });
      renderTableroP();
    });
    const inpPad = document.getElementById("cie10-search");
    const inpCie10 = document.getElementById("cie10-search-cie10");
    const inpEpi = document.getElementById("cie10-search-epiclave");
    if (inpPad) inpPad.value = p ? p.padecimiento : "";
    if (inpCie10) inpCie10.value = p && p.cie10_texto ? p.cie10_texto : "";
    if (inpEpi) inpEpi.value = p ? p.epiclave : "";
    renderTableroP();
  }

  BUSCADORES_PADECIMIENTO.forEach(({ inputId, boxId }) => {
    const input = document.getElementById(inputId);
    if (input) input.addEventListener("input", (e) => renderResultadosBusqueda(e.target.value, boxId));
  });
  document.addEventListener("click", (e) => {
    BUSCADORES_PADECIMIENTO.forEach(({ inputId, boxId }) => {
      const input = document.getElementById(inputId);
      const box = document.getElementById(boxId);
      if (input && box && !input.parentElement.contains(e.target)) box.style.display = "none";
    });
  });

  function _padecimientoTitulo() {
    return seleccionPadecimiento ? `${seleccionPadecimiento.cie10_texto ? seleccionPadecimiento.cie10_texto + " — " : ""}${seleccionPadecimiento.padecimiento}` : null;
  }

  // ---- Mes/Semana del Bloque 2 (coherentes entre sí y con Año, igual
  // patrón que ACT14/ACT15, ahora exclusivo de este bloque) ----
  function _mesesSeleccionadosP() { return _leerMarcados("morb-p-mes-menu"); }
  function _semanasSeleccionadasP() { return _leerMarcados("morb-p-semana-menu"); }
  function _semanasCompatiblesConMes(mes) {
    const set = new Set();
    _aniosEnAlcance().forEach((anio) => {
      const info = mesSemanaMeta[anio];
      if (info && info.porMes && info.porMes[mes]) info.porMes[mes].forEach((s) => set.add(s));
    });
    return Array.from(set).sort();
  }
  function _mesesCompatiblesConSemana(semana) {
    const set = new Set();
    _aniosEnAlcance().forEach((anio) => {
      const info = mesSemanaMeta[anio];
      if (info && info.porSemana && info.porSemana[semana]) info.porSemana[semana].forEach((m) => set.add(m));
    });
    return Array.from(set).sort();
  }
  function _semanasCompatiblesConMeses(meses) {
    if (!meses.length) return (catP.semanas || []).slice();
    const set = new Set();
    meses.forEach((mes) => _semanasCompatiblesConMes(mes).forEach((s) => set.add(s)));
    return Array.from(set).sort();
  }
  function _mesesCompatiblesConSemanas(semanas) {
    if (!semanas.length) return (catP.meses || []).slice();
    const set = new Set();
    semanas.forEach((semana) => _mesesCompatiblesConSemana(semana).forEach((m) => set.add(m)));
    return Array.from(set).sort();
  }
  function _poblarSelectsMesSemanaP() {
    if (!document.getElementById("morb-p-mes-menu") || !document.getElementById("morb-p-semana-menu")) return;
    const mesesActuales = _mesesSeleccionadosP();
    const semanasActuales = _semanasSeleccionadasP();
    const mesesDisponibles = _mesesCompatiblesConSemanas(semanasActuales);
    const semanasDisponibles = _semanasCompatiblesConMeses(mesesActuales);
    const mesesValidos = mesesActuales.filter((m) => mesesDisponibles.includes(m));
    const semanasValidas = semanasActuales.filter((s) => semanasDisponibles.includes(s));
    _renderMultiselectChips("morb-p-mes-menu", "morb-p-mes-chips", mesesDisponibles, (v) => v, mesesValidos, _onMesSemanaChangeP, "Todos");
    _renderMultiselectChips("morb-p-semana-menu", "morb-p-semana-chips", semanasDisponibles, (v) => "Semana " + v, semanasValidas, _onMesSemanaChangeP, "Todas");
  }
  function _onMesSemanaChangeP() { _poblarSelectsMesSemanaP(); renderTableroP(); }
  if (document.getElementById("morb-p-mes-menu") && document.getElementById("morb-p-semana-menu")) {
    _initToggleMultiselect("morb-p-mes-toggle", "morb-p-mes-menu", "morb-p-mes-multiselect");
    _initToggleMultiselect("morb-p-semana-toggle", "morb-p-semana-menu", "morb-p-semana-multiselect");
    _poblarSelectsMesSemanaP();
  }
  function _filtrarPorMesSemanaP(rowsBase) {
    const meses = _mesesSeleccionadosP();
    const semanas = _semanasSeleccionadasP();
    if (!meses.length && !semanas.length) return rowsBase;
    const mesesSet = meses.length ? new Set(meses) : null;
    const semanasSet = semanas.length ? new Set(semanas) : null;
    return rowsBase.filter((r) => {
      if (mesesSet && !mesesSet.has(String(r[idxP.mes]))) return false;
      if (semanasSet && !semanasSet.has(String(r[idxP.semana]))) return false;
      return true;
    });
  }
  function _esRangoContiguo(valoresOrdenados, numFn) {
    for (let i = 1; i < valoresOrdenados.length; i++) {
      if (numFn(valoresOrdenados[i]) !== numFn(valoresOrdenados[i - 1]) + 1) return false;
    }
    return true;
  }
  function _textoMesSemanaPeriodoP() {
    const mesesSelRaw = _mesesSeleccionadosP();
    const semanasSelRaw = _semanasSeleccionadasP();
    const mesesDisponibles = _mesesCompatiblesConSemanas(semanasSelRaw);
    const semanasDisponibles = _semanasCompatiblesConMeses(mesesSelRaw);
    const meses = (mesesSelRaw.length && mesesSelRaw.length === mesesDisponibles.length) ? [] : mesesSelRaw.slice().sort();
    const semanas = (semanasSelRaw.length && semanasSelRaw.length === semanasDisponibles.length) ? [] : semanasSelRaw.slice().sort();
    const partes = [];
    if (meses.length === 1) {
      partes.push(_nombreMesLargo(meses[0]));
    } else if (meses.length > 1) {
      partes.push(_esRangoContiguo(meses, (m) => parseInt(m, 10))
        ? `${_nombreMesLargo(meses[0])}–${_nombreMesLargo(meses[meses.length - 1])}`
        : meses.map(_nombreMesLargo).join(", "));
    }
    if (semanas.length === 1) {
      partes.push(`Semana epidemiológica ${semanas[0]}`);
    } else if (semanas.length > 1) {
      partes.push(_esRangoContiguo(semanas, (s) => parseInt(s, 10))
        ? `Semanas epidemiológicas ${semanas[0]}–${semanas[semanas.length - 1]}`
        : `Semanas epidemiológicas ${semanas.join(", ")}`);
    }
    return partes.join(" · ");
  }
  function _periodoCompletoTextoP(aniosSeleccionados, modoComparativo) {
    const base = modoComparativo ? _textoComparativo(aniosSeleccionados) : periodoTexto(aniosSeleccionados);
    const sufijo = _textoMesSemanaPeriodoP();
    return (sufijo ? `${base} | ${sufijo}` : base) + _notaAnioParcial(aniosSeleccionados);
  }
  function _periodoTituloTextoP(aniosSeleccionados, modoComparativo) {
    const base = modoComparativo ? `comparativo ${aniosSeleccionados.join(" vs ")}` : periodoTexto(aniosSeleccionados);
    const sufijo = _textoMesSemanaPeriodoP();
    return sufijo ? `${base} | ${sufijo}` : base;
  }
  function _conSufijoPeriodoP(texto) {
    const sufijo = _textoMesSemanaPeriodoP();
    return sufijo ? `${texto} — ${sufijo}` : texto;
  }
  function _temporalMesesEnAlcanceP() {
    const mesesSel = _mesesSeleccionadosP();
    const catalogo = (catP.meses || []).slice();
    if (mesesSel.length) return catalogo.filter((m) => mesesSel.includes(m));
    const semanasSel = _semanasSeleccionadasP();
    if (semanasSel.length) {
      const compatibles = _mesesCompatiblesConSemanas(semanasSel);
      return catalogo.filter((m) => compatibles.includes(m));
    }
    return catalogo;
  }

  const selDimP = document.getElementById("morb-p-select-dim");
  if (selDimP) selDimP.addEventListener("change", renderTableroP);
  const selPadecimientosTopN = document.getElementById("morb-p-padecimientos-topn");
  if (selPadecimientosTopN) selPadecimientosTopN.addEventListener("change", renderTableroP);
  const selPrincipalTopNP = document.getElementById("morb-p-principal-topn");
  if (selPrincipalTopNP) selPrincipalTopNP.addEventListener("change", renderTableroP);

  function _filtrosActivosP() {
    const list = [];
    if (seleccionPadecimiento) list.push({ colIdx: idxP.epiclave, valor: seleccionPadecimiento.epiclave });
    return list;
  }

  function _renderPanelP(canvasId, wrapId, dimIdx, nombreDim, filtrosActivos, aniosSeleccionados, modoComparativo, opts) {
    opts = opts || {};
    _destruirPanorama(canvasId);
    let categorias, valores, seriesPorAnio, totalCategorias;
    if (modoComparativo) {
      let resultados = svcCarga.agregarComparativo(rowsPFiltradas, dimIdx, idxP.casos, filtrosActivos, idxP.anio, aniosSeleccionados);
      totalCategorias = resultados.length;
      if (opts.limitTop) resultados = resultados.slice(0, opts.limitTop);
      categorias = resultados.map((r) => r.categoria);
      seriesPorAnio = aniosSeleccionados.map((y) => ({ label: y, data: resultados.map((r) => r.valores[y] || 0) }));
    } else {
      const filtrosConAnio = aniosSeleccionados.length === 1 ? filtrosActivos.concat([{ colIdx: idxP.anio, valor: aniosSeleccionados[0] }]) : filtrosActivos;
      let resultados = svcCarga.agregar(rowsPFiltradas, dimIdx, idxP.casos, filtrosConAnio);
      totalCategorias = resultados.length;
      if (opts.limitTop) resultados = resultados.slice(0, opts.limitTop);
      categorias = resultados.map((r) => r.categoria);
      valores = resultados.map((r) => r.valor);
    }
    _ajustarAlturaBarra(wrapId, categorias, modoComparativo, aniosSeleccionados.length);
    const tituloPartes = { indicador: "Casos", dimension: nombreDim, padecimiento: _padecimientoTitulo(), lugar: "el estado de Querétaro", periodo: _periodoTituloTextoP(aniosSeleccionados, modoComparativo) };
    const barraOpts = Object.assign({ horizontal: true, wrapAt: 26, tituloPartes }, _morbBarraOpts(modoComparativo));
    if (modoComparativo) {
      panoramaCharts[canvasId] = SNSP_renderGroupedBarChart(canvasId, categorias, seriesPorAnio, "Casos", barraOpts);
    } else {
      panoramaCharts[canvasId] = SNSP_renderBarChart(canvasId, categorias, valores, "Casos", barraOpts);
    }
    return { mostradas: categorias.length, total: totalCategorias };
  }

  function _topNPadecimientos() { return _leerTopN(selPadecimientosTopN); }
  function _topNPrincipalP() { return _leerTopN(selPrincipalTopNP); }

  function renderChartPadecimientos(filtrosActivos, aniosSeleccionados, modoComparativo) {
    const limitTop = _topNPadecimientos();
    const resultado = _renderPanelP("morb-p-chart-padecimientos", "morb-p-wrap-padecimientos", idxP.padecimiento, "padecimiento", filtrosActivos, aniosSeleccionados, modoComparativo, { limitTop });
    const subt = document.getElementById("morb-p-subt-padecimientos");
    if (subt) {
      subt.textContent = (limitTop && resultado.total > limitTop)
        ? `Top ${limitTop} de ${resultado.total} padecimientos en la selección vigente`
        : `Todos los padecimientos en la selección vigente (${resultado.total})`;
    }
    return resultado;
  }
  function renderChartGrupoEdadP(filtrosActivos, aniosSeleccionados, modoComparativo) {
    _renderPanelP("morb-p-chart-grupoedad", "morb-p-wrap-grupoedad", idxP.grupo_edad, "grupo de edad", filtrosActivos, aniosSeleccionados, modoComparativo);
  }
  function renderChartSexoP(filtrosActivos, aniosSeleccionados, modoComparativo) {
    _destruirPanorama("morb-p-chart-sexo");
    const subt = document.getElementById("morb-p-subt-sexo");
    if (subt) subt.textContent = modoComparativo ? _periodoCompletoTextoP(aniosSeleccionados, true) : _conSufijoPeriodoP("Distribución dentro de la selección vigente");
    _renderPanelP("morb-p-chart-sexo", "morb-p-wrap-sexo", idxP.sexo, "sexo", filtrosActivos, aniosSeleccionados, modoComparativo);
  }
  function renderChartTendenciaP(filtrosActivos, aniosSeleccionados) {
    _destruirPanorama("morb-p-chart-tendencia");
    const subt = document.getElementById("morb-p-subt-tendencia");
    const aniosEnAlcance = aniosSeleccionados.length ? aniosSeleccionados.slice().sort() : catalogosAnio.slice().sort();
    const multiAnio = aniosEnAlcance.length > 1;
    if (subt) subt.textContent = (multiAnio ? _periodoCompletoTextoP(aniosEnAlcance, true) : _conSufijoPeriodoP(`Evolución mensual ${aniosEnAlcance[0] || ""}`)) + (multiAnio ? "" : _notaAnioParcial(aniosEnAlcance));
    const mesesEnAlcance = _temporalMesesEnAlcanceP();
    function serieDeAnio(anio) {
      return mesesEnAlcance.map((mes) => {
        const filtros = filtrosActivos.concat([{ colIdx: idxP.anio, valor: anio }, { colIdx: idxP.mes, valor: mes }]);
        const resultados = svcCarga.agregar(rowsPFiltradas, idxP.mes, idxP.casos, filtros);
        if (!resultados.length) return null;
        return resultados.reduce((s, r) => s + r.valor, 0);
      });
    }
    const etiquetas = mesesEnAlcance.map(_nombreMes);
    const series = aniosEnAlcance.map((anio) => ({ label: anio, data: serieDeAnio(anio) }));
    const tituloPartes = { indicador: "Casos", dimension: "mes", padecimiento: _padecimientoTitulo(), lugar: "el estado de Querétaro", periodo: _periodoTituloTextoP(aniosEnAlcance, multiAnio) };
    panoramaCharts["morb-p-chart-tendencia"] = SNSP_renderLineChart("morb-p-chart-tendencia", etiquetas, series, Object.assign({ tituloPartes }, MORB_OPTS_ETIQUETA_MENSUAL));
  }
  function renderChartMesAnioP(filtrosActivos, aniosSeleccionados) {
    _destruirPanorama("morb-p-chart-mesanio");
    const subt = document.getElementById("morb-p-subt-mesanio");
    const aniosEnAlcance = aniosSeleccionados.length ? aniosSeleccionados.slice().sort() : catalogosAnio.slice().sort();
    const multiAnio = aniosEnAlcance.length > 1;
    if (subt) subt.textContent = (multiAnio ? _periodoCompletoTextoP(aniosEnAlcance, true) : _conSufijoPeriodoP(`Estacionalidad ${aniosEnAlcance[0] || ""}`)) + (multiAnio ? "" : _notaAnioParcial(aniosEnAlcance));
    const mesesEnAlcance = _temporalMesesEnAlcanceP();
    const etiquetas = mesesEnAlcance.map(_nombreMes);
    const tituloPartes = { indicador: "Casos", dimension: "mes", padecimiento: _padecimientoTitulo(), lugar: "el estado de Querétaro", periodo: _periodoTituloTextoP(aniosEnAlcance, multiAnio) };
    function valoresDeAnio(anio) {
      return mesesEnAlcance.map((mes) => {
        const filtros = filtrosActivos.concat([{ colIdx: idxP.anio, valor: anio }, { colIdx: idxP.mes, valor: mes }]);
        const resultados = svcCarga.agregar(rowsPFiltradas, idxP.mes, idxP.casos, filtros);
        if (!resultados.length) return null;
        return resultados.reduce((s, r) => s + r.valor, 0);
      });
    }
    if (multiAnio) {
      const series = aniosEnAlcance.map((anio) => ({ label: anio, data: valoresDeAnio(anio) }));
      panoramaCharts["morb-p-chart-mesanio"] = SNSP_renderGroupedBarChart("morb-p-chart-mesanio", etiquetas, series, "Casos", Object.assign({ wrapAt: 26, tituloPartes }, _morbBarraOpts(true), MORB_OPTS_ETIQUETA_MENSUAL));
    } else {
      const valores = valoresDeAnio(aniosEnAlcance[0]);
      panoramaCharts["morb-p-chart-mesanio"] = SNSP_renderBarChart("morb-p-chart-mesanio", etiquetas, valores, "Casos", Object.assign({ wrapAt: 26, tituloPartes }, _morbBarraOpts(false), MORB_OPTS_ETIQUETA_MENSUAL));
    }
  }

  function renderPanoramaP() {
    const filtrosActivos = _filtrosActivosP();
    const aniosSeleccionados = _aniosEnAlcance();
    const modoComparativo = aniosSeleccionados.length >= 2;
    renderChartPadecimientos(filtrosActivos, aniosSeleccionados, modoComparativo);
    renderChartGrupoEdadP(filtrosActivos, aniosSeleccionados, modoComparativo);
    renderChartSexoP(filtrosActivos, aniosSeleccionados, modoComparativo);
    renderChartTendenciaP(filtrosActivos, aniosSeleccionados);
    renderChartMesAnioP(filtrosActivos, aniosSeleccionados);
  }

  function renderTableroP() {
    if (!document.getElementById("morb-p-chart")) return;
    if (chartP) { chartP.destroy(); chartP = null; }
    rowsPFiltradas = _filtrarPorMesSemanaP(rowsP);

    const filtrosActivos = _filtrosActivosP();
    const aniosSeleccionados = _aniosEnAlcance();
    const modoComparativo = aniosSeleccionados.length >= 2;
    const dimKey = selDimP ? selDimP.value : "padecimiento";
    const dimIdx = dimColMapP[dimKey];
    const nombreDim = dimLabelMapP[dimKey];

    const filtrosParaTotales = aniosSeleccionados.length === 1
      ? filtrosActivos.concat([{ colIdx: idxP.anio, valor: aniosSeleccionados[0] }])
      : filtrosActivos;
    // ACT24 fix: mismo problema que en Bloque 1 — restringir siempre a
    // los años ACTUALMENTE seleccionados (0 marcados = todos), no sólo
    // cuando hay exactamente 1 año marcado.
    const rowsPEnAlcanceAnio = rowsPFiltradas.filter((r) => aniosSeleccionados.includes(String(r[idxP.anio] || "").trim()));
    const filasConsideradas = rowsPEnAlcanceAnio.filter((r) =>
      filtrosActivos.every((f) => String(r[f.colIdx] || "").trim() === f.valor)
    ).length;

    let agregado;
    if (modoComparativo) {
      const resultados = svcCarga.agregarComparativo(rowsPFiltradas, dimIdx, idxP.casos, filtrosActivos, idxP.anio, aniosSeleccionados);
      agregado = resultados.map((r) => ({ categoria: r.categoria, valores: r.valores }));
      agregado.sort((a, b) => {
        const totalA = aniosSeleccionados.reduce((s, y) => s + (a.valores[y] || 0), 0);
        const totalB = aniosSeleccionados.reduce((s, y) => s + (b.valores[y] || 0), 0);
        return totalB - totalA;
      });
    } else {
      const resultados = svcCarga.agregar(rowsPFiltradas, dimIdx, idxP.casos, filtrosParaTotales);
      agregado = resultados.map((r) => ({ categoria: r.categoria, valor: r.valor }));
      agregado.sort((a, b) => b.valor - a.valor);
    }

    const totalCategorias = agregado.length;
    const topNPrincipal = dimKey === "padecimiento" ? _topNPrincipalP() : null;
    if (selPrincipalTopNP) selPrincipalTopNP.disabled = dimKey !== "padecimiento";
    const agregadoDibujo = topNPrincipal ? agregado.slice(0, topNPrincipal) : agregado;
    const subtPrincipal = document.getElementById("morb-p-subt-principal");
    if (subtPrincipal) {
      subtPrincipal.textContent = (topNPrincipal && totalCategorias > topNPrincipal)
        ? `Se actualiza automáticamente con Por, Año, Mes/Semana y la búsqueda — Top ${topNPrincipal} de ${totalCategorias} categorías de ${nombreDim}`
        : "Se actualiza automáticamente con Por, Año, Mes/Semana y la búsqueda";
    }

    _ajustarAlturaBarra("morb-p-chart-wrap", agregadoDibujo.map((r) => r.categoria), modoComparativo, aniosSeleccionados.length);
    const chartWrapMinimo = document.getElementById("morb-p-chart-wrap");
    if (chartWrapMinimo && parseFloat(chartWrapMinimo.style.height) < 420) chartWrapMinimo.style.height = "420px";

    const tituloPartes = { indicador: "Casos", dimension: nombreDim, padecimiento: _padecimientoTitulo(), lugar: "el estado de Querétaro", periodo: _periodoTituloTextoP(aniosSeleccionados, modoComparativo) };

    if (modoComparativo) {
      chartP = SNSP_renderGroupedBarChart(
        "morb-p-chart", agregadoDibujo.map((r) => r.categoria),
        aniosSeleccionados.map((y) => ({ label: y, data: agregadoDibujo.map((r) => r.valores[y] || 0) })),
        "Casos", Object.assign({ horizontal: true, wrapAt: 34, tituloPartes }, _morbBarraOpts(modoComparativo))
      );
    } else {
      chartP = SNSP_renderBarChart(
        "morb-p-chart", agregadoDibujo.map((r) => r.categoria), agregadoDibujo.map((r) => r.valor),
        "Casos", Object.assign({ horizontal: true, wrapAt: 34, tituloPartes }, _morbBarraOpts(modoComparativo))
      );
    }
    if (chartP) {
      if (!chartP.options.scales) chartP.options.scales = {};
      if (!chartP.options.scales.y) chartP.options.scales.y = {};
      chartP.options.scales.y.ticks = Object.assign({}, chartP.options.scales.y.ticks, { autoSkip: false });
      chartP.options.animation = false;
      chartP.update();
    }

    if (modoComparativo) {
      const hayDiferencia = aniosSeleccionados.length === 2;
      document.getElementById("morb-p-tabla-head").innerHTML =
        `<tr><th>#</th><th>Categoría</th>` + aniosSeleccionados.map((y) => `<th>Casos ${y}</th>`).join("") +
        (hayDiferencia ? `<th>Diferencia</th><th>Variación %</th>` : "") + `</tr>`;
      document.getElementById("morb-p-tabla-body").innerHTML = agregadoDibujo.map((r, i) => {
        const vals = aniosSeleccionados.map((y) => r.valores[y] || 0);
        let extra = "";
        if (hayDiferencia) {
          const diff = vals[1] - vals[0];
          const variacion = vals[0] > 0 ? (diff / vals[0]) * 100 : null;
          const color = diff > 0 ? "var(--accent-positive)" : (diff < 0 ? "var(--accent-alert)" : "inherit");
          const signo = diff > 0 ? "+" : "";
          extra = `<td style="color:${color};">${signo}${diff.toLocaleString("es-MX")}</td><td style="color:${color};">${variacion === null ? "—" : (variacion > 0 ? "+" : "") + variacion.toFixed(1) + "%"}</td>`;
        }
        return `<tr><td><span class="rank-badge ${i < 3 ? "top" : ""}">${i + 1}</span></td><td class="col-text">${r.categoria}</td>${vals.map((v) => `<td>${v.toLocaleString("es-MX")}</td>`).join("")}${extra}</tr>`;
      }).join("");
      document.getElementById("morb-p-tabla-count").textContent =
        `${agregadoDibujo.length.toLocaleString("es-MX")} categorías de ${nombreDim}` +
        (topNPrincipal && totalCategorias > topNPrincipal ? ` (Top ${topNPrincipal} de ${totalCategorias})` : "") +
        ` — ${_periodoCompletoTextoP(aniosSeleccionados, true)}`;
    } else {
      document.getElementById("morb-p-tabla-head").innerHTML = `<tr><th>#</th><th>Categoría</th><th>Casos</th></tr>`;
      document.getElementById("morb-p-tabla-body").innerHTML = agregadoDibujo.map((r, i) => `
        <tr><td><span class="rank-badge ${i < 3 ? "top" : ""}">${i + 1}</span></td><td class="col-text">${r.categoria}</td><td>${Math.round(r.valor).toLocaleString("es-MX")}</td></tr>
      `).join("");
      document.getElementById("morb-p-tabla-count").textContent =
        `${agregadoDibujo.length.toLocaleString("es-MX")} categorías de ${nombreDim}` +
        (topNPrincipal && totalCategorias > topNPrincipal ? ` (Top ${topNPrincipal} de ${totalCategorias})` : "");
    }

    const totalCasosP = filasConsideradas ? rowsPEnAlcanceAnio.filter((r) =>
      filtrosActivos.every((f) => String(r[f.colIdx] || "").trim() === f.valor)
    ).reduce((s, r) => s + (parseInt(r[idxP.casos], 10) || 0), 0) : 0;

    document.getElementById("kpi-grid-p").innerHTML = [
      { label: "Combinaciones en la base", value: rowsP.length.toLocaleString("es-MX"), accent: "var(--c-vino)", footnote: `${datosP.meta.filas_originales.toLocaleString("es-MX")} filas originales agregadas` },
      { label: "Filas consideradas", value: filasConsideradas.toLocaleString("es-MX"), accent: "var(--c-dorado)", footnote: filtrosActivos.length ? "Con la búsqueda aplicada" : "Sin búsqueda aplicada" },
      { label: "Categorías encontradas", value: totalCategorias.toLocaleString("es-MX"), accent: "var(--c-verde-claro)", footnote: (topNPrincipal && totalCategorias > topNPrincipal) ? `${nombreDim} — mostrando Top ${topNPrincipal}` : nombreDim },
      { label: "Casos totales", value: totalCasosP.toLocaleString("es-MX"), accent: "var(--c-rojo-claro)", footnote: seleccionPadecimiento ? seleccionPadecimiento.padecimiento : "el estado de Querétaro" },
    ].map(SNSP_indicatorCardHTML).join("");

    renderPanoramaP();
  }

  // =======================================================================
  // Pestañas Bloque 1 / Bloque 2
  // =======================================================================
  const tabBtnH = document.getElementById("morb-tab-bloque1");
  const tabBtnP = document.getElementById("morb-tab-bloque2");
  const panelH = document.getElementById("morb-bloque1-panel");
  const panelP = document.getElementById("morb-bloque2-panel");
  function _activarTab(cual) {
    if (tabBtnH) tabBtnH.classList.toggle("is-active", cual === "h");
    if (tabBtnP) tabBtnP.classList.toggle("is-active", cual === "p");
    if (panelH) panelH.hidden = cual !== "h";
    if (panelP) panelP.hidden = cual !== "p";
  }
  if (tabBtnH) tabBtnH.addEventListener("click", () => _activarTab("h"));
  if (tabBtnP) tabBtnP.addEventListener("click", () => _activarTab("p"));

  // -----------------------------------------------------------------------
  // Pie de fuente y versión
  // -----------------------------------------------------------------------
  const sourceLabel = document.getElementById("source-label");
  if (sourceLabel) {
    sourceLabel.textContent =
      `BASE_CASOS_HISTORICOS_SUIVE_QRO_2022_2026 (Bloque 1) + BASE_PADECIMIENTOS_SUIVE_QRO_2022_2026 (Bloque 2) + EXTRACCION_POBLACION_SUIVE_QRO_2022_2026 (Bloque 3), estado de Querétaro (${catalogosAnio.join("-")}, ${ANIO_PARCIAL ? ANIO_PARCIAL + " parcial Ene-Sep" : ""}) — ${catalogoPadecimientos.length} padecimientos — 3,551,200 casos totales verificados`;
  }
  const versionTag = document.getElementById("version-tag-module");
  if (versionTag) versionTag.textContent = window.SNSP_CONFIG.platform.version;

  // =======================================================================
  // PDF / Vista previa — secciones combinadas de ambos bloques
  // =======================================================================
  function _morbPdfAnchoTexto(texto, fontSize) {
    return String(texto === undefined || texto === null ? "" : texto).length * fontSize * 0.52;
  }
  function _morbPdfAnchoColumnas(head, filas, fontSize) {
    return head.map((h, i) => {
      let max = _morbPdfAnchoTexto(h, fontSize) + 14;
      filas.forEach((fila) => {
        const w = _morbPdfAnchoTexto(fila[i], fontSize) + 14;
        if (w > max) max = w;
      });
      const esPrimeraCol = i === 0;
      const esCategoria = i === 1;
      const minCol = esPrimeraCol ? 22 : 55;
      const maxColIndividual = esCategoria ? 220 : 100;
      return Math.max(minCol, Math.min(maxColIndividual, max));
    });
  }
  function _morbPdfOrientacion(head, filas) {
    const fontSize = 9;
    const margenXLocal = 40;
    const anchoPortrait = 612 - margenXLocal * 2;
    const anchoLandscape = 792 - margenXLocal * 2;
    const anchosIdeal = _morbPdfAnchoColumnas(head, filas, fontSize);
    const anchoIdealTotal = anchosIdeal.reduce((s, w) => s + w, 0);
    function ajustarA(anchoMax, anchos) {
      const suma = anchos.reduce((s, w) => s + w, 0);
      if (suma <= anchoMax) return anchos;
      const factor = anchoMax / suma;
      return anchos.map((w, i) => Math.max(i === 0 ? 20 : 45, Math.round(w * factor)));
    }
    if (anchoIdealTotal <= anchoPortrait) return { orientation: "portrait", anchosCol: anchosIdeal };
    return { orientation: "landscape", anchosCol: ajustarA(anchoLandscape, anchosIdeal) };
  }
  function _tablaDesdeChartInstance(chartInst, categoriaLabel) {
    if (!chartInst || !chartInst.data) return null;
    const labels = (chartInst.data.labels || []).map((l) => (Array.isArray(l) ? l.join(" ") : String(l)));
    const datasets = chartInst.data.datasets || [];
    const head = ["#", categoriaLabel || "Categoría"].concat(datasets.map((ds) => ds.label || "Casos"));
    const hayDiferencia = datasets.length === 2;
    if (hayDiferencia) head.push("Diferencia", "Variación %");
    const rows = labels.map((lab, i) => {
      const vals = datasets.map((ds) => (ds.data || [])[i]);
      const fila = [String(i + 1), lab].concat(vals.map((v) =>
        (v === null || v === undefined) ? "Sin información" : Math.round(v).toLocaleString("es-MX")
      ));
      if (hayDiferencia) {
        const a = vals[0], b = vals[1];
        if (a === null || a === undefined || b === null || b === undefined) {
          fila.push("—", "—");
        } else {
          const diff = b - a;
          const variacion = a > 0 ? (diff / a) * 100 : null;
          const signo = diff > 0 ? "+" : "";
          fila.push(`${signo}${diff.toLocaleString("es-MX")}`);
          fila.push(variacion === null ? "—" : (variacion > 0 ? "+" : "") + variacion.toFixed(1) + "%");
        }
      }
      return fila;
    });
    return { head, rows };
  }
  function _capturarImagenGrafica(chartInst, anchoMax, altoMax) {
    if (!chartInst || !chartInst.canvas) return null;
    try {
      const w = chartInst.canvas.width, h = chartInst.canvas.height;
      if (!w || !h) return null;
      const aux = document.createElement("canvas");
      aux.width = w; aux.height = h;
      const ctxAux = aux.getContext && aux.getContext("2d");
      if (!ctxAux) return null;
      ctxAux.fillStyle = "#FFFFFF";
      ctxAux.fillRect(0, 0, w, h);
      ctxAux.drawImage(chartInst.canvas, 0, 0, w, h);
      const dataUrl = aux.toDataURL("image/jpeg", 0.85);
      if (!dataUrl || dataUrl === "data:,") return null;
      let anchoImg = anchoMax;
      let altoImg = Math.round(anchoImg * (h / w));
      if (altoImg > altoMax) {
        const factor = altoMax / altoImg;
        altoImg = Math.round(altoImg * factor);
        anchoImg = Math.round(anchoImg * factor);
      }
      return { dataUrl, w: anchoImg, h: altoImg };
    } catch (e) {
      return null;
    }
  }
  function _morbPdfTablaKPI(gridId) {
    const tarjetas = Array.from(document.querySelectorAll(`#${gridId} .indicator-card`));
    const head = ["Indicador", "Valor", "Detalle"];
    const rows = tarjetas.map((card) => {
      const label = (card.querySelector(".indicator-card__label") || {}).textContent || "";
      const valor = (card.querySelector(".indicator-card__value") || {}).textContent || "";
      const foot = (card.querySelector(".indicator-card__footnote") || {}).textContent || "";
      return [label.trim(), valor.trim(), foot.trim()];
    });
    return { head, rows };
  }
  function _morbPdfTablaPrincipal(headSelector, bodySelector) {
    const headCells = Array.from(document.querySelectorAll(headSelector)).map((th) => th.textContent.trim());
    const rows = Array.from(document.querySelectorAll(bodySelector)).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim())
    );
    return { head: headCells, rows };
  }
  function _morbPdfFiltrosTexto() {
    const partes = [];
    if (currentFiltersH.municipio_morbilidad) partes.push(`Municipio = "${currentFiltersH.municipio_morbilidad}"`);
    if (currentFiltersH.jurisdiccion_morbilidad) partes.push(`Jurisdicción sanitaria = "${currentFiltersH.jurisdiccion_morbilidad}"`);
    if (currentFiltersH.institucion_morbilidad) partes.push(`Institución = "${currentFiltersH.institucion_morbilidad}"`);
    if (currentFiltersH.unidad_medica_morbilidad) partes.push(`Unidad médica = "${currentFiltersH.unidad_medica_morbilidad}"`);
    const mesesSelH = _mesesSeleccionadosH();
    if (mesesSelH.length) partes.push(`Mes (Bloque 1) = "${mesesSelH.map(_nombreMesLargo).join(", ")}"`);
    const mesesSelP = _mesesSeleccionadosP();
    const semanasSelP = _semanasSeleccionadasP();
    if (mesesSelP.length) partes.push(`Mes (Bloque 2) = "${mesesSelP.map(_nombreMesLargo).join(", ")}"`);
    if (semanasSelP.length) partes.push(`Semana epidemiológica (Bloque 2) = "${semanasSelP.join(", ")}"`);
    if (seleccionPadecimiento) {
      const etq = `${seleccionPadecimiento.cie10_texto ? seleccionPadecimiento.cie10_texto + " — " : ""}${seleccionPadecimiento.padecimiento}`;
      partes.push(`Padecimiento = "${etq}"`);
    }
    return partes.length ? partes.join("; ") : "Ninguno";
  }

  const MORB_PDF_SECCIONES = [
    { valor: "kpi_h", titulo: "Bloque 1 — Indicadores (Casos/Territorio/Instituciones)" },
    { valor: "principal_h", titulo: "Bloque 1 — Gráfica y tabla principal" },
    { valor: "municipio", titulo: "Bloque 1 — Casos por municipio", categoriaLabel: "Municipio" },
    { valor: "jurisdiccion", titulo: "Bloque 1 — Casos por jurisdicción sanitaria", categoriaLabel: "Jurisdicción sanitaria" },
    { valor: "institucion", titulo: "Bloque 1 — Casos por institución", categoriaLabel: "Institución" },
    { valor: "unidadmedica", titulo: "Bloque 1 — Casos por unidad médica", categoriaLabel: "Unidad médica" },
    { valor: "grupoedad", titulo: "Bloque 1 — Casos por grupo de edad", categoriaLabel: "Grupo de edad" },
    { valor: "sexo", titulo: "Bloque 1 — Casos por sexo", categoriaLabel: "Sexo" },
    { valor: "tendencia", titulo: "Bloque 1 — Tendencia por año/mes", categoriaLabel: "Mes" },
    { valor: "mesanio", titulo: "Bloque 1 — Comparativo por mes y año", categoriaLabel: "Mes" },
    { valor: "kpi_p", titulo: "Bloque 2 — Indicadores (Padecimientos)" },
    { valor: "principal_p", titulo: "Bloque 2 — Gráfica y tabla principal" },
    { valor: "padecimientos", titulo: "Bloque 2 — Padecimiento(s) dentro de la selección", categoriaLabel: "Padecimiento" },
    { valor: "grupoedad_p", titulo: "Bloque 2 — Casos por grupo de edad", categoriaLabel: "Grupo de edad" },
    { valor: "sexo_p", titulo: "Bloque 2 — Casos por sexo", categoriaLabel: "Sexo" },
    { valor: "tendencia_p", titulo: "Bloque 2 — Tendencia por año/mes", categoriaLabel: "Mes" },
    { valor: "mesanio_p", titulo: "Bloque 2 — Comparativo por mes y año", categoriaLabel: "Mes" },
  ];
  const MORB_PDF_CANVAS_ID = {
    municipio: "morb-h-chart-municipio",
    jurisdiccion: "morb-h-chart-jurisdiccion",
    institucion: "morb-h-chart-institucion",
    unidadmedica: "morb-h-chart-unidadmedica",
    grupoedad: "morb-h-chart-grupoedad",
    sexo: "morb-h-chart-sexo",
    tendencia: "morb-h-chart-tendencia",
    mesanio: "morb-h-chart-mesanio",
    padecimientos: "morb-p-chart-padecimientos",
    grupoedad_p: "morb-p-chart-grupoedad",
    sexo_p: "morb-p-chart-sexo",
    tendencia_p: "morb-p-chart-tendencia",
    mesanio_p: "morb-p-chart-mesanio",
  };

  // -----------------------------------------------------------------------
  // ACT22 — Rediseño del PDF de Morbilidad (sólo presentación; NINGÚN dato
  // ni cálculo cambia). Reglas por dimensión:
  //   - Municipio: SIEMPRE los 18 (nunca Top 10) — ya era así en pantalla,
  //     se conserva igual.
  //   - Unidad médica: el reporte SIEMPRE usa Top 10 (antes el PDF copiaba
  //     el panel en pantalla, que usa Top 20 fijo) — se recalcula aparte,
  //     sin tocar renderChartUnidadMedica ni el tablero en vivo.
  //   - Padecimientos: Top 10 cuando no hay un padecimiento específico
  //     seleccionado; si lo hay, se muestra únicamente esa selección (el
  //     reporte ya no depende del selector "Mostrar" en pantalla, que
  //     la usuaria pudo haber cambiado antes de generar el PDF).
  //   - Jurisdicción/Institución/Grupo de edad/Sexo (ambos bloques):
  //     pocas categorías → siempre todas (ya era así, se conserva).
  //   - Tendencia/Comparativo por mes y año (ambos bloques): serie
  //     temporal completa, nunca Top N (ya era así, se conserva).
  //   - El total general de cada sección (ver Indicadores) siempre se
  //     calcula ANTES de cualquier recorte Top N, así que nunca es sólo
  //     la suma de las categorías mostradas.
  // -----------------------------------------------------------------------
  const DIM_EQUIV_H_A_PANORAMA = { municipio: "municipio", jurisdiccion: "jurisdiccion", institucion: "institucion", unidad_medica: "unidadmedica", grupo_edad: "grupoedad", sexo: "sexo" };
  const DIM_EQUIV_P_A_PANORAMA = { padecimiento: "padecimientos", grupo_edad: "grupoedad_p", sexo: "sexo_p" };

  function _pdfReaggregarCategoriaTopN(rowsFiltradas, dimIdx, idxCasosCol, idxAnioCol, filtrosActivos, aniosSeleccionados, modoComparativo, topN) {
    if (modoComparativo) {
      let resultados = svcCarga.agregarComparativo(rowsFiltradas, dimIdx, idxCasosCol, filtrosActivos, idxAnioCol, aniosSeleccionados);
      const totalCategorias = resultados.length;
      if (topN) resultados = resultados.slice(0, topN);
      return {
        categorias: resultados.map((r) => r.categoria),
        valores: null,
        seriesPorAnio: aniosSeleccionados.map((y) => ({ label: y, data: resultados.map((r) => r.valores[y] || 0) })),
        totalCategorias,
      };
    }
    const filtrosConAnio = aniosSeleccionados.length === 1 ? filtrosActivos.concat([{ colIdx: idxAnioCol, valor: aniosSeleccionados[0] }]) : filtrosActivos;
    let resultados = svcCarga.agregar(rowsFiltradas, dimIdx, idxCasosCol, filtrosConAnio);
    const totalCategorias = resultados.length;
    if (topN) resultados = resultados.slice(0, topN);
    return { categorias: resultados.map((r) => r.categoria), valores: resultados.map((r) => r.valor), seriesPorAnio: null, totalCategorias };
  }

  function _tablaDesdeCategorias(r, modoComparativo, aniosSeleccionados) {
    if (modoComparativo) {
      const head = ["#", "Categoría"].concat(aniosSeleccionados.map((y) => `Casos ${y}`));
      const hayDiferencia = aniosSeleccionados.length === 2;
      if (hayDiferencia) head.push("Diferencia", "Variación %");
      const rows = r.categorias.map((cat, i) => {
        const vals = aniosSeleccionados.map((y, yi) => (r.seriesPorAnio[yi] && r.seriesPorAnio[yi].data[i]) || 0);
        const fila = [String(i + 1), cat].concat(vals.map((v) => Math.round(v).toLocaleString("es-MX")));
        if (hayDiferencia) {
          const diff = vals[1] - vals[0];
          const variacion = vals[0] > 0 ? (diff / vals[0]) * 100 : null;
          const signo = diff > 0 ? "+" : "";
          fila.push(`${signo}${diff.toLocaleString("es-MX")}`, variacion === null ? "—" : (variacion > 0 ? "+" : "") + variacion.toFixed(1) + "%");
        }
        return fila;
      });
      return { head, rows };
    }
    return { head: ["#", "Categoría", "Casos"], rows: r.categorias.map((cat, i) => [String(i + 1), cat, Math.round(r.valores[i]).toLocaleString("es-MX")]) };
  }

  // Construye y renderiza una gráfica de barras INDEPENDIENTE del tablero
  // en pantalla (en un <canvas> fuera de la vista, nunca visible para la
  // usuaria) — sólo para las 2 secciones del reporte (Unidad médica,
  // Padecimientos) cuyo Top N debe ser fijo (10) sin importar lo que el
  // selector "Mostrar" tenga elegido en ese momento en el tablero. No
  // toca renderChartUnidadMedica, renderChartPadecimientos, ni ningún
  // <canvas> real del tablero.
  function _pdfRenderGraficaIndependiente(categorias, datos, modoComparativo, tituloPartes, opts) {
    if (!categorias.length) return null;
    opts = opts || {};
    const horizontal = opts.horizontal !== false; // por defecto horizontal (igual que antes)
    const anchoCanvas = opts.anchoCanvas || 920;
    const id = `morb-pdf-tmp-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const cont = document.createElement("div");
    cont.id = id + "-wrap";
    cont.style.cssText = `position:fixed; left:-9999px; top:0; width:${anchoCanvas}px;`;
    const canvas = document.createElement("canvas");
    canvas.id = id;
    cont.appendChild(canvas);
    document.body.appendChild(cont);
    // ACT22 (corrección) — IMPORTANTE: a diferencia del panel en pantalla
    // (que crece sin límite para permitir scroll), el lienzo del PDF debe
    // caber en una página: si se le deja crecer libremente con
    // _ajustarAlturaBarra (pensada para scroll), el resultado queda muy
    // alto y angosto, y _capturarImagenGrafica lo encoge completo para que
    // quepa en el alto disponible — dejando la gráfica angosta con
    // márgenes blancos enormes a los lados (el defecto original que se
    // quería corregir). Por eso aquí se usa una altura EXPLÍCITA
    // (opts.altoCanvas, calculada por _decidirDisenoSeccionCategorica para
    // que el lienzo ya tenga la proporción ancho:alto de la página de
    // destino) en vez de dejar que la altura crezca con el contenido.
    if (opts.altoCanvas) {
      cont.style.height = `${opts.altoCanvas}px`;
    } else {
      _ajustarAlturaBarra(cont.id, categorias, modoComparativo, (datos && datos.length) || 1);
    }
    const barraOpts = Object.assign({ horizontal, wrapAt: 28, tituloPartes }, _morbBarraOpts(modoComparativo));
    // ACT22 (corrección) — Tendencia por año/mes es una gráfica de LÍNEA
    // (SNSP_renderLineChart), no de barras: necesita su propio constructor,
    // pero el resto del mecanismo (lienzo propio, tamaño explícito, pintado
    // síncrono antes de capturar) es idéntico.
    const inst = opts.tipo === "linea"
      ? SNSP_renderLineChart(id, categorias, datos, Object.assign({ tituloPartes }, MORB_OPTS_ETIQUETA_MENSUAL))
      : (modoComparativo
        ? SNSP_renderGroupedBarChart(id, categorias, datos, "Casos", barraOpts)
        : SNSP_renderBarChart(id, categorias, datos, "Casos", barraOpts));
    if (inst) {
      // ACT22 (corrección) — IMPORTANTE: Chart.js dibuja su primer cuadro de
      // forma asíncrona (vía requestAnimationFrame), así que ni crear el
      // Chart ni llamar a .update("none") garantizan que las barras ya
      // estén pintadas en el <canvas> cuando esta misma función retorna.
      // Capturar el canvas demasiado pronto producía una imagen en blanco
      // en el PDF (se veía el rectángulo pero sin barras ni etiquetas).
      // inst.draw() es el método de bajo nivel de Chart.js: pinta de
      // inmediato, sin pasar por el Animator ni por requestAnimationFrame,
      // así que al volver de esta función el <canvas> ya tiene el dibujo
      // completo y _capturarImagenGrafica puede leerlo de forma confiable.
      inst.options.animation = false;
      inst.resize();
      inst.update("none");
      inst.draw();
    }
    return { chartInst: inst, limpiar: () => { if (inst) inst.destroy(); if (cont.parentNode) cont.parentNode.removeChild(cont); } };
  }

  // ACT22 (corrección) — decide el "diseño" (orientación de hoja + tamaño
  // del lienzo fuera de pantalla) de una sección categórica del PDF a
  // partir únicamente de su contenido (número de categorías / longitud de
  // las etiquetas), nunca de dónde vino el dato. Municipio SIEMPRE usa
  // hoja apaisada (regla explícita e incondicional); el resto decide según
  // tenga muchas categorías o nombres largos.
  //
  // El lienzo se dimensiona con la MISMA proporción ancho:alto que la caja
  // de la página donde va a colocarse la imagen (ver _construirPlanReportePDF:
  // página completa menos márgenes, con el tope "imagen grande" que se usa
  // cuando la gráfica ocupa una página propia). Así, al capturarla,
  // _capturarImagenGrafica no necesita encogerla para que quepa — ya cabe
  // "justa" — y la gráfica aprovecha prácticamente todo el ancho y alto
  // útil de la hoja en vez de quedar angosta con márgenes en blanco.
  function _decidirDisenoSeccionCategorica(clave, categorias, modoComparativo, nSeries) {
    const n = (categorias || []).length;
    const maxLen = (categorias || []).reduce((m, c) => Math.max(m, String(c == null ? "" : c).length), 0);
    const landscape = clave === "municipio" || n > 10 || maxLen > 18;

    const margenX = 40;
    const anchoPagina = landscape ? 792 : 612;
    const altoPagina = landscape ? 612 : 792;
    const anchoDisponible = anchoPagina - margenX * 2;
    const topeImagenGrande = Math.round((altoPagina - margenX * 2) * 0.92);
    const RATIO = anchoDisponible / topeImagenGrande; // ancho:alto de la caja de destino

    // Alto que necesitan, de verdad, "n" categorías para que cada una (y su
    // etiqueta, posiblemente envuelta en varias líneas) quede legible —
    // misma fórmula que usa el panel en pantalla (_alturaCategoriaBarras),
    // pero aquí fija el PISO del lienzo del PDF en vez de dejarlo crecer
    // sin límite.
    const alturaPorCategoria = _alturaCategoriaBarras(!!modoComparativo, nSeries || 1);
    const altoNecesario = Math.max(260, n * alturaPorCategoria + 90);

    const FACTOR_NITIDEZ = 1.6; // resolución extra para que el texto no se vea pixelado
    let altoCanvas = Math.round(altoNecesario * FACTOR_NITIDEZ);
    let anchoCanvas = Math.round(altoCanvas * RATIO);
    // Piso/techo razonables de resolución.
    anchoCanvas = Math.max(900, Math.min(2200, anchoCanvas));
    altoCanvas = Math.round(anchoCanvas / RATIO);

    return { landscape, anchoCanvas, altoCanvas };
  }

  // Extrae categorías/datos de una instancia de Chart.js YA renderizada en
  // pantalla (sin volver a calcular nada): se usa para poder re-dibujar esa
  // misma información, con esos mismos valores, en un lienzo más grande y
  // controlado fuera de pantalla sólo para la captura del PDF.
  function _datosDesdeChartInstance(chartInst, modoComparativo) {
    if (!chartInst || !chartInst.data) return null;
    const categorias = (chartInst.data.labels || []).map((l) => (Array.isArray(l) ? l.join(" ") : String(l)));
    const datasets = chartInst.data.datasets || [];
    if (modoComparativo) {
      return { categorias, datos: datasets.map((ds) => ({ label: ds.label, data: (ds.data || []).slice() })) };
    }
    return { categorias, datos: (datasets[0] && datasets[0].data) ? datasets[0].data.slice() : [] };
  }

  function _bloqueDeSeccion(clave) {
    return (clave.endsWith("_p") || clave === "padecimientos") ? 2 : 1;
  }

  function _construirSeccionesPdfDatos(seccionesElegidas) {
    const seccionesDatos = [];
    const limpiezas = [];
    let elegidas = seccionesElegidas.slice();

    // Elimina duplicados: si "Gráfica y tabla principal" está incluida y su
    // dimensión activa ("Por") coincide con una sección de panorama
    // también incluida, se omite la de panorama (misma información dos
    // veces) y se deja constancia en una nota de la principal.
    let notaDedupH = null, notaDedupP = null;
    if (elegidas.includes("principal_h") && selDimH) {
      const equivalente = DIM_EQUIV_H_A_PANORAMA[selDimH.value];
      if (equivalente && elegidas.includes(equivalente)) {
        elegidas = elegidas.filter((c) => c !== equivalente);
        notaDedupH = `Se omitió la sección de panorama "${dimLabelMapH[selDimH.value]}" por duplicar esta misma gráfica y tabla (la vista "Por" activa ya es ${dimLabelMapH[selDimH.value]}).`;
      }
    }
    if (elegidas.includes("principal_p") && selDimP) {
      const equivalente = DIM_EQUIV_P_A_PANORAMA[selDimP.value];
      if (equivalente && elegidas.includes(equivalente)) {
        elegidas = elegidas.filter((c) => c !== equivalente);
        notaDedupP = `Se omitió la sección de panorama "${dimLabelMapP[selDimP.value]}" por duplicar esta misma gráfica y tabla (la vista "Por" activa ya es ${dimLabelMapP[selDimP.value]}).`;
      }
    }

    // ACT22 (corrección) — "Tendencia por año/mes" (línea) y "Comparativo
    // por mes y año" (barras) presentan esencialmente la misma información
    // mensual. Si ambas están marcadas (son el valor por defecto en los dos
    // bloques), se conserva únicamente "Tendencia por año/mes" —comunica
    // mejor la evolución mensual— y se deja constancia en su nota.
    let notaDedupTendH = null, notaDedupTendP = null;
    if (elegidas.includes("tendencia") && elegidas.includes("mesanio")) {
      elegidas = elegidas.filter((c) => c !== "mesanio");
      notaDedupTendH = 'Se omitió la sección "Comparativo por mes y año" (Bloque 1) por repetir la misma información mensual que esta gráfica de tendencia.';
    }
    if (elegidas.includes("tendencia_p") && elegidas.includes("mesanio_p")) {
      elegidas = elegidas.filter((c) => c !== "mesanio_p");
      notaDedupTendP = 'Se omitió la sección "Comparativo por mes y año" (Bloque 2) por repetir la misma información mensual que esta gráfica de tendencia.';
    }

    // ACT22 (corrección) — secciones categóricas cuyo panel en pantalla es
    // SIEMPRE una gráfica de barras (nunca dona): pueden re-dibujarse en un
    // lienzo propio, más grande y con el ancho que su contenido necesite,
    // sin recalcular ningún dato (se reutilizan los mismos labels/valores
    // ya calculados por el tablero en pantalla). Jurisdicción sólo entra
    // aquí en modo comparativo (en modo de un solo año su panel es una
    // dona, no una barra, y se deja intacta).
    const CLAVES_RECATEGORICAS = { municipio: true, institucion: true, grupoedad: true, sexo: true, grupoedad_p: true, sexo_p: true, jurisdiccion: "solo_comparativo" };

    elegidas.forEach((clave) => {
      if (clave === "kpi_h") {
        seccionesDatos.push({ clave, titulo: "Bloque 1 — Indicadores (morbilidad general)", tabla: _morbPdfTablaKPI("kpi-grid-h"), chartInst: null });
      } else if (clave === "kpi_p") {
        seccionesDatos.push({ clave, titulo: "Bloque 2 — Indicadores (padecimiento[s])", tabla: _morbPdfTablaKPI("kpi-grid-p"), chartInst: null });
      } else if (clave === "principal_h") {
        // ACT22 (corrección) — "Gráfica y tabla principal" es la sección que
        // MÁS a menudo termina mostrando Municipio (es su "Por" por
        // defecto): si no se le aplica el mismo rediseño que a la sección
        // dedicada de Municipio, la regla "Municipio siempre apaisado y
        // legible" queda incumplida justo cuando más importa (selección
        // por defecto). Se re-dibuja con el mismo mecanismo que las demás
        // secciones categóricas, reutilizando los datos ya calculados de
        // chartH, sin recalcular nada.
        const tabla = _morbPdfTablaPrincipal("#morb-h-tabla-head th", "#morb-h-tabla-body tr");
        let chartInstParaImagen = chartH;
        let orientForzada = null;
        const aniosSelPrincipalH = _aniosEnAlcance();
        const modoComparativoPrincipalH = aniosSelPrincipalH.length >= 2;
        const dpPrincipalH = _datosDesdeChartInstance(chartH, modoComparativoPrincipalH);
        if (dpPrincipalH && dpPrincipalH.categorias.length) {
          const claveDisenoH = (selDimH && DIM_EQUIV_H_A_PANORAMA[selDimH.value]) || "generica_h";
          const disenoH = _decidirDisenoSeccionCategorica(claveDisenoH, dpPrincipalH.categorias, modoComparativoPrincipalH, aniosSelPrincipalH.length);
          const tituloPartesH = { indicador: nombreMedidaH(), dimension: dimLabelMapH[selDimH ? selDimH.value : "municipio"], padecimiento: null, lugar: lugarTextoH(), periodo: _periodoTituloTextoH(aniosSelPrincipalH, modoComparativoPrincipalH) };
          const gH = _pdfRenderGraficaIndependiente(dpPrincipalH.categorias, dpPrincipalH.datos, modoComparativoPrincipalH, tituloPartesH, { horizontal: true, anchoCanvas: disenoH.anchoCanvas, altoCanvas: disenoH.altoCanvas });
          if (gH) { chartInstParaImagen = gH.chartInst; limpiezas.push(gH.limpiar); if (disenoH.landscape) orientForzada = "landscape"; }
        }
        const esMunicipioPrincipalH = !!(selDimH && selDimH.value === "municipio");
        if (esMunicipioPrincipalH) orientForzada = "landscape"; // SIEMPRE para Municipio, incondicional.
        // Nota: notaDedupH se sigue calculando arriba (la deduplicación en
        // sí no cambia) pero, a pedido explícito, ya no se muestra en el
        // reporte — es información interna, no para el PDF final.
        // ACT24: Municipio es la ÚNICA excepción que puede usar una página
        // adicional sólo para su tabla cuando gráfica+tabla no caben
        // juntas (ver permiteTablaSiNoCabe en _construirPlanReportePDF) —
        // aquí "Gráfica y tabla principal" hereda esa excepción
        // únicamente cuando su "Por" activo es, de hecho, Municipio.
        seccionesDatos.push({ clave, titulo: "Bloque 1 — Gráfica y tabla principal", tabla, chartInst: chartInstParaImagen, nota: null, orientForzada, permiteTablaSiNoCabe: esMunicipioPrincipalH });
      } else if (clave === "principal_p") {
        const tabla = _morbPdfTablaPrincipal("#morb-p-tabla-head th", "#morb-p-tabla-body tr");
        let chartInstParaImagen = chartP;
        let orientForzada = null;
        const aniosSelPrincipalP = _aniosEnAlcance();
        const modoComparativoPrincipalP = aniosSelPrincipalP.length >= 2;
        const dpPrincipalP = _datosDesdeChartInstance(chartP, modoComparativoPrincipalP);
        if (dpPrincipalP && dpPrincipalP.categorias.length) {
          const claveDisenoP = (selDimP && DIM_EQUIV_P_A_PANORAMA[selDimP.value]) || "generica_p";
          const disenoP = _decidirDisenoSeccionCategorica(claveDisenoP, dpPrincipalP.categorias, modoComparativoPrincipalP, aniosSelPrincipalP.length);
          const tituloPartesP = { indicador: "Casos", dimension: dimLabelMapP[selDimP ? selDimP.value : "padecimiento"], padecimiento: _padecimientoTitulo(), lugar: "el estado de Querétaro", periodo: _periodoTituloTextoP(aniosSelPrincipalP, modoComparativoPrincipalP) };
          const gP = _pdfRenderGraficaIndependiente(dpPrincipalP.categorias, dpPrincipalP.datos, modoComparativoPrincipalP, tituloPartesP, { horizontal: true, anchoCanvas: disenoP.anchoCanvas, altoCanvas: disenoP.altoCanvas });
          if (gP) { chartInstParaImagen = gP.chartInst; limpiezas.push(gP.limpiar); if (disenoP.landscape) orientForzada = "landscape"; }
        }
        // Nota: notaDedupP se sigue calculando arriba (la deduplicación en
        // sí no cambia) pero, a pedido explícito, ya no se muestra en el
        // reporte — es información interna, no para el PDF final.
        seccionesDatos.push({ clave, titulo: "Bloque 2 — Gráfica y tabla principal", tabla, chartInst: chartInstParaImagen, nota: null, orientForzada });
      } else if (clave === "unidadmedica") {
        const filtrosActivos = _filtrosActivosH();
        const aniosSeleccionados = _aniosEnAlcance();
        const modoComparativo = aniosSeleccionados.length >= 2;
        const r = _pdfReaggregarCategoriaTopN(rowsHFiltradas, idxH.unidad_medica, idxH.casos, idxH.anio, filtrosActivos, aniosSeleccionados, modoComparativo, 10);
        const tituloPartes = { indicador: "Casos", dimension: "unidad médica", padecimiento: null, lugar: lugarTextoH(), periodo: _periodoTituloTextoH(aniosSeleccionados, modoComparativo) };
        const diseno = _decidirDisenoSeccionCategorica(clave, r.categorias, modoComparativo, aniosSeleccionados.length);
        const g = _pdfRenderGraficaIndependiente(r.categorias, modoComparativo ? r.seriesPorAnio : r.valores, modoComparativo, tituloPartes, { horizontal: true, anchoCanvas: diseno.anchoCanvas, altoCanvas: diseno.altoCanvas });
        const nota = r.totalCategorias > 10
          ? `Top 10 de ${r.totalCategorias} unidades médicas con casos en la selección vigente — el total general (ver Indicadores) corresponde a TODAS las unidades médicas, no sólo a estas 10.`
          : `Todas las unidades médicas con casos en la selección vigente (${r.totalCategorias}).`;
        seccionesDatos.push({ clave, titulo: "Bloque 1 — Casos por unidad médica (Top 10)", tabla: _tablaDesdeCategorias(r, modoComparativo, aniosSeleccionados), chartInst: g && g.chartInst, nota, orientForzada: diseno.landscape ? "landscape" : null });
        if (g) limpiezas.push(g.limpiar);
      } else if (clave === "padecimientos") {
        const filtrosActivos = _filtrosActivosP();
        const aniosSeleccionados = _aniosEnAlcance();
        const modoComparativo = aniosSeleccionados.length >= 2;
        const topN = seleccionPadecimiento ? null : 10;
        const r = _pdfReaggregarCategoriaTopN(rowsPFiltradas, idxP.padecimiento, idxP.casos, idxP.anio, filtrosActivos, aniosSeleccionados, modoComparativo, topN);
        const tituloPartes = { indicador: "Casos", dimension: "padecimiento", padecimiento: _padecimientoTitulo(), lugar: "el estado de Querétaro", periodo: _periodoTituloTextoP(aniosSeleccionados, modoComparativo) };
        const diseno = _decidirDisenoSeccionCategorica(clave, r.categorias, modoComparativo, aniosSeleccionados.length);
        const g = _pdfRenderGraficaIndependiente(r.categorias, modoComparativo ? r.seriesPorAnio : r.valores, modoComparativo, tituloPartes, { horizontal: true, anchoCanvas: diseno.anchoCanvas, altoCanvas: diseno.altoCanvas });
        const nota = seleccionPadecimiento
          ? `Padecimiento específico seleccionado: se muestra únicamente "${_padecimientoTitulo()}".`
          : (topN && r.totalCategorias > topN
            ? `Top 10 de ${r.totalCategorias} padecimientos en la selección vigente — el total general (ver Indicadores) corresponde a TODOS los padecimientos, no sólo a estos 10.`
            : `Todos los padecimientos en la selección vigente (${r.totalCategorias}).`);
        seccionesDatos.push({ clave, titulo: seleccionPadecimiento ? "Bloque 2 — Padecimiento seleccionado" : "Bloque 2 — Padecimientos (Top 10)", tabla: _tablaDesdeCategorias(r, modoComparativo, aniosSeleccionados), chartInst: g && g.chartInst, nota, orientForzada: diseno.landscape ? "landscape" : null });
        if (g) limpiezas.push(g.limpiar);
      } else {
        const def = MORB_PDF_SECCIONES.find((s) => s.valor === clave);
        const canvasId = MORB_PDF_CANVAS_ID[clave];
        const inst = canvasId ? panoramaCharts[canvasId] : null;
        const tabla = _tablaDesdeChartInstance(inst, def ? def.categoriaLabel : "Categoría");
        let nota = null;
        let chartInstParaImagen = inst;
        let orientForzada = null;

        // ACT22 (corrección) — en vez de capturar la imagen del panel chico
        // tal cual se ve en el tablero (lo que deja gráficas diminutas
        // rodeadas de espacio en blanco cuando hay pocas categorías o
        // nombres largos), se re-dibuja la MISMA información (mismos
        // labels/valores, sin recalcular nada) en un lienzo propio cuyo
        // ancho y orientación de hoja se decide según el contenido.
        const aniosSeleccionados = _aniosEnAlcance();
        const modoComparativo = aniosSeleccionados.length >= 2;
        const elegibleRecategorica = CLAVES_RECATEGORICAS[clave] === true
          || (CLAVES_RECATEGORICAS[clave] === "solo_comparativo" && modoComparativo);
        const CLAVES_TIEMPO_LINEA = { tendencia: true, tendencia_p: true };
        const CLAVES_TIEMPO_BARRA = { mesanio: true, mesanio_p: true };
        if (elegibleRecategorica) {
          const dp = _datosDesdeChartInstance(inst, modoComparativo);
          if (dp && dp.categorias.length) {
            const diseno = _decidirDisenoSeccionCategorica(clave, dp.categorias, modoComparativo, aniosSeleccionados.length);
            const tituloPartes = {
              indicador: "Casos",
              dimension: def ? def.categoriaLabel : clave,
              padecimiento: null,
              lugar: lugarTextoH(),
              periodo: _periodoTituloTextoH(aniosSeleccionados, modoComparativo),
            };
            const g = _pdfRenderGraficaIndependiente(dp.categorias, dp.datos, modoComparativo, tituloPartes, { horizontal: true, anchoCanvas: diseno.anchoCanvas, altoCanvas: diseno.altoCanvas });
            if (g) {
              chartInstParaImagen = g.chartInst;
              limpiezas.push(g.limpiar);
              if (diseno.landscape) orientForzada = "landscape";
            }
          }
        } else if (CLAVES_TIEMPO_LINEA[clave] || CLAVES_TIEMPO_BARRA[clave]) {
          // ACT22 (corrección) — Tendencia/Comparativo por mes y año viven en
          // el Bloque 2 (pestaña que puede estar oculta cuando se genera el
          // PDF desde el Bloque 1, o viceversa): capturar el <canvas> EN
          // PANTALLA directamente podía salir en blanco si su pestaña no
          // estaba activa en ese momento (el panel oculto puede quedar con
          // ancho/alto 0). Igual que las demás secciones, se re-dibuja la
          // MISMA información (sin recalcular nada) en un lienzo propio,
          // siempre visible para Chart.js aunque la pestaña real esté oculta.
          const dp = _datosDesdeChartInstance(inst, true); // las series mensuales siempre vienen como arreglo de series (una por año), haya 1 año o varios
          if (dp && dp.categorias.length) {
            const tituloPartes = {
              indicador: "Casos",
              dimension: "mes",
              padecimiento: null,
              lugar: lugarTextoH(),
              periodo: _periodoTituloTextoH(aniosSeleccionados, modoComparativo),
            };
            const g = _pdfRenderGraficaIndependiente(dp.categorias, dp.datos, true, tituloPartes, {
              tipo: CLAVES_TIEMPO_LINEA[clave] ? "linea" : "barra",
              horizontal: false,
              anchoCanvas: 1100,
              altoCanvas: 560,
            });
            if (g) { chartInstParaImagen = g.chartInst; limpiezas.push(g.limpiar); }
          }
        }

        if (clave === "municipio") {
          const conteo = _contarCategoriasConDatos(inst);
          nota = (conteo && conteo.conDatos < conteo.total)
            ? `${conteo.conDatos} de ${conteo.total} municipios con casos en el periodo — se muestran los ${conteo.total} (todos, nunca Top 10) para poder comparar años (0 = sin casos registrados).`
            : `Los ${conteo ? conteo.total : 18} municipios de Querétaro, siempre completos (nunca Top 10). Hoja en orientación horizontal/apaisada para que las 18 barras y sus etiquetas se lean con claridad.`;
          orientForzada = "landscape"; // SIEMPRE, incondicional — no depende de si se pudo redibujar la gráfica.
        }
        // Nota: notaDedupTendH/notaDedupTendP se siguen calculando arriba
        // (la deduplicación de Tendencia/Comparativo en sí no cambia) pero,
        // a pedido explícito, ya no se muestran en el reporte — son
        // información interna, no para el PDF final.

        // ACT24 — "Municipio" es la ÚNICA sección (junto con "Gráfica y
        // tabla principal" cuando su "Por" es Municipio, ver arriba) que
        // puede usar una página adicional sólo para su tabla cuando
        // gráfica+tabla no caben juntas; todas las demás, si no caben
        // juntas, se quedan únicamente con la gráfica grande (ya con sus
        // valores legibles) y no agregan una página sólo para repetir en
        // tabla lo que la gráfica ya muestra.
        if (def) seccionesDatos.push({ clave, titulo: def.titulo, tabla, chartInst: chartInstParaImagen, nota, orientForzada, permiteTablaSiNoCabe: clave === "municipio" });
      }
    });
    return { seccionesDatos, limpiezas };
  }

  function _construirPlanReportePDF(seccionesElegidas, observaciones) {
    const margenX = 40;
    const aniosSeleccionados = _aniosEnAlcance();
    const modoComparativo = aniosSeleccionados.length >= 2;
    const periodoPdf = _periodoCompletoTextoH(aniosSeleccionados, modoComparativo);
    const fechaGeneracion = new Date().toLocaleString("es-MX");
    const fuenteTexto = sourceLabel ? sourceLabel.textContent : "";
    const { seccionesDatos, limpiezas } = _construirSeccionesPdfDatos(seccionesElegidas);

    const paginas = [];
    let orientationActual = "portrait";
    let pageWidth = 612, pageHeight = 792;
    let y = 44;
    let pagina = { orientation: orientationActual, elementos: [] };
    function cerrarPagina() { if (pagina.elementos.length) paginas.push(pagina); }
    function nuevaPagina(orient) {
      cerrarPagina();
      orientationActual = orient;
      pageWidth = orient === "landscape" ? 792 : 612;
      pageHeight = orient === "landscape" ? 612 : 792;
      y = 44;
      pagina = { orientation: orientationActual, elementos: [] };
    }

    pagina.elementos.push({
      tipo: "encabezado",
      titulo: "SNSP Inteligencia Digital — Morbilidad en el estado de Querétaro (2022-2026)",
      periodo: periodoPdf,
      filtros: _morbPdfFiltrosTexto(),
      analizarPor: `Bloque 1: ${nombreMedidaH()} / ${dimLabelMapH[selDimH ? selDimH.value : "municipio"] || ""} — Bloque 2: Casos / ${dimLabelMapP[selDimP ? selDimP.value : "padecimiento"] || ""}`,
      fecha: fechaGeneracion,
      fuente: fuenteTexto,
    });
    y += 22 + 14 * 5;
    if (observaciones && observaciones.trim()) {
      pagina.elementos.push({ tipo: "observaciones", texto: observaciones.trim() });
      const lineasAprox = Math.ceil(observaciones.trim().length / 95);
      y += 18 + lineasAprox * 14;
    }

    const ALTO_FILA_ESTIM = 16;
    const ALTO_TITULO = 20;
    const ALTO_NOTA = 14;
    const ALTO_DIVISOR_BLOQUE = 34;

    // ACT22 — separación muy clara entre Bloque 1 (morbilidad general,
    // TODAS las causas) y Bloque 2 (padecimiento[s] seleccionado[s]): un
    // separador visual explícito cada vez que el reporte pasa de un
    // bloque al otro, para que el total de Bloque 1 nunca se confunda con
    // cifras de un padecimiento específico de Bloque 2.
    let bloqueActual = null;
    const TEXTO_DIVISOR = {
      1: "BLOQUE 1 — MORBILIDAD GENERAL: cifras de TODAS las causas en el periodo. No corresponden a ningún padecimiento específico, aunque el Bloque 2 de este mismo reporte tenga una selección aplicada.",
      2: "BLOQUE 2 — PADECIMIENTO(S): cifras exclusivas de la selección de padecimiento(s) vigente. Son independientes de Bloque 1 y NO deben sumarse ni compararse directamente con sus totales.",
    };

    seccionesDatos.forEach((sec) => {
      const bloqueSeccion = _bloqueDeSeccion(sec.clave);
      if (bloqueSeccion !== bloqueActual) {
        if (bloqueActual !== null && y > 44) nuevaPagina(orientationActual); // Bloque 2 siempre empieza en página nueva si ya había contenido
        pagina.elementos.push({ tipo: "divisor-bloque", texto: TEXTO_DIVISOR[bloqueSeccion] });
        y += ALTO_DIVISOR_BLOQUE;
        bloqueActual = bloqueSeccion;
      }

      const hayTabla = sec.tabla && sec.tabla.rows.length;
      const orientTabla = hayTabla ? _morbPdfOrientacion(sec.tabla.head, sec.tabla.rows).orientation : "portrait";
      // ACT22 (corrección) — algunas secciones (Municipio siempre; otras
      // cuando tienen muchas categorías o nombres largos) exigen hoja
      // apaisada por el contenido de su GRÁFICA, no sólo por el ancho de
      // su tabla — ver _decidirDisenoSeccionCategorica. Esa necesidad
      // manda sobre la decisión basada únicamente en la tabla.
      const orientNecesaria = sec.orientForzada || orientTabla;
      if (orientNecesaria !== orientationActual) nuevaPagina(orientNecesaria);

      const anchoDisponible = pageWidth - margenX * 2;
      const altoUtilPagina = pageHeight - margenX * 2;
      const altoNota = sec.nota ? ALTO_NOTA : 0;
      const altoTablaEstim = hayTabla ? 20 + (sec.tabla.rows.length + 1) * ALTO_FILA_ESTIM + 10 : 24;

      // ACT22: gráficas más grandes (antes 0.62/0.90 del alto útil) para
      // aprovechar mejor la hoja y que las etiquetas se lean con claridad.
      const topeImagenJuntos = Math.round(altoUtilPagina * 0.72);
      const imagenJuntos = _capturarImagenGrafica(sec.chartInst, anchoDisponible, topeImagenJuntos);
      const altoImagenJuntos = imagenJuntos ? imagenJuntos.h + 12 : 0;
      const altoJuntos = ALTO_TITULO + altoNota + altoImagenJuntos + altoTablaEstim;
      const limiteEnPaginaLimpia = altoUtilPagina - 4;
      const separar = hayTabla && imagenJuntos && altoJuntos > limiteEnPaginaLimpia;

      if (!separar) {
        const cabeEnRestoDePagina = y + altoJuntos <= pageHeight - margenX;
        if (!cabeEnRestoDePagina && y > 44) nuevaPagina(orientationActual);
        pagina.elementos.push({ tipo: "seccion", titulo: sec.titulo, nota: sec.nota, imagen: imagenJuntos, tabla: sec.tabla });
        y += altoJuntos;
      } else {
        if (y > 44) nuevaPagina(orientationActual);
        const topeImagenGrande = Math.round(altoUtilPagina * 0.92);
        const imagenGrande = _capturarImagenGrafica(sec.chartInst, anchoDisponible, topeImagenGrande) || imagenJuntos;
        pagina.elementos.push({ tipo: "seccion-imagen", titulo: sec.titulo, nota: sec.nota, imagen: imagenGrande });
        if (sec.permiteTablaSiNoCabe) {
          // Municipio (y "Gráfica y tabla principal" cuando su "Por" es
          // Municipio): única excepción que conserva la página adicional
          // sólo para su tabla — siempre los 18 municipios, nunca Top 10.
          nuevaPagina(orientationActual);
          pagina.elementos.push({ tipo: "seccion-tabla", titulo: `${sec.titulo} (continuación)`, tabla: sec.tabla });
          y += altoTablaEstim;
        } else {
          // ACT24 — ya no se agrega una página aparte sólo para repetir en
          // tabla lo que esta gráfica grande ya muestra con sus propios
          // valores; la siguiente sección empieza en una página nueva para
          // no amontonarse debajo de una gráfica que ya usa casi toda la
          // hoja.
          nuevaPagina(orientationActual);
        }
      }
    });

    cerrarPagina();
    return { paginas, limpiezas };
  }

  function _dibujarPlanEnJsPDF(plan) {
    const { jsPDF } = window.jspdf;
    const margenX = 40;
    let doc = null;
    let pageWidth = 612, pageHeight = 792, y = 44;

    plan.paginas.forEach((pag, idx) => {
      if (idx === 0) {
        doc = new jsPDF({ orientation: pag.orientation, unit: "pt", format: "letter" });
      } else {
        doc.addPage("letter", pag.orientation);
      }
      pageWidth = pag.orientation === "landscape" ? 792 : 612;
      pageHeight = pag.orientation === "landscape" ? 612 : 792;
      y = 44;
      const anchoDisponible = pageWidth - margenX * 2;

      pag.elementos.forEach((el) => {
        if (el.tipo === "encabezado") {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(14);
          doc.text(el.titulo, margenX, y);
          y += 22;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          const metaLineas = [
            `Periodo: ${el.periodo}`,
            `Filtros aplicados: ${el.filtros}`,
            `Analizar / Por: ${el.analizarPor}`,
            `Fecha de generación: ${el.fecha}`,
            `Fuente: ${el.fuente}`,
          ];
          metaLineas.forEach((linea) => {
            const partido = doc.splitTextToSize(linea, anchoDisponible);
            partido.forEach((l) => { doc.text(l, margenX, y); y += 14; });
          });
        } else if (el.tipo === "divisor-bloque") {
          // ACT22: separador visual muy claro entre Bloque 1 y Bloque 2
          // (franja de color institucional con texto en blanco) — evita
          // que el total general de un bloque se confunda con cifras del
          // otro al hojear el reporte.
          doc.setFillColor(97, 18, 50);
          doc.rect(margenX, y - 14, anchoDisponible, 26, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(255, 255, 255);
          const lineasDivisor = doc.splitTextToSize(el.texto, anchoDisponible - 16);
          let yDivisor = y - 14 + 10;
          lineasDivisor.slice(0, 2).forEach((l) => { doc.text(l, margenX + 8, yDivisor); yDivisor += 11; });
          doc.setTextColor(0, 0, 0);
          y += 20;
        } else if (el.tipo === "observaciones") {
          y += 4;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10.5);
          doc.text("Análisis / Observaciones", margenX, y);
          y += 14;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          const lineasObs = doc.splitTextToSize(el.texto, anchoDisponible);
          lineasObs.forEach((l) => { doc.text(l, margenX, y); y += 14; });
        } else if (el.tipo === "seccion" || el.tipo === "seccion-imagen" || el.tipo === "seccion-tabla") {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.text(el.titulo, margenX, y);
          y += 16;
          if (el.nota) {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(8.5);
            const partidoNota = doc.splitTextToSize(el.nota, anchoDisponible);
            partidoNota.forEach((l) => { doc.text(l, margenX, y); y += 12; });
            y += 2;
            doc.setFont("helvetica", "normal");
          }
          if (el.imagen) {
            const xImg = margenX + (anchoDisponible - el.imagen.w) / 2;
            doc.addImage(el.imagen.dataUrl, "JPEG", xImg, y, el.imagen.w, el.imagen.h);
            y += el.imagen.h + 10;
          }
          if (el.tipo !== "seccion-imagen") {
            const hayTabla = el.tabla && el.tabla.rows && el.tabla.rows.length;
            if (!hayTabla) {
              doc.setFont("helvetica", "normal");
              doc.setFontSize(10);
              doc.text("Sin datos para la selección vigente.", margenX, y);
              y += 18;
            } else {
              const { anchosCol } = _morbPdfOrientacion(el.tabla.head, el.tabla.rows);
              const anchoTablaReal = Math.min(anchoDisponible, anchosCol.reduce((s, w) => s + w, 0));
              const columnStyles = {};
              anchosCol.forEach((w, i) => { columnStyles[i] = { cellWidth: w }; });
              if (doc.autoTable) {
                doc.autoTable({
                  startY: y,
                  margin: { left: margenX, right: margenX },
                  head: [el.tabla.head],
                  body: el.tabla.rows,
                  styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
                  headStyles: { fillColor: [97, 18, 50] },
                  columnStyles,
                  tableWidth: anchoTablaReal,
                  rowPageBreak: "avoid",
                });
                y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y) + 18;
              } else {
                y += 18;
              }
            }
          }
        }
      });
    });

    return doc;
  }

  function generarReportePDFMorbilidad(seccionesElegidas, observaciones) {
    if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
      return { ok: false, error: "No se pudo cargar el generador de PDF. Verifica tu conexión e intenta de nuevo." };
    }
    if (!seccionesElegidas || !seccionesElegidas.length) {
      return { ok: false, error: "Elige al menos una sección para incluir en el reporte." };
    }
    const margenX = 40;
    const plan = _construirPlanReportePDF(seccionesElegidas, observaciones);
    (plan.limpiezas || []).forEach((fn) => fn());
    const doc = _dibujarPlanEnJsPDF(plan);

    const totalPaginas = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPaginas; p++) {
      doc.setPage(p);
      const tam = doc.internal.pageSize;
      const wPagina = tam && typeof tam.getWidth === "function" ? tam.getWidth() : 612;
      const hPagina = tam && typeof tam.getHeight === "function" ? tam.getHeight() : 792;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Página ${p} de ${totalPaginas}`, wPagina - margenX, hPagina - 20, { align: "right" });
    }

    const nombreArchivo = `snsp_morbilidad_reporte_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(nombreArchivo);
    return { ok: true };
  }

  const modalPdf = document.getElementById("modal-morb-pdf");
  const btnAbrirPdf = document.getElementById("btn-morb-abrir-pdf");
  const formPdf = document.getElementById("form-morb-pdf");
  const errorPdf = document.getElementById("morb-pdf-error");
  const vistaPreviaPdf = document.getElementById("morb-pdf-vista-previa");
  const vistaPreviaResumen = document.getElementById("morb-pdf-vista-previa-resumen");
  const errorVistaPreviaPdf = document.getElementById("morb-pdf-vista-previa-error");
  const btnVpZoomMenos = document.getElementById("btn-morb-vp-zoom-menos");
  const btnVpZoomMas = document.getElementById("btn-morb-vp-zoom-mas");
  const btnVpZoomAjustar = document.getElementById("btn-morb-vp-zoom-ajustar");
  const vpZoomNivel = document.getElementById("morb-vp-zoom-nivel");
  const btnVpPaginaAnterior = document.getElementById("btn-morb-vp-pagina-anterior");
  const btnVpPaginaSiguiente = document.getElementById("btn-morb-vp-pagina-siguiente");
  const vpPaginaIndicador = document.getElementById("morb-vp-pagina-indicador");

  function _checksSeccionesPdf() {
    return Array.from(document.querySelectorAll('#morb-pdf-secciones input[name="morb-pdf-seccion"]'));
  }

  let _vistaPreviaDatos = null;
  let _vistaPreviaZoom = 1;
  let _vistaPreviaPaginaActual = 1;
  let _vistaPreviaTotalPaginas = 0;
  const ZOOM_VP_MIN = 0.4, ZOOM_VP_MAX = 2.5, ZOOM_VP_PASO = 0.1;
  const _escHtml = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  function _renderPlanVistaPreviaHTML(plan) {
    const paginas = plan.paginas;
    if (!paginas.length) {
      return `<p class="text-muted" style="font-size:var(--fs-body-sm);">Elige al menos una sección para ver la vista previa.</p>`;
    }
    return paginas.map((pag, i) => {
      const horizontal = pag.orientation === "landscape";
      const aspect = horizontal ? "11 / 8.5" : "8.5 / 11";
      const elementosHtml = pag.elementos.map((b) => {
        if (b.tipo === "encabezado") {
          return `
            <div style="margin-bottom:10px;">
              <div style="font-weight:700; font-size:12px; margin-bottom:6px;">${_escHtml(b.titulo)}</div>
              <div style="font-size:9px; line-height:1.5; color:#333;">
                <div><strong>Periodo:</strong> ${_escHtml(b.periodo)}</div>
                <div><strong>Filtros aplicados:</strong> ${_escHtml(b.filtros)}</div>
                <div><strong>Analizar / Por:</strong> ${_escHtml(b.analizarPor)}</div>
                <div><strong>Fecha de generación:</strong> ${_escHtml(b.fecha)}</div>
                <div><strong>Fuente:</strong> ${_escHtml(b.fuente)}</div>
              </div>
            </div>`;
        }
        if (b.tipo === "divisor-bloque") {
          return `
            <div style="background:#611232; color:#fff; font-weight:700; font-size:9px; padding:8px 10px; margin:4px 0 10px; border-radius:3px;">
              ${_escHtml(b.texto)}
            </div>`;
        }
        if (b.tipo === "observaciones") {
          return `
            <div style="margin-bottom:10px;">
              <div style="font-weight:700; font-size:10px; margin-bottom:3px;">Análisis / Observaciones</div>
              <div style="font-size:9px; white-space:pre-wrap;">${_escHtml(b.texto)}</div>
            </div>`;
        }
        const notaHtml = b.nota ? `<div style="font-size:8px; font-style:italic; color:#555; margin:-2px 0 4px;">${_escHtml(b.nota)}</div>` : "";
        const imgHtml = b.imagen
          ? `<img src="${b.imagen.dataUrl}" style="display:block; margin:4px auto; max-width:100%; height:auto;" alt="${_escHtml(b.titulo)}">`
          : "";
        let tablaHtml = "";
        if (b.tipo !== "seccion-imagen") {
          const hayTabla = b.tabla && b.tabla.rows && b.tabla.rows.length;
          tablaHtml = hayTabla
            ? `<table style="width:100%; border-collapse:collapse; font-size:8px; margin-top:4px;">
                <thead><tr>${b.tabla.head.map((h) => `<th style="border:1px solid #ccc; padding:2px 4px; background:#611232; color:#fff; text-align:left;">${_escHtml(h)}</th>`).join("")}</tr></thead>
                <tbody>${b.tabla.rows.map((fila) => `<tr>${fila.map((c) => `<td style="border:1px solid #ddd; padding:2px 4px;">${_escHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>
              </table>`
            : `<p style="font-size:9px; color:#666;">Sin datos para la selección vigente.</p>`;
        }
        return `
          <div style="margin-bottom:12px;">
            <div style="font-weight:700; font-size:11px; margin-bottom:4px;">${_escHtml(b.titulo)}</div>
            ${notaHtml}
            ${imgHtml}
            ${tablaHtml}
          </div>`;
      }).join("");
      return `
        <div class="morb-vista-previa-pagina" data-pagina="${i + 1}" data-orientacion="${pag.orientation}" style="margin:0 0 22px;">
          <div class="text-muted" style="font-size:var(--fs-body-sm); margin-bottom:4px;">Página ${i + 1} de ${paginas.length} — ${horizontal ? "horizontal" : "vertical"}</div>
          <div class="morb-vista-previa-hoja" style="aspect-ratio:${aspect}; width:100%; max-width:${horizontal ? "780px" : "600px"}; margin:0 auto; background:#fff; border:1px solid var(--border-strong); box-shadow:0 1px 4px rgba(0,0,0,.15); padding:18px 16px; overflow:auto; color:#22201D;">
            ${elementosHtml}
          </div>
        </div>`;
    }).join("");
  }

  function _aplicarZoomVistaPrevia() {
    const wrap = document.getElementById("morb-vp-paginas-wrap");
    if (wrap) { wrap.style.transform = `scale(${_vistaPreviaZoom})`; wrap.style.transformOrigin = "top center"; }
    if (vpZoomNivel) vpZoomNivel.textContent = `${Math.round(_vistaPreviaZoom * 100)}%`;
    if (btnVpZoomMenos) btnVpZoomMenos.disabled = _vistaPreviaZoom <= ZOOM_VP_MIN;
    if (btnVpZoomMas) btnVpZoomMas.disabled = _vistaPreviaZoom >= ZOOM_VP_MAX;
  }
  function _fijarZoomVistaPrevia(valor) {
    _vistaPreviaZoom = Math.min(ZOOM_VP_MAX, Math.max(ZOOM_VP_MIN, +valor.toFixed(2)));
    _aplicarZoomVistaPrevia();
  }
  if (btnVpZoomMenos) btnVpZoomMenos.addEventListener("click", () => _fijarZoomVistaPrevia(_vistaPreviaZoom - ZOOM_VP_PASO));
  if (btnVpZoomMas) btnVpZoomMas.addEventListener("click", () => _fijarZoomVistaPrevia(_vistaPreviaZoom + ZOOM_VP_PASO));
  if (btnVpZoomAjustar) {
    btnVpZoomAjustar.addEventListener("click", () => {
      const wrap = document.getElementById("morb-vp-paginas-wrap");
      const hoja = wrap ? wrap.querySelector(".morb-vista-previa-hoja") : null;
      const anchoHoja = hoja ? (hoja.getBoundingClientRect().width || hoja.offsetWidth) : 0;
      const anchoDisponible = vistaPreviaResumen ? (vistaPreviaResumen.clientWidth - 24) : 0;
      if (anchoHoja > 0 && anchoDisponible > 0) {
        _fijarZoomVistaPrevia(anchoDisponible / anchoHoja);
      } else {
        _fijarZoomVistaPrevia(1);
      }
    });
  }
  function _actualizarIndicadorPaginaVistaPrevia() {
    if (vpPaginaIndicador) vpPaginaIndicador.textContent = `Página ${_vistaPreviaTotalPaginas ? _vistaPreviaPaginaActual : 0} de ${_vistaPreviaTotalPaginas}`;
    if (btnVpPaginaAnterior) btnVpPaginaAnterior.disabled = _vistaPreviaPaginaActual <= 1;
    if (btnVpPaginaSiguiente) btnVpPaginaSiguiente.disabled = _vistaPreviaPaginaActual >= _vistaPreviaTotalPaginas;
  }
  function _irAPaginaVistaPrevia(n) {
    if (!_vistaPreviaTotalPaginas) return;
    _vistaPreviaPaginaActual = Math.min(_vistaPreviaTotalPaginas, Math.max(1, n));
    _actualizarIndicadorPaginaVistaPrevia();
    const destino = vistaPreviaResumen ? vistaPreviaResumen.querySelector(`.morb-vista-previa-pagina[data-pagina="${_vistaPreviaPaginaActual}"]`) : null;
    if (destino && typeof destino.scrollIntoView === "function") destino.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (btnVpPaginaAnterior) btnVpPaginaAnterior.addEventListener("click", () => _irAPaginaVistaPrevia(_vistaPreviaPaginaActual - 1));
  if (btnVpPaginaSiguiente) btnVpPaginaSiguiente.addEventListener("click", () => _irAPaginaVistaPrevia(_vistaPreviaPaginaActual + 1));

  function _mostrarVistaPrevia(seccionesElegidas, observaciones) {
    const plan = _construirPlanReportePDF(seccionesElegidas, observaciones);
    (plan.limpiezas || []).forEach((fn) => fn());
    _vistaPreviaTotalPaginas = plan.paginas.length;
    if (vistaPreviaResumen) vistaPreviaResumen.innerHTML = `<div id="morb-vp-paginas-wrap">${_renderPlanVistaPreviaHTML(plan)}</div>`;
    _vistaPreviaZoom = 1;
    _vistaPreviaPaginaActual = 1;
    _aplicarZoomVistaPrevia();
    _actualizarIndicadorPaginaVistaPrevia();
    if (modalPdf) {
      const modalBox = modalPdf.querySelector(".modal-box");
      if (modalBox) modalBox.classList.add("is-vista-previa-activa");
    }
  }
  function _mostrarPasoFormularioPdf() {
    if (formPdf) formPdf.hidden = false;
    if (vistaPreviaPdf) vistaPreviaPdf.hidden = true;
    if (errorVistaPreviaPdf) errorVistaPreviaPdf.classList.remove("is-visible");
    if (modalPdf) {
      const modalBox = modalPdf.querySelector(".modal-box");
      if (modalBox) modalBox.classList.remove("is-vista-previa-activa");
    }
  }

  if (btnAbrirPdf && modalPdf) {
    btnAbrirPdf.addEventListener("click", () => {
      if (errorPdf) errorPdf.classList.remove("is-visible");
      _mostrarPasoFormularioPdf();
      modalPdf.classList.add("is-open");
    });
    function closeModalPdf() {
      modalPdf.classList.remove("is-open");
      _mostrarPasoFormularioPdf();
    }
    document.getElementById("btn-morb-pdf-cancelar").addEventListener("click", closeModalPdf);
    modalPdf.addEventListener("click", (e) => { if (e.target === modalPdf) closeModalPdf(); });

    document.getElementById("btn-morb-pdf-todo").addEventListener("click", () => {
      _checksSeccionesPdf().forEach((chk) => { chk.checked = true; });
    });
    document.getElementById("btn-morb-pdf-limpiar").addEventListener("click", () => {
      _checksSeccionesPdf().forEach((chk) => { chk.checked = false; });
    });

    formPdf.addEventListener("submit", (e) => {
      e.preventDefault();
      const seccionesElegidas = _checksSeccionesPdf().filter((c) => c.checked).map((c) => c.value);
      const observaciones = document.getElementById("morb-pdf-observaciones").value;
      if (!seccionesElegidas.length) {
        if (errorPdf) { errorPdf.textContent = "Elige al menos una sección para incluir en el reporte."; errorPdf.classList.add("is-visible"); }
        return;
      }
      if (errorPdf) errorPdf.classList.remove("is-visible");
      _vistaPreviaDatos = { seccionesElegidas, observaciones };
      _mostrarVistaPrevia(seccionesElegidas, observaciones);
      if (errorVistaPreviaPdf) errorVistaPreviaPdf.classList.remove("is-visible");
      formPdf.hidden = true;
      if (vistaPreviaPdf) vistaPreviaPdf.hidden = false;
    });

    const btnVolverEditar = document.getElementById("btn-morb-pdf-volver-editar");
    if (btnVolverEditar) {
      btnVolverEditar.addEventListener("click", () => { _mostrarPasoFormularioPdf(); });
    }

    const btnGenerarFinal = document.getElementById("btn-morb-pdf-generar-final");
    if (btnGenerarFinal) {
      btnGenerarFinal.addEventListener("click", () => {
        if (!_vistaPreviaDatos) return;
        const { seccionesElegidas, observaciones } = _vistaPreviaDatos;
        const resultado = generarReportePDFMorbilidad(seccionesElegidas, observaciones);
        if (!resultado.ok) {
          if (errorVistaPreviaPdf) { errorVistaPreviaPdf.textContent = resultado.error; errorVistaPreviaPdf.classList.add("is-visible"); }
          return;
        }
        if (errorVistaPreviaPdf) errorVistaPreviaPdf.classList.remove("is-visible");
        window.SNSP_AUTH.logAction("exportar_pdf", `Módulo: Morbilidad — secciones: ${seccionesElegidas.join(", ")}`);
        _vistaPreviaDatos = null;
        closeModalPdf();
      });
    }
  }

  renderTableroH();
  renderTableroP();
}
