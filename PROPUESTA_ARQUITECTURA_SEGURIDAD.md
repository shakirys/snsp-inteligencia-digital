# Propuesta de arquitectura — Seguridad, roles y protección de datos

**Estado: PROPUESTA. No implementada.** Este documento responde al punto 3
de la actualización v2.5.0 ("indícame claramente qué arquitectura propones
para separar interfaz, autenticación y datos protegidos... no hagas
cambios sin explicarlos primero"). No se modificó `auth/auth.js` ni ningún
otro archivo de seguridad para este punto — sólo se revisó y se redactó
esta propuesta, apoyada en la de persistencia (`PROPUESTA_ARQUITECTURA_PERSISTENCIA.md`),
porque ambas comparten el mismo backend recomendado (Supabase).

## 1. Qué hay hoy (revisión de la arquitectura actual)

`auth/auth.js` **ya implementa** buena parte de lo que se pide, pero de
forma simulada y sólo del lado del cliente:

- Catálogo de **roles y permisos atómicos** ya existente: `administrador`,
  `supervisor`, `analista`, `capturista`, `consulta`, cada uno con una
  lista de permisos (`visualizar`, `descargar`, `editar`,
  `cargar_informacion`, `administrar_usuarios`, `configurar_modulos`,
  `eliminar_informacion`). `SNSP_AUTH.can(permiso)` es la función que ya
  usan las pantallas para mostrar/ocultar u ocultar botones.
- **Bitácora** ya existente (`logAction`/`getBitacora`): registra
  usuario, fecha/hora y acción en cada operación relevante (ya se usa,
  por ejemplo, al aplicar filtros).
- Usuarios y sesión ya modelados con alta/baja/edición, cambio de
  contraseña y estatus (activo/inactivo/eliminado).

El problema no es el diseño de roles/permisos — ya es razonable y
reutilizable — sino que **todo se aplica y se guarda en el navegador**:

- Las contraseñas viven en texto plano dentro de `sessionStorage`
  (`DEFAULT_PASSWORD = "SNSP2025"` para todos los usuarios de prueba) y el
  login sólo compara contra esa lista local.
- `SNSP_AUTH.can(...)` es una función JavaScript normal: cualquier persona
  con las herramientas de desarrollador del navegador puede llamarla
  directamente, editar `sessionStorage`, o simplemente ignorar el
  resultado y ejecutar la acción de todos modos — no hay nada del otro
  lado que la haga cumplir de verdad.
- No existe hoy un backend que reciba "publicar base" y decida si esa
  persona puede hacerlo: la decisión vive sólo en el mismo navegador que
  se querría controlar.
- Las bases institucionales reales (`data/raw/`) **ya se mantienen fuera
  del repositorio** por convención (se confirmó que `data/raw/` está
  vacío en el proyecto entregado) — es una buena práctica ya presente,
  pero informal: depende de que quien genere los bundles recuerde no
  comitear los Excel originales, no de una regla del sistema.

## 2. Principio de la propuesta: separar interfaz, autenticación y datos protegidos

```
┌────────────────────────┐   1. Login/token    ┌──────────────────────────┐
│  GitHub Pages (público)  │ ───────────────────▶│  Supabase Auth            │
│  - Sólo interfaz esttica │ ◀─────────────────── │  (verifica credenciales,  │
│  - Sin usuarios, sin      │   sesión + JWT       │  entrega token de sesión) │
│    contraseñas, sin datos │                      └──────────────────────────┘
│    institucionales        │
│                            │   2. Peticiones con token, filtradas por rol
│                            │ ───────────────────▶┌──────────────────────────┐
│                            │ ◀─────────────────── │  Supabase (Postgres +     │
└────────────────────────┘   3. Sólo lo que el      │  Storage + RLS)           │
                              rol autoriza ve la      │  - Tablas de usuarios,    │
                              respuesta                │    roles, cargas, bitácora│
                                                        │  - Archivos institucionales│
                                                        │    en bucket privado      │
                                                        └──────────────────────────┘
```

Tres capas separadas, cada una con una responsabilidad:

1. **Interfaz** (GitHub Pages, público): sigue siendo el mismo
   HTML/CSS/JS de hoy. No contiene usuarios, contraseñas ni datos
   institucionales — sólo sabe pedirle a Supabase que autentique y
   que le entregue lo que el rol de la persona autoriza.
2. **Autenticación** (Supabase Auth): verifica credenciales de verdad
   (contraseñas con hash, no en texto plano), entrega un token de sesión
   (JWT) que el navegador reenvía en cada petición, y permite expirar/
   revocar sesiones. Reemplaza `login()`/`getSession()` de `auth/auth.js`
   manteniendo, como ya anticipa su propio comentario de cabecera, la
   misma API pública hacia las pantallas (`SNSP_AUTH.login`, `.can`,
   `.listUsers`, etc.) para no tener que tocar ninguna pantalla existente.
3. **Datos protegidos** (Postgres + Storage en Supabase, con Row Level
   Security): aquí es donde se decide de verdad, en el servidor, si una
   petición puede leer o escribir algo — no en el navegador.

## 3. Cómo se cubre cada punto pedido

- **Autenticación** → Supabase Auth reemplaza el login simulado; misma
  API pública hacia las pantallas, contraseñas reales con hash, sesión
  con expiración.
- **Roles y permisos** → se conserva el catálogo ya existente
  (administrador/supervisor/analista/capturista/consulta y sus permisos
  atómicos), migrado a una tabla `roles`/`usuarios.role` en Postgres. Se
  proponen dos permisos nuevos, específicos de Cargar datos, que hoy no
  existen en el catálogo: `validar_carga` y `publicar_carga` (distintos de
  `cargar_informacion`, que ya existe) — así "cargar" y "publicar" pueden
  asignarse a personas distintas si la institución lo requiere, en vez de
  asumir que quien sube el archivo es automáticamente quien lo aprueba.
- **Sólo usuarios autorizados pueden cargar, validar y publicar** → se
  aplica con **Row Level Security (RLS)** de Postgres: reglas del lado del
  servidor que revisan el rol de quien hace la petición antes de permitir
  `insert`/`update` en las tablas de `cargas`/`bases_publicadas` — así no
  basta con manipular el navegador para saltarse el permiso, como sí pasa
  hoy con `can()`.
- **Registro de usuario, fecha y actualización realizada** → se extiende
  la bitácora ya existente (`logAction`) para escribir en una tabla
  `bitacora` en Postgres en vez de (o además de) `sessionStorage`: cada
  carga, validación y publicación queda registrada con quién, cuándo y
  qué cambió, de forma permanente y consultable, no sólo mientras dure la
  pestaña abierta.
- **Respaldo/versionado de la última base válida** → cubierto por
  `bases_publicadas` (ver propuesta de persistencia): cada publicación crea
  una versión nueva sin borrar la anterior, que queda como respaldo/
  historial y permite revertir a la última versión válida si hiciera
  falta.
- **Validación de archivos antes de publicarlos** → el informe de calidad
  ya validado en el navegador (`generarInformeCalidad`) se conserva tal
  cual para la experiencia de usuario, pero se **repite del lado del
  servidor** (como función/regla en Supabase) antes de aceptar el paso
  "Publicar" — para que la validación no dependa únicamente de confiar en
  lo que el navegador reporta.
- **Evitar exposición directa de bases institucionales** → los archivos
  originales (Excel/CSV) y cualquier dato no agregado se guardan en un
  **bucket privado de Supabase Storage**, con RLS también aplicado a
  archivos: sólo el backend/roles autorizados pueden leerlos. GitHub
  Pages sigue alojando sólo la interfaz; el repositorio público nunca
  recibe archivos institucionales (se formaliza en el sistema lo que hoy
  ya se hace por convención manteniendo `data/raw/` vacío).

## 4. Lo que esta propuesta NO incluye todavía

- No se creó ninguna tabla, política RLS ni bucket en Supabase.
- No se modificó `auth/auth.js`, ni sus roles/permisos actuales, ni
  ninguna pantalla que dependa de `SNSP_AUTH`.
- No se agregaron los permisos `validar_carga`/`publicar_carga` al
  catálogo real — sólo se proponen aquí.
- No se movió ningún archivo institucional a almacenamiento externo.
- Los usuarios y contraseñas de prueba actuales (`sessionStorage`) siguen
  funcionando exactamente igual que antes de esta propuesta.

**Este es un servicio externo/backend** (Supabase), por lo que — tal como
se pidió explícitamente — se detiene aquí la implementación hasta contar
con aprobación explícita sobre esta arquitectura antes de construir nada.
