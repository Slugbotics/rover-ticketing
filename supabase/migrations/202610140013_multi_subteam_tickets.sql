-- Tickets can involve several subteams, and "General/Shared" is renamed to "General".
--
-- tickets.subteams holds every involved subteam; primary_subteam is kept as the first
-- entry so older inserts (seed data) and existing indexes keep working. A lead may
-- create or review a ticket when they cover ANY of its subteams.

alter type public.subteam rename value 'General/Shared' to 'General';

alter table public.tickets add column if not exists subteams public.subteam[];
update public.tickets set subteams = array[primary_subteam] where subteams is null;
alter table public.tickets alter column subteams set not null;
alter table public.tickets drop constraint if exists tickets_subteams_not_empty;
alter table public.tickets add constraint tickets_subteams_not_empty check (cardinality(subteams) between 1 and 5 and array_position(subteams, null) is null);

-- Keeps primary_subteam = subteams[1], and fills subteams for inserts that only set
-- primary_subteam. Duplicates are removed while preserving order.
create or replace function public.sync_ticket_subteams()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.subteams is null or cardinality(new.subteams) = 0 then
    new.subteams := array[new.primary_subteam];
  end if;
  select array_agg(s order by first_pos) into new.subteams
  from (select s, min(pos) as first_pos from unnest(new.subteams) with ordinality as u(s, pos) group by s) d;
  new.primary_subteam := new.subteams[1];
  return new;
end; $$;
drop trigger if exists tickets_sync_subteams on public.tickets;
create trigger tickets_sync_subteams before insert or update of subteams, primary_subteam on public.tickets
for each row execute function public.sync_ticket_subteams();

create index if not exists tickets_subteams_idx on public.tickets using gin (subteams);

