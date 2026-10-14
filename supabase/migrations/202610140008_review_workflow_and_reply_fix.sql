-- 1. Fix comment replies. The 007 policy's unqualified parent_comment_id resolved to
--    the parent row's own column inside the subquery, so every reply was rejected.
--    A helper with explicit parameters removes the ambiguity.
create or replace function public.comment_reply_allowed(reply_parent uuid, reply_ticket text)
returns boolean language sql stable security definer set search_path = public as $$
  select reply_parent is null or exists (
    select 1 from public.ticket_comments c
    where c.id = reply_parent and c.ticket_id = reply_ticket and c.parent_comment_id is null
  );
$$;
revoke execute on function public.comment_reply_allowed(uuid, text) from public, anon;
grant execute on function public.comment_reply_allowed(uuid, text) to authenticated;

drop policy if exists "members post comments" on public.ticket_comments;
create policy "members post comments" on public.ticket_comments for insert to authenticated
  with check (author_id = auth.uid() and public.comment_reply_allowed(parent_comment_id, ticket_id));

-- 2. Review workflow. Participants can submit their ticket for review from any active
--    state and withdraw it while it is waiting. Only leads (lead_update_status) can
--    mark work Done, which moves it to the archive in the app.
create or replace function public.member_update_status(ticket_id text, next_status public.ticket_status, reason text default null)
returns public.tickets language plpgsql security definer set search_path = public as $$
declare current_ticket public.tickets; changed public.tickets; caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Sign in to update tickets'; end if;
  select t.* into current_ticket from public.tickets t where t.id = member_update_status.ticket_id and t.archived_at is null
    and exists (select 1 from public.ticket_participants p where p.ticket_id = t.id and p.user_id = caller) for update;
  if current_ticket.id is null then raise exception 'Only a participant may update this ticket'; end if;
  if not (
    (current_ticket.status = 'Open' and next_status in ('In Progress', 'In Review'))
    or (current_ticket.status = 'In Progress' and next_status in ('Blocked', 'In Review'))
    or (current_ticket.status = 'Blocked' and next_status in ('In Progress', 'In Review'))
    or (current_ticket.status = 'In Review' and next_status = 'In Progress')
  ) then raise exception 'Status transition is not allowed'; end if;
  if next_status = 'Blocked' and coalesce(char_length(reason), 0) < 1 then raise exception 'Blocked status requires an explanation'; end if;
  update public.tickets t set status = next_status, updated_at = now() where t.id = member_update_status.ticket_id returning * into changed;
  insert into public.ticket_activity(ticket_id, actor_id, action, details) values (member_update_status.ticket_id, caller, 'status_changed', jsonb_build_object('from', current_ticket.status, 'to', next_status, 'reason', reason));
  return changed;
end; $$;
revoke execute on function public.member_update_status(text, public.ticket_status, text) from public, anon;
grant execute on function public.member_update_status(text, public.ticket_status, text) to authenticated;
