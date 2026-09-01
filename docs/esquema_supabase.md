# Esquema propuesto para Supabase (preparación, no conectado)

No se conecta ninguna cuenta real de Supabase en esta versión. Esto es la
arquitectura de destino para cuando se decida sustituir los CSV locales.

## Tablas de catálogo (dimensiones compartidas)

```sql
create table catalogo_entidad (
  entidad_id      smallint primary key,
  nombre          text not null unique,       -- "Querétaro", con acentos
  clave_inegi     char(2),                    -- ej. "22" para Querétaro
  region          text                        -- opcional, para agrupar en mapas
);

create table catalogo_resultado_histopatologico_cacu (
  codigo          smallint primary key,       -- 6,7,8,9,10,11,13 (pendiente: nombres oficiales)
  nombre          text,                       -- NULL hasta recibir el catálogo oficial
  fuente_catalogo text
);

create table catalogo_resultado_citologico (
  categoria_id    smallint primary key,
  nombre          text not null unique,       -- las 12 categorías Bethesda unificadas
  sistema         text default 'Bethesda'
);

create table catalogo_plan_tratamiento (
  plan_id         smallint primary key,
  nombre          text not null unique,
  modulo          text not null               -- 'cacu' | 'mama'
);
```

## Tablas de hechos (una fila = un registro/prueba, tal como llegan las bases)

```sql
create table cacu_casos_confirmados (
  id                          bigint generated always as identity primary key,
  entidad_id                  smallint references catalogo_entidad,
  resultado_histopatologico   smallint references catalogo_resultado_histopatologico_cacu(codigo),
  plan_id                     smallint references catalogo_plan_tratamiento,
  anio                        smallint not null default 2025,
  fuente_archivo              text,           -- p. ej. "casos_confirmados_CaCu_2025.csv"
  fecha_carga                 timestamptz default now()
);

create table cama_casos_confirmados (
  id                          bigint generated always as identity primary key,
  entidad_id                  smallint references catalogo_entidad,
  resultado_histopatologico   text,           -- ya viene en texto legible
  plan_id                     smallint references catalogo_plan_tratamiento,
  anio                        smallint not null default 2025,
  fuente_archivo              text,
  fecha_carga                 timestamptz default now()
);

create table citologias (
  id              bigint generated always as identity primary key,
  entidad_id      smallint references catalogo_entidad,
  categoria_id    smallint references catalogo_resultado_citologico,
  tipo_prueba     text not null check (tipo_prueba in ('convencional','base_liquida')),
  anio            smallint not null default 2025,
  fuente_archivo  text,
  fecha_carga     timestamptz default now()
);

create table pcr_vph (
  id              bigint generated always as identity primary key,
  entidad_id      smallint references catalogo_entidad,
  resultado       text not null check (resultado in ('Positivo','Negativo','Inadecuado')),
  anio            smallint not null default 2025,
  fuente_archivo  text,
  fecha_carga     timestamptz default now()
);

create table mastografias (
  id              bigint generated always as identity primary key,
  entidad_id      smallint references catalogo_entidad,
  resultado       text not null,   -- 9 categorías tipo BI-RADS
  anio            smallint not null default 2025,
  fuente_archivo  text,
  fecha_carga     timestamptz default now()
);
```

## Vistas materializadas sugeridas (para que el frontend no agregue en el navegador)

```sql
create materialized view mv_cacu_por_entidad as
  select entidad_id, count(*) as total_casos
  from cacu_casos_confirmados
  group by entidad_id;

create materialized view mv_mama_por_entidad as
  select entidad_id, count(*) as total_casos
  from cama_casos_confirmados
  group by entidad_id;
-- (análogas para citologias, pcr_vph, mastografias)
```

## Llaves primarias / relaciones

- Todas las tablas de hechos usan `id bigint identity` como llave primaria.
- `entidad_id` es llave foránea a `catalogo_entidad` en todas las tablas de hechos.
- No existe (todavía) una llave que vincule un registro de citología/PCR con
  un caso confirmado de la misma persona — las bases actuales no traen folio
  de paciente. Si en el futuro se agrega, se recomienda una tabla
  `pacientes(folio_id, ...)` referenciada desde cada tabla de hechos.

## Servicios de consulta (capa que reemplaza a `services/realDataService.js`)

`services/realDataService.js` es, hoy, el ÚNICO archivo que debería cambiar
para leer de Supabase en vez de `window.SNSP_REAL_DATA`. Su contrato público
(`getCacuIndicadores`, `getMamaIndicadores`, `getEntidadesDisponiblesUnion`,
`toRankedArray`) debe conservarse exactamente igual para que ningún módulo o
componente visual necesite cambiar.

```js
// Ejemplo de cómo cambiaría internamente (no implementado todavía):
async function getCacuIndicadores(filtros) {
  const { data } = await supabase
    .from('mv_cacu_por_entidad')
    .select('*')
    .eq(filtros.entidad ? 'entidad_id' : undefined, filtros.entidad);
  // ... mapear al mismo formato { casos_confirmados: { por_entidad, ... } }
}
```

## Variables de entorno de ejemplo (sin credenciales reales)

```bash
# .env.example — copiar a .env y llenar con las credenciales reales del proyecto
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # sólo en backend, nunca en el navegador
SNSP_ENTORNO=staging            # demo | staging | production
```

## Archivo de configuración sugerido (`config/config.js` ya tiene el equivalente estático)

`config/config.js` seguirá siendo la única fuente de verdad para nombre,
colores, catálogos y módulos habilitados; sólo se le agregaría, cuando se
conecte Supabase, un bloque `supabase: { url, anonKey }` leído de variables
de entorno en tiempo de build (o inyectado por el hosting), nunca hardcodeado.
