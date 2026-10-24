-- Leads signed in with email/password had a separate account from their Discord
-- account, so they saw different tickets depending on how they signed in. A lead can
-- now move their lead access and work onto their Discord account using the same
-- one-time merge token as guest sessions: the lead account issues the token (proving
-- it is theirs) and the Discord account redeems it after sign-in (proving that too).

-- Moves tickets, comments, and history between accounts. Callers must authorize.
create or replace function public.move_member_work(source uuid, target uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare moved integer;
begin
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
revoke execute on function public.move_member_work(uuid, uuid) from public, anon, authenticated;

create or replace function public.merge_member_accounts(source uuid, target uuid)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if source = target then return 0; end if;
  if not exists (select 1 from auth.users u where u.id = source and coalesce(u.is_anonymous, false)) then
    raise exception 'Only guest sessions can be merged';
  end if;
  if not exists (select 1 from auth.users u where u.id = target and not coalesce(u.is_anonymous, false)) then
    raise exception 'Guest work can only move to a signed-in account';
  end if;
  return public.move_member_work(source, target);
end; $$;

-- Moves lead access (keeping the higher role and every scope) plus work.
create or replace function public.merge_lead_account(source uuid, target uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare source_role public.lead_role; target_role public.lead_role; next_role public.lead_role;
begin
  if source = target then return 0; end if;
  select role into source_role from public.leads where user_id = source;
  if source_role is null then raise exception 'Only lead accounts can be moved'; end if;
  if not exists (select 1 from auth.users u where u.id = target and not coalesce(u.is_anonymous, false)) then
    raise exception 'Lead access can only move to a signed-in account';
  end if;
  select role into target_role from public.leads where user_id = target;
  next_role := case when 'administrator' in (source_role, target_role) then 'administrator'::public.lead_role else 'subteam_lead'::public.lead_role end;

  insert into public.leads (user_id, role) values (target, next_role)
  on conflict (user_id) do update set role = excluded.role;
  if next_role = 'subteam_lead' then
    insert into public.lead_scopes (user_id, subteam)
    select target, s.subteam from public.lead_scopes s where s.user_id = source
    on conflict do nothing;
  else
    delete from public.lead_scopes where user_id = target;
  end if;
  -- The target now holds the role, so this never removes the last administrator.
  delete from public.leads where user_id = source;
  update public.pending_lead_grants set created_by = target where created_by = source;
  return public.move_member_work(source, target);
end; $$;
revoke execute on function public.merge_lead_account(uuid, uuid) from public, anon, authenticated;

create or replace function public.create_account_merge()
returns uuid language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid(); new_token uuid;
begin
  if caller is null or not (
    exists (select 1 from auth.users u where u.id = caller and coalesce(u.is_anonymous, false))
    or exists (select 1 from public.leads l where l.user_id = caller)
  ) then
    raise exception 'Only guest sessions and lead accounts can be merged';
  end if;
  delete from public.account_merge_tokens where source_user = caller or expires_at < now();
  insert into public.account_merge_tokens (source_user) values (caller) returning token into new_token;
  return new_token;
end; $$;

create or replace function public.complete_account_merge(merge_token uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid(); source uuid;
begin
  if caller is null or exists (select 1 from auth.users u where u.id = caller and coalesce(u.is_anonymous, false)) then
    raise exception 'Sign in before merging a guest session';
  end if;
  delete from public.account_merge_tokens t where t.token = merge_token and t.expires_at > now() returning t.source_user into source;
  if source is null then raise exception 'This merge link has expired'; end if;
  if exists (select 1 from public.leads l where l.user_id = source) then
    return public.merge_lead_account(source, caller);
  end if;
  return public.merge_member_accounts(source, caller);
end; $$;
