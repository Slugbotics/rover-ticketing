-- Admin-managed lead access from the app. Accounts are still created in the Supabase
-- dashboard (Authentication > Users); these functions only grant, change, or revoke
-- lead access for existing non-anonymous accounts. Every function requires the caller
-- to be an administrator and refuses to remove the last administrator.

create or replace function public.admin_list_leads()
returns table (user_id uuid, email text, role public.lead_role, scopes public.subteam[], created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only administrators can manage leads'; end if;
  return query
    select l.user_id, u.email::text, l.role,
           coalesce(array_agg(s.subteam order by s.subteam) filter (where s.subteam is not null), '{}'),
           l.created_at
    from public.leads l
    join auth.users u on u.id = l.user_id
    left join public.lead_scopes s on s.user_id = l.user_id
    group by l.user_id, u.email, l.role, l.created_at
    order by l.created_at;
end; $$;

create or replace function public.admin_grant_lead(lead_email text, lead_role public.lead_role, lead_scopes public.subteam[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare target uuid; current_role_value public.lead_role;
begin
  if not public.is_admin() then raise exception 'Only administrators can manage leads'; end if;
  select u.id into target from auth.users u
  where lower(u.email) = lower(btrim(lead_email)) and coalesce(u.is_anonymous, false) = false;
  if target is null then
    raise exception 'No account exists for %. Invite them under Supabase Authentication > Users first.', btrim(lead_email);
  end if;
  if lead_role = 'subteam_lead' and coalesce(cardinality(lead_scopes), 0) = 0 then
    raise exception 'Subteam leads need at least one subteam';
  end if;
  select l.role into current_role_value from public.leads l where l.user_id = target for update;
  if current_role_value = 'administrator' and lead_role <> 'administrator'
     and (select count(*) from public.leads where role = 'administrator') <= 1 then
    raise exception 'Cannot demote the last administrator';
  end if;

  insert into public.leads (user_id, role) values (target, lead_role)
  on conflict (user_id) do update set role = excluded.role;
  delete from public.lead_scopes s where s.user_id = target;
  if lead_role = 'subteam_lead' then
    insert into public.lead_scopes (user_id, subteam)
    select target, scope from unnest(lead_scopes) as scope group by scope;
  end if;
  return target;
end; $$;

create or replace function public.admin_revoke_lead(lead_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target_role public.lead_role;
begin
  if not public.is_admin() then raise exception 'Only administrators can manage leads'; end if;
  if lead_user = auth.uid() then raise exception 'You cannot remove your own lead access'; end if;
  select l.role into target_role from public.leads l where l.user_id = lead_user for update;
  if target_role is null then raise exception 'That account is not a lead'; end if;
  if target_role = 'administrator' and (select count(*) from public.leads where role = 'administrator') <= 1 then
    raise exception 'Cannot remove the last administrator';
  end if;
  delete from public.leads l where l.user_id = lead_user;
end; $$;

revoke execute on function public.admin_list_leads() from public, anon;
revoke execute on function public.admin_grant_lead(text, public.lead_role, public.subteam[]) from public, anon;
revoke execute on function public.admin_revoke_lead(uuid) from public, anon;
grant execute on function public.admin_list_leads() to authenticated;
grant execute on function public.admin_grant_lead(text, public.lead_role, public.subteam[]) to authenticated;
grant execute on function public.admin_revoke_lead(uuid) to authenticated;
