# SNSP | Inteligencia Digital

**Datos que impulsan decisiones**

Segunda versión de la plataforma: los módulos **CACU** y **Cáncer de mama** ahora
se alimentan de 6 bases oficiales 2025 (nacionales), en lugar de datos de
ejemplo. El resto de la plataforma (login, dashboard, arquitectura modular,
identidad visual) se conserva sin romper.

> Esta versión usa **datos oficiales 2025 reales**, agregados por entidad
> federativa. No incluye incidencia, cobertura de tamizaje, mortalidad ni
> tendencias temporales porque las bases no traen fecha, población de
> referencia ni folio de paciente — ver [`pages/metodologia.html`](pages/metodologia.html).
> Donde un indicador no puede calcularse, la plataforma muestra explícitamente
> **"Dato pendiente de carga"**, nunca `null`, `undefined`, `NaN` ni un cero simulado.

## Versión 2.4.1 — corrección de calidad de datos en Población

Se reportó que la pirámide poblacional se veía "rota" (barras casi
invisibles salvo en 20-59). La causa **no era un bug de la gráfica**: la
fuente (`BASE_POBLACIONAL_ASIS_QUERETARO_2025.xlsx`) no trae desglose por
grupo de edad para **526 de las 2,192 localidades** — típicamente las
cabeceras municipales y zonas urbanas grandes (Santiago de Querétaro, San
Juan del Río, El Pueblito, etc.) — y en esas filas las bandas 0-9, 10-19 y
60+ vienen en cero con **todo** el total volcado en "20-59". Eso equivale
al **79.2% de la población estatal**, e inflaba esa banda a ~90% del
estado, dejando a las demás como líneas casi invisibles en la escala.

Corrección aplicada en `scripts/build_poblacion.py`:
- Se detecta ese patrón por localidad (`desglose_edad_valido`) y se
  **excluye** de los agregados de pirámide/grupo de edad (no se inventa un
  desglose que la fuente no trae).
- Los **totales de población, mujeres y hombres siguen incluyendo las
  2,192 localidades completas** (esos sí son datos completos; sólo el
  desglose por edad es el que falta en una parte de la fuente).
- Con la corrección, la pirámide ya refleja proporciones realistas sobre
  las localidades con datos válidos (0-9: 20.1%, 10-19: 18.5%, 20-59:
  51.5%, 60+: 9.9%, sobre 551,422 habitantes).
