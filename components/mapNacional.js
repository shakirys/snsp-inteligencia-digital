/**
 * components/mapNacional.js
 * -----------------------------------------------------------------------
 * Mapa ilustrativo (no cartográfico) por entidad federativa. Las bases de
 * CACU y Cáncer de Mama son nacionales y sólo traen `entidad`, no
 * municipio/jurisdicción, por lo que el mapa de Querétaro
 * (components/mapQueretaro.js) no aplica aquí y se usa este componente
 * en su lugar. Misma API pública que su contraparte estatal, para que en
 * el futuro se puedan sustituir por geometría oficial (GeoJSON de INEGI)
 * sin cambiar el resto de la pantalla:
 *   SNSP_renderMapNacional(svgContainerId, legendContainerId, dataByEntidad, opts)
 * -----------------------------------------------------------------------
 */

// Disposición en cuadrícula (no geodésica) de las 32 entidades, agrupadas
// aproximadamente por región para que la lectura visual sea intuitiva,
// únicamente con fines ilustrativos.
const SNSP_ENTIDADES_LAYOUT = [
  { name: "Baja California", x: 0, y: 0 }, { name: "Baja California Sur", x: 0, y: 40 },
  { name: "Sonora", x: 40, y: 0 }, { name: "Sinaloa", x: 40, y: 40 },
  { name: "Chihuahua", x: 80, y: 0 },
  { name: "Coahuila", x: 120, y: 0 }, { name: "Nuevo León", x: 160, y: 0 },
  { name: "Tamaulipas", x: 200, y: 0 }, { name: "Durango", x: 80, y: 40 }, { name: "Zacatecas", x: 120, y: 40 },
  { name: "Nayarit", x: 40, y: 80 }, { name: "Jalisco", x: 80, y: 80 },
  { name: "Aguascalientes", x: 120, y: 80 }, { name: "San Luis Potosí", x: 160, y: 40 },
  { name: "Guanajuato", x: 120, y: 120 }, { name: "Querétaro", x: 160, y: 80 },
  { name: "Hidalgo", x: 200, y: 40 }, { name: "Veracruz", x: 240, y: 40 },
  { name: "Colima", x: 80, y: 120 }, { name: "Michoacán", x: 120, y: 160 },
  { name: "Estado de México", x: 160, y: 120 }, { name: "Ciudad de México", x: 160, y: 160 },
  { name: "Tlaxcala", x: 200, y: 80 }, { name: "Puebla", x: 200, y: 120 },
  { name: "Morelos", x: 160, y: 200 },
  { name: "Guerrero", x: 120, y: 200 }, { name: "Oaxaca", x: 200, y: 160 },
  { name: "Chiapas", x: 240, y: 160 }, { name: "Tabasco", x: 240, y: 120 },
  { name: "Campeche", x: 280, y: 120 }, { name: "Yucatán", x: 320, y: 100 },
  { name: "Quintana Roo", x: 320, y: 140 },
];
const SNSP_ENTIDAD_BOX = { w: 36, h: 34 };

function SNSP_mapColorScale(value, min, max) {
  if (max === min) return "var(--c-gris)";
  const t = (value - min) / (max - min);
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

function SNSP_renderMapNacional(svgContainerId, legendContainerId, dataByEntidad, opts) {
  opts = opts || {};
  const svgEl = document.getElementById(svgContainerId);
  const legendEl = document.getElementById(legendContainerId);
  if (!svgEl) return;

  const valueMap = dataByEntidad || {};
  const values = Object.values(valueMap);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;

  const shapes = SNSP_ENTIDADES_LAYOUT.map((m) => {
    const val = valueMap[m.name];
    const hasVal = val !== undefined;
    const fill = hasVal ? SNSP_mapColorScale(val, min, max) : "var(--bg-sunken)";
    const label = m.name.length > 10 ? m.name.slice(0, 8) + "…" : m.name;
    return `
      <g>
        <rect class="municipio-shape" x="${m.x}" y="${m.y}" width="${SNSP_ENTIDAD_BOX.w}" height="${SNSP_ENTIDAD_BOX.h}" rx="3"
              fill="${fill}" data-entidad="${m.name}" data-value="${hasVal ? val : ""}">
          <title>${m.name}${hasVal ? ": " + val + (opts.unit || "") : ": " + window.SNSP_CONFIG.dataStatusLabel}</title>
        </rect>
        <text class="municipio-label" x="${m.x + SNSP_ENTIDAD_BOX.w / 2}" y="${m.y + SNSP_ENTIDAD_BOX.h / 2 + 3}" text-anchor="middle" style="font-size:6px;">${label}</text>
      </g>
    `;
  }).join("");

  svgEl.innerHTML = `
    <svg viewBox="0 0 365 240" width="100%" style="max-width:520px" xmlns="http://www.w3.org/2000/svg">
      ${shapes}
    </svg>
  `;

  if (legendEl) {
    legendEl.innerHTML = `
      <div class="map-legend__item"><span class="map-legend__swatch" style="background:${SNSP_mapColorScale(min, min, max)}"></span> Menor ${opts.unit || ""} (${min || 0})</div>
      <div class="map-legend__item"><span class="map-legend__swatch" style="background:${SNSP_mapColorScale((min + max) / 2, min, max)}"></span> Medio</div>
      <div class="map-legend__item"><span class="map-legend__swatch" style="background:${SNSP_mapColorScale(max, min, max)}"></span> Mayor ${opts.unit || ""} (${max || 0})</div>
      <div class="map-legend__item"><span class="map-legend__swatch" style="background:var(--bg-sunken)"></span> Sin datos</div>
      <p class="text-muted mt-2" style="font-size:var(--fs-caption)">Mapa ilustrativo por entidad federativa; posiciones no geodésicas. Sustituible por geometría oficial (GeoJSON de INEGI) sin cambiar el resto de la pantalla. Nota metodológica: estas bases son nacionales y no incluyen desagregación municipal ni jurisdiccional.</p>
    `;
  }
}
