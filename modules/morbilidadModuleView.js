/**
 * modules/morbilidadModuleView.js
 * -----------------------------------------------------------------------
 * Vista del módulo de Morbilidad — ESTADO DE QUERÉTARO (2025-2026).
 * v2.5.0 (corrección de unificación) + recuperación de visualizaciones:
 * UN SOLO tablero, ya no "el módulo anterior + un panel independiente
 * abajo". Buscador por CIE-10/Epi-clave/padecimiento (opcional, acota
 * el tablero) + controles Analizar (Casos/Población/Tasa por 100,000
 * hab.) y Por (Padecimiento/Municipio/Jurisdicción/Grupo de edad) +
 * filtros (Municipio/Jurisdicción/Institución) + Año (comparar
 * 2025/2026), todo sobre UNA sola fuente: BASE_CASOS_2025_2026
 * relacionada con BASE_POBLACION_2025_2026 — exactamente la misma
 * lógica ya validada en Cargar datos (window.SNSP_CARGA_SERVICE.
 * agregarConPoblacion / agregarComparativoConPoblacion). Institución es
 * SÓLO filtro dentro de Analizar/Por, nunca "Por", a petición expresa.
 *
 * Por qué ya no se usa el cubo CIE-10 anterior (CUBOS_DE_MORBILIDAD,
 * morbilidad_2025.js / services/morbilidadDataService.js): ese cubo no
 * trae Grupo de edad ni Población, y su rango de años (2024-2025-2026)
 * no coincide con el de esta base (2025-2026). Tener dos fuentes de
 * datos distintas en el mismo tablero habría significado mostrar
 * números distintos para lo mismo, exactamente lo que se pidió evitar.
 * Ningún archivo de otro módulo se tocó ni se borró: morbilidad_2025.js
 * y morbilidadDataService.js siguen en el proyecto, sólo que esta
 * página ya no los referencia.
 *
 * "Panorama de Casos" (recuperación de visualizaciones, esta
 * actualización): además de la gráfica dinámica de Analizar/Por, se
 * reincorporan 8 paneles fijos que ya existían en la versión anterior
 * de Morbilidad — Casos por municipio, Casos por jurisdicción
 * sanitaria, Casos por institución, Casos por grupo de edad,
 * Padecimiento(s) dentro de la selección, Tendencia por año/mes,
 * comparativo por mes y año y Casos por sexo — TODOS sobre la misma
 * fuente única y respondiendo a los mismos filtros/buscador/Año que el
 * resto del tablero (se recalculan dentro de renderTablero(), nunca por
 * separado). Todos son EXCLUSIVAMENTE de Casos (nunca Población/Tasa),
 * igual que la versión anterior: la población de esta base sólo está
 * desagregada por Año+Municipio+Grupo de edad, así que no hay forma de
 * calcular Tasa por institución, por mes ni por sexo sin inventar un
 * denominador — esto aplica en particular a Casos por institución, que
 * el usuario pidió dejar explícitamente fuera de Tasa.
 *
 * Tendencia por año/mes y comparativo por mes y año usan un SEGUNDO
 * bundle, ligero, generado por el mismo script (morbilidad_temporal_
 * 2025_2026.js -> window.SNSP_MORBILIDAD_TEMPORAL_DATA): agrupado por
 * Año+Jurisdicción+Municipio+Institución+Mes+Sexo+Epi-Clave (sin Grupo
 * de edad, que esas gráficas no usan). Es la MISMA base BASE_CASOS_
 * 2025_2026, sólo agregada distinto para no inflar el bundle principal
 * (agrupar TODO junto -Mes+Sexo+Grupo de edad- habría dado ~133,000
 * filas en vez de 20,563; separando Grupo de edad quedó en 35,809). Si
 * ese bundle no está disponible, esas 3 gráficas se ocultan con un
 * aviso, en vez de romper el resto del tablero.
 * -----------------------------------------------------------------------
 */
