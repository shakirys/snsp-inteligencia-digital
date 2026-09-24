/**
 * modules/cargaModuleView.js
 * -----------------------------------------------------------------------
 * PROTOTIPO — Carga de archivos desde la interfaz (v2.5.0-prototipo)
 * -----------------------------------------------------------------------
 * Permite subir un CSV/XLSX, previsualizarlo, mapear columnas libremente
 * (el usuario decide qué es "dimensión" y qué es "medida", sin un patrón
 * fijo) y ver el resultado alimentar un KPI, una gráfica y un filtro
 * reales — usando los mismos componentes (charts.js) que el resto de la
 * plataforma.
 *
 * ES UN PROTOTIPO LOCAL: todo vive en memoria de la pestaña; no hay
 * `window.SNSP_*_DATA`, no se persiste nada, no sustituye ni modifica
 * ningún módulo real (CACU, Mama, Morbilidad, Población). Sirve para
 * validar el flujo de carga antes de decidir si se conecta a un backend
 * real (ver README → "Próximos pasos técnicos").
 *
 * v2.6.0-prototipo: el mapeo de columnas ahora tiene 4 papeles
 * (Ignorar / Dimensión / Medida / Filtro) en vez de 3. Dimensión, Medida
 * y Filtro son independientes entre sí y ya NO dependen del orden en que
 * se marcaron las columnas: si se marca más de una Dimensión o más de una
 * Medida, aparece un selector explícito para elegir cuál usa la gráfica;
 * cada columna marcada como Filtro obtiene su propio selector con
 * "Todos", y todos los filtros activos se combinan con AND (aplican a la
 * vez a la gráfica, la tabla, los KPI y el PDF).
 *
 * v2.7.0-prototipo: si la columna marcada como Filtro es de tipo AÑO
 * (`columnasInfo[].esAnio`, ver cargaDataService.js), se dibuja como un
 * selector MÚLTIPLE de chips en vez del `<select>` sencillo. Con 2+ años
 * elegidos, la gráfica y la tabla entran en "modo comparativo": barras
 * agrupadas (una por año, vía SNSP_renderGroupedBarChart — ya existente
 * en charts.js, sin tocar ese archivo) y una tabla con una columna de
 * "[Medida] [año]" por cada año más Diferencia/Variación % (sólo cuando
 * son exactamente 2 años). Con 0 o 1 año elegido, todo funciona
 * exactamente igual que en v2.6.0. Funciona con cualquier Dimensión.
 *
 * v2.8.0-prototipo: dos mejoras puntuales sobre v2.7.0.
 * (a) Cualquier Filtro con más de `UMBRAL_FILTRO_BUSCABLE` (20) valores
 *     únicos (p. ej. Padecimiento, Unidad médica) ahora se dibuja con un
 *     buscador de texto (coincidencia parcial, sin distinguir acentos —
 *     "alacran" encuentra "alacrán") en vez del `<select>` sencillo con
 *     todas las opciones visibles; el `<select>` real sigue existiendo
 *     (oculto) para no duplicar la lógica ya probada de lectura de
 *     filtros ni de exportar a PDF. Reutilizable: aplica automáticamente
 *     a cualquier columna que lo necesite, no sólo a Padecimiento.
 * (b) Si la columna "Padecimiento" existe y tiene un valor elegido en su
 *     filtro, el título corto de la gráfica lo antepone automáticamente
 *     (p. ej. "Intoxicación por picadura de alacrán — Casos por Grupo de
 *     edad — Comparativo 2025 vs 2026"); si no hay Padecimiento elegido,
 *     el título corto funciona exactamente igual que en v2.7.0. El mismo
 *     texto se agrega también como línea en el PDF exportado.
 * -----------------------------------------------------------------------
 */
