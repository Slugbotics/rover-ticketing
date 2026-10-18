-- Members sign in with Discord. A browser's anonymous session may already hold work
-- (joined tickets, comments), so before redirecting to Discord the anonymous session
-- creates a one-time merge token; after sign-in the Discord account redeems it and the
-- anonymous session's work is moved over. This works whichever device signs in first.
-- Only anonymous sessions can be merged away, so a real account's history cannot be
-- claimed, and only the anonymous session itself can issue its token.

create table if not exists public.account_merge_tokens (
  token uuid primary key default gen_random_uuid(),
  source_user uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '30 minutes'
);
-- No policies: only the functions below touch this table.
alter table public.account_merge_tokens enable row level security;

create or replace function public.create_account_merge()
returns uuid language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid(); new_token uuid;
begin
  if caller is null or not exists (select 1 from auth.users u where u.id = caller and coalesce(u.is_anonymous, false)) then
    raise exception 'Only guest sessions can be merged';
  end if;
  delete from public.account_merge_tokens where source_user = caller or expires_at < now();
  insert into public.account_merge_tokens (source_user) values (caller) returning token into new_token;
  return new_token;
end; $$;

-- Returns how many tickets the caller joined through the merge.
create or replace function public.complete_account_merge(merge_token uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid(); source uuid; moved integer;
begin
  if caller is null or exists (select 1 from auth.users u where u.id = caller and coalesce(u.is_anonymous, false)) then
    raise exception 'Sign in before merging a guest session';
  end if;
  delete from public.account_merge_tokens t where t.token = merge_token and t.expires_at > now() returning t.source_user into source;
  if source is null then raise exception 'This merge link has expired'; end if;
  if source = caller then return 0; end if;
  if not exists (select 1 from auth.users u where u.id = source and coalesce(u.is_anonymous, false)) then
    raise exception 'Only guest sessions can be merged';
  end if;

  -- Drop duplicate memberships first so the primary key holds.
  delete from public.ticket_participants p where p.user_id = source
    and exists (select 1 from public.ticket_participants q where q.ticket_id = p.ticket_id and q.user_id = caller);
  update public.ticket_participants set user_id = caller where user_id = source;
  get diagnostics moved = row_count;
  update public.ticket_comments set author_id = caller where author_id = source;
  update public.ticket_activity set actor_id = caller where actor_id = source;
  update public.ticket_submissions set submitter_id = caller where submitter_id = source;
  update public.tickets set creator_id = caller where creator_id = source;
  update public.tickets set assignee_id = caller where assignee_id = source;
  delete from public.member_profiles where user_id = source;
  return moved;
end; $$;

revoke execute on function public.create_account_merge() from public, anon;
revoke execute on function public.complete_account_merge(uuid) from public, anon;
grant execute on function public.create_account_merge() to authenticated;
grant execute on function public.complete_account_merge(uuid) to authenticated;
