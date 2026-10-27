/**
 * components/pyramidChart.js  (ACT26 — NUEVO, aditivo)
 * -----------------------------------------------------------------------
 * Gráficas de la sección "Población histórica SUIVE 2017-2026":
 *   SNSP_renderPiramideSUIVE(canvasId, piramide, opts)
 *   SNSP_renderEvolucionPoblacion(canvasId, serie, opts)
 *
 * No modifica SNSP_renderPopulationPyramid (components/charts.js), que
 * sigue usando la sección del padrón ASIS 2025.
 *
 * Pirámide: Hombres a la IZQUIERDA (dorado), Mujeres a la DERECHA (vino),
 * eje central, grupos de mayor edad ARRIBA. Respeta exactamente los 11
 * grupos de la fuente; los de amplitud distinta a 5 años muestran su
 * amplitud en la etiqueta del eje. Las etiquetas de valor se dibujan con
 * un plugin local (al extremo exterior de cada barra), por lo que el
 * plugin global snspValueLabels se desactiva sólo en estas gráficas.
 * Requiere Chart.js y components/charts.js (SNSP_formatNumber/Percent).
 * -----------------------------------------------------------------------
 */

function _snspCss(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Formato compacto para etiquetas sobre gráficas (el tooltip siempre
// muestra la cifra completa).
function SNSP_formatCompacto(n) {
  const v = Math.round(Number(n) || 0);
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " M";
  if (a >= 1e4) return (v / 1e3).toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " mil";
  return v.toLocaleString("es-MX");
}

// Versión más corta para teléfono: "440 mil" (el tooltip da la cifra exacta).
function _snspCompactoCorto(n) {
  const v = Math.round(Number(n) || 0);
  if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString("es-MX", { maximumFractionDigits: 1 }) + " M";
  if (Math.abs(v) >= 1e4) return Math.round(v / 1e3).toLocaleString("es-MX") + " mil";
  return v.toLocaleString("es-MX");
}

function _snspEtiquetaGrupo(g) {
  if (g.amplitud === null || g.amplitud === undefined) return [g.etiqueta, "(abierto)"];
  if (g.amplitud !== 5) return [g.etiqueta, `(${g.amplitud} ${g.amplitud === 1 ? "año" : "años"})`];
  return g.etiqueta;
}

function SNSP_renderPiramideSUIVE(canvasId, piramide, opts) {
  opts = opts || {};
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === "undefined") return null;
  const modo = opts.modo === "pct" ? "pct" : "abs";
  const total = piramide.total || 0;
  const compacto = !!opts.compacto;

  // Orden visual: el índice 0 de Chart.js (eje Y categórico) queda ARRIBA,
  // así que se invierte para dejar "65 y más" arriba y "0 años" abajo.
  const orden = piramide.grupos.map((_, i) => i).reverse();
  const grupos = orden.map((i) => piramide.grupos[i]);
  const valH = orden.map((i) => piramide.hombres[i]);
  const valM = orden.map((i) => piramide.mujeres[i]);
  const toModo = (v) => (modo === "pct" ? (total ? (v / total) * 100 : 0) : v);
  const dataH = valH.map((v) => -toModo(v));
  const dataM = valM.map((v) => toModo(v));
  const maxVal = Math.max(0, ...dataM, ...dataH.map(Math.abs));
  const crudo = maxVal > 0 ? maxVal * (compacto ? 1.6 : 1.3) : 1;
  const paso = Math.pow(10, Math.floor(Math.log10(crudo))) / 2;
  const limite = Math.ceil(crudo / paso) * paso; // límite "redondo" para marcas legibles

  const colorH = _snspCss("--ph-hombres", "#A57F2C");
  const colorM = _snspCss("--ph-mujeres", "#611232");
  const font = _snspCss("--font-body", "sans-serif");
  const mono = _snspCss("--font-mono", "monospace");
  const textPrimary = _snspCss("--text-primary", "#22201D");
  const textSecondary = _snspCss("--text-secondary", "#4D4D4D");
  const grid = _snspCss("--border-subtle", "#E4E0D6");
  const fmt = (v) => (modo === "pct" ? SNSP_formatPercent(Math.abs(v), 1) : (compacto ? _snspCompactoCorto(Math.abs(v)) : SNSP_formatNumber(Math.round(Math.abs(v)))));

  const etiquetasPlugin = {
    id: "snspPiramideEtiquetas",
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      c.font = `600 ${compacto ? 10 : 11}px ${mono}`;
      c.fillStyle = textPrimary;
      c.textBaseline = "middle";
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach((el, i) => {
          if (el.height < 8) return;
          const v = ds.data[i];
          const txt = fmt(v);
          const w = c.measureText(txt).width;
          const area = chart.chartArea;
          // Si la etiqueta no cabe fuera de la barra, se dibuja dentro (texto claro).
          if (v < 0) {
            if (el.x - 5 - w < area.left) { c.fillStyle = "#FFFFFF"; c.textAlign = "left"; c.fillText(txt, el.x + 4, el.y); }
            else { c.fillStyle = textPrimary; c.textAlign = "right"; c.fillText(txt, el.x - 5, el.y); }
          } else {
            if (el.x + 5 + w > area.right) { c.fillStyle = "#FFFFFF"; c.textAlign = "right"; c.fillText(txt, el.x - 4, el.y); }
            else { c.fillStyle = textPrimary; c.textAlign = "left"; c.fillText(txt, el.x + 5, el.y); }
          }
        });
      });
      // Eje central
      const x0 = chart.scales.x.getPixelForValue(0);
      c.strokeStyle = textSecondary;
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(x0, chart.chartArea.top);
      c.lineTo(x0, chart.chartArea.bottom);
      c.stroke();
      c.restore();
    },
  };

  const tooltipLabel = (item) => {
    const gi = item.dataIndex;
    const esH = item.datasetIndex === 0;
    const pob = esH ? valH[gi] : valM[gi];
    const totSexo = esH ? piramide.totalHombres : piramide.totalMujeres;
    return [
      `${esH ? "Hombres" : "Mujeres"}: ${SNSP_formatNumber(Math.round(pob))} hab.`,
      `% del total mostrado: ${SNSP_formatPercent(total ? (pob / total) * 100 : 0, 2)}`,
      `% dentro de ${esH ? "hombres" : "mujeres"}: ${SNSP_formatPercent(totSexo ? (pob / totSexo) * 100 : 0, 2)}`,
    ];
  };

  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: grupos.map(_snspEtiquetaGrupo),
      datasets: [
        { label: "Hombres", data: dataH, backgroundColor: colorH, borderRadius: 3, barPercentage: 0.86, categoryPercentage: 0.9 },
        { label: "Mujeres", data: dataM, backgroundColor: colorM, borderRadius: 3, barPercentage: 0.86, categoryPercentage: 0.9 },
      ],
    },
    plugins: [etiquetasPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      animation: { duration: 350 },
      layout: { padding: { top: 4, right: 8, left: 4, bottom: 0 } },
      scales: {
        x: {
          stacked: true, min: -limite, max: limite,
          grid: { color: grid },
          ticks: { font: { family: font, size: compacto ? 9 : 11 }, maxTicksLimit: compacto ? 5 : 9, callback: (v) => (modo === "pct" ? Math.abs(v).toFixed(0) + "%" : SNSP_formatCompacto(Math.abs(v))) },
          title: { display: !compacto, text: modo === "pct" ? "Porcentaje del total de población mostrada" : "Habitantes", color: textSecondary, font: { family: font, size: 11 } },
        },
        y: {
          stacked: true, grid: { display: false },
          ticks: { font: { family: font, size: compacto ? 10 : 12 }, color: textPrimary },
          title: { display: !compacto, text: "Grupo de edad (años)", color: textSecondary, font: { family: font, size: 11 } },
        },
      },
      plugins: {
        snspValueLabels: { enabled: false },
        legend: { position: "top", labels: { font: { family: font, size: 12 }, color: textSecondary, boxWidth: 14 } },
        title: { display: false },
        tooltip: {
          titleFont: { family: font, size: 13 }, bodyFont: { family: font, size: 12 },
          callbacks: {
            title: (items) => {
              const g = grupos[items[0].dataIndex];
              return `${g.fuente}${g.amplitud ? ` — amplitud ${g.amplitud} ${g.amplitud === 1 ? "año" : "años"}` : " — grupo abierto"}`;
            },
            label: tooltipLabel,
          },
        },
      },
    },
  });
}

