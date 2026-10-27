/**
 * components/charts.js
 * -----------------------------------------------------------------------
 * Envoltura sobre Chart.js para que todas las gráficas (barras, líneas,
 * dona) usen automáticamente la paleta y tipografía institucional, SIN
 * que cada módulo tenga que repetir configuración de color, formato de
 * números o títulos.
 * Requiere Chart.js cargado por CDN antes de este archivo (el bundle UMD
 * completo, que ya incluye los plugins Title/Subtitle/Legend/Tooltip).
 *
 * -----------------------------------------------------------------------
 * ESTÁNDAR DE VISUALIZACIÓN DE LA PLATAFORMA (v2.2.0)
 * -----------------------------------------------------------------------
 * Este archivo es la ÚNICA fuente de verdad para:
 *   1. Etiquetas numéricas visibles sobre cada gráfica (sin necesidad de
 *      pasar el cursor), con separador de miles y porcentajes.
 *   2. Títulos y subtítulos dinámicos ("[Indicador] por [dimensión], de
 *      [padecimiento], en [lugar], durante [periodo]"), que se recalculan
 *      cada vez que un módulo vuelve a llamar a estas funciones (p. ej.
 *      al aplicar/quitar filtros, ya que los módulos destruyen y vuelven
 *      a crear sus gráficas en cada render).
 * Ningún módulo debe reimplementar este comportamiento por su cuenta: los
 * módulos sólo indican QUÉ se está mostrando (indicador, dimensión,
 * padecimiento, lugar, periodo) y este archivo se encarga del CÓMO
 * (formato, posición de etiquetas, ajuste de línea, colores). Así,
 * cualquier gráfica nueva (dengue, mortalidad, etc.) hereda el estándar
 * automáticamente con sólo usar SNSP_renderBarChart / _LineChart /
 * _GroupedBarChart / _Doughnut.
 * -----------------------------------------------------------------------
 */

/* =========================================================
   FORMATO DE NÚMEROS Y TEXTO — funciones puras, reutilizables
   ========================================================= */

function SNSP_formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return "0";
  return Number(n).toLocaleString("es-MX");
}

function SNSP_formatPercent(n, decimals) {
  if (n === null || n === undefined || isNaN(n)) return "0%";
  const d = decimals === undefined ? 1 : decimals;
  return Number(n).toFixed(d) + "%";
}