function SNSP_renderMorbilidadModulePage(opts) {
  window.SNSP_AUTH.requireAuth("../index.html");

  SNSP_renderSidebar("sidebar", "morbilidad");
  // Limpieza de texto (ajuste de seguimiento a ACT09): se quitó "(prueba
  // funcional)" del subtítulo y la línea "Actualizado: Ver fecha de
  // archivo en Metodología" — esta base no trae una fecha de corte
  // registrada, así que en vez de inventar una o dejar un texto que se
  // remite a sí mismo, simplemente no se muestra esa línea. La fuente
  // completa (bases + periodo + total de padecimientos) sigue disponible
  // en el pie de página (#source-label) y en Metodología.
  SNSP_renderTopbar("topbar", {
    title: "Morbilidad en el estado de Querétaro",
    subtitle: "Módulo epidemiológico — datos estatales 2025-2026",
    rootPath: "../",
  });

  const datos = window.SNSP_MORBILIDAD_CASOS_DATA;
  const poblacionData = window.SNSP_MORBILIDAD_POBLACION_DATA;
  const svcCarga = window.SNSP_CARGA_SERVICE;

  if (!datos || !svcCarga) {
    document.querySelector(".app-content").innerHTML =
      '<div class="empty-state"><h3>Dato pendiente de carga</h3><p class="text-muted">No se encontró la base de Morbilidad (BASE_CASOS_2025_2026). Verifica que data/real/morbilidad_casos_2025_2026.js esté incluido.</p></div>';
    return;
  }

  const headers = datos.headers; // ["Año","Jurisdicción","Municipio","Institución","Grupo de edad","Epi-Clave","Padecimiento","Mes","Semana","Casos"] (Mes/Semana desde ACT14)
  const rows = datos.rows;
  const idxCol = {
    anio: headers.indexOf("Año"),
    jurisdiccion: headers.indexOf("Jurisdicción"),
    municipio: headers.indexOf("Municipio"),
    institucion: headers.indexOf("Institución"),
    grupo_edad: headers.indexOf("Grupo de edad"),
    epiclave: headers.indexOf("Epi-Clave"),
    padecimiento: headers.indexOf("Padecimiento"),
    mes: headers.indexOf("Mes"),
    semana: headers.indexOf("Semana"),
    casos: headers.indexOf("Casos"),
  };

  const joinCols = svcCarga.detectarColumnasClave(headers);
  const poblacionIndex = poblacionData
    ? svcCarga.indexarPoblacion(poblacionData.headers, poblacionData.rows)
    : { completo: false, mapa: new Map() };
  const poblacionDisponible = poblacionIndex.completo &&
    joinCols.colAnio !== -1 && joinCols.colMunicipio !== -1 && joinCols.colGrupoEdad !== -1;

  const catalogos = datos.catalogos || { anios: [], jurisdicciones: [], municipios: [], instituciones: [], gruposEdad: [], meses: [], semanas: [] };
  const catalogoPadecimientos = datos.catalogo_padecimientos || [];
  // ACT14: relación Mes<->Semana por Año, calculada directo de la base
  // cruda (nunca asumida) — ver build_morbilidad_casos.py. Alimenta la
  // "coherencia" entre los filtros de Mes y Semana (punto 2 de ACT14).
  const mesSemanaMeta = (datos.meta && datos.meta.mes_semana) || {};

  const dimColMap = { padecimiento: idxCol.padecimiento, municipio: idxCol.municipio, jurisdiccion: idxCol.jurisdiccion, grupo_edad: idxCol.grupo_edad };
  const dimLabelMap = { padecimiento: "padecimiento", municipio: "municipio", jurisdiccion: "jurisdicción sanitaria", grupo_edad: "grupo de edad" };

  // ---- Bundle secundario (Mes/Sexo) para el "Panorama de Casos" ----
  // Ver nota de cabecera: sólo alimenta Tendencia por año/mes,
  // comparativo por mes y año y Casos por sexo. Si no está disponible,
  // esos 3 paneles se ocultan con un aviso en vez de romper el resto.
  const datosTemporal = window.SNSP_MORBILIDAD_TEMPORAL_DATA || null;
  const idxColT = datosTemporal ? {
    anio: datosTemporal.headers.indexOf("Año"),
    jurisdiccion: datosTemporal.headers.indexOf("Jurisdicción"),
    municipio: datosTemporal.headers.indexOf("Municipio"),
    institucion: datosTemporal.headers.indexOf("Institución"),
    mes: datosTemporal.headers.indexOf("Mes"),
    semana: datosTemporal.headers.indexOf("Semana"),
    sexo: datosTemporal.headers.indexOf("Sexo"),
    epiclave: datosTemporal.headers.indexOf("Epi-Clave"),
    casos: datosTemporal.headers.indexOf("Casos"),
  } : null;
  const rowsT = datosTemporal ? datosTemporal.rows : [];
  const mesesCatalogo = datosTemporal && datosTemporal.meta ? (datosTemporal.meta.meses_disponibles || []) : [];

  // ACT15 (punto 1): `rows`/`rowsT` de arriba son SIEMPRE el bundle
  // completo, sin filtrar — `_filtrarPorMesSemana()` (definida más abajo)
  // reasigna estas 2 variables al inicio de cada renderTablero()/
  // renderPanoramaCasos(), y son las que consumen svcCarga.agregar*() en
  // vez de `rows`/`rowsT` directo, para que Mes/Semana (selección
  // múltiple) filtren igual que cualquier otro filtro sin tocar el
  // servicio compartido (ver comentario junto a _filtrarPorMesSemana).
  let rowsCasosFiltradas = rows;
  let rowsTFiltradas = rowsT;

  function _nombreMes(mes) {
    // "01 Enero" -> "Ene", útil para etiquetas cortas en el eje X.
    const m = /^\d{2}\s+(.+)$/.exec(mes || "");
    const nombre = m ? m[1] : (mes || "");
    return nombre.slice(0, 3);
  }

  // ---- Ajuste de etiquetas mensuales: Tendencia y Comparativo por mes y
  // año siempre tienen 12 categorías fijas, pero en comparativo dibujan 2
  // valores por mes muy juntos (2 barras, o 2 puntos de línea) — con el
  // formato completo ("81,046") las etiquetas numéricas se encimaban entre
  // sí. Formato compacto ("81.0k") para esos 2 paneles únicamente: el
  // valor real sigue siendo el mismo (se conserva en el dato y en el
  // tooltip al pasar el cursor), sólo cambia cómo se ve el texto impreso
  // sobre la barra/punto. ----
  function _morbFormatoCompacto(n) {
    // Defensivo: Chart.js (motor real, no el stub de las pruebas) puede
    // invocar este formatter con algo que no es número/null/undefined en
    // ciertos redibujados internos (p. ej. mientras una leyenda se anima)
    // — nunca debe lanzar (rompería el dibujo de la gráfica completa),
    // así que cualquier valor no convertible a número cae a "0" en vez de
    // propagar la excepción.
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
  // ACT14 (punto 5) + ACT15 (punto 3): etiquetas pequeñas (8px, se
  // conserva) y EN NEGRITA otra vez (se había quitado en ACT14; ACT15
  // pidió regresarla sin perder el tamaño chico). Para evitar el traslape
  // que la negrita por sí sola reintroduciría en Tendencia por año/mes
  // (línea), `pointLabelSplit` reparte las 2 series verticalmente en vez
  // de apilarlas del mismo lado: la serie más temprana (2025, dsIndex 0)
  // queda ARRIBA del punto y la más reciente (2026, dsIndex 1) queda
  // ABAJO — ver components/charts.js, opción retrocompatible que no
  // afecta a ningún otro módulo. En Comparativo por mes y año (barras) el
  // mismo tamaño/negrita aplica igual, sin necesitar arriba/abajo porque
  // las barras de cada año ya están una junto a otra, no una encima de la
  // otra. Aplica igual en el PDF: la imagen se captura del mismo canvas
  // ya dibujado.
  const MORB_OPTS_ETIQUETA_MENSUAL = { formatter: _morbFormatoCompacto, valueLabelFontSize: 8, pointLabelSplit: true };

  let seleccionPadecimiento = null; // {epiclave, padecimiento, cie10_texto, ...} | null
  let currentFilters = {}; // { municipio_morbilidad, jurisdiccion_morbilidad, institucion_morbilidad }
  let chart = null;

  // ---- Búsqueda por texto libre (idéntica lógica a la anterior: substring
  // case-insensitive y sin acentos contra nombre, epi-clave o CIE-10) ----
  function _norm(s) { return (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

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

  // ---- ACT14 (punto 2): Padecimiento, CIE-10 y Epi-clave separados en 3
  // buscadores sincronizados, en vez de un único campo combinado. Los 3
  // siguen usando el MISMO catálogo y la MISMA lógica de coincidencia ya
  // validada (buscarPadecimientos, sin cambios) — sólo se repite la
  // sección de resultados 3 veces, una por campo, y al elegir una
  // sugerencia en CUALQUIERA de los 3 se actualiza la MISMA selección
  // compartida (seleccionPadecimiento) y se reflejan los otros 2 campos
  // con su valor correspondiente, para que se vean "sincronizados". ----
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
    document.getElementById("seleccion-actual").innerHTML = etiqueta
      ? `Consultando: <strong>${etiqueta}</strong> <button type="button" class="btn btn-ghost btn-sm" id="btn-limpiar-seleccion">Quitar</button>`
      : "";
    const limpiarBtn = document.getElementById("btn-limpiar-seleccion");
    if (limpiarBtn) limpiarBtn.addEventListener("click", () => {
      seleccionPadecimiento = null;
      document.getElementById("seleccion-actual").innerHTML = "";
      BUSCADORES_PADECIMIENTO.forEach((b) => { const inp = document.getElementById(b.inputId); if (inp) inp.value = ""; });
      renderTablero();
    });
    // Sincroniza los 3 campos con la selección elegida (se ve de dónde
    // vino cada dato: el nombre en Padecimiento, el rango en CIE-10, el
    // código exacto en Epi-clave) — no dispara una nueva búsqueda, sólo
    // refleja el valor.
    const inpPad = document.getElementById("cie10-search");
    const inpCie10 = document.getElementById("cie10-search-cie10");
    const inpEpi = document.getElementById("cie10-search-epiclave");
    if (inpPad) inpPad.value = p ? p.padecimiento : "";
    if (inpCie10) inpCie10.value = p && p.cie10_texto ? p.cie10_texto : "";
    if (inpEpi) inpEpi.value = p ? p.epiclave : "";
    renderTablero();
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

  // ---- Año (comparar): mismo patrón de chips ya validado en Cargar datos.
  // Ajuste: SIN ningún año marcado, el alcance ya NO combina/suma 2025 y
  // 2026 en una sola serie — se trata como comparativo (2025 vs 2026),
  // exactamente igual que si el usuario hubiera marcado los 2 años a mano.
  // Un solo año marcado sigue mostrando sólo ese año. `_aniosEnAlcance` es
  // el único lugar que decide esto; renderTablero() y renderPanoramaCasos()
  // lo usan en vez de leer los checkboxes directamente, así que la regla
  // aplica igual a la gráfica principal, la tabla y los 8 paneles del
  // Panorama de Casos. ----
  function leerAniosSeleccionados() {
    return Array.from(document.querySelectorAll("#morb-anio-menu input:checked")).map((i) => i.value);
  }

  function _aniosEnAlcance() {
    const marcados = leerAniosSeleccionados();
    return marcados.length ? marcados.slice().sort() : (catalogos.anios || []).slice().sort();
  }

  // Texto uniforme para el estado comparativo (ACT09 — limpieza de texto):
  // SIEMPRE "Comparativo 2025 vs 2026", en vez de las variantes sueltas que
  // había antes ("... (barras agrupadas)", "Mismos 12 meses, ...", etc.).
  function _textoComparativo(anios) {
    return `Comparativo ${anios.join(" vs ")}`;
  }

  function inicializarFiltroAnio() {
    const menu = document.getElementById("morb-anio-menu");
    const chipsEl = document.getElementById("morb-anio-chips");
    const toggleBtn = document.getElementById("morb-anio-toggle");
    const cont = document.getElementById("morb-anio-multiselect");
    const valores = (catalogos.anios || []).slice().sort();
    menu.innerHTML = valores.map((v) => `
      <label class="carga-anio-opcion"><input type="checkbox" value="${v}"> ${v}</label>
    `).join("");

    function renderChips() {
      const seleccionados = Array.from(menu.querySelectorAll("input:checked")).map((i) => i.value);
      chipsEl.innerHTML = seleccionados.length
        ? seleccionados.map((v) => `<span class="carga-anio-chip" data-valor="${v}">${v} <button type="button" aria-label="Quitar ${v}">&times;</button></span>`).join("")
        : `<span class="text-muted" style="font-size:var(--fs-body-sm);">${_textoComparativo(valores)} (ningún año marcado)</span>`;
    }
    renderChips();

    // ACT14: Año entra en la relación Mes<->Semana (no es la misma entre
    // 2025 y 2026), así que un cambio de Año también repuebla esos 2
    // selects — si la función aún no existe (primera llamada, antes de que
    // el bloque de Mes/Semana más abajo la declare) se ignora en silencio,
    // gracias al "function" hoisting esto nunca pasa en la práctica.
    function _refrescarMesSemanaSiAplica() { if (typeof _poblarSelectsMesSemana === "function") _poblarSelectsMesSemana(); }

    menu.querySelectorAll("input[type=checkbox]").forEach((chk) => {
      chk.addEventListener("change", () => { renderChips(); _refrescarMesSemanaSiAplica(); renderTablero(); });
    });
    chipsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const valor = btn.closest(".carga-anio-chip").dataset.valor;
      const chk = Array.from(menu.querySelectorAll("input[type=checkbox]")).find((i) => i.value === valor);
      if (chk) { chk.checked = false; renderChips(); _refrescarMesSemanaSiAplica(); renderTablero(); }
    });
    toggleBtn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener("click", (e) => { if (!cont.contains(e.target)) menu.hidden = true; });
  }
  inicializarFiltroAnio();

  // ---- ACT14 (puntos 1 y 2) + ACT15 (punto 1): filtros de Mes y Semana
  // epidemiológica — ACT15 los cambió de selección única (<select>) a
  // selección MÚLTIPLE (mismo patrón visual de chips ya validado en Año:
  // #morb-mes-menu/#morb-semana-menu son <div> con checkboxes, no
  // <select>). Igual que Año, aplican de inmediato (no pasan por el botón
  // "Aplicar filtros" de Municipio/Jurisdicción/Institución) y se leen
  // sólo desde _mesesSeleccionados()/_semanasSeleccionadas() — nunca desde
  // `currentFilters` — así el "Limpiar" de ese otro filtro-bar nunca los
  // toca por accidente. Como svcCarga.agregar()/agregarComparativo()/etc.
  // (componente COMPARTIDO con CACU/Mama/Población/Dashboard, no se
  // modifica) sólo soportan un filtro de IGUALDAD por columna, la
  // selección múltiple de Mes/Semana YA NO se pasa como {colIdx,valor} en
  // filtrosActivos — en vez de eso, `_filtrarPorMesSemana()` (más abajo)
  // pre-filtra el arreglo de filas de Casos ANTES de agregarlo (mismo
  // resultado que un filtro "IN", sin tocar el servicio compartido); la
  // Población (anual, Año+Municipio+Grupo de edad) nunca pasa por este
  // pre-filtro, así que sigue sin duplicarse ni desagregarse por Mes/
  // Semana.
  function _mesesSeleccionados() {
    const menu = document.getElementById("morb-mes-menu");
    return menu ? Array.from(menu.querySelectorAll("input:checked")).map((i) => i.value) : [];
  }
  function _semanasSeleccionadas() {
    const menu = document.getElementById("morb-semana-menu");
    return menu ? Array.from(menu.querySelectorAll("input:checked")).map((i) => i.value) : [];
  }

  // Unión (a través de los años EN ALCANCE — mismo criterio que
  // _aniosEnAlcance) de las Semanas que ocurren dentro de `mes`, o los
  // Meses que toca `semana` — la relación Mes<->Semana NO es igual entre
  // 2025 y 2026 (el 1 de enero cae distinto), así que se calcula por año
  // y se une, nunca se asume una tabla fija.
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
  // ACT15: mismas 2 funciones de arriba, pero para un CONJUNTO de meses o
  // semanas seleccionadas (unión sobre todos los valores elegidos) — con
  // el conjunto vacío ("Todos"/"Todas"), no acota nada (catálogo completo).
  function _semanasCompatiblesConMeses(meses) {
    if (!meses.length) return (catalogos.semanas || []).slice();
    const set = new Set();
    meses.forEach((mes) => _semanasCompatiblesConMes(mes).forEach((s) => set.add(s)));
    return Array.from(set).sort();
  }
  function _mesesCompatiblesConSemanas(semanas) {
    if (!semanas.length) return (catalogos.meses || []).slice();
    const set = new Set();
    semanas.forEach((semana) => _mesesCompatiblesConSemana(semana).forEach((m) => set.add(m)));
    return Array.from(set).sort();
  }

  // ---- Multiselect de chips genérico (mismo patrón visual/markup que
  // Año — carga-anio-chip/menu/opcion — reescrito aquí para no duplicar
  // handlers cada vez que se repuebla el menú: `chipsEl.onclick` se
  // REEMPLAZA en cada llamada en vez de acumularse con addEventListener).
  // `seleccionados`: los valores YA VÁLIDOS que deben quedar marcados tras
  // repoblar (el llamador decide, ver _poblarSelectsMesSemana). ----
  // `etiquetaTodo`: texto a mostrar cuando TODAS las opciones disponibles
  // quedan marcadas (ACT16 punto 1) — "Todos" para Mes, "Todas" para
  // Semana; también rotula el botón "Seleccionar todos/todas" agregado al
  // principio del menú, que marca de un click sólo las opciones
  // actualmente disponibles (ya filtradas por compatibilidad con el otro
  // multiselect, ver _poblarSelectsMesSemana — nunca marca algo que no
  // esté en `opciones`).
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

  // Repuebla las opciones de AMBOS multiselects según la selección vigente
  // del otro (coherencia, ACT14 punto 2 / ACT15 punto 1): si hay Semanas
  // elegidas, Mes sólo ofrece los meses compatibles con esa UNIÓN de
  // semanas (y viceversa) — podando de la selección actual cualquier
  // valor que haya dejado de ser válido (p. ej. al cambiar Año, que
  // también entra en la relación Mes<->Semana), sin perder los que sí
  // lo siguen siendo.
  function _poblarSelectsMesSemana() {
    if (!document.getElementById("morb-mes-menu") || !document.getElementById("morb-semana-menu")) return;
    const mesesActuales = _mesesSeleccionados();
    const semanasActuales = _semanasSeleccionadas();
    const mesesDisponibles = _mesesCompatiblesConSemanas(semanasActuales);
    const semanasDisponibles = _semanasCompatiblesConMeses(mesesActuales);
    const mesesValidos = mesesActuales.filter((m) => mesesDisponibles.includes(m));
    const semanasValidas = semanasActuales.filter((s) => semanasDisponibles.includes(s));
    _renderMultiselectChips("morb-mes-menu", "morb-mes-chips", mesesDisponibles, (v) => v, mesesValidos, _onMesSemanaChange, "Todos");
    _renderMultiselectChips("morb-semana-menu", "morb-semana-chips", semanasDisponibles, (v) => "Semana " + v, semanasValidas, _onMesSemanaChange, "Todas");
  }
  function _onMesSemanaChange() { _poblarSelectsMesSemana(); renderTablero(); }

  if (document.getElementById("morb-mes-menu") && document.getElementById("morb-semana-menu")) {
    _initToggleMultiselect("morb-mes-toggle", "morb-mes-menu", "morb-mes-multiselect");
    _initToggleMultiselect("morb-semana-toggle", "morb-semana-menu", "morb-semana-multiselect");
    _poblarSelectsMesSemana();
  }

  // ---- Pre-filtro de filas por Mes/Semana (ACT15 punto 1) — sustituye al
  // filtro de igualdad {colIdx,valor} que usaba ACT14 (incompatible con
  // selección múltiple): devuelve un SUBARREGLO de `rowsBase` con las
  // filas cuyo Mes esté en los meses elegidos (si hay alguno elegido) Y
  // cuya Semana esté en las semanas elegidas (si hay alguna elegida) —
  // "Todos"/"Todas" (conjunto vacío) no filtra esa columna. `idxUsado` es
  // el mapa de índices de columna del bundle que corresponda (idxCol para
  // el bundle principal, idxColT para el temporal) — ambos traen Mes y
  // Semana desde ACT14. Nunca toca la Población (que no pasa por aquí). */
  function _filtrarPorMesSemana(rowsBase, idxUsado) {
    const meses = _mesesSeleccionados();
    const semanas = _semanasSeleccionadas();
    if (!meses.length && !semanas.length) return rowsBase;
    const mesesSet = meses.length ? new Set(meses) : null;
    const semanasSet = semanas.length ? new Set(semanas) : null;
    return rowsBase.filter((r) => {
      if (mesesSet && !mesesSet.has(String(r[idxUsado.mes]))) return false;
      if (semanasSet && !semanasSet.has(String(r[idxUsado.semana]))) return false;
      return true;
    });
  }

  // ---- Texto de periodo (ACT15 punto 2): sufijo legible con el Mes/
  // Semana elegido, para anteponerlo al periodo de años ya existente
  // ("Comparativo 2025 vs 2026 | Mayo", "... | Enero–Marzo",
  // "... | Semanas epidemiológicas 01–04"). Rango contiguo ("Ene–Mar")
  // cuando los valores elegidos son consecutivos; lista con comas si no
  // lo son; un solo valor no lleva guion. Vacío ("") si no hay Mes ni
  // Semana elegidos — el periodo se ve exactamente igual que antes de
  // ACT15 en ese caso. ----
  function _nombreMesLargo(mesCat) {
    const m = /^\d{2}\s+(.+)$/.exec(mesCat || "");
    return m ? m[1] : (mesCat || "");
  }
  function _esRangoContiguo(valoresOrdenados, numFn) {
    for (let i = 1; i < valoresOrdenados.length; i++) {
      if (numFn(valoresOrdenados[i]) !== numFn(valoresOrdenados[i - 1]) + 1) return false;
    }
    return true;
  }
  // ACT16 punto 1: si TODAS las opciones actualmente disponibles (ya
  // filtradas por compatibilidad con el otro multiselect) quedaron
  // marcadas, equivale — para este texto — a no tener ninguna marcada
  // ("Todos"/"Todas" en los chips, ver _renderMultiselectChips); evita que
  // el periodo se llene con "Ene–Dic" cuando en realidad no hay ninguna
  // restricción real.
  function _textoMesSemanaPeriodo() {
    const mesesSelRaw = _mesesSeleccionados();
    const semanasSelRaw = _semanasSeleccionadas();
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
  // Texto de periodo COMPLETO (años + Mes/Semana si aplica) — reemplaza,
  // en todos los lugares que antes escribían
  // `modoComparativo ? _textoComparativo(anios) : periodoTexto(anios)`
  // a mano, a esa misma expresión con el sufijo de Mes/Semana ya anexado.
  // Un solo punto de verdad: cambiar el formato del sufijo (arriba) se
  // refleja en gráficas, tablas, Panorama, vista previa y PDF a la vez.
  function _periodoCompletoTexto(aniosSeleccionados, modoComparativo) {
    const base = modoComparativo ? _textoComparativo(aniosSeleccionados) : periodoTexto(aniosSeleccionados);
    const sufijo = _textoMesSemanaPeriodo();
    return sufijo ? `${base} | ${sufijo}` : base;
  }
  // Misma idea que arriba, pero para el texto MINÚSCULO ("comparativo
  // 2025 vs 2026") que se inserta en medio de una oración dentro del
  // título automático de cada gráfica (SNSP_tituloGrafica, en
  // components/charts.js) — no se toca ese archivo compartido; sólo se
  // construye aquí el mismo texto de siempre (en minúsculas, "comparativo
  // ..." no "Comparativo ...") con el sufijo de Mes/Semana anexado.
  function _periodoTituloTexto(aniosSeleccionados, modoComparativo) {
    const base = modoComparativo ? `comparativo ${aniosSeleccionados.join(" vs ")}` : periodoTexto(aniosSeleccionados);
    const sufijo = _textoMesSemanaPeriodo();
    return sufijo ? `${base} | ${sufijo}` : base;
  }
  // Anexa el sufijo de Mes/Semana (si hay) a un texto descriptivo que no
  // es en sí mismo un periodo (p. ej. "Distribución dentro de la
  // selección vigente") — para que ese texto también deje ver el
  // Mes/Semana elegido sin reescribir la frase entera.
  function _conSufijoPeriodo(texto) {
    const sufijo = _textoMesSemanaPeriodo();
    return sufijo ? `${texto} — ${sufijo}` : texto;
  }
  // Meses a mostrar en las gráficas temporales (Tendencia por año/mes,
  // Comparativo por mes y año) — ACT15 punto 2: "no mostrar periodos
  // excluidos como Sin información". Con Mes(es) elegidos, sólo esos
  // meses (en el orden del catálogo); si sólo hay Semana(s) elegidas (sin
  // Mes), sólo los meses compatibles con esa unión de semanas; sin
  // ninguno de los dos, los 12 meses de siempre.
  function _temporalMesesEnAlcance() {
    const mesesSel = _mesesSeleccionados();
    if (mesesSel.length) return mesesCatalogo.filter((m) => mesesSel.includes(m));
    const semanasSel = _semanasSeleccionadas();
    if (semanasSel.length) {
      const compatibles = _mesesCompatiblesConSemanas(semanasSel);
      return mesesCatalogo.filter((m) => compatibles.includes(m));
    }
    return mesesCatalogo;
  }

  // ---- Filtros: Municipio / Jurisdicción / Institución (Institución NUNCA
  // es "Por", sólo filtro, a petición explícita) — reutiliza el componente
  // ya validado SNSP_renderFilterBar, con "Aplicar filtros"/"Limpiar". ----
  const filterDefs = {
    municipio_morbilidad: { label: "Municipio", options: () => catalogos.municipios },
    jurisdiccion_morbilidad: { label: "Jurisdicción sanitaria", options: () => catalogos.jurisdicciones },
    institucion_morbilidad: { label: "Institución", options: () => catalogos.instituciones },
  };
  Object.assign(SNSP_FILTER_DEFS, filterDefs);
  SNSP_renderFilterBar("filter-bar", Object.keys(filterDefs), (filters) => {
    currentFilters = filters;
    renderTablero();
    window.SNSP_AUTH.logAction("aplicar_filtros", `Módulo: Morbilidad — ${JSON.stringify(currentFilters)} — selección: ${seleccionPadecimiento ? seleccionPadecimiento.padecimiento : "(ninguna)"}`);
  });

  // ---- Analizar / Por ----
  const selMedida = document.getElementById("morb-select-medida");
  const selDim = document.getElementById("morb-select-dim");
  if (!poblacionDisponible) {
    Array.from(selMedida.options).forEach((opt) => { if (opt.value !== "casos") opt.disabled = true; });
    selMedida.value = "casos";
  }
  selMedida.addEventListener("change", renderTablero);
  selDim.addEventListener("change", renderTablero);

  // ---- ACT09: selector Top N del panel "Padecimiento(s) dentro de la
  // selección" (10/15/20/Todos, predeterminado Top 10) — sólo cambia
  // cuántas barras se dibujan en ESE panel, nunca ningún cálculo ni KPI.
  const selPadecimientosTopN = document.getElementById("morb-padecimientos-topn");
  if (selPadecimientosTopN) selPadecimientosTopN.addEventListener("change", renderTablero);

  // ---- ACT09 (ajuste de seguimiento): el mismo selector Top N, ahora
  // también en la gráfica dinámica principal ("Gráfica"/"Tabla resumen"),
  // porque con Por=Padecimiento puede llegar a 157 categorías y crecía
  // igual de desproporcionado que el panel del Panorama. Sólo recorta el
  // DIBUJO cuando Por=Padecimiento (Municipio/Jurisdicción/Grupo de edad
  // siguen mostrando siempre todas sus categorías reales, igual que en el
  // resto de Morbilidad): se deshabilita visualmente cuando no aplica.
  const selPrincipalTopN = document.getElementById("morb-principal-topn");
  if (selPrincipalTopN) selPrincipalTopN.addEventListener("change", renderTablero);

  function nombreMedida() {
    if (selMedida.value === "poblacion") return "Población";
    if (selMedida.value === "tasa") return "Tasa (por 100,000 hab.)";
    return "Casos";
  }

  function _filtrosActivos() {
    const list = [];
    if (currentFilters.municipio_morbilidad) list.push({ colIdx: idxCol.municipio, valor: currentFilters.municipio_morbilidad });
    if (currentFilters.jurisdiccion_morbilidad) list.push({ colIdx: idxCol.jurisdiccion, valor: currentFilters.jurisdiccion_morbilidad });
    if (currentFilters.institucion_morbilidad) list.push({ colIdx: idxCol.institucion, valor: currentFilters.institucion_morbilidad });
    // ACT15: Mes y Semana epidemiológica YA NO se agregan aquí (selección
    // múltiple, incompatible con el filtro de igualdad {colIdx,valor} de
    // svcCarga) — se aplican antes, pre-filtrando las filas (ver
    // _filtrarPorMesSemana / rowsCasosFiltradas).
    // Se filtra por Epi-Clave (no por el texto de Padecimiento): el
    // catálogo de búsqueda guarda el nombre YA SEPARADO del código CIE-10
    // (ver _extraer_cie10 en build_morbilidad_casos.py), mientras que las
    // filas de datos.rows traen el texto completo "Nombre(CIE10)" tal cual
    // la base. Epi-Clave es 1 a 1 con Padecimiento en esta base (verificado
    // antes de generar el bundle) y sí coincide exactamente con la columna
    // Epi-Clave de cada fila.
    if (seleccionPadecimiento) list.push({ colIdx: idxCol.epiclave, valor: seleccionPadecimiento.epiclave });
    return list;
  }

  function lugarTexto() {
    const f = currentFilters;
    if (f.municipio_morbilidad) return `el municipio de ${f.municipio_morbilidad}`;
    if (f.jurisdiccion_morbilidad) return `la Jurisdicción Sanitaria de ${f.jurisdiccion_morbilidad}`;
    if (f.institucion_morbilidad) return `la institución ${f.institucion_morbilidad}`;
    return "el estado de Querétaro";
  }

  function periodoTexto(aniosSeleccionados) {
    if (aniosSeleccionados.length === 1) return `${aniosSeleccionados[0]}`;
    const anios = (catalogos.anios || []).slice().sort();
    return anios.length > 1 ? `el periodo ${anios[0]}–${anios[anios.length - 1]}` : (anios[0] ? `${anios[0]}` : "el periodo disponible");
  }

  function _lineasEtiquetaMorb(categoria, wrapAt) {
    wrapAt = wrapAt || 26;
    if (typeof categoria !== "string" || categoria.length <= wrapAt) return 1;
    if (typeof SNSP_wrapLabel === "function") {
      const lineas = SNSP_wrapLabel(categoria, wrapAt);
      return Array.isArray(lineas) ? lineas.length : 1;
    }
    return Math.ceil(categoria.length / wrapAt);
  }

  // Totales globales (para la tarjeta KPI del valor analizado), usando
  // SIEMPRE Municipio como dimensión fija para obtener una partición
  // completa de las filas filtradas (todo renglón tiene Municipio) y
  // sumando sin duplicar población — reutiliza agregarConPoblacion tal
  // cual, no se inventa un cálculo alterno.
  function _calcularTotales(filtrosParaAgregar) {
    const resultados = svcCarga.agregarConPoblacion(rowsCasosFiltradas, idxCol.municipio, idxCol.casos, filtrosParaAgregar, joinCols, poblacionIndex.mapa);
    let totalCasos = 0, totalPoblacion = 0, hayPoblacion = false;
    resultados.forEach((r) => {
      totalCasos += r.valorCasos;
      if (r.poblacion !== null && r.poblacion !== undefined) { totalPoblacion += r.poblacion; hayPoblacion = true; }
    });
    const tasaGlobal = (hayPoblacion && totalPoblacion > 0) ? (totalCasos / totalPoblacion) * 100000 : null;
    return { totalCasos, totalPoblacion: hayPoblacion ? totalPoblacion : null, tasaGlobal };
  }

  // -----------------------------------------------------------------
  // "Panorama de Casos" — 8 paneles fijos, recuperados de la versión
  // anterior de Morbilidad. Todos son de Casos únicamente (nunca
  // Población/Tasa, ver nota de cabecera) y respetan los mismos
  // filtros/buscador/Año que la gráfica dinámica: se recalculan al
  // final de cada renderTablero(), recibiendo los mismos filtrosActivos
  // / aniosSeleccionados / modoComparativo ya calculados ahí (no se
  // vuelve a leer el DOM ni se inventa un cálculo alterno).
  // -----------------------------------------------------------------
  const panoramaCharts = {}; // canvasId -> instancia Chart, para destruir antes de re-dibujar

  function _destruirPanorama(canvasId) {
    if (panoramaCharts[canvasId]) { panoramaCharts[canvasId].destroy(); panoramaCharts[canvasId] = null; }
  }

  // -----------------------------------------------------------------
  // ACT09 — ajustes visuales: grosor y separación UNIFORMES de barra en
  // TODAS las gráficas de Morbilidad (la dinámica de Analizar/Por y los
  // 8 paneles del Panorama de Casos), y alto de cada gráfica calculado a
  // partir de esos mismos valores (para que no sobre espacio vacío ni se
  // amontonen las barras). Esto es puramente visual — controla cómo
  // Chart.js dibuja cada barra, nunca qué se calcula ni qué se filtra.
  // MORB_BAR_THICKNESS es el grosor (px) de cada barra, igual en modo
  // clásico (1 barra por categoría) y comparativo (2025/2026). En
  // comparativo, MORB_BAR_PCT_COMPARATIVO deja las barras de 2025/2026
  // pegadas entre sí dentro de su categoría, y MORB_CAT_PCT_COMPARATIVO
  // (más bajo) deja separación clara respecto a la categoría siguiente.
  // -----------------------------------------------------------------
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

  // Alto (px) que necesita UNA categoría para mostrar sus barras
  // (1 en modo clásico, 2 en comparativo 2025 vs 2026) con el grosor y
  // separación uniformes de arriba — mismo criterio que usa Chart.js
  // internamente para repartir maxBarThickness/barPercentage/
  // categoryPercentage, así el alto reservado coincide con lo que
  // realmente se dibuja.
  function _alturaCategoriaBarras(comparativo, nSeries) {
    const barPct = comparativo ? MORB_BAR_PCT_COMPARATIVO : MORB_BAR_PCT_CLASICO;
    const catPct = comparativo ? MORB_CAT_PCT_COMPARATIVO : MORB_CAT_PCT_CLASICO;
    const series = comparativo ? Math.max(nSeries || 2, 2) : 1;
    const gapEntreBarras = MORB_BAR_THICKNESS * (1 / barPct - 1);
    const altoBarras = series * MORB_BAR_THICKNESS + Math.max(0, series - 1) * gapEntreBarras;
    return altoBarras / catPct;
  }

  // Ajusta la altura del contenedor de una gráfica de barras horizontal
  // según el número de categorías y si va en modo comparativo (grupos de
  // barras por año) — usada tanto por la gráfica dinámica como por los
  // paneles del Panorama de Casos, para que todas midan su alto igual.
  function _ajustarAlturaBarra(wrapId, categorias, comparativo, nSeries) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const alturaPorSeries = _alturaCategoriaBarras(comparativo, nSeries);
    // Etiquetas largas envueltas a varias líneas necesitan más alto por
    // categoría para no encimarse con la vecina (misma lógica ya
    // validada, ahora combinada con el alto de barra fijo de arriba).
    const maxLineas = categorias.reduce((m, c) => Math.max(m, _lineasEtiquetaMorb(c, 26)), 1);
    const alturaPorEtiqueta = maxLineas * 16;
    const alturaPorCategoria = Math.max(alturaPorSeries, alturaPorEtiqueta);
    wrap.style.height = Math.max(260, categorias.length * alturaPorCategoria + 90) + "px";
  }

  function _filtrosActivosTemporal() {
    if (!idxColT) return [];
    const list = [];
    if (currentFilters.municipio_morbilidad) list.push({ colIdx: idxColT.municipio, valor: currentFilters.municipio_morbilidad });
    if (currentFilters.jurisdiccion_morbilidad) list.push({ colIdx: idxColT.jurisdiccion, valor: currentFilters.jurisdiccion_morbilidad });
    if (currentFilters.institucion_morbilidad) list.push({ colIdx: idxColT.institucion, valor: currentFilters.institucion_morbilidad });
    // ACT15: Mes y Semana del bundle temporal, mismo criterio que
    // _filtrosActivos() — se pre-filtran (rowsTFiltradas), no van aquí.
    if (seleccionPadecimiento) list.push({ colIdx: idxColT.epiclave, valor: seleccionPadecimiento.epiclave });
    return list;
  }

  // ---- Casos por municipio: SIEMPRE los 18 municipios, 0-rellenados
  // (nunca se ocultan los que no tienen casos en la selección vigente) ----
  // ACT16 (punto 5): cuenta cuántas de las categorías YA DIBUJADAS en una
  // instancia de Chart.js tienen algún valor > 0 en al menos una serie —
  // se lee directo de la gráfica ya renderizada (mismo criterio que
  // _tablaDesdeChartInstance: nunca un cálculo aparte), para que el aviso
  // "N de M con casos" sea EXACTAMENTE consistente con lo dibujado, tanto
  // en pantalla como en la Vista previa/PDF. Una categoría con 0 en TODOS
  // los periodos mostrados no cuenta como "con datos", aunque su barra en
  // 0 se conserve en la gráfica/tabla para poder comparar años.
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

  function renderChartMunicipio(filtrosActivos, aniosSeleccionados, modoComparativo) {
    _destruirPanorama("morb-chart-municipio");
    const municipiosTodos = (catalogos.municipios || []).slice();
    const tituloPartes = { indicador: "Casos", dimension: "municipio", padecimiento: _padecimientoTitulo(), lugar: lugarTexto(), periodo: _periodoTituloTexto(aniosSeleccionados, modoComparativo) };
    let categorias;
    if (modoComparativo) {
      const resultados = svcCarga.agregarComparativo(rowsCasosFiltradas, idxCol.municipio, idxCol.casos, filtrosActivos, idxCol.anio, aniosSeleccionados);
      const mapa = {};
      resultados.forEach((r) => { mapa[r.categoria] = r.valores; });
      categorias = municipiosTodos.slice().sort((a, b) => {
        const ta = aniosSeleccionados.reduce((s, y) => s + ((mapa[a] && mapa[a][y]) || 0), 0);
        const tb = aniosSeleccionados.reduce((s, y) => s + ((mapa[b] && mapa[b][y]) || 0), 0);
        return tb - ta;
      });
      const seriesPorAnio = aniosSeleccionados.map((y) => ({ label: y, data: categorias.map((c) => (mapa[c] && mapa[c][y]) || 0) }));
      _ajustarAlturaBarra("morb-wrap-municipio", categorias, modoComparativo, aniosSeleccionados.length);
      panoramaCharts["morb-chart-municipio"] = SNSP_renderGroupedBarChart("morb-chart-municipio", categorias, seriesPorAnio, "Casos", Object.assign({ horizontal: true, wrapAt: 26, tituloPartes }, _morbBarraOpts(modoComparativo)));
    } else {
      const filtrosConAnio = aniosSeleccionados.length === 1 ? filtrosActivos.concat([{ colIdx: idxCol.anio, valor: aniosSeleccionados[0] }]) : filtrosActivos;
      const resultados = svcCarga.agregar(rowsCasosFiltradas, idxCol.municipio, idxCol.casos, filtrosConAnio);
      const mapa = {};
      resultados.forEach((r) => { mapa[r.categoria] = r.valor; });
      categorias = municipiosTodos.slice().sort((a, b) => (mapa[b] || 0) - (mapa[a] || 0));
      _ajustarAlturaBarra("morb-wrap-municipio", categorias, modoComparativo, aniosSeleccionados.length);
      panoramaCharts["morb-chart-municipio"] = SNSP_renderBarChart("morb-chart-municipio", categorias, categorias.map((c) => mapa[c] || 0), "Casos", Object.assign({ horizontal: true, wrapAt: 26, tituloPartes }, _morbBarraOpts(modoComparativo)));
    }

    // ACT16 (punto 5): el KPI "Categorías encontradas" (cuando Por=Municipio)
    // sólo cuenta municipios con al menos un caso — este panel, en cambio,
    // SIEMPRE muestra los 18 (0-rellenados) para poder comparar años, como
    // ya se documentaba en el subtítulo estático. Ahora el subtítulo es
    // dinámico y deja explícito cuántos de los 18 sí tienen casos en el
    // periodo vigente, para que ambos números (13 y 18, por ejemplo) se
    // entiendan como cosas distintas y no como una inconsistencia.
    const subtMunicipio = document.getElementById("morb-subt-municipio");
    if (subtMunicipio) {
      const conteo = _contarCategoriasConDatos(panoramaCharts["morb-chart-municipio"]);
      subtMunicipio.textContent = (conteo && conteo.conDatos < conteo.total)
        ? `${conteo.conDatos} de ${conteo.total} municipios con casos en el periodo — se muestran los ${conteo.total} para poder comparar años (0 = sin casos registrados)`
        : `Los 18 municipios, incluidos los que no registran casos en la selección`;
    }
  }

  function _padecimientoTitulo() {
    return seleccionPadecimiento ? `${seleccionPadecimiento.cie10_texto ? seleccionPadecimiento.cie10_texto + " — " : ""}${seleccionPadecimiento.padecimiento}` : null;
  }

  // ---- Genérico: agrega por una dimensión del bundle PRINCIPAL (Casos
  // únicamente) y dibuja barra horizontal simple o agrupada por año.
  // opts.limitTop (opcional, ACT09): recorta a las N categorías de mayor
  // valor SÓLO para el dibujo — el total de categorías (antes de
  // recortar) se calcula con la MISMA llamada a agregar/agregarComparativo
  // (nunca un cálculo aparte) y se devuelve en el resultado, para que el
  // panel pueda avisar "Top N de M" sin tocar ningún KPI ni total. ----
  function _renderPanelPrincipal(canvasId, wrapId, dimIdx, nombreDim, filtrosActivos, aniosSeleccionados, modoComparativo, opts) {
    opts = opts || {};
    _destruirPanorama(canvasId);
    let categorias, valores, seriesPorAnio, totalCategorias;
    if (modoComparativo) {
      let resultados = svcCarga.agregarComparativo(rowsCasosFiltradas, dimIdx, idxCol.casos, filtrosActivos, idxCol.anio, aniosSeleccionados);
      totalCategorias = resultados.length;
      if (opts.limitTop) resultados = resultados.slice(0, opts.limitTop);
      categorias = resultados.map((r) => r.categoria);
      seriesPorAnio = aniosSeleccionados.map((y) => ({ label: y, data: resultados.map((r) => r.valores[y] || 0) }));
    } else {
      const filtrosConAnio = aniosSeleccionados.length === 1 ? filtrosActivos.concat([{ colIdx: idxCol.anio, valor: aniosSeleccionados[0] }]) : filtrosActivos;
      let resultados = svcCarga.agregar(rowsCasosFiltradas, dimIdx, idxCol.casos, filtrosConAnio);
      totalCategorias = resultados.length;
      if (opts.limitTop) resultados = resultados.slice(0, opts.limitTop);
      categorias = resultados.map((r) => r.categoria);
      valores = resultados.map((r) => r.valor);
    }
    _ajustarAlturaBarra(wrapId, categorias, modoComparativo, aniosSeleccionados.length);
    const tituloPartes = { indicador: "Casos", dimension: nombreDim, padecimiento: _padecimientoTitulo(), lugar: lugarTexto(), periodo: _periodoTituloTexto(aniosSeleccionados, modoComparativo) };
    const barraOpts = Object.assign({ horizontal: true, wrapAt: 26, tituloPartes }, _morbBarraOpts(modoComparativo));
    if (modoComparativo) {
      panoramaCharts[canvasId] = SNSP_renderGroupedBarChart(canvasId, categorias, seriesPorAnio, "Casos", barraOpts);
    } else {
      panoramaCharts[canvasId] = SNSP_renderBarChart(canvasId, categorias, valores, "Casos", barraOpts);
    }
    return { mostradas: categorias.length, total: totalCategorias };
  }

  // ---- Casos por jurisdicción sanitaria: dona en modo simple (año único
  // o sin año), barra agrupada horizontal cuando hay comparativo (una
  // dona no puede representar 2 años a la vez con claridad) ----
  function renderChartJurisdiccion(filtrosActivos, aniosSeleccionados, modoComparativo) {
    _destruirPanorama("morb-chart-jurisdiccion");
    const subt = document.getElementById("morb-subt-jurisdiccion");
    if (modoComparativo) {
      if (subt) subt.textContent = _periodoCompletoTexto(aniosSeleccionados, true);
      _renderPanelPrincipal("morb-chart-jurisdiccion", "morb-wrap-jurisdiccion", idxCol.jurisdiccion, "jurisdicción sanitaria", filtrosActivos, aniosSeleccionados, true);
    } else {
      if (subt) subt.textContent = _conSufijoPeriodo("Distribución porcentual dentro de la selección vigente");
      const filtrosConAnio = aniosSeleccionados.length === 1 ? filtrosActivos.concat([{ colIdx: idxCol.anio, valor: aniosSeleccionados[0] }]) : filtrosActivos;
      const resultados = svcCarga.agregar(rowsCasosFiltradas, idxCol.jurisdiccion, idxCol.casos, filtrosConAnio);
      document.getElementById("morb-wrap-jurisdiccion").style.height = "380px";
      const tituloPartes = { indicador: "Casos", dimension: "jurisdicción sanitaria", padecimiento: _padecimientoTitulo(), lugar: lugarTexto(), periodo: _periodoTituloTexto(aniosSeleccionados, false) };
      panoramaCharts["morb-chart-jurisdiccion"] = SNSP_renderDoughnut("morb-chart-jurisdiccion", resultados.map((r) => r.categoria), resultados.map((r) => r.valor), { tituloPartes });
    }
  }

  // ---- Casos por institución: SIEMPRE Casos, nunca Tasa (la población
  // de esta base no está desagregada por institución) — ignora a
  // propósito el selector global Analizar. ----
  function renderChartInstitucion(filtrosActivos, aniosSeleccionados, modoComparativo) {
    _renderPanelPrincipal("morb-chart-institucion", "morb-wrap-institucion", idxCol.institucion, "institución", filtrosActivos, aniosSeleccionados, modoComparativo);
  }

  // ---- Casos por grupo de edad ----
  function renderChartGrupoEdad(filtrosActivos, aniosSeleccionados, modoComparativo) {
    _renderPanelPrincipal("morb-chart-grupoedad", "morb-wrap-grupoedad", idxCol.grupo_edad, "grupo de edad", filtrosActivos, aniosSeleccionados, modoComparativo);
  }

  // ---- Padecimiento(s) dentro de la selección: principales
  // padecimientos dentro de los filtros/búsqueda vigentes. Es la gráfica
  // que más puede crecer (hasta 157 padecimientos sin selección), así
  // que ACT09 le agregó el selector Top 10/15/20/Todos (predeterminado
  // Top 10, ver #morb-padecimientos-topn en pages/morbilidad.html); si
  // hay una búsqueda activa normalmente se reduce a 1 sola categoría de
  // todos modos, sin importar el Top N elegido. El recorte es SÓLO de
  // dibujo: el total real de padecimientos en la selección (antes de
  // recortar) se sigue calculando con la misma agregación, nunca cambia
  // ningún KPI ni total. ----
  function _topNPadecimientos() {
    const sel = document.getElementById("morb-padecimientos-topn");
    if (!sel) return 10; // sin selector en el DOM: Top 10 por defecto, mismo valor que trae el <select>
    if (sel.value === "todos") return null; // null = sin recorte, mostrar todas las categorías
    const n = parseInt(sel.value, 10);
    return isNaN(n) ? 10 : n;
  }

  // ---- ACT09 (ajuste de seguimiento): mismo patrón que _topNPadecimientos,
  // para el selector "Mostrar" de la gráfica dinámica principal. ----
  function _topNPrincipal() {
    const sel = document.getElementById("morb-principal-topn");
    if (!sel) return 10;
    if (sel.value === "todos") return null;
    const n = parseInt(sel.value, 10);
    return isNaN(n) ? 10 : n;
  }

  function renderChartPadecimientos(filtrosActivos, aniosSeleccionados, modoComparativo) {
    const limitTop = _topNPadecimientos();
    const resultado = _renderPanelPrincipal("morb-chart-padecimientos", "morb-wrap-padecimientos", idxCol.padecimiento, "padecimiento", filtrosActivos, aniosSeleccionados, modoComparativo, { limitTop });
    const subt = document.getElementById("morb-subt-padecimientos");
    if (subt) {
      subt.textContent = (limitTop && resultado.total > limitTop)
        ? `Top ${limitTop} de ${resultado.total} padecimientos en la selección vigente`
        : `Todos los padecimientos en la selección vigente (${resultado.total})`;
    }
    return resultado;
  }

  // ---- Casos por sexo (bundle temporal) ----
  function renderChartSexo(filtrosActivosT, aniosSeleccionados, modoComparativo) {
    _destruirPanorama("morb-chart-sexo");
    const subt = document.getElementById("morb-subt-sexo");
    if (!datosTemporal) {
      if (subt) subt.textContent = "Dato pendiente de carga";
      document.getElementById("morb-wrap-sexo").innerHTML = '<p class="text-muted" style="padding:var(--sp-4);">No se encontró el bundle temporal (morbilidad_temporal_2025_2026.js).</p>';
      return;
    }
    if (subt) subt.textContent = modoComparativo ? _periodoCompletoTexto(aniosSeleccionados, true) : _conSufijoPeriodo("Distribución dentro de la selección vigente");
    const tituloPartes = { indicador: "Casos", dimension: "sexo", padecimiento: _padecimientoTitulo(), lugar: lugarTexto(), periodo: _periodoTituloTexto(aniosSeleccionados, modoComparativo) };
    if (modoComparativo) {
      const resultados = svcCarga.agregarComparativo(rowsTFiltradas, idxColT.sexo, idxColT.casos, filtrosActivosT, idxColT.anio, aniosSeleccionados);
      const categorias = resultados.map((r) => r.categoria);
      const series = aniosSeleccionados.map((y) => ({ label: y, data: resultados.map((r) => r.valores[y] || 0) }));
      _ajustarAlturaBarra("morb-wrap-sexo", categorias, modoComparativo, aniosSeleccionados.length);
      panoramaCharts["morb-chart-sexo"] = SNSP_renderGroupedBarChart("morb-chart-sexo", categorias, series, "Casos", Object.assign({ horizontal: true, wrapAt: 26, tituloPartes }, _morbBarraOpts(modoComparativo)));
    } else {
      const filtrosConAnio = aniosSeleccionados.length === 1 ? filtrosActivosT.concat([{ colIdx: idxColT.anio, valor: aniosSeleccionados[0] }]) : filtrosActivosT;
      const resultados = svcCarga.agregar(rowsTFiltradas, idxColT.sexo, idxColT.casos, filtrosConAnio);
      _ajustarAlturaBarra("morb-wrap-sexo", resultados.map((r) => r.categoria), modoComparativo, aniosSeleccionados.length);
      panoramaCharts["morb-chart-sexo"] = SNSP_renderBarChart("morb-chart-sexo", resultados.map((r) => r.categoria), resultados.map((r) => r.valor), "Casos", Object.assign({ horizontal: true, wrapAt: 26, tituloPartes }, _morbBarraOpts(modoComparativo)));
    }
  }

  // ---- Tendencia por año/mes (ajuste de seguimiento a ACT09): con 2+ años
  // en alcance ya NO se encadenan en una sola línea continua de 24 meses —
  // se dibuja UNA serie por año, las dos sobre el MISMO eje Ene-Dic, para
  // poder comparar la tendencia mes a mes entre años. Con un solo año en
  // alcance sigue siendo una sola serie de 12 meses (sin cambio de forma).
  // Un mes SIN ningún registro en la selección vigente (p. ej. un mes de
  // 2026 que todavía no se ha cargado) se deja como `null`, no como 0:
  // Chart.js interrumpe la línea en ese punto en vez de dibujar un valor
  // que podría confundirse con "0 casos" reales. ----
  function renderChartTendencia(filtrosActivosT, aniosSeleccionados) {
    _destruirPanorama("morb-chart-tendencia");
    const subt = document.getElementById("morb-subt-tendencia");
    if (!datosTemporal) {
      if (subt) subt.textContent = "Dato pendiente de carga";
      document.getElementById("morb-wrap-tendencia").innerHTML = '<p class="text-muted" style="padding:var(--sp-4);">No se encontró el bundle temporal (morbilidad_temporal_2025_2026.js).</p>';
      return;
    }
    const aniosEnAlcance = aniosSeleccionados.length ? aniosSeleccionados.slice().sort() : (catalogos.anios || []).slice().sort();
    const multiAnio = aniosEnAlcance.length > 1;
    if (subt) subt.textContent = multiAnio ? _periodoCompletoTexto(aniosEnAlcance, true) : _conSufijoPeriodo(`Evolución mensual ${aniosEnAlcance[0] || ""}`);

    // ACT15 (punto 2): sólo los meses EN ALCANCE (todos los del catálogo
    // si no hay Mes/Semana elegidos; si los hay, sólo esos — nunca se
    // dibujan como "Sin información" los meses que el usuario excluyó a
    // propósito, sólo los que sí entran pero no tienen datos reales).
    const mesesEnAlcance = _temporalMesesEnAlcance();

    function serieDeAnio(anio) {
      return mesesEnAlcance.map((mes) => {
        const filtros = filtrosActivosT.concat([{ colIdx: idxColT.anio, valor: anio }, { colIdx: idxColT.mes, valor: mes }]);
        const resultados = svcCarga.agregar(rowsTFiltradas, idxColT.mes, idxColT.casos, filtros);
        // Sin ningún registro para ese año+mes en la selección vigente:
        // "sin información", no "0 casos" — se deja el hueco en la línea.
        if (!resultados.length) return null;
        return resultados.reduce((s, r) => s + r.valor, 0);
      });
    }

    const etiquetas = mesesEnAlcance.map(_nombreMes);
    const series = aniosEnAlcance.map((anio) => ({ label: anio, data: serieDeAnio(anio) }));
    const tituloPartes = { indicador: "Casos", dimension: "mes", padecimiento: _padecimientoTitulo(), lugar: lugarTexto(), periodo: _periodoTituloTexto(aniosEnAlcance, multiAnio) };
    panoramaCharts["morb-chart-tendencia"] = SNSP_renderLineChart("morb-chart-tendencia", etiquetas, series, Object.assign({ tituloPartes }, MORB_OPTS_ETIQUETA_MENSUAL));
  }

  // ---- Comparativo por mes y año: 12 meses fijos (Ene-Dic). Ajuste de
  // seguimiento a ACT09: se dibujan dos barras por mes (2025 y 2026)
  // siempre que el alcance de años sea 2+ — esto incluye tanto cuando el
  // usuario marca explícitamente ambos años, COMO cuando no marca ninguno
  // (que antes sumaba ambos años en una sola barra, pudiendo leerse como
  // el total de los dos; ahora se agrupan igual que con selección
  // explícita, nunca se suman). Barra simple sólo cuando el alcance
  // termina siendo un único año. Un mes SIN ningún registro (p. ej. un mes
  // de 2026 aún no cargado) se deja como `null`, no como 0 — Chart.js no
  // dibuja esa barra en vez de mostrar un valor que podría confundirse con
  // "0 casos" reales. ----
  function renderChartMesAnio(filtrosActivosT, aniosSeleccionados) {
    _destruirPanorama("morb-chart-mesanio");
    const subt = document.getElementById("morb-subt-mesanio");
    if (!datosTemporal) {
      if (subt) subt.textContent = "Dato pendiente de carga";
      document.getElementById("morb-wrap-mesanio").innerHTML = '<p class="text-muted" style="padding:var(--sp-4);">No se encontró el bundle temporal (morbilidad_temporal_2025_2026.js).</p>';
      return;
    }
    const aniosEnAlcance = aniosSeleccionados.length ? aniosSeleccionados.slice().sort() : (catalogos.anios || []).slice().sort();
    const multiAnio = aniosEnAlcance.length > 1;
    if (subt) subt.textContent = multiAnio ? _periodoCompletoTexto(aniosEnAlcance, true) : _conSufijoPeriodo(`Estacionalidad ${aniosEnAlcance[0] || ""}`);
    // ACT15 (punto 2): mismo criterio que Tendencia — sólo los meses en
    // alcance según Mes/Semana elegidos, nunca los 12 fijos si se excluyó
    // alguno a propósito.
    const mesesEnAlcance = _temporalMesesEnAlcance();
    const etiquetas = mesesEnAlcance.map(_nombreMes);
    const tituloPartes = { indicador: "Casos", dimension: "mes", padecimiento: _padecimientoTitulo(), lugar: lugarTexto(), periodo: _periodoTituloTexto(aniosEnAlcance, multiAnio) };

    function valoresDeAnio(anio) {
      return mesesEnAlcance.map((mes) => {
        const filtros = filtrosActivosT.concat([{ colIdx: idxColT.anio, valor: anio }, { colIdx: idxColT.mes, valor: mes }]);
        const resultados = svcCarga.agregar(rowsTFiltradas, idxColT.mes, idxColT.casos, filtros);
        if (!resultados.length) return null; // sin información cargada ese mes: no se dibuja como 0
        return resultados.reduce((s, r) => s + r.valor, 0);
      });
    }

    // Gráfica vertical (meses en el eje X, siempre 12 fijos): el alto no
    // depende del número de categorías (no aplica _ajustarAlturaBarra,
    // pensada para barras horizontales), pero sí usa el mismo grosor y
    // separación uniformes que el resto de Morbilidad (ACT09).
    if (multiAnio) {
      const series = aniosEnAlcance.map((anio) => ({ label: anio, data: valoresDeAnio(anio) }));
      panoramaCharts["morb-chart-mesanio"] = SNSP_renderGroupedBarChart("morb-chart-mesanio", etiquetas, series, "Casos", Object.assign({ wrapAt: 26, tituloPartes }, _morbBarraOpts(true), MORB_OPTS_ETIQUETA_MENSUAL));
    } else {
      const valores = valoresDeAnio(aniosEnAlcance[0]);
      panoramaCharts["morb-chart-mesanio"] = SNSP_renderBarChart("morb-chart-mesanio", etiquetas, valores, "Casos", Object.assign({ wrapAt: 26, tituloPartes }, _morbBarraOpts(false), MORB_OPTS_ETIQUETA_MENSUAL));
    }
  }

  function renderPanoramaCasos() {
    const filtrosActivos = _filtrosActivos();
    const filtrosActivosT = _filtrosActivosTemporal();
    const aniosSeleccionados = _aniosEnAlcance();
    const modoComparativo = aniosSeleccionados.length >= 2;
    renderChartMunicipio(filtrosActivos, aniosSeleccionados, modoComparativo);
    renderChartJurisdiccion(filtrosActivos, aniosSeleccionados, modoComparativo);
    renderChartInstitucion(filtrosActivos, aniosSeleccionados, modoComparativo);
    renderChartGrupoEdad(filtrosActivos, aniosSeleccionados, modoComparativo);
    renderChartPadecimientos(filtrosActivos, aniosSeleccionados, modoComparativo);
    renderChartSexo(filtrosActivosT, aniosSeleccionados, modoComparativo);
    renderChartTendencia(filtrosActivosT, aniosSeleccionados);
    renderChartMesAnio(filtrosActivosT, aniosSeleccionados);
  }

  function renderTablero() {
    if (chart) { chart.destroy(); chart = null; }

    // ACT15 (punto 1): Mes/Semana ahora son de selección múltiple y se
    // aplican como pre-filtro sobre las filas (nunca sobre Población,
    // que sigue siendo anual) antes de cualquier svcCarga.agregar*().
    // Se recalculan aquí, al inicio de cada render, y quedan visibles
    // por cierre (closure) a renderPanoramaCasos() y a todas las
    // funciones internas que ya usan rowsCasosFiltradas/rowsTFiltradas.
    rowsCasosFiltradas = _filtrarPorMesSemana(rows, idxCol);
    rowsTFiltradas = idxColT ? _filtrarPorMesSemana(rowsT, idxColT) : rowsT;

    const filtrosActivos = _filtrosActivos();
    const aniosSeleccionados = _aniosEnAlcance();
    const modoComparativo = aniosSeleccionados.length >= 2;
    const dimKey = selDim.value;
    const dimIdx = dimColMap[dimKey];
    const nombreDim = dimLabelMap[dimKey];
    const medida = nombreMedida();
    const campo = selMedida.value === "poblacion" ? "poblacion" : (selMedida.value === "tasa" ? "tasa" : "valorCasos");

    // Filas consideradas (para el KPI de transparencia), respetando el
    // mismo alcance de año que se está mostrando.
    const filtrosParaTotales = aniosSeleccionados.length === 1
      ? filtrosActivos.concat([{ colIdx: idxCol.anio, valor: aniosSeleccionados[0] }])
      : filtrosActivos;
    const filasConsideradas = rowsCasosFiltradas.filter((r) => {
      if (!filtrosActivos.every((f) => String(r[f.colIdx] || "").trim() === f.valor)) return false;
      if (aniosSeleccionados.length === 1) return String(r[idxCol.anio] || "").trim() === aniosSeleccionados[0];
      return true;
    }).length;

    let agregado;
    if (modoComparativo) {
      const resultados = svcCarga.agregarComparativoConPoblacion(
        rowsCasosFiltradas, dimIdx, idxCol.casos, filtrosActivos, idxCol.anio, aniosSeleccionados, joinCols, poblacionIndex.mapa
      );
      agregado = resultados.map((r) => {
        const valores = {};
        aniosSeleccionados.forEach((y) => {
          const datoAnio = r.valores[y];
          let v = datoAnio ? datoAnio[campo] : null;
          if (v === null || v === undefined) v = 0;
          if (campo === "tasa") v = Math.round(v * 10) / 10;
          valores[y] = v;
        });
        return { categoria: r.categoria, valores };
      });
      agregado.sort((a, b) => {
        const totalA = aniosSeleccionados.reduce((s, y) => s + (a.valores[y] || 0), 0);
        const totalB = aniosSeleccionados.reduce((s, y) => s + (b.valores[y] || 0), 0);
        return totalB - totalA;
      });
    } else {
      const resultados = svcCarga.agregarConPoblacion(rowsCasosFiltradas, dimIdx, idxCol.casos, filtrosParaTotales, joinCols, poblacionIndex.mapa);
      agregado = resultados.map((r) => {
        let v = r[campo];
        if (v === null || v === undefined) v = 0;
        if (campo === "tasa") v = Math.round(v * 10) / 10;
        return { categoria: r.categoria, valor: v };
      });
      agregado.sort((a, b) => b.valor - a.valor);
    }

    // ---- ACT09 (ajuste de seguimiento): Top N de la gráfica/tabla
    // principal — SÓLO aplica cuando Por=Padecimiento (la única dimensión
    // que puede crecer hasta 157 categorías; Municipio/Jurisdicción/Grupo
    // de edad siguen mostrando siempre todas las suyas, igual que en el
    // resto de Morbilidad). El total de categorías se guarda ANTES de
    // recortar (mismo agregado ya calculado arriba, ningún cálculo nuevo)
    // para que el KPI "Categorías encontradas" y el aviso "Top N de M" no
    // dependan del recorte visual.
    const totalCategorias = agregado.length;
    const topNPrincipal = dimKey === "padecimiento" ? _topNPrincipal() : null;
    if (selPrincipalTopN) selPrincipalTopN.disabled = dimKey !== "padecimiento";
    if (topNPrincipal) agregado = agregado.slice(0, topNPrincipal);
    const subtPrincipal = document.getElementById("morb-subt-principal");
    if (subtPrincipal) {
      subtPrincipal.textContent = (topNPrincipal && totalCategorias > topNPrincipal)
        ? `Se actualiza automáticamente con Analizar, Por, Año y los filtros — Top ${topNPrincipal} de ${totalCategorias} categorías de ${nombreDim}`
        : "Se actualiza automáticamente con Analizar, Por, Año y los filtros";
    }

    // Mismo criterio de alto que los 8 paneles del Panorama de Casos
    // (ACT09: gráficas de Morbilidad uniformes) — el mínimo se deja algo
    // más alto (420) porque esta gráfica puede llegar a 157 categorías
    // con Por=Padecimiento sin selección.
    _ajustarAlturaBarra("morb-chart-wrap", agregado.map((r) => r.categoria), modoComparativo, aniosSeleccionados.length);
    const chartWrapMinimo = document.getElementById("morb-chart-wrap");
    if (chartWrapMinimo && parseFloat(chartWrapMinimo.style.height) < 420) chartWrapMinimo.style.height = "420px";

    const tituloPartes = {
      indicador: medida,
      dimension: nombreDim,
      padecimiento: seleccionPadecimiento ? `${seleccionPadecimiento.cie10_texto ? seleccionPadecimiento.cie10_texto + " — " : ""}${seleccionPadecimiento.padecimiento}` : null,
      lugar: lugarTexto(),
      periodo: _periodoTituloTexto(aniosSeleccionados, modoComparativo),
    };

    if (modoComparativo) {
      chart = SNSP_renderGroupedBarChart(
        "morb-chart",
        agregado.map((r) => r.categoria),
        aniosSeleccionados.map((y) => ({ label: y, data: agregado.map((r) => r.valores[y] || 0) })),
        medida,
        Object.assign({ horizontal: true, wrapAt: 34, tituloPartes }, _morbBarraOpts(modoComparativo))
      );
    } else {
      chart = SNSP_renderBarChart(
        "morb-chart",
        agregado.map((r) => r.categoria),
        agregado.map((r) => r.valor),
        medida,
        Object.assign({ horizontal: true, wrapAt: 34, tituloPartes }, _morbBarraOpts(modoComparativo))
      );
    }
    if (chart) {
      if (!chart.options.scales) chart.options.scales = {};
      if (!chart.options.scales.y) chart.options.scales.y = {};
      chart.options.scales.y.ticks = Object.assign({}, chart.options.scales.y.ticks, { autoSkip: false });
      chart.options.animation = false;
      chart.update();
    }

    // ---- Tabla ----
    if (modoComparativo) {
      const hayDiferencia = aniosSeleccionados.length === 2;
      document.getElementById("morb-tabla-head").innerHTML =
        `<tr><th>#</th><th>Categoría</th>` +
        aniosSeleccionados.map((y) => `<th>${medida} ${y}</th>`).join("") +
        (hayDiferencia ? `<th>Diferencia</th><th>Variación %</th>` : "") +
        `</tr>`;
      document.getElementById("morb-tabla-body").innerHTML = agregado.map((r, i) => {
        const vals = aniosSeleccionados.map((y) => r.valores[y] || 0);
        let extra = "";
        if (hayDiferencia) {
          const diff = vals[1] - vals[0];
          const variacion = vals[0] > 0 ? (diff / vals[0]) * 100 : null;
          const color = diff > 0 ? "var(--accent-positive)" : (diff < 0 ? "var(--accent-alert)" : "inherit");
          const signo = diff > 0 ? "+" : "";
          extra = `<td style="color:${color};">${signo}${diff.toLocaleString("es-MX")}</td>` +
            `<td style="color:${color};">${variacion === null ? "—" : (variacion > 0 ? "+" : "") + variacion.toFixed(1) + "%"}</td>`;
        }
        return `<tr>
          <td><span class="rank-badge ${i < 3 ? "top" : ""}">${i + 1}</span></td>
          <td class="col-text">${r.categoria}</td>
          ${vals.map((v) => `<td>${v.toLocaleString("es-MX")}</td>`).join("")}
          ${extra}
        </tr>`;
      }).join("");
      document.getElementById("morb-tabla-count").textContent =
        `${agregado.length.toLocaleString("es-MX")} categorías de ${nombreDim}` +
        (topNPrincipal && totalCategorias > topNPrincipal ? ` (Top ${topNPrincipal} de ${totalCategorias})` : "") +
        ` — ${_periodoCompletoTexto(aniosSeleccionados, true)}`;
    } else {
      document.getElementById("morb-tabla-head").innerHTML = `<tr><th>#</th><th>Categoría</th><th>${medida}</th></tr>`;
      document.getElementById("morb-tabla-body").innerHTML = agregado.map((r, i) => `
        <tr>
          <td><span class="rank-badge ${i < 3 ? "top" : ""}">${i + 1}</span></td>
          <td class="col-text">${r.categoria}</td>
          <td>${campo === "tasa"
            ? r.valor.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
            : Math.round(r.valor).toLocaleString("es-MX")}</td>
        </tr>
      `).join("");
      document.getElementById("morb-tabla-count").textContent =
        `${agregado.length.toLocaleString("es-MX")} categorías de ${nombreDim}` +
        (topNPrincipal && totalCategorias > topNPrincipal ? ` (Top ${topNPrincipal} de ${totalCategorias})` : "");
    }

    // ---- KPI ----
    const totales = _calcularTotales(filtrosParaTotales);
    let kpiValor, kpiLabel, kpiFootnote;
    if (selMedida.value === "poblacion") {
      kpiLabel = "Población relacionada";
      kpiValor = totales.totalPoblacion !== null ? Math.round(totales.totalPoblacion).toLocaleString("es-MX") : null;
      kpiFootnote = totales.totalPoblacion !== null ? "Suma sin duplicar, por Año+Municipio+Grupo de edad" : "Sin población relacionada para esta selección";
    } else if (selMedida.value === "tasa") {
      kpiLabel = "Tasa global (por 100,000 hab.)";
      kpiValor = totales.tasaGlobal !== null ? totales.tasaGlobal.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;
      kpiFootnote = totales.tasaGlobal !== null
        ? `${totales.totalCasos.toLocaleString("es-MX")} casos / ${Math.round(totales.totalPoblacion).toLocaleString("es-MX")} hab.`
        : "Sin población relacionada para esta selección";
    } else {
      kpiLabel = "Casos totales";
      kpiValor = totales.totalCasos.toLocaleString("es-MX");
      kpiFootnote = seleccionPadecimiento ? seleccionPadecimiento.padecimiento : lugarTexto();
    }

    document.getElementById("kpi-grid").innerHTML = [
      { label: "Combinaciones en la base", value: rows.length.toLocaleString("es-MX"), accent: "var(--c-vino)", footnote: `${datos.meta.filas_originales.toLocaleString("es-MX")} filas originales agregadas` },
      { label: "Filas consideradas", value: filasConsideradas.toLocaleString("es-MX"), accent: "var(--c-dorado)", footnote: filtrosActivos.length ? "Con los filtros/selección aplicados" : "Sin filtros aplicados" },
      { label: "Categorías encontradas", value: totalCategorias.toLocaleString("es-MX"), accent: "var(--c-verde-claro)", footnote: (topNPrincipal && totalCategorias > topNPrincipal) ? `${nombreDim} — mostrando Top ${topNPrincipal}` : nombreDim },
      { label: kpiLabel, value: kpiValor, accent: "var(--c-rojo-claro)", footnote: kpiFootnote },
    ].map(SNSP_indicatorCardHTML).join("");

    // ---- Panorama de Casos: 8 paneles fijos, misma selección vigente ----
    renderPanoramaCasos();
  }

  document.getElementById("source-label").textContent =
    `BASE_CASOS_2025_2026 + BASE_POBLACION_2025_2026, estado de Querétaro (${(catalogos.anios || []).join("-")}) — ${catalogoPadecimientos.length} padecimientos`;
  document.getElementById("version-tag-module").textContent = window.SNSP_CONFIG.platform.version;

  // ===================================================================
  // Punto 3 del ajuste de seguimiento a ACT09 — "Generar reporte PDF":
  // documento de TEXTO Y TABLAS (nunca una captura de pantalla de las
  // gráficas) armado en el navegador con jsPDF + jsPDF-AutoTable, mismo
  // criterio de orientación adaptable ya validado en Cargar datos (ACT06
  // — vertical primero, horizontal sólo si no cabe, nunca se reduce la
  // letra), adaptado aquí sin la parte de captura de canvas. Sólo se
  // generan las secciones que la usuaria elige en el modal, y SIEMPRE
  // con los filtros, la búsqueda y el/los Año(s) vigentes en el tablero:
  // ninguna sección se recalcula aparte — el KPI y la tabla principal se
  // leen del DOM ya renderizado (mismo Top N, mismos valores que se ven
  // en pantalla) y cada panel del Panorama de Casos se lee directo de su
  // instancia de Chart.js ya dibujada (mismas categorías/series que el
  // usuario está viendo, comparativo 2025 vs 2026 incluido).
  // ===================================================================
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

  // Igual que _decidirOrientacionPDF en modules/cargaModuleView.js (ACT06):
  // primero intenta vertical; sólo si la tabla no cabe sin comprimirse,
  // cambia a horizontal. Si ni así alcanza, reparte proporcionalmente el
  // ancho disponible entre columnas (autoTable ajusta con salto de línea,
  // nunca con letra más chica).
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

  // ---- Lee una tabla {head, rows} directamente de una instancia de
  // Chart.js YA DIBUJADA (barra simple, barra agrupada, línea o dona) —
  // el mismo dato que la usuaria ve en pantalla, nunca un cálculo aparte.
  // Con 2 series (comparativo 2025 vs 2026) agrega Diferencia/Variación %,
  // igual que la tabla principal. Un valor `null` (mes sin información
  // cargada, ver Tendencia/Comparativo por mes y año) se imprime como
  // "Sin información", nunca como "0", para no confundir ambos casos. ----
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

  // ---- Captura una instancia de Chart.js YA DIBUJADA como imagen (fondo
  // blanco pintado aparte, porque JPEG no soporta transparencia), escalada
  // al ancho disponible con un TOPE de alto — mismo criterio ya validado en
  // Cargar datos (ACT06). Nunca lanza: si el canvas no puede exportarse
  // (p. ej. entorno sin soporte de canvas.toDataURL, como las pruebas
  // jsdom), la sección sigue con su tabla, sin la imagen. ----
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

  // ---- Indicadores y tabla principal: se leen directo del DOM ya
  // renderizado (WYSIWYG con lo que la usuaria ve, Top N ya aplicado),
  // en vez de recalcular nada aparte. ----
  function _morbPdfTablaKPI() {
    const tarjetas = Array.from(document.querySelectorAll("#kpi-grid .indicator-card"));
    const head = ["Indicador", "Valor", "Detalle"];
    const rows = tarjetas.map((card) => {
      const label = (card.querySelector(".indicator-card__label") || {}).textContent || "";
      const valor = (card.querySelector(".indicator-card__value") || {}).textContent || "";
      const foot = (card.querySelector(".indicator-card__footnote") || {}).textContent || "";
      return [label.trim(), valor.trim(), foot.trim()];
    });
    return { head, rows };
  }

  function _morbPdfTablaPrincipal() {
    const headCells = Array.from(document.querySelectorAll("#morb-tabla-head th")).map((th) => th.textContent.trim());
    const rows = Array.from(document.querySelectorAll("#morb-tabla-body tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim())
    );
    return { head: headCells, rows };
  }

  function _morbPdfFiltrosTexto() {
    const partes = [];
    if (currentFilters.municipio_morbilidad) partes.push(`Municipio = "${currentFilters.municipio_morbilidad}"`);
    if (currentFilters.jurisdiccion_morbilidad) partes.push(`Jurisdicción sanitaria = "${currentFilters.jurisdiccion_morbilidad}"`);
    if (currentFilters.institucion_morbilidad) partes.push(`Institución = "${currentFilters.institucion_morbilidad}"`);
    // ACT15: selección múltiple — se listan todos los valores elegidos,
    // no sólo uno.
    const mesesSel = _mesesSeleccionados();
    const semanasSel = _semanasSeleccionadas();
    if (mesesSel.length) partes.push(`Mes = "${mesesSel.map(_nombreMesLargo).join(", ")}"`);
    if (semanasSel.length) partes.push(`Semana epidemiológica = "${semanasSel.join(", ")}"`);
    if (seleccionPadecimiento) {
      const etq = `${seleccionPadecimiento.cie10_texto ? seleccionPadecimiento.cie10_texto + " — " : ""}${seleccionPadecimiento.padecimiento}`;
      partes.push(`Padecimiento = "${etq}"`);
    }
    return partes.length ? partes.join("; ") : "Ninguno";
  }

  // Catálogo de secciones seleccionables en el modal — "kpi" y "principal"
  // se resuelven aparte (DOM), el resto lee su instancia de Chart.js ya
  // dibujada del Panorama de Casos (panoramaCharts, ver arriba).
  const MORB_PDF_SECCIONES = [
    { valor: "kpi", titulo: "Indicadores" },
    { valor: "principal", titulo: "Gráfica y tabla principal (Analizar/Por)" },
    { valor: "municipio", titulo: "Casos por municipio", categoriaLabel: "Municipio" },
    { valor: "jurisdiccion", titulo: "Casos por jurisdicción sanitaria", categoriaLabel: "Jurisdicción sanitaria" },
    { valor: "institucion", titulo: "Casos por institución", categoriaLabel: "Institución" },
    { valor: "grupoedad", titulo: "Casos por grupo de edad", categoriaLabel: "Grupo de edad" },
    { valor: "sexo", titulo: "Casos por sexo", categoriaLabel: "Sexo" },
    { valor: "padecimientos", titulo: "Padecimiento(s) dentro de la selección", categoriaLabel: "Padecimiento" },
    { valor: "tendencia", titulo: "Tendencia por año/mes", categoriaLabel: "Mes" },
    { valor: "mesanio", titulo: "Comparativo por mes y año", categoriaLabel: "Mes" },
  ];
  const MORB_PDF_CANVAS_ID = {
    municipio: "morb-chart-municipio",
    jurisdiccion: "morb-chart-jurisdiccion",
    institucion: "morb-chart-institucion",
    grupoedad: "morb-chart-grupoedad",
    sexo: "morb-chart-sexo",
    padecimientos: "morb-chart-padecimientos",
    tendencia: "morb-chart-tendencia",
    mesanio: "morb-chart-mesanio",
  };

  // ---- Arma cada sección elegida como {titulo, tabla:{head,rows}, chartInst}
  // — nunca se recalcula nada: KPI/tabla principal del DOM ya renderizado,
  // cada panel del Panorama (y la gráfica principal) de su instancia de
  // Chart.js ya dibujada. ÚNICA fuente de estas secciones — la usan tanto
  // el PDF real como la vista previa visual (ACT15 punto 4), para que
  // ambos muestren EXACTAMENTE el mismo contenido, nunca uno recalculado
  // aparte del otro. ----
  function _construirSeccionesPdfDatos(seccionesElegidas) {
    const seccionesDatos = [];
    seccionesElegidas.forEach((clave) => {
      if (clave === "kpi") {
        seccionesDatos.push({ clave, titulo: "Indicadores", tabla: _morbPdfTablaKPI(), chartInst: null });
      } else if (clave === "principal") {
        seccionesDatos.push({ clave, titulo: "Gráfica y tabla principal", tabla: _morbPdfTablaPrincipal(), chartInst: chart });
      } else {
        const def = MORB_PDF_SECCIONES.find((s) => s.valor === clave);
        const canvasId = MORB_PDF_CANVAS_ID[clave];
        const inst = canvasId ? panoramaCharts[canvasId] : null;
        const tabla = _tablaDesdeChartInstance(inst, def ? def.categoriaLabel : "Categoría");
        // ACT16 (punto 5): misma nota que el subtítulo dinámico de la
        // sección Municipio en pantalla, para que el PDF/Vista previa no
        // parezcan reportar "18 categorías encontradas" cuando en
        // realidad son 18 municipios mostrados (0-rellenados para poder
        // comparar años) y sólo una parte tiene casos de verdad.
        let nota = null;
        if (clave === "municipio") {
          const conteo = _contarCategoriasConDatos(inst);
          if (conteo && conteo.conDatos < conteo.total) {
            nota = `${conteo.conDatos} de ${conteo.total} municipios con casos en el periodo — se muestran los ${conteo.total} para poder comparar años (0 = sin casos registrados)`;
          }
        }
        if (def) seccionesDatos.push({ clave, titulo: def.titulo, tabla, chartInst: inst, nota });
      }
    });
    return seccionesDatos;
  }

  // ---- ACT16: plan ÚNICO de páginas del reporte — se construye UNA sola
  // vez y lo consumen tanto el PDF real (jsPDF, vía _dibujarPlanEnJsPDF)
  // como la Vista previa (HTML, vía _renderPlanVistaPreviaHTML), para que
  // ambos muestren EXACTAMENTE la misma distribución (ACT15 punto 4,
  // reforzado en ACT16). Devuelve { paginas: [ { orientation, elementos } ] }.
  // Tipos de elemento: "encabezado", "observaciones",
  // "seccion" (título + gráfica + tabla juntos, cuando caben legibles),
  // "seccion-imagen" (gráfica GRANDE sola, cuando no caben juntos — ACT16
  // punto 4) y "seccion-tabla" (la tabla de esa misma sección, en la
  // página siguiente, con "(continuación)" en el título).
  function _construirPlanReportePDF(seccionesElegidas, observaciones) {
    const margenX = 40;
    const aniosSeleccionados = _aniosEnAlcance();
    const modoComparativo = aniosSeleccionados.length >= 2;
    const periodoPdf = _periodoCompletoTexto(aniosSeleccionados, modoComparativo);
    const fechaGeneracion = new Date().toLocaleString("es-MX");
    const fuenteTexto = document.getElementById("source-label").textContent || "";
    const seccionesDatos = _construirSeccionesPdfDatos(seccionesElegidas);

    // ACT14 (punto 6): la orientación se decide POR SECCIÓN, no una sola
    // vez para todo el documento — el documento SIEMPRE empieza vertical y
    // cada sección pasa a su propia página horizontal sólo si de verdad lo
    // necesita, sin comprimirse; cuando la siguiente sección vuelve a
    // caber en vertical, el documento regresa a vertical.
    const paginas = [];
    let orientationActual = "portrait";
    let pageWidth = 612, pageHeight = 792;
    let y = 44;
    let pagina = { orientation: orientationActual, elementos: [] };
    function cerrarPagina() {
      if (pagina.elementos.length) paginas.push(pagina);
    }
    function nuevaPagina(orient) {
      cerrarPagina();
      orientationActual = orient;
      pageWidth = orient === "landscape" ? 792 : 612;
      pageHeight = orient === "landscape" ? 612 : 792;
      y = 44;
      pagina = { orientation: orientationActual, elementos: [] };
    }

    // Encabezado + periodo/filtros + Análisis-Observaciones: siempre en la
    // página 1.
    pagina.elementos.push({
      tipo: "encabezado",
      titulo: "SNSP Inteligencia Digital — Morbilidad en el estado de Querétaro",
      periodo: periodoPdf,
      filtros: _morbPdfFiltrosTexto(),
      analizarPor: `${nombreMedida()} / ${dimLabelMap[selDim.value] || selDim.value}`,
      fecha: fechaGeneracion,
      fuente: `${fuenteTexto} — sin fecha de corte registrada en el sistema`,
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

    // Las secciones elegidas fluyen una tras otra en las MISMAS páginas (no
    // una página nueva por sección, para no dejar páginas casi vacías); se
    // salta de página cuando una sección no cabe en lo que resta de la
    // vigente, o cuando necesita otra orientación.
    seccionesDatos.forEach((sec) => {
      const hayTabla = sec.tabla && sec.tabla.rows.length;
      const orientNecesaria = hayTabla ? _morbPdfOrientacion(sec.tabla.head, sec.tabla.rows).orientation : "portrait";
      if (orientNecesaria !== orientationActual) nuevaPagina(orientNecesaria);

      const anchoDisponible = pageWidth - margenX * 2;
      const altoUtilPagina = pageHeight - margenX * 2;
      const altoNota = sec.nota ? ALTO_NOTA : 0;
      const altoTablaEstim = hayTabla ? 20 + (sec.tabla.rows.length + 1) * ALTO_FILA_ESTIM + 10 : 24;

      // ACT16 (punto 4): antes la imagen SIEMPRE se topaba a 38% del alto
      // de página, sin importar cuánta tabla hubiera debajo — hacía que
      // Municipio (18 categorías) se viera chico incluso con una tabla
      // corta al lado. Ahora se intenta primero un tope más generoso
      // (62%), dejando espacio para la tabla; si aun así título + gráfica
      // + tabla no caben juntos en una página limpia, la gráfica se dibuja
      // GRANDE (hasta 90% de la página) SOLA, y la tabla pasa a su propia
      // página siguiente — "gráfica grande en una página y tabla en la
      // siguiente" cuando no caben juntos legibles, tal como se pidió.
      const topeImagenJuntos = Math.round(altoUtilPagina * 0.62);
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
        const topeImagenGrande = Math.round(altoUtilPagina * 0.90);
        const imagenGrande = _capturarImagenGrafica(sec.chartInst, anchoDisponible, topeImagenGrande) || imagenJuntos;
        pagina.elementos.push({ tipo: "seccion-imagen", titulo: sec.titulo, nota: sec.nota, imagen: imagenGrande });
        nuevaPagina(orientationActual);
        pagina.elementos.push({ tipo: "seccion-tabla", titulo: `${sec.titulo} (continuación)`, tabla: sec.tabla });
        y += altoTablaEstim;
      }
    });

    cerrarPagina();
    return { paginas };
  }

  // ---- Dibuja el plan de páginas con jsPDF (el PDF real). Nunca decide
  // paginación/orientación/tamaño de imagen por su cuenta — todo eso ya
  // viene resuelto en `plan` por _construirPlanReportePDF, la ÚNICA fuente
  // compartida con la Vista previa. ----
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
          doc.setFontSize(15);
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

  // ---- Genera el PDF con las secciones elegidas. Devuelve {ok:true} o
  // {ok:false, error} — nunca lanza, para que quien llama pueda mostrar
  // el error dentro del modal (mismo patrón que modal-box__error). ----
  function generarReportePDFMorbilidad(seccionesElegidas, observaciones) {
    if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
      return { ok: false, error: "No se pudo cargar el generador de PDF. Verifica tu conexión e intenta de nuevo." };
    }
    if (!seccionesElegidas || !seccionesElegidas.length) {
      return { ok: false, error: "Elige al menos una sección para incluir en el reporte." };
    }
    const margenX = 40;
    const plan = _construirPlanReportePDF(seccionesElegidas, observaciones);
    const doc = _dibujarPlanEnJsPDF(plan);

    // ---- Numeración de páginas: se agrega al final, ya con el total de
    // páginas real (incluidas las que jsPDF-AutoTable haya abierto de más
    // por una tabla que no cupo entera). Con páginas mezclando
    // vertical/horizontal, el ancho/alto de CADA página no es uniforme —
    // se lee el tamaño real de la página vigente (doc.internal.pageSize)
    // en vez de asumir uno fijo. ----
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

  // ---- Modal "Generar reporte PDF": mismo patrón de apertura/cierre ya
  // validado en pages/admin-usuarios.html (modal-overlay/modal-box,
  // is-open, click en el fondo cierra). ----
  const modalPdf = document.getElementById("modal-morb-pdf");
  const btnAbrirPdf = document.getElementById("btn-morb-abrir-pdf");
  const formPdf = document.getElementById("form-morb-pdf");
  const errorPdf = document.getElementById("morb-pdf-error");
  const vistaPreviaPdf = document.getElementById("morb-pdf-vista-previa");
  const vistaPreviaResumen = document.getElementById("morb-pdf-vista-previa-resumen");
  const errorVistaPreviaPdf = document.getElementById("morb-pdf-vista-previa-error");
  // ACT16 puntos 2 y 3: controles de zoom/ajustar-a-ancho y de paginación
  // (Anterior | Página X de Y | Siguiente) de la Vista previa — todos
  // opcionales (`if (el)` en cada uso) para no romper el arnés de pruebas
  // jsdom, que usa un DOM mínimo sin esta barra de herramientas.
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

  // ACT14 (punto 7): guarda lo elegido al pasar a Vista previa, para que
  // "Generar PDF" (paso final) use EXACTAMENTE lo que se mostró en el
  // resumen — nunca vuelve a leer el formulario en ese momento.
  let _vistaPreviaDatos = null;
  let _vistaPreviaZoom = 1; // ACT16 (punto 2)
  let _vistaPreviaPaginaActual = 1; // ACT16 (punto 3)
  let _vistaPreviaTotalPaginas = 0; // ACT16 (punto 3)
  const ZOOM_VP_MIN = 0.4, ZOOM_VP_MAX = 2.5, ZOOM_VP_PASO = 0.1;

  const _escHtml = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  // ---- Dibuja el plan de páginas como tarjetas con proporción de hoja
  // carta (vertical u horizontal según corresponda), cada una con su
  // propio encabezado "Página N — vertical/horizontal" para que el salto
  // de página y el cambio de orientación sean evidentes de un vistazo, sin
  // necesitar abrir el PDF. El tamaño real en pantalla lo controla el zoom
  // (ACT16 punto 2, ver _aplicarZoomVistaPrevia) — aquí sólo se fija el
  // ancho "100%" de referencia. ----
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
        if (b.tipo === "observaciones") {
          return `
            <div style="margin-bottom:10px;">
              <div style="font-weight:700; font-size:10px; margin-bottom:3px;">Análisis / Observaciones</div>
              <div style="font-size:9px; white-space:pre-wrap;">${_escHtml(b.texto)}</div>
            </div>`;
        }
        // seccion / seccion-imagen / seccion-tabla: título (+ nota) +
        // gráfica real (si aplica) + tabla real (si aplica)
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

  // ---- ACT16 punto 2: zoom de la Vista previa — escala TODO el conjunto
  // de páginas con un solo transform (un único factor, no por página) para
  // que "Ajustar a ancho" sea un cálculo simple y todas las páginas
  // conserven la misma proporción entre sí. ----
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

  // ---- ACT16 punto 3: navegación "Anterior | Página X de Y | Siguiente"
  // — hace scroll dentro del lienzo (#morb-pdf-vista-previa-resumen) hasta
  // la página pedida; los botones fijos (fuera del área con scroll, ver
  // CSS .morb-vp-acciones) siguen siempre visibles mientras se navega. ----
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

  // ---- Arma y muestra la Vista previa (paso 2) a partir de las secciones
  // elegidas — un solo punto de entrada usado por el submit del formulario,
  // para que el zoom/paginación siempre arranquen en un estado limpio
  // (100%, página 1) cada vez que se genera una vista previa nueva. ----
  function _mostrarVistaPrevia(seccionesElegidas, observaciones) {
    const plan = _construirPlanReportePDF(seccionesElegidas, observaciones);
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

    // Paso 1 → 2: el submit del formulario ya NO genera el PDF — valida y
    // arma la Vista previa. El PDF real sólo se genera al confirmar en el
    // paso 2 (botón "Generar PDF" de la vista previa).
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
      btnVolverEditar.addEventListener("click", () => {
        _mostrarPasoFormularioPdf();
      });
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

  renderTablero();
}
