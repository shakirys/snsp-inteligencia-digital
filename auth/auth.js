/**
 * auth/auth.js
 * -----------------------------------------------------------------------
 * AUTENTICACIÓN, USUARIOS, ROLES Y PERMISOS — SIMULADO (v2.0.0)
 * Esta capa está completamente separada de las pantallas y de los
 * módulos de datos (CACU, Mama, etc). Ninguna pantalla contiene
 * usuarios, contraseñas ni reglas de permisos "hardcodeadas": todo pasa
 * por las funciones de este archivo.
 *
 * En producción, este archivo se reemplaza por una integración real con
 * Supabase Auth + una tabla `usuarios` (ver docs/administracion_usuarios.md),
 * conservando exactamente la misma API pública (SNSP_AUTH.login, .can,
 * .listUsers, .createUser, .updateUser, .setUserPassword, .setUserStatus,
 * .softDeleteUser...) para que ninguna pantalla tenga que cambiar — sólo
 * el origen de los datos dentro de este archivo.
 *
 * Los usuarios se guardan en sessionStorage (se reinician al cerrar el
 * navegador o abrir una pestaña nueva) porque no hay backend real todavía;
 * esto permite probar alta/edición/baja de usuarios de forma realista
 * dentro de una sesión de prueba.
 * -----------------------------------------------------------------------
 */

