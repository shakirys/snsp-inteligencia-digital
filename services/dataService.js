/**
 * services/dataService.js
 * -----------------------------------------------------------------------
 * CAPA DE SERVICIOS DE DATOS
 * Ningún módulo (CACU, Mama, ...) debe leer window.SNSP_DATA_* de forma
 * directa dentro de su lógica de presentación: siempre pasa por aquí.
 * Esto permite sustituir el origen de datos (Excel/CSV/JSON demostrativo
 * -> Supabase/API) sin tocar los módulos ni las pantallas.
 *
 * Contrato público:
 *   SNSP_DATA_SERVICE.getModuleData(moduleId) -> { detalle, por_grupo_edad }
 *   SNSP_DATA_SERVICE.applyFilters(rows, filters) -> rows filtrados
 *   SNSP_DATA_SERVICE.aggregateByYear(rows, field) -> [{anio, value}]
 *   SNSP_DATA_SERVICE.aggregateByMunicipio(rows, field) -> [{municipio, value}]
 *   SNSP_DATA_SERVICE.rankMunicipios(rows, field, dir) -> [...]
 * -----------------------------------------------------------------------
 */

(function () {
  const SOURCES = {
    cacu: () => window.SNSP_DATA_CACU || null,
    mama: () => window.SNSP_DATA_MAMA || null,
  };

  function getModuleData(moduleId) {
    const getter = SOURCES[moduleId];
    const data = getter ? getter() : null;
    if (!data) {
      // No hay fuente conectada todavía para este módulo.
      return { detalle: [], por_grupo_edad: [], sinDatos: true };
    }
    return data;
  }

  function applyFilters(rows, filters) {
    filters = filters || {};
    return rows.filter((r) => {
      if (filters.anio && String(r.anio) !== String(filters.anio)) return false;
      if (filters.jurisdiccion && r.jurisdiccion !== filters.jurisdiccion) return false;
      if (filters.municipio && r.municipio !== filters.municipio) return false;
      if (filters.institucion && r.institucion !== filters.institucion) return false;
      return true;
    });
  }

  function aggregateByYear(rows, field) {
    const map = {};
    rows.forEach((r) => {
      map[r.anio] = map[r.anio] || { sum: 0, n: 0 };
      map[r.anio].sum += r[field] || 0;
      map[r.anio].n += 1;
    });
    return Object.keys(map).sort().map((anio) => ({
      anio: Number(anio),
      value: map[anio].n ? Math.round((map[anio].sum / map[anio].n) * 100) / 100 : 0,
    }));
  }

  function aggregateByMunicipio(rows, field) {
    const map = {};
    rows.forEach((r) => {
      map[r.municipio] = map[r.municipio] || { sum: 0, n: 0, casos: 0 };
      map[r.municipio].sum += r[field] || 0;
      map[r.municipio].n += 1;
      map[r.municipio].casos += r.casos || 0;
    });
    return Object.keys(map).map((municipio) => ({
      municipio,
      value: map[municipio].n ? Math.round((map[municipio].sum / map[municipio].n) * 100) / 100 : 0,
      casos: map[municipio].casos,
    }));
  }

  function rankMunicipios(rows, field, dir) {
    dir = dir || "desc";
    const agg = aggregateByMunicipio(rows, field);
    agg.sort((a, b) => (dir === "desc" ? b.value - a.value : a.value - b.value));
    return agg;
  }

  window.SNSP_DATA_SERVICE = {
    getModuleData,
    applyFilters,
    aggregateByYear,
    aggregateByMunicipio,
    rankMunicipios,
  };
})();
