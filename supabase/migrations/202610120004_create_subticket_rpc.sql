-- Create child tickets through a lead-scoped function; members cannot change requirements directly.
create or replace function public.create_subticket(parent_id text, child_id text, child_title text)
returns public.tickets language plpgsql security invoker set search_path = public as $$
declare parent_ticket public.tickets; created_ticket public.tickets;
begin
  select * into parent_ticket from public.tickets where id = parent_id and archived_at is null;
  if parent_ticket.id is null then raise exception 'Parent ticket is not available'; end if;
  if not public.is_lead(parent_ticket.primary_subteam) then raise exception 'Only an authorized lead may create sub-tickets in this subteam'; end if;
  if char_length(child_title) < 3 or char_length(child_title) > 160 then raise exception 'Sub-ticket title must be between 3 and 160 characters'; end if;
  insert into public.tickets (id, title, description, completion_criteria, competition, primary_subteam, status, priority, beginner_friendly, creator_id, parent_ticket_id)
  values (child_id, child_title, 'Sub-ticket for ' || parent_ticket.title || '.', '[]'::jsonb, parent_ticket.competition, parent_ticket.primary_subteam, 'Open', parent_ticket.priority, parent_ticket.beginner_friendly, auth.uid(), parent_ticket.id)
  returning * into created_ticket;
  insert into public.ticket_activity(ticket_id, actor_id, action, details) values (created_ticket.id, auth.uid(), 'created_subticket', jsonb_build_object('parent_id', parent_ticket.id));
  return created_ticket;
end; $$;
