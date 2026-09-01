/**
 * services/morbilidadDataService.js
 * -----------------------------------------------------------------------
 * CAPA DE SERVICIOS — MORBILIDAD, ESTADO DE QUERÉTARO (2024-2026)
 * Lee window.SNSP_MORBILIDAD_DATA (generado por scripts/build_morbilidad.py
 * a partir de CUBOS_DE_MORBILIDAD_2025_CON_CUBOS.xlsx) y expone búsqueda de
 * CIE-10/Epi-clave, filtros y agregados dinámicos sobre el cubo
 * [epiclave, anio, municipio, jurisdiccion, institucion, clues, mes, casos].
 *
 * ESTA FUENTE ES EXCLUSIVAMENTE ESTATAL (Querétaro) — no trae entidad como
 * dimensión porque sólo hay un valor. El contrato se deja preparado para
 * que, cuando llegue una base nacional, se agregue "entidad" como filtro
 * más (ver getCubo/ámbito) sin tener que rediseñar los módulos ni el resto
 * de la plataforma.
 *
 * No calcula tasas, incidencia ni cobertura (sin denominador poblacional
 * validado). No incluye sexo ni grupo de edad (no existen en la fuente).
 *
 * Contrato público:
 *   SNSP_MORBILIDAD_SERVICE.getAmbito() -> { entidad, alcance, anios_disponibles, ... }
 *   SNSP_MORBILIDAD_SERVICE.buscarPadecimientos(texto) -> [{epiclave,padecimiento,cie10_texto,...}]
 *   SNSP_MORBILIDAD_SERVICE.getAccesosRapidos() -> [{codigo, disponible, epiclaves}]
 *   SNSP_MORBILIDAD_SERVICE.getPadecimiento(epiclave) -> {epiclave,padecimiento,cie10_texto,...} | null
 *   SNSP_MORBILIDAD_SERVICE.getIndicadores(filtros) -> objeto de indicadores (ver abajo)
 *   SNSP_MORBILIDAD_SERVICE.getCatalogos() -> {anios, municipios, jurisdicciones, instituciones, meses}
 *   SNSP_MORBILIDAD_SERVICE.getClues(clues) -> {unidad_medica, municipio, ...} | null
 *   SNSP_MORBILIDAD_SERVICE.toRankedArray(counterObj, opts) -> [{label,value,pct}]
 * -----------------------------------------------------------------------
 */