- Se agregó una nota visible en el módulo, un KPI de cobertura ("Con
  desglose de edad") y una columna en la tabla de localidades que indica
  si cada una cuenta con ese desglose.

## Versión 2.4.0 — módulo Población (Querétaro)

Se agrega un módulo nuevo, **Población**, independiente de CACU/Mama/Morbilidad
(no se toca su arquitectura, estilos, login ni dashboard):

- Fuente: `BASE_POBLACIONAL_ASIS_QUERETARO_2025.xlsx` (padrón poblacional
  oficial 2025, **2,192 localidades, 18 municipios de Querétaro**), a nivel
  localidad, con población por sexo y 4 grupos de edad (0-9, 10-19, 20-59,
  60+ — los únicos que trae la fuente; no se inventan quinquenales).
- **Pirámide poblacional** por sexo y grupo de edad (mujeres/hombres),
  **mapa ilustrativo por municipio** (reutiliza `components/mapQueretaro.js`),
  **ranking de población por municipio** (los 18, de mayor a menor) y
  **tabla de localidades** con buscador por nombre, ordenada por población
  descendente.
- Filtro real: **municipio** (único filtro con sentido sobre este padrón;
  se combina con el buscador de localidad, que actúa sobre la tabla).
- Es **un módulo de consulta poblacional independiente**: por ahora el
  padrón **no se usa como denominador de tasas/incidencia** de CACU, Mama
  ni Morbilidad — queda identificado como el candidato natural para esa
  etapa posterior (ver sección "Próximos pasos técnicos").
- Archivos nuevos: `scripts/build_poblacion.py`, `data/real/poblacion_2025.js`,
  `data/processed/poblacion_2025.json`, `services/poblacionDataService.js`,
  `modules/poblacionModuleView.js`, `pages/poblacion.html`, y una función
  nueva en `components/charts.js` (`SNSP_renderPopulationPyramid`, aditiva:
  no se modificó ninguna función existente del estándar de visualización).
  Único cambio a archivos existentes: `config/config.js` (entrada del
  módulo y changelog) y `components/sidebar.js` (ícono del módulo).

## Versión 2.2.0 — estándar de visualización centralizado

Ajuste transversal a la capa de gráficas, sin tocar datos, filtros, totales,
colores institucionales ni la lógica de ningún módulo:

- **Etiquetas numéricas automáticas** sobre barras, barras agrupadas y
  donas (con separador de miles y porcentaje), sin necesidad de pasar el
  cursor. Se omite puntualmente una etiqueta sólo cuando la barra es
  demasiado angosta para el texto (muchas categorías a la vez) o cuando
  una rebanada de dona es demasiado pequeña — en ambos casos la leyenda o
  el top-N ya usado por cada módulo cumple esa función.
- **Títulos y subtítulos dinámicos** sobre cada gráfica
  ("[indicador] por [dimensión], de [padecimiento], en [lugar], durante
  [periodo]"), que se recalculan cada vez que el módulo vuelve a
  dibujar sus gráficas (p. ej. al aplicar/quitar filtros).
- Todo se centralizó en `components/charts.js` (funciones
  `SNSP_formatNumber`, `SNSP_formatPercent`, `SNSP_wrapLabel`,
  `SNSP_tituloGrafica`, y un plugin interno de Chart.js registrado una
  sola vez — no se agregó ninguna librería nueva). Los módulos
  (`categoricalModuleView.js`, `morbilidadModuleView.js`,
  `moduleView.js`, `dashboard.html`) sólo pasan un `opts.tituloPartes`
  con las piezas semánticas (indicador/dimensión/padecimiento/lugar/
  periodo); el formato final lo decide siempre `charts.js`.
- Las llamadas existentes sin este parámetro nuevo siguen funcionando
  igual (retrocompatible), sólo que ahora con etiquetas numéricas.

## Versión 2.1.0 — módulo Morbilidad (Querétaro), prueba funcional

Se agrega un módulo nuevo, **Morbilidad**, sin tocar arquitectura, estilos,
login, dashboard, ni los módulos CACU/Mama existentes:

- Fuente: `CUBOS_DE_MORBILIDAD_2025_CON_CUBOS.xlsx` (201,047 registros,
  **exclusivamente estado de Querétaro**, años 2024-2026), complementada
  por CLUES con `ESTABLECIMIENTO_SALUD_202601.xlsx` (sin duplicar casos).
- Consulta por **código CIE-10, Epi-clave o nombre del padecimiento**
  (buscador con sugerencias) y accesos rápidos a **C50, C53, D06, N87**
  (D05 no está presente en la base y se muestra deshabilitado).
- Filtros reales: **año, municipio, jurisdicción sanitaria, institución,
  CLUES y mes**. Sexo y grupo de edad no existen en la fuente y se
  muestran explícitamente como "Dato pendiente de carga".
- Visualizaciones: total de casos, casos por municipio, por jurisdicción,
  por institución, por mes y año, principales padecimientos y detalle por
  CLUES/unidad médica.
- **No incluye comparativo nacional ni tasas** (no hay padrón poblacional
  validado): el archivo de Microregionalización se identificó como
  candidato para una etapa posterior, pero no se usa todavía.
- Archivos nuevos: `scripts/build_morbilidad.py`,
  `data/real/morbilidad_2025.js`, `data/processed/morbilidad_2025.json`,
  `services/morbilidadDataService.js`, `modules/morbilidadModuleView.js`,
  `pages/morbilidad.html`. Único cambio a un archivo existente:
  `config/config.js` (se habilita la entrada `morbilidad`, ya declarada
  desde la versión anterior, y se agrega el changelog).
- Ver `docs/diccionario_de_datos.md` (sección 4) y
  `pages/metodologia.html` para el detalle completo.

## Versión 2.0.0 — identidad institucional y administración de usuarios

Esta versión **no modifica** arquitectura, ETL, `scripts/build_data.py`,
servicios de datos, módulos CACU/Mama, dashboards, filtros ni la
documentación de datos existente (ver secciones de abajo). Los cambios son
únicamente de identidad visual, administración y experiencia de usuario:

- **Usuarios reales**: se eliminaron los usuarios de demostración; ahora hay
  2 usuarios iniciales (Lic. Osvaldo Bobadilla Mino y Ing. Soraya Lizbeth
  Sánchez Torres, ambos con rol Administrador). Contraseña de prueba para
  ambos: `SNSP2025` (visible sólo en `auth/auth.js`, sustituible por Supabase
  Auth sin tocar ninguna pantalla).
- **Administración de usuarios completa** (`pages/admin-usuarios.html`): alta,
  edición, cambio de contraseña, activar/desactivar, eliminación lógica,
  búsqueda por nombre/correo y filtro por rol.
- **Catálogo de roles ampliado** (`pages/roles.html`): Administrador,
  Supervisor, Analista, Capturista, Consulta — agregar uno nuevo sólo
  requiere una entrada en `auth/auth.js` → `ROLES`.
- **Menú de perfil** en el topbar (nombre, cargo, rol): "Mi perfil"
  (`pages/perfil.html`, incluye cambio de contraseña propio) y "Cerrar sesión".
- **Módulo de Configuración** (`pages/configuracion.html`): hub con Usuarios,
  Roles, Datos institucionales, Seguridad, Catálogos (estructurales estas
  últimas tres) y Acerca del sistema.
- **Acerca del sistema** (`pages/acerca.html`): Equipo del Proyecto (sólo
  nombre y cargo institucional, sin etiquetas técnicas) e historial de
  versiones (`config/config.js` → `changelog`).
- **Pantalla de inicio rediseñada**: nueva composición vectorial original
  (silueta de acueducto + red de datos + línea de pulso, en la paleta
  institucional — no es una fotografía ni un collage) y tarjeta de acceso
  con los 2 usuarios reales como accesos rápidos.
- **Versión visible**: `v2.0.0`, mostrada en topbar, footer de cada módulo y
  Acerca del sistema.

Ver `docs/administracion_usuarios.md` para el contrato de la capa de
usuarios (pensado para sustituirse por Supabase sin cambiar pantallas) y el
detalle de verificación de esta versión.

## Cómo probarla

Aplicación estática (HTML/CSS/JS), sin paso de build.

```bash
cd snsp
python3 -m http.server 8080
# o: npx serve .
```

Abre `http://localhost:8080/index.html`, elige un perfil demostrativo (chips
debajo del formulario) y entra. Es un login simulado (`auth/auth.js`), sin
credenciales reales.

**Ruta rápida para ver los datos reales:** entra con cualquier perfil →
"Cáncer cervicouterino (CACU)" o "Cáncer de mama" en el menú lateral.

## Qué cambió respecto a la versión anterior

| Elemento | Antes | Ahora |
|---|---|---|
| Datos CACU/Mama | Sintéticos, con año/municipio/institución inventados | 6 bases oficiales 2025, reales, por entidad federativa |
| Indicadores | Incidencia, cobertura, mortalidad, tendencia | Totales, distribuciones y % por categoría/entidad (los únicos calculables con las columnas disponibles) |
| Filtros | Año, jurisdicción, municipio, institución, grupo de edad (simulados) | Sólo **entidad federativa** (el único filtro real que soportan las bases); el resto se oculta explícitamente |
| Mapa | Ilustrativo por municipio de Querétaro | Ilustrativo por entidad federativa (nacional) — `components/mapNacional.js` |
| Login, roles, dashboard, estilos | — | Sin cambios de arquitectura |

Los archivos de la versión anterior (demo) se conservan, sin usarse, en
`pages/_legacy_demo/` y `data/_legacy_demo_*.js`, y `modules/moduleView.js`
+ `components/mapQueretaro.js` quedan intactos como plantilla para módulos
futuros que sí cuenten con año/municipio/institución (dengue, mortalidad, etc.).

## Estructura del proyecto

```
/index.html                      Login
/dashboard.html                  Dashboard principal (totales reales CACU + Mama)
/config/config.js                Configuración global única
/auth/auth.js                    Autenticación, usuarios demo, roles y permisos (simulado)
/services/dataService.js         Capa de datos original (queda para módulos futuros no categóricos)
/services/realDataService.js     Capa de datos NUEVA: indicadores reales de CACU y Mama
/data/raw/                       Las 6 bases oficiales 2025, SIN MODIFICAR
/data/processed/                 Datos transformados (JSON): agregados, cruces por entidad, informe de calidad
/data/real/indicadores_2025.js   Los mismos agregados, expuestos como window.SNSP_REAL_DATA (generado, no editar a mano)
/data/_legacy_demo_*.js          Datos de ejemplo de la versión anterior (sin usar)
/components/                     UI reutilizable: sidebar, topbar, tarjetas, gráficas, filtros, mapa estatal (legado) y mapa nacional (nuevo)
/modules/moduleView.js           Vista genérica ANTERIOR (para módulos futuros con año/municipio/institución)
/modules/categoricalModuleView.js Vista genérica NUEVA (usada por CACU y Mama con datos reales)
/pages/cacu.html, mama.html      Módulos, ahora con datos reales
/pages/metodologia.html          Fuentes, variables, fórmulas, limitaciones — actualizado
/pages/admin-usuarios.html       Sin cambios
/pages/_legacy_demo/             Copia de las páginas de la versión anterior (referencia, no enlazadas)
/styles/                         Paleta y componentes visuales — sin cambios
/scripts/build_data.py           Script que transforma data/raw/*.csv → data/processed/ y data/real/
/docs/                           Diccionario de datos, informe de calidad, esquema Supabase, indicadores
```

## Capa de datos: cómo se transforman las 6 bases

`scripts/build_data.py` (Python, fuera del navegador) hace lo siguiente y se
vuelve a correr cada vez que llega una base nueva — la interfaz no cambia:

1. Lee `data/raw/*.csv` (nunca los modifica).
2. Estandariza `entidad` a un catálogo único de 32 entidades (corrige acentos:
   "Michoacan" → "Michoacán", etc.).
3. Unifica las 12 categorías de `citologias_2025.csv` y
   `CITOLOGIA_BASE_LIQUIDA_2025.csv` (redactadas con variantes menores) a un
   catálogo común, sin mezclar ambas pruebas entre sí.
4. Corrige la errata de captura "Primaro" → "Primario" en `plan_tratamiento` (CaMa).
5. Conserva `resultado_histopatologico` de CACU como "Código N" (viene sin
   catálogo de equivalencias — ver limitaciones).
6. Genera tablas cruzadas **entidad × categoría** (no sólo totales
   marginales), para que el filtro de entidad se refleje correctamente en
   todos los desgloses.
7. Escribe `data/processed/indicadores_2025.json` (auditoría) y
   `data/real/indicadores_2025.js` (consumido por el navegador vía
   `window.SNSP_REAL_DATA`).

Para regenerarlo tras recibir bases nuevas:
```bash
cd scripts
python3 build_data.py
```

## Verificación realizada antes de entregar

Este entorno de trabajo no tiene salida de red hacia CDNs de navegador
(bloqueada por política de red del sandbox), así que no fue posible correr un
navegador real (Puppeteer/Chrome) aquí. En su lugar se verificó con:

- `node --check` en los 14 archivos `.js` de la plataforma (sin errores de sintaxis).
- Pruebas de lógica pura en Node contra `data/real/indicadores_2025.js` +
  `services/realDataService.js`, comparando totales contra los CSV originales.
- Un servidor estático local (`python3 -m http.server`) + `jsdom` ejecutando
  las páginas reales (login, dashboard, CACU, Mama, metodología, admin) con
  un stub de Chart.js (la única dependencia externa que el sandbox no puede
  descargar), confirmando: cero errores de JavaScript, KPIs con los totales
  correctos, el filtro de entidad aplicándose correctamente end-to-end, y
  ningún `null`/`undefined`/`NaN` visible.
- Dos bugs reales se encontraron y corrigieron con esta verificación (ver
  `docs/informe_calidad.md`, sección "Incidencias detectadas y corregidas").

**Recomendación:** de todas formas, antes de usarla en producción, ábrela tú
mismo en un navegador siguiendo "Cómo probarla" arriba — la verificación
automatizada aquí no sustituye una revisión visual.

## Cómo agregar un módulo nuevo

- **Con la misma forma de datos que CACU/Mama** (sólo entidad + categorías,
  sin año/municipio): duplica el patrón de `scripts/build_data.py` +
  `pages/cacu.html` + `SNSP_renderCategoricalModulePage`.
- **Con año/municipio/institución** (p. ej. si la fuente de dengue sí los
  trae): usa el patrón anterior — `modules/moduleView.js` +
  `components/mapQueretaro.js` — que sigue intacto para ese caso.

En ambos casos: agrega la entrada en `config/config.js` → `modules[]`, no es
necesario tocar sidebar, login, autenticación ni estilos.

## Próximos pasos técnicos (fuera del alcance de esta versión)

- **Usar el padrón poblacional como denominador de tasas**: ya se recibió
  `BASE_POBLACIONAL_ASIS_QUERETARO_2025.xlsx` (módulo Población, v2.4.0),
  con población por municipio, localidad, sexo y grupo de edad. Es el
  candidato natural para calcular incidencia/tasas en CACU, Mama y
  Morbilidad, pero requiere decidir primero la homologación de grupos de
  edad entre fuentes (el padrón sólo trae 0-9/10-19/20-59/60+, mientras que
  `config/config.js` → `catalogs.gruposEdad` usa quinquenales) — no se hizo
  en esta versión para no introducir una tasa con un denominador mal
  alineado.
- **Catálogo de códigos histopatológicos de CACU**: pendiente de recibir del
  usuario; en cuanto llegue, se agrega en `scripts/build_data.py` y todo lo
  demás se actualiza solo.
- **Supabase**: ver `docs/esquema_supabase.md` para el esquema de tablas,
  llaves, catálogos y variables de entorno de ejemplo propuestos.
- **Exportación real a PDF/Excel**: los botones están en la interfaz,
  deshabilitados y marcados "(pendiente)" — nunca se simula una descarga.
- **Autenticación real**: sustituir `auth/auth.js` por Supabase Auth
  conservando la misma API pública (`SNSP_AUTH.login`, `.can`, `.getUser`).
- **Mapa geográfico oficial**: sustituir `components/mapNacional.js` por
  geometría GeoJSON de INEGI sin cambiar su API pública
  (`SNSP_renderMapNacional`).

## Paleta institucional (única fuente: `styles/tokens.css` y `config/config.js`)

| Color | Hex |
|---|---|
| Gris oscuro | `#4D4D4D` |
| Vino | `#611232` |
| Verde oscuro | `#002F2A` |
| Dorado | `#A57F2C` |
| Rojo claro | `#9B2247` |
| Verde claro | `#1E5B4F` |
| Beige | `#E6D194` |
| Gris | `#98989A` |