function SNSP_renderCargaModulePage(opts) {
  opts = opts || {};
  window.SNSP_AUTH.requireAuth("../index.html");

  SNSP_renderSidebar("sidebar", "carga");
  SNSP_renderTopbar("topbar", {
    title: "Cargar datos (prototipo)",
    subtitle: "Herramientas — sube un archivo y previsualiza cómo alimentaría indicadores, gráficas y filtros",
    updated: "No aplica — prototipo local",
    rootPath: "../",
  });

  const puedeCargar = window.SNSP_AUTH.can("cargar_informacion");
  if (!puedeCargar) {
    document.getElementById("carga-sin-permiso").style.display = "block";
    document.getElementById("carga-paso-subir").style.display = "none";
    return;
  }

  const svc = window.SNSP_CARGA_SERVICE;
  let estado = {
    headers: [], rows: [], nombreArchivo: "",
    mapeo: {}, columnasInfo: [],
    dimCandidatos: [], medidaCandidatos: [], filtroCandidatos: [],
    dimIdx: null, medidaIdx: null,
    colAnioFiltro: null, // índice de la columna Filtro detectada como Año (o null si no hay)
    // ACT06 — Parte 2: relacionar con un archivo de Población opcional.
    poblacion: null, // { headers, rows, nombreArchivo } del archivo de población ya cargado, o null
    poblacionIndex: null, // svc.indexarPoblacion(...) del archivo de población
    joinColsCasos: null, // svc.detectarColumnasClave(...) sobre ESTE archivo (Año/Municipio/Grupo de edad)
    poblacionDisponible: false, // true sólo si las 3 columnas de relación se detectaron en AMBOS archivos
    medidaAnalisis: "casos", // "casos" | "poblacion" | "tasa" — qué se grafica/tabula
  };
  let chart = null;

  function _cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // v2.8.0-prototipo: un filtro con más de este número de valores únicos
  // usa el buscador de texto (ver renderBloqueFiltroBuscable) en vez del
  // <select> sencillo — aplica automáticamente a cualquier columna marcada
  // como Filtro que lo necesite (Padecimiento, Unidad médica, etc.), no es
  // un caso especial de una sola columna.
  const UMBRAL_FILTRO_BUSCABLE = 20;

  // Quita acentos/diacríticos y pasa a minúsculas, para que la búsqueda de
  // texto de un filtro encuentre "alacrán" al escribir "alacran" (y al
  // revés). Reutilizado por cualquier filtro buscable.
  function _normalizarBusqueda(s) {
    return String(s === undefined || s === null ? "" : s)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  // Índice de la columna "Padecimiento" (por nombre, sin distinguir
  // mayúsculas/acentos exactos) si existe en el archivo cargado, o -1 si no.
  function _colPadecimiento() {
    return estado.headers.findIndex((h) => (h || "").trim().toLowerCase() === "padecimiento");
  }

  // Valor de Padecimiento actualmente elegido en su filtro (no "Todos"), o
  // null si esa columna no existe, no se marcó como Filtro, o está en
  // "Todos". filtrosActivos: mismo arreglo que produce leerFiltrosActivos().
  function _valorPadecimientoActivo(filtrosActivos) {
    const idx = _colPadecimiento();
    if (idx === -1) return null;
    const f = (filtrosActivos || []).find((flt) => flt.colIdx === idx);
    return f ? f.valor : null;
  }

  // Arma y muestra/oculta el título corto de la gráfica (el mismo mecanismo
  // ya usado para el modo de 1 año y el comparativo): antepone el
  // Padecimiento elegido, si lo hay ("<Padecimiento> — <Medida> por
  // <Dimensión> — ..."), y agrega el sufijo de año que corresponda (uno
  // solo, "Comparativo X vs Y", o ninguno). Si no hay Padecimiento elegido
  // ni año elegido, el título corto se oculta — comportamiento idéntico al
  // que ya existía. Devuelve el texto final (o null si no se muestra) para
  // que exportarPDF pueda reutilizar exactamente el mismo texto que se ve
  // en pantalla.
  function _fijarTituloCorto(el, sufijoAnio, nombreMedida, nombreDim, padecimiento) {
    const base = `${_cap(nombreMedida)} por ${nombreDim}` + (sufijoAnio ? ` — ${sufijoAnio}` : "");
    const texto = padecimiento ? `${padecimiento} — ${base}` : base;
    const debeMostrarse = !!(sufijoAnio || padecimiento);
    if (el) {
      if (debeMostrarse) { el.textContent = texto; el.style.display = ""; }
      else { el.textContent = ""; el.style.display = "none"; }
    }
    return debeMostrarse ? texto : null;
  }

  function mostrarPaso(paso) {
    ["subir", "mapeo", "resultado"].forEach((p) => {
      document.getElementById("carga-paso-" + p).style.display = p === paso ? "" : "none";
    });
  }

  // ---- Paso 1: recepción del archivo ----
  function textoDesdeArchivo(file) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result);
      lector.onerror = () => reject(lector.error);
      lector.readAsText(file, "UTF-8");
    });
  }

  function arrayBufferDesdeArchivo(file) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result);
      lector.onerror = () => reject(lector.error);
      lector.readAsArrayBuffer(file);
    });
  }

  async function procesarArchivo(file) {
    const errEl = document.getElementById("carga-error");
    errEl.style.display = "none";
    const esXlsx = /\.xlsx?$/i.test(file.name);
    try {
      let headers, rows;
      if (esXlsx) {
        if (typeof window.XLSX === "undefined") {
          throw new Error("No se pudo cargar el lector de Excel (XLSX). Verifica tu conexión o usa un CSV.");
        }
        const buffer = await arrayBufferDesdeArchivo(file);
        const wb = window.XLSX.read(buffer, { type: "array" });
        const hoja = wb.Sheets[wb.SheetNames[0]];
        const matriz = window.XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: "" });
        headers = (matriz[0] || []).map((h) => String(h || "").trim());
        rows = matriz.slice(1).filter((r) => r.some((v) => String(v || "").trim() !== ""));
      } else {
        const texto = await textoDesdeArchivo(file);
        const parsed = svc.parseCSV(texto);
        headers = parsed.headers;
        rows = parsed.rows;
      }
      if (!headers.length || !rows.length) {
        throw new Error("El archivo no tiene columnas o filas reconocibles. Verifica que la primera fila tenga los encabezados.");
      }
      estado = {
        headers, rows, nombreArchivo: file.name,
        mapeo: {}, columnasInfo: [],
        dimCandidatos: [], medidaCandidatos: [], filtroCandidatos: [],
        dimIdx: null, medidaIdx: null,
        colAnioFiltro: null,
        // Un archivo principal NUEVO invalida la relación con la población
        // ya cargada (las columnas de relación pueden ya no coincidir) —
        // se limpia y, si la persona quiere, puede volver a subir la base
        // de población para este archivo desde el paso de resultado.
        poblacion: null, poblacionIndex: null, joinColsCasos: null,
        poblacionDisponible: false, medidaAnalisis: "casos",
      };
      const estadoPoblacionEl = document.getElementById("carga-poblacion-estado");
      if (estadoPoblacionEl) estadoPoblacionEl.textContent = "";
      if (inputPoblacion) inputPoblacion.value = "";
      renderPasoMapeo();
      mostrarPaso("mapeo");
    } catch (e) {
      errEl.textContent = "No se pudo leer el archivo: " + e.message;
      errEl.style.display = "block";
    }
  }

  const inputArchivo = document.getElementById("carga-input-archivo");
  const dropzone = document.getElementById("carga-dropzone");
  inputArchivo.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) procesarArchivo(e.target.files[0]);
  });
  ["dragover", "dragenter"].forEach((ev) => dropzone.addEventListener(ev, (e) => {
    e.preventDefault(); dropzone.classList.add("is-dragover");
  }));
  ["dragleave", "dragend", "drop"].forEach((ev) => dropzone.addEventListener(ev, (e) => {
    e.preventDefault(); dropzone.classList.remove("is-dragover");
  }));
  dropzone.addEventListener("drop", (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) procesarArchivo(e.dataTransfer.files[0]);
  });
  dropzone.addEventListener("click", () => inputArchivo.click());

  // ---- ACT06 — Parte 2: archivo de Población (opcional) ----
  // Se relaciona con el archivo principal ya cargado por Año + Municipio +
  // Grupo de edad (detectadas por NOMBRE de columna en ambos archivos, sin
  // exigir un orden fijo). No pasa por el mapeo de roles (Dimensión/
  // Medida/Filtro/Ignorar): sólo aporta un valor de población por cada
  // combinación de esas 3 columnas para poder calcular Población y Tasa.
  const inputPoblacion = document.getElementById("carga-input-poblacion");
  const selMedidaAnalisis = document.getElementById("carga-select-medida-analisis");

  function renderMedidaAnalisisSelector() {
    const grid = document.getElementById("carga-medida-analisis-grid");
    if (grid) grid.style.display = estado.poblacionDisponible ? "" : "none";
    if (selMedidaAnalisis && selMedidaAnalisis.value !== estado.medidaAnalisis) {
      selMedidaAnalisis.value = estado.medidaAnalisis;
    }
  }

  async function procesarArchivoPoblacion(file) {
    const estadoEl = document.getElementById("carga-poblacion-estado");
    const esXlsx = /\.xlsx?$/i.test(file.name);
    try {
      let headers, rows;
      if (esXlsx) {
        if (typeof window.XLSX === "undefined") {
          throw new Error("No se pudo cargar el lector de Excel (XLSX). Verifica tu conexión o usa un CSV.");
        }
        const buffer = await arrayBufferDesdeArchivo(file);
        const wb = window.XLSX.read(buffer, { type: "array" });
        const hoja = wb.Sheets[wb.SheetNames[0]];
        const matriz = window.XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: "" });
        headers = (matriz[0] || []).map((h) => String(h || "").trim());
        rows = matriz.slice(1).filter((r) => r.some((v) => String(v || "").trim() !== ""));
      } else {
        const texto = await textoDesdeArchivo(file);
        const parsed = svc.parseCSV(texto);
        headers = parsed.headers;
        rows = parsed.rows;
      }
      if (!headers.length || !rows.length) {
        throw new Error("El archivo no tiene columnas o filas reconocibles.");
      }

      const poblacionIndex = svc.indexarPoblacion(headers, rows);
      const joinColsCasos = svc.detectarColumnasClave(estado.headers);
      const listoParaUsar = poblacionIndex.completo &&
        joinColsCasos.colAnio !== -1 && joinColsCasos.colMunicipio !== -1 && joinColsCasos.colGrupoEdad !== -1;

      estado.poblacion = { headers, rows, nombreArchivo: file.name };
      estado.poblacionIndex = poblacionIndex;
      estado.joinColsCasos = joinColsCasos;
      estado.poblacionDisponible = listoParaUsar;
      estado.medidaAnalisis = "casos";

      if (listoParaUsar) {
        estadoEl.textContent = `${file.name} — ${rows.length.toLocaleString("es-MX")} filas listas para relacionar por Año, Municipio y Grupo de edad.`;
      } else {
        const faltaEnArchivo = [];
        if (joinColsCasos.colAnio === -1) faltaEnArchivo.push("Año");
        if (joinColsCasos.colMunicipio === -1) faltaEnArchivo.push("Municipio");
        if (joinColsCasos.colGrupoEdad === -1) faltaEnArchivo.push("Grupo de edad");
        const faltaEnPoblacion = [];
        if (poblacionIndex.columnas.colAnio === -1) faltaEnPoblacion.push("Año");
        if (poblacionIndex.columnas.colMunicipio === -1) faltaEnPoblacion.push("Municipio");
        if (poblacionIndex.columnas.colGrupoEdad === -1) faltaEnPoblacion.push("Grupo de edad");
        if (poblacionIndex.columnas.colPoblacion === -1) faltaEnPoblacion.push("Población");
        const partes = [];
        if (faltaEnArchivo.length) partes.push(`faltan columnas ${faltaEnArchivo.join(", ")} en tu archivo principal`);
        if (faltaEnPoblacion.length) partes.push(`faltan columnas ${faltaEnPoblacion.join(", ")} en "${file.name}"`);
        estadoEl.textContent = `No se pudo relacionar: ${partes.join("; ")}.`;
      }
      renderMedidaAnalisisSelector();
      if (estado.dimIdx !== null) renderGraficaYTabla();
    } catch (e) {
      estado.poblacion = null; estado.poblacionIndex = null; estado.poblacionDisponible = false;
      renderMedidaAnalisisSelector();
      estadoEl.textContent = "No se pudo leer el archivo de población: " + e.message;
    }
  }

  if (inputPoblacion) {
    inputPoblacion.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) procesarArchivoPoblacion(e.target.files[0]);
    });
  }
  if (selMedidaAnalisis) {
    selMedidaAnalisis.addEventListener("change", () => {
      estado.medidaAnalisis = selMedidaAnalisis.value;
      renderGraficaYTabla();
    });
  }

  // Nombre de la medida que se muestra en KPI/gráfica/tabla/PDF: la medida
  // mapeada tal cual (p. ej. "Casos") salvo que haya población relacionada
  // Y la persona haya elegido analizar Población o Tasa.
  function _nombreMedidaActual(nombreMedidaBase) {
    if (!estado.poblacionDisponible) return nombreMedidaBase;
    if (estado.medidaAnalisis === "poblacion") return "Población";
    if (estado.medidaAnalisis === "tasa") return "Tasa (por 100,000 hab.)";
    return nombreMedidaBase;
  }

  // Calcula el agregado clásico (una fila por categoría) reutilizando
  // agregar() de siempre, o — cuando hay población relacionada y se eligió
  // analizar Población/Tasa — agregarConPoblacion(), tomando sólo el campo
  // elegido y devolviendo EXACTAMENTE la misma forma {categoria, valor}
  // que ya espera el resto del código (gráfica, tabla, KPI, PDF), para no
  // tener que tocar esa lógica ya probada.
  function _calcularAgregadoClasico(filtrosParaAgregar) {
    if (!estado.poblacionDisponible) {
      return svc.agregar(estado.rows, estado.dimIdx, estado.medidaIdx, filtrosParaAgregar);
    }
    const resultados = svc.agregarConPoblacion(
      estado.rows, estado.dimIdx, estado.medidaIdx, filtrosParaAgregar,
      estado.joinColsCasos, estado.poblacionIndex.mapa
    );
    const campo = estado.medidaAnalisis === "poblacion" ? "poblacion"
      : (estado.medidaAnalisis === "tasa" ? "tasa" : "valorCasos");
    const agregado = resultados.map((r) => {
      let v = r[campo];
      if (v === null || v === undefined) v = 0; // sin población conocida para esa categoría: se cuenta como 0, nunca se inventa un número
      if (campo === "tasa") v = Math.round(v * 10) / 10; // 1 decimal — números de tasa legibles
      return { categoria: r.categoria, valor: v };
    });
    agregado.sort((a, b) => b.valor - a.valor);
    return agregado;
  }

  // Igual que agregarComparativo(), pero con la misma sustitución de campo
  // (Casos/Población/Tasa) cuando aplica — devuelve la MISMA forma
  // [{categoria, valores:{año:num}, total}] que ya usa renderComparativo,
  // así el cálculo de Diferencia/Variación % y la gráfica agrupada no
  // cambian.
  function _calcularAgregadoComparativo(filtrosActivos, aniosSeleccionados) {
    if (!estado.poblacionDisponible) {
      return svc.agregarComparativo(estado.rows, estado.dimIdx, estado.medidaIdx, filtrosActivos, estado.colAnioFiltro, aniosSeleccionados);
    }
    const resultados = svc.agregarComparativoConPoblacion(
      estado.rows, estado.dimIdx, estado.medidaIdx, filtrosActivos, estado.colAnioFiltro, aniosSeleccionados,
      estado.joinColsCasos, estado.poblacionIndex.mapa
    );
    const campo = estado.medidaAnalisis === "poblacion" ? "poblacion"
      : (estado.medidaAnalisis === "tasa" ? "tasa" : "valorCasos");
    const agregado = resultados.map((r) => {
      const valores = {};
      let total = 0;
      aniosSeleccionados.forEach((y) => {
        const datoAnio = r.valores[y];
        let v = datoAnio ? datoAnio[campo] : null;
        if (v === null || v === undefined) v = 0;
        if (campo === "tasa") v = Math.round(v * 10) / 10;
        valores[y] = v;
        total += v;
      });
      return { categoria: r.categoria, valores, total };
    });
    agregado.sort((a, b) => b.total - a.total);
    return agregado;
  }

  // ---- Paso 2: mapeo de columnas ----
  function renderPasoMapeo() {
    const columnas = svc.inferirColumnas(estado.headers, estado.rows);
    estado.columnasInfo = columnas; // se reutiliza como resguardo al validar (ver más abajo)
    document.getElementById("carga-archivo-nombre").textContent = estado.nombreArchivo;
    document.getElementById("carga-archivo-conteo").textContent =
      `${estado.rows.length.toLocaleString("es-MX")} filas · ${estado.headers.length} columnas detectadas`;

    document.getElementById("carga-mapeo-body").innerHTML = columnas.map((c) => {
      const esNumerica = c.tipo === "numero";
      // Rol propuesto por defecto: texto -> Dimensión; número "normal" ->
      // Medida; número que parece código/año/semana/clave -> Dimensión
      // también (nunca se propone Medida por defecto para estas).
      const rolPropuesto = !esNumerica ? "dimension" : (c.pareceCodigo ? "dimension" : "medida");
      const tipoTexto = esNumerica ? "Número" : "Texto";
      const avisoCodigo = c.pareceCodigo
        ? ` <span class="text-muted" style="font-size:11px;" title="Se ve como año, semana, mes, clave o folio — normalmente no se suma. Puedes marcarla como Medida de todas formas si de verdad hace falta.">· posible código</span>`
        : "";
      return `
      <tr>
        <td class="col-text">${c.nombre}</td>
        <td><span class="badge badge-role">${tipoTexto}</span>${avisoCodigo}</td>
        <td class="col-text text-muted" style="font-size:var(--fs-caption);">${c.muestra.map((v) => v.length > 24 ? v.slice(0, 24) + "…" : v).join(", ") || "—"}</td>
        <td>${c.vacios ? `<span class="text-muted">${c.vacios.toLocaleString("es-MX")}</span>` : "0"}</td>
        <td>
          <select data-col="${c.index}" class="carga-rol-select">
            <option value="ignorar" ${rolPropuesto === "ignorar" ? "selected" : ""}>Ignorar</option>
            <option value="dimension" ${rolPropuesto === "dimension" ? "selected" : ""}>Dimensión (eje de la gráfica)</option>
            <option value="medida" ${rolPropuesto === "medida" ? "selected" : ""} ${esNumerica ? "" : "disabled"} title="${esNumerica ? "" : "Sólo columnas numéricas pueden usarse como medida"}">Medida (número a sumar)</option>
            <option value="filtro">Filtro</option>
          </select>
        </td>
      </tr>
    `;
    }).join("");

    // Vista previa cruda (primeras 8 filas, tal cual vienen).
    document.getElementById("carga-preview-head").innerHTML =
      "<tr>" + estado.headers.map((h) => `<th>${h}</th>`).join("") + "</tr>";
    document.getElementById("carga-preview-body").innerHTML = estado.rows.slice(0, 8).map((r) =>
      "<tr>" + estado.headers.map((_, i) => `<td class="col-text">${r[i] === undefined ? "" : r[i]}</td>`).join("") + "</tr>"
    ).join("");
  }

  document.getElementById("btn-carga-otro-archivo-mapeo").addEventListener("click", () => {
    inputArchivo.value = "";
    mostrarPaso("subir");
  });

  // v2.9.0-prototipo (ACT06 — Parte 1): "Marcar todas como Ignorar" pone
  // TODOS los <select> de rol en "ignorar" de un clic (útil en bases con
  // muchas columnas, como BASE_CASOS_2025_2026.xlsx, cuando sólo hace falta
  // marcar unas pocas). No borra ni recalcula nada más: cada <select> sigue
  // siendo 100% editable después, exactamente igual que si se hubiera
  // elegido "Ignorar" a mano en cada fila.
  document.getElementById("btn-carga-mapeo-ignorar-todo").addEventListener("click", () => {
    document.querySelectorAll(".carga-rol-select").forEach((sel) => { sel.value = "ignorar"; });
  });

  document.getElementById("btn-carga-validar").addEventListener("click", () => {
    const mapeo = {};
    document.querySelectorAll(".carga-rol-select").forEach((sel) => {
      const idx = Number(sel.dataset.col);
      let rol = sel.value;
      // Resguardo (mejora 1): una columna de tipo TEXTO nunca debe usarse
      // como medida, aunque la opción esté deshabilitada en la interfaz.
      const info = (estado.columnasInfo || []).find((c) => c.index === idx);
      if (rol === "medida" && info && info.tipo !== "numero") rol = "ignorar";
      mapeo[idx] = { rol };
    });
    estado.mapeo = mapeo;
    // Dimensión, Medida y Filtro son roles independientes: ya no se infiere
    // ningún filtro automáticamente a partir del orden de las columnas
    // marcadas como Dimensión (eso es lo que causaba que el filtro
    // dependiera del orden). Si se marcó más de un candidato para
    // Dimensión o Medida, el paso de resultado ofrece un selector para
    // elegir cuál se usa (por defecto, el primero marcado).
    estado.dimCandidatos = Object.keys(mapeo).filter((k) => mapeo[k].rol === "dimension").map(Number);
    estado.medidaCandidatos = Object.keys(mapeo).filter((k) => mapeo[k].rol === "medida").map(Number);
    estado.filtroCandidatos = Object.keys(mapeo).filter((k) => mapeo[k].rol === "filtro").map(Number);
    estado.dimIdx = estado.dimCandidatos.length ? estado.dimCandidatos[0] : null;
    estado.medidaIdx = estado.medidaCandidatos.length ? estado.medidaCandidatos[0] : null;
    renderPasoResultado();
    mostrarPaso("resultado");
  });

  // ---- Paso 3: informe de calidad + previsualización ----
  function destroyChart() { if (chart) { chart.destroy(); chart = null; } }

  // Lee el selector "Categorías a mostrar" (Top 10/15/20/Todas). Se usa
  // tanto para la gráfica como para la tabla resumen, para que ambas
  // muestren siempre exactamente el mismo conjunto de categorías.
  function leerTopN() {
    const sel = document.getElementById("carga-topn");
    const val = sel ? sel.value : "15";
    return val === "todas" ? null : Number(val);
  }

  // Guarda el último resultado calculado (agregado completo, subconjunto
  // mostrado, filtros y topN aplicados) para que la exportación a PDF use
  // exactamente lo que la persona está viendo en pantalla.
  let ultimoResultado = null;

  // Lee TODOS los filtros activos (uno por cada columna marcada como
  // Filtro, ignorando los que están en "Todos"). Se combinan con AND.
  function leerFiltrosActivos() {
    return Array.from(document.querySelectorAll(".carga-filtro-select"))
      .map((sel) => ({ colIdx: Number(sel.dataset.col), valor: sel.value }))
      .filter((f) => f.valor);
  }

  // Cuántas líneas ocupará una etiqueta ya envuelta por SNSP_wrapLabel
  // (misma función y mismo wrapAt=26 que usa SNSP_renderBarChart por
  // defecto): permite calcular el alto real que necesita el contenedor de
  // la gráfica en vez de asumir 1 línea por barra, que es lo que causaba
  // que las etiquetas largas (p. ej. nombres de Padecimiento) se
  // encimaran en Top 20/Todas.
  function _lineasEtiquetaCarga(categoria, wrapAt) {
    wrapAt = wrapAt || 26;
    if (typeof categoria !== "string" || categoria.length <= wrapAt) return 1;
    if (typeof SNSP_wrapLabel === "function") {
      const lineas = SNSP_wrapLabel(categoria, wrapAt);
      return Array.isArray(lineas) ? lineas.length : 1;
    }
    return Math.ceil(categoria.length / wrapAt);
  }

  function _tituloCortoEl() { return document.getElementById("carga-chart-titulo-corto"); }

  function renderGraficaYTabla() {
    destroyChart();
    const filtrosActivos = leerFiltrosActivos(); // filtros normales (AND), sin incluir la columna Año
    const aniosSeleccionados = leerAniosSeleccionados();
    const modoComparativo = aniosSeleccionados.length >= 2;
    const topN = leerTopN();
    const nombreDim = estado.headers[estado.dimIdx];
    const nombreMedida = _nombreMedidaActual(estado.medidaIdx !== null ? estado.headers[estado.medidaIdx] : "Conteo de filas");
    const tituloCortoEl = _tituloCortoEl();

    if (modoComparativo) {
      renderComparativo(filtrosActivos, aniosSeleccionados, topN, nombreDim, nombreMedida, tituloCortoEl);
      return;
    }

    // ---- Modo clásico: 0 o 1 año elegido (o la columna Año ni se marcó
    // como Filtro) — funciona exactamente igual que antes del comparativo.
    // Si hay exactamente 1 año elegido, se agrega como un filtro más.
    const filtrosParaAgregar = aniosSeleccionados.length === 1
      ? filtrosActivos.concat([{ colIdx: estado.colAnioFiltro, valor: aniosSeleccionados[0] }])
      : filtrosActivos;
    const agregado = _calcularAgregadoClasico(filtrosParaAgregar);
    const top = topN ? agregado.slice(0, topN) : agregado;
    const etiquetaTop = topN ? `top ${topN}` : "todas";

    const padecimientoActivoClasico = _valorPadecimientoActivo(filtrosActivos);
    const sufijoAnioClasico = aniosSeleccionados.length === 1 ? aniosSeleccionados[0] : null;
    const tituloCortoTextoClasico = _fijarTituloCorto(tituloCortoEl, sufijoAnioClasico, nombreMedida, nombreDim, padecimientoActivoClasico);

    // Alto dinámico del contenedor de la gráfica: se calcula con el número
    // REAL de líneas que ocupará la etiqueta más larga entre las
    // categorías visibles (no un valor fijo de 1 línea por barra), para
    // que Chart.js tenga espacio de sobra y ninguna etiqueta se encime,
    // sea Top 10, 15, 20 o Todas (autoSkip se desactiva abajo como
    // refuerzo adicional).
    const maxLineas = top.reduce((m, r) => Math.max(m, _lineasEtiquetaCarga(r.categoria, 26)), 1);
    const alturaPorBarra = 26 + (maxLineas - 1) * 16;
    const alturaMinima = 420;
    document.getElementById("carga-chart-wrap").style.height =
      Math.max(alturaMinima, top.length * alturaPorBarra + 90) + "px";

    chart = SNSP_renderBarChart(
      "carga-chart",
      top.map((r) => r.categoria),
      top.map((r) => r.valor),
      nombreMedida,
      {
        horizontal: true,
        tituloPartes: {
          indicador: nombreMedida,
          dimension: nombreDim + (top.length < agregado.length ? ` (${etiquetaTop})` : ""),
          padecimiento: null,
          lugar: estado.nombreArchivo,
          periodo: "vista previa local",
        },
      }
    );

    // Refuerzo: se asegura que NINGUNA etiqueta de categoría del eje se
    // omita por autoSkip de Chart.js (bug reportado: "algunas categorías
    // no muestran correctamente su nombre"). Con el alto dinámico de
    // arriba ya sobra espacio; esto garantiza que Chart.js no decida
    // saltarse ninguna de todos modos.
    if (chart) {
      if (!chart.options.scales) chart.options.scales = {};
      if (!chart.options.scales.y) chart.options.scales.y = {};
      chart.options.scales.y.ticks = Object.assign({}, chart.options.scales.y.ticks, { autoSkip: false });
      // Se desactiva la animación de entrada: esto es una vista previa que
      // se recrea en cada cambio de filtro/Top/mapeo, y además permite que
      // "Exportar a PDF" capture siempre el dibujo final completo de la
      // gráfica (sin depender de que la animación ya haya terminado).
      chart.options.animation = false;
      chart.update();
    }

    document.getElementById("carga-tabla-head").innerHTML = `<tr><th>#</th><th>Categoría</th><th>Valor</th></tr>`;
    document.getElementById("carga-tabla-body").innerHTML = top.map((r, i) => `
      <tr>
        <td><span class="rank-badge ${i < 3 ? "top" : ""}">${i + 1}</span></td>
        <td class="col-text">${r.categoria}</td>
        <td>${r.valor.toLocaleString("es-MX")}</td>
      </tr>
    `).join("");
    document.getElementById("carga-tabla-count").textContent =
      `Mostrando ${top.length} de ${agregado.length} categorías (${etiquetaTop})`;

    const totalFiltrado = filtrosParaAgregar.length
      ? estado.rows.filter((r) => filtrosParaAgregar.every((f) => String(r[f.colIdx] || "").trim() === f.valor)).length
      : estado.rows.length;
    const etiquetaFilasFiltro = filtrosParaAgregar.length === 0
      ? "Filas consideradas"
      : (filtrosParaAgregar.length === 1 ? "Filas con el filtro aplicado" : "Filas con los filtros aplicados");
    document.getElementById("carga-kpi-grid").innerHTML = [
      { label: "Filas en el archivo", value: estado.rows.length.toLocaleString("es-MX"), accent: "var(--c-vino)", footnote: estado.nombreArchivo },
      { label: etiquetaFilasFiltro, value: totalFiltrado.toLocaleString("es-MX"), accent: "var(--c-dorado)", footnote: "Antes de excluir valores no numéricos en la medida" },
      { label: "Categorías encontradas", value: agregado.length.toLocaleString("es-MX"), accent: "var(--c-verde-claro)", footnote: nombreDim },
    ].map(SNSP_indicatorCardHTML).join("");

    ultimoResultado = {
      modoComparativo: false, agregado, top, filtros: filtrosActivos, aniosSeleccionados,
      nombreDim, nombreMedida, etiquetaTop, totalFiltrado, dimIdx: estado.dimIdx,
      tituloCorto: tituloCortoTextoClasico,
    };
  }

  // ---- Modo comparativo: 2+ años elegidos en el filtro Año ----
  // Gráfica de barras agrupadas (una serie por año, vía
  // SNSP_renderGroupedBarChart — ya existe en charts.js, no se modifica
  // ese archivo) y tabla con una columna "[Medida] [año]" por cada año,
  // más Diferencia/Variación % cuando son exactamente 2 años.
  function renderComparativo(filtrosActivos, aniosSeleccionados, topN, nombreDim, nombreMedida, tituloCortoEl) {
    const agregado = _calcularAgregadoComparativo(filtrosActivos, aniosSeleccionados);
    const top = topN ? agregado.slice(0, topN) : agregado;
    const etiquetaTop = topN ? `top ${topN}` : "todas";

    const padecimientoActivoComparativo = _valorPadecimientoActivo(filtrosActivos);
    const sufijoAnioComparativo = `Comparativo ${aniosSeleccionados.join(" vs ")}`;
    const tituloCortoTextoComparativo = _fijarTituloCorto(tituloCortoEl, sufijoAnioComparativo, nombreMedida, nombreDim, padecimientoActivoComparativo);

    // Alto dinámico: igual que en modo clásico (líneas reales de la
    // etiqueta más larga), pero cada categoría ahora ocupa 2 barras (una
    // por año) en vez de 1, así que se reserva el doble de alto base por
    // categoría para que tampoco se encimen las barras entre sí.
    const maxLineas = top.reduce((m, r) => Math.max(m, _lineasEtiquetaCarga(r.categoria, 26)), 1);
    const alturaPorBarraBase = 26 + (maxLineas - 1) * 16;
    const alturaPorCategoria = alturaPorBarraBase * aniosSeleccionados.length * 0.9;
    const alturaMinima = 420;
    document.getElementById("carga-chart-wrap").style.height =
      Math.max(alturaMinima, top.length * alturaPorCategoria + 90) + "px";

    chart = SNSP_renderGroupedBarChart(
      "carga-chart",
      top.map((r) => r.categoria),
      aniosSeleccionados.map((y) => ({ label: y, data: top.map((r) => r.valores[y] || 0) })),
      nombreMedida,
      { horizontal: true }
    );

    if (chart) {
      if (!chart.options.scales) chart.options.scales = {};
      if (!chart.options.scales.y) chart.options.scales.y = {};
      chart.options.scales.y.ticks = Object.assign({}, chart.options.scales.y.ticks, { autoSkip: false });
      chart.options.animation = false;
      chart.update();
    }

    const hayDiferencia = aniosSeleccionados.length === 2;
    document.getElementById("carga-tabla-head").innerHTML =
      `<tr><th>#</th><th>${nombreDim}</th>` +
      aniosSeleccionados.map((y) => `<th>${nombreMedida} ${y}</th>`).join("") +
      (hayDiferencia ? `<th>Diferencia</th><th>Variación %</th>` : "") +
      `</tr>`;
    document.getElementById("carga-tabla-body").innerHTML = top.map((r, i) => {
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
    document.getElementById("carga-tabla-count").textContent =
      `Mostrando ${top.length} de ${agregado.length} categorías (${etiquetaTop}) — comparativo ${aniosSeleccionados.join(" vs ")}`;

    const totalFiltrado = estado.rows.filter((r) => {
      if (!filtrosActivos.every((f) => String(r[f.colIdx] || "").trim() === f.valor)) return false;
      const v = String(r[estado.colAnioFiltro] === undefined ? "" : r[estado.colAnioFiltro]).trim();
      return aniosSeleccionados.includes(v);
    }).length;
    document.getElementById("carga-kpi-grid").innerHTML = [
      { label: "Filas en el archivo", value: estado.rows.length.toLocaleString("es-MX"), accent: "var(--c-vino)", footnote: estado.nombreArchivo },
      { label: "Filas en los años comparados", value: totalFiltrado.toLocaleString("es-MX"), accent: "var(--c-dorado)", footnote: aniosSeleccionados.join(" vs ") },
      { label: "Categorías encontradas", value: agregado.length.toLocaleString("es-MX"), accent: "var(--c-verde-claro)", footnote: nombreDim },
    ].map(SNSP_indicatorCardHTML).join("");

    ultimoResultado = {
      modoComparativo: true, agregado, top, filtros: filtrosActivos, aniosSeleccionados,
      nombreDim, nombreMedida, etiquetaTop, totalFiltrado, dimIdx: estado.dimIdx,
      tituloCorto: tituloCortoTextoComparativo,
    };
  }

  // Si se marcó más de una columna como Dimensión o como Medida, ofrece un
  // selector explícito para elegir cuál alimenta la gráfica — reemplaza la
  // inferencia anterior basada en el orden de las columnas marcadas.
  function renderSelectorDimMedida() {
    const wrap = document.getElementById("carga-config-wrap");
    const grid = document.getElementById("carga-config-grid");
    const bloques = [];
    if (estado.dimCandidatos.length > 1) {
      bloques.push(`
        <div class="field" style="max-width: 260px;">
          <label for="carga-select-dim">Agrupar la gráfica por</label>
          <select id="carga-select-dim">
            ${estado.dimCandidatos.map((idx) => `<option value="${idx}" ${idx === estado.dimIdx ? "selected" : ""}>${estado.headers[idx]}</option>`).join("")}
          </select>
        </div>`);
    }
    if (estado.medidaCandidatos.length > 1) {
      bloques.push(`
        <div class="field" style="max-width: 260px;">
          <label for="carga-select-medida">Medida a sumar</label>
          <select id="carga-select-medida">
            ${estado.medidaCandidatos.map((idx) => `<option value="${idx}" ${idx === estado.medidaIdx ? "selected" : ""}>${estado.headers[idx]}</option>`).join("")}
          </select>
        </div>`);
    }
    grid.innerHTML = bloques.join("");
    wrap.style.display = bloques.length ? "" : "none";
    const selDim = document.getElementById("carga-select-dim");
    if (selDim) selDim.addEventListener("change", () => { estado.dimIdx = Number(selDim.value); renderGraficaYTabla(); });
    const selMedida = document.getElementById("carga-select-medida");
    if (selMedida) selMedida.addEventListener("change", () => { estado.medidaIdx = Number(selMedida.value); renderGraficaYTabla(); });
  }

  // Un bloque de filtro independiente por cada columna marcada como
  // Filtro, cada uno con "Todos" por defecto. Todos los filtros activos
  // se combinan con AND (ver leerFiltrosActivos) y aplican a la vez a la
  // gráfica, la tabla, los KPI y la exportación a PDF. La columna Filtro
  // detectada como Año (columnasInfo[].esAnio) es la única excepción: se
  // dibuja como selector MÚLTIPLE de chips (ver renderBloqueFiltroAnio),
  // porque con 2+ años elegidos activa el modo comparativo.
  function renderFiltros() {
    const wrap = document.getElementById("carga-filtros-wrap");
    const grid = document.getElementById("carga-filtros-grid");
    if (!estado.filtroCandidatos.length) {
      wrap.style.display = "none";
      grid.innerHTML = "";
      estado.colAnioFiltro = null;
      return;
    }
    wrap.style.display = "";
    const colAnio = estado.filtroCandidatos.find((idx) => {
      const info = (estado.columnasInfo || []).find((c) => c.index === idx);
      return info && info.esAnio;
    });
    estado.colAnioFiltro = colAnio === undefined ? null : colAnio;

    // Valores únicos por columna: se calculan una sola vez aquí y se
    // reutilizan tanto para dibujar el bloque como para inicializar el
    // buscador (si aplica), en vez de recalcularlos dos veces.
    const valoresPorColumna = {};

    grid.innerHTML = estado.filtroCandidatos.map((idx) => {
      if (idx === estado.colAnioFiltro) return renderBloqueFiltroAnio(idx);
      const valores = svc.valoresUnicos(estado.rows, idx, 300);
      valoresPorColumna[idx] = valores;
      if (valores.length > UMBRAL_FILTRO_BUSCABLE) return renderBloqueFiltroBuscable(idx, valores);
      return `
        <div class="field" style="max-width: 260px;">
          <label>${estado.headers[idx]}</label>
          <select class="carga-filtro-select" data-col="${idx}">
            <option value="">Todos</option>
            ${valores.map((v) => `<option value="${v}">${v}</option>`).join("")}
          </select>
        </div>`;
    }).join("");
    grid.querySelectorAll(".carga-filtro-select").forEach((sel) => {
      sel.addEventListener("change", renderGraficaYTabla);
    });
    if (estado.colAnioFiltro !== null) inicializarFiltroAnio(estado.colAnioFiltro);
    estado.filtroCandidatos.forEach((idx) => {
      if (idx === estado.colAnioFiltro) return;
      if (valoresPorColumna[idx].length > UMBRAL_FILTRO_BUSCABLE) inicializarFiltroBuscable(idx);
    });
  }

  // ---- Selector múltiple de Año (comparar) ----
  // Markup del bloque; el contenido del menú y los listeners se arman en
  // inicializarFiltroAnio() (necesita estado.rows, que ya está disponible
  // para cuando esto se llama).
  function renderBloqueFiltroAnio(idx) {
    return `
      <div class="field carga-anio-field" style="max-width: 280px;">
        <label>${estado.headers[idx]} <span class="text-muted" style="font-weight:400;">(comparar)</span></label>
        <div class="carga-anio-multiselect" data-col="${idx}">
          <div class="carga-anio-chips"></div>
          <button type="button" class="carga-anio-toggle">+ ${estado.headers[idx]}</button>
          <div class="carga-anio-menu" hidden></div>
        </div>
      </div>`;
  }

  function inicializarFiltroAnio(idx) {
    const cont = document.querySelector(`.carga-anio-multiselect[data-col="${idx}"]`);
    if (!cont) return;
    const valores = svc.valoresUnicos(estado.rows, idx, 50); // una columna Año real nunca trae más de un puñado de valores
    const menu = cont.querySelector(".carga-anio-menu");
    const chipsEl = cont.querySelector(".carga-anio-chips");
    menu.innerHTML = valores.map((v) => `
      <label class="carga-anio-opcion"><input type="checkbox" value="${v}"> ${v}</label>
    `).join("");

    function renderChips() {
      const seleccionados = Array.from(menu.querySelectorAll("input:checked")).map((i) => i.value);
      chipsEl.innerHTML = seleccionados.length
        ? seleccionados.map((v) => `<span class="carga-anio-chip" data-valor="${v}">${v} <button type="button" aria-label="Quitar ${v}">&times;</button></span>`).join("")
        : `<span class="text-muted" style="font-size:var(--fs-body-sm);">Todos</span>`;
    }
    renderChips();

    menu.querySelectorAll("input[type=checkbox]").forEach((chk) => {
      chk.addEventListener("change", () => { renderChips(); renderGraficaYTabla(); });
    });
    chipsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const valor = btn.closest(".carga-anio-chip").dataset.valor;
      // Se busca por valor comparando directo (sin CSS.escape: los valores
      // de una columna Año real son simples, ej. "2025") para no depender
      // de una API que no todos los entornos de prueba implementan.
      const chk = Array.from(menu.querySelectorAll("input[type=checkbox]")).find((i) => i.value === valor);
      if (chk) { chk.checked = false; renderChips(); renderGraficaYTabla(); }
    });
    const toggleBtn = cont.querySelector(".carga-anio-toggle");
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    document.addEventListener("click", (e) => {
      if (!cont.contains(e.target)) menu.hidden = true;
    });
  }

  // ---- Filtro con buscador de texto (v2.8.0-prototipo) ----
  // Se usa automáticamente para cualquier columna marcada como Filtro con
  // más de UMBRAL_FILTRO_BUSCABLE valores únicos (Padecimiento, Unidad
  // médica, etc. — reutilizable, no un caso especial de una sola columna).
  // Mantiene un <select class="carga-filtro-select"> real pero oculto con
  // las mismas opciones: leerFiltrosActivos() y exportarPDF() ya leen
  // cualquier ".carga-filtro-select" sin importar si está visible, así que
  // toda esa lógica (AND entre filtros, KPI, tabla, PDF) sigue funcionando
  // sin cambios — el buscador sólo decide qué valor le asigna a ese select.
  function renderBloqueFiltroBuscable(idx, valores) {
    return `
      <div class="field carga-filtro-buscable-field" style="max-width: 260px;">
        <label>${estado.headers[idx]}</label>
        <select class="carga-filtro-select" data-col="${idx}" hidden aria-hidden="true" tabindex="-1">
          <option value="">Todos</option>
          ${valores.map((v) => `<option value="${v}">${v}</option>`).join("")}
        </select>
        <div class="carga-filtro-buscable" data-col="${idx}">
          <button type="button" class="carga-filtro-buscable-toggle">Todos</button>
          <div class="carga-filtro-buscable-menu" hidden>
            <input type="text" class="carga-filtro-buscable-input" placeholder="Buscar en ${valores.length.toLocaleString("es-MX")} valores…">
            <div class="carga-filtro-buscable-opciones"></div>
          </div>
        </div>
      </div>`;
  }

  function inicializarFiltroBuscable(idx) {
    const cont = document.querySelector(`.carga-filtro-buscable[data-col="${idx}"]`);
    const selectReal = document.querySelector(`.carga-filtro-select[data-col="${idx}"]`);
    if (!cont || !selectReal) return;
    const toggleBtn = cont.querySelector(".carga-filtro-buscable-toggle");
    const menu = cont.querySelector(".carga-filtro-buscable-menu");
    const input = cont.querySelector(".carga-filtro-buscable-input");
    const listaEl = cont.querySelector(".carga-filtro-buscable-opciones");
    const opciones = Array.from(selectReal.options);

    function etiquetaOpcion(op) { return op.value === "" ? "Todos" : op.textContent; }

    // "Todos" siempre queda visible en la lista (ignora el texto de
    // búsqueda) para poder quitar el filtro sin tener que borrar antes lo
    // escrito. La comparación ignora acentos y mayúsculas/minúsculas
    // (_normalizarBusqueda) y acepta coincidencia parcial en cualquier
    // parte del valor, no sólo al inicio.
    function botonOpcion(op) {
      return `<button type="button" class="carga-filtro-buscable-opcion${op.value === selectReal.value ? " is-selected" : ""}" data-valor="${op.value}">${etiquetaOpcion(op)}</button>`;
    }

    function renderLista(textoBusqueda) {
      const norm = _normalizarBusqueda(textoBusqueda);
      const opcionTodos = opciones.find((op) => op.value === "");
      const resto = opciones.filter((op) => op.value !== "" && (!norm || _normalizarBusqueda(op.textContent).includes(norm)));
      const partes = [];
      if (opcionTodos) partes.push(botonOpcion(opcionTodos));
      if (resto.length) partes.push(resto.map(botonOpcion).join(""));
      else if (norm) partes.push(`<p class="carga-filtro-buscable-vacio">Sin coincidencias</p>`);
      listaEl.innerHTML = partes.join("");
    }

    function actualizarToggle() {
      const seleccionada = opciones.find((op) => op.value === selectReal.value);
      toggleBtn.textContent = seleccionada ? etiquetaOpcion(seleccionada) : "Todos";
      toggleBtn.classList.toggle("is-activo", !!selectReal.value);
    }
    actualizarToggle();
    renderLista("");

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const vaAAbrir = menu.hidden;
      menu.hidden = !vaAAbrir;
      if (vaAAbrir) {
        input.value = "";
        renderLista("");
        input.focus();
      }
    });
    input.addEventListener("input", () => renderLista(input.value));
    listaEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".carga-filtro-buscable-opcion");
      if (!btn) return;
      selectReal.value = btn.dataset.valor;
      actualizarToggle();
      menu.hidden = true;
      selectReal.dispatchEvent(new Event("change", { bubbles: true }));
    });
    document.addEventListener("click", (e) => {
      if (!cont.contains(e.target)) menu.hidden = true;
    });
  }

  // Años (u otro valor de la columna Año) actualmente marcados en el
  // selector múltiple. Vacío = "Todos" (comportamiento clásico, sin
  // comparar). Se lee del DOM en vez de guardarse aparte, igual que el
  // resto de los filtros (leerFiltrosActivos).
  function leerAniosSeleccionados() {
    if (estado.colAnioFiltro === null) return [];
    const menu = document.querySelector(`.carga-anio-multiselect[data-col="${estado.colAnioFiltro}"] .carga-anio-menu`);
    if (!menu) return [];
    return Array.from(menu.querySelectorAll("input:checked")).map((i) => i.value);
  }

  function renderPasoResultado() {
    const informe = svc.generarInformeCalidad(estado.headers, estado.rows, estado.mapeo, estado.columnasInfo);
    document.getElementById("carga-informe-resumen").innerHTML = `
      <li><strong>${informe.resumen.total_filas.toLocaleString("es-MX")}</strong> filas · <strong>${informe.resumen.total_columnas}</strong> columnas totales</li>
      <li><strong>${informe.resumen.columnas_dimension}</strong> columna(s) marcada(s) como dimensión · <strong>${informe.resumen.columnas_medida}</strong> como medida · <strong>${informe.resumen.columnas_filtro}</strong> como filtro</li>
      <li><strong>${informe.resumen.filas_duplicadas.toLocaleString("es-MX")}</strong> filas duplicadas exactas (${informe.resumen.pct_duplicadas}%) — informativo, no se eliminan</li>
    `;
    document.getElementById("carga-informe-avisos").innerHTML = informe.avisos.length
      ? informe.avisos.map((a) => `<li>${a}</li>`).join("")
      : "<li>Sin observaciones adicionales de calidad.</li>";

    if (estado.dimIdx === null) {
      document.getElementById("carga-resultado-vacio").style.display = "block";
      document.getElementById("carga-resultado-panels").style.display = "none";
      return;
    }
    document.getElementById("carga-resultado-vacio").style.display = "none";
    document.getElementById("carga-resultado-panels").style.display = "";

    renderSelectorDimMedida();
    renderFiltros();
    renderMedidaAnalisisSelector();
    renderGraficaYTabla();
  }

  // "Cambiar mapeo" regresa al paso 2 conservando el archivo ya leído en
  // memoria (estado.headers/estado.rows) y las selecciones de rol hechas
  // en la tabla de mapeo (el DOM no se reconstruye), para poder ajustar
  // Dimensión/Medida/Ignorar sin tener que volver a cargar el archivo.
  document.getElementById("btn-carga-cambiar-mapeo").addEventListener("click", () => mostrarPaso("mapeo"));
  document.getElementById("btn-carga-otro-archivo-resultado").addEventListener("click", () => {
    inputArchivo.value = "";
    destroyChart();
    mostrarPaso("subir");
  });
  // Los filtros ahora se generan dinámicamente (uno por columna marcada
  // como Filtro, ver renderFiltros) y cada uno registra su propio listener
  // de "change" al crearse — no hay un único #carga-filtro-valor fijo.
  document.getElementById("carga-topn").addEventListener("change", renderGraficaYTabla);

  // ---- ACT06 — Parte 3: orientación adaptable del PDF --------------------
  // Ancho aproximado (en puntos) que ocuparía un texto en Helvetica al
  // tamaño dado — suficiente para DECIDIR orientación y anchos de columna
  // sin depender de una API de medición de texto que no todos los entornos
  // (jsPDF real vs. el stub de las pruebas) exponen igual.
  function _anchoTextoAprox(texto, fontSize) {
    return String(texto === undefined || texto === null ? "" : texto).length * fontSize * 0.52;
  }

  function _anchoIdealColumnas(headTabla, filasTabla, fontSize) {
    return headTabla.map((h, i) => {
      let max = _anchoTextoAprox(h, fontSize) + 14;
      filasTabla.forEach((fila) => {
        const w = _anchoTextoAprox(fila[i], fontSize) + 14;
        if (w > max) max = w;
      });
      const esPrimeraCol = i === 0;
      const esCategoria = i === 1;
      const minCol = esPrimeraCol ? 22 : 55;
      const maxColIndividual = esCategoria ? 280 : 110;
      return Math.max(minCol, Math.min(maxColIndividual, max));
    });
  }

  // Decide vertical (portrait) u horizontal (landscape) según si la tabla
  // resumen necesita, sin comprimirse, más ancho del que cabe en vertical
  // (típico del modo comparativo, con columnas Diferencia/Variación %, o de
  // categorías con nombres largos como Padecimiento). "Primero intenta
  // vertical; si no cabe, cambia a horizontal" — nunca al revés. Si ni
  // siquiera en horizontal alcanza el ancho ideal, se reparte
  // proporcionalmente el espacio disponible entre las columnas (autoTable
  // ajusta el texto con salto de línea, nunca con letra más chica, así no
  // se pierde legibilidad) en vez de dejar que la tabla se salga de la
  // página.
  function _decidirOrientacionPDF(headTabla, filasTabla) {
    const fontSize = 9;
    const margenXLocal = 40;
    const anchoPortrait = 612 - margenXLocal * 2;
    const anchoLandscape = 792 - margenXLocal * 2;
    const anchosIdeal = _anchoIdealColumnas(headTabla, filasTabla, fontSize);
    const anchoIdealTotal = anchosIdeal.reduce((s, w) => s + w, 0);

    function ajustarA(anchoMax, anchos) {
      const suma = anchos.reduce((s, w) => s + w, 0);
      if (suma <= anchoMax) return anchos;
      const factor = anchoMax / suma;
      return anchos.map((w, i) => Math.max(i === 0 ? 20 : 45, Math.round(w * factor)));
    }

    if (anchoIdealTotal <= anchoPortrait) {
      return { orientation: "portrait", anchosCol: anchosIdeal };
    }
    return { orientation: "landscape", anchosCol: ajustarA(anchoLandscape, anchosIdeal) };
  }

  // ---- Exportar a PDF (nombre de base, fecha, total de filas, filtros
  // aplicados, gráfica y tabla resumen — todo generado en el navegador,
  // sin enviar el archivo a ningún servidor) ----
  document.getElementById("btn-carga-exportar-pdf").addEventListener("click", () => exportarPDF());

  function exportarPDF() {
    if (!ultimoResultado || !chart) return;
    // Fuerza un dibujado síncrono e inmediato de la gráfica (sin pasar por
    // la animación de Chart.js) antes de capturarla como imagen: evita que
    // el PDF capture un cuadro a medio animar si se exporta justo después
    // de recrear la gráfica (p. ej. justo tras cambiar el mapeo o el Top).
    if (chart.draw) chart.draw();
    if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
      const errEl = document.getElementById("carga-error");
      errEl.textContent = "No se pudo cargar el generador de PDF. Verifica tu conexión e intenta de nuevo.";
      errEl.style.display = "block";
      return;
    }
    const { jsPDF } = window.jspdf;
    const margenX = 40;

    // ---- Datos de la tabla resumen: se arman ANTES de crear el documento
    // porque la decisión de orientación (ver más abajo) depende de cuánto
    // ancho necesita esta tabla. Misma lógica que ya existía, sin cambios
    // de contenido — sólo se movió más arriba. ----
    let headTabla, filasTabla;
    if (ultimoResultado.modoComparativo) {
      const anios = ultimoResultado.aniosSeleccionados;
      const hayDiferencia = anios.length === 2;
      headTabla = ["#", ultimoResultado.nombreDim || "Categoría"]
        .concat(anios.map((y2) => `${ultimoResultado.nombreMedida} ${y2}`))
        .concat(hayDiferencia ? ["Diferencia", "Variación %"] : []);
      filasTabla = ultimoResultado.top.map((r, i) => {
        const vals = anios.map((y2) => r.valores[y2] || 0);
        const fila = [String(i + 1), r.categoria].concat(vals.map((v) => v.toLocaleString("es-MX")));
        if (hayDiferencia) {
          const diff = vals[1] - vals[0];
          const variacion = vals[0] > 0 ? (diff / vals[0]) * 100 : null;
          const signo = diff > 0 ? "+" : "";
          fila.push(`${signo}${diff.toLocaleString("es-MX")}`);
          fila.push(variacion === null ? "—" : (variacion > 0 ? "+" : "") + variacion.toFixed(1) + "%");
        }
        return fila;
      });
    } else {
      headTabla = ["#", ultimoResultado.nombreDim || "Categoría", ultimoResultado.nombreMedida || "Valor"];
      filasTabla = ultimoResultado.top.map((r, i) => [String(i + 1), r.categoria, r.valor.toLocaleString("es-MX")]);
    }

    // ---- ACT06 — Parte 3: se decide la orientación con los datos reales
    // de la tabla (ver _decidirOrientacionPDF) — primero vertical, y sólo
    // si no cabe, horizontal. ----
    const { orientation, anchosCol } = _decidirOrientacionPDF(headTabla, filasTabla);
    const doc = new jsPDF({ orientation, unit: "pt", format: "letter" });
    const pageWidth = orientation === "landscape" ? 792 : 612;
    const pageHeight = orientation === "landscape" ? 612 : 792;
    const anchoDisponible = pageWidth - margenX * 2;
    let y = 44;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("SNSP Inteligencia Digital — Cargar datos (prototipo)", margenX, y);
    y += 22;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const fechaGeneracion = new Date().toLocaleString("es-MX");
    const filtroBaseTexto = (ultimoResultado.filtros && ultimoResultado.filtros.length)
      ? ultimoResultado.filtros.map((f) => `${estado.headers[f.colIdx]} = "${f.valor}"`).join("; ")
      : "Ninguno";
    const aniosPdf = ultimoResultado.aniosSeleccionados || [];
    // El nombre de la columna Año no cambia entre modo clásico (0/1 año) y
    // comparativo (2+ años); se muestra igual en ambos casos cuando hay al
    // menos un año elegido, para que el PDF refleje lo mismo que se ve en
    // pantalla (título corto y chips seleccionados).
    const nombreColAnio = estado.colAnioFiltro !== null ? estado.headers[estado.colAnioFiltro] : null;
    let filtroTexto = filtroBaseTexto;
    if (aniosPdf.length && nombreColAnio) {
      const aniosTexto = `${nombreColAnio} = ${aniosPdf.join(aniosPdf.length > 1 ? " vs " : "")}`;
      filtroTexto = filtroBaseTexto === "Ninguno" ? aniosTexto : `${filtroBaseTexto}; ${aniosTexto}`;
    }
    const metaLineas = [];
    // Título de la gráfica (incluye el Padecimiento elegido, si lo hay, y
    // el/los año(s) elegido(s)): el mismo texto que se ve en pantalla en
    // #carga-chart-titulo-corto (ver _fijarTituloCorto), guardado ya listo
    // en ultimoResultado.tituloCorto. Si no hay año ni Padecimiento
    // elegidos, ese título corto no se muestra en pantalla — tampoco se
    // agrega aquí, y el PDF queda exactamente igual que antes de v2.8.0.
    if (ultimoResultado.tituloCorto) {
      metaLineas.push(`Título de la gráfica: ${ultimoResultado.tituloCorto}`);
    }
    metaLineas.push(
      `Base de datos: ${estado.nombreArchivo}`,
      `Fecha de generación: ${fechaGeneracion}`,
      `Total de registros en el archivo: ${estado.rows.length.toLocaleString("es-MX")}`,
      `Filtro aplicado: ${filtroTexto}`,
      `Dimensión (categoría): ${ultimoResultado.nombreDim}    Medida: ${ultimoResultado.nombreMedida}`,
      `Categorías mostradas: ${ultimoResultado.top.length} de ${ultimoResultado.agregado.length} (${ultimoResultado.etiquetaTop})`,
    );
    if (ultimoResultado.modoComparativo) {
      metaLineas.push(`Comparativo de años: ${aniosPdf.join(" vs ")}`);
    }
    // Cada línea de metadatos se escribe tal cual, EXACTAMENTE igual que
    // antes de ACT06 (sin envolver texto): envolverlas partiría en dos
    // líneas textos como "Título de la gráfica: ..." cuando son largos
    // (p. ej. Padecimiento + comparativo), y ese texto debe poder seguir
    // leyéndose/buscándose como una sola línea igual que en v2.8.0 — el
    // ancho de página ya crece automáticamente a horizontal cuando la
    // TABLA lo necesita (ver _decidirOrientacionPDF), que es lo que pedía
    // la usuaria; esto es aparte y no se toca.
    metaLineas.forEach((linea) => { doc.text(linea, margenX, y); y += 14; });
    y += 8;

    // ---- Gráfica ----
    // Se captura el canvas en pantalla igual que antes (canvas auxiliar
    // fuera de pantalla, fondo blanco pintado porque JPEG no soporta
    // transparencia, exportado como JPEG calidad 0.85). ACT06 — Parte 3: el
    // ancho de la imagen ahora es el ancho disponible de la orientación
    // elegida, con un TOPE de alto (55% del alto disponible de la página)
    // para que la gráfica nunca deje a la tabla sin espacio razonable ni
    // provoque un salto de página innecesario cuando en realidad sobraba
    // lugar; si se topa, se reduce ancho y alto juntos (mismo aspecto,
    // nunca se deforma) y la imagen se centra horizontalmente.
    try {
      let imgData = null;
      const w = chart.canvas && chart.canvas.width, h = chart.canvas && chart.canvas.height;
      if (chart.canvas && chart.canvas.getContext && w && h) {
        const aux = document.createElement("canvas");
        aux.width = w; aux.height = h;
        const ctxAux = aux.getContext("2d");
        if (ctxAux) {
          ctxAux.fillStyle = "#FFFFFF";
          ctxAux.fillRect(0, 0, w, h);
          ctxAux.drawImage(chart.canvas, 0, 0, w, h);
          imgData = aux.toDataURL("image/jpeg", 0.85);
        }
      }
      if (!imgData && chart.toBase64Image) {
        imgData = chart.toBase64Image();
      }
      if (imgData) {
        let anchoImg = anchoDisponible;
        let altoImg = Math.round(anchoImg * (h / w || 0.6));
        const altoMaximoImg = (pageHeight - margenX * 2) * 0.55;
        if (altoImg > altoMaximoImg) {
          const factor = altoMaximoImg / altoImg;
          altoImg = Math.round(altoImg * factor);
          anchoImg = Math.round(anchoImg * factor);
        }
        const xImg = margenX + (anchoDisponible - anchoImg) / 2;
        if (y + altoImg > pageHeight - margenX) { doc.addPage(); y = 44; }
        doc.addImage(imgData, "JPEG", xImg, y, anchoImg, altoImg);
        y += altoImg + 18;
      }
    } catch (e) {
      // Si la gráfica no puede exportarse como imagen (p. ej. navegador sin
      // soporte de canvas.toDataURL en ese contexto), el PDF continúa sólo
      // con la tabla resumen.
    }

    // ---- Tabla resumen ----
    // ACT06 — Parte 3: si la tabla completa no cabe en lo que resta de esta
    // página pero SÍ cabe entera en una página nueva, se prefiere saltar de
    // página ANTES de empezarla (título "Tabla resumen" incluido) — evita
    // partirla a la mitad cuando podía mantenerse junta. Si ni siquiera en
    // una página nueva cabe entera (demasiadas filas), se deja que
    // continúe de forma normal en más de una página: eso es inevitable y
    // correcto, no un espacio en blanco innecesario.
    const altoFilaEstim = 16;
    const altoTablaEstim = 20 + (filasTabla.length + 1) * altoFilaEstim + 10;
    const altoPaginaCompleta = pageHeight - margenX * 2;
    if (altoTablaEstim > (pageHeight - margenX - y) && altoTablaEstim <= altoPaginaCompleta) {
      doc.addPage();
      y = 44;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Tabla resumen", margenX, y);
    y += 6;

    if (doc.autoTable) {
      const columnStyles = {};
      anchosCol.forEach((colWidth, i) => { columnStyles[i] = { cellWidth: colWidth }; });
      doc.autoTable({
        startY: y + 6,
        margin: { left: margenX, right: margenX },
        head: [headTabla],
        body: filasTabla,
        styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fillColor: [97, 18, 50] },
        columnStyles,
        tableWidth: anchosCol.reduce((s, colWidth) => s + colWidth, 0),
        rowPageBreak: "avoid",
      });
    }

    const nombreBase = (estado.nombreArchivo || "carga").replace(/\.[^.]+$/, "");
    doc.save(`snsp_carga_${nombreBase}.pdf`);
  }

  document.getElementById("version-tag-module").textContent = window.SNSP_CONFIG.platform.version;
  mostrarPaso("subir");
}
