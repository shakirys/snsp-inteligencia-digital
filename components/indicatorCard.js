/**
 * components/indicatorCard.js
 * -----------------------------------------------------------------------
 * Tarjeta de indicador reutilizable entre módulos.
 * -----------------------------------------------------------------------
 */

function SNSP_indicatorCardHTML(opts) {
  const hasValue = opts.value !== null && opts.value !== undefined;
  const accent = opts.accent || "var(--c-vino)";
  const deltaClass = opts.deltaDirection === "up" ? "is-up" : opts.deltaDirection === "down" ? "is-down" : "";
  const deltaSymbol = opts.deltaDirection === "up" ? "&#9650;" : opts.deltaDirection === "down" ? "&#9660;" : "";
  return `
    <div class="indicator-card" style="--indicator-accent:${accent}">
      <div class="indicator-card__label">${opts.label}</div>
      <div class="indicator-card__value">${hasValue ? opts.value : `<span class="pending-data">${window.SNSP_CONFIG.dataStatusLabel}</span>`}</div>
      ${hasValue && opts.delta ? `<div class="indicator-card__delta ${deltaClass}">${deltaSymbol} ${opts.delta}</div>` : ""}
      ${opts.footnote ? `<div class="indicator-card__footnote">${opts.footnote}</div>` : ""}
    </div>
  `;
}
