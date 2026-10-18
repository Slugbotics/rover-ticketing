-- Recover members' pre-Discord work no matter which device they sign in on.
--
-- 1. claim_guest_sessions(): run after every Discord sign-in. Guest (anonymous)
--    sessions whose typed name equals the caller's Discord username are merged
--    into the caller. The username comes from auth.identities (written by the
--    Discord provider), never from user_metadata, which users can edit. Display
--    names are not used because anyone can set them; usernames are unique.
-- 2. Admin tools for guests whose typed name does not match: list guest sessions
--    that still hold work, list signed-in members, and merge one into another.
--
-- All merges go through merge_member_accounts, which is not callable by clients.

create or replace function public.merge_member_accounts(source uuid, target uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare moved integer;
begin
  if source = target then return 0; end if;
  if not exists (select 1 from auth.users u where u.id = source and coalesce(u.is_anonymous, false)) then
    raise exception 'Only guest sessions can be merged';
  end if;
  if not exists (select 1 from auth.users u where u.id = target and not coalesce(u.is_anonymous, false)) then
    raise exception 'Guest work can only move to a signed-in account';
  end if;
  -- Drop duplicate memberships first so the primary key holds.
  delete from public.ticket_participants p where p.user_id = source
    and exists (select 1 from public.ticket_participants q where q.ticket_id = p.ticket_id and q.user_id = target);
  update public.ticket_participants set user_id = target where user_id = source;
  get diagnostics moved = row_count;
  update public.ticket_comments set author_id = target where author_id = source;
  update public.ticket_activity set actor_id = target where actor_id = source;
  update public.ticket_submissions set submitter_id = target where submitter_id = source;
  update public.tickets set creator_id = target where creator_id = source;
  update public.tickets set assignee_id = target where assignee_id = source;
  delete from public.member_profiles where user_id = source;
  return moved;
end; $$;
revoke execute on function public.merge_member_accounts(uuid, uuid) from public, anon, authenticated;

-- Same behavior as before, now sharing the merge steps.
create or replace function public.complete_account_merge(merge_token uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid(); source uuid;
begin
  if caller is null or exists (select 1 from auth.users u where u.id = caller and coalesce(u.is_anonymous, false)) then
    raise exception 'Sign in before merging a guest session';
  end if;
  delete from public.account_merge_tokens t where t.token = merge_token and t.expires_at > now() returning t.source_user into source;
  if source is null then raise exception 'This merge link has expired'; end if;
  return public.merge_member_accounts(source, caller);
end; $$;

-- Normalizes a typed or Discord name for comparison: trimmed, lowercase, no leading @.
create or replace function public.normalize_member_name(raw text)
returns text language sql immutable as $$ select nullif(lower(ltrim(btrim(coalesce(raw, '')), '@')), '') $$;

-- Returns how many tickets moved to the caller.
create or replace function public.claim_guest_sessions()
returns integer language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid(); handle text; guest record; moved integer := 0;
begin
  if caller is null then return 0; end if;
  -- full_name is the Discord username; name is "username#0" (or username#1234 for legacy tags).
  select public.normalize_member_name(coalesce(i.identity_data->>'full_name', regexp_replace(i.identity_data->>'name', '#0$', '')))
    into handle
  from auth.identities i where i.user_id = caller and i.provider = 'discord' limit 1;
  if handle is null then return 0; end if;
  for guest in
    select u.id from auth.users u join public.member_profiles p on p.user_id = u.id
    where coalesce(u.is_anonymous, false) and public.normalize_member_name(p.discord_username) = handle
  loop
    moved := moved + public.merge_member_accounts(guest.id, caller);
  end loop;
  return moved;
end; $$;

create or replace function public.admin_list_guest_sessions()
returns table (user_id uuid, typed_name text, ticket_count bigint, comment_count bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only administrators can view guest sessions'; end if;
  return query
  select u.id, p.discord_username,
         (select count(*) from public.ticket_participants tp where tp.user_id = u.id),
         (select count(*) from public.ticket_comments c where c.author_id = u.id),
         u.created_at
  from auth.users u left join public.member_profiles p on p.user_id = u.id
  where coalesce(u.is_anonymous, false)
    and (exists (select 1 from public.ticket_participants tp where tp.user_id = u.id)
         or exists (select 1 from public.ticket_comments c where c.author_id = u.id))
  order by p.discord_username nulls last, u.created_at;
end; $$;

create or replace function public.admin_list_member_accounts()
returns table (user_id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only administrators can view members'; end if;
  return query
  select u.id, p.discord_username
  from auth.users u join public.member_profiles p on p.user_id = u.id
  where not coalesce(u.is_anonymous, false)
  order by lower(p.discord_username);
end; $$;

create or replace function public.admin_merge_guest(guest_user uuid, member_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only administrators can merge guest sessions'; end if;
  return public.merge_member_accounts(guest_user, member_user);
end; $$;

revoke execute on function public.claim_guest_sessions() from public, anon;
revoke execute on function public.admin_list_guest_sessions() from public, anon;
revoke execute on function public.admin_list_member_accounts() from public, anon;
revoke execute on function public.admin_merge_guest(uuid, uuid) from public, anon;
grant execute on function public.claim_guest_sessions() to authenticated;
grant execute on function public.admin_list_guest_sessions() to authenticated;
grant execute on function public.admin_list_member_accounts() to authenticated;
grant execute on function public.admin_merge_guest(uuid, uuid) to authenticated;
