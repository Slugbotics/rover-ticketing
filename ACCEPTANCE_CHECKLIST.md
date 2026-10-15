# Acceptance Checklist

- [x] Member entry asks only for a Discord username.
- [x] Browser session and display username are separate concepts.
- [x] Board filters include URC, Lunabotics, Both, subteam, status, priority, beginner-friendly, and unassigned.
- [x] Ticket detail has criteria, comments, activity, resources, and shareable query URL.
- [x] Demo mode is visibly labeled and never hidden behind a production error.
- [x] Supabase migration includes tables, indexes, RLS, lead scopes, atomic claim, transitions, and activity logging.
- [x] GitHub Pages production base path is configured.
- [x] Environment files are ignored and `.env.example` contains placeholders only.
- [x] TypeScript production build passes.
- [x] Domain tests cover filters and member transitions.
- [x] Administrators can edit ticket content through `admin_update_ticket`; direct ticket updates are not allowed.
- [ ] Apply migration to the intended Supabase project.
- [ ] Enable anonymous auth and configure the first administrator.
- [ ] Wire and verify the production Supabase data adapter.
- [ ] Add GitHub Pages repository variable/configuration and authorize deployment.
- [ ] Verify live browser flows against the remote database.
