/**
 * components/filterBar.js
 * -----------------------------------------------------------------------
 * Barra de filtros reutilizable (Año, Periodo, Jurisdicción, Municipio,
 * Institución, Unidad médica, CLUES, Grupo de edad, Sexo, Tipo de
 * indicador). Cada módulo decide cuáles mostrar mediante `fields`.
 * -----------------------------------------------------------------------
 */

const SNSP_FILTER_DEFS = {
  anio: { label: "Año", options: () => window.SNSP_CONFIG.catalogs.anios },
  periodo: { label: "Periodo", options: () => window.SNSP_CONFIG.catalogs.periodos },
  jurisdiccion: { label: "Jurisdicción", options: () => window.SNSP_CONFIG.catalogs.jurisdicciones },
  municipio: { label: "Municipio", options: () => window.SNSP_CONFIG.catalogs.municipios },
  institucion: { label: "Institución", options: () => window.SNSP_CONFIG.catalogs.instituciones },
  unidad_medica: { label: "Unidad médica", options: () => ["(catálogo pendiente de carga)"] },
  clues: { label: "CLUES", options: () => ["(catálogo pendiente de carga)"] },
  grupo_edad: { label: "Grupo de edad", options: () => window.SNSP_CONFIG.catalogs.gruposEdad },
  sexo: { label: "Sexo", options: () => window.SNSP_CONFIG.catalogs.sexo },
  tipo_indicador: { label: "Tipo de indicador", options: () => window.SNSP_CONFIG.catalogs.tiposIndicador },
};

function SNSP_renderFilterBar(containerId, fields, onApply) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const selectsHTML = fields.map((f) => {
    const def = SNSP_FILTER_DEFS[f];
    if (!def) return "";
    const options = def.options();
    return `
      <div class="field">
        <label for="flt-${f}">${def.label}</label>
        <select id="flt-${f}" data-filter="${f}">
          <option value="">Todos</option>
          ${options.map((o) => `<option value="${o}">${o}</option>`).join("")}
        </select>
      </div>
    `;
  }).join("");

  el.innerHTML = `
    ${selectsHTML}
    <div class="filter-bar__actions">
      <button class="btn btn-primary btn-sm" id="btn-aplicar-filtros">Aplicar filtros</button>
      <button class="btn btn-ghost btn-sm" id="btn-limpiar-filtros">Limpiar</button>
    </div>
  `;

  function collect() {
    const values = {};
    fields.forEach((f) => {
      const node = document.getElementById(`flt-${f}`);
      if (node && node.value) values[f] = node.value;
    });
    return values;
  }

  document.getElementById("btn-aplicar-filtros").addEventListener("click", () => onApply(collect()));
  document.getElementById("btn-limpiar-filtros").addEventListener("click", () => {
    fields.forEach((f) => { const n = document.getElementById(`flt-${f}`); if (n) n.value = ""; });
    onApply({});
  });
}
