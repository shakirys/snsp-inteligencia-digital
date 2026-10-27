/**
 * components/mapaCoropleticoQro.js  (ACT26 — NUEVO, aditivo)
 * -----------------------------------------------------------------------
 * Mapa coroplético interactivo de los 18 municipios de Querétaro, con los
 * límites municipales reales (window.SNSP_GEO_QRO_MUNICIPIOS, generado
 * desde Municipios_Queretaro_18.topojson por
 * scripts/build_poblacion_historica.py). SVG + JS puro: sin librerías ni
 * mosaicos externos, funciona sin conexión.
 *
 * No sustituye a components/mapQueretaro.js (mapa ilustrativo que sigue
 * usando la sección del padrón ASIS 2025).
 *
 * SNSP_renderMapaCoropleticoQro(containerId, legendId, valores, opts)
 *   valores: { "001": número, ... }  (clave de municipio de 3 dígitos)
 *   opts: {
 *     unidad: " hab.",
 *     jsActiva: 1..4 | null      -> atenúa los municipios fuera de esa jurisdicción
 *     cveSeleccionada: "014"|null -> resalta el municipio
 *     onSelect: fn(cve|null)      -> clic en municipio (clic de nuevo = quitar)
 *     detalle: fn(cve) -> html extra para el tooltip
 *     nClases: 5
 *   }
 * Clasificación (ACT26c.1): quintiles POR RANGO de los 18 municipios
 * (SNSP_clasificarMunicipiosQuintiles). Cada clase se describe con los
 * valores reales mínimo y máximo de los municipios que la integran, así
 * que los intervalos de la leyenda nunca comparten límites ni son
 * ambiguos. La misma función la usa el reporte PDF (una sola fuente).
 * Límites municipales con doble trazo (blanco + gris oscuro) visibles
 * sobre cualquiera de los 5 colores.
 * -----------------------------------------------------------------------
 */
// Paleta secuencial de 5 clases (institucional: beige → dorado → rojo
// claro → vino oscuro). Pasos de luminosidad CIELAB ~15-21 entre clases.
var SNSP_MAPA_RAMPA = ["#F2E6C2", "#D9B867", "#A57F2C", "#9B2247", "#4A0B24"];

/**
 * Quintiles por rango: ordena los municipios de menor a mayor población y
 * asigna la clase floor(i·5/n) (18 municipios -> 4, 4, 3, 4, 3). Devuelve
 * { claseDe: {cve: 0..4}, clases: [{min, max, n, cves}] } con min/max =
 * valores reales (sin interpolar), por lo que las clases no se traslapan.
 */
function SNSP_clasificarMunicipiosQuintiles(valores, nClases) {
  nClases = nClases || 5;
  const lista = Object.entries(valores).filter(([, v]) => typeof v === "number").sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const claseDe = {};
  const clases = Array.from({ length: nClases }, () => ({ min: null, max: null, n: 0, cves: [] }));
  lista.forEach(([cve, v], i) => {
    const k = Math.min(nClases - 1, Math.floor((i * nClases) / lista.length));
    claseDe[cve] = k;
    const c = clases[k];
    c.min = c.min === null ? v : Math.min(c.min, v);
    c.max = c.max === null ? v : Math.max(c.max, v);
    c.n += 1; c.cves.push(cve);
  });
  return { claseDe, clases };
}

function SNSP_rangoClaseTexto(c) {
  const f = (v) => Math.round(v).toLocaleString("es-MX");
  return `${f(c.min)} a ${f(c.max)}`;
}

