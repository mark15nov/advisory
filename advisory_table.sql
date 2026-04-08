create extension if not exists pgcrypto;

create table if not exists public.advisory (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  empresa text,
  web text,
  email text,
  productos_servicios text,
  especialidades text[] not null default '{}',
  industrias text[] not null default '{}',
  etapas text[] not null default '{}',
  ubicacion text,
  bio text,
  experiencia_anios integer,
  score numeric(4,2) not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists advisory_activo_idx on public.advisory (activo);
create index if not exists advisory_nombre_idx on public.advisory (nombre);
