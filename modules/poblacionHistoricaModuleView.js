/**
 * modules/poblacionHistoricaModuleView.js  (ACT26 — NUEVO, aditivo)
 * -----------------------------------------------------------------------
 * Sección "Población histórica SUIVE 2017-2026" del módulo Población.
 * Se monta dentro de pages/poblacion.html, en su propia pestaña, junto a
 * la sección del padrón ASIS 2025 (modules/poblacionModuleView.js), que
 * NO se modifica: esta vista no llama a sidebar/topbar ni a la barra de
 * filtros estándar (SNSP_renderFilterBar usa IDs fijos), sino que trae
 * sus propios controles con prefijo "ph-".
 *
 * Filtros: Año (uno, obligatorio) · Jurisdicción · Municipio (en cascada).
 * Todos los indicadores usan UN año de referencia; nunca se suman años.
 *
 * ACT26b — Comparativo poblacional por años: selector de años MÚLTIPLE e
 * independiente del filtro "Año" (que sigue gobernando KPIs, pirámide y
 * mapa). Respeta Jurisdicción y Municipio. Cada barra/fila es la población
 * de su propio año; la variación es contra el año seleccionado anterior.
 *
 * ACT26c — (1) la pirámide se sustituye por barras horizontales agrupadas
 * por sexo y grupo de edad; (2) indicadores de estructura (% mujeres,
 * % hombres, 65 y más en número y %); (3) ranking municipal 5 más / 5
 * menos poblados; (4) botón "Descargar reporte poblacional" (PDF generado
 * en el navegador por modules/poblacionReportePDF.js con los filtros vigentes).
 * -----------------------------------------------------------------------
 */
