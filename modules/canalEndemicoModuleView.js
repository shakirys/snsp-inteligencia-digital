/**
 * modules/canalEndemicoModuleView.js
 * -----------------------------------------------------------------------
 * Canal Endémico Exploratorio — módulo integrado de SNSP Inteligencia
 * Digital (ver nota metodológica dentro de la página).
 *
 * Módulo independiente y aditivo: no modifica, importa ni depende de
 * modules/morbilidadModuleView.js ni de ningún otro módulo. Reutiliza
 * únicamente la arquitectura ya existente y compartida (auth guard,
 * sidebar, topbar, tarjetas de indicador, SNSP_formatNumber, estilos
 * institucionales vía styles/tokens.css + styles/main.css) — nada de eso
 * se tocó para construir este módulo.
 *
 * Fuente de datos: data/real/canal_endemico_2022_2026.js, generado por
 * scripts/build_canal_endemico.py directamente desde
 * data/raw/BASE_PADECIMIENTOS_SUIVE_QRO_2022_2026_plana.xlsx (la misma
 * base real que ya usa el Bloque 2 de Morbilidad). Los totales anuales ya
 * vienen validados por el propio script de construcción (aserción dura:
 * si no cuadran con lo confirmado por la usuaria, el build falla y no
 * escribe ningún archivo).
 *
 * 2022-2025 = referencia histórica (4 años completos).
 * 2026 = año observado, parcial — una semana sin información real se
 * representa como `null`, NUNCA como 0, en todo este módulo.
 *
 * ACT22: ahora el catálogo incluye TODOS los padecimientos de la base
 * (con un selector con buscador por nombre/Epi-Clave), pero sólo los
 * marcados "disponible": true por scripts/build_canal_endemico.py tienen
 * un canal construido en DATA.canales — para el resto se muestra un
 * aviso claro (catalogoEntry.motivo) y NINGÚN número fabricado.
 * -----------------------------------------------------------------------
 */

const SNSP_CANAL_MAX_SEMANA_GRAFICA = 52; // la semana 53 (sólo algunos años) se documenta en tabla, no se grafica (ver nota en la página)
const SNSP_CANAL_EPICLAVE_POR_DEFECTO = "94"; // Intoxicación por picadura de alacrán — línea base ya aprobada

