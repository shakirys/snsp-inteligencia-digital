/**
 * services/cargaDataService.js
 * -----------------------------------------------------------------------
 * CAPA DE SERVICIOS — PROTOTIPO DE CARGA DE ARCHIVOS (v2.5.0-prototipo)
 * Funciones puras (sin DOM, sin `window.SNSP_*_DATA` de ningún módulo
 * real) para parsear CSV, inferir tipos de columna, generar un informe
 * de calidad y agregar datos según un mapeo definido por el usuario.
 *
 * Este servicio es INDEPENDIENTE de CACU/Mama/Morbilidad/Población: no
 * lee ni escribe ninguna de sus fuentes, y no persiste nada (todo vive en
 * memoria de la pestaña del navegador). Es la base para, en una etapa
 * posterior, decidir si el resultado del mapeo se conecta a un backend
 * real (Supabase) o alimenta directamente un módulo existente.
 *
 * Contrato público (window.SNSP_CARGA_SERVICE):
 *   parseCSV(texto) -> { headers: string[], rows: string[][] }
 *   inferirColumnas(headers, rows) -> [{ index, nombre, tipo, vacios, unicos, muestra }]
 *   generarInformeCalidad(headers, rows, mapeo) -> { avisos: string[], resumen: {...} }
 *   agregar(rows, dimIdx, medidaIdx, filtro) -> { valor: number, categoria: string }[] (ordenado desc)
 *   valoresUnicos(rows, colIdx, limite) -> string[] (ordenado alfabético, para poblar un filtro)
 *   parseNumero(valor) -> number | null
 * -----------------------------------------------------------------------
 */
