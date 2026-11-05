# AGENTS.md

## Mission

Build and maintain the PCN management application described in `PROJECT_CONTEXT.md`. Read that file before planning or modifying features. Treat it as the product source of truth; flag contradictions rather than expanding scope silently.

## Working style

- Work in small, testable increments. Explain the intended change briefly before major implementation.
- Prefer simple, practical solutions over abstraction and speculative features.
- Ask only when a missing decision blocks safe progress; otherwise state a reasonable assumption.
- Do not add a manager portal, image archive, payment collection, adjudication workflow or automatic appeal submission unless explicitly requested.
- Do not claim code, tests or deployments succeeded unless actually verified.
- Never expose secrets or production data in output, commits or logs.

## Stack and code conventions

- Next.js with TypeScript; Tailwind CSS and shadcn/ui for UI.
- PostgreSQL with Prisma for data access and migrations.
- Use the Next.js App Router unless the repository establishes otherwise.
- Prefer server-side database operations; validate all inputs at the server boundary.
- Keep UI components small, accessible, responsive and keyboard-usable.
- Make desktop workflows efficient and mobile capture minimal.
- Follow existing project conventions once established. Avoid unnecessary dependencies.
- Use explicit types; avoid `any` unless justified.

## Data, privacy and AI

- Store structured PCN metadata, statuses, dates and optional notes only as required by the product.
- Do not persist original PCN photos, invoices or evidence files to the database, filesystem or object storage.
- For temporary uploads, validate MIME type and size; handle large phone photos with client-side resizing/compression when appropriate, preserving legibility. Avoid platform request-size limits.
- Never log raw uploaded documents, images or secrets. Handle temporary data only for the duration needed; document any unavoidable provider retention.
- AI output is untrusted: validate its JSON against a schema and require human confirmation of extracted details.
- AI-generated appeals must be editable and reviewed by the operator. Never auto-submit appeals.
- Do not fabricate legal grounds, evidence, dates, links or outcomes. Use the user's selected challenge reason and verified facts.
- The core application must remain usable if AI is disabled, unavailable or over budget.

## Database and migrations

- Define and evolve schema with Prisma migrations committed to Git.
- Use `prisma migrate dev` only in development to create migrations.
- Use `prisma migrate deploy` in production; never `prisma migrate dev`, `prisma db push` or destructive resets against production.
- On every Coolify deployment, run pending migrations before starting the production Next.js process. If migration fails, exit non-zero and do not start that new process.
- Include the Prisma schema, migration directory, required Prisma CLI/runtime and generated client in the Docker build/runtime as appropriate to the chosen Prisma version.
- Ensure `DATABASE_URL` is supplied via Coolify environment/secrets, not hard-coded.
- Use a robust startup script/entrypoint, correct signal handling (`exec` for the app process), and a health check. Consider database readiness and avoid infinite retry loops.
- Do not assume migrations can be safely rolled back automatically. Prefer backwards-compatible migrations and explain risky/destructive schema changes before applying them.
- Where deployments can overlap, account for migration concurrency and the existing app's compatibility with schema changes.
- Never run migrations during `next build`.

## Coolify and Docker

- App and PostgreSQL are separate Coolify resources.
- GitHub `main` is the deployment source; deployment is manually triggered in Coolify.
- Use a production-ready Dockerfile with reproducible dependency installation and a small runtime image where practical.
- Document environment variables, build/start commands, migration behaviour and health checks in the README.
- Keep deployment idempotent: redeploying with no pending migrations must be safe.
- Never require manual SSH migration commands for normal releases.

## PCN workflow constraints

- Track the PCN number, registration, council, location, contravention code, dates, challenge status and payment status.
- Keep challenge status and payment status distinct.
- A challenge is submitted only when the operator confirms manual submission.
- A payment is marked paid only when the operator confirms it; optional reference is not mandatory.
- Remind two days before known payment deadlines; distinguish missing deadlines from overdue ones.
- Do not infer a definitive payment deadline without sufficient information; allow correction.
- Portal URLs must come from a maintained, verified directory, not generated guesses.
- Weekly and monthly reporting should focus on operational status, not monetary savings.

## Verification before completion

- Run the project's formatter/linter, TypeScript check and relevant tests where available.
- Test validation, status transitions, deadline reminders and JSON extraction with representative fixtures that contain no real personal/company data.
- Verify that production build succeeds and that the Docker startup sequence invokes migrations before Next.js.
- Verify that a failed migration prevents the new app process from starting.
- Summarise files changed, commands run, results and any remaining manual steps.
