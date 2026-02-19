create table if not exists public.BSL_Audit (
  id bigserial primary key,
  event text not null,
  ref_id text,
  actor uuid,
  metadata jsonb,
  created_at timestamptz default now()
);

alter table public.BSL_Audit enable row level security;
do $$ begin
  create policy audit_select on public.BSL_Audit for select using (true);
exception when duplicate_object then null; end $$;


