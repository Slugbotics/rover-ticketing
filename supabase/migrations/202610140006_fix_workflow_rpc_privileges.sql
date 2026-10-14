-- Workflow RPCs ran as SECURITY INVOKER, so they failed under RLS:
--   * ticket_activity has no INSERT policy (by design: members must not forge history),
--   * members cannot UPDATE tickets, so join/leave could not change status.
-- These functions now run as SECURITY DEFINER and perform every authorization check
-- explicitly. Direct table access is still governed by the existing RLS policies.

create or replace function public.join_ticket(ticket_id text)
returns public.tickets language plpgsql security definer set search_path = public as $$
declare joined public.tickets; caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Sign in to join tickets'; end if;
  perform 1 from public.tickets t where t.id = join_ticket.ticket_id and t.status <> 'Done' and t.archived_at is null for update;
  if not found then raise exception 'Ticket is not available'; end if;
  insert into public.ticket_participants(ticket_id, user_id) values (join_ticket.ticket_id, caller) on conflict do nothing;
  if found then
    update public.tickets t set status = case when t.status = 'Open' then 'In Progress' else t.status end, updated_at = now() where t.id = join_ticket.ticket_id;
    insert into public.ticket_activity(ticket_id, actor_id, action) values (join_ticket.ticket_id, caller, 'joined');
  end if;
  select * into joined from public.tickets t where t.id = join_ticket.ticket_id;
  return joined;
end; $$;

create or replace function public.leave_ticket(ticket_id text)
returns public.tickets language plpgsql security definer set search_path = public as $$
declare remaining integer; left_ticket public.tickets; caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Sign in to leave tickets'; end if;
  perform 1 from public.tickets t where t.id = leave_ticket.ticket_id for update;
  delete from public.ticket_participants p where p.ticket_id = leave_ticket.ticket_id and p.user_id = caller;
  if not found then raise exception 'You are not a participant on this ticket'; end if;
  select count(*) into remaining from public.ticket_participants p where p.ticket_id = leave_ticket.ticket_id;
  update public.tickets t set status = case when remaining = 0 and t.status = 'In Progress' then 'Open' else t.status end, updated_at = now()
  where t.id = leave_ticket.ticket_id returning * into left_ticket;
  insert into public.ticket_activity(ticket_id, actor_id, action) values (leave_ticket.ticket_id, caller, 'left');
  return left_ticket;
end; $$;

create or replace function public.member_update_status(ticket_id text, next_status public.ticket_status, reason text default null)
returns public.tickets language plpgsql security definer set search_path = public as $$
declare current_ticket public.tickets; changed public.tickets; caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Sign in to update tickets'; end if;
  select t.* into current_ticket from public.tickets t where t.id = member_update_status.ticket_id and t.archived_at is null
    and exists (select 1 from public.ticket_participants p where p.ticket_id = t.id and p.user_id = caller) for update;
  if current_ticket.id is null then raise exception 'Only a participant may update this ticket'; end if;
  if not ((current_ticket.status = 'In Progress' and next_status in ('Blocked','In Review')) or (current_ticket.status = 'Blocked' and next_status = 'In Progress')) then raise exception 'Status transition is not allowed'; end if;
  if next_status = 'Blocked' and coalesce(char_length(reason), 0) < 1 then raise exception 'Blocked status requires an explanation'; end if;
  update public.tickets t set status = next_status, updated_at = now() where t.id = member_update_status.ticket_id returning * into changed;
  insert into public.ticket_activity(ticket_id, actor_id, action, details) values (member_update_status.ticket_id, caller, 'status_changed', jsonb_build_object('from', current_ticket.status, 'to', next_status, 'reason', reason));
  return changed;
end; $$;

create or replace function public.create_subticket(parent_id text, child_id text, child_title text)
returns public.tickets language plpgsql security definer set search_path = public as $$
declare parent_ticket public.tickets; created_ticket public.tickets;
begin
  select * into parent_ticket from public.tickets t where t.id = parent_id and t.archived_at is null;
  if parent_ticket.id is null then raise exception 'Parent ticket is not available'; end if;
  if not public.is_lead(parent_ticket.primary_subteam) then raise exception 'Only an authorized lead may create sub-tickets in this subteam'; end if;
  if child_id !~ ('^' || parent_ticket.id || '-[0-9]+$') then raise exception 'Sub-ticket ID must extend the parent ID'; end if;
  if char_length(child_title) < 3 or char_length(child_title) > 160 then raise exception 'Sub-ticket title must be between 3 and 160 characters'; end if;
  insert into public.tickets (id, title, description, completion_criteria, competition, primary_subteam, status, priority, beginner_friendly, creator_id, parent_ticket_id)
  values (child_id, child_title, 'Sub-ticket for ' || parent_ticket.title || '.', '[]'::jsonb, parent_ticket.competition, parent_ticket.primary_subteam, 'Open', parent_ticket.priority, parent_ticket.beginner_friendly, auth.uid(), parent_ticket.id)
  returning * into created_ticket;
  insert into public.ticket_activity(ticket_id, actor_id, action, details) values (created_ticket.id, auth.uid(), 'created_subticket', jsonb_build_object('parent_id', parent_ticket.id));
  return created_ticket;
