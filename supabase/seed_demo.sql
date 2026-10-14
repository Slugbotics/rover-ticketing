-- Optional sample data for the shared board.
-- Replace AUTH_USER_UUID with the Auth user UUID of an administrator or authorized lead.
-- Run this only once after applying migrations 001 through 006.

insert into public.tickets (
  id, title, description, completion_criteria, competition, primary_subteam,
  status, priority, beginner_friendly, estimated_effort, due_date, creator_id
) values
('RB-104', 'Design sealed electronics bay', 'Create a maintainable enclosure concept that protects the compute stack from dust while keeping field access practical.', '["Fits the current chassis envelope", "Includes a gasket and service access plan", "Reviewed by Mechanical and Electrical"]'::jsonb, 'Both', 'Mechanical', 'Open', 'High', true, '2-3 lab sessions', '2026-10-30', 'AUTH_USER_UUID'),
('RB-097', 'Harden waypoint recovery behavior', 'When localization drops during an autonomous run, return to the last safe waypoint and expose a clear operator event.', '["Recovery is deterministic in simulation", "Operator event contains the recovery reason", "Add regression coverage for a dropped pose"]'::jsonb, 'URC', 'Software', 'Open', 'High', false, '1 week', null, 'AUTH_USER_UUID'),
('LB-041', 'Characterize regolith scoop angle', 'Run a small test matrix to compare scoop entry angles against sample collection consistency.', '["Test at three entry angles", "Record sample mass and cycle time", "Publish a short recommendation"]'::jsonb, 'Lunabotics', 'Science', 'Open', 'Medium', true, '3 hours', null, 'AUTH_USER_UUID'),
('RB-088', 'Document radio failover checklist', 'Turn the field radio failover procedure into a short, checkable runbook for competition operators.', '["Covers loss, recovery, and escalation", "Reviewed by the Electrical lead", "Readable from a phone"]'::jsonb, 'URC', 'Electrical', 'Open', 'Medium', true, '2 hours', '2026-10-21', 'AUTH_USER_UUID')
on conflict (id) do nothing;

insert into public.ticket_activity (ticket_id, actor_id, action)
select id, 'AUTH_USER_UUID', 'created' from public.tickets
where id in ('RB-104', 'RB-097', 'LB-041', 'RB-088')
  and not exists (select 1 from public.ticket_activity a where a.ticket_id = public.tickets.id and a.action = 'created');
