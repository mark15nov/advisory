-- =============================================================================
-- 1) Columnas extra en public.advisory (coinciden con tu CSV)
-- Ejecuta esto en Supabase → SQL Editor (una vez)
-- =============================================================================

alter table public.advisory
  add column if not exists empresa text,
  add column if not exists web text,
  add column if not exists email text,
  add column if not exists productos_servicios text;

-- =============================================================================
-- 2) Tabla staging: aquí importas el CSV desde Table Editor
-- =============================================================================

create table if not exists public.advisory_staging (
  id bigserial primary key,
  nombre text,
  empresa text,
  web text,
  email text,
  productos_servicios_principales text,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 3) (Opcional) Índice para búsquedas por nombre
-- =============================================================================

-- create index if not exists advisory_email_idx on public.advisory (lower(email));

-- =============================================================================
-- 4) Copiar staging → advisory (después de importar el CSV a staging)
-- No inserta duplicados: mismo nombre + mismo email (email vacío cuenta como igual)
-- =============================================================================
-- Mapeo CSV: NOMBRE, EMPRESA, WEB, EMAIL, PRODUCTOS/SERVICIOS PRINCIPALES
--    → columnas staging: nombre, empresa, web, email, productos_servicios_principales
-- =============================================================================

insert into public.advisory (
  nombre,
  empresa,
  web,
  email,
  productos_servicios,
  especialidades,
  industrias,
  etapas,
  ubicacion,
  bio,
  experiencia_anios,
  score,
  activo
)
select
  trim(s.nombre) as nombre,
  nullif(trim(s.empresa), '') as empresa,
  nullif(trim(s.web), '') as web,
  nullif(lower(trim(s.email)), '') as email,
  nullif(trim(s.productos_servicios_principales), '') as productos_servicios,

  array_remove(array[
    case when lower(coalesce(s.productos_servicios_principales,'')) ~ '(ventas|comercial|crm|funnel|prospect)' then 'ventas' end,
    case when lower(coalesce(s.productos_servicios_principales,'')) ~ '(marketing|marca|publicidad|seo|contenido|redes)' then 'marketing' end,
    case when lower(coalesce(s.productos_servicios_principales,'')) ~ '(finanzas|financiero|costos|presupuesto|flujo|cashflow|tesorer)' then 'finanzas' end,
    case when lower(coalesce(s.productos_servicios_principales,'')) ~ '(operaci|procesos|lean|calidad|supply|logist)' then 'operaciones' end,
    case when lower(coalesce(s.productos_servicios_principales,'')) ~ '(tecnolog|software|sistema|erp|automatiz|ia|analitica|datos)' then 'tecnologia' end,
    case when lower(coalesce(s.productos_servicios_principales,'')) ~ '(legal|juridic|compliance|normativ)' then 'legal' end,
    case when lower(coalesce(s.productos_servicios_principales,'')) ~ '(rh|talento|reclut|organiz|cultura|liderazgo)' then 'capital_humano' end
  ], null)::text[] as especialidades,

  array_remove(array[
    case when lower(coalesce(s.productos_servicios_principales,'')) ~ '(fintech|banco|seguros|financ)' then 'servicios_financieros' end,
    case when lower(coalesce(s.productos_servicios_principales,'')) ~ '(retail|ecommerce|tienda|consumo)' then 'retail_consumo' end,
    case when lower(coalesce(s.productos_servicios_principales,'')) ~ '(manufactura|industrial|planta|producci)' then 'manufactura' end,
    case when lower(coalesce(s.productos_servicios_principales,'')) ~ '(salud|hospital|clinica|farma)' then 'salud' end,
    case when lower(coalesce(s.productos_servicios_principales,'')) ~ '(logist|transporte|cadena de suministro)' then 'logistica' end,
    case when lower(coalesce(s.productos_servicios_principales,'')) ~ '(educaci|universidad|escuela|capacitaci)' then 'educacion' end
  ], null)::text[] as industrias,

  '{}'::text[] as etapas,
  nullif(trim(s.empresa), '') as ubicacion,
  trim(
    concat_ws(
      ' | ',
      nullif(trim(s.productos_servicios_principales), ''),
      case when nullif(trim(s.web), '') is not null then 'WEB: ' || trim(s.web) end,
      case when nullif(trim(s.email), '') is not null then 'EMAIL: ' || lower(trim(s.email)) end
    )
  ) as bio,
  null::int as experiencia_anios,
  0::numeric(4,2) as score,
  true as activo
from public.advisory_staging s
where coalesce(trim(s.nombre), '') <> ''
  and not exists (
    select 1
    from public.advisory a
    where lower(a.nombre) = lower(trim(s.nombre))
      and coalesce(lower(a.email), '') = coalesce(lower(nullif(trim(s.email), '')), '')
  );

-- =============================================================================
-- 5) Comprobaciones
-- =============================================================================
-- select count(*) from public.advisory_staging;
-- select count(*) from public.advisory;
-- select nombre, empresa, email from public.advisory order by nombre limit 20;
