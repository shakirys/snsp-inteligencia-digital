/**
 * modules/poblacionReportePDF.js  (ACT26c — NUEVO)
 * -----------------------------------------------------------------------
 * Reporte ejecutivo de población (PDF) de la sección "Población histórica
 * SUIVE 2017-2026". Se genera en el navegador con jsPDF + autoTable (las
 * mismas versiones que ya usan Morbilidad y Canal endémico) a partir de
 * SNSP_POBLACION_HISTORICA_SERVICE y del estado de filtros vigente:
 * año de referencia, jurisdicción / municipio y años del comparativo.
 *
 * Todo lo que aparece en el PDF se calcula de la base; no se escriben
 * cifras a mano ni se generan datos ficticios. Si un apartado no aplica al
 * ámbito o a la selección, se indica explícitamente en el reporte.
 *
 * La base se identifica como "base de población utilizada en SUIVE
 * Querétaro"; no se atribuye a CONAPO ni a otra institución.
 *
 * API: SNSP_generarReportePoblacionPDF({ svc, state, descargar }) -> Promise<{
 *   doc, nombreArchivo, paginas, contenido }>  (contenido = cifras usadas,
 *   para pruebas). También deja window.SNSP_PH_ULTIMO_REPORTE (sin doc).
 * -----------------------------------------------------------------------
 */
