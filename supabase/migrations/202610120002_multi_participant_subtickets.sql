-- Extends the ticket model so several members can work on one ticket.
alter table public.tickets add column if not exists parent_ticket_id text references public.tickets(id) on delete cascade;
create index if not exists tickets_parent_idx on public.tickets(parent_ticket_id);

create table if not exists public.ticket_participants (
  ticket_id text not null references public.tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);
create index if not exists ticket_participants_user_idx on public.ticket_participants(user_id);
alter table public.ticket_participants enable row level security;

create policy "members read ticket participants" on public.ticket_participants for select to authenticated using (true);
create policy "members join tickets" on public.ticket_participants for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.tickets t where t.id = ticket_id and t.status <> 'Done' and t.archived_at is null));
create policy "members leave their tickets" on public.ticket_participants for delete to authenticated using (user_id = auth.uid());

create or replace function public.join_ticket(ticket_id text)
returns public.tickets language plpgsql security invoker set search_path = public as $$
declare joined public.tickets;
begin
  update public.tickets set status = case when status = 'Open' then 'In Progress' else status end, updated_at = now()
  where id = ticket_id and status <> 'Done' and archived_at is null;
  if not found then raise exception 'Ticket is not available'; end if;
  insert into public.ticket_participants(ticket_id, user_id) values (ticket_id, auth.uid()) on conflict do nothing;
  select * into joined from public.tickets where id = ticket_id;
  insert into public.ticket_activity(ticket_id, actor_id, action) values (ticket_id, auth.uid(), 'joined');
  return joined;
end; $$;

create or replace function public.leave_ticket(ticket_id text)
returns public.tickets language plpgsql security invoker set search_path = public as $$
declare remaining integer; left_ticket public.tickets;
begin
  delete from public.ticket_participants where ticket_id = leave_ticket.ticket_id and user_id = auth.uid();
  select count(*) into remaining from public.ticket_participants where ticket_id = leave_ticket.ticket_id;
  update public.tickets set status = case when remaining = 0 and status = 'In Progress' then 'Open' else status end, updated_at = now() where id = leave_ticket.ticket_id returning * into left_ticket;
  insert into public.ticket_activity(ticket_id, actor_id, action) values (leave_ticket.ticket_id, auth.uid(), 'left');
  return left_ticket;
end; $$;

-- New member status checks use participation, not a singular assignee.
create or replace function public.member_update_status(ticket_id text, next_status public.ticket_status, reason text default null)
returns public.tickets language plpgsql security invoker set search_path = public as $$
declare current_ticket public.tickets; changed public.tickets;
begin
  select t.* into current_ticket from public.tickets t where t.id = ticket_id and exists (select 1 from public.ticket_participants p where p.ticket_id = t.id and p.user_id = auth.uid()) for update;
  if current_ticket.id is null then raise exception 'Only a participant may update this ticket'; end if;
  if not ((current_ticket.status = 'In Progress' and next_status in ('Blocked','In Review')) or (current_ticket.status = 'Blocked' and next_status = 'In Progress')) then raise exception 'Status transition is not allowed'; end if;
  if next_status = 'Blocked' and coalesce(char_length(reason), 0) < 1 then raise exception 'Blocked status requires an explanation'; end if;
  update public.tickets set status = next_status, updated_at = now() where id = ticket_id returning * into changed;
  insert into public.ticket_activity(ticket_id, actor_id, action, details) values (ticket_id, auth.uid(), 'status_changed', jsonb_build_object('from', current_ticket.status, 'to', next_status, 'reason', reason));
  return changed;
end; $$;