// Ajusta un texto largo a varias líneas sin cortar palabras ni usar "…".
// Devuelve un arreglo de líneas (Chart.js acepta `text` como arreglo para
// títulos de más de un renglón).
function SNSP_wrapLabel(text, maxCharsPerLine) {
  if (!text) return [""];
  const max = maxCharsPerLine || 56;
  const words = String(text).split(" ");
  const lines = [];
  let current = "";
  words.forEach((w) => {
    const candidate = current ? current + " " + w : w;
    if (candidate.length > max && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function _snspCapitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function _snspStripArticle(s) {
  return (s || "").replace(/^(el|la|los|las)\s+/i, "");
}

/**
 * Construye {title, subtitle} siguiendo el estándar de la plataforma:
 * "[Indicador] por [dimensión], de [padecimiento], en [lugar], durante
 * [periodo]". Si el resultado es demasiado largo para una sola línea de
 * título, se reparte automáticamente en título + subtítulo (padecimiento
 * | lugar | periodo). Cada módulo sólo aporta las piezas semánticas; este
 * archivo decide el formato final.
 *
 * parts: {
 *   indicador,      // p.ej. "Casos registrados", "Pruebas registradas"
 *   dimension,       // p.ej. "municipio", "jurisdicción sanitaria"
 *   padecimiento,    // p.ej. "C50 — Tumor maligno de la mama" | programa | null
 *   lugar,           // p.ej. "el estado de Querétaro", "el municipio de Tolimán"
 *   periodo,         // p.ej. "2025", "el periodo 2024–2026"
 * }
 */
function SNSP_tituloGrafica(parts) {
  parts = parts || {};
  const indicador = parts.indicador || "Casos registrados";
  const dimension = parts.dimension || null;
  const padecimiento = parts.padecimiento || null;
  const lugar = parts.lugar || "el ámbito de los datos disponibles";
  const periodo = parts.periodo || "el periodo disponible";

  let full = indicador;
  if (dimension) full += " por " + dimension;
  if (padecimiento) full += ", de " + padecimiento;
  full += ", en " + lugar + ", durante " + periodo;
  full = _snspCapitalize(full);

  const lugarCorto = _snspCapitalize(_snspStripArticle(lugar));
  const periodoCorto = _snspCapitalize(periodo.replace(/^el\s+/i, ""));

  if (full.length <= 78) {
    return { title: SNSP_wrapLabel(full, 58), subtitle: null };
  }

  const titleCorto = _snspCapitalize(indicador + (dimension ? " por " + dimension : ""));
  const subtitleParts = [];
  if (padecimiento) subtitleParts.push(padecimiento);
  subtitleParts.push(lugarCorto);
  subtitleParts.push(periodoCorto);
  return { title: SNSP_wrapLabel(titleCorto, 58), subtitle: subtitleParts.join("  |  ") };
}

/* =========================================================
   PLUGIN INTERNO — etiquetas numéricas sobre cada gráfica
   (equivalente ligero a chartjs-plugin-datalabels, sin agregar
   una dependencia externa nueva: se registra una sola vez aquí)
   ========================================================= */

var SNSP_CHART_LABEL_SKIPS = []; // se llena en cada render con avisos de legibilidad (ver renderAll de cada módulo / resumen de entrega)

function _snspLabelFont(count, overridePx, overrideWeight) {
  // overridePx: tamaño fijo OPCIONAL (número o "Npx"), retrocompatible — si
  // no se pasa, se usa exactamente la heurística de siempre por número de
  // categorías (ver morbilidadModuleView.js, paneles mensuales: lo usan
  // para reducir el tamaño cuando además hay varias series por categoría,
  // algo que esta heurística por sí sola no contempla).
  // overrideWeight (ACT14): grosor de fuente OPCIONAL ("400" = sin
  // negrita), también retrocompatible — sin pasarlo, se mantiene "600"
  // (semi-negrita) exactamente igual que siempre en todos los demás
  // llamadores.
  const weight = overrideWeight || "600";
  if (overridePx) {
    const px = typeof overridePx === "number" ? overridePx : parseInt(overridePx, 10);
    return `${weight} ${px}px`;
  }
  if (count <= 8) return `${weight} 13px`;
  if (count <= 16) return `${weight} 12px`;
  return `${weight} 10px`;
}

var SNSP_VALUE_LABELS_PLUGIN = {
  id: "snspValueLabels",
  afterDatasetsDraw: function (chart) {
    const cfg = chart.options.plugins && chart.options.plugins.snspValueLabels;
    if (!cfg || cfg.enabled === false) return;
    const ctx = chart.ctx;
    const cs = getComputedStyle(document.documentElement);
    const fontFamily = cs.getPropertyValue("--font-mono").trim() || "monospace";
    const textColor = cs.getPropertyValue("--text-primary").trim() || "#22201D";
    const formatter = cfg.formatter || SNSP_formatNumber;
    const categoryCount = (chart.data.labels || []).length;
    const fontSize = _snspLabelFont(categoryCount, cfg.fontSize, cfg.fontWeight);
    const fontPxMatch = String(fontSize).match(/(\d+)px/);
    const fontPx = fontPxMatch ? parseInt(fontPxMatch[1], 10) : 11;
    const alturaTexto = fontPx + 4; // alto aproximado de una línea de etiqueta, para el control de colisiones

    ctx.save();
    ctx.fillStyle = textColor;
    ctx.font = fontSize + " " + fontFamily;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // ---------------------------------------------------------------
    // ACT24 — control de colisiones entre etiquetas: cada etiqueta que
    // se dibuja (de barra o de línea) registra aquí su recuadro
    // aproximado (medido con el ancho real del texto, no sólo el
    // grosor de la barra); antes de dibujar la siguiente se revisa que
    // no se encime con ninguna ya colocada en ESTA gráfica. Cuando de
    // verdad no hay forma de acomodarla sin encimarse, se omite esa
    // etiqueta puntual (el valor exacto sigue disponible en el tooltip
    // y, en las secciones que incluyen tabla, en la tabla) en vez de
    // mostrar texto ilegible o traslapado — independientemente de
    // cuántas series/años estén seleccionados.
    // ---------------------------------------------------------------
    const colocadas = [];
    function _solapan(a, b, pad) {
      pad = pad === undefined ? 1 : pad;
      return !(a.right + pad < b.left || b.right + pad < a.left || a.bottom + pad < b.top || b.bottom + pad < a.top);
    }
    function _cabe(bbox) {
      return !colocadas.some((o) => _solapan(bbox, o));
    }
    function _bboxCentro(x, y, texto) {
      const w = ctx.measureText(texto).width;
      return { left: x - w / 2 - 2, right: x + w / 2 + 2, top: y - alturaTexto / 2, bottom: y + alturaTexto / 2 };
    }
    function _bboxIzquierda(x, y, texto) {
      const w = ctx.measureText(texto).width;
      return { left: x - 2, right: x + w + 4, top: y - alturaTexto / 2, bottom: y + alturaTexto / 2 };
    }
    function _bboxDerecha(x, y, texto) {
      const w = ctx.measureText(texto).width;
      return { left: x - w - 4, right: x + 2, top: y - alturaTexto / 2, bottom: y + alturaTexto / 2 };
    }

    // ---- Dona: sin cambios (las etiquetas van dentro de cada rebanada,
    // no compiten por espacio entre sí del mismo modo que barras/líneas) ----
    chart.data.datasets.forEach((dataset, dsIndex) => {
      const meta = chart.getDatasetMeta(dsIndex);
      if (!meta || meta.hidden) return;
      const isDoughnut = meta.type === "doughnut" || meta.type === "pie";
      if (!isDoughnut) return;
      const total = dataset.data.reduce((a, b) => a + (b || 0), 0);
      meta.data.forEach((arc, i) => {
        const raw = dataset.data[i];
        if (!raw || !total) return;
        const pct = (raw / total) * 100;
        // Slices angulares muy pequeños no llevan etiqueta: la leyenda
        // (ya enriquecida con valor y %) cumple esa función — ver
        // SNSP_renderDoughnut. Evita texto ilegible amontonado.
        const angulo = arc.endAngle - arc.startAngle;
        if (angulo < 0.26) return;
        const mid = (arc.startAngle + arc.endAngle) / 2;
        const r = arc.innerRadius + (arc.outerRadius - arc.innerRadius) * 0.62;
        const x = arc.x + Math.cos(mid) * r;
        const y = arc.y + Math.sin(mid) * r;
        ctx.fillStyle = "#FBF8F1";
        ctx.fillText(SNSP_formatPercent(pct), x, y);
        ctx.fillStyle = textColor;
      });
    });

    // ---- Barras (una pasada por dataset, en el orden de siempre) ----
    chart.data.datasets.forEach((dataset, dsIndex) => {
      const meta = chart.getDatasetMeta(dsIndex);
      if (!meta || meta.hidden || meta.type !== "bar") return;

      meta.data.forEach((el, i) => {
        const raw = dataset.data[i];
        if (raw === null || raw === undefined) return;
        if (cfg.skipZero && !raw) return;
        // Defensivo: un formatter opcional inválido (o que lance una
        // excepción con algún valor atípico del motor real de Chart.js)
        // nunca debe romper el dibujado de la gráfica completa — cae al
        // formateador numérico de siempre en vez de propagar el error.
        let label;
        try {
          label = typeof formatter === "function" ? formatter(raw, dataset, i) : SNSP_formatNumber(raw);
        } catch (e) {
          label = SNSP_formatNumber(raw);
        }

        const horizontal = chart.options.indexAxis === "y";
        // Evita amontonar etiquetas cuando la barra es demasiado
        // angosta para el texto (muchas categorías a la vez): se omite
        // esa etiqueta puntual en vez de superponerla. Ver aviso de
        // legibilidad en la entrega.
        const grosor = horizontal ? el.height : el.width;
        if (grosor && grosor < 9) {
          SNSP_CHART_LABEL_SKIPS.push(chart.canvas.id);
          return;
        }

        const x = horizontal ? el.x + 6 : el.x;
        const y = horizontal ? el.y : el.y - 10;
        const bbox = horizontal ? _bboxIzquierda(x, y, label) : _bboxCentro(x, y, label);
        // ACT24: además del grosor de la barra, ahora se revisa el ancho
        // REAL del texto contra las etiquetas vecinas ya colocadas (p. ej.
        // barras agrupadas muy juntas, como "Comparativo por mes y año"
        // con varios años) — si de verdad no caben una junto a otra sin
        // encimarse, se omite en vez de traslaparlas.
        if (!_cabe(bbox)) {
          SNSP_CHART_LABEL_SKIPS.push(chart.canvas.id);
          return;
        }
        ctx.textAlign = horizontal ? "left" : "center";
        ctx.fillText(label, x, y);
        colocadas.push(bbox);
      });
    });

    // ---- Líneas: una pasada por COLUMNA (mismo mes/x), no por dataset,
    // para poder acomodar entre sí las etiquetas de las distintas series
    // que comparten esa columna — antes cada serie usaba un desplazamiento
    // vertical fijo por índice de dataset, lo que seguía encimándose en
    // cuanto había 3+ años seleccionados o valores cercanos entre sí
    // (p. ej. "Tendencia por año/mes" con 2022-2026). Ahora se calcula la
    // posición en pantalla real de cada punto, se ordenan de abajo hacia
    // arriba y cada etiqueta se acomoda lo más cerca posible de su propio
    // punto sin encimarse con la que ya quedó fija justo debajo; si de
    // verdad no cabe sin encimarse o sin alejarse demasiado de su punto,
    // se omite (el valor exacto sigue disponible en el tooltip y en la
    // tabla de la sección).
    const datasetsLinea = [];
    chart.data.datasets.forEach((dataset, dsIndex) => {
      const meta = chart.getDatasetMeta(dsIndex);
      if (meta && !meta.hidden && meta.type === "line") datasetsLinea.push({ dataset, dsIndex, meta });
    });
    if (datasetsLinea.length) {
      const nPuntos = datasetsLinea.reduce((m, d) => Math.max(m, d.meta.data.length), 0);
      if (nPuntos <= 20) { // misma regla de siempre: demasiados puntos → sólo tooltip
        for (let i = 0; i < nPuntos; i++) {
          const candidatos = datasetsLinea.map(({ dataset, meta }) => {
            const el = meta.data[i];
            const raw = dataset.data[i];
            if (!el || raw === null || raw === undefined) return null;
            if (cfg.skipZero && !raw) return null;
            let label;
            try {
              label = typeof formatter === "function" ? formatter(raw, dataset, i) : SNSP_formatNumber(raw);
            } catch (e) {
              label = SNSP_formatNumber(raw);
            }
            return { x: el.x, yPunto: el.y, label };
          }).filter(Boolean);
          if (!candidatos.length) continue;

          // De abajo hacia arriba en pantalla (Y mayor primero): así cada
          // etiqueta sólo tiene que evitar la que ya quedó fija justo
          // debajo de ella (y cualquier otra ya colocada en la gráfica).
          candidatos.sort((a, b) => b.yPunto - a.yPunto);
          // ACT24 — límites del área de graficado: una etiqueta centrada en
          // la PRIMERA categoría puede invadir la columna de las etiquetas
          // del eje Y (a su izquierda), y una centrada en la ÚLTIMA puede
          // salirse por la derecha del lienzo. Ninguna de las dos invasiones
          // se detectaba antes porque el control de colisiones sólo
          // comparaba etiquetas de datos entre sí, nunca contra el área de
          // graficado — por eso "Tendencia por año/mes" seguía mostrando una
          // etiqueta de enero encimada con el rótulo "70,000" del eje,
          // aunque las etiquetas de las distintas series ya no se encimaran
          // entre sí.
          const areaGraf = chart.chartArea || { left: 0, right: chart.width || chart.canvas.width };
          // ACT24 — además de otras etiquetas, cada punto (el círculo que
          // marca el dato en la línea) también debe tratarse como un
          // obstáculo: la posición preferida ("12px arriba del punto") deja
          // apenas 1px libre sobre el radio real del marcador (5px), así
          // que al rasterizar el PDF el texto queda tocando o tapado por su
          // propio punto (o por el de una serie vecina muy cercana) — se
          // veía, por ejemplo, en "70,187"/"69,481" de febrero o "61,178"
          // de julio. _cabe ahora revisa también contra estos círculos.
          const RADIO_PUNTO = 6; // ligeramente mayor al pointRadius:5 real, para dar un margen de separación visible
          const obstaculosPuntos = candidatos.map((c) => ({
            left: c.x - RADIO_PUNTO, right: c.x + RADIO_PUNTO, top: c.yPunto - RADIO_PUNTO, bottom: c.yPunto + RADIO_PUNTO,
          }));
          function _cabeLinea(bbox) {
            if (obstaculosPuntos.some((o) => _solapan(bbox, o))) return false;
            return _cabe(bbox);
          }
          candidatos.forEach((c) => {
            let yEtiqueta = c.yPunto - 12; // posición preferida: justo arriba del punto, igual que antes
            let align = "center";
            let bbox = _bboxCentro(c.x, yEtiqueta, c.label);
            if (bbox.left < areaGraf.left) {
              align = "left";
              bbox = _bboxIzquierda(c.x, yEtiqueta, c.label);
            } else if (bbox.right > areaGraf.right) {
              align = "right";
              bbox = _bboxDerecha(c.x, yEtiqueta, c.label);
            }
            const _bboxSegunAlineacion = (x, y, texto) =>
              align === "left" ? _bboxIzquierda(x, y, texto) : align === "right" ? _bboxDerecha(x, y, texto) : _bboxCentro(x, y, texto);
            let intentos = 0;
            while (!_cabeLinea(bbox) && intentos < 5) {
              yEtiqueta -= alturaTexto;
              bbox = _bboxSegunAlineacion(c.x, yEtiqueta, c.label);
              intentos++;
            }
            const distanciaAlPunto = c.yPunto - yEtiqueta;
            if (!_cabeLinea(bbox) || distanciaAlPunto > alturaTexto * 4) {
              // No cabe sin encimarse, o quedaría demasiado lejos de su
              // propio punto para seguir siendo clara: mejor omitirla.
              SNSP_CHART_LABEL_SKIPS.push(chart.canvas.id);
              return;
            }
            ctx.textAlign = align;
            ctx.fillText(c.label, c.x, yEtiqueta);
            colocadas.push(bbox);
          });
        }
      }
    }

    ctx.restore();
  },
};

if (typeof Chart !== "undefined" && Chart.register) {
  Chart.register(SNSP_VALUE_LABELS_PLUGIN);
}

/* =========================================================
   OPCIONES BASE — paleta, tipografía, título/subtítulo, espacio
   extra (padding) para que ninguna etiqueta quede cortada
   ========================================================= */

function SNSP_chartPalette() {
  const cs = getComputedStyle(document.documentElement);
  return [1, 2, 3, 4, 5, 6].map((i) => cs.getPropertyValue(`--chart-${i}`).trim());
}

function _snspResolveTitulo(opts) {
  opts = opts || {};
  if (opts.tituloPartes) return SNSP_tituloGrafica(opts.tituloPartes);
  if (opts.title) return { title: SNSP_wrapLabel(opts.title, 58), subtitle: opts.subtitle || null };
  return { title: null, subtitle: null };
}

function SNSP_baseChartOptions(extra, opts) {
  const cs = getComputedStyle(document.documentElement);
  const font = cs.getPropertyValue("--font-body").trim();
  const mono = cs.getPropertyValue("--font-mono").trim();
  const textPrimary = cs.getPropertyValue("--text-primary").trim();
  const textSecondary = cs.getPropertyValue("--text-secondary").trim();
  const resolved = _snspResolveTitulo(opts);
  const title = resolved.title;
  const subtitle = resolved.subtitle;

  const base = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: title ? 8 : 26, right: 34, left: 6, bottom: 6 } },
    plugins: {
      title: {
        display: !!title,
        text: title || "",
        color: textPrimary,
        font: { family: font, size: 16, weight: "600" },
        padding: { bottom: subtitle ? 3 : 12 },
      },
      subtitle: {
        display: !!subtitle,
        text: subtitle || "",
        color: textSecondary,
        font: { family: mono, size: 12, weight: "400" },
        padding: { bottom: 12 },
      },
      legend: { labels: { font: { family: font, size: 12 }, color: textSecondary, padding: 14 } },
      tooltip: { titleFont: { family: font, size: 13 }, bodyFont: { family: font, size: 12 } },
      snspValueLabels: { enabled: (opts && opts.showValues) !== false, formatter: opts && opts.formatter, fontSize: opts && opts.valueLabelFontSize, fontWeight: opts && opts.valueLabelFontWeight, pointLabelSplit: opts && opts.pointLabelSplit },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { family: font, size: 11 } } },
      y: { grid: { color: cs.getPropertyValue("--border-subtle").trim() }, ticks: { font: { family: font, size: 11 } } },
    },
  };
  return Object.assign(base, extra || {});
}

