# Dataset Request Desk — Backend

Backend for an internal platform used by a robotics data-collection company.
Clients submit **requests** for datasets ("200 episodes of a robot picking
cups by December"), operators fulfil them by assigning **episode** metadata
to requests, and clients accept or reject the delivery. Episodes are
*metadata only* — the actual recordings live outside this system.

## Stack

- Python 3.12+, FastAPI, Pydantic v2 / pydantic-settings
- PostgreSQL 16 + SQLAlchemy 2.x (sync) + Alembic migrations
- Auth: JWT bearer tokens (PyJWT), Argon2id password hashing (passlib)
- structlog for structured (JSON in Docker) request logging
- pytest + httpx test suite against a real PostgreSQL database

## Quick start (Docker)

```bash
cp .env.example .env          # defaults are fine for local dev
docker compose up --build
```

That single command: starts PostgreSQL, waits for it to be healthy, runs
`alembic upgrade head`, seeds the standard users, and serves the API on
http://localhost:8000 (interactive docs at http://localhost:8000/docs).

## Running without Docker

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg://desk:desk@localhost:5443/desk
alembic upgrade head
python -m app.seed seed/users.json
uvicorn app.main:app --reload
```

## Seed credentials (local test/demo only)

| email                  | password  | role     |
|------------------------|-----------|----------|
| admin@example.com      | admin123  | admin    |
| ops1@example.com       | ops123    | operator |
| ops2@example.com       | ops123    | operator |
| client-a@example.com   | client123 | client   |
| client-b@example.com   | client123 | client   |

Only Argon2 hashes are stored in the database.

## Tests

```bash
# uses an isolated desk_test database on localhost:5439 (override with
# DATABASE_URL); schema is managed by Alembic, tables truncated per test
DATABASE_URL='postgresql+psycopg://desk:desk@localhost:5439/desk_test' \
  .venv/bin/python -m pytest
```

53 tests cover: login/RBAC, ownership scoping, the full transition matrix,
the delivery rule, assignment rules — including the capacity guard, the
unassign flow, and a real concurrency race — import idempotency against the
actual messy `seed/episodes.csv`, and all four analytics metrics.

## CSV episode import

CLI (recommended):

```bash
python -m app.cli import-episodes seed/episodes.csv
# inside the compose stack:
docker compose exec api python -m app.cli import-episodes seed/episodes_large.csv
```

Operator-only API endpoint: `POST /episodes/import` (multipart CSV upload) —
also available in the UI on the Episodes page (Upload CSV).

Both are idempotent — re-running against the same file never creates
duplicates — and report exactly what happened:

```text
Episode import complete

Total rows: 190
Imported:   173
Duplicate:  3
Invalid:    14

Reasons:
  invalid duration: 3  e.g. EP-00018, EP-00017, EP-90003
  invalid quality: 2   e.g. EP-00019, EP-00020
  ...
```

Import rules (full rationale in `NOTES.md`): whitespace/casing normalized
for quality and robot ids; ISO and `DD/MM/YYYY HH:MM` dates accepted;
unknown robots (e.g. `arm-99`) are invalid and skipped, never invented;
fractional/negative/missing durations rejected; a malformed row never stops
the import.

## Analytics

```http
GET /analytics?from=2026-08-01T00:00:00Z&to=2026-09-01T00:00:00Z
```

Operator/admin only. Range is `[from, to)` — inclusive start, exclusive
end, UTC. Returns:

1. episodes recorded per day, per robot
2. request count by status
3. median time from `submitted` to `delivered` (from status-history
   timestamps; only requests delivered in the range contribute)
4. top 5 task names by number of `good` episodes

All aggregation is done in PostgreSQL (`GROUP BY`, `COUNT`,
`percentile_cont`, `ORDER BY ... LIMIT`); no table is ever loaded into
Python. See `NOTES.md` for how this behaves at millions of rows.

## API surface

| Method & path                              | Who                    | Purpose                                  |
|--------------------------------------------|------------------------|------------------------------------------|
| `POST /auth/login`                         | public                 | issue JWT                                |
| `GET /auth/me`                             | any authenticated      | current user (smoke test)                |
| `GET /health`                              | public                 | liveness + DB probe (Docker healthcheck) |
| `POST /requests`                           | client                 | create request (always owned by caller)  |
| `GET /requests`                            | client: own; operator/admin: all | list requests        |
| `GET /requests/{id}`                       | client: own; operator/admin: all | detail + history     |
| `POST /requests/{id}/transition`           | role per target status | workflow transitions + audit row         |
| `GET /requests/{id}/episodes`              | operator/admin         | assignments of a request                 |
| `POST /requests/{id}/assignments`          | operator/admin         | assign an episode (capacity + race-safe) |
| `DELETE /requests/{id}/assignments/{a_id}` | operator/admin         | unassign (audit row written; open requests only) |
| `GET /episodes`                            | operator/admin         | filter (task/quality/robot) + pagination |
| `POST /episodes/import`                    | operator/admin         | CSV import                               |
| `GET /analytics`                           | operator/admin         | the four metrics                         |
| `POST /users`, `GET /users[/{id}]`, `PATCH /users/{id}` | admin      | create users, deactivate, change roles   |

Ownership violations return **404** (not 403) so request ids are not
enumerable; deactivated users are rejected (403) even with a valid token.

## Project layout

```text
app/
├── api/          # FastAPI routers (thin: auth + validation only)
├── auth/         # password hashing, JWT, role dependencies
├── db/           # engine/session, model metadata for Alembic
├── models/       # SQLAlchemy models (users, requests, episodes, ...)
├── schemas/      # Pydantic request/response models
├── services/     # business logic: state machine, assignments, import, analytics
├── main.py       # app factory, routers, middleware
├── middleware.py # per-request structured logging
├── seed.py       # idempotent seed users
└── cli.py        # python -m app.cli import-episodes ...
alembic/          # migrations
seed/             # users.json, episodes.csv (messy), generate_episodes.py
tests/            # pytest suite (real PostgreSQL)
```

## Design decisions & known trade-offs

See `NOTES.md` — including the deliberate simplifications, the two security
risks that worry me most, and what breaks first at 10x users / 100x episodes.
