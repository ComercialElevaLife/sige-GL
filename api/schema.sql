create extension if not exists pgcrypto;

create table if not exists client (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create table if not exists unit (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client(id) on delete cascade,
  name text not null
);
create table if not exists sector (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client(id) on delete cascade,
  unit_id uuid not null references unit(id) on delete cascade,
  name text not null
);
create table if not exists class_location (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client(id) on delete cascade,
  unit_id uuid not null references unit(id) on delete cascade,
  name text not null
);
create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'professor', 'client')),
  client_ids text[] not null default '{}',
  active boolean not null default true,
  invitation_token_hash text,
  invitation_expires_at timestamptz,
  reset_token_hash text,
  reset_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists person (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client(id) on delete cascade,
  unit_id uuid not null references unit(id) on delete cascade,
  sector_id uuid not null references sector(id),
  location_id uuid references class_location(id),
  name text not null,
  registration text not null,
  document text,
  shift text not null,
  created_at timestamptz not null default now(),
  unique(client_id, registration)
);
create table if not exists class_schedule (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client(id) on delete cascade,
  unit_id uuid not null references unit(id) on delete cascade,
  sector_id uuid not null references sector(id),
  location_id uuid references class_location(id),
  shift text not null,
  weekday smallint not null check (weekday between 1 and 5),
  time time not null
);
create table if not exists class_session (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client(id) on delete cascade,
  unit_id uuid not null references unit(id) on delete cascade,
  sector_id uuid references sector(id),
  location_id uuid references class_location(id),
  shift text not null,
  roteiro text,
  status text not null check (status in ('applied', 'cancelled')),
  cancelled_by text,
  cancellation_reason text,
  teacher_id uuid references app_user(id),
  representative_registration text,
  certificate text unique,
  latitude numeric(10, 6),
  longitude numeric(10, 6),
  accuracy numeric(10, 2),
  occurred_at timestamptz not null default now()
);
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_session(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  status text not null check (status in ('present', 'absent', 'missing')),
  method text,
  recorded_at timestamptz not null default now(),
  unique(session_id, person_id)
);
create table if not exists audit_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id),
  event text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists sync_queue (
  id bigserial primary key,
  user_id uuid references app_user(id),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
-- Instantâneo operacional usado pela primeira versão do PWA para manter
-- cadastros, aulas e indicadores consistentes entre dispositivos. As tabelas
-- normalizadas acima permanecem a base para a evolução transacional da API.
create table if not exists app_state (
  id smallint primary key check (id = 1),
  payload jsonb not null,
  updated_by uuid references app_user(id),
  updated_at timestamptz not null default now()
);

-- Compatibilidade para instalações criadas antes da centralização do PWA.
alter table app_user alter column client_ids type text[] using client_ids::text[];
