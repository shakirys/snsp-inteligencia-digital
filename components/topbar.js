/**
 * components/topbar.js
 * -----------------------------------------------------------------------
 * Barra superior reutilizable: título de la pantalla, fecha de
 * actualización de los datos, y el usuario en sesión con menú de perfil
 * (Mi perfil, Cambiar contraseña, Cerrar sesión). Compartida por todas
 * las pantallas internas.
 * -----------------------------------------------------------------------
 */

const SNSP_TITLE_PREFIXES = ["lic.", "ing.", "dr.", "dra.", "mtro.", "mtra.", "c.p.", "arq.", "lcda.", "lcdo."];

function SNSP_userInitials(nombre) {
  const parts = (nombre || "").split(" ").filter((p) => p && !SNSP_TITLE_PREFIXES.includes(p.toLowerCase()));
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
}

function SNSP_renderTopbar(containerId, opts) {
  opts = opts || {};
  const el = document.getElementById(containerId);
  if (!el) return;
  const user = window.SNSP_AUTH.getUser();
  const roleLabel = user && window.SNSP_AUTH.ROLES[user.role] ? window.SNSP_AUTH.ROLES[user.role].label : "";
  const initials = user ? SNSP_userInitials(user.nombre) : "?";
  const root = opts.rootPath || "";

  el.innerHTML = `
    <div>
      <h1 class="topbar__title">${opts.title || ""}</h1>
      ${opts.subtitle ? `<div class="section-header__subtitle">${opts.subtitle}</div>` : ""}
    </div>
    <div class="topbar__meta">
      ${opts.updated ? `<div class="text-muted" style="font-size:var(--fs-body-sm)">Actualizado: <strong>${opts.updated}</strong></div>` : ""}
      <div class="topbar__user" id="topbar-user-trigger" tabindex="0">
        <div class="topbar__user-avatar">${initials}</div>
        <div>
          <div style="font-size:var(--fs-body-sm); font-weight:600;">${user ? user.nombre : "Invitado"}</div>
          <div class="topbar__user-role">${user ? (user.cargo || roleLabel) : ""}${user && user.cargo ? ` · ${roleLabel}` : ""}</div>
        </div>
        <span class="topbar__user-caret">&#9662;</span>
        <div class="topbar__user-menu" id="topbar-user-menu">
          <a href="${root}pages/perfil.html">Mi perfil</a>
          <a href="${root}pages/perfil.html#cambiar-password">Cambiar contraseña</a>
          <div class="topbar__user-menu-divider"></div>
          <a href="#" id="topbar-logout-link">Cerrar sesión</a>
        </div>
      </div>
    </div>
  `;

  const trigger = document.getElementById("topbar-user-trigger");
  const menu = document.getElementById("topbar-user-menu");
  function closeMenu() { menu.classList.remove("is-open"); }
  function toggleMenu(e) {
    e.stopPropagation();
    menu.classList.toggle("is-open");
  }
  trigger.addEventListener("click", toggleMenu);
  trigger.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") toggleMenu(e); });
  document.addEventListener("click", closeMenu);
  menu.addEventListener("click", (e) => e.stopPropagation());

  const logoutLink = document.getElementById("topbar-logout-link");
  if (logoutLink) {
    logoutLink.addEventListener("click", (e) => {
      e.preventDefault();
      window.SNSP_AUTH.logout();
      window.location.href = root + "index.html";
    });
  }
}
