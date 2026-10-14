# Agent Guide

## Commands
- `npm install` installs dependencies.
- `npm run dev` starts local Vite development.
- `npm run build` runs TypeScript and the production build.
- `npm test` runs domain tests.

## Conventions
Use TypeScript, existing React patterns, and small focused changes. Keep Supabase access in a dedicated adapter. Never expose service-role credentials or print `.env` values. Preserve the explicit demo/production boundary and update migrations for database behavior changes.

## Safety
Agents may apply migrations to the remote Supabase project. Only apply versioned files from `supabase/migrations/` (never ad-hoc SQL), apply them in order, verify the result, and never print database credentials. Validate member actions in RLS/functions, not only in UI controls. Keep user content rendered as text.
