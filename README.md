# Slugbotics Rover Ticket Board

A React + TypeScript + Vite ticket board for URC and Lunabotics rover work. It includes an intentionally labeled local demo board and versioned Supabase security migrations.

## Local development

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The existing `.env` must define `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never commit `.env`, print its values, or put a service-role key in it. Enable Anonymous Sign-Ins in Supabase Authentication. Set `VITE_DEMO_MODE=true` only when intentionally reviewing sample tickets.

With Supabase configured, the app creates one anonymous Supabase auth identity per persisted browser session and stores the self-reported Discord username in `member_profiles`. Editing the name keeps the same internal identity. Starting a new session signs out and creates a new identity; entering the same name does not transfer tickets, because a display name cannot authenticate ownership.

Checks:

```powershell
npm test
npm run build
```

## Supabase setup

1. In the Supabase dashboard, enable Anonymous Sign-Ins under Authentication > Providers.
2. Apply `supabase/migrations/202610120001_ticket_board.sql` with the Supabase CLI (`supabase link --project-ref YOUR_PROJECT_REF`, then `supabase db push`) or paste it into the SQL editor. Do not run it against production until reviewed and authorized.
3. Create the first administrator: create a normal Supabase Auth user through the dashboard, then run this SQL while signed in as the project owner, replacing the UUID with that user's Auth user ID:

```sql
insert into public.leads (user_id, role) values ('AUTH_USER_UUID', 'administrator');
```

4. Optional: populate the board with sample rows by replacing `AUTH_USER_UUID` in `supabase/seed_demo.sql` with that administrator UUID and running the file in the SQL editor. Without this optional seed, an empty `tickets` table and an empty board are correct.

To find an Auth user UUID, open Supabase Dashboard > Authentication > Users, copy the UUID for the administrator account, and replace the placeholder in the seed file. Do not paste service-role keys into the seed file or the frontend environment.

Add subteam scopes for non-administrators:

```sql
insert into public.leads (user_id, role) values ('AUTH_USER_UUID', 'subteam_lead');
insert into public.lead_scopes (user_id, subteam) values ('AUTH_USER_UUID', 'Software');
```

Anonymous members never inherit lead permissions. Browser-scoped ownership does not automatically transfer between devices.

## GitHub Pages

The production build uses `/rover-ticketing/` as its Vite base path. Configure Pages to deploy the `dist` artifact from GitHub Actions. Add repository Actions variables (Settings > Secrets and variables > Actions > Variables) `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; the deploy job fails rather than publishing a demo build if either is missing. Set Settings > Pages > Build and deployment > Source to **GitHub Actions**. The site is served at `https://slugbotics.github.io/rover-ticketing/`. Ticket details use query-string URLs such as `/rover-ticketing/?ticket=RB-104`, which work on direct refreshes on Pages without server routing.

## Scope and limitations

No file uploads are implemented. With Supabase configured and migrations applied, ticket reads, participant join/leave, comments, lead ticket creation, sub-ticket creation, and lead review status changes all use shared database state. The UI reports auth/data errors rather than silently switching to demo identity or demo data. See [PROJECT_SPEC.md](PROJECT_SPEC.md), [AGENTS.md](AGENTS.md), and [ACCEPTANCE_CHECKLIST.md](ACCEPTANCE_CHECKLIST.md).

Tickets support multiple independent participants and parent-linked sub-tickets. Apply `202610120002_multi_participant_subtickets.sql` after the base migration when enabling those shared database workflows.

Apply `202610120004_create_subticket_rpc.sql` as well. Sub-ticket creation is intentionally lead-scoped because it changes ticket requirements; anonymous members can join existing work but cannot create requirements.

Apply `202610120005_lead_ticket_workflows.sql` to enable the lead sign-in ticket creation and lead review status functions used by the app.

Apply `202610140006_fix_workflow_rpc_privileges.sql` last. It runs the workflow functions as `security definer` with explicit membership/lead-scope checks; without it, joining tickets, creating tickets, and status changes fail under RLS because `ticket_activity` intentionally has no client INSERT policy.
Apply `202610140007_subtickets_and_comment_replies.sql` and `202610140008_review_workflow_and_reply_fix.sql` after 006. Together they let ticket participants (or scoped leads) create one level of sub-tickets with server-allocated IDs, add one level of comment replies, and let participants submit work for review. Only leads in the ticket's subteam (or administrators) can mark work Done; Done tickets leave the board and appear in the Archive tab. Sub-tickets appear under their parent ticket and in the My tasks list of members who join them, not on the main board.
