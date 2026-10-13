-- Child ticket IDs use a parent suffix such as RB-104-1.
alter table public.tickets drop constraint if exists tickets_id_check;
alter table public.tickets add constraint tickets_id_check check (id ~ '^[A-Z]{2,4}-[0-9]{3,}(-[0-9]+)?$');

-- Allow authenticated member RPCs to record their own comment identity explicitly.
-- The client still supplies author_id from auth.getUser(); RLS remains authoritative.
