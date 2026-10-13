# Agent Guide

## Commands
- `npm install` installs dependencies.
- `npm run dev` starts local Vite development.
- `npm run build` runs TypeScript and the production build.
- `npm test` runs domain tests.

## Conventions
Use TypeScript, existing React patterns, and small focused changes. Keep Supabase access in a dedicated adapter. Never expose service-role credentials or print `.env` values. Preserve the explicit demo/production boundary and update migrations for database behavior changes.

## Safety
Do not apply migrations to the remote Supabase project without explicit authorization. Validate member actions in RLS/functions, not only in UI controls. Keep user content rendered as text.