/**
 * Evolución anual 2017-2026. serie: [{anio,total,mujeres,hombres}] —
 * cada punto es la población de ESE año (no acumulada).
 * opts: { vista: "total"|"sexo", anioSel }
 */
function SNSP_renderEvolucionPoblacion(canvasId, serie, opts) {
  opts = opts || {};
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === "undefined") return null;
  const vista = opts.vista === "sexo" ? "sexo" : "total";
  const font = _snspCss("--font-body", "sans-serif");
  const mono = _snspCss("--font-mono", "monospace");
  const textPrimary = _snspCss("--text-primary", "#22201D");
  const textSecondary = _snspCss("--text-secondary", "#4D4D4D");
  const grid = _snspCss("--border-subtle", "#E4E0D6");
  const resalte = _snspCss("--ph-resalte", "rgba(165,127,44,0.14)");
  const labels = serie.map((s) => String(s.anio));
  const selIdx = labels.indexOf(String(opts.anioSel));

  const mk = (label, key, color) => ({
    label, data: serie.map((s) => s[key]), borderColor: color, backgroundColor: color,
    tension: 0.25, borderWidth: 2.5, pointRadius: serie.map((_, i) => (i === selIdx ? 7 : 4)),
    pointHoverRadius: 8, fill: false,
  });
  const datasets = vista === "total"
    ? [mk("Población total", "total", _snspCss("--ph-total", "#002F2A"))]
    : [mk("Mujeres", "mujeres", _snspCss("--ph-mujeres", "#611232")), mk("Hombres", "hombres", _snspCss("--ph-hombres", "#A57F2C"))];

  const plugin = {
    id: "snspEvolucionExtras",
    beforeDatasetsDraw(chart) {
      if (selIdx < 0) return;
      const x = chart.scales.x.getPixelForValue(selIdx);
      const w = Math.max(18, (chart.chartArea.right - chart.chartArea.left) / labels.length * 0.7);
      chart.ctx.save();
      chart.ctx.fillStyle = resalte;
      chart.ctx.fillRect(x - w / 2, chart.chartArea.top, w, chart.chartArea.bottom - chart.chartArea.top);
      chart.ctx.restore();
    },
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      c.font = `600 10px ${mono}`;
      c.fillStyle = textPrimary;
      c.textAlign = "center";
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        const narrow = (chart.chartArea.right - chart.chartArea.left) / labels.length < 52;
        meta.data.forEach((pt, i) => {
          // En pantallas angostas sólo se rotulan extremos y año seleccionado.
          if (narrow && !(i === 0 || i === labels.length - 1 || i === selIdx)) return;
          const below = (vista === "sexo" && di === 1) || (vista === "total" && i === 0);
          c.textBaseline = below ? "top" : "bottom";
          c.textAlign = i === 0 ? "left" : i === labels.length - 1 ? "right" : "center";
          const dx = i === 0 ? 4 : i === labels.length - 1 ? -4 : 0;
          c.fillText(SNSP_formatCompacto(ds.data[i]), pt.x + dx, below ? pt.y + 9 : pt.y - 9);
        });
      });
      c.restore();
    },
  };

  const all = datasets.reduce((a, d) => a.concat(d.data), []);
  const min = Math.min(...all), max = Math.max(...all);
  const pad = (max - min) * 0.18 || max * 0.05;

  return new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    plugins: [plugin],
    options: {
      responsive: true, maintainAspectRatio: false, animation: opts.paraPDF ? false : { duration: 350 },
      devicePixelRatio: opts.paraPDF ? 2 : undefined,
      layout: { padding: { top: 6, right: 30, left: 4, bottom: 0 } },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: font, size: 11 } }, title: { display: true, text: "Año", color: textSecondary, font: { family: font, size: 11 } } },
        y: {
          suggestedMin: Math.max(0, min - pad), suggestedMax: max + pad, grid: { color: grid },
          ticks: { font: { family: font, size: 11 }, callback: (v) => SNSP_formatCompacto(v) },
          title: { display: true, text: "Habitantes", color: textSecondary, font: { family: font, size: 11 } },
        },
      },
      plugins: {
        snspValueLabels: { enabled: false },
        title: { display: false },
        legend: { display: vista === "sexo", position: "top", labels: { font: { family: font, size: 12 }, boxWidth: 14 } },
        tooltip: {
          titleFont: { family: font }, bodyFont: { family: font },
          callbacks: {
            title: (items) => `Año ${items[0].label}`,
            label: (item) => `${item.dataset.label}: ${SNSP_formatNumber(Math.round(item.raw))} hab.`,
            afterBody: (items) => {
              const i = items[0].dataIndex;
              if (i === 0) return "Variación vs año anterior: no disponible (inicio de la serie)";
              const key = vista === "total" ? "total" : null;
              if (!key) return "";
              const prev = serie[i - 1].total, cur = serie[i].total;
              return `Variación vs ${serie[i - 1].anio}: ${cur >= prev ? "+" : ""}${SNSP_formatPercent(((cur - prev) / prev) * 100, 2)}`;
            },
          },
        },
      },
    },
  });
}