(function () {
  function raw() { return window.SNSP_MORBILIDAD_DATA || null; }

  function sumValues(obj) {
    return Object.values(obj || {}).reduce((a, b) => a + b, 0);
  }

  function toRankedArray(counterObj, opts) {
    opts = opts || {};
    const total = sumValues(counterObj);
    let arr = Object.entries(counterObj || {}).map(([label, value]) => ({
      label,
      value,
      pct: total ? Math.round((value / total) * 1000) / 10 : 0,
    }));
    arr.sort((a, b) => b.value - a.value);
    if (opts.top) arr = arr.slice(0, opts.top);
    return arr;
  }

  function getAmbito() {
    const d = raw();
    return d ? d.meta : null;
  }

  function getCatalogos() {
    const d = raw();
    return d ? d.catalogos : { anios: [], municipios: [], jurisdicciones: [], instituciones: [], meses: [] };
  }

  function getAccesosRapidos() {
    const d = raw();
    return d ? d.accesos_rapidos : [];
  }

  function getPadecimiento(epiclave) {
    const d = raw();
    if (!d) return null;
    return d.catalogo_padecimientos.find((p) => p.epiclave === String(epiclave)) || null;
  }

  // Búsqueda por texto libre: coincide contra epi-clave, nombre del
  // padecimiento o el/los código(s) CIE-10 asociados. No usa fuzzy-match
  // ni inventa relaciones: sólo substring case-insensitive (sin acentos).
  function _norm(s) {
    return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function buscarPadecimientos(texto, opts) {
    opts = opts || {};
    const d = raw();
    if (!d) return [];
    const q = _norm(texto);
    let results = d.catalogo_padecimientos;
    if (q) {
      results = results.filter((p) =>
        _norm(p.padecimiento).includes(q) ||
        _norm(p.epiclave).includes(q) ||
        _norm(p.cie10_texto).includes(q) ||
        (p.cie10_codigos || []).some((c) => _norm(c).includes(q)) ||
        (p.cie10_prefijos || []).some((c) => _norm(c).includes(q))
      );
    }
    if (opts.limit) results = results.slice(0, opts.limit);
    return results;
  }

  function getClues(clues) {
    const d = raw();
    if (!d || !clues) return null;
    return d.clues_catalogo[clues] || null;
  }

  // Filtra el cubo (arreglo de combinaciones) según los filtros dados.
  // filtros: { epiclaves: string[] (requerido, 1 o más), anio, municipio,
  //            jurisdiccion, institucion, clues, mes }
  function _filtrarCubo(filtros) {
    const d = raw();
    if (!d) return [];
    const epiSet = filtros.epiclaves && filtros.epiclaves.length ? new Set(filtros.epiclaves) : null;
    return d.cubo.filter((row) => {
      // row: [epiclave, anio, municipio, jurisdiccion, institucion, clues, mes, casos]
      if (epiSet && !epiSet.has(row[0])) return false;
      if (filtros.anio && String(row[1]) !== String(filtros.anio)) return false;
      if (filtros.municipio && row[2] !== filtros.municipio) return false;
      if (filtros.jurisdiccion && row[3] !== filtros.jurisdiccion) return false;
      if (filtros.institucion && row[4] !== filtros.institucion) return false;
      if (filtros.clues && row[5] !== filtros.clues) return false;
      if (filtros.mes && row[6] !== filtros.mes) return false;
      return true;
    });
  }

  // Indicadores y desgloses dinámicos para el/los padecimiento(s)
  // seleccionados, con los filtros adicionales aplicados. Todo se calcula
  // en tiempo de ejecución sobre el cubo — no hay tasas, sólo conteos.
  function getIndicadores(filtros) {
    filtros = filtros || {};
    const d = raw();
    if (!d) return null;
    if (!filtros.epiclaves || !filtros.epiclaves.length) {
      return { seleccionado: false };
    }

    const rows = _filtrarCubo(filtros);
    const total = rows.reduce((s, r) => s + r[7], 0);

    const porMunicipio = {};
    const porJurisdiccion = {};
    const porInstitucion = {};
    const porAnio = {};
    const porMes = {};
    const porAnioMes = {}; // "2025|03 Marzo" -> casos, para la serie temporal
    const porClues = {}; // clues -> casos
    const porPadecimiento = {}; // epiclave -> casos (útil si hay varios, p.ej. accesos rápidos como N87)

    rows.forEach((r) => {
      const [epiclave, anio, municipio, jurisdiccion, institucion, clues, mes, casos] = r;
      porMunicipio[municipio] = (porMunicipio[municipio] || 0) + casos;
      porJurisdiccion[jurisdiccion] = (porJurisdiccion[jurisdiccion] || 0) + casos;
      porInstitucion[institucion] = (porInstitucion[institucion] || 0) + casos;
      porAnio[anio] = (porAnio[anio] || 0) + casos;
      porMes[mes] = (porMes[mes] || 0) + casos;
      const claveAnioMes = anio + "|" + mes;
      porAnioMes[claveAnioMes] = (porAnioMes[claveAnioMes] || 0) + casos;
      porClues[clues] = (porClues[clues] || 0) + casos;
      porPadecimiento[epiclave] = (porPadecimiento[epiclave] || 0) + casos;
    });

    return {
      seleccionado: true,
      total,
      registros_combinacion: rows.length,
      por_municipio: porMunicipio,
      por_jurisdiccion: porJurisdiccion,
      por_institucion: porInstitucion,
      por_anio: porAnio,
      por_mes: porMes,
      por_anio_mes: porAnioMes,
      por_clues: porClues,
      por_padecimiento: porPadecimiento,
    };
  }

  // Top N padecimientos "principales" para el panel general (sin filtrar
  // por un código específico), respetando los filtros transversales
  // (municipio, jurisdicción, institución, año, mes, clues) si se pasan.
  function getPrincipalesPadecimientos(filtrosBase, top) {
    const d = raw();
    if (!d) return [];
    const filtros = Object.assign({}, filtrosBase, { epiclaves: null });
    const epiSet = null;
    const acc = {};
    d.cubo.forEach((row) => {
      if (filtrosBase.anio && String(row[1]) !== String(filtrosBase.anio)) return;
      if (filtrosBase.municipio && row[2] !== filtrosBase.municipio) return;
      if (filtrosBase.jurisdiccion && row[3] !== filtrosBase.jurisdiccion) return;
      if (filtrosBase.institucion && row[4] !== filtrosBase.institucion) return;
      if (filtrosBase.clues && row[5] !== filtrosBase.clues) return;
      if (filtrosBase.mes && row[6] !== filtrosBase.mes) return;
      acc[row[0]] = (acc[row[0]] || 0) + row[7];
    });
    const arr = Object.entries(acc).map(([epiclave, casos]) => {
      const p = getPadecimiento(epiclave);
      return { epiclave, casos, padecimiento: p ? p.padecimiento : epiclave, cie10_texto: p ? p.cie10_texto : "" };
    });
    arr.sort((a, b) => b.casos - a.casos);
    return top ? arr.slice(0, top) : arr;
  }

  window.SNSP_MORBILIDAD_SERVICE = {
    getAmbito,
    getCatalogos,
    getAccesosRapidos,
    getPadecimiento,
    buscarPadecimientos,
    getClues,
    getIndicadores,
    getPrincipalesPadecimientos,
    toRankedArray,
  };
})();