function SNSP_renderMapaCoropleticoQro(containerId, legendId, valores, opts) {
  opts = opts || {};
  const geo = window.SNSP_GEO_QRO_MUNICIPIOS;
  const el = document.getElementById(containerId);
  if (!el || !geo) return null;
  const unidad = opts.unidad || "";
  const cs = getComputedStyle(document.documentElement);
  const colores = SNSP_MAPA_RAMPA.map((c, i) => cs.getPropertyValue(`--ph-map-${i + 1}`).trim() || c);
  const cls5 = SNSP_clasificarMunicipiosQuintiles(valores, 5);
  const total = Object.values(valores).reduce((a, b) => a + (b || 0), 0);
  const fmt = (v) => SNSP_formatNumber(Math.round(v));
  const dentro = (f) => (opts.cveSeleccionada ? f.cve === opts.cveSeleccionada : opts.jsActiva ? f.js === Number(opts.jsActiva) : true);

  const relleno = geo.features.map((f) => {
    const v = valores[f.cve];
    const fuera = opts.jsActiva && f.js !== Number(opts.jsActiva);
    const sel = opts.cveSeleccionada === f.cve;
    const fill = typeof v === "number" ? colores[cls5.claseDe[f.cve]] : "var(--chart-cero)";
    const cls = ["ph-mapa__mun", fuera ? "is-fuera" : "", sel ? "is-sel" : ""].join(" ").trim();
    return `<path class="${cls}" data-cve="${f.cve}" data-clase="${cls5.claseDe[f.cve]}" d="${f.d}" fill="${fill}" tabindex="0" role="button" aria-label="${f.nombre}: ${typeof v === "number" ? fmt(v) + unidad : "sin dato"}"></path>`;
  }).join("");
  // Límites: trazo gris oscuro fino encima del halo blanco de cada polígono.
  const limites = `<g class="ph-mapa__limites" pointer-events="none">${geo.features.map((f) => `<path d="${f.d}"></path>`).join("")}</g>`;
  // Área seleccionada: halo blanco + contorno oscuro (visible sobre cualquier color).
  const selF = geo.features.filter((f) => (opts.cveSeleccionada || opts.jsActiva) && dentro(f));
  const resalte = selF.length
    ? `<g class="ph-mapa__resalte ${opts.cveSeleccionada ? "is-mun" : "is-js"}" pointer-events="none">${selF.map((f) => `<path class="ph-mapa__resalte-halo" d="${f.d}"></path>`).join("")}${selF.map((f) => `<path class="ph-mapa__resalte-linea" d="${f.d}"></path>`).join("")}</g>`
    : "";
  const fSel = opts.cveSeleccionada ? geo.features.find((f) => f.cve === opts.cveSeleccionada) : null;
  const etiqueta = fSel && fSel.centroide
    ? `<g class="ph-mapa__etq" pointer-events="none"><text x="${fSel.centroide[0]}" y="${fSel.centroide[1]}" text-anchor="middle">${fSel.nombre}</text></g>`
    : "";

  el.innerHTML = `<div class="ph-mapa__wrap">
      <svg class="ph-mapa__svg" viewBox="${geo.viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de los 18 municipios de Querétaro">${relleno}${limites}${resalte}${etiqueta}</svg>
      <div class="ph-mapa__tip" hidden></div>
    </div>`;

  const svg = el.querySelector("svg");
  const tip = el.querySelector(".ph-mapa__tip");
  const wrap = el.querySelector(".ph-mapa__wrap");
  function mostrar(cve, evt) {
    const f = geo.features.find((x) => x.cve === cve);
    const v = valores[cve];
    const k = cls5.claseDe[cve];
    tip.innerHTML = `<strong>${f.nombre}</strong><span>JS ${f.js} · CVEGEO ${f.cvegeo}</span>` +
      `<span class="ph-mapa__tip-num">${typeof v === "number" ? fmt(v) + unidad : "Sin dato"}</span>` +
      (typeof v === "number" && total ? `<span>${SNSP_formatPercent((v / total) * 100, 1)} de la población del estado</span>` : "") +
      (k !== undefined ? `<span>Clase ${k + 1} de 5 (${SNSP_rangoClaseTexto(cls5.clases[k])} hab.)</span>` : "") +
      (opts.detalle ? opts.detalle(cve) : "");
    tip.hidden = false;
    const r = wrap.getBoundingClientRect();
    let x, y;
    if (evt && evt.clientX !== undefined) { x = evt.clientX - r.left; y = evt.clientY - r.top; }
    else if (f.centroide) {
      const vb = geo.viewBox.split(" ").map(Number);
      x = (f.centroide[0] / vb[2]) * r.width; y = (f.centroide[1] / vb[3]) * r.height;
    } else { x = r.width / 2; y = r.height / 2; }
    const tw = tip.offsetWidth || 180;
    tip.style.left = Math.min(Math.max(4, x + 14), Math.max(4, r.width - tw - 4)) + "px";
    tip.style.top = Math.max(4, y - 10) + "px";
  }
  svg.querySelectorAll(".ph-mapa__mun").forEach((p) => {
    const cve = p.getAttribute("data-cve");
    p.addEventListener("mousemove", (e) => mostrar(cve, e));
    p.addEventListener("mouseleave", () => { tip.hidden = true; });
    p.addEventListener("focus", () => mostrar(cve));
    p.addEventListener("blur", () => { tip.hidden = true; });
    const elegir = () => { if (opts.onSelect) opts.onSelect(opts.cveSeleccionada === cve ? null : cve); };
    p.addEventListener("click", elegir);
    p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elegir(); } });
  });

  // ---- Leyenda: rangos reales, sin límites compartidos ----
  const lg = document.getElementById(legendId);
  if (lg) {
    lg.innerHTML = `<div class="ph-mapa__leyenda-titulo">${opts.tituloLeyenda || "Habitantes"}</div>` +
      `<div class="ph-mapa__leyenda-sub">Clases de mayor a menor población</div>` +
      cls5.clases.map((c, i) => ({ c, i })).reverse().map(({ c, i }) =>
        `<div class="ph-mapa__leyenda-item" data-clase="${i}"><span class="ph-mapa__sw" style="background:${colores[i]}"></span><span class="ph-mapa__leyenda-rango">${SNSP_rangoClaseTexto(c)} hab.</span><span class="ph-mapa__leyenda-n">${c.n} municipios</span></div>`
      ).join("") +
      `<div class="ph-mapa__leyenda-nota">Quintiles de los 18 municipios por número de habitantes; cada rango va del municipio menos poblado al más poblado de la clase.${opts.cveSeleccionada || opts.jsActiva ? " Contorno oscuro: área seleccionada." : ""}</div>`;
  }
  return cls5;
}