(function () {
  // ---- Parseo de CSV (sin dependencias externas) -----------------------
  // Soporta separador coma o punto y coma (detectado por la primera
  // línea), campos entre comillas dobles (con comas/saltos de línea
  // dentro) y comillas escapadas (""). No asume codificación: el llamador
  // decide cómo leyó el archivo (FileReader.readAsText detecta UTF-8/otros
  // razonablemente bien; ver limitaciones en pages/carga.html).
  function _detectarDelimitador(primeraLinea) {
    const comas = (primeraLinea.match(/,/g) || []).length;
    const puntoYComa = (primeraLinea.match(/;/g) || []).length;
    return puntoYComa > comas ? ";" : ",";
  }

  function parseCSV(texto) {
    if (!texto) return { headers: [], rows: [] };
    // Quita BOM si el archivo lo trae (común en exportes de Excel).
    if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
    const primeraLineaFin = texto.indexOf("\n");
    const primeraLinea = primeraLineaFin === -1 ? texto : texto.slice(0, primeraLineaFin);
    const delim = _detectarDelimitador(primeraLinea);

    const filas = [];
    let campo = "";
    let fila = [];
    let dentroComillas = false;
    let i = 0;
    const n = texto.length;

    function cerrarCampo() { fila.push(campo); campo = ""; }
    function cerrarFila() {
      cerrarCampo();
      // Ignora líneas completamente vacías (frecuentes al final del archivo).
      if (!(fila.length === 1 && fila[0] === "")) filas.push(fila);
      fila = [];
    }

    while (i < n) {
      const c = texto[i];
      if (dentroComillas) {
        if (c === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i += 2; continue; }
          dentroComillas = false; i += 1; continue;
        }
        campo += c; i += 1; continue;
      }
      if (c === '"') { dentroComillas = true; i += 1; continue; }
      if (c === delim) { cerrarCampo(); i += 1; continue; }
      if (c === "\r") { i += 1; continue; }
      if (c === "\n") { cerrarFila(); i += 1; continue; }
      campo += c; i += 1;
    }
    if (campo !== "" || fila.length) cerrarFila();

    if (!filas.length) return { headers: [], rows: [] };
    const headers = filas[0].map((h) => (h || "").trim());
    const rows = filas.slice(1).filter((r) => r.some((v) => (v || "").trim() !== ""));
    return { headers, rows };
  }

  // ---- Utilidades numéricas --------------------------------------------
  // Acepta "1,234.5", "1234,5" (coma decimal), "37%", espacios. Devuelve
  // null si no puede interpretarse como número (no se fuerza a 0: un dato
  // no numérico se excluye del agregado, nunca se simula).
  function parseNumero(valor) {
    if (valor === null || valor === undefined) return null;
    let s = String(valor).trim();
    if (s === "") return null;
    const esPorcentaje = s.endsWith("%");
    if (esPorcentaje) s = s.slice(0, -1).trim();
    // Miles con coma + decimal con punto (formato es-MX más común en estas bases).
    s = s.replace(/,/g, "");
    const n = Number(s);
    if (isNaN(n)) return null;
    return n;
  }

  // ---- Inferencia de columnas -------------------------------------------
  function inferirColumnas(headers, rows) {
    const muestraMax = 2000; // límite razonable para no recorrer millones de filas en el navegador
    const muestraRows = rows.slice(0, muestraMax);
    return headers.map((nombre, idx) => {
      let vacios = 0;
      let numericos = 0;
      const unicos = new Set();
      const muestraValores = [];
      muestraRows.forEach((r) => {
        const v = (r[idx] === undefined ? "" : String(r[idx])).trim();
        if (v === "") { vacios += 1; return; }
        unicos.add(v);
        if (parseNumero(v) !== null) numericos += 1;
        if (muestraValores.length < 4 && !muestraValores.includes(v)) muestraValores.push(v);
      });
      const conValor = muestraRows.length - vacios;
      const tipo = conValor > 0 && numericos / conValor >= 0.9 ? "numero" : "texto";
      return {
        index: idx,
        nombre: nombre || `Columna ${idx + 1}`,
        tipo,
        vacios,
        unicos: unicos.size,
        muestra: muestraValores,
      };
    });
  }

  // ---- Informe de calidad -------------------------------------------
  // mapeo: { [colIndex]: { rol: "dimension" | "medida" | "ignorar" } }
  function generarInformeCalidad(headers, rows, mapeo) {
    const avisos = [];
    const dimensiones = Object.keys(mapeo).filter((k) => mapeo[k].rol === "dimension").map(Number);
    const medidas = Object.keys(mapeo).filter((k) => mapeo[k].rol === "medida").map(Number);

    if (!dimensiones.length) {
      avisos.push("No se marcó ninguna columna como categoría (dimensión): asigna al menos una para poder agrupar los datos.");
    }
    if (!medidas.length) {
      avisos.push("No se marcó ninguna columna numérica como medida: se usará el conteo de filas como valor de cada categoría.");
    }

    medidas.forEach((idx) => {
      let noNumericos = 0;
      rows.forEach((r) => { if (parseNumero(r[idx]) === null && String(r[idx] || "").trim() !== "") noNumericos += 1; });
      if (noNumericos > 0) {
        avisos.push(`La columna "${headers[idx]}" tiene ${noNumericos.toLocaleString("es-MX")} valor(es) que no pudieron leerse como número; esas filas se excluyen sólo de esa medida, no del resto del archivo.`);
      }
    });

    dimensiones.forEach((idx) => {
      let vacios = 0;
      rows.forEach((r) => { if (String(r[idx] || "").trim() === "") vacios += 1; });
      if (vacios > 0) {
        avisos.push(`La columna "${headers[idx]}" tiene ${vacios.toLocaleString("es-MX")} fila(s) sin valor; se agrupan como "(vacío)" en vez de excluirse.`);
      }
    });

    // Filas duplicadas exactas: informativo, no error (mismo criterio que
    // las bases reales de CACU/Mama: con pocas columnas categóricas, los
    // duplicados son normales).
    const vistos = new Set();
    let duplicadas = 0;
    rows.forEach((r) => {
      const key = r.join("\u0001");
      if (vistos.has(key)) duplicadas += 1; else vistos.add(key);
    });
    const pctDuplicadas = rows.length ? Math.round((duplicadas / rows.length) * 1000) / 10 : 0;

    return {
      avisos,
      resumen: {
        total_filas: rows.length,
        total_columnas: headers.length,
        columnas_dimension: dimensiones.length,
        columnas_medida: medidas.length,
        filas_duplicadas: duplicadas,
        pct_duplicadas: pctDuplicadas,
      },
    };
  }

  // ---- Agregación --------------------------------------------------
  // dimIdx: índice de columna para agrupar. medidaIdx: índice de columna
  // numérica a sumar, o null para contar filas. filtro: { colIdx, valor }
  // opcional, aplicado antes de agrupar.
  function agregar(rows, dimIdx, medidaIdx, filtro) {
    const contador = {};
    rows.forEach((r) => {
      if (filtro && filtro.colIdx !== null && filtro.colIdx !== undefined && filtro.valor) {
        const v = String(r[filtro.colIdx] === undefined ? "" : r[filtro.colIdx]).trim();
        if (v !== filtro.valor) return;
      }
      let key = String(r[dimIdx] === undefined ? "" : r[dimIdx]).trim();
      if (!key) key = "(vacío)";
      let val = 1;
      if (medidaIdx !== null && medidaIdx !== undefined) {
        const n = parseNumero(r[medidaIdx]);
        if (n === null) return;
        val = n;
      }
      contador[key] = (contador[key] || 0) + val;
    });
    return Object.entries(contador)
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor);
  }

  function valoresUnicos(rows, colIdx, limite) {
    const set = new Set();
    rows.forEach((r) => {
      const v = String(r[colIdx] === undefined ? "" : r[colIdx]).trim();
      if (v) set.add(v);
    });
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
    return limite ? arr.slice(0, limite) : arr;
  }

  window.SNSP_CARGA_SERVICE = {
    parseCSV,
    inferirColumnas,
    generarInformeCalidad,
    agregar,
    valoresUnicos,
    parseNumero,
  };
})();