/* =========================================================
   FUNCIONES DE RENDER — mismas firmas de siempre + `opts` opcional
   al final (retrocompatible: las llamadas existentes sin `opts`
   siguen funcionando exactamente igual, sólo que ahora con
   etiquetas numéricas automáticas).
   ========================================================= */

function SNSP_renderBarChart(canvasId, labels, values, label, opts) {
  opts = opts || {};
  const palette = SNSP_chartPalette();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  const horizontal = !!opts.horizontal;
  const maxVal = values.length ? Math.max.apply(null, values) : 0;
  const suggestedMax = maxVal > 0 ? Math.ceil(maxVal * 1.18) : undefined;

  // Ninguna etiqueta se corta con "…": si el texto es largo, se reparte en
  // varias líneas (Chart.js soporta arreglos como texto de categoría).
  // Así ningún módulo necesita truncar manualmente sus etiquetas.
  const wrapAt = opts.wrapAt || 26;
  const wrappedLabels = labels.map((l) => (typeof l === "string" && l.length > wrapAt) ? SNSP_wrapLabel(l, wrapAt) : l);

  // Las categorías en cero (o sin registro) se pintan en gris
  // institucional (--c-gris) para distinguirlas de la serie con datos,
  // en vez de omitirlas o esconderlas.
  const cs = getComputedStyle(document.documentElement);
  const colorCero = cs.getPropertyValue("--chart-cero").trim() || palette[4];
  const backgroundColor = values.map((v) => (!v ? colorCero : palette[0]));

  const extra = { indexAxis: horizontal ? "y" : "x" };
  if (horizontal) {
    extra.scales = { x: { suggestedMax, ticks: { callback: (v) => SNSP_formatNumber(v) } } };
  } else {
    extra.scales = { y: { suggestedMax, ticks: { callback: (v) => SNSP_formatNumber(v) } } };
  }

  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: wrappedLabels,
      datasets: [{
        label: label || "",
        data: values,
        backgroundColor,
        borderRadius: 3,
        // opts.maxBarThickness/barPercentage/categoryPercentage: overrides
        // opcionales (por defecto, exactamente el comportamiento de
        // siempre) para que un módulo pueda pedir grosor/separación de
        // barra uniformes sin afectar a los demás llamadores que no los
        // pasan (ver morbilidadModuleView.js, ACT09).
        maxBarThickness: opts.maxBarThickness || (horizontal ? 26 : 34),
        barPercentage: opts.barPercentage !== undefined ? opts.barPercentage : 0.82,
        categoryPercentage: opts.categoryPercentage !== undefined ? opts.categoryPercentage : 0.82,
      }],
    },
    options: SNSP_baseChartOptions(extra, opts),
  });
}

