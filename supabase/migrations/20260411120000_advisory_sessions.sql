-- Sesiones del advisory: una fila por sesión de usuario (identificador cliente en client_session_id).
create table if not exists public.advisory_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_session_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_session_id)
);

create index if not exists advisory_sessions_user_updated_idx
  on public.advisory_sessions (user_id, updated_at desc);

alter table public.advisory_sessions enable row level security;

create policy "advisory_sessions_select_own"
  on public.advisory_sessions for select
  using (auth.uid() = user_id);

create policy "advisory_sessions_insert_own"
  on public.advisory_sessions for insert
  with check (auth.uid() = user_id);

create policy "advisory_sessions_update_own"
  on public.advisory_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "advisory_sessions_delete_own"
  on public.advisory_sessions for delete
  using (auth.uid() = user_id);

create or replace function public.advisory_sessions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists advisory_sessions_set_updated_at on public.advisory_sessions;
create trigger advisory_sessions_set_updated_at
  before update on public.advisory_sessions
  for each row
  execute function public.advisory_sessions_set_updated_at();
