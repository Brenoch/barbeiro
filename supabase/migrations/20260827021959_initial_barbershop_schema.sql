create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 100),
  neighborhood text,
  timezone text not null default 'America/Sao_Paulo',
  phone text,
  whatsapp text,
  instagram text,
  address_line text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 100),
  description text not null default '',
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, slug),
  unique (id, shop_id)
);

create table public.barbers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 2 and 100),
  specialty text not null default '',
  commission_bps integer not null default 5000 check (commission_bps between 0 and 10000),
  photo_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, slug),
  unique (id, shop_id)
);

create table public.barber_services (
  shop_id uuid not null references public.shops(id) on delete cascade,
  barber_id uuid not null,
  service_id uuid not null,
  custom_price_cents integer check (custom_price_cents >= 0),
  custom_duration_minutes integer check (custom_duration_minutes between 5 and 480),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (barber_id, service_id),
  foreign key (barber_id, shop_id) references public.barbers(id, shop_id) on delete cascade,
  foreign key (service_id, shop_id) references public.services(id, shop_id) on delete cascade
);

create table public.weekly_availability (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  barber_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  enabled boolean not null default false,
  start_time time not null default '09:00',
  end_time time not null default '18:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (barber_id, weekday),
  foreign key (barber_id, shop_id) references public.barbers(id, shop_id) on delete cascade,
  check (end_time > start_time)
);

create table public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  barber_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  label text not null default 'Indisponível' check (char_length(label) between 1 and 80),
  created_at timestamptz not null default now(),
  foreign key (barber_id, shop_id) references public.barbers(id, shop_id) on delete cascade,
  check (ends_at > starts_at)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  phone text not null,
  phone_normalized text not null check (phone_normalized ~ '^[0-9]{10,15}$'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, phone_normalized),
  unique (id, shop_id)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null,
  barber_id uuid not null,
  service_id uuid not null,
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  customer_phone text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  source text not null default 'website' check (source in ('website', 'whatsapp', 'walk_in', 'admin')),
  price_cents integer not null check (price_cents >= 0),
  commission_bps integer not null check (commission_bps between 0 and 10000),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'refunded')),
  payment_method text check (payment_method in ('pix', 'cash', 'debit_card', 'credit_card')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, shop_id),
  foreign key (customer_id, shop_id) references public.customers(id, shop_id) on delete restrict,
  foreign key (barber_id, shop_id) references public.barbers(id, shop_id) on delete restrict,
  foreign key (service_id, shop_id) references public.services(id, shop_id) on delete restrict,
  check (ends_at > starts_at),
  check ((payment_status = 'paid') = (paid_at is not null))
);

