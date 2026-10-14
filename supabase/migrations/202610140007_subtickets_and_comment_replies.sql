-- Sub-tickets can be created by anyone working on the parent ticket, not only leads.
-- The server now allocates the child ID (previously counted client-side, which could
-- collide) and accepts an optional description. Nesting is limited to one level to
-- match the ticket ID format (RB-104-1).

drop function if exists public.create_subticket(text, text, text);

create or replace function public.create_subticket(parent_id text, child_title text, child_description text default null)
returns public.tickets language plpgsql security definer set search_path = public as $$
declare parent_ticket public.tickets; created_ticket public.tickets; next_number integer; caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Sign in to create sub-tickets'; end if;
  -- Row lock serializes concurrent child ID allocation for this parent.
  select * into parent_ticket from public.tickets t where t.id = create_subticket.parent_id and t.archived_at is null for update;
  if parent_ticket.id is null then raise exception 'Parent ticket is not available'; end if;
  if parent_ticket.parent_ticket_id is not null then raise exception 'Sub-tickets cannot have their own sub-tickets'; end if;
  if parent_ticket.status = 'Done' then raise exception 'Cannot add sub-tickets to a completed ticket'; end if;
  if not (public.is_lead(parent_ticket.primary_subteam)
          or exists (select 1 from public.ticket_participants p where p.ticket_id = parent_ticket.id and p.user_id = caller)) then
    raise exception 'Join this ticket to create sub-tickets';
  end if;
  child_title := btrim(coalesce(child_title, ''));
  child_description := nullif(btrim(coalesce(child_description, '')), '');
  if char_length(child_title) < 3 or char_length(child_title) > 160 then raise exception 'Sub-ticket title must be between 3 and 160 characters'; end if;
  if char_length(coalesce(child_description, '')) > 10000 then raise exception 'Sub-ticket description is too long'; end if;

  select coalesce(max((substring(t.id from '-([0-9]+)$'))::integer), 0) + 1 into next_number
  from public.tickets t where t.parent_ticket_id = parent_ticket.id and t.id ~ ('^' || parent_ticket.id || '-[0-9]+$');

  insert into public.tickets (id, title, description, completion_criteria, competition, primary_subteam, status, priority, beginner_friendly, creator_id, parent_ticket_id)
  values (parent_ticket.id || '-' || next_number, child_title, coalesce(child_description, 'Sub-ticket for ' || parent_ticket.title || '.'), '[]'::jsonb,
          parent_ticket.competition, parent_ticket.primary_subteam, 'Open', parent_ticket.priority, parent_ticket.beginner_friendly, caller, parent_ticket.id)
  returning * into created_ticket;
  insert into public.ticket_activity(ticket_id, actor_id, action, details) values (created_ticket.id, caller, 'created_subticket', jsonb_build_object('parent_id', parent_ticket.id));
  insert into public.ticket_activity(ticket_id, actor_id, action, details) values (parent_ticket.id, caller, 'added_subticket', jsonb_build_object('child_id', created_ticket.id));
  return created_ticket;
end; $$;

revoke execute on function public.create_subticket(text, text, text) from public, anon;
grant execute on function public.create_subticket(text, text, text) to authenticated;

-- Comment replies: one level of threading. A reply must point at a top-level
-- comment on the same ticket; authorship is still pinned to the caller.
alter table public.ticket_comments add column if not exists parent_comment_id uuid references public.ticket_comments(id) on delete cascade;
create index if not exists ticket_comments_parent_idx on public.ticket_comments(parent_comment_id);

drop policy if exists "members post comments" on public.ticket_comments;
create policy "members post comments" on public.ticket_comments for insert to authenticated with check (
  author_id = auth.uid()
  and (parent_comment_id is null or exists (
    select 1 from public.ticket_comments parent
    where parent.id = parent_comment_id and parent.ticket_id = ticket_comments.ticket_id and parent.parent_comment_id is null
  ))
);