/**
 * Barras horizontales de la sección histórica (municipios, jurisdicciones).
 * Etiquetas dibujadas por un plugin local (el formatter NO se pasa por las
 * opciones de Chart.js: Chart.js trata las funciones de opciones como
 * "scriptable" y las invoca con su contexto, lo que rompe formateadores).
 * opts: { formatter(v,i), resaltar:[bool], ejeTitulo, wrapAt }
 */
function SNSP_renderBarrasPH(canvasId, labels, values, opts) {
  opts = opts || {};
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === "undefined") return null;
  const font = _snspCss("--font-body", "sans-serif");
  const mono = _snspCss("--font-mono", "monospace");
  const textPrimary = _snspCss("--text-primary", "#22201D");
  const textSecondary = _snspCss("--text-secondary", "#4D4D4D");
  const grid = _snspCss("--border-subtle", "#E4E0D6");
  const base = _snspCss("--ph-mujeres", "#611232");
  const sel = _snspCss("--ph-hombres", "#A57F2C");
  const fmt = opts.formatter || ((v) => SNSP_formatNumber(Math.round(v)));
  const resaltar = opts.resaltar || [];
  const wrapAt = opts.wrapAt || 24;
  const lbls = labels.map((l) => (typeof SNSP_wrapLabel === "function" && l.length > wrapAt ? SNSP_wrapLabel(l, wrapAt) : l));
  const maxVal = values.length ? Math.max(...values) : 0;
  const etiquetas = {
    id: "snspBarrasPHEtiquetas",
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      c.font = `600 11px ${mono}`;
      c.fillStyle = textPrimary;
      c.textBaseline = "middle";
      c.textAlign = "left";
      chart.getDatasetMeta(0).data.forEach((el, i) => {
        if (el.height < 8) return;
        c.fillText(fmt(values[i], i), el.x + 6, el.y);
      });
      c.restore();
    },
  };
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: lbls,
      datasets: [{
        label: opts.serie || "Habitantes", data: values,
        backgroundColor: values.map((_, i) => (resaltar[i] ? sel : base)),
        borderRadius: 3, maxBarThickness: opts.maxBarThickness || 24, barPercentage: 0.82, categoryPercentage: 0.86,
      }],
    },
    plugins: [etiquetas],
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: "y", animation: { duration: 300 },
      layout: { padding: { right: 8 } },
      scales: {
        x: {
          beginAtZero: true, suggestedMax: maxVal * (opts.holgura || 1.32), grid: { color: grid },
          ticks: { font: { family: font, size: 10 }, maxTicksLimit: 6, callback: (v) => SNSP_formatCompacto(v) },
          title: { display: !!opts.ejeTitulo, text: opts.ejeTitulo || "", color: textSecondary, font: { family: font, size: 11 } },
        },
        y: { grid: { display: false }, ticks: { font: { family: font, size: 11 }, color: textPrimary } },
      },
      plugins: {
        snspValueLabels: { enabled: false },
        legend: { display: false },
        title: { display: false },
        tooltip: {
          titleFont: { family: font }, bodyFont: { family: font },
          callbacks: {
            title: (items) => labels[items[0].dataIndex],
            label: (item) => `${SNSP_formatNumber(Math.round(values[item.dataIndex]))} hab.` + (opts.totalReferencia ? ` (${SNSP_formatPercent((values[item.dataIndex] / opts.totalReferencia) * 100, 1)} ${opts.etiquetaReferencia || "del total"})` : ""),
          },
        },
      },
    },
  });
}