function SNSP_renderLineChart(canvasId, labels, series, opts) {
  // series: [{ label, data:[...] }]
  opts = opts || {};
  const palette = SNSP_chartPalette();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  const allVals = series.reduce((acc, s) => acc.concat(s.data), []);
  const maxVal = allVals.length ? Math.max.apply(null, allVals) : 0;
  const suggestedMax = maxVal > 0 ? Math.ceil(maxVal * 1.2) : undefined;

  return new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: series.map((s, i) => ({
        label: s.label,
        data: s.data,
        borderColor: palette[i % palette.length],
        backgroundColor: palette[i % palette.length],
        tension: 0.3,
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: palette[i % palette.length],
        fill: false,
      })),
    },
    options: SNSP_baseChartOptions({ scales: { y: { suggestedMax, ticks: { callback: (v) => SNSP_formatNumber(v) } } } }, opts),
  });
}

function SNSP_renderGroupedBarChart(canvasId, labels, series, yLabel, opts) {
  // series: [{ label, data:[...] }] — para comparar 2+ categorías lado a lado
  opts = opts || {};
  const palette = SNSP_chartPalette();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  const allVals = series.reduce((acc, s) => acc.concat(s.data), []);
  const maxVal = allVals.length ? Math.max.apply(null, allVals) : 0;
  const suggestedMax = maxVal > 0 ? Math.ceil(maxVal * 1.2) : undefined;
  const horizontal = !!opts.horizontal;
  const wrapAt = opts.wrapAt || 26;
  const wrappedLabels = labels.map((l) => (typeof l === "string" && l.length > wrapAt) ? SNSP_wrapLabel(l, wrapAt) : l);

  const valueAxis = { suggestedMax, ticks: { callback: (v) => SNSP_formatNumber(v) } };
  if (yLabel) valueAxis.title = { display: true, text: yLabel };
  const scalesExtra = horizontal ? { x: valueAxis } : { y: valueAxis };

  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: wrappedLabels,
      datasets: series.map((s, i) => ({
        label: s.label,
        data: s.data,
        backgroundColor: palette[i % palette.length],
        borderRadius: 3,
        // Mismos overrides opcionales que SNSP_renderBarChart (ver ahí).
        maxBarThickness: opts.maxBarThickness || (horizontal ? 20 : 22),
        barPercentage: opts.barPercentage !== undefined ? opts.barPercentage : 0.82,
        categoryPercentage: opts.categoryPercentage !== undefined ? opts.categoryPercentage : 0.82,
      })),
    },
    options: SNSP_baseChartOptions({ indexAxis: horizontal ? "y" : "x", scales: scalesExtra }, opts),
  });
}