function _canalZonaLabel(zona) {
  return { exito: "Éxito", seguridad: "Seguridad", alerta: "Alerta", epidemica: "Epidémica" }[zona] || "—";
}
function _canalZonaPillHTML(zona) {
  if (!zona) return `<span class="zona-pill zona-pill--na">Sin información</span>`;
  return `<span class="zona-pill zona-pill--${zona}">${_canalZonaLabel(zona)}</span>`;
}
function _canalNormTexto(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function SNSP_renderCanalEndemicoModulePage(opts) {
  window.SNSP_AUTH.requireAuth("../index.html");

  SNSP_renderSidebar("sidebar", "canal_endemico");

  const DATA = window.SNSP_CANAL_ENDEMICO_DATA;
  const kpiGrid = document.getElementById("kpi-grid");
  if (!DATA || !DATA.canales || !Object.keys(DATA.canales).length) {
    SNSP_renderTopbar("topbar", {
      title: "Canal Endémico Exploratorio",
      updated: "Módulo exploratorio — ver nota metodológica",
      rootPath: "../",
    });
    kpiGrid.innerHTML = `<div class="empty-state">No se encontró <code>window.SNSP_CANAL_ENDEMICO_DATA</code>. Verifica que <code>data/real/canal_endemico_2022_2026.js</code> esté cargado antes de este módulo.</div>`;
    return;
  }

  let chart = null;
  const catalogoPorDefecto = DATA.catalogo_padecimientos.find((p) => p.epiclave === SNSP_CANAL_EPICLAVE_POR_DEFECTO);
  let epiclaveActual = catalogoPorDefecto ? SNSP_CANAL_EPICLAVE_POR_DEFECTO : DATA.catalogo_padecimientos[0].epiclave;

  SNSP_renderTopbar("topbar", {
    title: "Canal Endémico Exploratorio",
    subtitle: (catalogoPorDefecto || DATA.catalogo_padecimientos[0]).padecimiento,
    updated: "Módulo exploratorio — ver nota metodológica",
    rootPath: "../",
  });
  const topbarSubtituloEl = document.querySelector("#topbar .section-header__subtitle");

  // -----------------------------------------------------------------
  // Selector de padecimiento con buscador (ACT22) — un <select> nativo
  // (accesible, con teclado) cuyas <option> se ocultan/muestran según lo
  // que la usuaria escribe en el campo de texto de arriba. Son muchos
  // padecimientos (más de 160), así que se puede buscar por nombre o por
  // Epi-Clave. Los que no tienen canal disponible se listan igual (para
  // poder encontrarlos) pero marcados — al elegirlos se muestra un aviso,
  // nunca una gráfica o cuartiles fabricados.
  // -----------------------------------------------------------------
  const buscador = document.getElementById("canal-buscador-padecimiento");
  const selPad = document.getElementById("canal-select-padecimiento");
  const contadorBusqueda = document.getElementById("canal-buscador-contador");

  selPad.innerHTML = DATA.catalogo_padecimientos.map((p) => {
    const etiqueta = `${p.padecimiento}${p.cie10 ? " (" + p.cie10 + ")" : ""} — Epi-Clave ${p.epiclave}${p.disponible ? "" : " · sin canal disponible"}`;
    const busqueda = _canalNormTexto(`${p.padecimiento} ${p.cie10 || ""} ${p.epiclave}`);
    return `<option value="${p.epiclave}" data-disponible="${p.disponible}" data-busqueda="${busqueda}">${etiqueta}</option>`;
  }).join("");
  selPad.value = epiclaveActual;

  function _filtrarSelectorPadecimiento() {
    const termino = _canalNormTexto(buscador.value.trim());
    let visibles = 0;
    Array.from(selPad.options).forEach((opt) => {
      const coincide = !termino || opt.dataset.busqueda.indexOf(termino) !== -1;
      opt.hidden = !coincide;
      if (coincide) visibles++;
    });
    contadorBusqueda.textContent = termino
      ? `${visibles} de ${selPad.options.length} padecimientos coinciden con "${buscador.value.trim()}"`
      : `${selPad.options.length} padecimientos en el catálogo (${DATA.catalogo_padecimientos.filter((p) => p.disponible).length} con canal disponible)`;
  }
  buscador.addEventListener("input", _filtrarSelectorPadecimiento);
  buscador.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const primeraVisible = Array.from(selPad.options).find((o) => !o.hidden);
    if (primeraVisible && primeraVisible.value !== selPad.value) {
      selPad.value = primeraVisible.value;
      selPad.dispatchEvent(new Event("change"));
    }
  });
  _filtrarSelectorPadecimiento();

  selPad.addEventListener("change", () => {
    epiclaveActual = selPad.value;
    renderAll();
    window.SNSP_AUTH.logAction && window.SNSP_AUTH.logAction("cambiar_padecimiento", `Módulo: Canal Endémico — Epi-Clave ${epiclaveActual}`);
  });

  function destroyChart() { if (chart) { chart.destroy(); chart = null; } }

  // -----------------------------------------------------------------
  // Gráfica principal: 4 bandas apiladas (área, sin bordes) + 1 línea
  // de casos observados 2026 encima. Construida directamente con la
  // API de Chart.js (ya cargado vía CDN, igual que en el resto de la
  // plataforma) porque components/charts.js no tiene un tipo de gráfica
  // de "bandas + línea" — así se evita tocar ese archivo compartido.
  // -----------------------------------------------------------------
  function renderChart(canal) {
    destroyChart();
    const semanas = canal.semanas.filter((s) => s.se <= SNSP_CANAL_MAX_SEMANA_GRAFICA);
    const labels = semanas.map((s) => s.se);

    // Opacidades/colores de las 4 bandas y de la línea: se leen de las
    // variables CSS (una sola fuente de verdad con pages/canal_endemico.html)
    // en vez de repetir los valores literales aquí — así un futuro ajuste
    // sólo se hace en un lugar. Paleta aprobada — NO se modifica aquí.
    const raiz = getComputedStyle(document.documentElement);
    const fillExito = raiz.getPropertyValue("--canal-exito-fill").trim() || "rgba(30,91,79,.32)";
    const fillSeguridad = raiz.getPropertyValue("--canal-seguridad-fill").trim() || "rgba(79,158,136,.28)";
    const fillAlerta = raiz.getPropertyValue("--canal-alerta-fill").trim() || "rgba(217,166,53,.26)";
    const fillEpidemica = raiz.getPropertyValue("--canal-epidemica-fill").trim() || "rgba(155,34,71,.20)";
    const colorLinea = raiz.getPropertyValue("--canal-linea").trim() || "#22201D";

    const techoEpidemico = Math.max(
      ...semanas.filter((s) => s.q3 != null).map((s) => s.q3 * 1.35),
      ...semanas.filter((s) => s.casos_2026 != null).map((s) => s.casos_2026 * 1.08)
    );

    const dsExito = {
      label: "Zona de éxito",
      data: semanas.map((s) => s.q1),
      backgroundColor: fillExito,
      borderColor: "transparent",
      borderWidth: 0,
      pointRadius: 0,
      fill: "origin",
      tension: 0,
      spanGaps: true,
    };
    const dsSeguridad = {
      label: "Zona de seguridad",
      data: semanas.map((s) => s.mediana),
      backgroundColor: fillSeguridad,
      borderColor: "transparent",
      borderWidth: 0,
      pointRadius: 0,
      fill: 0,
      tension: 0,
      spanGaps: true,
    };
    const dsAlerta = {
      label: "Zona de alerta",
      data: semanas.map((s) => s.q3),
      backgroundColor: fillAlerta,
      borderColor: "transparent",
      borderWidth: 0,
      pointRadius: 0,
      fill: 1,
      tension: 0,
      spanGaps: true,
    };
    const dsEpidemica = {
      label: "Zona epidémica",
      data: semanas.map(() => techoEpidemico),
      backgroundColor: fillEpidemica,
      borderColor: "transparent",
      borderWidth: 0,
      pointRadius: 0,
      fill: 2,
      tension: 0,
    };
    // Línea de Casos observados 2026: el requisito (ACT22) es que quede
    // SIEMPRE visualmente al frente de las 4 bandas. Para no depender
    // únicamente de la propiedad `order` de Chart.js (cuyo efecto exacto
    // sobre el plugin de relleno entre datasets puede variar), además de
    // subir su `order`, más abajo se agrega un plugin propio
    // (`pluginLineaAlFrente`, afterDatasetsDraw) que vuelve a trazar esta
    // misma línea y sus puntos por encima de TODO lo demás, con
    // exactamente los mismos colores/radios — es, por construcción, lo
    // último que se pinta en cada cuadro.
    const dsObservado = {
      label: "Casos 2026 (observado)",
      data: semanas.map((s) => s.casos_2026),
      borderColor: colorLinea,
      backgroundColor: colorLinea,
      borderWidth: 2.75,
      fill: false,
      tension: 0.15,
      spanGaps: false,
      pointRadius: semanas.map((s) => (s.zona === "epidemica" ? 5.5 : s.casos_2026 == null ? 0 : 3)),
      pointBackgroundColor: semanas.map((s) => (s.zona === "epidemica" ? "#611232" : colorLinea)),
      pointBorderColor: semanas.map((s) => (s.zona === "epidemica" ? "#611232" : colorLinea)),
      // Resaltado claro al pasar el cursor: el punto bajo el mouse crece y
      // queda con un anillo blanco, además del tooltip (que ya indica la
      // semana y el valor exacto) — así se distingue sin ambigüedad cuál
      // semana está activa.
      pointHoverRadius: 8,
      pointHoverBorderWidth: 2,
      pointHoverBorderColor: "#FFFFFF",
      pointHoverBackgroundColor: "#611232",
      order: 10,
    };

    const ultimaSemana = canal.ultima_semana_observada;

    // Redibuja la línea observada y sus puntos POR ENCIMA de las 4
    // bandas y de cualquier otro elemento nativo del dataset — ver nota
    // junto a dsObservado arriba. No cambia ningún dato: usa exactamente
    // los mismos valores/colores/radios que dsObservado, sólo que los
    // vuelve a pintar al final.
    const pluginLineaAlFrente = {
      id: "canalLineaAlFrente",
      afterDatasetsDraw(c) {
        const datasetIndex = c.data.datasets.findIndex((d) => d.label === "Casos 2026 (observado)");
        if (datasetIndex === -1) return;
        const meta = c.getDatasetMeta ? c.getDatasetMeta(datasetIndex) : null;
        if (!meta || !meta.data || !meta.data.length) return;
        const ctx = c.ctx;
        const puntos = semanas.map((s, i) => {
          const el = meta.data[i];
          return (el && s.casos_2026 != null) ? { x: el.x, y: el.y, zona: s.zona } : null;
        });
        ctx.save();
        ctx.lineWidth = 2.75;
        ctx.strokeStyle = colorLinea;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        let i = 0;
        while (i < puntos.length) {
          if (!puntos[i]) { i++; continue; }
          ctx.beginPath();
          ctx.moveTo(puntos[i].x, puntos[i].y);
          let j = i + 1;
          while (j < puntos.length && puntos[j]) { ctx.lineTo(puntos[j].x, puntos[j].y); j++; }
          ctx.stroke();
          i = j;
        }
        puntos.forEach((p) => {
          if (!p) return;
          const radio = p.zona === "epidemica" ? 5.5 : 3;
          ctx.beginPath();
          ctx.fillStyle = p.zona === "epidemica" ? "#611232" : colorLinea;
          ctx.arc(p.x, p.y, radio, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      },
    };

    const pluginUltimaSemana = {
      id: "canalUltimaSemana",
      afterDraw(c) {
        if (ultimaSemana > SNSP_CANAL_MAX_SEMANA_GRAFICA) return;
        const xScale = c.scales.x;
        const yScale = c.scales.y;
        const idx = labels.indexOf(ultimaSemana);
        if (idx === -1) return;
        const x = xScale.getPixelForValue(ultimaSemana);
        const ctx = c.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "#22201D";
        ctx.lineWidth = 1;
        ctx.moveTo(x, yScale.top);
        ctx.lineTo(x, yScale.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#22201D";
        ctx.font = "600 11px Inter, sans-serif";
        ctx.textAlign = x > xScale.right - 60 ? "right" : "left";
        ctx.fillText(`Última semana con información (SE ${ultimaSemana})`, x > xScale.right - 60 ? x - 6 : x + 6, yScale.top + 12);
        ctx.restore();
      },
    };

    // Etiquetas numéricas SÓLO sobre los puntos en zona epidémica (>Q3) —
    // a propósito no se etiquetan las 37 semanas para no saturar la
    // gráfica (punto 3 del ajuste solicitado). El resto de semanas se
    // siguen pudiendo leer vía el tooltip (punto 4) o la tabla (punto 6).
    //
    // ACT24 (corrección) — cuando hay VARIAS semanas CONSECUTIVAS en zona
    // epidémica, sus puntos quedan muy juntos en el eje X y la etiqueta
    // de una semana podía encimarse con la de la semana vecina. Se
    // recorre de izquierda a derecha (el mismo orden en que avanzan las
    // semanas) registrando el recuadro real de cada etiqueta ya
    // dibujada (medido con el ancho real del texto); si la siguiente se
    // encimaría con alguna ya colocada, se desplaza un poco más arriba
    // de su punto, y si aun así no cabe sin encimarse se omite esa
    // etiqueta puntual — el valor exacto sigue disponible al pasar el
    // cursor (tooltip) y en la tabla semanal completa (pantalla y anexo
    // del PDF), nunca se pierde información, sólo se evita el texto
    // ilegible/traslapado sobre la gráfica.
    const pluginEtiquetasEpidemicas = {
      id: "canalEtiquetasEpidemicas",
      afterDatasetsDraw(c) {
        const datasetIndex = c.data.datasets.findIndex((d) => d.label === "Casos 2026 (observado)");
        if (datasetIndex === -1) return;
        const meta = c.getDatasetMeta ? c.getDatasetMeta(datasetIndex) : null;
        if (!meta || !meta.data) return;
        const ctx = c.ctx;
        ctx.save();
        ctx.font = "700 11px Inter, sans-serif";
        ctx.fillStyle = "#611232";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const ALTO_ETIQUETA = 14;
        function _solapan(a, b, pad) {
          pad = pad === undefined ? 1 : pad;
          return !(a.right + pad < b.left || b.right + pad < a.left || a.bottom + pad < b.top || b.bottom + pad < a.top);
        }

        // ACT24 (corrección adicional) — además de evitar que una
        // etiqueta se encime con OTRA etiqueta, tampoco debe terminar
        // tapando el PUNTO (marcador) de una semana vecina: en una racha
        // larga de semanas epidémicas los puntos quedan muy juntos y, al
        // desplazar una etiqueta hacia arriba para no chocar con la
        // etiqueta de al lado, podía quedar encima del marcador de la
        // semana siguiente/anterior y tapar un dígito. Se registra el
        // recuadro de TODOS los puntos con dato (no sólo los epidémicos)
        // como "obstáculo" — EXCLUYENDO siempre el punto AL QUE
        // pertenece la propia etiqueta (su posición preferida, justo
        // arriba de su propio punto, es intencional y no cuenta como
        // choque).
        const obstaculosPuntos = [];
        semanas.forEach((s, i) => {
          if (s.casos_2026 == null) return;
          const punto = meta.data[i];
          if (!punto) return;
          const radio = s.zona === "epidemica" ? 5.5 : 3;
          const holgura = radio + 2.5;
          obstaculosPuntos.push({ i, left: punto.x - holgura, right: punto.x + holgura, top: punto.y - holgura, bottom: punto.y + holgura });
        });
        const colocadas = []; // recuadros de las etiquetas YA dibujadas
        function _cabe(bbox, iPropio) {
          if (obstaculosPuntos.some((o) => o.i !== iPropio && _solapan(bbox, o))) return false;
          return !colocadas.some((o) => _solapan(bbox, o));
        }

        // ACT25 — ajuste visual pedido: antes, cuando una etiqueta no
        // cabía sin encimarse, el único recurso era seguir subiéndola (y,
        // si tras 3 intentos seguía sin caber, se OMITÍA — el valor
        // desaparecía de la gráfica, aunque siguiera en el tooltip y en
        // la tabla). Eso dejaba huecos poco claros en rachas largas de
        // semanas epidémicas. Ahora ningún valor epidémico se omite: se
        // alterna arriba/abajo del punto y, si tampoco cabe, se aleja más
        // en pasos sucesivos a ambos lados, hasta encontrar un lugar
        // libre. Si la posición final quedó lejos de su punto, se traza
        // una línea guía discreta (mismo color de las etiquetas, muy
        // tenue) para que quede claro a qué punto pertenece.
        const DIST_CERCA = 11; // misma distancia preferida de siempre (arriba del punto)
        const MAX_PASOS = 8; // intentos de separación adicional a cada lado — generoso: nunca debe hacer falta omitir
        const UMBRAL_LINEA_GUIA = DIST_CERCA + 4; // a partir de aquí, la etiqueta ya no queda "pegada" a su punto

        function _bboxEn(punto, ancho, y) {
          return { left: punto.x - ancho / 2 - 2, right: punto.x + ancho / 2 + 2, top: y - ALTO_ETIQUETA / 2, bottom: y + ALTO_ETIQUETA / 2 };
        }

        semanas.forEach((s, i) => {
          if (s.zona !== "epidemica" || s.casos_2026 == null) return;
          const punto = meta.data[i];
          if (!punto) return;
          const texto = SNSP_formatNumber(s.casos_2026);
          const ancho = ctx.measureText(texto).width;

          let yFinal = punto.y - DIST_CERCA; // última posición probada — si nada cabe, se usa ésta como último recurso
          let bboxFinal = _bboxEn(punto, ancho, yFinal);
          let colocada = false;
          for (let paso = 0; paso <= MAX_PASOS && !colocada; paso++) {
            const distancia = DIST_CERCA + paso * ALTO_ETIQUETA;
            // Alternando: primero arriba, luego abajo, a esta misma distancia.
            const candidatos = [punto.y - distancia, punto.y + distancia];
            for (const y of candidatos) {
              const bbox = _bboxEn(punto, ancho, y);
              if (_cabe(bbox, i)) { yFinal = y; bboxFinal = bbox; colocada = true; break; }
            }
          }
          // Último recurso (no debería ocurrir con datos reales, dado el
          // margen de MAX_PASOS): aun si no se encontró un lugar
          // perfectamente libre, el valor epidémico se dibuja de todas
          // formas — nunca se omite un dato de zona epidémica.

          const distanciaFinal = Math.abs(yFinal - punto.y);
          if (distanciaFinal > UMBRAL_LINEA_GUIA) {
            const arriba = yFinal < punto.y;
            ctx.save();
            ctx.strokeStyle = "rgba(97, 18, 50, 0.35)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(punto.x, punto.y + (arriba ? -6 : 6));
            ctx.lineTo(punto.x, yFinal + (arriba ? 7 : -7));
            ctx.stroke();
            ctx.restore();
          }
          // ACT25 — placa de fondo discreta: la línea observada o las
          // bandas de color pueden pasar justo detrás de una etiqueta
          // (sobre todo cuando queda debajo de su punto, en un tramo con
          // pendiente pronunciada) y restarle legibilidad a algún dígito.
          // Un fondo claro semitransparente, del tamaño exacto de la
          // etiqueta, resuelve eso sin tocar ningún color de los ya
          // validados (línea, bandas, puntos) ni el texto en sí.
          ctx.save();
          ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
          ctx.fillRect(bboxFinal.left, bboxFinal.top, bboxFinal.right - bboxFinal.left, bboxFinal.bottom - bboxFinal.top);
          ctx.restore();
          ctx.fillStyle = "#611232";
          ctx.fillText(texto, punto.x, yFinal);
          colocadas.push(bboxFinal);
        });
        ctx.restore();
      },
    };

    const canvasEl = document.getElementById("chart-canal");
    chart = new Chart(canvasEl, {
      type: "line",
      data: { labels, datasets: [dsExito, dsSeguridad, dsAlerta, dsEpidemica, dsObservado] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 26, right: 20, left: 6, bottom: 6 } },
        scales: {
          x: {
            title: { display: true, text: "Semana epidemiológica", color: "#4D4D4D", font: { size: 12 } },
            grid: { display: false },
            ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 26 },
          },
          y: {
            title: { display: true, text: "Casos", color: "#4D4D4D", font: { size: 12 } },
            beginAtZero: true,
            suggestedMax: techoEpidemico,
            grid: { color: "#E4E0D6" },
            ticks: { font: { size: 11 } },
          },
        },
        plugins: {
          legend: { display: false }, // ya hay una leyenda propia (HTML) arriba de la gráfica, con la descripción de cada zona
          tooltip: {
            filter: (item) => item.dataset.label === "Casos 2026 (observado)",
            callbacks: {
              title: (items) => `Semana epidemiológica ${items[0].label}`,
              label: (item) => {
                const s = semanas[item.dataIndex];
                const lineas = [];
                lineas.push(s.casos_2026 == null ? "Casos 2026: sin información" : `Casos 2026: ${SNSP_formatNumber(s.casos_2026)}`);
                lineas.push(s.q3 != null ? `Q3 (histórico): ${SNSP_formatNumber(Math.round(s.q3 * 100) / 100)}` : "Q3 (histórico): sin referencia");
                lineas.push(s.mediana != null ? `Mediana (Q2): ${SNSP_formatNumber(Math.round(s.mediana * 100) / 100)}` : "Mediana (Q2): sin referencia");
                lineas.push(s.q1 != null ? `Q1 (histórico): ${SNSP_formatNumber(Math.round(s.q1 * 100) / 100)}` : "Q1 (histórico): sin referencia");
                lineas.push(`Zona: ${s.zona ? _canalZonaLabel(s.zona) : "—"}`);
                return lineas;
              },
            },
          },
        },
      },
      plugins: [pluginLineaAlFrente, pluginEtiquetasEpidemicas, pluginUltimaSemana],
    });
  }

  // -----------------------------------------------------------------
  // Tabla semanal completa (incluye SE 53, que la gráfica omite)
  // -----------------------------------------------------------------
  function renderTablaSemanas(canal) {
    const body = document.getElementById("tabla-semanas-body");
    body.innerHTML = canal.semanas.map((s) => {
      const esObservada = s.se <= canal.ultima_semana_observada;
      const casosTxt = s.casos_2026 == null
        ? (esObservada ? `<span class="text-muted">Sin información</span>` : `<span class="text-muted">— (semana futura 2026)</span>`)
        : SNSP_formatNumber(s.casos_2026);
      // Referencia insuficiente: una semana calculada con un solo año
      // histórico no debe presentarse como si Q1/Mediana/Q3 fueran una
      // referencia válida — se marca explícitamente en vez de mostrar
      // números calculados con un solo dato.
      const referenciaInsuficiente = s.n_historico === 1;
      const celdasCuantiles = referenciaInsuficiente
        ? `<td colspan="3" class="text-muted" style="font-style:italic;">Referencia insuficiente (n=1)</td>`
        : `<td>${s.q1 != null ? SNSP_formatNumber(Math.round(s.q1 * 100) / 100) : "—"}</td>
        <td>${s.mediana != null ? SNSP_formatNumber(Math.round(s.mediana * 100) / 100) : "—"}</td>
        <td>${s.q3 != null ? SNSP_formatNumber(Math.round(s.q3 * 100) / 100) : "—"}</td>`;
      return `<tr>
        <td>${s.se}</td>
        ${celdasCuantiles}
        <td>${casosTxt}</td>
        <td>${_canalZonaPillHTML(s.zona)}</td>
      </tr>`;
    }).join("");
  }

  function renderTablaTotales(canal) {
    const body = document.getElementById("tabla-totales-anio-body");
    body.innerHTML = canal.anios_historicos_usados.concat([canal.anio_observado]).map((a) => {
      const esObservado = a === canal.anio_observado;
      return `<tr>
        <td>${a}</td>
        <td>${SNSP_formatNumber(canal.total_por_anio[a] || 0)}</td>
        <td>${esObservado ? `<span class="zona-pill zona-pill--alerta">Observado (parcial, hasta SE ${canal.ultima_semana_observada})</span>` : `<span class="zona-pill zona-pill--na" style="background:var(--c-gris-oscuro);">Histórico</span>`}</td>
      </tr>`;
    }).join("");
  }

  function renderTablaResumenZonas(canal) {
    const body = document.getElementById("tabla-resumen-zonas-body");
    const orden = ["exito", "seguridad", "alerta", "epidemica"];
    const total = orden.reduce((acc, z) => acc + (canal.resumen_semanas_por_zona[z] || 0), 0);
    body.innerHTML = orden.map((z) => `
      <tr><td>${_canalZonaPillHTML(z)}</td><td>${canal.resumen_semanas_por_zona[z] || 0}</td></tr>
    `).join("") + `<tr><td><strong>Total (SE 1-${canal.ultima_semana_observada})</strong></td><td><strong>${total}</strong></td></tr>`;
    document.getElementById("subt-distribucion-zonas").textContent =
      `Por zona del canal exploratorio, semanas 1 a ${canal.ultima_semana_observada} de 2026`;
  }

  function renderNotaMetodologica() {
    const m = DATA.meta;
    document.getElementById("nota-metodologica").innerHTML = `
      <p>${m.nota}</p>
      <p><strong>Método de cuantiles:</strong> ${m.metodo_cuantiles}</p>
      <p><strong>Clasificación de zonas:</strong> ${m.clasificacion_zonas}</p>
      <p><strong>Criterio de elegibilidad del padecimiento:</strong> ${m.criterio_elegibilidad || ""}</p>
      <p><strong>${m.advertencia_exploratorio}</strong></p>
    `;
  }

  function renderKPIs(canal) {
    const resumen = canal.resumen_semanas_por_zona;
    kpiGrid.innerHTML = [
      { label: "Casos acumulados 2026", value: SNSP_formatNumber(canal.total_por_anio[canal.anio_observado] || 0), accent: "var(--c-vino)", footnote: `hasta la SE ${canal.ultima_semana_observada}` },
      { label: "Última semana con información", value: canal.ultima_semana_observada, accent: "var(--c-gris-oscuro)", footnote: "2026, año observado" },
      { label: "Semanas en zona de éxito", value: resumen.exito || 0, accent: "var(--canal-exito)", footnote: "≤ Q1" },
      { label: "Semanas en zona de seguridad", value: resumen.seguridad || 0, accent: "var(--canal-seguridad)", footnote: "> Q1 y ≤ mediana" },
      { label: "Semanas en zona de alerta", value: resumen.alerta || 0, accent: "var(--canal-alerta)", footnote: "> mediana y ≤ Q3" },
      { label: "Semanas en zona epidémica", value: resumen.epidemica || 0, accent: "var(--canal-epidemica)", footnote: "> Q3" },
    ].map(SNSP_indicatorCardHTML).join("");
  }

  // -----------------------------------------------------------------
  // Estado "sin canal disponible" (ACT22) — un padecimiento que no
  // cumple el criterio de elegibilidad (ver scripts/build_canal_endemico.py)
  // se puede seleccionar en el buscador (para que se pueda encontrar),
  // pero aquí se muestra un aviso explícito y se limpian por completo la
  // gráfica/tabla/KPIs/distribución — nunca se fabrica un número.
  // -----------------------------------------------------------------
  function renderEstadoNoDisponible(catalogoEntry) {
    destroyChart();
    const aviso = document.getElementById("canal-aviso-no-disponible");
    aviso.classList.add("is-visible");
    aviso.innerHTML = `<div><strong>Canal no disponible para "${catalogoEntry.padecimiento}" (Epi-Clave ${catalogoEntry.epiclave}).</strong> ${catalogoEntry.motivo || "Información histórica semanal insuficiente para construir el canal sin fabricar datos."} No se muestra ninguna gráfica, cuartil ni clasificación de zona para este padecimiento.</div>`;

    document.getElementById("chart-titulo").textContent = `Canal endémico exploratorio de ${catalogoEntry.padecimiento}`;
    document.getElementById("chart-subtitulo").textContent = "Sin canal disponible — ver aviso arriba";
    document.getElementById("canal-info-anio-observado").innerHTML = `<strong>Epi-Clave:</strong> ${catalogoEntry.epiclave}`;
    document.getElementById("canal-info-periodo-referencia").innerHTML = `<strong>Estado:</strong> Sin canal disponible`;
    if (topbarSubtituloEl) topbarSubtituloEl.textContent = catalogoEntry.padecimiento;

    kpiGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Este padecimiento no tiene información semanal suficiente para construir el canal endémico. Ver el aviso arriba — no se muestran indicadores fabricados.</div>`;
    document.getElementById("tabla-semanas-body").innerHTML = `<tr><td colspan="6" class="text-muted">Sin canal disponible para este padecimiento.</td></tr>`;
    document.getElementById("tabla-totales-anio-body").innerHTML = `<tr><td colspan="3" class="text-muted">Sin canal disponible para este padecimiento.</td></tr>`;
    document.getElementById("tabla-resumen-zonas-body").innerHTML = `<tr><td colspan="2" class="text-muted">Sin canal disponible para este padecimiento.</td></tr>`;
    document.getElementById("subt-distribucion-zonas").textContent = "No aplica — sin canal disponible";
    document.getElementById("nota-semana53").style.display = "none";
  }

  function renderAll() {
    const catalogoEntry = DATA.catalogo_padecimientos.find((p) => p.epiclave === epiclaveActual);
    const canal = DATA.canales[epiclaveActual];
    const aviso = document.getElementById("canal-aviso-no-disponible");

    if (!catalogoEntry || !catalogoEntry.disponible || !canal) {
      renderEstadoNoDisponible(catalogoEntry || { epiclave: epiclaveActual, padecimiento: epiclaveActual, motivo: null });
      return;
    }

    aviso.classList.remove("is-visible");
    aviso.innerHTML = "";
    document.getElementById("nota-semana53").style.display = "";

    document.getElementById("chart-titulo").textContent = `Canal endémico exploratorio de ${canal.padecimiento}`;
    document.getElementById("chart-subtitulo").textContent =
      `Querétaro, ${canal.anios_historicos_usados[0]}-${canal.anio_observado} · referencia ${canal.anios_historicos_usados[0]}-${canal.anios_historicos_usados[canal.anios_historicos_usados.length - 1]}, observado ${canal.anio_observado}`;
    document.getElementById("canal-info-anio-observado").innerHTML = `<strong>Año observado:</strong> ${canal.anio_observado} (parcial, hasta SE ${canal.ultima_semana_observada})`;
    document.getElementById("canal-info-periodo-referencia").innerHTML = `<strong>Periodo histórico de referencia:</strong> ${canal.anios_historicos_usados.join(", ")}`;
    if (topbarSubtituloEl) topbarSubtituloEl.textContent = canal.padecimiento;

    renderKPIs(canal);
    renderChart(canal);
    renderTablaSemanas(canal);
    renderTablaTotales(canal);
    renderTablaResumenZonas(canal);
  }

  // -----------------------------------------------------------------
  // Reporte PDF ejecutivo del Canal Endémico (ACT22): identificación del
  // padecimiento/periodo, KPI, gráfica grande, distribución de semanas
  // por zona, totales anuales, fuente y nota metodológica breve. La
  // tabla semanal completa va como anexo en una página aparte (útil
  // para consulta detallada, sin saturar el cuerpo del reporte).
  // -----------------------------------------------------------------
  function generarReportePDFCanalEndemico() {
    if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
      alert("No se pudo cargar el generador de PDF. Verifica tu conexión e intenta de nuevo.");
      return;
    }
    const catalogoEntry = DATA.catalogo_padecimientos.find((p) => p.epiclave === epiclaveActual);
    const canal = DATA.canales[epiclaveActual];
    if (!catalogoEntry || !catalogoEntry.disponible || !canal) {
      alert(`No hay canal disponible para "${catalogoEntry ? catalogoEntry.padecimiento : epiclaveActual}" — no se puede generar el reporte PDF.\n\n${(catalogoEntry && catalogoEntry.motivo) || "Información histórica insuficiente."}`);
      return;
    }

    const { jsPDF } = window.jspdf;
    const margenX = 40;
    const pageWidth = 612, pageHeight = 792;
    const anchoDisponible = pageWidth - margenX * 2;
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    let y = 44;

    function saltarPaginaSiNecesario(alturaNecesaria) {
      if (y + alturaNecesaria > pageHeight - margenX) { doc.addPage("letter", "portrait"); y = 44; }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("SNSP Inteligencia Digital — Canal Endémico Exploratorio", margenX, y);
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    [
      `Padecimiento: ${canal.padecimiento_texto_completo || canal.padecimiento} (Epi-Clave ${canal.epiclave})`,
      `Periodo: referencia histórica ${canal.anios_historicos_usados[0]}-${canal.anios_historicos_usados[canal.anios_historicos_usados.length - 1]} · observado ${canal.anio_observado} (hasta SE ${canal.ultima_semana_observada})`,
      `Fuente: ${DATA.meta.fuente} (misma base real del Bloque 2 de Morbilidad)`,
      `Fecha de generación: ${new Date().toLocaleString("es-MX")}`,
    ].forEach((linea) => {
      doc.splitTextToSize(linea, anchoDisponible).forEach((l) => { doc.text(l, margenX, y); y += 14; });
    });
    y += 6;

    // KPIs principales (tabla compacta)
    const kpiRows = Array.from(document.querySelectorAll("#kpi-grid .indicator-card")).map((card) => [
      (card.querySelector(".indicator-card__label") || {}).textContent || "",
      (card.querySelector(".indicator-card__value") || {}).textContent || "",
    ]);
    if (doc.autoTable && kpiRows.length) {
      doc.autoTable({
        startY: y, margin: { left: margenX, right: margenX },
        head: [["Indicador", "Valor"]], body: kpiRows,
        styles: { fontSize: 9, cellPadding: 4 }, headStyles: { fillColor: [97, 18, 50] },
        tableWidth: anchoDisponible * 0.62,
      });
      y = doc.lastAutoTable.finalY + 16;
    }

    // Gráfica grande del canal (se captura el <canvas> real ya renderizado)
    const canvasEl = document.getElementById("chart-canal");
    if (canvasEl && chart) {
      try {
        const w = canvasEl.width, h = canvasEl.height;
        if (w && h) {
          const aux = document.createElement("canvas");
          aux.width = w; aux.height = h;
          const actx = aux.getContext("2d");
          actx.fillStyle = "#FFFFFF"; actx.fillRect(0, 0, w, h);
          actx.drawImage(canvasEl, 0, 0, w, h);
          const dataUrl = aux.toDataURL("image/jpeg", 0.92);
          let imgW = anchoDisponible, imgH = Math.round(imgW * (h / w));
          const maxH = 300;
          if (imgH > maxH) { const f = maxH / imgH; imgH = Math.round(imgH * f); imgW = Math.round(imgW * f); }
          saltarPaginaSiNecesario(imgH + 18);
          doc.setFont("helvetica", "bold"); doc.setFontSize(11);
          doc.text("Canal endémico exploratorio", margenX, y); y += 14;
          doc.addImage(dataUrl, "JPEG", margenX + (anchoDisponible - imgW) / 2, y, imgW, imgH);
          y += imgH + 16;
        }
      } catch (e) { /* si la captura falla, el reporte sigue sin la imagen */ }
    }

    // Distribución de semanas por zona
    saltarPaginaSiNecesario(100);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("Distribución de semanas por zona", margenX, y); y += 14;
    const ordenZonas = ["exito", "seguridad", "alerta", "epidemica"];
    const totalZonas = ordenZonas.reduce((a, z) => a + (canal.resumen_semanas_por_zona[z] || 0), 0);
    const zonaRows = ordenZonas.map((z) => [_canalZonaLabel(z), String(canal.resumen_semanas_por_zona[z] || 0)])
      .concat([[`Total (SE 1-${canal.ultima_semana_observada})`, String(totalZonas)]]);
    if (doc.autoTable) {
      doc.autoTable({
        startY: y, margin: { left: margenX, right: margenX },
        head: [["Zona", "Semanas"]], body: zonaRows,
        styles: { fontSize: 9, cellPadding: 4 }, headStyles: { fillColor: [97, 18, 50] },
        tableWidth: anchoDisponible * 0.5,
      });
      y = doc.lastAutoTable.finalY + 16;
    }

    // Totales anuales
    saltarPaginaSiNecesario(120);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("Totales anuales", margenX, y); y += 14;
    const totalesRows = canal.anios_historicos_usados.concat([canal.anio_observado]).map((a) => [
      a, SNSP_formatNumber(canal.total_por_anio[a] || 0),
      a === canal.anio_observado ? `Observado (parcial, hasta SE ${canal.ultima_semana_observada})` : "Histórico",
    ]);
    if (doc.autoTable) {
      doc.autoTable({
        startY: y, margin: { left: margenX, right: margenX },
        head: [["Año", "Casos", "Tipo"]], body: totalesRows,
        styles: { fontSize: 9, cellPadding: 4 }, headStyles: { fillColor: [97, 18, 50] },
        tableWidth: anchoDisponible * 0.78,
      });
      y = doc.lastAutoTable.finalY + 16;
    }

    // Nota metodológica breve
    saltarPaginaSiNecesario(70);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
    doc.text("Nota metodológica (breve)", margenX, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    const notaBreve = `${DATA.meta.metodo_cuantiles} ${DATA.meta.advertencia_exploratorio}`;
    doc.splitTextToSize(notaBreve, anchoDisponible).forEach((l) => {
      saltarPaginaSiNecesario(12);
      doc.text(l, margenX, y); y += 12;
    });

    // Anexo: detalle semanal completo (útil para consulta, en página
    // aparte para no saturar el cuerpo ejecutivo del reporte)
    doc.addPage("letter", "portrait");
    y = 44;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("Anexo — Detalle semanal completo", margenX, y); y += 18;
    const anexoRows = canal.semanas.map((s) => {
      const refInsuficiente = s.n_historico === 1;
      return [
        String(s.se),
        refInsuficiente ? "Referencia insuficiente (n=1)" : (s.q1 != null ? SNSP_formatNumber(Math.round(s.q1 * 100) / 100) : "—"),
        refInsuficiente ? "" : (s.mediana != null ? SNSP_formatNumber(Math.round(s.mediana * 100) / 100) : "—"),
        refInsuficiente ? "" : (s.q3 != null ? SNSP_formatNumber(Math.round(s.q3 * 100) / 100) : "—"),
        s.casos_2026 == null ? "Sin información" : SNSP_formatNumber(s.casos_2026),
        s.zona ? _canalZonaLabel(s.zona) : "—",
      ];
    });
    if (doc.autoTable) {
      // ACT24 (compactación): el anexo siempre trae 51-53 filas (SE 1 a
      // SE 53, todas las semanas del año de referencia, no sólo las ya
      // observadas) — con el tamaño de siempre (8pt/padding 3) no cabían
      // en una sola hoja y jspdf-autotable repartía unas pocas filas en
      // una página adicional casi vacía. Con 7.5pt/padding 2 el anexo
      // completo (hasta 53 filas + encabezado) cabe en una sola página
      // carta en todos los casos, sin perder ninguna fila ni volverse
      // ilegible (sigue siendo texto tabular simple: SE, 3 cuartiles,
      // casos y zona).
      doc.autoTable({
        startY: y, margin: { left: margenX, right: margenX },
        head: [["SE", "Q1", "Mediana", "Q3", "Casos 2026", "Zona"]], body: anexoRows,
        styles: { fontSize: 7.5, cellPadding: 2 }, headStyles: { fillColor: [97, 18, 50] },
      });
    }

    const totalPaginas = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPaginas; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text(`Página ${p} de ${totalPaginas}`, pageWidth - margenX, pageHeight - 20, { align: "right" });
    }

    const nombreArchivo = `snsp_canal_endemico_epiclave${canal.epiclave}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(nombreArchivo);
  }

  const btnPdf = document.getElementById("btn-canal-pdf");
  if (btnPdf) btnPdf.addEventListener("click", generarReportePDFCanalEndemico);

  renderNotaMetodologica();
  renderAll();

  document.getElementById("source-label").textContent =
    `${DATA.meta.fuente} (misma base real del Bloque 2 de Morbilidad) — módulo exploratorio`;
  document.getElementById("version-tag-module").textContent = window.SNSP_CONFIG.platform.version;
}