/**
 * (ACT26b) Comparativo poblacional por años — barras agrupadas.
 * filas: [{anio,total,mujeres,hombres}] (una por año seleccionado; cada barra
 * es la población de SU año, nunca una suma de años).
 * series: subconjunto ordenado de ["total","mujeres","hombres"].
 * opts: { compacto } -> en teléfono las barras se dibujan horizontales
 * (años en el eje vertical) para que las etiquetas quepan.
 * Etiquetas con plugin local: encima de la barra; si la barra es más angosta
 * que el texto, se rota 90° (vertical) para no encimarse con la vecina.
 */
function SNSP_renderComparativoAnios(canvasId, filas, series, opts) {
  opts = opts || {};
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === "undefined") return null;
  const compacto = !!opts.compacto;
  const font = _snspCss("--font-body", "sans-serif");
  const mono = _snspCss("--font-mono", "monospace");
  const textPrimary = _snspCss("--text-primary", "#22201D");
  const textSecondary = _snspCss("--text-secondary", "#4D4D4D");
  const grid = _snspCss("--border-subtle", "#E4E0D6");
  const DEF = {
    total: { label: "Población total (mujeres + hombres)", color: _snspCss("--ph-total", "#002F2A") },
    mujeres: { label: "Mujeres", color: _snspCss("--ph-mujeres", "#611232") },
    hombres: { label: "Hombres", color: _snspCss("--ph-hombres", "#A57F2C") },
  };
  const labels = filas.map((f) => String(f.anio));
  const datasets = series.map((k) => ({
    label: DEF[k].label, _clave: k, data: filas.map((f) => f[k]), backgroundColor: DEF[k].color,
    borderRadius: 3, barPercentage: 0.9, categoryPercentage: compacto ? 0.86 : 0.78,
    maxBarThickness: compacto ? 18 : 46,
  }));
  const maxVal = Math.max(0, ...datasets.reduce((a, d) => a.concat(d.data), []));
  const fmtLbl = SNSP_formatCompacto; // 2 decimales en millones: distingue Mujeres de Hombres

  const etiquetas = {
    id: "snspComparativoEtiquetas",
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      c.font = `600 ${compacto ? 10 : 11}px ${mono}`;
      c.fillStyle = textPrimary;
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach((el, i) => {
          const txt = fmtLbl(ds.data[i]);
          const w = c.measureText(txt).width;
          if (compacto) { // horizontal: a la derecha de la barra
            if (el.height < 7) return;
            c.textAlign = "left"; c.textBaseline = "middle";
            c.fillText(txt, el.x + 4, el.y);
            return;
          }
          if (el.width >= w + 4) {
            c.textAlign = "center"; c.textBaseline = "bottom";
            c.fillText(txt, el.x, el.y - 4);
          } else { // barra angosta: texto vertical encima de la barra
            c.save();
            c.translate(el.x, el.y - 5);
            c.rotate(-Math.PI / 2);
            c.textAlign = "left"; c.textBaseline = "middle";
            c.fillText(txt, 0, 0);
            c.restore();
          }
        });
      });
      c.restore();
    },
  };

  const ejeValor = {
    beginAtZero: true, grid: { color: grid },
    suggestedMax: maxVal * (compacto ? 1.5 : 1.3),
    ticks: { font: { family: font, size: compacto ? 9 : 11 }, maxTicksLimit: compacto ? 4 : 7, callback: (v) => SNSP_formatCompacto(v) },
    title: { display: true, text: "Habitantes", color: textSecondary, font: { family: font, size: 11 } },
  };
  const ejeAnio = {
    grid: { display: false },
    ticks: { font: { family: font, size: compacto ? 11 : 12, weight: "600" }, color: textPrimary },
    title: { display: !compacto, text: "Año (cada barra = población de ese año)", color: textSecondary, font: { family: font, size: 11 } },
  };

  return new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    plugins: [etiquetas],
    options: {
      responsive: true, maintainAspectRatio: false, animation: opts.paraPDF ? false : { duration: 300 },
      devicePixelRatio: opts.paraPDF ? 2 : undefined,
      indexAxis: compacto ? "y" : "x",
      layout: { padding: { top: compacto ? 0 : 8, right: compacto ? 6 : 10 } },
      scales: compacto ? { x: ejeValor, y: ejeAnio } : { x: ejeAnio, y: ejeValor },
      plugins: {
        snspValueLabels: { enabled: false },
        title: { display: false },
        legend: { position: "top", labels: { font: { family: font, size: 12 }, boxWidth: 14, color: textSecondary } },
        tooltip: {
          titleFont: { family: font }, bodyFont: { family: font },
          callbacks: {
            title: (items) => `Año ${items[0].label}`,
            label: (item) => `${item.dataset.label}: ${SNSP_formatNumber(Math.round(item.raw))} hab.`,
            afterLabel: (item) => {
              const i = item.dataIndex;
              if (i === 0) return "Año base de la comparación";
              const prev = filas[i - 1], k = item.dataset._clave;
              const d = filas[i][k] - prev[k];
              return `vs ${prev.anio}: ${d >= 0 ? "+" : ""}${SNSP_formatNumber(Math.round(d))} (${d >= 0 ? "+" : ""}${SNSP_formatPercent((d / prev[k]) * 100, 2)})`;
            },
          },
        },
      },
    },
  });
}