/**
 * Pirámide poblacional: barras horizontales espejadas por sexo (Mujeres a
 * la izquierda, Hombres a la derecha), apiladas por banda de edad. Usa el
 * mismo mecanismo de etiquetas/título que el resto de las gráficas
 * (SNSP_baseChartOptions), sólo que las barras de Mujeres se pasan en
 * negativo para que Chart.js las dibuje del lado izquierdo del cero — el
 * formateador y el tooltip siempre muestran el valor absoluto.
 */
function SNSP_renderPopulationPyramid(canvasId, bandas, mujeres, hombres, opts) {
  opts = opts || {};
  const palette = SNSP_chartPalette();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  const maxVal = Math.max(0, ...mujeres, ...hombres);
  const limite = maxVal > 0 ? Math.ceil(maxVal * 1.15) : 1;

  const extra = {
    indexAxis: "y",
    scales: {
      x: {
        stacked: true,
        min: -limite,
        max: limite,
        grid: { display: false },
        ticks: { callback: (v) => SNSP_formatNumber(Math.abs(v)) },
      },
      y: { stacked: true },
    },
  };

  // ACT26 (corrección mínima de un error preexistente de ACT25): Chart.js
  // trata las funciones dentro de options.plugins como opciones
  // "scriptable" y las invoca con un objeto de contexto al resolverlas;
  // Math.abs(contexto) lanzaba TypeError, lo que además detenía el ciclo de
  // dibujo compartido de Chart.js. Si se recibe algo que no es número, se
  // devuelve la propia función para que el plugin la reciba intacta.
  const absFormatter = function (raw) {
    if (typeof raw !== "number") return absFormatter;
    return SNSP_formatNumber(Math.abs(raw));
  };
  const options = SNSP_baseChartOptions(extra, Object.assign({}, opts, { formatter: absFormatter }));
  options.plugins.tooltip.callbacks = {
    label: (item) => `${item.dataset.label}: ${SNSP_formatNumber(Math.abs(item.raw))}`,
  };

  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: bandas,
      datasets: [
        { label: "Mujeres", data: mujeres.map((v) => -v), backgroundColor: palette[0], stack: "piramide", borderRadius: 3, maxBarThickness: 40, barPercentage: 0.75, categoryPercentage: 0.75 },
        { label: "Hombres", data: hombres, backgroundColor: palette[1], stack: "piramide", borderRadius: 3, maxBarThickness: 40, barPercentage: 0.75, categoryPercentage: 0.75 },
      ],
    },
    options,
  });
}

