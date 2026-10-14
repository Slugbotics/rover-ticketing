-- Pre-authorize leads by email before their account exists. A pending grant is applied
-- automatically once an account with that email has a CONFIRMED email address (accepted
-- invite or admin-confirmed user), so an unconfirmed sign-up cannot claim lead access.

create table if not exists public.pending_lead_grants (
  email text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  role public.lead_role not null,
  scopes public.subteam[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- No policies: only the admin functions and the auth trigger below touch this table.
alter table public.pending_lead_grants enable row level security;

-- Shared by the admin function and the trigger. Caller must already be authorized.
create or replace function public.apply_lead_grant(target uuid, grant_role public.lead_role, grant_scopes public.subteam[])
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.leads (user_id, role) values (target, grant_role)
  on conflict (user_id) do update set role = excluded.role;
  delete from public.lead_scopes s where s.user_id = target;
  if grant_role = 'subteam_lead' then
    insert into public.lead_scopes (user_id, subteam)
    select target, scope from unnest(grant_scopes) as scope group by scope;
  end if;
end; $$;
revoke execute on function public.apply_lead_grant(uuid, public.lead_role, public.subteam[]) from public, anon, authenticated;

-- Returns the user id when applied immediately, or null when saved as pending.
create or replace function public.admin_grant_lead(lead_email text, lead_role public.lead_role, lead_scopes public.subteam[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare target uuid; current_role_value public.lead_role; clean_email text := lower(btrim(lead_email));
begin
  if not public.is_admin() then raise exception 'Only administrators can manage leads'; end if;
  if clean_email is null or position('@' in clean_email) < 2 then raise exception 'Enter a valid email address'; end if;
  if lead_role = 'subteam_lead' and coalesce(cardinality(lead_scopes), 0) = 0 then
    raise exception 'Subteam leads need at least one subteam';
  end if;
  select u.id into target from auth.users u
  where lower(u.email) = clean_email and coalesce(u.is_anonymous, false) = false and u.email_confirmed_at is not null;

  if target is null then
    insert into public.pending_lead_grants (email, role, scopes, created_by)
    values (clean_email, lead_role, case when lead_role = 'subteam_lead' then lead_scopes else '{}' end, auth.uid())
    on conflict (email) do update set role = excluded.role, scopes = excluded.scopes, created_by = excluded.created_by, created_at = now();
    return null;
  end if;

  select l.role into current_role_value from public.leads l where l.user_id = target for update;
  if current_role_value = 'administrator' and lead_role <> 'administrator'
     and (select count(*) from public.leads where role = 'administrator') <= 1 then
    raise exception 'Cannot demote the last administrator';
  end if;
  perform public.apply_lead_grant(target, lead_role, lead_scopes);
  delete from public.pending_lead_grants p where p.email = clean_email;
  return target;
end; $$;

create or replace function public.admin_list_pending_leads()
returns table (email text, role public.lead_role, scopes public.subteam[], created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only administrators can manage leads'; end if;
  return query select p.email, p.role, p.scopes, p.created_at from public.pending_lead_grants p order by p.created_at;
end; $$;

create or replace function public.admin_cancel_pending_lead(lead_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only administrators can manage leads'; end if;
  delete from public.pending_lead_grants p where p.email = lower(btrim(lead_email));
end; $$;

-- Applies a pending grant when an account's email becomes confirmed. Failures are
-- logged and swallowed so a grant problem can never block someone from signing in.
create or replace function public.apply_pending_lead_grant()
returns trigger language plpgsql security definer set search_path = public as $$
declare pending public.pending_lead_grants;
begin
  if new.email is null or new.email_confirmed_at is null or coalesce(new.is_anonymous, false) then return new; end if;
  select * into pending from public.pending_lead_grants p where p.email = lower(new.email);
  if pending.email is null then return new; end if;
  begin
    perform public.apply_lead_grant(new.id, pending.role, pending.scopes);
    delete from public.pending_lead_grants p where p.email = pending.email;
  exception when others then
    raise warning 'Pending lead grant for % was not applied: %', pending.email, sqlerrm;
  end;
  return new;
end; $$;
revoke execute on function public.apply_pending_lead_grant() from public, anon, authenticated;

drop trigger if exists apply_pending_lead_grant on auth.users;
create trigger apply_pending_lead_grant
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.apply_pending_lead_grant();

revoke execute on function public.admin_list_pending_leads() from public, anon;
revoke execute on function public.admin_cancel_pending_lead(text) from public, anon;
grant execute on function public.admin_list_pending_leads() to authenticated;
grant execute on function public.admin_cancel_pending_lead(text) to authenticated;

