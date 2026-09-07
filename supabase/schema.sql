-- Pointline's small-room schema.
-- Run this once in the Supabase SQL Editor, then copy the project URL and
-- publishable key into ../supabase-config.js.

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  pi_label text not null default 'PI 24',
  sequence_key text not null default 'fibonacci' check (sequence_key in ('sequential', 'fibonacci', 'modified')),
  selected_story_key text,
  vote_mode text not null default 'hidden' check (vote_mode in ('hidden', 'open')),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'observer')),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.domains (
  room_id uuid not null references public.rooms(id) on delete cascade,
  id text not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (room_id, id)
);

create table if not exists public.services (
  room_id uuid not null references public.rooms(id) on delete cascade,
  id text not null,
  domain_id text,
  name text not null check (char_length(trim(name)) between 1 and 80),
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (room_id, id),
  foreign key (room_id, domain_id) references public.domains(room_id, id) on delete set null
);

create table if not exists public.stories (
  room_id uuid not null references public.rooms(id) on delete cascade,
  story_key text not null,
  type text not null default 'Feature',
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '',
  acceptance text[] not null default '{}',
  sort_order integer not null default 0,
  manual_estimate numeric(8,2),
  ai_estimate numeric(8,2),
  ai_enabled boolean not null default false,
  saved boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (room_id, story_key),
  check (manual_estimate is null or manual_estimate >= 0),
  check (ai_estimate is null or ai_estimate >= 0)
);

create table if not exists public.story_service_allocations (
  room_id uuid not null,
  story_key text not null,
  service_id text not null,
  allocation_pct numeric(5,2) not null check (allocation_pct between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (room_id, story_key, service_id),
  foreign key (room_id, story_key) references public.stories(room_id, story_key) on delete cascade,
  foreign key (room_id, service_id) references public.services(room_id, id) on delete restrict
);

create table if not exists public.planning_rounds (
  room_id uuid not null,
  story_key text not null,
  round_number integer not null check (round_number > 0),
  phase text not null default 'idle' check (phase in ('idle', 'voting', 'revealed')),
  mode text not null default 'hidden' check (mode in ('hidden', 'open')),
  submitted_count integer not null default 0 check (submitted_count >= 0),
  revealed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (room_id, story_key, round_number),
  foreign key (room_id, story_key) references public.stories(room_id, story_key) on delete cascade
);

create table if not exists public.votes (
  room_id uuid not null,
  story_key text not null,
  round_number integer not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  manual_estimate numeric(8,2),
  ai_estimate numeric(8,2),
  ai_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (room_id, story_key, round_number, user_id),
  foreign key (room_id, story_key, round_number) references public.planning_rounds(room_id, story_key, round_number) on delete cascade,
  check (manual_estimate is null or manual_estimate >= 0),
  check (ai_estimate is null or ai_estimate >= 0)
);

create index if not exists room_members_user_idx on public.room_members(user_id, room_id);
create index if not exists stories_room_order_idx on public.stories(room_id, sort_order);
create index if not exists votes_round_idx on public.votes(room_id, story_key, round_number);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.room_members
      where room_id = target_room_id
        and user_id = (select auth.uid())
    );
$$;

create or replace function private.is_room_editor(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.room_members
      where room_id = target_room_id
        and user_id = (select auth.uid())
        and role in ('owner', 'editor')
    );
$$;

create or replace function private.is_room_owner(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.room_members
      where room_id = target_room_id
        and user_id = (select auth.uid())
        and role = 'owner'
    );
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.prevent_room_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Room ownership cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function private.refresh_round_vote_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.planning_rounds
  set submitted_count = (
    select count(*)
    from public.votes
    where room_id = coalesce(new.room_id, old.room_id)
      and story_key = coalesce(new.story_key, old.story_key)
      and round_number = coalesce(new.round_number, old.round_number)
  )
  where room_id = coalesce(new.room_id, old.room_id)
    and story_key = coalesce(new.story_key, old.story_key)
    and round_number = coalesce(new.round_number, old.round_number);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at before update on public.rooms for each row execute function private.set_updated_at();
drop trigger if exists rooms_owner_guard on public.rooms;
create trigger rooms_owner_guard before update on public.rooms for each row execute function private.prevent_room_owner_change();
drop trigger if exists domains_set_updated_at on public.domains;
create trigger domains_set_updated_at before update on public.domains for each row execute function private.set_updated_at();
drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services for each row execute function private.set_updated_at();
drop trigger if exists stories_set_updated_at on public.stories;
create trigger stories_set_updated_at before update on public.stories for each row execute function private.set_updated_at();
drop trigger if exists allocations_set_updated_at on public.story_service_allocations;
create trigger allocations_set_updated_at before update on public.story_service_allocations for each row execute function private.set_updated_at();
drop trigger if exists rounds_set_updated_at on public.planning_rounds;
create trigger rounds_set_updated_at before update on public.planning_rounds for each row execute function private.set_updated_at();
drop trigger if exists votes_set_updated_at on public.votes;
create trigger votes_set_updated_at before update on public.votes for each row execute function private.set_updated_at();
drop trigger if exists votes_refresh_round_count on public.votes;
create trigger votes_refresh_round_count after insert or update or delete on public.votes for each row execute function private.refresh_round_vote_count();

