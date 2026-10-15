-- Fixes admin_update_ticket: appending an untyped string literal to a text[] with ||
-- parsed the literal as an array ("malformed array literal"), so any edit beyond the
-- title failed. Use array_append instead. No data or permissions change.

create or replace function public.admin_update_ticket(
  ticket_id text,
  ticket_title text,
  ticket_description text,
  criteria jsonb,
  ticket_competition public.competition,
  ticket_subteam public.subteam,
  ticket_priority public.ticket_priority,
  is_beginner_friendly boolean,
  ticket_effort text default null,
  ticket_due_date date default null
)
returns public.tickets language plpgsql security definer set search_path = public as $$
declare current_ticket public.tickets; changed public.tickets; changed_fields text[] := '{}';
begin
  if not public.is_admin() then raise exception 'Only administrators can edit tickets'; end if;
  select * into current_ticket from public.tickets t where t.id = admin_update_ticket.ticket_id and t.archived_at is null for update;
  if current_ticket.id is null then raise exception 'Ticket is not available'; end if;

  ticket_title := btrim(coalesce(ticket_title, ''));
  ticket_description := btrim(coalesce(ticket_description, ''));
  ticket_effort := nullif(btrim(coalesce(ticket_effort, '')), '');
  criteria := coalesce(criteria, '[]'::jsonb);
  if char_length(ticket_title) < 3 or char_length(ticket_title) > 160 then raise exception 'Title must be between 3 and 160 characters'; end if;
  if char_length(ticket_description) < 1 or char_length(ticket_description) > 10000 then raise exception 'Description must be between 1 and 10000 characters'; end if;
  if jsonb_typeof(criteria) <> 'array' then raise exception 'Completion criteria must be a list'; end if;
  if char_length(coalesce(ticket_effort, '')) > 64 then raise exception 'Estimate is too long'; end if;

  if ticket_title is distinct from current_ticket.title then changed_fields := array_append(changed_fields, 'title'::text); end if;
  if ticket_description is distinct from current_ticket.description then changed_fields := array_append(changed_fields, 'description'::text); end if;
  if criteria is distinct from current_ticket.completion_criteria then changed_fields := array_append(changed_fields, 'criteria'::text); end if;
  if ticket_competition is distinct from current_ticket.competition then changed_fields := array_append(changed_fields, 'competition'::text); end if;
  if ticket_subteam is distinct from current_ticket.primary_subteam then changed_fields := array_append(changed_fields, 'subteam'::text); end if;
  if ticket_priority is distinct from current_ticket.priority then changed_fields := array_append(changed_fields, 'priority'::text); end if;
  if is_beginner_friendly is distinct from current_ticket.beginner_friendly then changed_fields := array_append(changed_fields, 'beginner_friendly'::text); end if;
  if ticket_effort is distinct from current_ticket.estimated_effort then changed_fields := array_append(changed_fields, 'estimate'::text); end if;
  if ticket_due_date is distinct from current_ticket.due_date then changed_fields := array_append(changed_fields, 'due_date'::text); end if;
  if cardinality(changed_fields) = 0 then return current_ticket; end if;

  update public.tickets t set
    title = ticket_title,
    description = ticket_description,
    completion_criteria = criteria,
    competition = ticket_competition,
    primary_subteam = ticket_subteam,
    priority = ticket_priority,
    beginner_friendly = coalesce(is_beginner_friendly, false),
    estimated_effort = ticket_effort,
    due_date = ticket_due_date,
    updated_at = now()
  where t.id = admin_update_ticket.ticket_id
  returning * into changed;
  insert into public.ticket_activity(ticket_id, actor_id, action, details)
  values (admin_update_ticket.ticket_id, auth.uid(), 'edited', jsonb_build_object('fields', to_jsonb(changed_fields)));
  return changed;
end; $$;