(function () {
  const C = {
    vino: [97, 18, 50], dorado: [165, 127, 44], beige: [230, 209, 148], beigeClaro: [248, 243, 230],
    grisOscuro: [77, 77, 77], gris: [152, 152, 154], grisClaro: [228, 224, 214], texto: [34, 32, 29], blanco: [255, 255, 255],
    verde: [0, 47, 42],
  };
  const PAG = { w: 612, h: 792, m: 40 };
  const ANCHO = PAG.w - PAG.m * 2;
  const FUENTE = "Base de población utilizada en SUIVE Querétaro, 2017-2026 (BASE_POBLACION_SUIVE_QRO_2017_2026_PLANA.xlsx).";

  // Helvetica de jsPDF usa WinAnsi: se sustituyen los pocos caracteres
  // fuera de ese juego para que nunca aparezcan símbolos rotos.
  function t(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/−/g, "-").replace(/→/g, "a").replace(/[   ]/g, " ")
      .replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/✓/g, "");
  }
  const n0 = (v) => Math.round(v).toLocaleString("es-MX");
  const pct = (v, d) => (v === null || v === undefined || isNaN(v) ? "—" : Number(v).toFixed(d === undefined ? 1 : d) + "%");
  const signo = (v) => (v > 0 ? "+" : v < 0 ? "-" : "");
  const difTxt = (v) => signo(Math.round(v)) + n0(Math.abs(v));
  const varTxt = (v) => (v === null || v === undefined ? "—" : signo(v) + Math.abs(v).toFixed(2) + "%");

  function slug(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  // ---------- imágenes auxiliares ----------
  function cargarImagen(src, anchoMax) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const f = Math.min(1, anchoMax / img.naturalWidth);
          const cv = document.createElement("canvas");
          cv.width = Math.round(img.naturalWidth * f); cv.height = Math.round(img.naturalHeight * f);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          resolve({ data: cv.toDataURL("image/png"), w: cv.width, h: cv.height });
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Renderiza una gráfica Chart.js fuera de pantalla con tamaño fijo y la
  // devuelve como PNG (sin animación). fn(canvasId) debe crear la gráfica.
  function graficaPNG(w, h, fn) {
    const cont = document.createElement("div");
    cont.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;background:#fff;`;
    const id = "ph-pdf-cv-" + Math.random().toString(36).slice(2);
    cont.innerHTML = `<canvas id="${id}"></canvas>`;
    document.body.appendChild(cont);
    let chart = null;
    try {
      chart = fn(id);
      if (!chart) return null;
      chart.update("none"); // sin animación: dibujo completo inmediato
      // fondo blanco para que el PNG no quede transparente
      const src = chart.canvas;
      const out = document.createElement("canvas");
      out.width = src.width; out.height = src.height;
      const ctx = out.getContext("2d");
      ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(src, 0, 0);
      return { data: out.toDataURL("image/png"), w, h };
    } catch (e) {
      return null;
    } finally {
      if (chart) chart.destroy();
      cont.remove();
    }
  }

  // Mapa: dibuja los 18 polígonos (SVG path -> Path2D) en un canvas.
  // ACT26c.1: misma clasificación (quintiles por rango, rangos reales sin
  // límites compartidos) y misma rampa que el tablero; límites con doble
  // trazo (blanco + gris oscuro) y área seleccionada con halo + contorno.
  function mapaPNG(valores, opts) {
    const geo = window.SNSP_GEO_QRO_MUNICIPIOS;
    if (!geo || typeof Path2D === "undefined" || typeof SNSP_clasificarMunicipiosQuintiles !== "function") return null;
    const vb = geo.viewBox.split(" ").map(Number);
    const esc = 2.2;
    const cv = document.createElement("canvas");
    cv.width = Math.round(vb[2] * esc); cv.height = Math.round(vb[3] * esc);
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.scale(esc, esc);
    ctx.lineJoin = "round";
    const rampa = SNSP_MAPA_RAMPA.slice();
    const cls5 = SNSP_clasificarMunicipiosQuintiles(valores, 5);
    const dentro = (f) => (opts.cve ? f.cve === opts.cve : opts.js ? f.js === Number(opts.js) : true);
    try {
      const paths = geo.features.map((f) => ({ f, p: new Path2D(f.d) }));
      paths.forEach(({ f, p }) => {
        ctx.globalAlpha = dentro(f) ? 1 : 0.3;
        ctx.fillStyle = rampa[cls5.claseDe[f.cve]];
        ctx.fill(p);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2.2; ctx.stroke(p);
      });
      paths.forEach(({ p }) => { ctx.strokeStyle = "#3A3A3A"; ctx.lineWidth = 0.8; ctx.stroke(p); });
      const sel = paths.filter(({ f }) => (opts.cve || opts.js) && dentro(f));
      sel.forEach(({ p }) => { ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = opts.cve ? 6 : 4.5; ctx.stroke(p); });
      sel.forEach(({ p }) => { ctx.strokeStyle = "#1B1714"; ctx.lineWidth = opts.cve ? 2.6 : 1.8; ctx.stroke(p); });
      if (opts.cve) {
        const f = geo.features.find((x) => x.cve === opts.cve);
        if (f && f.centroide) {
          ctx.font = "bold 18px Helvetica, Arial, sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 5;
          ctx.strokeStyle = "#FFFFFF"; ctx.strokeText(f.nombre, f.centroide[0], f.centroide[1]);
          ctx.fillStyle = "#1B1714"; ctx.fillText(f.nombre, f.centroide[0], f.centroide[1]);
        }
      }
    } catch (e) { return null; }
    return { data: cv.toDataURL("image/png"), w: vb[2], h: vb[3], rampa, clases: cls5.clases };
  }

  // ---------- interpretación descriptiva (sólo a partir de los datos) ----------
  // "el estado de Querétaro" / "la Jurisdicción Sanitaria 2 ..." / "Corregidora"
  function conArticulo(lugar, geoF) {
    if (geoF.cve) return lugar;
    if (geoF.js) return "la " + lugar;
    return "el estado de Querétaro";
  }

  function interpretar(ctx) {
    const { anio, res, est, serie, comp, rk } = ctx;
    const lugar = conArticulo(ctx.lugar, ctx.geoF);
    const L = [];
    L.push(`En ${anio}, ${lugar} cuenta con ${n0(res.total)} habitantes según la base de población utilizada en SUIVE Querétaro.`);
    L.push(`Las mujeres representan el ${pct(est.pctMujeres)} (${n0(est.mujeres)}) y los hombres el ${pct(est.pctHombres)} (${n0(est.hombres)}); hay ${res.razonHM ? res.razonHM.toFixed(1) : "—"} hombres por cada 100 mujeres.`);
    L.push(`La población de 65 años y más representa el ${pct(est.pct65)} del total; por cada 100 personas de 15 a 64 años hay ${est.indiceDependencia === null ? "—" : est.indiceDependencia.toFixed(1)} en edades dependientes (0 a 14 y 65 años y más).`);
    if (res.comparable) {
      L.push(`Respecto a ${res.anioAnterior}, la población ${res.crecimientoAbs >= 0 ? "aumentó" : "disminuyó"} en ${n0(Math.abs(res.crecimientoAbs))} habitantes (${varTxt(res.crecimientoPct)}).`);
    } else {
      L.push(`${anio} es el primer año de la serie, por lo que no hay año previo para calcular la variación anual.`);
    }
    const s0 = serie[0], sN = serie[serie.length - 1];
    const caidas = serie.slice(1).filter((s, i) => s.total < serie[i].total).length;
    L.push(`En la serie ${s0.anio}-${sN.anio}, la población pasó de ${n0(s0.total)} a ${n0(sN.total)} habitantes (${varTxt(((sN.total - s0.total) / s0.total) * 100)} en el periodo)` +
      (caidas ? `; en ${caidas} de los ${serie.length - 1} cambios anuales la población disminuyó.` : "; aumentó en todos los cambios anuales."));
    if (comp.length >= 2) {
      const a = comp[0], b = comp[comp.length - 1];
      L.push(`Entre ${a.anio} y ${b.anio} (años seleccionados en el comparativo), la diferencia es de ${difTxt(b.total - a.total)} habitantes (${varTxt(((b.total - a.total) / a.total) * 100)}).`);
    }
    if (rk) {
      if (rk.posicion) {
        L.push(`${rk.posicion.nombre} ocupa el lugar ${rk.posicion.enEstado} de ${rk.posicion.deEstado} municipios del estado por población y el ${rk.posicion.enJurisdiccion} de ${rk.posicion.deJurisdiccion} en su jurisdicción.`);
      } else if (rk.top.items.length) {
        const t1 = rk.top.items[0], b1 = rk.bottom.items[0];
        const amb = rk.top.jsUniverso ? "la " + rk.top.ambito : "el estado";
        L.push(`En ${amb}, ${t1.nombre} es el municipio más poblado (${n0(t1.total)}; ${pct(t1.pctUniverso)} del ámbito) y ${b1.nombre} el menos poblado (${n0(b1.total)}).`);
        if (rk.top.universo > 5) {
          const conc = rk.top.items.reduce((x, m) => x + m.total, 0) / rk.top.totalUniverso * 100;
          L.push(`Los cinco municipios más poblados concentran el ${pct(conc)} de la población del ámbito.`);
        }
      }
    }
    return L;
  }

  async function generar(opciones) {
    opciones = opciones || {};
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("No se pudo cargar el generador de PDF (jsPDF). Verifica la conexión a internet.");
    const svc = opciones.svc || window.SNSP_POBLACION_HISTORICA_SERVICE;
    const st = opciones.state || {};
    const anio = Number(st.anio || svc.getAnioMasReciente());
    const geoF = { js: st.js || null, cve: st.cve || null };
    const f = Object.assign({ anio }, geoF);
    const lugar = svc.describirLugar(geoF);
    const ambitoTipo = geoF.cve ? "Municipio" : geoF.js ? "Jurisdicción sanitaria" : "Estado";
    const cat = svc.getCatalogos();
    const munSel = geoF.cve ? cat.municipios.find((m) => m.cve === geoF.cve) : null;

    // ----- datos (todos del servicio) -----
    const res = svc.getResumen(f);
    const est = svc.getEstructura(f);
    const pir = svc.getPiramide(f);
    const serie = svc.getSerie(geoF);
    const cmpAnios = (st.cmpAnios || []).slice();
    const comp = svc.getComparativo(Object.assign({ anios: cmpAnios }, geoF));
    const rkTop = svc.getRanking(Object.assign({ anio, tipo: "top", n: 5 }, geoF));
    const rkBottom = svc.getRanking(Object.assign({ anio, tipo: "bottom", n: 5 }, geoF));
    const porMun = svc.getPorMunicipio({ anio });
    const valoresMapa = {}; porMun.forEach((m) => { valoresMapa[m.cve] = m.total; });
    const ahora = new Date();
    const fechaGen = ahora.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }) + ", " + ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    const aniosConsultados = [anio].concat(comp.map((c) => c.anio)).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    let y = PAG.m;
    const nuevaPagina = () => { doc.addPage("letter", "portrait"); y = PAG.m + 14; };
    const espacio = (h) => { if (y + h > PAG.h - 54) nuevaPagina(); };

    function seccion(titulo, sub) {
      espacio(sub ? 60 : 46);
      doc.setFillColor(...C.dorado); doc.rect(PAG.m, y, 4, 15, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...C.vino);
      doc.text(t(titulo), PAG.m + 11, y + 11.5);
      y += 22;
      if (sub) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.8); doc.setTextColor(...C.grisOscuro);
        doc.splitTextToSize(t(sub), ANCHO).forEach((l) => { doc.text(l, PAG.m, y); y += 11.4; });
        y += 3;
      }
      doc.setTextColor(...C.texto);
    }
    function parrafo(txt, opt) {
      opt = opt || {};
      doc.setFont("helvetica", opt.bold ? "bold" : "normal"); doc.setFontSize(opt.size || 9); doc.setTextColor(...(opt.color || C.texto));
      doc.splitTextToSize(t(txt), opt.ancho || ANCHO).forEach((l) => { espacio(12); doc.text(l, opt.x || PAG.m, y); y += (opt.size || 9) + 3; });
    }
    function aviso(txt) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5);
      const lineas = doc.splitTextToSize(t(txt), ANCHO - 20);
      const h = lineas.length * 11 + 12;
      espacio(h + 6);
      doc.setFillColor(...C.beigeClaro); doc.setDrawColor(...C.beige); doc.roundedRect(PAG.m, y, ANCHO, h, 4, 4, "FD");
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(...C.grisOscuro);
      lineas.forEach((l, i) => doc.text(l, PAG.m + 10, y + 15 + i * 11));
      y += h + 10; doc.setTextColor(...C.texto);
    }
    function tabla(head, body, opt) {
      opt = opt || {};
      doc.autoTable(Object.assign({
        startY: y, margin: { left: PAG.m, right: PAG.m, bottom: 56, top: PAG.m + 14 },
        head, body: body.map((r) => r.map(t)),
        theme: "grid",
        styles: { font: "helvetica", fontSize: opt.fontSize || 8.8, cellPadding: 3.2, textColor: C.texto, lineColor: C.grisClaro, lineWidth: 0.4 },
        headStyles: { fillColor: C.vino, textColor: C.blanco, fontStyle: "bold", halign: "center", valign: "middle" },
        alternateRowStyles: { fillColor: C.beigeClaro },
      }, opt.extra || {}));
      y = doc.lastAutoTable.finalY + 12;
    }
    function imagen(img, ancho, maxAlto) {
      if (!img) { aviso("La imagen de esta gráfica no pudo generarse en este navegador; los valores se incluyen en la tabla."); return; }
      let w = ancho, h = (img.h / img.w) * w;
      if (maxAlto && h > maxAlto) { h = maxAlto; w = (img.w / img.h) * h; }
      espacio(h + 6);
      doc.addImage(img.data, "PNG", PAG.m + (ANCHO - w) / 2, y, w, h, undefined, "FAST");
      y += h + 8;
    }

    // =================== PÁGINA 1: encabezado ===================
    const logo = await cargarImagen(opciones.logoSrc || "../assets/logos/logo-snsp-web.png", 420);
    if (logo) {
      const lh = 40, lw = (logo.w / logo.h) * lh;
      doc.addImage(logo.data, "PNG", PAG.m, y - 6, lw, lh, undefined, "FAST");
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...C.vino);
    doc.text(t("SNSP Querétaro — Inteligencia e Información"), PAG.w - PAG.m, y + 8, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...C.grisOscuro);
    const inst = (window.SNSP_CONFIG && window.SNSP_CONFIG.institution && window.SNSP_CONFIG.institution.fullName) || "";
    if (inst) doc.text(t(inst), PAG.w - PAG.m, y + 21, { align: "right" });
    doc.text(t("SNSP Inteligencia Digital · Módulo Población"), PAG.w - PAG.m, y + 32, { align: "right" });
    y += 44;
    doc.setDrawColor(...C.dorado); doc.setLineWidth(1.6); doc.line(PAG.m, y, PAG.w - PAG.m, y); doc.setLineWidth(0.5);
    y += 26;
    doc.setFont("times", "bold"); doc.setFontSize(22); doc.setTextColor(...C.vino);
    doc.text(t("Reporte ejecutivo de población"), PAG.m, y);
    y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(...C.grisOscuro);
    doc.text(t(`${lugar} · año de referencia ${anio}`), PAG.m, y);
    y += 14;

    // Ficha de consulta
    const ficha = [
      ["Ámbito geográfico", `${ambitoTipo}: ${lugar}` + (munSel ? ` (CVEGEO ${munSel.cvegeo}, Jurisdicción Sanitaria ${munSel.js})` : "")],
      ["Año de referencia", `${anio} (indicadores, distribución por sexo y edad, ranking y mapa)`],
      ["Años del comparativo", comp.length ? comp.map((c) => c.anio).join(", ") : "Ninguno seleccionado"],
      ["Años consultados", aniosConsultados.join(", ") + " · evolución histórica: 2017-2026"],
      ["Fuente", "Base de población utilizada en SUIVE Querétaro (2017-2026)"],
      ["Fecha de generación", fechaGen],
    ];
    tabla([], ficha, { fontSize: 9, extra: { theme: "plain", styles: { cellPadding: 2.5, fontSize: 9 }, columnStyles: { 0: { fontStyle: "bold", textColor: C.vino, cellWidth: 118 } }, alternateRowStyles: {} } });

    // ---------- Tarjetas KPI (cifra + % con denominador explícito) ----------
    const kpis = [
      { l: "Población total", v: n0(res.total), s: res.comparable ? `${varTxt(res.crecimientoPct)} vs ${res.anioAnterior}` : "Primer año de la serie", c: C.verde },
      { l: "Mujeres", v: n0(est.mujeres), s: `${pct(est.pctMujeres)} de la población total`, c: C.vino },
      { l: "Hombres", v: n0(est.hombres), s: `${pct(est.pctHombres)} de la población total`, c: C.dorado },
      { l: "65 años y más", v: n0(est.pob65), s: `${pct(est.pct65)} de la población total`, c: C.grisOscuro },
    ];
    espacio(74);
    const kw = (ANCHO - 3 * 10) / 4;
    kpis.forEach((k, i) => {
      const x = PAG.m + i * (kw + 10);
      doc.setFillColor(...C.beigeClaro); doc.setDrawColor(...C.grisClaro); doc.roundedRect(x, y, kw, 64, 5, 5, "FD");
      doc.setFillColor(...k.c); doc.rect(x, y, kw, 4, "F");
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...C.grisOscuro); doc.text(t(k.l), x + 9, y + 19);
      doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(...C.texto); doc.text(t(k.v), x + 9, y + 40);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(...C.grisOscuro); doc.text(t(k.s), x + 9, y + 55);
    });
    y += 78;

    // ---------- Interpretación (se conserva en la página 1) ----------
    const rkCtx = (geoF.cve ? { posicion: rkTop.posicion } : { top: rkTop, bottom: rkBottom });
    const interp = interpretar({ lugar, geoF, anio, res, est, serie, comp, rk: rkCtx });
    seccion("Interpretación descriptiva", "Generada automáticamente a partir de la base; describe los datos sin atribuir causas.");
    interp.forEach((l) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.4);
      const lineas = doc.splitTextToSize(t(l), ANCHO - 14);
      espacio(lineas.length * 12.2 + 3);
      doc.setFillColor(...C.dorado); doc.circle(PAG.m + 3, y - 3.2, 1.7, "F");
      doc.setTextColor(...C.texto);
      lineas.forEach((ln) => { doc.text(ln, PAG.m + 12, y); y += 12.2; });
      y += 2.6;
    });
    y += 6;

    // ---------- Resumen demográfico (recuadro discreto, página 1) ----------
    {
      const celdas = [
        { l: "0 a 14 años", v: n0(est.pob0a14), s: `${pct(est.pct0a14)} del total` },
        { l: "15 a 64 años", v: n0(est.pob15a64), s: `${pct(est.pct15a64)} del total` },
        { l: "65 años y más", v: n0(est.pob65), s: `${pct(est.pct65)} del total` },
        { l: "Índice de dependencia", v: est.indiceDependencia === null ? "—" : est.indiceDependencia.toFixed(1), s: "por cada 100 de 15-64" },
        { l: "Índice de envejecimiento", v: est.indiceEnvejecimiento === null ? "—" : est.indiceEnvejecimiento.toFixed(1), s: "65+ por cada 100 de 0-14" },
      ];
      const defin = "Grupos = sumas exactas de los intervalos de la base (0-14 = 0, 1-4, 5-9 y 10-14; 15-64 = 15-19 a 60-64). " +
        "Dependencia = (0-14 + 65 y más) / 15-64 x 100. Envejecimiento = 65 y más / 0-14 x 100. Porcentajes sobre la población total.";
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.6);
      const dl = doc.splitTextToSize(t(defin), ANCHO - 20);
      const alto = 22 + 46 + dl.length * 9.5 + 10;
      espacio(alto + 4);
      doc.setFillColor(...C.beigeClaro); doc.setDrawColor(...C.beige); doc.setLineWidth(0.8);
      doc.roundedRect(PAG.m, y, ANCHO, alto, 5, 5, "FD"); doc.setLineWidth(0.5);
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...C.vino);
      doc.text(t(`Resumen demográfico — ${lugar}, ${anio}`), PAG.m + 10, y + 15);
      const cw = (ANCHO - 20) / 5;
      celdas.forEach((c, i) => {
        const x = PAG.m + 10 + i * cw;
        if (i) { doc.setDrawColor(...C.beige); doc.line(x - 4, y + 25, x - 4, y + 64); }
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(...C.grisOscuro); doc.text(t(c.l), x, y + 32);
        doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...C.texto); doc.text(t(c.v), x, y + 48);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.4); doc.setTextColor(...C.grisOscuro); doc.text(t(c.s), x, y + 60);
      });
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.6); doc.setTextColor(...C.grisOscuro);
      dl.forEach((ln, i) => doc.text(ln, PAG.m + 10, y + 78 + i * 9.5));
      y += alto + 8;
    }

    // =================== PÁGINA 2: Territorio + ranking ===================
    const mapa = mapaPNG(valoresMapa, geoF);
    nuevaPagina();
    seccion(`Territorio — población por municipio, ${anio}`,
      geoF.cve || geoF.js ? `Se resalta ${lugar} con contorno oscuro; el resto del estado se muestra atenuado como contexto.` : "Los 18 municipios del estado de Querétaro.");
    if (mapa) {
      const mh = 318, mw = (mapa.w / mapa.h) * mh;
      espacio(mh + 6);
      doc.addImage(mapa.data, "PNG", PAG.m, y, mw, mh, undefined, "FAST");
      const lx = PAG.m + mw + 22; let ly = y + 14;
      const lw = PAG.w - PAG.m - lx;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...C.texto); doc.text(t(`Habitantes ${anio}`), lx, ly); ly += 12;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.6); doc.setTextColor(...C.grisOscuro); doc.text(t("Clases de mayor a menor población"), lx, ly); ly += 20;
      mapa.rampa.slice().reverse().forEach((col, j) => {
        const i = mapa.rampa.length - 1 - j; // de mayor a menor
        const c = mapa.clases[i];
        const rgb = col.match(/[0-9A-F]{2}/gi).map((h) => parseInt(h, 16));
        doc.setFillColor(...rgb); doc.setDrawColor(58, 58, 58); doc.setLineWidth(0.6); doc.rect(lx, ly - 10, 18, 14, "FD"); doc.setLineWidth(0.5);
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.6); doc.setTextColor(...C.texto);
        doc.text(t(`${n0(c.min)} a ${n0(c.max)}`), lx + 26, ly);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...C.grisOscuro);
        doc.text(t(`${c.n} municipios`), lx + 26, ly + 10);
        ly += 30;
      });
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.6); doc.setTextColor(...C.grisOscuro);
      doc.splitTextToSize(t("Quintiles de los 18 municipios por número de habitantes. Cada rango va del municipio menos poblado al más poblado de su clase, por lo que los rangos no se traslapan. Límites: Municipios_Queretaro_18, simplificados para visualización."), lw)
        .forEach((l) => { doc.text(l, lx, ly); ly += 9.4; });
      y += mh + 12;
    } else {
      aviso("El mapa no pudo dibujarse en este navegador (requiere soporte de Path2D); el resto del reporte no se ve afectado.");
    }

    if (geoF.cve) {
      seccion(`Ranking municipal — posición de ${lugar}, ${anio}`, "Para un municipio, el ranking se presenta en el contexto de su jurisdicción sanitaria y del estado.");
      const p = rkTop.posicion;
      if (p) parrafo(`${p.nombre} ocupa el lugar ${p.enEstado} de ${p.deEstado} municipios del estado y el ${p.enJurisdiccion} de ${p.deJurisdiccion} en ${rkTop.ambito}.`, { bold: true, color: C.vino, size: 9.6 });
      y += 4;
      tabla([["Lugar", `Municipios de ${rkTop.ambito}`, `Población ${anio}`, "% de la jurisdicción", "Lugar en el estado"]],
        rkTop.items.map((m) => [String(m.posicion), m.nombre, n0(m.total), pct(m.pctUniverso), String(m.posicionEstado)]),
        { fontSize: 9, extra: { columnStyles: { 0: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "center" } }, didParseCell: (d) => { if (d.section === "body" && rkTop.items[d.row.index] && rkTop.items[d.row.index].cve === geoF.cve) { d.cell.styles.fillColor = C.beige; d.cell.styles.fontStyle = "bold"; } } } });
    } else {
      seccion(`Ranking municipal — ${rkTop.ambito}, ${anio}`, rkTop.nota || `Cinco municipios más poblados y cinco menos poblados de ${rkTop.universo}. % = participación en la población del ámbito.`);
      const colTop = { 0: { halign: "center", cellWidth: 26 }, 2: { halign: "center", cellWidth: 26 }, 3: { halign: "right" }, 4: { halign: "right", cellWidth: 42 } };
      const filasR = (items) => items.map((m) => [String(m.posicion), m.nombre, String(m.js), n0(m.total), pct(m.pctUniverso)]);
      if (rkTop.universo > 5) {
        const mitad = (ANCHO - 14) / 2, y0 = y;
        tabla([["#", "5 más poblados", "JS", "Población", "%"]], filasR(rkTop.items), { fontSize: 9, extra: { tableWidth: mitad, columnStyles: colTop } });
        const yA = y; y = y0;
        tabla([["#", "5 menos poblados", "JS", "Población", "%"]], filasR(rkBottom.items), { fontSize: 9, extra: { tableWidth: mitad, margin: { left: PAG.m + mitad + 14, right: PAG.m, bottom: 56, top: PAG.m + 14 }, headStyles: { fillColor: C.grisOscuro, textColor: C.blanco, fontStyle: "bold", halign: "center" }, columnStyles: colTop } });
        y = Math.max(y, yA);
        parrafo("# = lugar por población entre los 18 municipios (1 = el más poblado). JS = jurisdicción sanitaria.", { size: 8, color: C.grisOscuro });
      } else {
        tabla([["#", `Municipios de ${rkTop.ambito}`, "JS", `Población ${anio}`, "% del ámbito"]], filasR(rkTop.items), { fontSize: 9, extra: { columnStyles: { 0: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "right" }, 4: { halign: "right" } } } });
        aviso(`${rkTop.nota} No se presenta un ranking separado de menos poblados porque sería la misma lista en orden inverso.`);
      }
    }

    // =================== PÁGINA 3: Sexo y grupos de edad ===================
    nuevaPagina();
    seccion(`Distribución por sexo y grupos de edad — ${lugar}, ${anio}`,
      "11 grupos de edad tal como vienen en la base, sin estimar quinquenios. Amplitudes desiguales (0 años = 1 año; 1-4 = 4; 25-44 = 20; 50-59 = 10; 65 y más = abierto; el resto, 5 años): las barras no se comparan como quinquenios.");
    imagen(graficaPNG(680, 400, (id) => SNSP_renderBarrasSexoEdad(id, pir, { modo: "abs", paraPDF: true })), ANCHO, 300);
    const te = svc.getTablaEdad(f);
    const filasEdad = te.filas.map((r) => [r.grupo, r.amplitud ? String(r.amplitud) : "abierto", n0(r.total), pct(r.pctDelTotal), n0(r.hombres), pct(r.pctHombresDelGrupo), n0(r.mujeres), pct(r.pctMujeresDelGrupo)]);
    filasEdad.push(["Total", "", n0(te.total), "100.0%", n0(te.hombres), pct(te.pctHombres), n0(te.mujeres), pct(te.pctMujeres)]);
    const num = { halign: "right" };
    tabla([
      [{ content: "Grupo de edad", rowSpan: 2 }, { content: "Amplitud (años)", rowSpan: 2 }, { content: "Población del grupo", colSpan: 2 }, { content: "Hombres", colSpan: 2 }, { content: "Mujeres", colSpan: 2 }],
      ["Habitantes", "% del total", "Habitantes", "% del grupo", "Habitantes", "% del grupo"],
    ], filasEdad, {
      fontSize: 8.8,
      extra: {
        styles: { font: "helvetica", fontSize: 8.8, cellPadding: 2.9, textColor: C.texto, lineColor: C.grisClaro, lineWidth: 0.4 },
        columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "center" }, 2: num, 3: num, 4: num, 5: num, 6: num, 7: num },
        didParseCell: (d) => {
          if (d.section === "head" && d.row.index === 0) {
            if (d.column.index === 4) d.cell.styles.fillColor = C.dorado;
            if (d.column.index === 2) d.cell.styles.fillColor = C.verde;
          }
          if (d.section === "body" && d.row.index === filasEdad.length - 1) { d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = C.beige; }
        },
      },
    });
    parrafo("Denominadores: \"% del total\" = población del grupo / población total del área y año. \"% del grupo\" = hombres (o mujeres) del grupo / población de ese grupo; ambos suman 100%. En la fila Total, el % de hombres y de mujeres es sobre la población total.", { size: 8, color: C.grisOscuro });

    // =================== PÁGINA 4: Evolución histórica ===================
    nuevaPagina();
    seccion(`Evolución histórica de la población 2017-2026 — ${lugar}`, "Cada valor es la población de ese año (no acumulada). Variación respecto al año inmediato anterior de la serie.");
    imagen(graficaPNG(680, 350, (id) => SNSP_renderEvolucionPoblacion(id, serie, { vista: "total", anioSel: anio, paraPDF: true })), ANCHO, 290);
    tabla([["Año", "Población total", "Mujeres", "Hombres", "Diferencia vs año anterior", "Variación %"]],
      serie.map((s, i) => [String(s.anio), n0(s.total), n0(s.mujeres), n0(s.hombres),
        i ? difTxt(s.total - serie[i - 1].total) : "—", i ? varTxt(((s.total - serie[i - 1].total) / serie[i - 1].total) * 100) : "—"]),
      { fontSize: 9.6, extra: { styles: { font: "helvetica", fontSize: 9.6, cellPadding: 4.6, textColor: C.texto, lineColor: C.grisClaro, lineWidth: 0.4 }, columnStyles: { 0: { halign: "center", fontStyle: "bold" }, 1: num, 2: num, 3: num, 4: num, 5: num },
        didParseCell: (d) => { if (d.section === "body" && serie[d.row.index] && serie[d.row.index].anio === anio) { d.cell.styles.fillColor = C.beige; d.cell.styles.fontStyle = "bold"; } } } });
    parrafo(`Fila resaltada: año de referencia (${anio}). La población total de cada año es la suma de mujeres y hombres de ese año.`, { size: 8, color: C.grisOscuro });

    // =================== PÁGINA 5: Comparativo + notas ===================
    nuevaPagina();
    seccion(`Comparativo entre los años seleccionados — ${lugar}`,
      "La población total incluye a mujeres y hombres (total = mujeres + hombres): son tres vistas de la misma población, no tres poblaciones independientes, y no deben sumarse entre sí. Diferencias y variaciones respecto al año seleccionado inmediatamente anterior (columna Referencia); si los años no son consecutivos, la variación abarca varios años y no es anual.");
    if (!comp.length) {
      aviso("No aplica: no se seleccionaron años en el comparativo multianual del tablero.");
    } else {
      if (comp.length >= 2) {
        imagen(graficaPNG(680, 280, (id) => SNSP_renderComparativoAnios(id, comp, ["total", "mujeres", "hombres"], { compacto: false, paraPDF: true })), ANCHO, 214);
      } else {
        aviso(`Sólo se seleccionó un año (${comp[0].anio}); se requieren al menos dos para calcular diferencias.`);
      }
      tabla([
        [{ content: "Año", rowSpan: 2 }, { content: "Referencia", rowSpan: 2 }, { content: "Población total (mujeres + hombres)", colSpan: 3 }, { content: "Mujeres", colSpan: 3 }, { content: "Hombres", colSpan: 3 }],
        ["Población", "Dif.", "Var. %", "Población", "Dif.", "Var. %", "Población", "Dif.", "Var. %"],
      ],
        comp.map((c) => {
          const r = c.referencia;
          return [String(c.anio), r ? `vs ${r.anio}${r.consecutivo ? "" : ` (${r.aniosEntre} años)`}` : "Año base",
            n0(c.total), r ? difTxt(r.difTotal) : "—", r ? varTxt(r.varTotal) : "—",
            n0(c.mujeres), r ? difTxt(r.difMujeres) : "—", r ? varTxt(r.varMujeres) : "—",
            n0(c.hombres), r ? difTxt(r.difHombres) : "—", r ? varTxt(r.varHombres) : "—"];
        }),
        { fontSize: 8.2, extra: { styles: { font: "helvetica", fontSize: 8.2, cellPadding: 3, textColor: C.texto, lineColor: C.grisClaro, lineWidth: 0.4 },
          columnStyles: { 0: { halign: "center", fontStyle: "bold" }, 2: num, 3: num, 4: num, 5: num, 6: num, 7: num, 8: num, 9: num, 10: num },
          didParseCell: (d) => {
            if (d.section === "head" && d.row.index === 0) {
              if (d.column.index === 2) d.cell.styles.fillColor = C.verde;
              if (d.column.index === 8) d.cell.styles.fillColor = C.dorado;
            }
          } } });
    }

    // =================== Fuente y notas ===================
    seccion("Fuente de información y notas metodológicas");
    [
      `Fuente: ${FUENTE} Su procedencia y fuente metodológica están pendientes de confirmación documental; no se atribuye a CONAPO ni a otra institución. No se utiliza el padrón ASIS 2025 por localidad, que es una fuente distinta y se consulta por separado.`,
      "Un año a la vez: los indicadores, la distribución por sexo y edad, el ranking y el mapa corresponden al año de referencia. Ninguna cifra suma poblaciones de años distintos; la evolución y el comparativo presentan la población de cada año por separado.",
      "Grupos de edad: se respetan los 11 grupos de la base, de amplitud desigual; no se estiman quinquenios. 65 años y más = grupo \"De 65 y más años\". Decimales de la base (ruido de exportación y prorrateo del grupo 0-4) se conservan; sólo se redondea al presentar.",
      "Porcentajes: cada uno indica su denominador (población total del área y año, o población del grupo de edad). Índices: dependencia = (0-14 + 65 y más) / 15-64 x 100; envejecimiento = 65 y más / 0-14 x 100.",
      "Ámbitos y mapa: Estado = 18 municipios; Jurisdicción = sus municipios; Municipio = clave CVEGEO 22001-22018 (relación por clave, no por nombre). Mapa por quintiles de los 18 municipios, descritos con los valores mínimo y máximo reales de cada clase.",
    ].forEach((nota) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.6);
      const lineas = doc.splitTextToSize(t(nota), ANCHO - 14);
      espacio(lineas.length * 10.5 + 3);
      doc.setFillColor(...C.vino); doc.rect(PAG.m + 1, y - 6, 3, 3, "F");
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.6); doc.setTextColor(...C.texto);
      lineas.forEach((ln) => { doc.text(ln, PAG.m + 10, y); y += 11; });
      y += 3;
    });

    // =================== Pie de página ===================
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(...C.grisClaro); doc.setLineWidth(0.6); doc.line(PAG.m, PAG.h - 38, PAG.w - PAG.m, PAG.h - 38);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); doc.setTextColor(...C.gris);
      doc.text(t(`SNSP Querétaro — Inteligencia e Información · Reporte ejecutivo de población · ${lugar}, ${anio}`), PAG.m, PAG.h - 26);
      doc.text(t(`Fuente: base de población utilizada en SUIVE Querétaro · Generado: ${fechaGen}`), PAG.m, PAG.h - 16);
      doc.text(t(`Página ${i} de ${total}`), PAG.w - PAG.m, PAG.h - 26, { align: "right" });
      doc.text(t("Versión de pruebas"), PAG.w - PAG.m, PAG.h - 16, { align: "right" });
      if (i > 1) { // encabezado corto en páginas interiores
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.8); doc.setTextColor(...C.vino);
        doc.text(t("SNSP Querétaro — Inteligencia e Información"), PAG.m, 30);
        doc.setFont("helvetica", "normal"); doc.setTextColor(...C.grisOscuro);
        doc.text(t(`Reporte ejecutivo de población · ${lugar} · ${anio}`), PAG.w - PAG.m, 30, { align: "right" });
        doc.setDrawColor(...C.dorado); doc.setLineWidth(0.8); doc.line(PAG.m, 35, PAG.w - PAG.m, 35);
      }
    }

    const nombreArchivo = `Reporte_poblacion_SUIVE_${slug(lugar)}_${anio}.pdf`;
    doc.setProperties({ title: t(`Reporte ejecutivo de población — ${lugar}, ${anio}`), subject: "Población SUIVE Querétaro", author: "SNSP Querétaro — Inteligencia e Información", creator: "SNSP Inteligencia Digital" });
    const contenido = {
      lugar, anio, ambitoTipo, aniosComparativo: comp.map((c) => c.anio),
      total: Math.round(res.total), mujeres: Math.round(est.mujeres), hombres: Math.round(est.hombres), pob65: Math.round(est.pob65),
      pctMujeres: est.pctMujeres, pctHombres: est.pctHombres, pct65: est.pct65,
      serie: serie.map((s) => ({ anio: s.anio, total: Math.round(s.total) })),
      comparativo: comp.map((c) => ({ anio: c.anio, total: Math.round(c.total), referencia: c.referencia ? { anio: c.referencia.anio, difTotal: Math.round(c.referencia.difTotal), varTotal: c.referencia.varTotal } : null })),
      rankingTop: rkTop.items.map((m) => ({ nombre: m.nombre, total: Math.round(m.total), posicion: m.posicion })),
      rankingBottom: rkBottom.items.map((m) => ({ nombre: m.nombre, total: Math.round(m.total), posicion: m.posicion })),
      posicion: rkTop.posicion, mapa: !!mapa, logo: !!logo, interpretacion: interp,
    };
    window.SNSP_PH_ULTIMO_REPORTE = { nombreArchivo, paginas: total, contenido };
    if (opciones.descargar) doc.save(nombreArchivo);
    return { doc, nombreArchivo, paginas: total, contenido };
  }

  window.SNSP_generarReportePoblacionPDF = generar;
})();
