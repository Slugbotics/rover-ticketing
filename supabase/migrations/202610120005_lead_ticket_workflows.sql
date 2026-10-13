-- Lead-only ticket creation and review status changes.
create or replace function public.create_ticket(ticket_title text, ticket_description text, criteria jsonb, ticket_competition public.competition, ticket_subteam public.subteam, ticket_priority public.ticket_priority, is_beginner_friendly boolean, ticket_effort text default null, ticket_due_date date default null)
returns public.tickets language plpgsql security invoker set search_path = public as $$
declare new_ticket public.tickets; next_id text; numeric_id integer;
begin
  if not public.is_lead(ticket_subteam) then raise exception 'You are not authorized for this subteam'; end if;
  select coalesce(max((split_part(id, '-', 2))::integer), 0) + 1 into numeric_id from public.tickets where split_part(id, '-', 1) = case when ticket_competition = 'Lunabotics' then 'LB' else 'RB' end and id ~ '^[A-Z]+-[0-9]{3,}$';
  next_id := case when ticket_competition = 'Lunabotics' then 'LB-' else 'RB-' end || lpad(numeric_id::text, 3, '0');
  insert into public.tickets(id,title,description,completion_criteria,competition,primary_subteam,status,priority,beginner_friendly,estimated_effort,due_date,creator_id)
  values(next_id,ticket_title,ticket_description,criteria,ticket_competition,ticket_subteam,'Open',ticket_priority,is_beginner_friendly,ticket_effort,ticket_due_date,auth.uid()) returning * into new_ticket;
  insert into public.ticket_activity(ticket_id,actor_id,action) values(next_id,auth.uid(),'created');
  return new_ticket;
end; $$;

create or replace function public.lead_update_status(ticket_id text, next_status public.ticket_status, feedback text default '')
returns public.tickets language plpgsql security invoker set search_path = public as $$
declare current_ticket public.tickets; changed public.tickets;
begin
  select * into current_ticket from public.tickets where id = ticket_id for update;
  if current_ticket.id is null or not public.is_lead(current_ticket.primary_subteam) then raise exception 'Not authorized for this ticket'; end if;
  update public.tickets set status = next_status, updated_at = now() where id = ticket_id returning * into changed;
  insert into public.ticket_activity(ticket_id,actor_id,action,details) values(ticket_id,auth.uid(),'lead_status_changed',jsonb_build_object('from',current_ticket.status,'to',next_status,'feedback',feedback));
  return changed;
end; $$;
