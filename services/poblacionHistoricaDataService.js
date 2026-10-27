/**
 * services/poblacionHistoricaDataService.js  (ACT26 — NUEVO, aditivo)
 * -----------------------------------------------------------------------
 * CAPA DE SERVICIOS — POBLACIÓN HISTÓRICA SUIVE 2017-2026, Querétaro.
 * Lee window.SNSP_POBLACION_HISTORICA_DATA (scripts/build_poblacion_historica.py).
 *
 * Fuente independiente del padrón ASIS 2025 por localidad
 * (SNSP_POBLACION_SERVICE), que no se toca ni se mezcla con ésta.
 *
 * REGLAS:
 *  - Toda consulta de totales exige UN año de referencia (filtros.anio).
 *    No existe ninguna función que sume poblaciones de varios años; la
 *    serie 2017-2026 devuelve un valor independiente por año.
 *  - Se agregan los valores originales (con decimales) y se redondea sólo
 *    al presentar (SNSP_formatNumber / Math.round en la vista).
 *  - Filtro geográfico: municipio (cve) > jurisdicción (js) > estado.
 *
 * Contrato público (window.SNSP_POBLACION_HISTORICA_SERVICE):
 *   getMeta(), getCatalogos(), getAnios(), getAnioMasReciente()
 *   getMunicipios(js?) -> [{cve,nombre,js,...}]
 *   getResumen({anio,js,cve}) -> {anio,total,mujeres,hombres,pctMujeres,pctHombres,
 *                                  totalAnterior,crecimientoPct,crecimientoAbs,comparable}
 *   getPiramide({anio,js,cve}) -> {grupos:[{etiqueta,fuente,amplitud}],hombres:[],mujeres:[],total}
 *   getSerie({js,cve}) -> [{anio,total,mujeres,hombres}]   (un valor por año)
 *   getPorMunicipio({anio,js}) -> [{cve,nombre,js,total,mujeres,hombres}]
 *   getPorJurisdiccion({anio}) -> [{js,nombre,total,mujeres,hombres,municipios}]
 *   describirLugar({js,cve}) -> texto
 *   getComparativo({js,cve,anios:[...]}) -> [{anio,total,mujeres,hombres,referencia}]
 *       (ACT26b) Una fila por año seleccionado, cada una con la población de
 *       SU año (nunca se suman años). "referencia" compara contra el año
 *       seleccionado inmediatamente anterior: {anio, aniosEntre, consecutivo,
 *       difTotal, varTotal, difMujeres, varMujeres, difHombres, varHombres};
 *       null en el primer año seleccionado.
 *   getEstructura({anio,js,cve}) -> {total,pctMujeres,pctHombres,pob65,pct65,pob0a14,pct0a14,pob15a64,pct15a64}
 *       (ACT26c) 65 y más = grupo "De 65 y más años" de la fuente (exacto).
 *   getTablaEdad({anio,js,cve}) -> {filas:[{grupo,amplitud,total,pctDelTotal,hombres,pctHombresDelGrupo,mujeres,pctMujeresDelGrupo}],...}
 *       (ACT26c.1) denominadores explícitos; también getEstructura incluye
 *       indiceDependencia e indiceEnvejecimiento.
 *   getRanking({anio,js,cve,tipo:"top"|"bottom",n:5}) -> {items,universo,ambito,nota,posicion}
 *       (ACT26c) Universo: estado -> 18 municipios; jurisdicción -> sus
 *       municipios; municipio -> los municipios de SU jurisdicción (el
 *       seleccionado se resalta) + su posición en la jurisdicción y el estado.
 * -----------------------------------------------------------------------
 */
