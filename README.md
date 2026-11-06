# PCN Management

Private, single-user operational application for managing penalty charge notices, including manual capture, challenge tracking, PDF reporting and optional scheduled email notifications.

## Technology

- Next.js App Router with TypeScript
- Tailwind CSS and shadcn/ui conventions
- PostgreSQL with Prisma ORM and committed Prisma migrations
- Production multi-stage Docker image for Coolify

## Local development

### Requirements

- Node.js 24 LTS
- npm
- Docker Desktop with Docker Compose

Copy `.env.example` to `.env`. Its example `DATABASE_URL` matches the local Compose database. The credentials in Compose are for local development only; production credentials belong in Coolify environment variables. `.env` and `.env.local` are ignored by Git.

Start PostgreSQL and wait for its health check:

```sh
docker compose up -d
docker compose ps
```

The database listens only on `127.0.0.1:55432` because another local container already uses port 5432. Its data persists in the named `pcn_postgres_data` volume when the container stops or is recreated. Stop the database while keeping its data with:

```sh
docker compose down
```

To reset the local database and permanently delete its data, run:

```sh
docker compose down -v
```

Install dependencies, generate the Prisma client, and apply committed migrations locally:

```sh
npm ci
npm run db:generate
npm run db:deploy
```

`db:deploy` runs `prisma migrate deploy`, applying committed migrations without creating or resetting migrations. Use `npm run db:migrate` (`prisma migrate dev`) when developing a schema change and generating a new migration. Start the application with:

```sh
npm run dev
```

The application is available at `http://localhost:3000`. The health endpoint is `GET /api/health`.

### Administrator authentication

Every dashboard, PCN, report, upload and AI endpoint requires the single administrator session. There is no registration flow or public account creation. Create a stable session secret:

```sh
npx auth secret
```

`npx auth secret` creates a random `AUTH_SECRET`. Set the following environment variables, apply migrations, then run `npm run admin:setup` in an interactive terminal with access to the same PostgreSQL database. The command reads a password and confirmation without echoing or printing them, hashes the password with Argon2id, and stores only the hash in PostgreSQL. Use a unique password of at least 14 characters. It refuses to overwrite an existing account. To change the password later, explicitly run `npm run admin:reset` in the same environment. Keep database backups before a reset.

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Stable random secret used to encrypt/sign Auth.js sessions. |
| `ADMIN_USERNAME` | The sole administrator username. |
| `ADMIN_EMAIL` | Administrator email and personal reminder recipient. |
| `AUTH_URL` | Public HTTPS application URL in production. |

The login form uses standard `username` and `current-password` autocomplete fields for browser password managers. Sessions are HTTP-only, `SameSite=Lax`, secure cookies in production, and expire after eight hours. Failed sign-ins are throttled after five attempts per administrator/client address in fifteen minutes. Correct credentials are never rejected due to another client's failures. Cloudflare Tunnel should pass `CF-Connecting-IP`; Coolify's trusted proxy should pass the original client as the first `X-Forwarded-For` address. If neither is valid, there is no shared lockout key. This process-local guard resets on restart and is not a distributed rate limiter.

Keep `AUTH_SECRET` unchanged across redeployments or every administrator session will be invalidated. Set `AUTH_URL` to the exact public HTTPS origin, including the `https://` scheme, and ensure Cloudflare/Coolify forward the public host and HTTPS scheme. Incorrect forwarded headers or a changing `AUTH_SECRET` can cause session loss on refresh. Coolify terminates TLS at its reverse proxy and the application sets secure cookies in production. Do not expose the container port directly to the internet.