end; $$;

create or replace function public.create_ticket(ticket_title text, ticket_description text, criteria jsonb, ticket_competition public.competition, ticket_subteam public.subteam, ticket_priority public.ticket_priority, is_beginner_friendly boolean, ticket_effort text default null, ticket_due_date date default null)
returns public.tickets language plpgsql security definer set search_path = public as $$
declare new_ticket public.tickets; next_id text; numeric_id integer; prefix text;
begin
  if not public.is_lead(ticket_subteam) then raise exception 'You are not authorized for this subteam'; end if;
  if jsonb_typeof(coalesce(criteria, '[]'::jsonb)) <> 'array' then raise exception 'Completion criteria must be a list'; end if;
  prefix := case when ticket_competition = 'Lunabotics' then 'LB' else 'RB' end;
  -- Serialize ID allocation per prefix so concurrent creates cannot collide.
  perform pg_advisory_xact_lock(hashtext('create_ticket:' || prefix));
  select coalesce(max((split_part(t.id, '-', 2))::integer), 0) + 1 into numeric_id from public.tickets t where t.id ~ ('^' || prefix || '-[0-9]{3,}$');
  next_id := prefix || '-' || lpad(numeric_id::text, 3, '0');
  insert into public.tickets(id,title,description,completion_criteria,competition,primary_subteam,status,priority,beginner_friendly,estimated_effort,due_date,creator_id)
  values(next_id,ticket_title,ticket_description,coalesce(criteria, '[]'::jsonb),ticket_competition,ticket_subteam,'Open',ticket_priority,is_beginner_friendly,ticket_effort,ticket_due_date,auth.uid()) returning * into new_ticket;
  insert into public.ticket_activity(ticket_id,actor_id,action) values(next_id,auth.uid(),'created');
  return new_ticket;
end; $$;

create or replace function public.lead_update_status(ticket_id text, next_status public.ticket_status, feedback text default '')
returns public.tickets language plpgsql security definer set search_path = public as $$
declare current_ticket public.tickets; changed public.tickets;
begin
  select * into current_ticket from public.tickets t where t.id = lead_update_status.ticket_id for update;
  if current_ticket.id is null or not public.is_lead(current_ticket.primary_subteam) then raise exception 'Not authorized for this ticket'; end if;
  update public.tickets t set status = next_status, updated_at = now() where t.id = lead_update_status.ticket_id returning * into changed;
  insert into public.ticket_activity(ticket_id,actor_id,action,details) values(lead_update_status.ticket_id,auth.uid(),'lead_status_changed',jsonb_build_object('from',current_ticket.status,'to',next_status,'feedback',feedback));
  return changed;
end; $$;

-- The legacy single-assignee claim is superseded by join_ticket and is not used by the app.
revoke execute on function public.claim_ticket(text) from public, anon, authenticated;

-- Only signed-in users (including anonymous members) may call workflow RPCs.
revoke execute on function public.join_ticket(text) from public, anon;
revoke execute on function public.leave_ticket(text) from public, anon;
revoke execute on function public.member_update_status(text, public.ticket_status, text) from public, anon;
revoke execute on function public.create_subticket(text, text, text) from public, anon;
revoke execute on function public.create_ticket(text, text, jsonb, public.competition, public.subteam, public.ticket_priority, boolean, text, date) from public, anon;
revoke execute on function public.lead_update_status(text, public.ticket_status, text) from public, anon;
grant execute on function public.join_ticket(text) to authenticated;
grant execute on function public.leave_ticket(text) to authenticated;
grant execute on function public.member_update_status(text, public.ticket_status, text) to authenticated;
grant execute on function public.create_subticket(text, text, text) to authenticated;
grant execute on function public.create_ticket(text, text, jsonb, public.competition, public.subteam, public.ticket_priority, boolean, text, date) to authenticated;
grant execute on function public.lead_update_status(text, public.ticket_status, text) to authenticated;
