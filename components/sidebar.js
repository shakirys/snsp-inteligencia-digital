/**
 * components/sidebar.js
 * -----------------------------------------------------------------------
 * Componente de menú lateral reutilizable. Se construye a partir de
 * config/config.js (lista de módulos) y auth/auth.js (usuario/rol), por
 * lo que CACU, Mama y cualquier módulo futuro comparten exactamente el
 * mismo componente sin duplicar HTML.
 * -----------------------------------------------------------------------
 */

function SNSP_renderSidebar(containerId, activeModuleId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const cfg = window.SNSP_CONFIG;
  const user = window.SNSP_AUTH.getUser();

  const icons = {
    dashboard: "&#9673;",
    cacu: "&#9901;",
    mama: "&#10052;",
    dengue: "&#128027;",
    morbilidad: "&#128200;",
    poblacion: "&#128101;",
    mortalidad: "&#128683;",
    vacunacion: "&#128137;",
    salud_mental: "&#129504;",
    cronicas: "&#10084;",
    admin: "&#9881;",
  };

  const isRoot = window.location.pathname.includes("/pages/");
  const prefix = isRoot ? "" : "pages/";
  const upPrefix = isRoot ? "../" : "";

  let moduleLinks = cfg.modules.map((m) => {
    const isActive = m.id === activeModuleId;
    const disabled = !m.enabled;
    const href = disabled ? "#" : (isRoot ? m.id + ".html" : prefix + m.id + ".html");
    return `<a class="sidebar__link ${isActive ? "is-active" : ""} ${disabled ? "is-disabled" : ""}"
                href="${href}" ${disabled ? 'title="Próximamente" onclick="return false;"' : ""}>
              <span class="sidebar__link-icon">${icons[m.id] || "&#8226;"}</span>
              <span class="sidebar__link-label">${m.label}${disabled ? " · próx." : ""}</span>
            </a>`;
  }).join("");

  const adminHref = isRoot ? "configuracion.html" : "pages/configuracion.html";
  const dashHref = isRoot ? "../dashboard.html" : "dashboard.html";
  const cargaHref = isRoot ? "carga.html" : "pages/carga.html";
  const canAdmin = window.SNSP_AUTH.can("administrar_usuarios");
  const canCargar = window.SNSP_AUTH.can("cargar_informacion");
  const configActive = ["config", "admin", "roles", "acerca"].includes(activeModuleId);

  el.innerHTML = `
    <div class="sidebar__brand">
      <div class="sidebar__brand-mark">S</div>
      <div class="sidebar__brand-text">
        <div class="sidebar__brand-name">${cfg.platform.shortName}</div>
        <div class="sidebar__brand-slogan">${cfg.platform.slogan}</div>
      </div>
    </div>

    <div class="sidebar__section-label">General</div>
    <nav class="sidebar__nav">
      <a class="sidebar__link ${activeModuleId === "dashboard" ? "is-active" : ""}" href="${dashHref}">
        <span class="sidebar__link-icon">${icons.dashboard}</span>
        <span class="sidebar__link-label">Dashboard principal</span>
      </a>
    </nav>

    <div class="sidebar__section-label">Módulos epidemiológicos</div>
    <nav class="sidebar__nav">
      ${moduleLinks}
    </nav>

    ${canCargar ? `
    <div class="sidebar__section-label">Herramientas</div>
    <nav class="sidebar__nav">
      <a class="sidebar__link ${activeModuleId === "carga" ? "is-active" : ""}" href="${cargaHref}">
        <span class="sidebar__link-icon">&#8593;</span>
        <span class="sidebar__link-label">Cargar datos · prototipo</span>
      </a>
    </nav>` : ""}

    ${canAdmin ? `
    <div class="sidebar__section-label">Administración</div>
    <nav class="sidebar__nav">
      <a class="sidebar__link ${configActive ? "is-active" : ""}" href="${adminHref}">
        <span class="sidebar__link-icon">${icons.admin}</span>
        <span class="sidebar__link-label">Configuración</span>
      </a>
    </nav>` : ""}

    <div class="sidebar__footer">
      v${cfg.platform.version} · ${cfg.platform.environment}<br>
      ${user ? window.SNSP_AUTH.ROLES[user.role].label : ""}
    </div>
  `;
}