(function () {
  // ---- Catálogo de permisos atómicos ----
  const PERMISSIONS = [
    "visualizar",
    "descargar",
    "editar",
    "cargar_informacion",
    "administrar_usuarios",
    "configurar_modulos",
    "eliminar_informacion",
  ];

  // ---- Catálogo de roles. Preparado para crecer sin rediseñar el módulo:
  // agregar un rol nuevo sólo requiere una entrada aquí. ----
  const ROLES = {
    administrador: {
      label: "Administrador",
      descripcion: "Acceso completo a módulos, datos, usuarios y configuración.",
      permissions: [...PERMISSIONS],
    },
    supervisor: {
      label: "Supervisor",
      descripcion: "Supervisión operativa: visualiza, descarga, edita y administra usuarios.",
      permissions: ["visualizar", "descargar", "editar", "cargar_informacion", "administrar_usuarios"],
    },
    analista: {
      label: "Analista",
      descripcion: "Análisis de indicadores: visualiza, descarga y edita.",
      permissions: ["visualizar", "descargar", "editar"],
    },
    capturista: {
      label: "Capturista",
      descripcion: "Captura de información: visualiza y carga datos.",
      permissions: ["visualizar", "cargar_informacion"],
    },
    consulta: {
      label: "Consulta",
      descripcion: "Sólo lectura: visualiza y descarga.",
      permissions: ["visualizar", "descargar"],
    },
  };

  // ---- Usuarios iniciales del sistema ----
  // Contraseña de prueba para ambos, mientras no se conecte Supabase Auth:
  const DEFAULT_PASSWORD = "SNSP2025";
  const DEFAULT_USERS = [
    {
      id: "u1",
      nombre: "Lic. Osvaldo Bobadilla Mino",
      cargo: "Líder de Inteligencia e Información",
      email: "osvaldo.bobadilla@snsp.qro.gob.mx",
      role: "administrador",
      status: "activo", // activo | inactivo | eliminado
      password: DEFAULT_PASSWORD,
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      lastAccess: null,
      deletedAt: null,
    },
    {
      id: "u2",
      nombre: "Ing. Soraya Lizbeth Sánchez Torres",
      cargo: "Enlace de Análisis y Estadística",
      email: "soraya.sanchez@snsp.qro.gob.mx",
      role: "administrador",
      status: "activo",
      password: DEFAULT_PASSWORD,
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      lastAccess: null,
      deletedAt: null,
    },
  ];

  const SESSION_KEY = "snsp_session_demo";
  const USERS_KEY = "snsp_usuarios_v2";
  const SEQ_KEY = "snsp_usuarios_seq";

  // ---- Almacén de usuarios (sessionStorage; sustituible por Supabase) ----
  function loadUsers() {
    try {
      const raw = sessionStorage.getItem(USERS_KEY);
      if (!raw) { seedUsers(); return loadUsers(); }
      return JSON.parse(raw);
    } catch (e) {
      seedUsers();
      return JSON.parse(sessionStorage.getItem(USERS_KEY));
    }
  }

  function seedUsers() {
    sessionStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
    sessionStorage.setItem(SEQ_KEY, String(DEFAULT_USERS.length));
  }

  function saveUsers(users) {
    sessionStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function nextId() {
    const n = parseInt(sessionStorage.getItem(SEQ_KEY) || "0", 10) + 1;
    sessionStorage.setItem(SEQ_KEY, String(n));
    return "u" + n;
  }

  function nowIso() { return new Date().toISOString(); }

  // ---- Bitácora (sin cambios de comportamiento) ----
  function getBitacora() {
    try { return JSON.parse(sessionStorage.getItem("snsp_bitacora") || "[]"); }
    catch (e) { return []; }
  }

  function logAction(action, detail) {
    const entries = getBitacora();
    const user = getUser();
    entries.unshift({
      ts: nowIso(),
      user: user ? user.email : "anónimo",
      action,
      detail: detail || "",
    });
    sessionStorage.setItem("snsp_bitacora", JSON.stringify(entries.slice(0, 200)));
  }

  // ---- Sesión ----
  function login(identifier, password) {
    const users = loadUsers();
    const idNorm = (identifier || "").trim().toLowerCase();
    const user = users.find((u) => u.id === identifier || u.email.toLowerCase() === idNorm);
    if (!user) return { ok: false, error: "No existe un usuario con ese correo." };
    if (user.status === "eliminado") return { ok: false, error: "Este usuario ya no existe en el sistema." };
    if (user.status === "inactivo") return { ok: false, error: "Este usuario está desactivado. Contacta a un administrador." };
    if (typeof password === "string" && password.length && password !== user.password) {
      return { ok: false, error: "Contraseña incorrecta." };
    }
    const session = { userId: user.id, startedAt: nowIso() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    user.lastAccess = nowIso();
    saveUsers(users);
    logAction("inicio_sesion", `Rol: ${ROLES[user.role] ? ROLES[user.role].label : user.role}`);
    return { ok: true, user };
  }

  function logout() {
    logAction("cierre_sesion");
    sessionStorage.removeItem(SESSION_KEY);
  }

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
    catch (e) { return null; }
  }

  function getUser() {
    const session = getSession();
    if (!session) return null;
    return loadUsers().find((u) => u.id === session.userId) || null;
  }

  function isAuthenticated() {
    return !!getUser();
  }

  function can(permission) {
    const user = getUser();
    if (!user) return false;
    const role = ROLES[user.role];
    return role ? role.permissions.includes(permission) : false;
  }

  function requireAuth(redirectTo) {
    if (!isAuthenticated()) {
      window.location.href = redirectTo || "../index.html";
    }
  }

  // ---- Administración de usuarios (CRUD) ----
  // Contrato preparado para migrar a Supabase: sólo cambiaría la
  // implementación interna de estas funciones, no su firma ni su uso.

  function listUsers(filtros) {
    filtros = filtros || {};
    let users = loadUsers();
    if (!filtros.includeDeleted) users = users.filter((u) => u.status !== "eliminado");
    if (filtros.nombre) {
      const q = filtros.nombre.trim().toLowerCase();
      users = users.filter((u) => u.nombre.toLowerCase().includes(q));
    }
    if (filtros.email) {
      const q = filtros.email.trim().toLowerCase();
      users = users.filter((u) => u.email.toLowerCase().includes(q));
    }
    if (filtros.role) users = users.filter((u) => u.role === filtros.role);
    if (filtros.status) users = users.filter((u) => u.status === filtros.status);
    return users.map((u) => ({ ...u })); // copia defensiva
  }

  function getUserById(id) {
    return loadUsers().find((u) => u.id === id) || null;
  }

  function emailInUse(email, excludeId) {
    const q = email.trim().toLowerCase();
    return loadUsers().some((u) => u.id !== excludeId && u.status !== "eliminado" && u.email.toLowerCase() === q);
  }

  function createUser(data) {
    if (!data || !data.nombre || !data.email || !data.role) {
      return { ok: false, error: "Nombre, correo y rol son obligatorios." };
    }
    if (!ROLES[data.role]) return { ok: false, error: "Rol no reconocido." };
    if (emailInUse(data.email)) return { ok: false, error: "Ya existe un usuario activo con ese correo." };

    const users = loadUsers();
    const user = {
      id: nextId(),
      nombre: data.nombre.trim(),
      cargo: (data.cargo || "").trim(),
      email: data.email.trim().toLowerCase(),
      role: data.role,
      status: "activo",
      password: data.password && data.password.length ? data.password : DEFAULT_PASSWORD,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastAccess: null,
      deletedAt: null,
    };
    users.push(user);
    saveUsers(users);
    logAction("alta_usuario", `Usuario creado: ${user.email}`);
    return { ok: true, user: { ...user } };
  }

  function updateUser(id, data) {
    const users = loadUsers();
    const user = users.find((u) => u.id === id);
    if (!user) return { ok: false, error: "Usuario no encontrado." };
    if (data.email && emailInUse(data.email, id)) return { ok: false, error: "Ya existe otro usuario activo con ese correo." };
    if (data.role && !ROLES[data.role]) return { ok: false, error: "Rol no reconocido." };

    if (data.nombre !== undefined) user.nombre = data.nombre.trim();
    if (data.cargo !== undefined) user.cargo = data.cargo.trim();
    if (data.email !== undefined) user.email = data.email.trim().toLowerCase();
    if (data.role !== undefined) user.role = data.role;
    user.updatedAt = nowIso();
    saveUsers(users);
    logAction("edicion_usuario", `Usuario editado: ${user.email}`);
    return { ok: true, user: { ...user } };
  }

  function verifyPassword(id, password) {
    const user = getUserById(id);
    if (!user) return false;
    return user.password === password;
  }

  function setUserPassword(id, newPassword) {
    if (!newPassword || newPassword.length < 4) {
      return { ok: false, error: "La contraseña debe tener al menos 4 caracteres." };
    }
    const users = loadUsers();
    const user = users.find((u) => u.id === id);
    if (!user) return { ok: false, error: "Usuario no encontrado." };
    user.password = newPassword;
    user.updatedAt = nowIso();
    saveUsers(users);
    logAction("cambio_password", `Contraseña actualizada: ${user.email}`);
    return { ok: true };
  }

  function setUserStatus(id, status) {
    if (!["activo", "inactivo"].includes(status)) return { ok: false, error: "Estado no válido." };
    const users = loadUsers();
    const user = users.find((u) => u.id === id);
    if (!user) return { ok: false, error: "Usuario no encontrado." };
    user.status = status;
    user.updatedAt = nowIso();
    saveUsers(users);
    logAction(status === "activo" ? "activar_usuario" : "desactivar_usuario", user.email);
    return { ok: true, user: { ...user } };
  }

  function softDeleteUser(id) {
    const users = loadUsers();
    const user = users.find((u) => u.id === id);
    if (!user) return { ok: false, error: "Usuario no encontrado." };
    user.status = "eliminado";
    user.deletedAt = nowIso();
    user.updatedAt = nowIso();
    saveUsers(users);
    logAction("eliminacion_usuario", `Eliminación lógica: ${user.email}`);
    return { ok: true };
  }

  function restoreUser(id) {
    const users = loadUsers();
    const user = users.find((u) => u.id === id);
    if (!user) return { ok: false, error: "Usuario no encontrado." };
    user.status = "activo";
    user.deletedAt = null;
    user.updatedAt = nowIso();
    saveUsers(users);
    logAction("restauracion_usuario", user.email);
    return { ok: true };
  }

  window.SNSP_AUTH = {
    PERMISSIONS,
    ROLES,
    login,
    logout,
    getUser,
    getSession,
    isAuthenticated,
    can,
    requireAuth,
    logAction,
    getBitacora,
    // administración de usuarios
    listUsers,
    getUserById,
    createUser,
    updateUser,
    setUserPassword,
    verifyPassword,
    setUserStatus,
    softDeleteUser,
    restoreUser,
  };
})();