(function () {
  let _cube = null; // _cube[anioIdx][munIdx][sexo][grupo] = valor original

  function raw() { return window.SNSP_POBLACION_HISTORICA_DATA || null; }

  function cube() {
    if (_cube) return _cube;
    const d = raw();
    if (!d) return null;
    const nA = d.catalogos.anios.length, nM = d.catalogos.municipios.length, nG = d.catalogos.grupos_edad.length;
    _cube = [];
    for (let a = 0; a < nA; a++) {
      _cube.push([]);
      for (let m = 0; m < nM; m++) _cube[a].push([new Array(nG).fill(0), new Array(nG).fill(0)]);
    }
    d.registros.forEach((r) => { _cube[r[0]][r[1]][r[2]][r[3]] += r[4]; });
    return _cube;
  }

  function getMeta() { const d = raw(); return d ? d.meta : null; }
  function getCatalogos() { const d = raw(); return d ? d.catalogos : null; }
  function getAnios() { const d = raw(); return d ? d.catalogos.anios.slice() : []; }
  function getAnioMasReciente() { const a = getAnios(); return a.length ? a[a.length - 1] : null; }

  function getMunicipios(js) {
    const c = getCatalogos();
    if (!c) return [];
    return js ? c.municipios.filter((m) => m.js === Number(js)) : c.municipios.slice();
  }

  function _anioIdx(anio) {
    if (anio === undefined || anio === null || anio === "") {
      throw new Error("SNSP_POBLACION_HISTORICA_SERVICE: se requiere un año de referencia (no se suman años).");
    }
    const i = getAnios().indexOf(Number(anio));
    if (i < 0) throw new Error(`Año fuera de rango: ${anio}`);
    return i;
  }

  // Índices de municipio que cumplen el filtro geográfico.
  function _munIdxs(filtros) {
    const c = getCatalogos();
    const out = [];
    c.municipios.forEach((m, i) => {
      if (filtros.cve) { if (m.cve === filtros.cve) out.push(i); }
      else if (filtros.js) { if (m.js === Number(filtros.js)) out.push(i); }
      else out.push(i);
    });
    return out;
  }

  function _sumar(anioIdx, munIdxs) {
    const cb = cube();
    const nG = getCatalogos().grupos_edad.length;
    const h = new Array(nG).fill(0), mu = new Array(nG).fill(0);
    munIdxs.forEach((mi) => {
      const cel = cb[anioIdx][mi];
      for (let g = 0; g < nG; g++) { h[g] += cel[0][g]; mu[g] += cel[1][g]; }
    });
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    return { hombresPorGrupo: h, mujeresPorGrupo: mu, hombres: sum(h), mujeres: sum(mu) };
  }

  function getResumen(filtros) {
    filtros = filtros || {};
    const ai = _anioIdx(filtros.anio);
    const idx = _munIdxs(filtros);
    const s = _sumar(ai, idx);
    const total = s.hombres + s.mujeres;
    let totalAnterior = null, crecimientoPct = null, crecimientoAbs = null;
    if (ai > 0) {
      const p = _sumar(ai - 1, idx);
      totalAnterior = p.hombres + p.mujeres;
      crecimientoAbs = total - totalAnterior;
      crecimientoPct = totalAnterior ? (crecimientoAbs / totalAnterior) * 100 : null;
    }
    return {
      anio: Number(filtros.anio),
      total, mujeres: s.mujeres, hombres: s.hombres,
      pctMujeres: total ? (s.mujeres / total) * 100 : 0,
      pctHombres: total ? (s.hombres / total) * 100 : 0,
      razonHM: s.mujeres ? (s.hombres / s.mujeres) * 100 : null,
      totalAnterior, crecimientoAbs, crecimientoPct,
      comparable: ai > 0,
      anioAnterior: ai > 0 ? getAnios()[ai - 1] : null,
    };
  }

  function getPiramide(filtros) {
    filtros = filtros || {};
    const ai = _anioIdx(filtros.anio);
    const s = _sumar(ai, _munIdxs(filtros));
    return {
      grupos: getCatalogos().grupos_edad.map((g) => Object.assign({}, g)),
      hombres: s.hombresPorGrupo,
      mujeres: s.mujeresPorGrupo,
      totalHombres: s.hombres,
      totalMujeres: s.mujeres,
      total: s.hombres + s.mujeres,
    };
  }

  // Serie anual: un valor INDEPENDIENTE por año (nunca acumulado).
  function getSerie(filtros) {
    filtros = filtros || {};
    const idx = _munIdxs(filtros);
    return getAnios().map((anio, ai) => {
      const s = _sumar(ai, idx);
      return { anio, total: s.hombres + s.mujeres, mujeres: s.mujeres, hombres: s.hombres };
    });
  }

  function getPorMunicipio(filtros) {
    filtros = filtros || {};
    const ai = _anioIdx(filtros.anio);
    const c = getCatalogos();
    return c.municipios
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => !filtros.js || m.js === Number(filtros.js))
      .map(({ m, i }) => {
        const s = _sumar(ai, [i]);
        return { cve: m.cve, cvegeo: m.cvegeo, nombre: m.nombre, js: m.js, total: s.hombres + s.mujeres, mujeres: s.mujeres, hombres: s.hombres };
      })
      .sort((a, b) => b.total - a.total);
  }

  function getPorJurisdiccion(filtros) {
    filtros = filtros || {};
    const ai = _anioIdx(filtros.anio);
    const c = getCatalogos();
    return c.jurisdicciones.map((j) => {
      const s = _sumar(ai, _munIdxs({ js: j.id }));
      return { js: j.id, nombre: j.nombre, etiqueta: j.etiqueta, total: s.hombres + s.mujeres, mujeres: s.mujeres, hombres: s.hombres, municipios: getMunicipios(j.id).length };
    });
  }

  function describirLugar(filtros) {
    filtros = filtros || {};
    const c = getCatalogos();
    if (filtros.cve) {
      const m = c.municipios.find((x) => x.cve === filtros.cve);
      return m ? m.nombre : "municipio";
    }
    if (filtros.js) {
      const j = c.jurisdicciones.find((x) => x.id === Number(filtros.js));
      return j ? `Jurisdicción Sanitaria ${j.id} ${j.nombre}` : "jurisdicción";
    }
    return "Estado de Querétaro";
  }

  function getComparativo(filtros) {
    filtros = filtros || {};
    const validos = getAnios();
    const anios = Array.from(new Set((filtros.anios || []).map(Number)))
      .filter((a) => validos.indexOf(a) >= 0)
      .sort((a, b) => a - b);
    const idx = _munIdxs(filtros);
    const filas = anios.map((anio) => {
      const s = _sumar(_anioIdx(anio), idx);
      return { anio, total: s.hombres + s.mujeres, mujeres: s.mujeres, hombres: s.hombres, referencia: null };
    });
    const dif = (a, b) => a - b;
    const vr = (a, b) => (b ? ((a - b) / b) * 100 : null);
    for (let i = 1; i < filas.length; i++) {
      const c = filas[i], p = filas[i - 1];
      c.referencia = {
        anio: p.anio, aniosEntre: c.anio - p.anio, consecutivo: c.anio - p.anio === 1,
        difTotal: dif(c.total, p.total), varTotal: vr(c.total, p.total),
        difMujeres: dif(c.mujeres, p.mujeres), varMujeres: vr(c.mujeres, p.mujeres),
        difHombres: dif(c.hombres, p.hombres), varHombres: vr(c.hombres, p.hombres),
      };
    }
    return filas;
  }

  function getEstructura(filtros) {
    filtros = filtros || {};
    const p = getPiramide(filtros);
    const cat = getCatalogos().grupos_edad;
    const i65 = cat.findIndex((g) => g.fuente === "De 65 y más años");
    const iDe = (txt) => cat.findIndex((g) => g.fuente === txt);
    const sumIdx = (ids) => ids.reduce((a, i) => a + p.hombres[i] + p.mujeres[i], 0);
    const i0a14 = ["De 00 años", "De 01 a 04 años", "De 05 a 09 años", "De 10 a 14 años"].map(iDe);
    const i15a64 = ["De 15 a 19 años", "De 20 a 24 años", "De 25 a 44 años", "De 45 a 49 años", "De 50 a 59 años", "De 60 a 64 años"].map(iDe);
    const T = p.total;
    const pob65 = sumIdx([i65]), pob0a14 = sumIdx(i0a14), pob15a64 = sumIdx(i15a64);
    const pct = (v) => (T ? (v / T) * 100 : 0);
    return {
      anio: Number(filtros.anio), total: T, mujeres: p.totalMujeres, hombres: p.totalHombres,
      pctMujeres: pct(p.totalMujeres), pctHombres: pct(p.totalHombres),
      pob65, pct65: pct(pob65), pob65Mujeres: p.mujeres[i65], pob65Hombres: p.hombres[i65],
      pob0a14, pct0a14: pct(pob0a14), pob15a64, pct15a64: pct(pob15a64),
      // ACT26c.1 — índices calculados con las mismas sumas exactas de intervalos:
      // dependencia = (0–14 + 65 y más) / 15–64 × 100 ; envejecimiento = 65 y más / 0–14 × 100
      indiceDependencia: pob15a64 ? ((pob0a14 + pob65) / pob15a64) * 100 : null,
      indiceEnvejecimiento: pob0a14 ? (pob65 / pob0a14) * 100 : null,
    };
  }

  function getRanking(filtros) {
    filtros = filtros || {};
    const n = filtros.n || 5;
    const tipo = filtros.tipo === "bottom" ? "bottom" : "top";
    const cat = getCatalogos();
    let jsUniverso = filtros.js ? Number(filtros.js) : null;
    if (filtros.cve) {
      const m = cat.municipios.find((x) => x.cve === filtros.cve);
      jsUniverso = m ? m.js : jsUniverso;
    }
    const estado = getPorMunicipio({ anio: filtros.anio }); // desc
    estado.forEach((m, i) => { m.posicionEstado = i + 1; });
    const universo = jsUniverso ? estado.filter((m) => m.js === jsUniverso) : estado.slice();
    universo.forEach((m, i) => { m.posicion = i + 1; });
    const ordenados = tipo === "top" ? universo.slice() : universo.slice().reverse();
    const items = ordenados.slice(0, n);
    const totUniverso = universo.reduce((a, m) => a + m.total, 0);
    items.forEach((m) => { m.pctUniverso = totUniverso ? (m.total / totUniverso) * 100 : 0; });
    const ambito = jsUniverso ? describirLugar({ js: jsUniverso }) : "Estado de Querétaro";
    let nota = "";
    if (universo.length <= n) nota = `${ambito} tiene ${universo.length} municipios: se muestran todos.`;
    let posicion = null;
    if (filtros.cve) {
      const m = estado.find((x) => x.cve === filtros.cve);
      if (m) posicion = { cve: m.cve, nombre: m.nombre, total: m.total, enJurisdiccion: m.posicion, deJurisdiccion: universo.length, enEstado: m.posicionEstado, deEstado: estado.length };
    }
    return { tipo, n, items, universo: universo.length, ambito, jsUniverso, nota, posicion, totalUniverso: totUniverso };
  }

  // ACT26c.1 — Tabla de los 11 grupos con denominadores explícitos:
  //   pctDelTotal = población del grupo / población total del área y año
  //   pctHombresDelGrupo, pctMujeresDelGrupo = sexo / población del grupo (suman 100)
  function getTablaEdad(filtros) {
    const p = getPiramide(filtros || {});
    const T = p.total;
    const filas = p.grupos.map((g, i) => {
      const h = p.hombres[i], m = p.mujeres[i], tg = h + m;
      return {
        grupo: g.etiqueta, fuente: g.fuente, amplitud: g.amplitud,
        total: tg, pctDelTotal: T ? (tg / T) * 100 : 0,
        hombres: h, pctHombresDelGrupo: tg ? (h / tg) * 100 : 0,
        mujeres: m, pctMujeresDelGrupo: tg ? (m / tg) * 100 : 0,
      };
    });
    return {
      filas, total: T, hombres: p.totalHombres, mujeres: p.totalMujeres,
      pctHombres: T ? (p.totalHombres / T) * 100 : 0, pctMujeres: T ? (p.totalMujeres / T) * 100 : 0,
    };
  }

  window.SNSP_POBLACION_HISTORICA_SERVICE = {
    getTablaEdad,
    getEstructura, getRanking,
    getComparativo,
    getMeta, getCatalogos, getAnios, getAnioMasReciente, getMunicipios,
    getResumen, getPiramide, getSerie, getPorMunicipio, getPorJurisdiccion, describirLugar,
  };
})();
