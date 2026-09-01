/**
 * services/realDataService.js
 * -----------------------------------------------------------------------
 * CAPA DE SERVICIOS — DATOS OFICIALES 2025 (CACU / Cáncer de Mama)
 * Lee window.SNSP_REAL_DATA (generado por scripts/build_data.py a partir
 * de las 6 bases oficiales) y expone únicamente los indicadores que
 * pueden calcularse correctamente con las columnas disponibles:
 * conteos, distribuciones y porcentajes por entidad/categoría.
 *
 * NO calcula incidencia, cobertura poblacional, tasas ni tendencias
 * temporales: las bases no traen fecha, población de referencia ni
 * denominador. Cuando eso cambie (p. ej. con Supabase + un padrón
 * poblacional), este es el único archivo que debe modificarse — ningún
 * módulo ni componente visual necesita cambiar su contrato.
 *
 * Contrato público:
 *   SNSP_REAL_SERVICE.getCacuIndicadores(filtros) -> objeto de indicadores
 *   SNSP_REAL_SERVICE.getMamaIndicadores(filtros) -> objeto de indicadores
 *   SNSP_REAL_SERVICE.getEntidadesDisponibles(fuenteKey) -> string[]
 *   SNSP_REAL_SERVICE.toRankedArray(counterObj, opts) -> [{label,value,pct}]
 * -----------------------------------------------------------------------
 */
(function () {
  function raw() { return window.SNSP_REAL_DATA || null; }

  function sumValues(obj) {
    return Object.values(obj || {}).reduce((a, b) => a + b, 0);
  }

  // Convierte un {categoria: n} en arreglo ordenado desc con porcentaje,
  // listo para tablas/gráficas. opts.top limita el número de filas.
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

  // Aplica el filtro de entidad (único filtro transversal soportado por
  // estas bases) sobre una fuente con detalle por entidad de 2 dimensiones
  // (por_entidad_detalle: {entidad: {categoria: n}}).
  function filteredSimple(source, entidad) {
    if (!source) return { por_entidad: {}, por_resultado: {}, total: 0 };
    if (!entidad) {
      return { por_entidad: source.por_entidad, por_resultado: source.por_resultado, total: source.total_registros ?? source.total_casos ?? 0 };
    }
    const detalle = (source.por_entidad_detalle || {})[entidad] || {};
    return {
      por_entidad: { [entidad]: sumValues(detalle) },
      por_resultado: detalle,
      total: sumValues(detalle),
    };
  }

  // Igual, pero para fuentes con 3 dimensiones (entidad, resultado, plan),
  // como los casos confirmados.
  function filteredCasos(source, entidad) {
    if (!source) return { por_entidad: {}, por_resultado: {}, por_plan: {}, total: 0 };
    if (!entidad) {
      return {
        por_entidad: source.por_entidad,
        por_resultado: source.por_resultado_histopatologico || source.por_resultado_histopatologico_codigo,
        por_plan: source.por_plan_tratamiento,
        total: source.total_casos,
      };
    }
    const detalle = (source.por_entidad_detalle || {})[entidad] || { por_resultado: {}, por_plan: {}, total: 0 };
    return {
      por_entidad: { [entidad]: detalle.total },
      por_resultado: detalle.por_resultado,
      por_plan: detalle.por_plan,
      total: detalle.total,
    };
  }

  function getCacuIndicadores(filtros) {
    const d = raw();
    if (!d) return null;
    const entidad = filtros && filtros.entidad;
    const casos = filteredCasos(d.cacu_casos, entidad);
    const citBL = filteredSimple(d.cacu_citologia_bl, entidad);
    const cit = filteredSimple(d.cacu_citologias, entidad);
    const pcr = filteredSimple(d.cacu_pcr, entidad);
    return {
      casos_confirmados: casos,
      citologia_base_liquida: citBL,
      citologia_convencional: cit,
      pcr_vph: pcr,
      catalogo_codigos_pendiente: !!d.cacu_casos.catalogo_codigos_pendiente,
    };
  }

  function getMamaIndicadores(filtros) {
    const d = raw();
    if (!d) return null;
    const entidad = filtros && filtros.entidad;
    const casos = filteredCasos(d.cama_casos, entidad);
    const masto = filteredSimple(d.cama_mastografias, entidad);
    return {
      casos_confirmados: casos,
      mastografias: masto,
    };
  }

  // Catálogo de entidades con al menos un registro en la fuente indicada,
  // para alimentar el filtro (nunca se muestran entidades sin datos).
  function getEntidadesDisponibles(fuenteKey) {
    const d = raw();
    if (!d || !d[fuenteKey]) return [];
    return Object.keys(d[fuenteKey].por_entidad || {}).sort((a, b) => a.localeCompare(b, "es"));
  }

  // Unión de entidades disponibles entre varias fuentes de un mismo módulo
  // (p. ej. casos confirmados + mastografías): una entidad debe aparecer en
  // el filtro si tiene datos en CUALQUIERA de las fuentes del módulo, no
  // sólo en la principal, o el filtro rechazaría silenciosamente una
  // selección válida.
  function getEntidadesDisponiblesUnion(fuenteKeys) {
    const d = raw();
    if (!d) return [];
    const set = new Set();
    fuenteKeys.forEach((k) => {
      if (d[k]) Object.keys(d[k].por_entidad || {}).forEach((e) => set.add(e));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }

  window.SNSP_REAL_SERVICE = {
    getCacuIndicadores,
    getMamaIndicadores,
    getEntidadesDisponibles,
    getEntidadesDisponiblesUnion,
    toRankedArray,
  };
})();