alter table public.appointments
  add constraint appointments_no_barber_overlap
  exclude using gist (
    barber_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'));

create index appointments_shop_starts_at_idx on public.appointments (shop_id, starts_at);
create index appointments_customer_starts_at_idx on public.appointments (customer_id, starts_at desc);
create index appointments_barber_starts_at_idx on public.appointments (barber_id, starts_at);
create index schedule_blocks_barber_starts_at_idx on public.schedule_blocks (barber_id, starts_at);
create index services_shop_active_sort_idx on public.services (shop_id, active, sort_order);
create index barbers_shop_active_sort_idx on public.barbers (shop_id, active, sort_order);

create trigger shops_set_updated_at
before update on public.shops
for each row execute function private.set_updated_at();

create trigger services_set_updated_at
before update on public.services
for each row execute function private.set_updated_at();

create trigger barbers_set_updated_at
before update on public.barbers
for each row execute function private.set_updated_at();

create trigger weekly_availability_set_updated_at
before update on public.weekly_availability
for each row execute function private.set_updated_at();

create trigger customers_set_updated_at
before update on public.customers
for each row execute function private.set_updated_at();

create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function private.set_updated_at();

alter table public.shops enable row level security;
alter table public.services enable row level security;
alter table public.barbers enable row level security;
alter table public.barber_services enable row level security;
alter table public.weekly_availability enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;

revoke all on table public.shops, public.services, public.barbers, public.barber_services,
  public.weekly_availability, public.schedule_blocks, public.customers, public.appointments
  from anon, authenticated;

grant select on table public.shops, public.services, public.barbers, public.barber_services,
  public.weekly_availability, public.schedule_blocks
  to anon, authenticated;

grant all privileges on table public.shops, public.services, public.barbers, public.barber_services,
  public.weekly_availability, public.schedule_blocks, public.customers, public.appointments
  to service_role;

create policy shops_public_read
on public.shops for select
to anon, authenticated
using (active);

create policy services_public_read
on public.services for select
to anon, authenticated
using (
  active and exists (
    select 1 from public.shops
    where shops.id = services.shop_id and shops.active
  )
);

create policy barbers_public_read
on public.barbers for select
to anon, authenticated
using (
  active and exists (
    select 1 from public.shops
    where shops.id = barbers.shop_id and shops.active
  )
);

create policy barber_services_public_read
on public.barber_services for select
to anon, authenticated
using (
  active
  and exists (select 1 from public.barbers where barbers.id = barber_services.barber_id and barbers.active)
  and exists (select 1 from public.services where services.id = barber_services.service_id and services.active)
);

create policy weekly_availability_public_read
on public.weekly_availability for select
to anon, authenticated
using (
  exists (select 1 from public.barbers where barbers.id = weekly_availability.barber_id and barbers.active)
);

create policy schedule_blocks_public_read
on public.schedule_blocks for select
to anon, authenticated
using (
  ends_at >= now()
  and exists (select 1 from public.barbers where barbers.id = schedule_blocks.barber_id and barbers.active)
);

with inserted_shop as (
  insert into public.shops (slug, name, neighborhood, timezone, instagram, address_line)
  values (
    'bart-do-corte',
    'Bart do Corte',
    'Campo Grande · RJ',
    'America/Sao_Paulo',
    '@bartdocorte',
    'Estrada do Cabuçu, 1511 — Campo Grande, Rio de Janeiro'
  )
  returning id
)
insert into public.services (shop_id, slug, name, description, duration_minutes, price_cents, sort_order)
select inserted_shop.id, service.slug, service.name, service.description, service.duration_minutes, service.price_cents, service.sort_order
from inserted_shop
cross join (
  values
    ('corte', 'Corte', 'Clássico, social ou fade', 40, 3500, 1),
    ('barba', 'Barba', 'Contorno e acabamento', 30, 2500, 2),
    ('corte-barba', 'Corte + barba', 'Experiência completa', 60, 5500, 3),
    ('corte-infantil', 'Corte infantil', 'Para os pequenos', 35, 3000, 4)
) as service(slug, name, description, duration_minutes, price_cents, sort_order);

insert into public.barbers (shop_id, slug, display_name, specialty, commission_bps, sort_order)
select shops.id, barber.slug, barber.display_name, barber.specialty, 5000, barber.sort_order
from public.shops
cross join (
  values
    ('bart', 'Bart', 'Clássicos e barba', 1),
    ('vt', 'VT', 'Fade e navalhado', 2)
) as barber(slug, display_name, specialty, sort_order)
where shops.slug = 'bart-do-corte';

insert into public.barber_services (shop_id, barber_id, service_id)
select barbers.shop_id, barbers.id, services.id
from public.barbers
join public.services on services.shop_id = barbers.shop_id
where barbers.active and services.active;

insert into public.weekly_availability (shop_id, barber_id, weekday, enabled, start_time, end_time)
select
  barbers.shop_id,
  barbers.id,
  weekdays.weekday,
  case
    when barbers.slug = 'bart' then weekdays.weekday = 1
    when barbers.slug = 'vt' then weekdays.weekday between 2 and 6
    else false
  end,
  case when barbers.slug = 'bart' then '10:00'::time else '09:00'::time end,
  case when barbers.slug = 'bart' then '21:00'::time else '18:00'::time end
from public.barbers
cross join generate_series(0, 6) as weekdays(weekday)
where barbers.shop_id = (select id from public.shops where slug = 'bart-do-corte');

comment on table public.customers is 'Dados pessoais. Sem acesso direto para anon ou authenticated até a autenticação ser definida.';
comment on table public.appointments is 'Agendamentos privados. Criar por backend ou Edge Function usando service_role; nunca expor a chave secreta no navegador.';
comment on column public.barbers.auth_user_id is 'Preparado para vincular o barbeiro ao Supabase Auth futuramente.';
