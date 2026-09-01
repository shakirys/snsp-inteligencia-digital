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

function _snspLabelFont(count) {
  if (count <= 8) return "600 13px";
  if (count <= 16) return "600 12px";
  return "600 10px";
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
    const fontSize = _snspLabelFont(categoryCount);

    ctx.save();
    ctx.fillStyle = textColor;
    ctx.font = fontSize + " " + fontFamily;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    chart.data.datasets.forEach((dataset, dsIndex) => {
      const meta = chart.getDatasetMeta(dsIndex);
      if (!meta || meta.hidden) return;
      const isBar = meta.type === "bar";
      const isLine = meta.type === "line";
      const isDoughnut = meta.type === "doughnut" || meta.type === "pie";

      if (isDoughnut) {
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
        return;
      }

      meta.data.forEach((el, i) => {
        const raw = dataset.data[i];
        if (raw === null || raw === undefined) return;
        if (cfg.skipZero && !raw) return;
        const label = formatter(raw, dataset, i);

        if (isBar) {
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
          if (horizontal) {
            ctx.textAlign = "left";
            ctx.fillText(label, el.x + 6, el.y);
          } else {
            ctx.textAlign = "center";
            ctx.fillText(label, el.x, el.y - 10);
          }
        } else if (isLine) {
          if (meta.data.length > 20) return; // demasiados puntos: se deja sólo el tooltip
          ctx.textAlign = "center";
          ctx.fillText(label, el.x, el.y - 12);
        }
      });
    });
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
      snspValueLabels: { enabled: (opts && opts.showValues) !== false, formatter: opts && opts.formatter },
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
        maxBarThickness: horizontal ? 26 : 34,
        barPercentage: 0.82,
        categoryPercentage: 0.82,
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
        maxBarThickness: horizontal ? 20 : 22,
        barPercentage: 0.82,
        categoryPercentage: 0.82,
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

  const absFormatter = (raw) => SNSP_formatNumber(Math.abs(raw));
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
