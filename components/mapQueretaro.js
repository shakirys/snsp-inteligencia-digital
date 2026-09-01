/**
 * components/mapQueretaro.js
 * -----------------------------------------------------------------------
 * Mapa ilustrativo (no cartográfico) de los 18 municipios de Querétaro,
 * usado para representar valores por municipio con un gradiente de color.
 * Cuando se disponga de geometría oficial (GeoJSON/Shapefile del estado),
 * este componente se sustituye internamente sin cambiar su API pública:
 *   SNSP_renderMapQueretaro(svgContainerId, legendContainerId, dataByMunicipio, opts)
 * -----------------------------------------------------------------------
 */

// Posiciones relativas aproximadas (no geodésicas) que conservan la
// disposición general norte-sur / sierra-valle del estado, sólo para
// fines ilustrativos de la maqueta funcional.
const SNSP_QRO_MUNICIPIOS_LAYOUT = [
  { name: "Jalpan de Serra", x: 60, y: 30, w: 90, h: 46 },
  { name: "Arroyo Seco", x: 60, y: 4, w: 90, h: 22 },
  { name: "Landa de Matamoros", x: 155, y: 30, w: 70, h: 46 },
  { name: "Pinal de Amoles", x: 60, y: 80, w: 70, h: 44 },
  { name: "Peñamiller", x: 135, y: 80, w: 60, h: 44 },
  { name: "San Joaquín", x: 60, y: 128, w: 60, h: 40 },
  { name: "Cadereyta de Montes", x: 125, y: 128, w: 70, h: 40 },
  { name: "Tolimán", x: 200, y: 100, w: 62, h: 46 },
  { name: "Colón", x: 200, y: 150, w: 62, h: 40 },
  { name: "Ezequiel Montes", x: 130, y: 172, w: 68, h: 34 },
  { name: "Tequisquiapan", x: 200, y: 194, w: 62, h: 34 },
  { name: "San Juan del Río", x: 195, y: 232, w: 70, h: 40 },
  { name: "Pedro Escobedo", x: 130, y: 210, w: 60, h: 36 },
  { name: "Amealco de Bonfil", x: 60, y: 232, w: 66, h: 46 },
  { name: "Huimilpan", x: 132, y: 250, w: 56, h: 36 },
  { name: "Querétaro", x: 68, y: 178, w: 60, h: 48 },
  { name: "Corregidora", x: 68, y: 230, w: 58, h: 32 },
  { name: "El Marqués", x: 130, y: 128, w: 0, h: 0 }, // placeholder handled below
];
// El Marqués se ubica junto a Querétaro; corregimos su caja manualmente.
SNSP_QRO_MUNICIPIOS_LAYOUT.find((m) => m.name === "El Marqués").x = 132;
SNSP_QRO_MUNICIPIOS_LAYOUT.find((m) => m.name === "El Marqués").y = 178;
SNSP_QRO_MUNICIPIOS_LAYOUT.find((m) => m.name === "El Marqués").w = 60;
SNSP_QRO_MUNICIPIOS_LAYOUT.find((m) => m.name === "El Marqués").h = 30;

function SNSP_colorScale(value, min, max) {
  if (max === min) return "var(--c-gris)";
  const t = (value - min) / (max - min);
  // Interpola entre beige (bajo) y vino (alto), pasando por dorado.
  const stops = [
    { t: 0, c: [230, 209, 148] },   // beige
    { t: 0.5, c: [165, 127, 44] },  // dorado
    { t: 1, c: [97, 18, 50] },      // vino
  ];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) { a = stops[i]; b = stops[i + 1]; break; }
  }
  const localT = (t - a.t) / (b.t - a.t || 1);
  const rgb = a.c.map((v, i) => Math.round(v + (b.c[i] - v) * localT));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function SNSP_renderMapQueretaro(svgContainerId, legendContainerId, dataByMunicipio, opts) {
  opts = opts || {};
  const svgEl = document.getElementById(svgContainerId);
  const legendEl = document.getElementById(legendContainerId);
  if (!svgEl) return;

  const valueMap = {};
  (dataByMunicipio || []).forEach((d) => { valueMap[d.municipio] = d.value; });
  const values = Object.values(valueMap);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;

  const shapes = SNSP_QRO_MUNICIPIOS_LAYOUT.map((m) => {
    const val = valueMap[m.name];
    const hasVal = val !== undefined;
    const fill = hasVal ? SNSP_colorScale(val, min, max) : "var(--bg-sunken)";
    return `
      <g>
        <rect class="municipio-shape" x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="4"
              fill="${fill}" data-municipio="${m.name}" data-value="${hasVal ? val : ""}">
          <title>${m.name}${hasVal ? ": " + val + (opts.unit || "") : ": " + window.SNSP_CONFIG.dataStatusLabel}</title>
        </rect>
        <text class="municipio-label" x="${m.x + m.w / 2}" y="${m.y + m.h / 2 + 3}" text-anchor="middle">${m.name.length > 12 ? m.name.slice(0, 10) + "…" : m.name}</text>
      </g>
    `;
  }).join("");

  svgEl.innerHTML = `
    <svg viewBox="0 0 270 300" width="100%" style="max-width:360px" xmlns="http://www.w3.org/2000/svg">
      ${shapes}
    </svg>
  `;

  if (legendEl) {
    legendEl.innerHTML = `
      <div class="map-legend__item"><span class="map-legend__swatch" style="background:${SNSP_colorScale(min, min, max)}"></span> Menor ${opts.unit || ""} (${min || 0})</div>
      <div class="map-legend__item"><span class="map-legend__swatch" style="background:${SNSP_colorScale((min+max)/2, min, max)}"></span> Medio</div>
      <div class="map-legend__item"><span class="map-legend__swatch" style="background:${SNSP_colorScale(max, min, max)}"></span> Mayor ${opts.unit || ""} (${max || 0})</div>
      <div class="map-legend__item"><span class="map-legend__swatch" style="background:var(--bg-sunken)"></span> Sin datos cargados</div>
      <p class="text-muted mt-2" style="font-size:var(--fs-caption)">Mapa ilustrativo; posiciones no geodésicas. Sustituible por geometría oficial (GeoJSON) sin cambiar el resto de la pantalla.</p>
    `;
  }
}
