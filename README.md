# Pointline

Pointline is a lightweight PI planning estimation room with a team-owned estimate and an optional AI-assisted second opinion. It supports hidden/open planning rounds, story-to-service allocations, domain rollups, and CSV/text backlog import.

## Run locally

From PowerShell:

```powershell
.\start-pointline.ps1
```

Open [http://localhost:4174/](http://localhost:4174/). The local server is a browser-only demo; durable accounts and shared data are enabled on the hosted Site.

## Hosted accounts and persistence

The hosted Site uses Sites’ built-in **Sign in with ChatGPT** flow and a small D1 database. No Google OAuth client, Supabase project, browser secret, or API key is required.

After sign-in:

- each ChatGPT identity is stored as an account and automatically joins the shared PI 24 room;
- the Rooms page creates separate planning rooms with their own story queue and membership;
- the Team page creates reusable teams, and invite links can add a person to a team, add a person to a room, or bring a team into a room;
- stories, final manual/AI fields, services, domains, allocations, and round state persist in D1;
- votes are stored per account, story, and round;
- hidden rounds return only your own vote plus the submitted count; open and revealed rounds return the room’s votes;
- the browser polls the room while open so teammates can estimate the same story concurrently.

The Estimates view keeps one active story in focus for the room. Each participant can submit a separate vote for that story, and hidden votes remain private until the round is revealed.

The D1 schema is defined in [db/schema.ts](db/schema.ts), and the generated migration is under [drizzle](drizzle). The Worker API is [server/index.js](server/index.js). `.openai/hosting.json` declares the logical D1 binding; Sites owns the actual database resource.

The current Site is private to its owner. To let teammates use it, change the Site audience in Sites sharing settings, then have each teammate open the Site and choose **Sign in with ChatGPT**.

## Deployment

The repository is connected to the Pointline Site source repository. A server-backed package must contain `dist/server/index.js`, the static assets, `dist/.openai/hosting.json`, and the generated D1 migration under `dist/.openai/drizzle/` before saving a new Site version.
