-- Apply in the Supabase SQL editor or with `supabase db push` after linking the project.
create extension if not exists pgcrypto;

do $$ begin
  create type public.competition as enum ('URC', 'Lunabotics', 'Both');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.subteam as enum ('Mechanical', 'Electrical', 'Software', 'Science', 'General/Shared');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.ticket_status as enum ('Open', 'In Progress', 'Blocked', 'In Review', 'Done');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.ticket_priority as enum ('Low', 'Medium', 'High');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.lead_role as enum ('subteam_lead', 'administrator');
exception when duplicate_object then null; end $$;

create table if not exists public.member_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discord_username text not null check (char_length(discord_username) between 2 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.leads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.lead_role not null,
  created_at timestamptz not null default now()
);
create table if not exists public.lead_scopes (
  user_id uuid not null references public.leads(user_id) on delete cascade,
  subteam public.subteam not null,
  primary key (user_id, subteam)
);
create table if not exists public.tickets (
  id text primary key check (id ~ '^[A-Z]{2,4}-[0-9]{3,}$'),
  title text not null check (char_length(title) between 3 and 160),
  description text not null check (char_length(description) between 1 and 10000),
  completion_criteria jsonb not null default '[]'::jsonb,
  competition public.competition not null,
  primary_subteam public.subteam not null,
  status public.ticket_status not null default 'Open',
  priority public.ticket_priority not null default 'Medium',
  beginner_friendly boolean not null default false,
  estimated_effort text,
  due_date date,
  assignee_id uuid references auth.users(id) on delete set null,
  creator_id uuid not null references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(), ticket_id text not null references public.tickets(id) on delete cascade,
  author_id uuid not null references auth.users(id), body text not null check (char_length(body) between 1 and 5000), created_at timestamptz not null default now()
);
create table if not exists public.ticket_submissions (
  id uuid primary key default gen_random_uuid(), ticket_id text not null references public.tickets(id) on delete cascade,
  submitter_id uuid not null references auth.users(id), summary text not null check (char_length(summary) between 1 and 10000), links jsonb not null default '[]'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.ticket_activity (
  id bigint generated always as identity primary key, ticket_id text not null references public.tickets(id) on delete cascade,
  actor_id uuid not null references auth.users(id), action text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists tickets_status_idx on public.tickets(status);
create index if not exists tickets_competition_idx on public.tickets(competition);
create index if not exists tickets_assignee_idx on public.tickets(assignee_id);
create index if not exists activity_ticket_idx on public.ticket_activity(ticket_id, created_at desc);

create or replace function public.is_lead(required_subteam public.subteam default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.leads l where l.user_id = auth.uid() and (l.role = 'administrator' or required_subteam is null or exists (select 1 from public.lead_scopes s where s.user_id = l.user_id and s.subteam = required_subteam)));
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.leads where user_id = auth.uid() and role = 'administrator'); $$;

create or replace function public.claim_ticket(ticket_id text)
returns public.tickets language plpgsql security invoker set search_path = public as $$
declare claimed public.tickets;
begin
  update public.tickets set assignee_id = auth.uid(), status = 'In Progress', updated_at = now()
  where id = ticket_id and status = 'Open' and assignee_id is null and archived_at is null
  returning * into claimed;
  if claimed.id is null then raise exception 'Ticket is no longer available'; end if;
  insert into public.ticket_activity(ticket_id, actor_id, action) values (ticket_id, auth.uid(), 'claimed');
  return claimed;
end; $$;

create or replace function public.member_update_status(ticket_id text, next_status public.ticket_status, reason text default null)
returns public.tickets language plpgsql security invoker set search_path = public as $$
declare current_ticket public.tickets; changed public.tickets;
begin
  select * into current_ticket from public.tickets where id = ticket_id for update;
  if current_ticket.assignee_id <> auth.uid() then raise exception 'Only the assignee may update this ticket'; end if;
  if not ((current_ticket.status = 'In Progress' and next_status in ('Blocked','In Review')) or (current_ticket.status = 'Blocked' and next_status = 'In Progress')) then raise exception 'Status transition is not allowed'; end if;
  if next_status = 'Blocked' and coalesce(char_length(reason), 0) < 1 then raise exception 'Blocked status requires an explanation'; end if;
  update public.tickets set status = next_status, updated_at = now() where id = ticket_id returning * into changed;
  insert into public.ticket_activity(ticket_id, actor_id, action, details) values (ticket_id, auth.uid(), 'status_changed', jsonb_build_object('from', current_ticket.status, 'to', next_status, 'reason', reason));
  return changed;
end; $$;

alter table public.member_profiles enable row level security;
alter table public.leads enable row level security;
alter table public.lead_scopes enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_submissions enable row level security;
alter table public.ticket_activity enable row level security;
create policy "members read profiles" on public.member_profiles for select to authenticated using (true);
create policy "members manage own profile" on public.member_profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "authorized leads read leads" on public.leads for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admins manage leads" on public.leads for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authorized leads read scopes" on public.lead_scopes for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admins manage scopes" on public.lead_scopes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated members read active tickets" on public.tickets for select to authenticated using (archived_at is null);
create policy "leads create tickets in scope" on public.tickets for insert to authenticated with check (creator_id = auth.uid() and public.is_lead(primary_subteam));
create policy "leads update tickets in scope" on public.tickets for update to authenticated using (public.is_lead(primary_subteam)) with check (public.is_lead(primary_subteam));
create policy "members read comments" on public.ticket_comments for select to authenticated using (true);
create policy "members post comments" on public.ticket_comments for insert to authenticated with check (author_id = auth.uid());
create policy "members read submissions" on public.ticket_submissions for select to authenticated using (true);
create policy "assignees submit work" on public.ticket_submissions for insert to authenticated with check (submitter_id = auth.uid() and exists (select 1 from public.tickets t where t.id = ticket_id and t.assignee_id = auth.uid()));
create policy "members read activity" on public.ticket_activity for select to authenticated using (true);
revoke update(status, assignee_id) on public.tickets from authenticated;
