# Dataset Request Desk

Internal platform for a robotics data-collection company: clients submit
**dataset requests** ("200 episodes of a robot picking cups by December"),
operators fulfil them by assigning existing **episode** metadata, and clients
accept or reject the delivery. Recordings themselves live outside this
system — only metadata and the workflow around them.

| Service  | Tech                                                        | Runs on            |
|----------|-------------------------------------------------------------|--------------------|
| Backend  | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16  | http://localhost:8000 |
| Frontend | React 18, TypeScript (strict), Vite, Tailwind, TanStack Query | http://localhost:3000 |
| Database | PostgreSQL 16                                               | localhost:5443     |

## Quick start (one command)

```bash
docker compose up --build
```

From a clean clone this: starts PostgreSQL, waits for it to be healthy, runs
migrations (`alembic upgrade head`), seeds the standard users, starts the API,
and serves the frontend with an nginx `/api` reverse proxy — no CORS, no
manual steps.

Then open **http://localhost:3000** and log in:

| email                | password  | role     |
|----------------------|-----------|----------|
| admin@example.com    | admin123  | admin    |
| ops1@example.com     | ops123    | operator |
| ops2@example.com     | ops123    | operator |
| client-a@example.com | client123 | client   |
| client-b@example.com | client123 | client   |

API docs: http://localhost:8000/docs · Health: http://localhost:8000/health

## Import the demo episode data

```bash
docker compose exec api python -m app.cli import-episodes seed/episodes.csv
```

Idempotent: re-running never creates duplicates. The bundled
`backend/seed/episodes.csv` is intentionally messy (duplicates, unknown
robots, bad dates/durations); the importer reports exactly what it did.

## Tests

```bash
# backend (47 tests, real PostgreSQL on localhost:5439)
cd backend
DATABASE_URL='postgresql+psycopg://desk:desk@localhost:5439/desk_test' \
  .venv/bin/python -m pytest   # or: python -m pytest

# frontend (6 tests)
cd frontend
npm install
npm run test
```

## Development without Docker

- **Backend**: see `backend/README.md` (venv, `alembic upgrade head`,
  `python -m app.seed`, `uvicorn app.main:app --reload`).
- **Frontend**: see `frontend/README.md` (`npm run dev` on :5173, proxies
  `/api` to :8000).

## Layout

```text
backend/    FastAPI service, migrations, tests, seed data
frontend/   React SPA (multi-stage Docker build, nginx + /api proxy)
docker-compose.yml   postgres + api + frontend (this file)
```

Design notes, security analysis, and scale discussion: see
`backend/NOTES.md`.
