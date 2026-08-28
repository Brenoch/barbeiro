create extension if not exists pg_cron;

alter table public.appointments
  add column auto_completed_at timestamptz;

create or replace function private.auto_complete_started_appointments()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_count integer;
begin
  update public.appointments
  set
    status = 'completed',
    payment_status = 'paid',
    paid_at = coalesce(paid_at, now()),
    auto_completed_at = now(),
    updated_at = now()
  where status in ('pending', 'confirmed')
    and starts_at <= now();

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke execute on function private.auto_complete_started_appointments() from public, anon, authenticated;
grant execute on function private.auto_complete_started_appointments() to service_role;

select cron.schedule(
  'auto-complete-started-appointments',
  '* * * * *',
  $job$select private.auto_complete_started_appointments();$job$
);

comment on function private.auto_complete_started_appointments() is
  'Conclui e marca como pagos os agendamentos cujo horário de início já chegou.';