function SNSP_renderDoughnut(canvasId, labels, values, opts) {
  opts = opts || {};
  const palette = SNSP_chartPalette();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  const total = values.reduce((a, b) => a + (b || 0), 0);
  const resolved = _snspResolveTitulo(opts);
  const title = resolved.title;
  const subtitle = resolved.subtitle;
  const cs = getComputedStyle(document.documentElement);
  const font = cs.getPropertyValue("--font-body").trim();
  const mono = cs.getPropertyValue("--font-mono").trim();

  return new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: palette }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: !!title, text: title || "", font: { family: font, size: 16, weight: "600" }, padding: { bottom: subtitle ? 3 : 10 } },
        subtitle: { display: !!subtitle, text: subtitle || "", font: { family: mono, size: 12 }, padding: { bottom: 10 } },
        legend: {
          position: "right",
          labels: {
            boxWidth: 12,
            padding: 12,
            font: { size: 12 },
            // Leyenda enriquecida con valor + porcentaje: complementa las
            // etiquetas dentro de las rebanadas cuando son demasiado
            // pequeñas para llevar texto legible (ver plugin de arriba).
            generateLabels: (chart) => {
              const data = chart.data;
              return (data.labels || []).map((label, i) => {
                const value = data.datasets[0].data[i];
                const pct = total ? (value / total) * 100 : 0;
                return {
                  text: `${label} — ${SNSP_formatNumber(value)} (${SNSP_formatPercent(pct)})`,
                  fillStyle: data.datasets[0].backgroundColor[i],
                  strokeStyle: data.datasets[0].backgroundColor[i],
                  index: i,
                };
              });
            },
          },
        },
        snspValueLabels: { enabled: opts.showValues !== false },
        tooltip: { titleFont: { family: font }, bodyFont: { family: font } },
      },
    },
  });
}