function SNSP_renderPoblacionHistoricaSection(opts) {
  opts = opts || {};
  const svc = window.SNSP_POBLACION_HISTORICA_SERVICE;
  const meta = svc.getMeta();
  const root = document.getElementById(opts.containerId || "ph-panel-suive");
  if (!root || !meta) {
    if (root) root.innerHTML = `<div class="empty-state">No se encontró la base de población histórica SUIVE.</div>`;
    return null;
  }
  const cat = svc.getCatalogos();
  const state = {
    anio: opts.anioInicial || svc.getAnioMasReciente(),
    js: null,
    cve: null,
    modo: "abs",
    vistaEvol: "total",
    // ACT26b: comparativo (independiente de state.anio)
    cmpAnios: svc.getAnios().slice(-5),
    cmpSeries: ["total", "mujeres", "hombres"],
    rankTipo: "top", // ACT26c
  };
  const ORDEN_SERIES = ["total", "mujeres", "hombres"];
  let charts = {};
  const $ = (id) => document.getElementById(id);
  const fmt = (v) => SNSP_formatNumber(Math.round(v));
  const esCompacto = () => window.matchMedia && window.matchMedia("(max-width: 640px)").matches;

  function destroy() { Object.values(charts).forEach((c) => c && c.destroy && c.destroy()); charts = {}; }

  // ---------------- Controles ----------------
  const selAnio = $("ph-f-anio"), selJs = $("ph-f-js"), selMun = $("ph-f-mun");
  selAnio.innerHTML = cat.anios.slice().reverse().map((a) => `<option value="${a}">${a}</option>`).join("");
  selJs.innerHTML = `<option value="">Todas (estado)</option>` + cat.jurisdicciones.map((j) => `<option value="${j.id}">${j.etiqueta}</option>`).join("");
  function poblarMunicipios() {
    const lista = svc.getMunicipios(state.js).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    selMun.innerHTML = `<option value="">${state.js ? "Todos los de la jurisdicción" : "Todos"}</option>` +
      lista.map((m) => `<option value="${m.cve}">${m.nombre}</option>`).join("");
    selMun.value = state.cve || "";
  }
  function sincronizarControles() {
    selAnio.value = String(state.anio);
    selJs.value = state.js ? String(state.js) : "";
    poblarMunicipios();
    root.querySelectorAll("[data-ph-modo]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.phModo === state.modo)));
    root.querySelectorAll("[data-ph-evol]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.phEvol === state.vistaEvol)));
  }
  function setMunicipio(cve) {
    state.cve = cve || null;
    if (state.cve) {
      const m = cat.municipios.find((x) => x.cve === state.cve);
      state.js = m ? m.js : state.js; // el municipio fija su jurisdicción
    }
    aplicar();
  }
  selAnio.addEventListener("change", () => { state.anio = Number(selAnio.value); aplicar(); });
  selJs.addEventListener("change", () => {
    state.js = selJs.value ? Number(selJs.value) : null;
    if (state.cve) {
      const m = cat.municipios.find((x) => x.cve === state.cve);
      if (!m || (state.js && m.js !== state.js)) state.cve = null;
    }
    aplicar();
  });
  selMun.addEventListener("change", () => setMunicipio(selMun.value));
  $("ph-f-limpiar").addEventListener("click", () => {
    state.anio = svc.getAnioMasReciente(); state.js = null; state.cve = null; state.modo = "abs";
    state.cmpAnios = svc.getAnios().slice(-5); state.cmpSeries = ORDEN_SERIES.slice(); state.rankTipo = "top";
    aplicar();
  });
  root.querySelectorAll("[data-ph-modo]").forEach((b) => b.addEventListener("click", () => { state.modo = b.dataset.phModo; aplicar(); }));
  root.querySelectorAll("[data-ph-evol]").forEach((b) => b.addEventListener("click", () => { state.vistaEvol = b.dataset.phEvol; aplicar(); }));

  // ---------------- Comparativo por años (ACT26b) ----------------
  const cmpChips = $("ph-cmp-anios");
  if (cmpChips) {
    cmpChips.innerHTML = svc.getAnios().map((a) => `<button type="button" class="ph-chip" data-ph-cmp-anio="${a}" aria-pressed="false">${a}</button>`).join("");
    cmpChips.querySelectorAll("[data-ph-cmp-anio]").forEach((b) => b.addEventListener("click", () => {
      const a = Number(b.dataset.phCmpAnio);
      state.cmpAnios = state.cmpAnios.includes(a) ? state.cmpAnios.filter((x) => x !== a) : state.cmpAnios.concat([a]).sort((x, y) => x - y);
      renderComparativo(true);
    }));
    $("ph-cmp-todos").addEventListener("click", () => { state.cmpAnios = svc.getAnios(); renderComparativo(true); });
    $("ph-cmp-ninguno").addEventListener("click", () => { state.cmpAnios = []; renderComparativo(true); });
    $("ph-cmp-ultimos").addEventListener("click", () => { state.cmpAnios = svc.getAnios().slice(-5); renderComparativo(true); });
    root.querySelectorAll("[data-ph-serie]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.phSerie;
      state.cmpSeries = state.cmpSeries.includes(k) ? state.cmpSeries.filter((x) => x !== k) : ORDEN_SERIES.filter((x) => x === k || state.cmpSeries.includes(x));
      renderComparativo(true);
    }));
  }

  // ---- Ranking (ACT26c) ----
  root.querySelectorAll("[data-ph-rank]").forEach((b) => b.addEventListener("click", () => {
    state.rankTipo = b.dataset.phRank === "bottom" ? "bottom" : "top";
    renderRanking();
  }));

  // ---- Reporte PDF (ACT26c) ----
  const btnPdf = $("ph-btn-pdf");
  if (btnPdf) {
    btnPdf.addEventListener("click", async () => {
      const estado = $("ph-pdf-estado");
      estado.classList.remove("is-error");
      if (typeof window.SNSP_generarReportePoblacionPDF !== "function") {
        estado.textContent = "El generador de PDF no está disponible."; estado.classList.add("is-error"); return;
      }
      btnPdf.disabled = true;
      estado.textContent = "Generando reporte…";
      try {
        const res = await window.SNSP_generarReportePoblacionPDF({ svc, state: Object.assign({}, state), descargar: true });
        estado.textContent = `Reporte generado: ${res.nombreArchivo} (${res.paginas} páginas).`;
        if (window.SNSP_AUTH && window.SNSP_AUTH.logAction) {
          try { window.SNSP_AUTH.logAction("descargar_reporte", `Población SUIVE — ${res.nombreArchivo}`); } catch (e) { /* no bloquear */ }
        }
      } catch (e) {
        estado.textContent = "No se pudo generar el reporte: " + (e && e.message ? e.message : e);
        estado.classList.add("is-error");
      } finally {
        btnPdf.disabled = false;
      }
    });
  }

  function renderComparativo(registrar) {
    if (!cmpChips) return;
    if (charts.cmp) { charts.cmp.destroy(); charts.cmp = null; }
    const geo = { js: state.js, cve: state.cve };
    const lugar = svc.describirLugar(geo);
    cmpChips.querySelectorAll("[data-ph-cmp-anio]").forEach((b) => b.setAttribute("aria-pressed", String(state.cmpAnios.includes(Number(b.dataset.phCmpAnio)))));
    root.querySelectorAll("[data-ph-serie]").forEach((b) => b.setAttribute("aria-pressed", String(state.cmpSeries.includes(b.dataset.phSerie))));
    const n = state.cmpAnios.length;
    $("ph-cmp-conteo").textContent = `(${n} de ${svc.getAnios().length} seleccionados)`;
    $("ph-cmp-titulo").textContent = `Comparativo poblacional por años — ${lugar}`;
    $("ph-cmp-ambito").innerHTML = `Área comparada: <strong>${lugar}</strong>${n ? ` · años: <strong>${state.cmpAnios.join(", ")}</strong>` : ""}`;

    const filas = svc.getComparativo(Object.assign({ anios: state.cmpAnios }, geo));
    const series = ORDEN_SERIES.filter((k) => state.cmpSeries.includes(k));
    const vacio = !filas.length || !series.length;
    $("ph-cmp-vacio").hidden = !vacio;
    $("ph-cmp-box").hidden = vacio;
    if (!vacio) {
      const comp = esCompacto();
      $("ph-cmp-box").style.height = comp ? Math.max(220, filas.length * (series.length * 19 + 14) + 70) + "px" : "400px";
      charts.cmp = SNSP_renderComparativoAnios("ph-chart-cmp", filas, series, { compacto: comp });
    }
    renderTablaComparativo(filas, series.length ? series : ORDEN_SERIES);
    if (registrar && window.SNSP_AUTH && window.SNSP_AUTH.logAction) {
      try { window.SNSP_AUTH.logAction("aplicar_filtros", `Módulo: Población histórica SUIVE — comparativo años ${state.cmpAnios.join(",")} — ${series.join(",")} — ${lugar}`); } catch (e) { /* no bloquear */ }
    }
  }

  function renderTablaComparativo(filas, series) {
    const NOM = { total: "Población total (mujeres + hombres)", mujeres: "Mujeres", hombres: "Hombres" };
    const KEY = { total: "Total", mujeres: "Mujeres", hombres: "Hombres" };
    if (!filas.length) { $("ph-cmp-tabla").innerHTML = ""; return; }
    const signo = (v) => (v > 0 ? "+" : v < 0 ? "−" : "");
    const celdaDif = (v) => `<td class="ph-num ${v > 0 ? "is-pos" : v < 0 ? "is-neg" : ""}">${signo(v)}${fmt(Math.abs(v))}</td>`;
    const celdaVar = (v) => `<td class="ph-num ${v > 0 ? "is-pos" : v < 0 ? "is-neg" : ""}">${signo(v)}${SNSP_formatPercent(Math.abs(v), 2)}</td>`;
    const head1 = `<tr><th rowspan="2" class="ph-sticky">Año</th><th rowspan="2">Referencia</th>${series.map((k) => `<th colspan="3" class="ph-grupo ph-grupo--${k}">${NOM[k]}</th>`).join("")}</tr>`;
    const head2 = `<tr>${series.map(() => `<th>Población</th><th>Diferencia</th><th>Variación %</th>`).join("")}</tr>`;
    const body = filas.map((f) => {
      const r = f.referencia;
      const ref = r ? `vs ${r.anio}${r.consecutivo ? "" : ` <span class="ph-cmp__aviso" title="Años no consecutivos">(${r.aniosEntre} años)</span>`}` : `<span class="ph-cmp__base">Año base</span>`;
      return `<tr><td class="ph-sticky"><strong>${f.anio}</strong></td><td>${ref}</td>` + series.map((k) =>
        `<td class="ph-num">${fmt(f[k])}</td>` + (r ? celdaDif(r["dif" + KEY[k]]) + celdaVar(r["var" + KEY[k]]) : `<td class="ph-num ph-na">—</td><td class="ph-num ph-na">—</td>`)
      ).join("") + `</tr>`;
    }).join("");
    $("ph-cmp-tabla").innerHTML = `<div class="ph-cmp__tabla-tit">Tabla comparativa — ${svc.describirLugar({ js: state.js, cve: state.cve })}. Diferencia y variación respecto al año seleccionado anterior (columna Referencia).<span class="ph-cmp__deslizar"> Desliza la tabla hacia los lados para ver todas las columnas →</span></div><div class="ph-cmp__scroll"><table class="ph-cmp__tabla"><thead>${head1}${head2}</thead><tbody>${body}</tbody></table></div>`;
  }

  function filtros() { return { anio: state.anio, js: state.js, cve: state.cve }; }

  // ---------------- Render ----------------
  function render() {
    destroy();
    const f = filtros();
    const lugar = svc.describirLugar(f);
    const r = svc.getResumen(f);

    $("ph-contexto").innerHTML = `<strong>${lugar}</strong> · año de referencia <strong>${state.anio}</strong>`;

    // ---- KPIs ----
    const crec = r.comparable
      ? { value: `${r.crecimientoPct >= 0 ? "+" : ""}${SNSP_formatPercent(r.crecimientoPct, 2)}`, footnote: `${r.crecimientoAbs >= 0 ? "+" : ""}${fmt(r.crecimientoAbs)} hab. vs ${r.anioAnterior}` }
      : { value: "No disponible", footnote: `${state.anio} es el primer año de la serie` };
    $("ph-kpis").innerHTML = [
      { label: "Población total", value: fmt(r.total), accent: "var(--ph-total)", footnote: `${lugar}, ${state.anio}` },
      { label: "Mujeres", value: fmt(r.mujeres), accent: "var(--ph-mujeres)", footnote: `${SNSP_formatPercent(r.pctMujeres, 1)} de la población total` },
      { label: "Hombres", value: fmt(r.hombres), accent: "var(--ph-hombres)", footnote: `${SNSP_formatPercent(r.pctHombres, 1)} de la población total` },
      { label: "Crecimiento anual", value: crec.value, accent: "var(--c-verde-claro)", footnote: crec.footnote },
    ].map(SNSP_indicatorCardHTML).join("");

    // ---- Estructura poblacional (ACT26c) ----
    const est = svc.getEstructura(f);
    $("ph-kpis-estructura").innerHTML = [
      { label: "% Mujeres", value: SNSP_formatPercent(est.pctMujeres, 1), accent: "var(--ph-mujeres)", footnote: `${fmt(est.mujeres)} ÷ ${fmt(est.total)} hab. (población total)` },
      { label: "% Hombres", value: SNSP_formatPercent(est.pctHombres, 1), accent: "var(--ph-hombres)", footnote: `${fmt(est.hombres)} ÷ ${fmt(est.total)} hab. (población total)${r.razonHM ? " · " + r.razonHM.toFixed(1) + " hombres por cada 100 mujeres" : ""}` },
      { label: "Población de 65 años y más", value: fmt(est.pob65), accent: "var(--c-gris-oscuro)", footnote: `Mujeres ${fmt(est.pob65Mujeres)} · Hombres ${fmt(est.pob65Hombres)}` },
      { label: "% de 65 años y más", value: SNSP_formatPercent(est.pct65, 1), accent: "var(--c-beige)", footnote: `${fmt(est.pob65)} ÷ ${fmt(est.total)} hab. (población total)` },
    ].map(SNSP_indicatorCardHTML).join("");

    // ---- Población por sexo y grupo de edad (ACT26c: sustituye a la pirámide) ----
    const pir = svc.getPiramide(f);
    $("ph-sexoedad-titulo").textContent = `Población por sexo y grupo de edad — ${lugar}, ${state.anio}`;
    $("ph-sexoedad-sub").textContent = state.modo === "pct"
      ? "Porcentaje de cada grupo de edad y sexo sobre el total de población mostrada (todas las barras suman 100%)"
      : "Habitantes por sexo en cada uno de los 11 grupos de edad de la base (valores absolutos)";
    charts.sexoedad = SNSP_renderBarrasSexoEdad("ph-chart-sexoedad", pir, { modo: state.modo, compacto: esCompacto() });

    // ---- Composición (grandes grupos exactos a partir de los intervalos de la fuente) ----
    renderComposicion(pir);
    renderTablaEdad();

    // ---- Mapa (siempre los 18 municipios, año seleccionado) ----
    const porMunTodos = svc.getPorMunicipio({ anio: state.anio });
    const valores = {};
    porMunTodos.forEach((m) => { valores[m.cve] = m.total; });
    $("ph-mapa-titulo").textContent = `Población por municipio, ${state.anio}`;
    SNSP_renderMapaCoropleticoQro("ph-mapa", "ph-mapa-leyenda", valores, {
      unidad: " hab.",
      jsActiva: state.js,
      cveSeleccionada: state.cve,
      tituloLeyenda: `Habitantes ${state.anio}`,
      onSelect: (cve) => setMunicipio(cve),
      detalle: (cve) => {
        const m = porMunTodos.find((x) => x.cve === cve);
        return m ? `<span>Mujeres ${fmt(m.mujeres)} · Hombres ${fmt(m.hombres)}</span><em>Clic para filtrar</em>` : "";
      },
    });

    // ---- Evolución 2017-2026 ----
    const serie = svc.getSerie(f);
    $("ph-evol-titulo").textContent = `Evolución poblacional 2017–2026 — ${lugar}`;
    const s0 = serie[0], sN = serie[serie.length - 1];
    $("ph-evol-sub").textContent = `Población de cada año (no acumulada). ${s0.anio}: ${fmt(s0.total)} → ${sN.anio}: ${fmt(sN.total)} hab. (${sN.total >= s0.total ? "+" : ""}${SNSP_formatPercent(((sN.total - s0.total) / s0.total) * 100, 1)} en el periodo)`;
    charts.evol = SNSP_renderEvolucionPoblacion("ph-chart-evol", serie, { vista: state.vistaEvol, anioSel: state.anio });

    // ---- Comparativo por años (ACT26b): misma área geográfica, años elegidos ----
    renderComparativo(false);

    // ---- Ranking municipal (ACT26c) ----
    renderRanking();

    // ---- Jurisdicciones ----
    const porJs = svc.getPorJurisdiccion({ anio: state.anio });
    $("ph-js-titulo").textContent = `Población por jurisdicción sanitaria, ${state.anio}`;
    const totalEstado = porJs.reduce((a, j) => a + j.total, 0);
    charts.js = SNSP_renderBarrasPH("ph-chart-js", porJs.map((j) => j.etiqueta), porJs.map((j) => j.total), {
      maxBarThickness: 34, ejeTitulo: "Habitantes", totalReferencia: totalEstado, etiquetaReferencia: "del estado", holgura: 1.55,
      formatter: (v) => `${SNSP_formatCompacto(v)} (${SNSP_formatPercent(totalEstado ? (v / totalEstado) * 100 : 0, 1)})`,
      resaltar: porJs.map((j) => state.js === j.js),
    });

    // ---- Municipios ----
    const porMun = svc.getPorMunicipio({ anio: state.anio, js: state.js });
    $("ph-mun-titulo").textContent = state.js
      ? `Población por municipio — ${svc.describirLugar({ js: state.js })}, ${state.anio}`
      : `Población por municipio — Estado de Querétaro, ${state.anio}`;
    $("ph-mun-sub").textContent = `${porMun.length} municipios ordenados de mayor a menor población${state.cve ? " · resaltado: municipio seleccionado" : ""}`;
    $("ph-mun-box").style.height = Math.max(220, porMun.length * 30 + 60) + "px";
    const totalMun = porMun.reduce((a, m) => a + m.total, 0);
    charts.mun = SNSP_renderBarrasPH("ph-chart-mun", porMun.map((m) => m.nombre), porMun.map((m) => m.total), {
      maxBarThickness: 22, ejeTitulo: "Habitantes", totalReferencia: totalMun,
      etiquetaReferencia: state.js ? "de la jurisdicción" : "del estado",
      resaltar: porMun.map((m) => state.cve === m.cve),
    });
  }

  function renderRanking() {
    if (!$("ph-chart-rank")) return;
    if (charts.rank) { charts.rank.destroy(); charts.rank = null; }
    root.querySelectorAll("[data-ph-rank]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.phRank === state.rankTipo)));
    const rk = svc.getRanking({ anio: state.anio, js: state.js, cve: state.cve, tipo: state.rankTipo, n: 5 });
    const top = state.rankTipo === "top";
    $("ph-rank-titulo").textContent = `${top ? "Municipios más poblados" : "Municipios menos poblados"} — ${rk.ambito}, ${state.anio}`;
    $("ph-rank-sub").textContent = top
      ? `Los ${Math.min(5, rk.universo)} con mayor población de ${rk.universo} municipios (número = lugar en el ámbito)`
      : `Los ${Math.min(5, rk.universo)} con menor población de ${rk.universo} municipios (número = lugar en el ámbito, de mayor a menor)`;
    $("ph-rank-box").style.height = Math.max(180, rk.items.length * 42 + 60) + "px";
    charts.rank = SNSP_renderRankingMunicipal("ph-chart-rank", rk.items, { tipo: rk.tipo, cveResaltado: state.cve, compacto: esCompacto() });
    const notas = [];
    if (rk.posicion) notas.push(`<strong>${rk.posicion.nombre}</strong> ocupa el lugar <strong>${rk.posicion.enJurisdiccion} de ${rk.posicion.deJurisdiccion}</strong> en su jurisdicción y el <strong>${rk.posicion.enEstado} de ${rk.posicion.deEstado}</strong> en el estado (resaltado en dorado si aparece en el ranking).`);
    if (rk.nota) notas.push(rk.nota);
    notas.push("El ranking usa el año seleccionado en el filtro superior.");
    $("ph-rank-nota").innerHTML = notas.join(" ");
  }

  function renderComposicion(pir) {
    // ACT26c.1: "Resumen demográfico". Grupos = sumas exactas de intervalos de
    // la fuente (0–14 = 0 + 1–4 + 5–9 + 10–14; 15–64 = 15–19 … 60–64; 65 y más).
    // Índices desde el servicio (getEstructura), la misma fuente que usa el PDF.
    const est = svc.getEstructura(filtros());
    const idx = { "0–14": [0, 1, 2, 3], "15–64": [4, 5, 6, 7, 8, 9], "65 y más": [10] };
    const sum = (arr, ids) => ids.reduce((a, i) => a + arr[i], 0);
    const filas = Object.entries(idx).map(([k, ids]) => {
      const h = sum(pir.hombres, ids), m = sum(pir.mujeres, ids);
      return { k, h, m, t: h + m };
    });
    const T = pir.total || 1;
    const dep = est.indiceDependencia, env = est.indiceEnvejecimiento;
    $("ph-composicion").innerHTML = `
      <div class="ph-comp__barra" role="img" aria-label="Distribución por grandes grupos de edad">
        ${filas.map((x, i) => `<span class="ph-comp__seg ph-comp__seg--${i}" style="width:${(x.t / T) * 100}%"></span>`).join("")}
      </div>
      <table class="ph-comp__tabla">
        <thead><tr><th>Grupo</th><th>Hombres</th><th>Mujeres</th><th>Total</th><th title="Denominador: población total del área y año">% del total</th></tr></thead>
        <tbody>${filas.map((x, i) => `<tr><td><span class="ph-comp__dot ph-comp__seg--${i}"></span>${x.k}</td><td>${fmt(x.h)}</td><td>${fmt(x.m)}</td><td>${fmt(x.t)}</td><td>${SNSP_formatPercent((x.t / T) * 100, 1)}</td></tr>`).join("")}</tbody>
      </table>
      <div class="ph-comp__ind">
        <div><span>Índice de dependencia</span><strong>${dep !== null ? dep.toFixed(1) : "—"}</strong><small>(0–14 + 65 y más) ÷ 15–64 × 100: personas en edades dependientes por cada 100 de 15 a 64 años</small></div>
        <div><span>Índice de envejecimiento</span><strong>${env !== null ? env.toFixed(1) : "—"}</strong><small>65 y más ÷ 0–14 × 100: personas de 65 años y más por cada 100 de 0 a 14 años</small></div>
      </div>`;
  }

  // ACT26c.1 — Tabla de los 11 grupos con denominadores explícitos (plegable).
  function renderTablaEdad() {
    const el = $("ph-tabla-edad");
    if (!el) return;
    const te = svc.getTablaEdad(filtros());
    const lugar = state.cve ? svc.describirLugar(filtros()) : state.js ? "la " + svc.describirLugar(filtros()) : "el estado de Querétaro";
    el.innerHTML = `<div class="ph-te__deslizar">Desliza la tabla hacia los lados para ver todas las columnas →</div><table class="ph-te__tabla">
      <thead>
        <tr><th rowspan="2" class="ph-sticky">Grupo de edad</th><th rowspan="2" title="Años que abarca el intervalo">Amplitud<br>(años)</th><th colspan="2" class="ph-grupo ph-grupo--total">Población del grupo</th><th colspan="2" class="ph-grupo ph-grupo--hombres">Hombres</th><th colspan="2" class="ph-grupo ph-grupo--mujeres">Mujeres</th></tr>
        <tr><th>Habitantes</th><th title="Denominador: población total">% del total</th><th>Habitantes</th><th title="Denominador: población del grupo">% del grupo</th><th>Habitantes</th><th title="Denominador: población del grupo">% del grupo</th></tr>
      </thead>
      <tbody>${te.filas.map((r) => `<tr><td class="ph-sticky">${r.grupo}</td><td class="ph-te__amp">${r.amplitud ? r.amplitud : "abierto"}</td><td class="ph-num">${fmt(r.total)}</td><td class="ph-num">${SNSP_formatPercent(r.pctDelTotal, 1)}</td><td class="ph-num">${fmt(r.hombres)}</td><td class="ph-num">${SNSP_formatPercent(r.pctHombresDelGrupo, 1)}</td><td class="ph-num">${fmt(r.mujeres)}</td><td class="ph-num">${SNSP_formatPercent(r.pctMujeresDelGrupo, 1)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td class="ph-sticky">Total</td><td></td><td class="ph-num">${fmt(te.total)}</td><td class="ph-num">100.0%</td><td class="ph-num">${fmt(te.hombres)}</td><td class="ph-num">${SNSP_formatPercent(te.pctHombres, 1)}</td><td class="ph-num">${fmt(te.mujeres)}</td><td class="ph-num">${SNSP_formatPercent(te.pctMujeres, 1)}</td></tr></tfoot>
    </table>
    <p class="ph-te__nota"><strong>Denominadores:</strong> "% del total" = población del grupo ÷ población total de ${lugar} en ${state.anio}. "% del grupo" = hombres (o mujeres) del grupo ÷ población de ese grupo; ambos suman 100%. En la fila Total, el % de hombres y mujeres es sobre la población total.</p>`;
  }

  function aplicar() {
    sincronizarControles();
    render();
    if (window.SNSP_AUTH && window.SNSP_AUTH.logAction) {
      try { window.SNSP_AUTH.logAction("aplicar_filtros", `Módulo: Población histórica SUIVE — ${JSON.stringify(filtros())} — modo ${state.modo}`); } catch (e) { /* no bloquear */ }
    }
  }

  // Re-render al cambiar entre teléfono/escritorio (etiquetas compactas).
  let ultimoCompacto = esCompacto();
  window.addEventListener("resize", () => {
    const c = esCompacto();
    if (c !== ultimoCompacto) { ultimoCompacto = c; render(); }
  });

  sincronizarControles();
  render();

  return {
    getState: () => Object.assign({}, state),
    setFiltros: (n) => { Object.assign(state, n); if (n.cve) setMunicipio(n.cve); else aplicar(); },
    rerender: render,
    charts: () => charts,
  };
}
