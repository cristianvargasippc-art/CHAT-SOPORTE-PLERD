create extension if not exists pgcrypto;

drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;

create table if not exists public.staff_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('general', 'incidents', 'announcements')),
  body text not null,
  staff_name text not null,
  staff_role text not null,
  committee text not null,
  incident_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null,
  priority text not null default 'media' check (priority in ('baja', 'media', 'alta', 'critica')),
  status text not null default 'abierto' check (status in ('abierto', 'en_revision', 'resuelto', 'cerrado')),
  location text not null,
  description text not null,
  reporter_name text not null,
  reporter_role text not null,
  committee text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_messages
drop constraint if exists staff_messages_incident_id_fkey;

alter table public.staff_messages
add constraint staff_messages_incident_id_fkey
foreign key (incident_id) references public.incidents(id) on delete set null;

create index if not exists staff_messages_channel_created_at_idx
on public.staff_messages (channel, created_at);

create index if not exists incidents_status_created_at_idx
on public.incidents (status, created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists incidents_set_updated_at on public.incidents;
create trigger incidents_set_updated_at
before update on public.incidents
for each row execute function public.set_updated_at();

alter table public.staff_messages enable row level security;
alter table public.incidents enable row level security;

drop policy if exists "staff puede leer mensajes" on public.staff_messages;
create policy "staff puede leer mensajes"
on public.staff_messages for select
to anon, authenticated
using (true);

drop policy if exists "staff puede enviar mensajes" on public.staff_messages;
create policy "staff puede enviar mensajes"
on public.staff_messages for insert
to anon, authenticated
with check (
  length(trim(body)) > 0
  and length(trim(staff_name)) > 0
  and length(trim(staff_role)) > 0
  and length(trim(committee)) > 0
);

drop policy if exists "staff puede leer incidentes" on public.incidents;
create policy "staff puede leer incidentes"
on public.incidents for select
to anon, authenticated
using (true);

drop policy if exists "staff puede crear incidentes" on public.incidents;
create policy "staff puede crear incidentes"
on public.incidents for insert
to anon, authenticated
with check (
  length(trim(title)) > 0
  and length(trim(location)) > 0
  and length(trim(description)) > 0
  and length(trim(reporter_name)) > 0
);

drop policy if exists "staff puede actualizar estado de incidentes" on public.incidents;
create policy "staff puede actualizar estado de incidentes"
on public.incidents for update
to anon, authenticated
using (true)
with check (true);

do $$
begin
  begin
    alter publication supabase_realtime add table public.staff_messages;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.incidents;
  exception
    when duplicate_object then null;
  end;
end $$;
