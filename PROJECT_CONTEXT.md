# PROJECT_CONTEXT.md

## Project overview

A private, single-user PCN (Penalty Charge Notice) management application for a UK delivery operation. The operator receives PCNs, prepares and manually submits challenges on the relevant issuing authority's website, tracks decisions and payment status, and sends concise reports to the drivers' manager.

**Primary goal:** prevent missed challenges, decisions and payment deadlines while minimising repetitive administration. This is not a fleet management suite, accounting system or document archive.

## Users and access

- One administrator/operator uses the application.
- The drivers' manager does not need an account or dashboard; they receive reports/messages.
- Desktop-first for reviewing and submitting appeals, with a minimal mobile PCN capture workflow.
- Use authentication for the private admin application. Authentication provider and implementation are not yet selected.

## Agreed technology and deployment

- Next.js, TypeScript, Tailwind CSS, shadcn/ui.
- PostgreSQL with Prisma ORM and Prisma Migrate.
- Docker deployment on a self-hosted Coolify server.
- Two separate Coolify resources: application and PostgreSQL database.
- Source in GitHub; operator manually triggers deployments from the `main` branch in Coolify.
- On deployment, run `prisma migrate deploy` **before** starting the production Next.js server. A migration failure must prevent the new application process from starting. Include migration files and necessary Prisma tooling in the production image. Do not use `prisma db push` for production schema changes.
- Deployment specifics (Dockerfile, entrypoint, health checks, environment variables, database readiness) are to be implemented and verified by Codex.

## Core PCN data

Store only what is useful for tracking and reporting:

- PCN reference/number (unique where appropriate)
- Vehicle registration
- Issuing authority/council
- Contravention location/street
- Contravention code and description when available
- PCN issue date; relevant challenge and payment deadlines where known
- Driver identifier/name where available
- Challenge reason/category
- Challenge submission date and current status
- Decision/outcome and decision date
- Payment due date, payment status, date confirmed paid and optional payment reference
- Optional brief notes
- Timestamps for record creation and updates

Do not assume all deadlines can be derived reliably from the PCN issue date. Allow review and correction of extracted dates, especially after decisions.

## Statuses and workflow

1. **New / awaiting challenge:** operator receives the PCN.
2. **Challenge submitted / awaiting decision:** operator manually submits the appeal on the authority's website and records submission.
3. **Accepted / cancelled:** mark the PCN closed.
4. **Rejected:** track payment required, any further action handled outside this application, and the applicable payment deadline.
5. **Paid / closed:** mark payment confirmed; optional payment reference.
6. **Overdue:** flag an outstanding payment after its due date.

A rejected challenge does not mean the application initiates further appeals, adjudication or court proceedings. Company policy is that drivers are responsible for their PCNs; the app does **not** manage how payment is funded, collected or arranged.

## Mobile capture

- Simple **Add PCN** action with camera capture or image/file selection.
- Optionally use an AI API to extract PCN number, vehicle registration, issuing authority, location/street, contravention code and dates.
- Present extracted data for human review/edit before saving.
- Save the structured PCN record, **not the source photograph**.
- The operator may capture a PCN before having supporting evidence.

## Evidence and AI-assisted drafting

- The normal challenge is loading/unloading during a delivery, often supported by a delivery invoice.
- Other challenge reasons and supporting evidence types must remain possible.
- Operator chooses a challenge reason and evidence type (e.g. delivery invoice, other evidence, none).
- Optional AI API integration can analyse a PCN and, when available, an invoice or other evidence, then draft an editable appeal.
- AI must not invent facts, delivery details, legal exemptions or evidence. It must identify uncertainty and let the operator correct fields.
- Operator reviews the draft, copies the appeal text and submits it manually through the authority's portal.
- Do not permanently store uploaded PCN photographs, invoice images or PDFs. Temporary processing is allowed when necessary; minimise retention, avoid logging file contents and make provider-side retention explicit in implementation documentation.
- Avoid repeated uploads: when documents are available together, process them in the same session/request if practical. When evidence arrives later, allow a new temporary upload without requiring permanent storage.
- AI integration is desirable but should be optional; manual data entry and tracking must work without an API key.
- Exact AI model/provider, budget controls and any decision to persist appeal text are not finalised.

## Authority appeal portal directory

- Maintain a small editable mapping of issuing authority to its verified appeal portal URL.
- Show an **Open appeal portal** action on each PCN.
- Prefer stored, verified links over AI-generated URLs.
- Allow updating broken links without code changes.
- Do not assume a common appeal URL structure across councils.

## Reminders and reporting

- Highlight payment deadlines and generate a reminder **two days before** a deadline.
- Provide a ready-to-copy message to the manager to remind the relevant driver; sending automatically is not required initially.
- Weekly manager report: PCNs challenged, pending decisions, accepted/rejected outcomes, payments outstanding and deadlines approaching.
- Monthly report: same overview, with optional modest success-rate summary; avoid emphasising money saved.
- Reports should be clear, concise and easy to copy/share.
- Do not build a manager-facing dashboard or login in the initial version.

## Design priorities

1. Fast data entry and clear statuses.
2. Reliable deadlines and payment tracking.
3. Simple mobile capture; comfortable desktop workflow.
4. Low operating costs and optional AI.
5. No permanent evidence/image archive.
6. Small, maintainable codebase; avoid speculative features.

## Open decisions (do not silently invent)

- Application name, repository name and domain.
- Authentication approach.
- AI provider/model and whether to store generated appeal text.
- Exact fields and deadline rules for different PCN types/authorities.
- How reminders are scheduled or displayed and whether messages are ever sent automatically.
- Report format and delivery method.
- Initial authority portal list.

Implement iteratively and ask before making choices that materially affect product scope or ongoing cost.