### AI-assisted PCN capture

Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` to enable PCN document extraction. The default model is `gpt-4.1-mini`. The capture workflow sends a selected photo or PDF to the OpenAI Responses API only for the extraction request and does not save the document in this application or database. Requests set `store: false`, which disables response storage. Review OpenAI's retention terms for your account before using this feature with live documents.

Without an API key, the capture page provides a clear manual-entry fallback.

### Automated reports and reminders

Weekly management reports always use the fixed recipient in application configuration. A `SENT` record means Resend accepted the message, not that it reached the recipient’s inbox. Production email variables, domain verification, and Coolify schedules are documented in [Coolify deployment](#coolify-deployment).

To test the configured database connection without changing data:

```sh
npm run db:test
```

## Quality checks

```sh
npm run lint
npm run typecheck
npm run db:validate
npm run test:auth
npm run build
```

## Coolify deployment

Configure the application as a Dockerfile-based resource sourced from the GitHub `main` branch. Deployments are triggered manually in Coolify. PostgreSQL must be a separate Coolify resource; this image does not contain a database.

### Runtime environment

Create these values as Coolify secrets. Do not put them in Git, Docker build arguments, browser code, or scheduled-task command output.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Internal PostgreSQL URL from the separate Coolify database resource. Keep the database private to the Coolify network. |
| `AUTH_SECRET` | Yes | Stable random Auth.js session secret; generate it before first deployment. |
| `ADMIN_USERNAME` | Yes | Sole administrator login name. |
| `ADMIN_EMAIL` | Yes | Administrator account email and personal challenge/payment reminder recipient. |
| `AUTH_URL` | Yes | Exact public HTTPS origin; ensures Auth.js uses the correct callback origin behind proxies. |
| `OPENAI_API_KEY` | No | Enables AI extraction and challenge generation. Manual PCN/challenge workflows remain available without it. |
| `OPENAI_MODEL` | No | Vision-capable OpenAI model; defaults to `gpt-4.1-mini`. |
| `RESEND_API_KEY` | No | Enables management-report and personal-reminder delivery. |
| `EMAIL_FROM` | With Resend | A sender identity on a verified Resend domain. Verify the sender domain in Resend before enabling delivery. |
| `CRON_SECRET` | With scheduled tasks | Long random bearer secret accepted only by the two job endpoints. |
| `PORT` | No | Application port; defaults to `3000` |
| `HOSTNAME` | No | Bind address; defaults to `0.0.0.0` |

Expose port `3000` and configure the Coolify health check path as `/api/health`.

At every container start, `docker-entrypoint.sh` runs `prisma migrate deploy` before the Next.js process. The shell exits immediately if migration deployment fails, so the new application process cannot start. Once migrations succeed, `exec node server.js` starts Next.js with correct signal handling. Running the same deployment when no migrations are pending is safe.

For the database-backed administrator migration, first confirm a backup of the existing PostgreSQL resource and set `ADMIN_USERNAME`, `ADMIN_EMAIL`, `AUTH_SECRET`, `AUTH_URL`, and `DATABASE_URL` in Coolify. Deploy the new image once; its entrypoint applies the `User` migration before starting Next.js. Then open an **interactive terminal in the running application container** and run `npm run admin:setup`. Enter the password only at its hidden prompt. The account persists in the separate PostgreSQL resource across redeployments. After a successful login, remove the obsolete `ADMIN_PASSWORD_HASH` variable from Coolify and redeploy when convenient; the new code never reads it. If setup reports that an administrator already exists, do not rerun setup: use `npm run admin:reset` only when deliberately changing the password. Verify the login and a page refresh through the public HTTPS domain. Never run setup against a different database from the one used by the application.

The migration drops only the obsolete `LoginAttempt` table; it does not alter PCNs, vehicles, issuers, challenges, reports, reminders or job history. During a rolling replacement, the old image may briefly fail login after that table is dropped. Complete the deployment promptly and run administrator setup before testing login. Do not reset the database.

Do not override the image entrypoint with a custom start command. Normal releases do not require an SSH migration step. Never use `prisma migrate dev`, `prisma db push`, database resets, or automatic seeding in production.

The application and a prior deployment may briefly overlap while Coolify replaces containers. Future schema changes should therefore remain backwards-compatible with the previously running application whenever possible.

### First deployment and smoke test

1. Confirm the existing PostgreSQL resource is healthy, has persistent storage, and is on the same private Coolify network as the application.
2. Copy its **internal** PostgreSQL URL into `DATABASE_URL`; do not create another PostgreSQL container in this application.
3. Set the authentication secrets and, if applicable, the OpenAI, Resend, and scheduled-job secrets listed above.
4. Configure a Coolify HTTPS domain, leave the application port private, then manually deploy the GitHub `main` branch.
5. Confirm the deployment log shows `prisma migrate deploy` succeeds before `Starting PCN Management...`.
6. Visit `https://<your-domain>/api/health`, then sign in and create a fictional manual PCN. Confirm it appears in the PCN list, sign out, and verify the dashboard redirects to `/login`.
7. If AI or email is enabled, use only fictional data and a test recipient for the first extraction/report send. A Resend accepted status is not inbox-delivery confirmation.

Do not use `prisma migrate dev`, `prisma db push`, database resets, or automatic seed scripts in production.

### Scheduled jobs

Keep both endpoints private behind their bearer secret; administrator sessions do not authorise either route. Add these Coolify Scheduled Tasks to the **application** resource:

| Task | Cron | Command |
| --- | --- | --- |
| Weekly manager report | `*/5 * * * *` | `wget -qO- --header="Authorization: Bearer $CRON_SECRET" --post-data='' http://127.0.0.1:3000/api/jobs/weekly-report` |
| Personal reminders | `0 * * * *` | `wget -qO- --header="Authorization: Bearer $CRON_SECRET" --post-data='' http://127.0.0.1:3000/api/jobs/reminders` |

The frequent weekly trigger deliberately lets application code select Friday 07:00 in `Europe/London`, handling GMT/BST independently of the Coolify server timezone. Database job keys and email/reminder state prevent a repeated trigger or retry from duplicating an accepted report or notification. Coolify runs task cron expressions in the deployment-server timezone; see [scheduled tasks](https://coolify.io/docs/core/automation/scheduled-tasks/overview).

### Backup and recovery

The PostgreSQL resource's persistent volume survives container recreation, but it is not a backup. Configure scheduled PostgreSQL backups in Coolify, retain copies outside the server (for example S3-compatible storage), and test restoration into a disposable database before relying on a backup. Coolify documents both [database backups](https://coolify.io/docs/databases/backups) and [PostgreSQL restore](https://coolify.io/docs/databases/restore). Before a restore, stop application writes, take a fresh backup, and confirm the target database and reporting data scope; a restore can replace existing records.

### Manual device checklist

Real-device testing has not been performed by this repository. Before go-live, use the production HTTPS domain and complete this checklist with fictional data:

- On a phone, log in, use **New PCN** to open the rear camera/photo library, upload a supported PCN, and confirm upload/extraction feedback and manual fallback.
- On the phone, attach optional evidence while generating a challenge; confirm the file is not retained after the request.
- On a desktop, sign in as the same administrator and confirm the saved PCN, vehicle reuse, edited challenge, payment deadline, and reminder are visible from the shared PostgreSQL database.
- Download a weekly PDF on desktop and check readable pagination; use a test Resend recipient before enabling the manager report.
- Sign out on both devices, ensure protected pages/API requests no longer work, and confirm browser cookies are marked Secure over HTTPS.
- Confirm the two Coolify scheduled tasks return success with a non-production test recipient before enabling live email delivery.

## Database migrations

The committed Prisma migrations define the current PCN, challenge, report, reminder and notification-job schema. For a future development schema change, update `prisma/schema.prisma`, create and review a migration locally with `npm run db:migrate`, then commit the migration directory. Production applies only committed migrations via `prisma migrate deploy`.
