# Administración de usuarios — v2.0.0

Documento nuevo (no reemplaza ni modifica `docs/informe_calidad.md`,
`docs/diccionario_de_datos.md`, `docs/esquema_supabase.md` ni
`docs/indicadores.md`, que describen exclusivamente el procesamiento de las
6 bases de CACU/Mama y no cambiaron en esta versión).

## 1. Usuarios iniciales

| Nombre | Cargo | Correo | Rol |
|---|---|---|---|
| Lic. Osvaldo Bobadilla Mino | Líder de Inteligencia e Información | osvaldo.bobadilla@snsp.qro.gob.mx | Administrador |
| Ing. Soraya Lizbeth Sánchez Torres | Enlace de Análisis y Estadística | soraya.sanchez@snsp.qro.gob.mx | Administrador |

Contraseña de prueba para ambos: `SNSP2025`. Se guardan en `sessionStorage`
(se reinician al cerrar el navegador); no hay backend real todavía.

## 2. Catálogo de roles y permisos

| Rol | visualizar | descargar | editar | cargar_informacion | administrar_usuarios | configurar_modulos | eliminar_informacion |
|---|---|---|---|---|---|---|---|
| Administrador | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Supervisor | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| Analista | ✓ | ✓ | ✓ | — | — | — | — |
| Capturista | ✓ | — | — | ✓ | — | — | — |
| Consulta | ✓ | ✓ | — | — | — | — | — |

Agregar un rol nuevo: una entrada más en `auth/auth.js` → `ROLES`. No
requiere tocar ninguna pantalla — `pages/roles.html` y los selects de rol se
generan dinámicamente desde ese catálogo.

## 3. Contrato de `auth/auth.js` (para la futura migración a Supabase)

Estas funciones son la única superficie que las pantallas usan. Al migrar a
Supabase, sólo cambia su implementación interna:

```
login(identificador, password) -> { ok, error?, user? }
logout()
getUser() / getSession() / isAuthenticated()
can(permiso) -> boolean
requireAuth(redirectTo)

listUsers(filtros?) -> usuario[]        // filtros: nombre, email, role, status, includeDeleted
getUserById(id) -> usuario | null
createUser({nombre, cargo, email, role, password?}) -> {ok, error?, user?}
updateUser(id, {nombre?, cargo?, email?, role?}) -> {ok, error?, user?}
setUserPassword(id, nuevaPassword) -> {ok, error?}
verifyPassword(id, password) -> boolean
setUserStatus(id, 'activo'|'inactivo') -> {ok, error?, user?}
softDeleteUser(id) -> {ok, error?}       // eliminación lógica, status='eliminado'
restoreUser(id) -> {ok, error?}
```

Campos de cada usuario: `id, nombre, cargo, email, role, status, password,
createdAt, updatedAt, lastAccess, deletedAt`.

## 4. Verificación realizada (jsdom, sin acceso a Chrome real en este sandbox)

Igual que en la versión anterior, se verificó con `jsdom` + servidor local en
vez de un navegador real (red del sandbox bloqueada hacia CDNs). Se probó
explícitamente, con resultado correcto en todos los casos:

- Login con las 2 cuentas reales, contraseña correcta e incorrecta.
- Alta de usuario, detección de correo duplicado, edición, cambio de
  contraseña, desactivar (y verificar que el login queda bloqueado),
  eliminación lógica (desaparece del listado normal, sigue visible con
  "Mostrar eliminados"), restaurar, búsqueda por nombre.
- Control de acceso por rol: un usuario con rol Capturista NO puede entrar a
  Usuarios/Configuración (se le muestra "Acceso restringido") y el enlace
  "Configuración" no aparece en su menú lateral.
- Mi perfil: contraseña actual incorrecta, confirmación que no coincide, y
  el flujo correcto (que sí cambia la contraseña real).
- Menú de perfil del topbar: abre y cierra correctamente al hacer clic
  fuera.
- `pages/roles.html` y `pages/acerca.html`: contenido correcto — 5 roles,
  matriz de 5 filas, "Equipo del Proyecto" muestra únicamente los 2 nombres
  y cargos (sin etiquetas como "Desarrollador"), versión `v2.0.0` visible.
- Cero errores de JavaScript en las 11 pantallas de la plataforma (login,
  dashboard, CACU, Mama, metodología, usuarios, configuración, roles,
  acerca, perfil), salvo el bloqueo esperado de Google Fonts por la red
  restringida de este entorno de pruebas (no ocurre para el usuario final).

## 5. Pendiente para cuando se conecte Supabase

- Sustituir el almacenamiento en `sessionStorage` por las tablas
  `usuarios` / `roles` de Supabase (ver también el esquema de datos en
  `docs/esquema_supabase.md`, que es sobre las tablas de CACU/Mama; la tabla
  de usuarios se agregaría de forma análoga).
- Hashear contraseñas del lado del servidor (hoy se comparan en texto plano
  únicamente para la demostración local).
- Recuperación de contraseña por correo (hoy sólo hay un aviso informativo).
