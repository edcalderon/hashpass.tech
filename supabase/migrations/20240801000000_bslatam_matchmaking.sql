-- BSLatam 2025 Matchmaking schema (Supabase/Postgres)
-- Tables: bsl_speakers, BSL_Bookings, BSL_Tickets

create table if not exists public.bsl_speakers (
  id text primary key,
  name text not null,
  title text,
  linkedin text,
  bio text,
  imageUrl text,
  tags text[] default '{}',
  availability jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.BSL_Tickets (
  ticketId text primary key,
  userId uuid,
  verified boolean default false,
  used boolean default false,
  issuedAt timestamptz default now(),
  verifiedAt timestamptz,
  constraint fk_user foreign key (userId) references auth.users(id) on delete set null
);

do $$ begin
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum ('requested','accepted','rejected','cancelled');
  end if;
exception when duplicate_object then null; end $$;

create table if not exists public.BSL_Bookings (
  id uuid primary key default gen_random_uuid(),
  speakerId text not null references public.bsl_speakers(id) on delete cascade,
  attendeeId uuid references auth.users(id) on delete set null,
  start timestamptz not null,
  "end" timestamptz not null,
  status public.booking_status not null default 'requested',
  createdAt timestamptz default now(),
  unique (speakerId, start)
);

-- Basic RLS (optional simple policies; adjust if RLS is enabled)
alter table public.bsl_speakers enable row level security;
alter table public.BSL_Tickets enable row level security;
alter table public.BSL_Bookings enable row level security;

-- Speakers readable by all
do $$ begin
  create policy speakers_select on public.bsl_speakers for select using (true);
exception when duplicate_object then null; end $$;

-- Tickets: user can select own ticket rows
do $$ begin
  create policy tickets_select on public.BSL_Tickets for select using (auth.uid() = userId);
exception when duplicate_object then null; end $$;

-- Bookings: owner or speaker can see; everyone can insert requested if verified
do $$ begin
  create policy bookings_select on public.BSL_Bookings for select using (
    attendeeId = auth.uid() or exists (
      select 1 from public.bsl_speakers s where s.id = BSL_Bookings.speakerId
    )
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy bookings_insert on public.BSL_Bookings for insert with check (
    exists (
      select 1 from public.BSL_Tickets t where t.userId = auth.uid() and t.verified = true
    )
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy bookings_update on public.BSL_Bookings for update using (
    attendeeId = auth.uid() or (
      coalesce(current_setting('request.jwt.claims', true), '') <> '' and
      (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
    )
  );
exception when duplicate_object then null; end $$;


