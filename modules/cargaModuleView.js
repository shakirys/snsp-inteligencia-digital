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
  let estado = { headers: [], rows: [], nombreArchivo: "", mapeo: {}, dimIdx: null, medidaIdx: null, filtroColIdx: null };
  let chart = null;

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
      estado = { headers, rows, nombreArchivo: file.name, mapeo: {}, dimIdx: null, medidaIdx: null, filtroColIdx: null };
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

  // ---- Paso 2: mapeo de columnas ----
  function renderPasoMapeo() {
    const columnas = svc.inferirColumnas(estado.headers, estado.rows);
    document.getElementById("carga-archivo-nombre").textContent = estado.nombreArchivo;
    document.getElementById("carga-archivo-conteo").textContent =
      `${estado.rows.length.toLocaleString("es-MX")} filas · ${estado.headers.length} columnas detectadas`;

    document.getElementById("carga-mapeo-body").innerHTML = columnas.map((c) => `
      <tr>
        <td class="col-text">${c.nombre}</td>
        <td><span class="badge badge-role">${c.tipo === "numero" ? "Número" : "Texto"}</span></td>
        <td class="col-text text-muted" style="font-size:var(--fs-caption);">${c.muestra.map((v) => v.length > 24 ? v.slice(0, 24) + "…" : v).join(", ") || "—"}</td>
        <td>${c.vacios ? `<span class="text-muted">${c.vacios.toLocaleString("es-MX")}</span>` : "0"}</td>
        <td>
          <select data-col="${c.index}" class="carga-rol-select">
            <option value="ignorar">Ignorar</option>
            <option value="dimension" ${c.tipo === "texto" ? "selected" : ""}>Dimensión (categoría)</option>
            <option value="medida" ${c.tipo === "numero" ? "selected" : ""}>Medida (número a sumar)</option>
          </select>
        </td>
      </tr>
    `).join("");

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

  document.getElementById("btn-carga-validar").addEventListener("click", () => {
    const mapeo = {};
    document.querySelectorAll(".carga-rol-select").forEach((sel) => {
      const idx = Number(sel.dataset.col);
      mapeo[idx] = { rol: sel.value };
    });
    estado.mapeo = mapeo;
    const dims = Object.keys(mapeo).filter((k) => mapeo[k].rol === "dimension").map(Number);
    const medidas = Object.keys(mapeo).filter((k) => mapeo[k].rol === "medida").map(Number);
    estado.dimIdx = dims.length ? dims[0] : null;
    estado.medidaIdx = medidas.length ? medidas[0] : null;
    estado.filtroColIdx = dims.length > 1 ? dims[1] : null;
    renderPasoResultado();
    mostrarPaso("resultado");
  });

  // ---- Paso 3: informe de calidad + previsualización ----
  function destroyChart() { if (chart) { chart.destroy(); chart = null; } }

  function renderGraficaYTabla() {
    destroyChart();
    const filtroSel = document.getElementById("carga-filtro-valor");
    const filtro = (estado.filtroColIdx !== null && filtroSel && filtroSel.value)
      ? { colIdx: estado.filtroColIdx, valor: filtroSel.value }
      : null;
    const agregado = svc.agregar(estado.rows, estado.dimIdx, estado.medidaIdx, filtro);
    const top = agregado.slice(0, 15);
    const nombreDim = estado.headers[estado.dimIdx];
    const nombreMedida = estado.medidaIdx !== null ? estado.headers[estado.medidaIdx] : "Conteo de filas";

    chart = SNSP_renderBarChart(
      "carga-chart",
      top.map((r) => r.categoria),
      top.map((r) => r.valor),
      nombreMedida,
      {
        horizontal: true,
        tituloPartes: {
          indicador: nombreMedida,
          dimension: nombreDim + (top.length < agregado.length ? " (top 15)" : ""),
          padecimiento: null,
          lugar: estado.nombreArchivo,
          periodo: "vista previa local",
        },
      }
    );

    document.getElementById("carga-tabla-body").innerHTML = agregado.slice(0, 30).map((r, i) => `
      <tr>
        <td><span class="rank-badge ${i < 3 ? "top" : ""}">${i + 1}</span></td>
        <td class="col-text">${r.categoria}</td>
        <td>${r.valor.toLocaleString("es-MX")}</td>
      </tr>
    `).join("");
    document.getElementById("carga-tabla-count").textContent =
      `Mostrando ${Math.min(agregado.length, 30)} de ${agregado.length} categorías`;

    const totalFiltrado = filtro
      ? estado.rows.filter((r) => String(r[filtro.colIdx] || "").trim() === filtro.valor).length
      : estado.rows.length;
    document.getElementById("carga-kpi-grid").innerHTML = [
      { label: "Filas en el archivo", value: estado.rows.length.toLocaleString("es-MX"), accent: "var(--c-vino)", footnote: estado.nombreArchivo },
      { label: filtro ? "Filas con el filtro aplicado" : "Filas consideradas", value: totalFiltrado.toLocaleString("es-MX"), accent: "var(--c-dorado)", footnote: "Antes de excluir valores no numéricos en la medida" },
      { label: "Categorías encontradas", value: agregado.length.toLocaleString("es-MX"), accent: "var(--c-verde-claro)", footnote: nombreDim },
    ].map(SNSP_indicatorCardHTML).join("");
  }

  function renderPasoResultado() {
    const informe = svc.generarInformeCalidad(estado.headers, estado.rows, estado.mapeo);
    document.getElementById("carga-informe-resumen").innerHTML = `
      <li><strong>${informe.resumen.total_filas.toLocaleString("es-MX")}</strong> filas · <strong>${informe.resumen.total_columnas}</strong> columnas totales</li>
      <li><strong>${informe.resumen.columnas_dimension}</strong> columna(s) marcada(s) como dimensión · <strong>${informe.resumen.columnas_medida}</strong> como medida</li>
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

    // Filtro dinámico: si hay una segunda dimensión, se usa como filtro real.
    const filtroWrap = document.getElementById("carga-filtro-wrap");
    if (estado.filtroColIdx !== null) {
      const valores = svc.valoresUnicos(estado.rows, estado.filtroColIdx, 300);
      filtroWrap.style.display = "";
      document.getElementById("carga-filtro-label").textContent = estado.headers[estado.filtroColIdx];
      document.getElementById("carga-filtro-valor").innerHTML =
        `<option value="">Todos</option>` + valores.map((v) => `<option value="${v}">${v}</option>`).join("");
    } else {
      filtroWrap.style.display = "none";
    }

    renderGraficaYTabla();
  }

  document.getElementById("btn-carga-cambiar-mapeo").addEventListener("click", () => mostrarPaso("mapeo"));
  document.getElementById("btn-carga-otro-archivo-resultado").addEventListener("click", () => {
    inputArchivo.value = "";
    destroyChart();
    mostrarPaso("subir");
  });
  document.getElementById("carga-filtro-valor").addEventListener("change", renderGraficaYTabla);

  document.getElementById("version-tag-module").textContent = window.SNSP_CONFIG.platform.version;
  mostrarPaso("subir");
}
