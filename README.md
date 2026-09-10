# Pointline

Pointline is a lightweight PI planning estimation room with a team-owned estimate and an optional AI-assisted second opinion. It supports hidden/open planning rounds, story-to-service allocations, domain rollups, and CSV/text backlog import.

## Run locally

Pointline requires PostgreSQL for its Node runtime. Start a PostgreSQL instance, then set the bootstrap credentials and connection string:

```powershell
$env:POINTLINE_BOOTSTRAP_ADMIN_USERNAME = 'admin'
$env:POINTLINE_BOOTSTRAP_ADMIN_PASSWORD = 'replace-with-a-random-password'
$env:DATABASE_URL = 'postgresql://pointline:password@localhost:5432/pointline'
.\start-pointline.ps1
```

Open [http://localhost:8787/](http://localhost:8787/). Local accounts and room data are stored in the PostgreSQL database configured by `DATABASE_URL`.

## Self-host with Docker

Copy `.env.example` to `.env`, replace both example passwords, and start the persistent containers:

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

Open [http://localhost:8787/](http://localhost:8787/). Accounts and room data are stored in the `pointline-postgres-data` Docker volume. The bootstrap credentials create the first admin account on first sign-in.

To hand someone the built image instead of the source, run `docker save -o pointline.tar pointline:latest`; they can load it with `docker load -i pointline.tar` and run it with the same environment variables and PostgreSQL connection string.

## Application stack

- React and Vite provide the frontend build and browser entrypoint.
- Node and Fastify provide the HTTP server in Docker and hosted deployments.
- Drizzle defines the relational schema and migrations.
- PostgreSQL is the required database for the Node runtime, using the generated migrations under `drizzle-postgres`.

The React bundle is served by Fastify, and the Node API module handles the application routes directly.

## Hosted accounts and persistence

The hosted Node service uses Pointline username/password accounts and the configured PostgreSQL database. The first admin account is bootstrapped from `POINTLINE_BOOTSTRAP_ADMIN_USERNAME` and `POINTLINE_BOOTSTRAP_ADMIN_PASSWORD` runtime values.

After sign-in:

- each Pointline account is stored in the configured database and automatically joins the shared PI71 Planning room;
- the Rooms page creates separate planning rooms with their own story queue and membership;
- the Team page creates reusable teams and workspace admins can group those teams into trains; invite links can add a person to a team, add a person to a room, or bring a team into a room;
- stories, final manual/AI fields, services, domains, allocations, and round state persist in the configured database;
- votes are stored per account, story, and round;
- hidden rounds return only your own vote plus the submitted count; open and revealed rounds return the room’s votes;
- the browser opens an authenticated WebSocket for room state updates while open, with the existing SSE stream as a transport fallback so teammates can estimate the same story concurrently.

The Estimates view keeps one active story in focus for the room. Each participant can submit a separate vote for that story, and hidden votes remain private until the round is revealed.

The database schema is defined in [db/schema.ts](db/schema.ts), and the generated migrations are under [drizzle](drizzle) and [drizzle-postgres](drizzle-postgres). The Node API is composed from the small services under [server/services](server/services), routed by [server/routes/api-router.js](server/routes/api-router.js), and served by [server/node-server.mjs](server/node-server.mjs).

An admin creates member accounts from the Admin users page, then copies each credential pair to the teammate through a private channel.

The Admin page can export a versioned JSON backup containing accounts, rooms, room memberships, trains, teams, epics, stories, estimates, capacity, planning rounds, votes, and invites. Importing the backup into another instance merges records by their IDs and maps matching usernames, so the workspace can continue without recreating the planning data. Sessions are intentionally not exported; imported users sign in again.

## Deployment

Build and run the Node service with the included Dockerfile or with `npm start`. The server listens on `0.0.0.0` and honors the hosting platform's `PORT` value.

For a low-resource public test deployment, [render.yaml](render.yaml) defines a free Render Docker web service. Set its `DATABASE_URL` secret to the Supabase PostgreSQL session-pooler connection string; application data then lives outside the Render web-service filesystem and survives web-service restarts.