/**
 * (ACT26c) Distribución por sexo y grupo de edad — barras HORIZONTALES
 * AGRUPADAS (sustituye a la pirámide en la sección SUIVE). Por cada uno de
 * los 11 grupos de la fuente se dibujan dos barras desde cero: Hombres
 * (dorado) y Mujeres (vino). Grupos en orden de edad, de 0 años (arriba) a
 * 65 y más (abajo). Sin quinquenios estimados: los grupos de amplitud
 * distinta a 5 años la muestran en la etiqueta del eje.
 * piramide: salida de SNSP_POBLACION_HISTORICA_SERVICE.getPiramide()
 * opts: { modo: "abs"|"pct", compacto, paraPDF }
 */
function SNSP_renderBarrasSexoEdad(canvasId, piramide, opts) {
  opts = opts || {};
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === "undefined") return null;
  const modo = opts.modo === "pct" ? "pct" : "abs";
  const compacto = !!opts.compacto;
  const total = piramide.total || 0;
  const grupos = piramide.grupos;
  const toModo = (v) => (modo === "pct" ? (total ? (v / total) * 100 : 0) : v);
  const dataH = piramide.hombres.map(toModo);
  const dataM = piramide.mujeres.map(toModo);
  const maxVal = Math.max(0, ...dataH, ...dataM);
  const font = _snspCss("--font-body", "sans-serif");
  const mono = _snspCss("--font-mono", "monospace");
  const textPrimary = _snspCss("--text-primary", "#22201D");
  const textSecondary = _snspCss("--text-secondary", "#4D4D4D");
  const grid = _snspCss("--border-subtle", "#E4E0D6");
  const fmt = (v) => (modo === "pct" ? SNSP_formatPercent(v, 1) : (compacto ? _snspCompactoCorto(v) : SNSP_formatNumber(Math.round(v))));

  const etiquetas = {
    id: "snspSexoEdadEtiquetas",
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      c.font = `600 ${compacto ? 9.5 : 10.5}px ${mono}`;
      c.fillStyle = textPrimary;
      c.textAlign = "left"; c.textBaseline = "middle";
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach((el, i) => { if (el.height >= 6) c.fillText(fmt(ds.data[i]), el.x + 4, el.y); });
      });
      c.restore();
    },
  };

  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: grupos.map(_snspEtiquetaGrupo),
      datasets: [
        { label: "Hombres", data: dataH, backgroundColor: _snspCss("--ph-hombres", "#A57F2C"), borderRadius: 2, barPercentage: 0.92, categoryPercentage: 0.8, maxBarThickness: 16 },
        { label: "Mujeres", data: dataM, backgroundColor: _snspCss("--ph-mujeres", "#611232"), borderRadius: 2, barPercentage: 0.92, categoryPercentage: 0.8, maxBarThickness: 16 },
      ],
    },
    plugins: [etiquetas],
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: "y",
      animation: opts.paraPDF ? false : { duration: 300 },
      devicePixelRatio: opts.paraPDF ? 2 : undefined,
      layout: { padding: { right: 6 } },
      scales: {
        x: {
          beginAtZero: true, suggestedMax: maxVal * (compacto ? 1.45 : 1.22), grid: { color: grid },
          ticks: { font: { family: font, size: compacto ? 9 : 11 }, maxTicksLimit: compacto ? 4 : 7, callback: (v) => (modo === "pct" ? v + "%" : SNSP_formatCompacto(v)) },
          title: { display: true, text: modo === "pct" ? "% del total de población mostrada" : "Habitantes", color: textSecondary, font: { family: font, size: 11 } },
        },
        y: {
          grid: { display: false },
          // autoSkip:false: los 11 grupos SIEMPRE se rotulan (Chart.js omitía
          // etiquetas alternas cuando el alto disponible era reducido).
          ticks: { autoSkip: false, font: { family: font, size: compacto ? 10 : 11.5 }, color: textPrimary },
          title: { display: !compacto, text: "Grupo de edad (años)", color: textSecondary, font: { family: font, size: 11 } },
        },
      },
      plugins: {
        snspValueLabels: { enabled: false },
        title: { display: false },
        legend: { position: "top", labels: { font: { family: font, size: 12 }, boxWidth: 14, color: textSecondary } },
        tooltip: {
          titleFont: { family: font }, bodyFont: { family: font },
          callbacks: {
            title: (items) => {
              const g = grupos[items[0].dataIndex];
              return `${g.fuente}${g.amplitud ? ` — amplitud ${g.amplitud} ${g.amplitud === 1 ? "año" : "años"}` : " — grupo abierto"}`;
            },
            label: (item) => {
              const esH = item.datasetIndex === 0;
              const i = item.dataIndex;
              const pob = (esH ? piramide.hombres : piramide.mujeres)[i];
              const grupo = piramide.hombres[i] + piramide.mujeres[i];
              return [
                `${esH ? "Hombres" : "Mujeres"}: ${SNSP_formatNumber(Math.round(pob))} hab.`,
                `${SNSP_formatPercent(grupo ? (pob / grupo) * 100 : 0, 1)} del grupo de edad (${SNSP_formatNumber(Math.round(grupo))} hab.)`,
                `${SNSP_formatPercent(total ? (pob / total) * 100 : 0, 2)} de la población total`,
              ];
            },
          },
        },
      },
    },
  });
}