revoke all on function private.is_room_member(uuid) from public;
revoke all on function private.is_room_editor(uuid) from public;
revoke all on function private.is_room_owner(uuid) from public;
revoke all on function private.set_updated_at() from public;
revoke all on function private.prevent_room_owner_change() from public;
revoke all on function private.refresh_round_vote_count() from public;
grant execute on function private.is_room_member(uuid) to authenticated;
grant execute on function private.is_room_editor(uuid) to authenticated;
grant execute on function private.is_room_owner(uuid) to authenticated;

-- Creating a room also creates the first owner membership atomically. It is
-- intentionally the only public write path for a new room.
create or replace function public.create_room(p_name text, p_pi_label text, p_sequence_key text)
returns table(id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_room_id uuid;
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_sequence_key not in ('sequential', 'fibonacci', 'modified') then raise exception 'Unsupported point sequence'; end if;

  insert into public.rooms (name, pi_label, sequence_key, owner_id)
  values (left(trim(p_name), 120), left(trim(p_pi_label), 40), p_sequence_key, actor_id)
  returning rooms.id into new_room_id;

  insert into public.room_members (room_id, user_id, role)
  values (new_room_id, actor_id, 'owner');

  return query select new_room_id;
end;
$$;

revoke all on function public.create_room(text, text, text) from public;
grant execute on function public.create_room(text, text, text) to authenticated;

-- A share link carries the room UUID. Treat that UUID as the room invite for
-- this lightweight internal tool and add the signed-in user as an editor.
create or replace function public.join_room(p_room_id uuid)
returns table(id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  insert into public.room_members (room_id, user_id, role)
  select p_room_id, actor_id, 'editor'
  where exists (select 1 from public.rooms where rooms.id = p_room_id)
  on conflict (room_id, user_id) do nothing;
  return query select p_room_id where exists (select 1 from public.rooms where rooms.id = p_room_id);
end;
$$;

revoke all on function public.join_room(uuid) from public;
grant execute on function public.join_room(uuid) to authenticated;

grant select, update on public.rooms to authenticated;
grant select, insert, update, delete on public.room_members to authenticated;
grant select, insert, update, delete on public.domains to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.stories to authenticated;
grant select, insert, update, delete on public.story_service_allocations to authenticated;
grant select, insert, update, delete on public.planning_rounds to authenticated;
grant select, insert, update, delete on public.votes to authenticated;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.domains enable row level security;
alter table public.services enable row level security;
alter table public.stories enable row level security;
alter table public.story_service_allocations enable row level security;
alter table public.planning_rounds enable row level security;
alter table public.votes enable row level security;

drop policy if exists rooms_member_select on public.rooms;
create policy rooms_member_select on public.rooms for select to authenticated using (private.is_room_member(id));
drop policy if exists rooms_owner_update on public.rooms;
drop policy if exists rooms_editor_update on public.rooms;
create policy rooms_editor_update on public.rooms for update to authenticated using (private.is_room_editor(id)) with check (private.is_room_editor(id));

drop policy if exists members_member_select on public.room_members;
create policy members_member_select on public.room_members for select to authenticated using (private.is_room_member(room_id));
drop policy if exists members_owner_insert on public.room_members;
create policy members_owner_insert on public.room_members for insert to authenticated with check (private.is_room_owner(room_id));
drop policy if exists members_owner_update on public.room_members;
create policy members_owner_update on public.room_members for update to authenticated using (private.is_room_owner(room_id)) with check (private.is_room_owner(room_id));
drop policy if exists members_owner_delete on public.room_members;
create policy members_owner_delete on public.room_members for delete to authenticated using (private.is_room_owner(room_id));

drop policy if exists domains_member_select on public.domains;
create policy domains_member_select on public.domains for select to authenticated using (private.is_room_member(room_id));
drop policy if exists domains_editor_insert on public.domains;
create policy domains_editor_insert on public.domains for insert to authenticated with check (private.is_room_editor(room_id));
drop policy if exists domains_editor_update on public.domains;
create policy domains_editor_update on public.domains for update to authenticated using (private.is_room_editor(room_id)) with check (private.is_room_editor(room_id));
drop policy if exists domains_editor_delete on public.domains;
create policy domains_editor_delete on public.domains for delete to authenticated using (private.is_room_editor(room_id));

drop policy if exists services_member_select on public.services;
create policy services_member_select on public.services for select to authenticated using (private.is_room_member(room_id));
drop policy if exists services_editor_insert on public.services;
create policy services_editor_insert on public.services for insert to authenticated with check (private.is_room_editor(room_id));
drop policy if exists services_editor_update on public.services;
create policy services_editor_update on public.services for update to authenticated using (private.is_room_editor(room_id)) with check (private.is_room_editor(room_id));
drop policy if exists services_editor_delete on public.services;
create policy services_editor_delete on public.services for delete to authenticated using (private.is_room_editor(room_id));

drop policy if exists stories_member_select on public.stories;
create policy stories_member_select on public.stories for select to authenticated using (private.is_room_member(room_id));
drop policy if exists stories_editor_insert on public.stories;
create policy stories_editor_insert on public.stories for insert to authenticated with check (private.is_room_editor(room_id));
drop policy if exists stories_editor_update on public.stories;
create policy stories_editor_update on public.stories for update to authenticated using (private.is_room_editor(room_id)) with check (private.is_room_editor(room_id));
drop policy if exists stories_editor_delete on public.stories;
create policy stories_editor_delete on public.stories for delete to authenticated using (private.is_room_editor(room_id));

drop policy if exists allocations_member_select on public.story_service_allocations;
create policy allocations_member_select on public.story_service_allocations for select to authenticated using (private.is_room_member(room_id));
drop policy if exists allocations_editor_insert on public.story_service_allocations;
create policy allocations_editor_insert on public.story_service_allocations for insert to authenticated with check (private.is_room_editor(room_id));
drop policy if exists allocations_editor_update on public.story_service_allocations;
create policy allocations_editor_update on public.story_service_allocations for update to authenticated using (private.is_room_editor(room_id)) with check (private.is_room_editor(room_id));
drop policy if exists allocations_editor_delete on public.story_service_allocations;
create policy allocations_editor_delete on public.story_service_allocations for delete to authenticated using (private.is_room_editor(room_id));

drop policy if exists rounds_member_select on public.planning_rounds;
create policy rounds_member_select on public.planning_rounds for select to authenticated using (private.is_room_member(room_id));
drop policy if exists rounds_editor_insert on public.planning_rounds;
create policy rounds_editor_insert on public.planning_rounds for insert to authenticated with check (private.is_room_editor(room_id));
drop policy if exists rounds_owner_update on public.planning_rounds;
drop policy if exists rounds_editor_update on public.planning_rounds;
create policy rounds_editor_update on public.planning_rounds for update to authenticated using (private.is_room_editor(room_id)) with check (private.is_room_editor(room_id));
drop policy if exists rounds_owner_delete on public.planning_rounds;
drop policy if exists rounds_editor_delete on public.planning_rounds;
create policy rounds_editor_delete on public.planning_rounds for delete to authenticated using (private.is_room_editor(room_id));

-- Before reveal, a member can only read their own vote. Open mode and the
-- revealed phase intentionally allow the room to compare raw cards.
drop policy if exists votes_member_select on public.votes;
create policy votes_member_select on public.votes for select to authenticated using (
  private.is_room_member(room_id)
  and (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.planning_rounds round
      where round.room_id = votes.room_id
        and round.story_key = votes.story_key
        and round.round_number = votes.round_number
        and round.phase = 'revealed'
    )
    or exists (
      select 1
      from public.planning_rounds round
      where round.room_id = votes.room_id
        and round.story_key = votes.story_key
        and round.round_number = votes.round_number
        and round.mode = 'open'
    )
  )
);
drop policy if exists votes_member_insert on public.votes;
create policy votes_member_insert on public.votes for insert to authenticated with check (
  private.is_room_member(room_id)
  and user_id = (select auth.uid())
  and exists (
    select 1 from public.planning_rounds round
    where round.room_id = votes.room_id
      and round.story_key = votes.story_key
      and round.round_number = votes.round_number
      and round.phase = 'voting'
  )
);
drop policy if exists votes_member_update on public.votes;
create policy votes_member_update on public.votes for update to authenticated using (
  private.is_room_member(room_id) and user_id = (select auth.uid())
) with check (
  private.is_room_member(room_id) and user_id = (select auth.uid())
  and exists (
    select 1 from public.planning_rounds round
    where round.room_id = votes.room_id
      and round.story_key = votes.story_key
      and round.round_number = votes.round_number
      and round.phase = 'voting'
  )
);
drop policy if exists votes_member_delete on public.votes;
create policy votes_member_delete on public.votes for delete to authenticated using (private.is_room_editor(room_id));

-- Realtime is optional; if enabled for the project, these tables provide live
-- room/story/resource/round refreshes. Votes are deliberately not subscribed.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms') then alter publication supabase_realtime add table public.rooms; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stories') then alter publication supabase_realtime add table public.stories; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'domains') then alter publication supabase_realtime add table public.domains; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'services') then alter publication supabase_realtime add table public.services; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planning_rounds') then alter publication supabase_realtime add table public.planning_rounds; end if;
end;
$$;
