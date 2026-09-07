# Pointline

Pointline is a lightweight PI planning estimation room with a team-owned estimate and an optional AI-assisted second opinion. It also supports hidden/open planning rounds, story-to-service allocations, domain rollups, and CSV/text backlog import.

## Run locally

From PowerShell:

```powershell
.\start-pointline.ps1
```

Open [http://localhost:4174/](http://localhost:4174/).

Use the `localhost:4174` address rather than `127.0.0.1:4173`. The latter is shared with the Nightfall/Werewolf preview in this environment and can be controlled by its cached service worker.

## Optional cloud setup

Supabase is the recommended low-resource backend for this static app. It provides Google Auth, a small Postgres database, and optional Realtime updates without adding a server to this repository.

1. Create a Supabase project on the free plan.
2. Open the SQL Editor and run [supabase/schema.sql](supabase/schema.sql).
3. Enable Google under Authentication → Providers. In Google Cloud, add `http://localhost:4174` (and the production origin) as an authorized JavaScript origin, and add the Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI. Add the app origins to Supabase Authentication → URL Configuration as allowed redirect URLs.
4. Copy the project URL and browser-safe publishable key into [supabase-config.js](supabase-config.js):

   ```js
   window.POINTLINE_SUPABASE_CONFIG = Object.freeze({
     url: 'https://your-project.supabase.co',
     publishableKey: 'sb_publishable_...',
     roomId: '',
   });
   ```

   Leave `roomId` blank for the first signed-in user to create a room. The app saves that room ID locally and includes it in the Share room link. To open an existing room, use a link with `?room=<room-id>`; after Google sign-in, the SQL setup treats that UUID as the lightweight room invite and adds the user as an editor.

Without these values, the sign-in button explains what is missing and Pointline remains fully usable in local demo mode. Never place a `service_role` or secret key in the browser config.
