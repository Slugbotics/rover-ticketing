# Rover Ticketing Project Spec

## Purpose
A shared, mobile-friendly ticket board for Slugbotics URC and Lunabotics teams. Discord usernames are self-reported display identities; they are not Discord verification.

## Identity and authorization
Members enter a Discord username and receive an anonymous Supabase browser session. The internal auth user ID owns claims and comments. Changing the displayed username changes presentation only and cannot transfer ownership. Lead permissions require an explicitly authorized authenticated Supabase account and are enforced by RLS and SQL functions.

## Ticket model
Tickets have one competition tag (`URC`, `Lunabotics`, or `Both`), a primary subteam, status, priority, criteria, optional effort/due date, multiple participants, comments, resources, and activity history. Tickets can have child sub-tickets through `parent_ticket_id`. Competition filters include `Both` tickets in either team view.

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
Supabase anonymous authentication and `member_profiles` are wired for member identity. Configured environments load tickets from Supabase and persist participant join/leave operations. Comments and sub-ticket creation remain local until their production mutation adapter is completed. It must report configuration/auth/data errors rather than switching to demo identity. A display username is never treated as proof of identity.
