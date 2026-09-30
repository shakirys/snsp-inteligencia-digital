# Propuesta de arquitectura — Persistencia de datos (Cargar datos)

**Estado: PROPUESTA. No implementada.** Este documento responde al punto 2
de la actualización v2.5.0 ("revisa la arquitectura actual y propón la
alternativa de persistencia más adecuada... no hagas cambios de
arquitectura sin explicarlos primero"). No se tocó ningún archivo de
código para este punto — sólo se investigó y se redactó esta propuesta.

> **Nota de continuidad**: el proyecto ya tiene un plan de migración a
> Supabase documentado en `docs/esquema_supabase.md` (tablas de catálogo/
> hechos para CACU y Mama, pensado para reemplazar los CSV estáticos que
> hoy alimentan esos dos módulos). Esta propuesta **no introduce una
> tecnología nueva**: extiende esa misma dirección ya planeada para cubrir
> también el flujo de Cargar datos (que es de escritura/publicación, no
> sólo de lectura como CACU/Mama), y comparte el mismo backend con la
> propuesta de seguridad (`PROPUESTA_ARQUITECTURA_SEGURIDAD.md`).

## 1. Qué hay hoy (revisión de la arquitectura actual)

La plataforma completa es **estática**: HTML/CSS/JS servidos tal cual
(pensada para GitHub Pages), sin backend propio. Los datos "reales" de
CACU, Mama, Morbilidad y Población no viven en una base de datos: son
archivos `data/real/*.js` generados una vez por scripts Python
(`scripts/build_*.py`) a partir de los Excel oficiales y comiteados al
repositorio como bundles JS (`window.SNSP_*_DATA`). Esto funciona bien
para datos que cambian pocas veces al año y se "publican" mediante un
nuevo commit/despliegue — pero es exactamente el patrón que **Cargar
datos** no puede seguir, porque su objetivo es que una persona sin acceso
al repositorio cargue y publique una base nueva desde el navegador.

Hoy, `services/cargaDataService.js` + `modules/cargaModuleView.js` son un
prototipo **100% en memoria de la pestaña**: `estado.rows`, `estado.headers`,
el mapeo, la base de población relacionada, etc. viven en variables
JavaScript normales. Nada se guarda en disco, `localStorage`,
`sessionStorage` ni ningún otro almacén: al recargar la página o cerrarla,
todo se pierde y hay que volver a subir el archivo. Es intencional (es la
"Etapa 1" documentada en `LEEME_prototipo_carga.md`), pero significa que
hoy **ningún otro módulo puede alimentarse** de lo que alguien cargue ahí.

Importante para esta propuesta: `auth/auth.js` (usuarios, roles, sesión,
bitácora) ya usa `sessionStorage` como almacén temporal, y su propio
comentario de cabecera ya documenta la intención original del proyecto:
*"En producción, este archivo se reemplaza por una integración real con
Supabase Auth + una tabla `usuarios`... conservando exactamente la misma
API pública"*. Es decir, **Supabase ya estaba contemplado como el backend
de destino** antes de esta actualización; esta propuesta retoma esa
misma dirección para persistencia, en vez de introducir una tecnología
nueva no planeada.

## 2. Por qué `localStorage` (y `sessionStorage`/IndexedDB) no sirven como almacenamiento definitivo

El requerimiento es explícito: *"Una base aprobada debe permanecer
disponible aunque se cierre o recargue la página y debe seguir
alimentando los módulos hasta que un usuario autorizado publique una
nueva versión"*. Eso implica que la base aprobada es un recurso
**compartido entre usuarios y dispositivos**, no un dato personal de quien
la subió. Ningún almacenamiento del navegador cumple eso:

- **Alcance por navegador/dispositivo**: `localStorage`, `sessionStorage`
  e IndexedDB viven en el perfil de un navegador en una máquina. Si Soraya
  aprueba y "publica" una base desde su computadora, nadie más (ni ella
  desde otro equipo) la vería — cada quien seguiría viendo datos
  distintos o ninguno.
- **Tamaño**: `localStorage`/`sessionStorage` tienen un límite práctico de
  ~5-10 MB por origen en la mayoría de navegadores. Las bases reales ya
  superan eso (el bundle de morbilidad por CIE-10 pesa 9.2 MB; el nuevo
  panel de Casos/Población de esta entrega, ya reducido, pesa 2.1 MB; una
  base institucional cruda puede ser mucho mayor). IndexedDB soporta más
  tamaño, pero sigue siendo local al dispositivo.
- **Sin auditoría real ni control de acceso**: cualquier persona con
  acceso a las herramientas de desarrollador del navegador puede leer,
  editar o borrar lo que haya ahí — no hay forma de garantizar que "sólo
  un usuario autorizado publique una nueva versión" si el candado vive en
  el mismo navegador que se quiere controlar.
- **No sobrevive a "publicar para todos"**: el requerimiento pide que la
  base publicada seencuentre disponible para *todos* los usuarios de la
  plataforma, no sólo para quien la cargó. Eso, por definición, requiere
  un almacén accesible desde cualquier navegador/dispositivo — es decir,
  un servicio remoto.

Por eso cualquier alternativa "sólo en el navegador" (incluyendo
IndexedDB, que técnicamente no es `localStorage` pero comparte estas
mismas limitaciones) no resuelve el problema de fondo, aunque cumpliera
la letra de "no uses localStorage".

## 3. Arquitectura propuesta

**Recomendación: Supabase** (Postgres administrado + Auth + Storage +
API REST/Realtime autogenerada), consistente con lo que `auth/auth.js` ya
anticipa. Separación de responsabilidades:

```
┌─────────────────────────┐        HTTPS (API REST/JS client,          ┌───────────────────────────┐
│  GitHub Pages (estático) │ ───── con token de sesión, sólo a          │  Supabase (backend gestionado) │
│  HTML/CSS/JS actuales    │        usuarios autenticados)   ──────────▶│  - Postgres (tablas)        │
│  (interfaz, sin cambios  │                                            │  - Auth (sesión real)       │
│  de código hoy)          │ ◀───── respuesta JSON (sólo datos          │  - Storage (archivos)       │
└─────────────────────────┘        aprobados/publicados)                │  - Row Level Security (RLS) │
                                                                          └───────────────────────────┘
```

- **GitHub Pages** sigue alojando sólo la interfaz (HTML/JS/CSS), tal
  como hoy. No cambia el hosting de la app.
- **Supabase** es el único lugar donde vive el dato mutable/institucional:
  el archivo subido, el mapeo, el informe de calidad, el estado
  (borrador/validado/publicado), quién y cuándo hizo cada paso, y el
  historial de versiones publicadas.
- El navegador **nunca** guarda la base "de verdad": sólo pide a Supabase
  la última versión publicada de cada módulo (con el token de sesión de
  quien esté autenticado) y la mantiene en memoria mientras la pestaña
  esté abierta — igual que hoy hace con los bundles `data/real/*.js`,
  sólo que la fuente ya no es un archivo commiteado sino una consulta.

### Modelo de datos (propuesta, no creado aún)

- `cargas` — una fila por intento de carga: archivo (nombre, hash,
  tamaño), usuario que cargó, fecha, mapeo elegido, informe de calidad
  generado, estado (`borrador` → `validado` → `publicado` → `archivado`).
- `bases_publicadas` — una fila por versión publicada de cada módulo/
  fuente de datos: apunta a los datos ya agregados (o a un archivo en
  Supabase Storage), quién publicó, cuándo, y un número de versión
  incremental. Siempre hay como máximo una fila "vigente" por módulo; las
  anteriores quedan como historial/respaldo (ver propuesta de seguridad,
  punto de "respaldo y versionado").
- El archivo institucional original (Excel/CSV) se guarda en **Supabase
  Storage**, en un bucket **privado** (no público), nunca en el
  repositorio de GitHub — así se cumple el punto 3 de "evitar exposición
  directa de bases institucionales" sin depender de mantener `data/raw/`
  vacío por convención manual, como hoy.

### Flujo Cargar → Mapear → Validar → Aprobar/Publicar → Conservar

1. **Cargar**: igual que hoy en el navegador (parseo de CSV/XLSX en el
   cliente, sin cambios); al terminar, se sube el archivo original a
   Supabase Storage y se crea una fila en `cargas` con estado `borrador`.
2. **Mapear**: igual que hoy (interfaz de mapeo de columnas ya validada);
   el mapeo elegido se guarda en la fila de `cargas`, no en memoria
   solamente.
3. **Validar**: el informe de calidad ya validado
   (`generarInformeCalidad`) se calcula igual que hoy, pero además se
   recalcula del lado del servidor antes de aceptar el paso siguiente
   (ver propuesta de seguridad, "validación de archivos antes de
   publicarlos") — para que no baste con manipular la llamada desde el
   navegador.
4. **Aprobar/Publicar**: sólo disponible para roles autorizados (ver
   propuesta de seguridad). Al publicar, se agrega una fila nueva a
   `bases_publicadas` con la nueva versión y se marca como vigente; la
   versión anterior queda archivada, no se borra.
5. **Conservar**: los módulos que consuman esta fuente piden siempre la
   versión vigente de `bases_publicadas` — así sobrevive a cerrar/recargar
   la página y a que cambie quien esté conectado, hasta que alguien
   autorizado publique una nueva versión, exactamente como se pidió.

### Por qué Supabase y no otra opción

- Ya está referenciado como destino planeado en el propio código
  (`auth/auth.js`), así que no introduce una dependencia nueva no
  discutida.
- Incluye Auth + Postgres + Storage + RLS en un solo servicio, lo cual
  cubre a la vez esta propuesta de persistencia y la de seguridad (punto
  3) sin tener que integrar y mantener piezas sueltas (un servidor propio
  + una base de datos + un proveedor de archivos por separado).
- Tiene un nivel gratuito razonable para el volumen de esta plataforma
  (bases de unos pocos MB, tráfico interno de una jurisdicción sanitaria),
  aunque el costo/plan exacto debe confirmarse antes de contratarlo — no
  es información que se pueda garantizar desde aquí.
- Alternativa más ligera descartada por ahora: un backend propio (p. ej.
  Node/Express + Postgres autoadministrado) resuelve lo mismo pero exige
  mantener servidor, backups y seguridad por cuenta propia — más trabajo
  operativo para el mismo resultado, sin una razón concreta en este
  proyecto para preferirlo sobre un servicio gestionado.

## 4. Lo que esta propuesta NO incluye todavía

- No se creó ninguna cuenta ni proyecto de Supabase.
- No se escribió ningún cliente/SDK de Supabase en el código de la
  plataforma.
- No se modificó `cargaDataService.js`, `cargaModuleView.js` ni
  `auth/auth.js`.
- No se movió ningún archivo institucional a un almacenamiento externo.

**Este es un servicio externo/backend** (Supabase), por lo que — tal como
se pidió explícitamente — se detiene aquí la implementación hasta contar
con aprobación explícita sobre esta arquitectura antes de construir nada.