/**
 * (ACT26c) Ranking municipal (5 más / 5 menos poblados): barras horizontales.
 * items: [{nombre, total, cve}] ya ordenados; opts: { tipo:"top"|"bottom", cveResaltado, compacto, paraPDF }
 */
function SNSP_renderRankingMunicipal(canvasId, items, opts) {
  opts = opts || {};
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === "undefined") return null;
  const compacto = !!opts.compacto;
  const font = _snspCss("--font-body", "sans-serif");
  const mono = _snspCss("--font-mono", "monospace");
  const textPrimary = _snspCss("--text-primary", "#22201D");
  const textSecondary = _snspCss("--text-secondary", "#4D4D4D");
  const grid = _snspCss("--border-subtle", "#E4E0D6");
  const base = opts.tipo === "bottom" ? _snspCss("--c-gris-oscuro", "#4D4D4D") : _snspCss("--ph-mujeres", "#611232");
  const sel = _snspCss("--ph-hombres", "#A57F2C");
  const vals = items.map((m) => m.total);
  const maxVal = Math.max(0, ...vals);
  const etiquetas = {
    id: "snspRankingEtiquetas",
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      c.font = `600 ${compacto ? 10 : 11}px ${mono}`;
      c.fillStyle = textPrimary; c.textAlign = "left"; c.textBaseline = "middle";
      chart.getDatasetMeta(0).data.forEach((el, i) => c.fillText(SNSP_formatNumber(Math.round(vals[i])), el.x + 5, el.y));
      c.restore();
    },
  };
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: items.map((m, i) => `${m.posicion || i + 1}. ${m.nombre}`),
      datasets: [{ label: "Habitantes", data: vals, backgroundColor: items.map((m) => (m.cve === opts.cveResaltado ? sel : base)), borderRadius: 3, maxBarThickness: 26, barPercentage: 0.8, categoryPercentage: 0.9 }],
    },
    plugins: [etiquetas],
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: "y",
      animation: opts.paraPDF ? false : { duration: 300 },
      devicePixelRatio: opts.paraPDF ? 2 : undefined,
      scales: {
        x: { beginAtZero: true, suggestedMax: maxVal * (compacto ? 1.5 : 1.3), grid: { color: grid }, ticks: { font: { family: font, size: compacto ? 9 : 10 }, maxTicksLimit: compacto ? 4 : 6, callback: (v) => SNSP_formatCompacto(v) }, title: { display: true, text: "Habitantes", color: textSecondary, font: { family: font, size: 11 } } },
        y: { grid: { display: false }, ticks: { autoSkip: false, font: { family: font, size: compacto ? 10.5 : 12 }, color: textPrimary } },
      },
      plugins: {
        snspValueLabels: { enabled: false }, title: { display: false }, legend: { display: false },
        tooltip: { titleFont: { family: font }, bodyFont: { family: font }, callbacks: { label: (it) => `${SNSP_formatNumber(Math.round(it.raw))} hab.` } },
      },
    },
  });
}