create or replace function public.is_lead_any(required_subteams public.subteam[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.leads l where l.user_id = auth.uid() and (
      l.role = 'administrator'
      or exists (select 1 from public.lead_scopes s where s.user_id = l.user_id and s.subteam = any(required_subteams))
    )
  );
$$;
revoke execute on function public.is_lead_any(public.subteam[]) from public, anon;
grant execute on function public.is_lead_any(public.subteam[]) to authenticated;

drop policy if exists "leads create tickets in scope" on public.tickets;
create policy "leads create tickets in scope" on public.tickets for insert to authenticated
  with check (creator_id = auth.uid() and public.is_lead_any(subteams));

-- create_ticket: takes a subteam list instead of a single subteam.
drop function if exists public.create_ticket(text, text, jsonb, public.competition, public.subteam, public.ticket_priority, boolean, text, date);
create or replace function public.create_ticket(ticket_title text, ticket_description text, criteria jsonb, ticket_competition public.competition, ticket_subteams public.subteam[], ticket_priority public.ticket_priority, is_beginner_friendly boolean, ticket_effort text default null, ticket_due_date date default null)
returns public.tickets language plpgsql security definer set search_path = public as $$
declare new_ticket public.tickets; next_id text; numeric_id integer; prefix text;
begin
  if coalesce(cardinality(ticket_subteams), 0) = 0 then raise exception 'Choose at least one subteam'; end if;
  if not public.is_lead_any(ticket_subteams) then raise exception 'You are not authorized for these subteams'; end if;
  if jsonb_typeof(coalesce(criteria, '[]'::jsonb)) <> 'array' then raise exception 'Completion criteria must be a list'; end if;
  prefix := case when ticket_competition = 'Lunabotics' then 'LB' else 'RB' end;
  -- Serialize ID allocation per prefix so concurrent creates cannot collide.
  perform pg_advisory_xact_lock(hashtext('create_ticket:' || prefix));
  select coalesce(max((split_part(t.id, '-', 2))::integer), 0) + 1 into numeric_id from public.tickets t where t.id ~ ('^' || prefix || '-[0-9]{3,}$');
  next_id := prefix || '-' || lpad(numeric_id::text, 3, '0');
  insert into public.tickets(id,title,description,completion_criteria,competition,primary_subteam,subteams,status,priority,beginner_friendly,estimated_effort,due_date,creator_id)
  values(next_id,ticket_title,ticket_description,coalesce(criteria, '[]'::jsonb),ticket_competition,ticket_subteams[1],ticket_subteams,'Open',ticket_priority,is_beginner_friendly,ticket_effort,ticket_due_date,auth.uid()) returning * into new_ticket;
  insert into public.ticket_activity(ticket_id,actor_id,action) values(next_id,auth.uid(),'created');
  return new_ticket;
end; $$;
revoke execute on function public.create_ticket(text, text, jsonb, public.competition, public.subteam[], public.ticket_priority, boolean, text, date) from public, anon;
grant execute on function public.create_ticket(text, text, jsonb, public.competition, public.subteam[], public.ticket_priority, boolean, text, date) to authenticated;

-- lead_update_status: a lead of any involved subteam may review.
create or replace function public.lead_update_status(ticket_id text, next_status public.ticket_status, feedback text default '')
returns public.tickets language plpgsql security definer set search_path = public as $$
declare current_ticket public.tickets; changed public.tickets;
begin
  select * into current_ticket from public.tickets t where t.id = lead_update_status.ticket_id for update;
  if current_ticket.id is null or not public.is_lead_any(current_ticket.subteams) then raise exception 'Not authorized for this ticket'; end if;
  update public.tickets t set status = next_status, updated_at = now() where t.id = lead_update_status.ticket_id returning * into changed;
  insert into public.ticket_activity(ticket_id,actor_id,action,details) values(lead_update_status.ticket_id,auth.uid(),'lead_status_changed',jsonb_build_object('from',current_ticket.status,'to',next_status,'feedback',feedback));
  return changed;
end; $$;

-- create_subticket: children inherit every parent subteam.
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
  if not (public.is_lead_any(parent_ticket.subteams)
          or exists (select 1 from public.ticket_participants p where p.ticket_id = parent_ticket.id and p.user_id = caller)) then
    raise exception 'Join this ticket to create sub-tickets';
  end if;
  child_title := btrim(coalesce(child_title, ''));
  child_description := nullif(btrim(coalesce(child_description, '')), '');
  if char_length(child_title) < 3 or char_length(child_title) > 160 then raise exception 'Sub-ticket title must be between 3 and 160 characters'; end if;
  if char_length(coalesce(child_description, '')) > 10000 then raise exception 'Sub-ticket description is too long'; end if;

  select coalesce(max((substring(t.id from '-([0-9]+)$'))::integer), 0) + 1 into next_number
  from public.tickets t where t.parent_ticket_id = parent_ticket.id and t.id ~ ('^' || parent_ticket.id || '-[0-9]+$');

  insert into public.tickets (id, title, description, completion_criteria, competition, primary_subteam, subteams, status, priority, beginner_friendly, creator_id, parent_ticket_id)
  values (parent_ticket.id || '-' || next_number, child_title, coalesce(child_description, 'Sub-ticket for ' || parent_ticket.title || '.'), '[]'::jsonb,
          parent_ticket.competition, parent_ticket.primary_subteam, parent_ticket.subteams, 'Open', parent_ticket.priority, parent_ticket.beginner_friendly, caller, parent_ticket.id)
  returning * into created_ticket;
  insert into public.ticket_activity(ticket_id, actor_id, action, details) values (created_ticket.id, caller, 'created_subticket', jsonb_build_object('parent_id', parent_ticket.id));
  insert into public.ticket_activity(ticket_id, actor_id, action, details) values (parent_ticket.id, caller, 'added_subticket', jsonb_build_object('child_id', created_ticket.id));
  return created_ticket;
end; $$;

-- admin_update_ticket: takes a subteam list instead of a single subteam.
drop function if exists public.admin_update_ticket(text, text, text, jsonb, public.competition, public.subteam, public.ticket_priority, boolean, text, date);
create or replace function public.admin_update_ticket(
  ticket_id text,
  ticket_title text,
  ticket_description text,
  criteria jsonb,
  ticket_competition public.competition,
  ticket_subteams public.subteam[],
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
  if coalesce(cardinality(ticket_subteams), 0) = 0 then raise exception 'Choose at least one subteam'; end if;

  if ticket_title is distinct from current_ticket.title then changed_fields := array_append(changed_fields, 'title'::text); end if;
  if ticket_description is distinct from current_ticket.description then changed_fields := array_append(changed_fields, 'description'::text); end if;
  if criteria is distinct from current_ticket.completion_criteria then changed_fields := array_append(changed_fields, 'criteria'::text); end if;
  if ticket_competition is distinct from current_ticket.competition then changed_fields := array_append(changed_fields, 'competition'::text); end if;
  if ticket_subteams is distinct from current_ticket.subteams then changed_fields := array_append(changed_fields, 'subteams'::text); end if;
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
    subteams = ticket_subteams,
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
revoke execute on function public.admin_update_ticket(text, text, text, jsonb, public.competition, public.subteam[], public.ticket_priority, boolean, text, date) from public, anon;
grant execute on function public.admin_update_ticket(text, text, text, jsonb, public.competition, public.subteam[], public.ticket_priority, boolean, text, date) to authenticated;
