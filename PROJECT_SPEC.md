# Rover Ticketing Project Spec

## Purpose
A shared, mobile-friendly ticket board for Slugbotics URC and Lunabotics teams. Members sign in with Discord, so their board name is a verified Discord handle.

## Identity and authorization
Members sign in with Discord through Supabase Auth; the internal auth user ID owns claims and comments and is the same on every device. A guest (anonymous) browser session's work moves to a Discord account only through a one-time merge token issued by that guest session itself. A typed display name never transfers ownership. Lead permissions require an explicitly authorized authenticated Supabase account and are enforced by RLS and SQL functions.

## Ticket model
Tickets have one competition tag (`URC`, `Lunabotics`, or `Both`), one or more subteams (the first is primary; `General` covers cross-team work), status, priority, criteria, optional effort/due date, multiple participants, comments, resources, and activity history. Tickets can have child sub-tickets through `parent_ticket_id`. The board's quick filters are by subteam (Mechanical, Electrical, Software, Science); a ticket appears under every subteam it involves, and a lead of any involved subteam can review it. The competition tag is shown on tickets but is not currently filterable.

## Security invariants
- No service-role key is shipped to the browser.
- Anonymous members cannot read or write lead tables or perform lead updates.
- Claiming is an atomic conditional update.
- Participants join and leave independently; changing a display name or browser session never transfers another participant's ownership.
- Member status transitions are narrowly allow-listed.
- Lead scopes are checked against the ticket primary subteam.
- User content is rendered as text; no HTML injection path is used.

## Hosting
Vite emits `/rover-ticketing/` for production builds. The app uses query-string ticket links (`?ticket=RB-104`) so GitHub Pages does not need a server-side fallback route.

## Current implementation boundary
Supabase anonymous authentication and `member_profiles` are wired for member identity. Configured environments load tickets from Supabase and persist participant join/leave, comments, sub-tickets, lead ticket creation, and lead review status changes. It must report configuration/auth/data errors rather than switching to demo identity. A display username is never treated as proof of identity.
