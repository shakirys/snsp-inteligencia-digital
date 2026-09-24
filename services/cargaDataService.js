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
 *   inferirColumnas(headers, rows) -> [{ index, nombre, tipo, vacios, unicos, muestra, pareceCodigo, motivoCodigo }]
 *   generarInformeCalidad(headers, rows, mapeo) -> { avisos: string[], resumen: {...} }
 *   agregar(rows, dimIdx, medidaIdx, filtros) -> { valor: number, categoria: string }[] (ordenado desc)
 *     filtros: null, {colIdx, valor} (un filtro) o [{colIdx, valor}, ...] (varios, combinados con AND;
 *     cada uno se ignora si valor es vacío/undefined, equivalente a "Todos" para esa columna)
 *   valoresUnicos(rows, colIdx, limite) -> string[] (ordenado alfabético, para poblar un filtro)
 *   parseNumero(valor) -> number | null
 *
 * v2.6.0-prototipo: inferirColumnas ahora también detecta columnas
 * numéricas que en realidad se comportan como código/categoría (año,
 * semana, mes, clave, folio, id, o un entero con muy pocos valores
 * distintos) para que el mapeo NO las proponga por defecto como Medida
 * (ver "pareceCodigo" más abajo) — motivado por bases reales donde una
 * columna "Año" (2025/2026) se sumaba por error. agregar() ahora acepta
 * varios filtros simultáneos en vez de uno solo.
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

  // ---- Detección de columnas "código/categoría" disfrazadas de número ---
  // Motivo: una columna como "Año" (2025, 2026) o "Semana" (01, 02...) pasa
  // la prueba de "90% de valores numéricos" y por eso hoy se propone como
  // Medida por defecto — pero sumarla nunca tiene sentido. Se detecta por
  // el NOMBRE de la columna (patrón conocido: año, semana, mes, clave,
  // folio, código, id) o porque TODOS sus valores caen en un rango típico
  // de año (1900-2100). Deliberadamente NO se usa un criterio genérico de
  // "pocos valores distintos" para columnas numéricas: una medida real
  // como "Casos" también puede tener pocos valores distintos (1, 2, 3…) en
  // bases donde cada fila ya viene desagregada, y marcarla por error como
  // código le quitaría el default correcto de Medida. Es sólo una
  // sugerencia: la columna sigue siendo 100% editable como Medida si el
  // usuario de verdad lo necesita.
  // "esAnio" es un sub-caso de "pareceCodigo": específicamente una columna
  // de AÑO (por nombre o porque sus valores caen en rango de año), que en
  // el mapeo habilita el selector múltiple de comparación entre años. Las
  // demás columnas "código" (semana, mes, clave, folio, id) NO activan
  // ese selector — sólo quedan sugeridas como Dimensión, igual que antes.
  const RE_NOMBRE_ANIO = /(añ|ano|year)/i;
  const RE_NOMBRE_CODIGO = /(semana|mes\b|clave|cve\b|folio|c[oó]digo|\bid\b)/i;

  function _pareceCodigo(nombre, valoresNumericos) {
    if (RE_NOMBRE_ANIO.test(nombre || "")) {
      return { pareceCodigo: true, motivoCodigo: "nombre-columna", esAnio: true };
    }
    if (RE_NOMBRE_CODIGO.test(nombre || "")) {
      return { pareceCodigo: true, motivoCodigo: "nombre-columna", esAnio: false };
    }
    if (!valoresNumericos.length) return { pareceCodigo: false, motivoCodigo: null, esAnio: false };
    const todosEnteros = valoresNumericos.every((n) => Number.isInteger(n));
    if (!todosEnteros) return { pareceCodigo: false, motivoCodigo: null, esAnio: false };
    // Años típicos (rango amplio a propósito, incluye ciclos/cohortes).
    const pareceAnio = valoresNumericos.every((n) => n >= 1900 && n <= 2100);
    if (pareceAnio) return { pareceCodigo: true, motivoCodigo: "rango-anio", esAnio: true };
    return { pareceCodigo: false, motivoCodigo: null, esAnio: false };
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
      const valoresNumericos = [];
      muestraRows.forEach((r) => {
        const v = (r[idx] === undefined ? "" : String(r[idx])).trim();
        if (v === "") { vacios += 1; return; }
        unicos.add(v);
        const n = parseNumero(v);
        if (n !== null) { numericos += 1; valoresNumericos.push(n); }
        if (muestraValores.length < 4 && !muestraValores.includes(v)) muestraValores.push(v);
      });
      const conValor = muestraRows.length - vacios;
      const tipo = conValor > 0 && numericos / conValor >= 0.9 ? "numero" : "texto";
      const codigo = tipo === "numero"
        ? _pareceCodigo(nombre, valoresNumericos)
        : { pareceCodigo: false, motivoCodigo: null, esAnio: false };
      return {
        index: idx,
        nombre: nombre || `Columna ${idx + 1}`,
        tipo,
        vacios,
        unicos: unicos.size,
        muestra: muestraValores,
        pareceCodigo: codigo.pareceCodigo,
        motivoCodigo: codigo.motivoCodigo,
        esAnio: !!codigo.esAnio,
      };
    });
  }

  // ---- Informe de calidad -------------------------------------------
  // mapeo: { [colIndex]: { rol: "dimension" | "medida" | "filtro" | "ignorar" } }
  // columnasInfo (opcional): resultado de inferirColumnas(), usado sólo
  // para avisar si una columna "código/categoría" (ver pareceCodigo) quedó
  // marcada como Medida.
  function generarInformeCalidad(headers, rows, mapeo, columnasInfo) {
    const avisos = [];
    const dimensiones = Object.keys(mapeo).filter((k) => mapeo[k].rol === "dimension").map(Number);
    const medidas = Object.keys(mapeo).filter((k) => mapeo[k].rol === "medida").map(Number);
    const filtros = Object.keys(mapeo).filter((k) => mapeo[k].rol === "filtro").map(Number);

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
      const info = (columnasInfo || []).find((c) => c.index === idx);
      if (info && info.pareceCodigo) {
        avisos.push(`La columna "${headers[idx]}" parece un código o categoría (por ejemplo año, semana o clave), no una cantidad — confirma que de verdad quieres sumarla como medida.`);
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
        columnas_filtro: filtros.length,
        filas_duplicadas: duplicadas,
        pct_duplicadas: pctDuplicadas,
      },
    };
  }

  // ---- Agregación --------------------------------------------------
  // dimIdx: índice de columna para agrupar. medidaIdx: índice de columna
  // numérica a sumar, o null para contar filas. filtros: opcional — null,
  // un solo {colIdx, valor}, o un arreglo [{colIdx, valor}, ...] aplicados
  // ANTES de agrupar y combinados con AND (una fila debe cumplir TODOS los
  // filtros con valor no vacío para contarse). Un filtro con valor vacío
  // equivale a "Todos" para esa columna y se ignora.
  function agregar(rows, dimIdx, medidaIdx, filtros) {
    const listaFiltros = (Array.isArray(filtros) ? filtros : (filtros ? [filtros] : []))
      .filter((f) => f && f.colIdx !== null && f.colIdx !== undefined && f.valor);
    const contador = {};
    rows.forEach((r) => {
      for (let i = 0; i < listaFiltros.length; i++) {
        const f = listaFiltros[i];
        const v = String(r[f.colIdx] === undefined ? "" : r[f.colIdx]).trim();
        if (v !== f.valor) return;
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

  // ---- Agregación comparativa (varios años en la misma gráfica) --------
  // Reutiliza agregar(): por cada valor de valoresComparar (típicamente
  // años, p. ej. ["2025","2026"]) agrega por separado agregando la
  // columna de comparación como un filtro más, y luego junta los
  // resultados por categoría. rows/dimIdx/medidaIdx: igual que agregar().
  // filtrosBase: los filtros normales YA activos (sin incluir la columna
  // de comparación — esa se agrega internamente, un valor a la vez).
  // colComparar: índice de columna a comparar (p. ej. la columna Año).
  // valoresComparar: arreglo de 2+ valores a comparar.
  // Devuelve [{ categoria, valores: {"2025": n, "2026": m}, total }],
  // ordenado por total (suma de todos los valores comparados) desc. Una
  // categoría que no tiene filas en alguno de los valores comparados
  // simplemente no trae esa llave en "valores" (no se inventa un 0 — quien
  // llama decide si mostrar 0 o "—").
  function agregarComparativo(rows, dimIdx, medidaIdx, filtrosBase, colComparar, valoresComparar) {
    const base = Array.isArray(filtrosBase) ? filtrosBase : (filtrosBase ? [filtrosBase] : []);
    const categorias = new Map();
    valoresComparar.forEach((valorComparar) => {
      const filtrosCompletos = base.concat([{ colIdx: colComparar, valor: valorComparar }]);
      const parcial = agregar(rows, dimIdx, medidaIdx, filtrosCompletos);
      parcial.forEach((r) => {
        if (!categorias.has(r.categoria)) categorias.set(r.categoria, {});
        categorias.get(r.categoria)[valorComparar] = r.valor;
      });
    });
    const resultado = Array.from(categorias.entries()).map(([categoria, valores]) => {
      let total = 0;
      valoresComparar.forEach((v) => { total += valores[v] || 0; });
      return { categoria, valores, total };
    });
    resultado.sort((a, b) => b.total - a.total);
    return resultado;
  }

  // ---- Relacionar Casos + Población (ACT06 — Parte 2) -------------------
  // Objetivo: permitir analizar "Casos", "Población" o "Tasa" (Casos /
  // Población * 100,000) relacionando el archivo principal (p. ej.
  // BASE_CASOS) con un archivo de población (p. ej. BASE_POBLACION) por
  // Año + Municipio + Grupo de edad, SIN duplicar población: el archivo de
  // Casos normalmente trae varias filas por cada combinación de
  // Año+Municipio+Grupo de edad (una por Padecimiento, Sexo, Institución,
  // semana…), así que sumar la población "por fila de Casos" la
  // multiplicaría por error. La solución: para cada categoría de la
  // gráfica se junta el conjunto de combinaciones ÚNICAS de
  // Año+Municipio+Grupo de edad que aparecen en las filas de Casos ya
  // filtradas (un Set, no una lista) y sólo con ese conjunto se suma la
  // población — cada combinación cuenta una sola vez sin importar cuántas
  // filas de Casos comparta.

  function _normalizarNombreCol(s) {
    return String(s === undefined || s === null ? "" : s)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().trim();
  }

  // Detecta, por el NOMBRE del encabezado (sin acentos/mayúsculas), los
  // índices de las columnas Año / Municipio / Grupo de edad (y Población,
  // si aplica) — reutilizable tanto para el archivo de Casos (no trae
  // columna Población) como para el de Población. Devuelve -1 para la que
  // no se encuentre; no asume un orden ni un nombre exacto de columna.
  function detectarColumnasClave(headers) {
    let colAnio = -1, colMunicipio = -1, colGrupoEdad = -1, colPoblacion = -1;
    (headers || []).forEach((h, i) => {
      const n = _normalizarNombreCol(h);
      if (colAnio === -1 && /(^|[^a-z])(ano|anio|year)([^a-z]|$)/.test(n)) colAnio = i;
      if (colMunicipio === -1 && n.includes("municipio")) colMunicipio = i;
      if (colGrupoEdad === -1 && n.includes("edad")) colGrupoEdad = i;
      if (colPoblacion === -1 && n.includes("poblac")) colPoblacion = i;
    });
    return { colAnio, colMunicipio, colGrupoEdad, colPoblacion };
  }

  function _llaveJoin(anio, municipio, grupoEdad) {
    return anio + "\u0001" + municipio + "\u0001" + grupoEdad;
  }

  // Construye el índice de población: { completo, columnas, mapa } donde
  // mapa es un Map "Año\u0001Municipio\u0001GrupoEdad" -> número de
  // habitantes. "completo" indica si las 4 columnas necesarias (Año,
  // Municipio, Grupo de edad, Población) se encontraron en el archivo; si
  // no, mapa queda vacío y el llamador debe deshabilitar Población/Tasa
  // (nunca se inventa una relación con columnas adivinadas a medias).
  function indexarPoblacion(headers, rows) {
    const columnas = detectarColumnasClave(headers);
    const completo = columnas.colAnio !== -1 && columnas.colMunicipio !== -1 &&
      columnas.colGrupoEdad !== -1 && columnas.colPoblacion !== -1;
    const mapa = new Map();
    if (completo) {
      (rows || []).forEach((r) => {
        const anio = String(r[columnas.colAnio] === undefined ? "" : r[columnas.colAnio]).trim();
        const municipio = String(r[columnas.colMunicipio] === undefined ? "" : r[columnas.colMunicipio]).trim();
        const grupoEdad = String(r[columnas.colGrupoEdad] === undefined ? "" : r[columnas.colGrupoEdad]).trim();
        const pob = parseNumero(r[columnas.colPoblacion]);
        if (!anio || !municipio || !grupoEdad || pob === null) return;
        const llave = _llaveJoin(anio, municipio, grupoEdad);
        // Suma defensiva: si el archivo de población trajera más de una
        // fila por la misma llave (p. ej. desagregada por sexo), se suman
        // — pero esto es sobre el ARCHIVO DE POBLACIÓN, no sobre filas de
        // Casos, así que no relaciona con el problema de duplicación que
        // resuelve agregarConPoblacion() más abajo.
        mapa.set(llave, (mapa.get(llave) || 0) + pob);
      });
    }
    return { completo, columnas, mapa };
  }

  // Igual que agregar(), pero además calcula población y tasa por
  // categoría sin duplicar población. rows/dimIdx/medidaIdx/filtros: igual
  // que agregar(). joinColsCasos: { colAnio, colMunicipio, colGrupoEdad }
  // (índices dentro de ESTAS filas, ver detectarColumnasClave). poblacionMapa:
  // el Map de indexarPoblacion(...).mapa. Devuelve
  // [{ categoria, valorCasos, poblacion, tasa }] (sin ordenar — el
  // llamador decide por cuál campo ordenar según qué esté analizando).
  // poblacion/tasa quedan en null cuando ninguna combinación
  // Año+Municipio+Grupo de edad de esa categoría tiene población conocida
  // (nunca se inventa 0 de población real).
  function agregarConPoblacion(rows, dimIdx, medidaIdx, filtros, joinColsCasos, poblacionMapa) {
    const listaFiltros = (Array.isArray(filtros) ? filtros : (filtros ? [filtros] : []))
      .filter((f) => f && f.colIdx !== null && f.colIdx !== undefined && f.valor);
    const hayJoin = joinColsCasos && joinColsCasos.colAnio !== -1 &&
      joinColsCasos.colMunicipio !== -1 && joinColsCasos.colGrupoEdad !== -1;
    const casos = {};
    const triples = {}; // categoria -> Set de llaves Año+Municipio+GrupoEdad YA VISTAS (evita sumar población de más)
    rows.forEach((r) => {
      for (let i = 0; i < listaFiltros.length; i++) {
        const f = listaFiltros[i];
        const v = String(r[f.colIdx] === undefined ? "" : r[f.colIdx]).trim();
        if (v !== f.valor) return;
      }
      let key = String(r[dimIdx] === undefined ? "" : r[dimIdx]).trim();
      if (!key) key = "(vacío)";
      let val = 1;
      if (medidaIdx !== null && medidaIdx !== undefined) {
        const n = parseNumero(r[medidaIdx]);
        if (n === null) return;
        val = n;
      }
      casos[key] = (casos[key] || 0) + val;

      if (hayJoin) {
        const anio = String(r[joinColsCasos.colAnio] === undefined ? "" : r[joinColsCasos.colAnio]).trim();
        const municipio = String(r[joinColsCasos.colMunicipio] === undefined ? "" : r[joinColsCasos.colMunicipio]).trim();
        const grupoEdad = String(r[joinColsCasos.colGrupoEdad] === undefined ? "" : r[joinColsCasos.colGrupoEdad]).trim();
        if (anio && municipio && grupoEdad) {
          if (!triples[key]) triples[key] = new Set();
          triples[key].add(_llaveJoin(anio, municipio, grupoEdad));
        }
      }
    });

    return Object.keys(casos).map((categoria) => {
      let poblacion = null;
      if (hayJoin && poblacionMapa && triples[categoria]) {
        let suma = 0, encontrados = 0;
        triples[categoria].forEach((llave) => {
          const p = poblacionMapa.get(llave);
          if (p !== undefined) { suma += p; encontrados += 1; }
        });
        poblacion = encontrados > 0 ? suma : null;
      }
      const valorCasos = casos[categoria];
      const tasa = (poblacion && poblacion > 0) ? (valorCasos / poblacion) * 100000 : null;
      return { categoria, valorCasos, poblacion, tasa };
    });
  }

  // Versión "con población" de agregarComparativo(): por cada valor de
  // valoresComparar (años) llama agregarConPoblacion() por separado (así
  // la población de cada año se relaciona con las filas de ESE año, nunca
  // mezclada entre años) y junta los resultados por categoría. Devuelve
  // [{ categoria, valores: { "2025": {valorCasos, poblacion, tasa}, ... } }].
  function agregarComparativoConPoblacion(rows, dimIdx, medidaIdx, filtrosBase, colComparar, valoresComparar, joinColsCasos, poblacionMapa) {
    const base = Array.isArray(filtrosBase) ? filtrosBase : (filtrosBase ? [filtrosBase] : []);
    const categorias = new Map();
    valoresComparar.forEach((valorComparar) => {
      const filtrosCompletos = base.concat([{ colIdx: colComparar, valor: valorComparar }]);
      const parcial = agregarConPoblacion(rows, dimIdx, medidaIdx, filtrosCompletos, joinColsCasos, poblacionMapa);
      parcial.forEach((r) => {
        if (!categorias.has(r.categoria)) categorias.set(r.categoria, {});
        categorias.get(r.categoria)[valorComparar] = { valorCasos: r.valorCasos, poblacion: r.poblacion, tasa: r.tasa };
      });
    });
    return Array.from(categorias.entries()).map(([categoria, valores]) => ({ categoria, valores }));
  }

  window.SNSP_CARGA_SERVICE = {
    parseCSV,
    inferirColumnas,
    generarInformeCalidad,
    agregar,
    agregarComparativo,
    valoresUnicos,
    parseNumero,
    detectarColumnasClave,
    indexarPoblacion,
    agregarConPoblacion,
    agregarComparativoConPoblacion,
  };
})();
