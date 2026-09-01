/**
 * services/poblacionDataService.js
 * -----------------------------------------------------------------------
 * CAPA DE SERVICIOS — POBLACIÓN, ESTADO DE QUERÉTARO (padrón 2025)
 * Lee window.SNSP_POBLACION_DATA (generado por scripts/build_poblacion.py
 * a partir de BASE_POBLACIONAL_ASIS_QUERETARO_2025.xlsx) y expone
 * agregados por municipio, pirámide poblacional por sexo/grupo de edad y
 * consulta de localidades.
 *
 * ESTA FUENTE ES EXCLUSIVAMENTE ESTATAL (Querétaro), a nivel LOCALIDAD.
 * Sólo trae 4 grupos de edad (0-9, 10-19, 20-59, 60+) — no se inventan
 * quinquenales. Este módulo es independiente: no se usa aquí como
 * denominador de tasas de CACU/Mama/Morbilidad (ver README).
 *
 * Contrato público:
 *   SNSP_POBLACION_SERVICE.getAmbito() -> meta
 *   SNSP_POBLACION_SERVICE.getCatalogos() -> { municipios }
 *   SNSP_POBLACION_SERVICE.getResumen(filtros) -> { total, mujeres, hombres, localidades, municipios, bandas }
 *   SNSP_POBLACION_SERVICE.getPorMunicipio() -> [{municipio, total, mujeres, hombres, localidades, bandas}]
 *   SNSP_POBLACION_SERVICE.getPiramide(filtros) -> { bandas:[...], mujeres:[...], hombres:[...] }
 *   SNSP_POBLACION_SERVICE.buscarLocalidades(filtros) -> [{cvegeo,municipio,localidad,mujeres,hombres,total,...}]
 *   SNSP_POBLACION_SERVICE.getLocalidadMasPoblada(filtros) -> {municipio,localidad,total} | null
 *   SNSP_POBLACION_SERVICE.toRankedArray(counterObj, opts) -> [{label,value,pct}]
 * -----------------------------------------------------------------------
 */
(function () {
  function raw() { return window.SNSP_POBLACION_DATA || null; }

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
    return d ? d.catalogos : { municipios: [] };
  }

  function getPorMunicipio() {
    const d = raw();
    return d ? d.por_municipio : [];
  }

  // Devuelve el resumen agregado (total, mujeres, hombres, localidades,
  // bandas) respetando el filtro de municipio si se aplica. Sin filtro,
  // usa el resumen estatal ya precalculado (más eficiente que sumar 2,192
  // filas en cada render).
  function getResumen(filtros) {
    filtros = filtros || {};
    const d = raw();
    if (!d) return null;

    if (!filtros.municipio) {
      return {
        total: d.meta.total_poblacion,
        mujeres: d.meta.total_mujeres,
        hombres: d.meta.total_hombres,
        localidades: d.meta.total_localidades,
        municipios: d.meta.total_municipios,
        bandas: d.resumen_estatal.bandas,
        poblacion_sin_desglose_edad: d.meta.poblacion_sin_desglose_edad,
        poblacion_con_desglose_edad: d.meta.poblacion_con_desglose_edad,
        localidades_sin_desglose_edad: d.meta.localidades_sin_desglose_edad,
      };
    }

    const pm = d.por_municipio.find((m) => m.municipio === filtros.municipio);
    if (!pm) return { total: 0, mujeres: 0, hombres: 0, localidades: 0, municipios: 0, bandas: {}, poblacion_sin_desglose_edad: 0, poblacion_con_desglose_edad: 0, localidades_sin_desglose_edad: 0 };
    return {
      total: pm.total,
      mujeres: pm.mujeres,
      hombres: pm.hombres,
      localidades: pm.localidades,
      municipios: 1,
      bandas: pm.bandas,
      poblacion_sin_desglose_edad: pm.poblacion_sin_desglose_edad,
      poblacion_con_desglose_edad: pm.total - pm.poblacion_sin_desglose_edad,
      localidades_sin_desglose_edad: pm.localidades_sin_desglose_edad,
    };
  }

  // Pirámide poblacional (mujeres/hombres por banda de edad), respetando
  // el filtro de municipio si se aplica.
  function getPiramide(filtros) {
    filtros = filtros || {};
    const d = raw();
    if (!d) return { bandas: [], mujeres: [], hombres: [] };
    const bandas = d.grupos_edad;
    const resumen = getResumen(filtros);
    const bandasObj = resumen.bandas || {};
    return {
      bandas,
      mujeres: bandas.map((b) => (bandasObj[b] || {}).mujeres || 0),
      hombres: bandas.map((b) => (bandasObj[b] || {}).hombres || 0),
    };
  }

  function _norm(s) {
    return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // Filtra/busca localidades. filtros: { municipio, busqueda, limit }.
  // Ya vienen ordenadas de mayor a menor población (ver build_poblacion.py).
  function buscarLocalidades(filtros) {
    filtros = filtros || {};
    const d = raw();
    if (!d) return [];
    const campos = d.localidades_campos;
    const q = _norm(filtros.busqueda);
    let rows = d.localidades;
    if (filtros.municipio) rows = rows.filter((r) => r[1] === filtros.municipio);
    if (q) rows = rows.filter((r) => _norm(r[2]).includes(q));
    if (filtros.limit) rows = rows.slice(0, filtros.limit);
    return rows.map((r) => {
      const obj = {};
      campos.forEach((c, i) => { obj[c] = r[i]; });
      return obj;
    });
  }

  function contarLocalidades(filtros) {
    filtros = filtros || {};
    const d = raw();
    if (!d) return 0;
    const q = _norm(filtros.busqueda);
    let rows = d.localidades;
    if (filtros.municipio) rows = rows.filter((r) => r[1] === filtros.municipio);
    if (q) rows = rows.filter((r) => _norm(r[2]).includes(q));
    return rows.length;
  }

  function getLocalidadMasPoblada(filtros) {
    const r = buscarLocalidades(Object.assign({}, filtros, { limit: 1 }))[0];
    return r || null;
  }

  window.SNSP_POBLACION_SERVICE = {
    getAmbito,
    getCatalogos,
    getPorMunicipio,
    getResumen,
    getPiramide,
    buscarLocalidades,
    contarLocalidades,
    getLocalidadMasPoblada,
    toRankedArray,
  };
})();
