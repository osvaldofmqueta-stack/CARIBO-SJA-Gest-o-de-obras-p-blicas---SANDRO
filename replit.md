# Caribo SJA — Gestão e Fiscalização de Obras

Sistema web para registar obras públicas, acompanhar contratos e progresso físico-financeiro, documentar fiscalizações e gerir ocorrências.

## Run & Operate

- In Replit, use the Run button to start the two registered application services: `artifacts/api-server: API Server` and `artifacts/fiscaliza-caribo: web`. The Canvas preview service is not needed to run the app.
- Install JavaScript dependencies with `pnpm install --frozen-lockfile`; Python dependencies are declared in `pyproject.toml` and locked in `uv.lock`.
- The frontend is served at `/` and Django at `/api` through Replit's shared proxy. Service workflows supply their ports and frontend base path.
- A fresh database receives the existing Django migrations on API startup. No accounts or demo records are created automatically.
- Before signing in, create the initial gestor from an interactive Shell using `python artifacts/api-server/manage.py bootstrap_manager`. Enter the name, email and password there, not in chat. For automated setup, the command also accepts `--email`, `--name`, `--password-env` and `--confirmation-env`; the two password variables must be distinct Replit Secrets.
- On Windows, run `installer.bat` and choose the Neon option to run the web app locally against the existing Neon database. The installer asks for the connection URL with hidden input, validates connectivity and migration status without changing the Neon schema, then stores the URL encrypted for that Windows user with DPAPI. It does not copy demo data or install local PostgreSQL in Neon mode. Each PC needs an authorized Neon URL entered locally; do not place connection strings in project files. Neon mode writes to the shared database, but photos uploaded from a PC stay in its local storage and Replit App Storage photos may not load on that PC.
- The Windows installer uses `uv sync --frozen --no-install-project` to install the locked Python dependencies without trying to install the workspace root as a Python package.
- `pnpm --filter @workspace/fiscaliza-caribo run dev` — run the React/Vite web interface
- API workflow — Django REST Framework in `artifacts/api-server` (port 8080, proxied under `/api`)
- `python artifacts/api-server/manage.py check` — validate the Django application
- `python artifacts/api-server/manage.py makemigrations works` — create Django model migrations
- `python artifacts/api-server/manage.py migrate` — apply database migrations
- `python artifacts/api-server/manage.py bootstrap_manager` — create or activate the initial gestor interactively
- `python artifacts/api-server/manage.py seed_demo` — synchronize demonstration records
- `python artifacts/api-server/manage.py test works` — run access and API tests
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `SESSION_SECRET` and a PostgreSQL connection URL. Set `CARIBO_DATABASE_URL` as a Replit Secret to use an external database such as Neon; it takes priority over Replit's managed `DATABASE_URL`. Without it, Django uses `DATABASE_URL`. Switching the active URL does not copy or delete data between databases.

## Stack

- Frontend: React, Vite, TypeScript, Tailwind CSS
- API: Python 3.11, Django 5, Django REST Framework
- Database: PostgreSQL through Django ORM and psycopg
- API contract and generated frontend hooks: OpenAPI 3.1 and Orval
- The API is Django; do not add a parallel Node API.

## Where things live

- `artifacts/fiscaliza-caribo/` — dashboard and CRUD web interface
- `artifacts/api-server/config/` — Django settings and URL routing
- `artifacts/api-server/works/` — obra, fiscalização, ocorrência, access, audit and migration code
- `lib/api-spec/openapi.yaml` — source of truth for the API contract
- `lib/api-client-react/` — generated React Query client and session-aware fetcher
- `lib/api-zod/` — generated Zod schemas from the API contract
- `scripts/post-merge.sh` — installs workspace dependencies and applies Django migrations after merges
- `attached_assets/` — project-provided images and other assets

## Architecture decisions

- Django serves the existing `/api` route and is the only application API.
- The frontend uses the generated React client from the workspace OpenAPI contract.
- Application sign-in uses individual email/password accounts with Django sessions and CSRF protection.
- Account provisioning is manager-only; public signup is disabled.
- Django migrations are the source of truth for database schema changes.
- Inspections update a work's latest reported physical progress; contract and paid values use precise decimals.
- Demo records use relative dates and stable references so `seed_demo` can run repeatedly without duplicates.
- Preserve historic audit attribution and legacy account identifiers when changing authentication or access logic.

## Access and audit

- The landing page is public; the dashboard and every data endpoint require an authenticated Django session and an active `AccessProfile`.
- `AccessProfile.user` links an account to `gestor`, `fiscal` or `consulta`; the legacy provider identifier is retained for history. Missing and inactive profiles are denied by default.
- Gestores can manage works and create, edit and delete field records. Fiscais can read works and create/edit inspections and occurrences. Consulta profiles can only read.
- Gestores manage application accounts and roles from the app. The `/admin/` site remains a separate staff-only Django interface.
- `AuditEvent` records API and admin create/update/delete actions with the responsible identity and before/after values. Inspection progress updates to a work are recorded too.
- Existing passwords cannot be migrated; a gestor must set new passwords for existing accounts.
- Run `bootstrap_manager` in the target environment to initialize the first gestor. It prompts for the password in the terminal.
- Keep the OpenAPI cookie security declaration aligned with Django's session authentication.

## Product

The first release covers an operational dashboard, searchable work register, work detail pages, inspection records, issue tracking and summary reports. It uses Angolan provinces, Portuguese labels, AOA/Kz and Africa/Luanda dates. Seeded records are illustrative, not Caribo SJA accounting or contract data.

## User preferences

- The product is for the Caribo SJA context and should be delivered in Portuguese.
- The backend should use Python and Django.

## Gotchas

- The API artifact's development command applies migrations before starting Django.
- Regenerate API clients after modifying `lib/api-spec/openapi.yaml`.
- Keep all product routes under the registered artifact paths; these workspace directories are managed by Replit.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
