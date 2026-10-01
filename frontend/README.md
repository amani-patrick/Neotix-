# Dataset Request Desk — Frontend

React + TypeScript + Vite + Tailwind interface for the Dataset Request Desk
backend. Thin, role-aware UI over the API: the backend remains the source of
truth for auth, workflow rules, episode availability, and assignments.

## Prerequisites

- Node 20+
- The backend running (see `../backend/README.md`), or Docker Compose from
  the repository root.

## Setup

```bash
npm install
cp .env.example .env     # point VITE_API_BASE_URL at your backend
npm run dev              # http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:8000`, so the
default `VITE_API_BASE_URL=/api` works out of the box in development.

## Production build

```bash
npm run build            # outputs dist/
npm run preview          # serve the production bundle locally
```

## Docker

From the repository root:

```bash
docker compose up --build
```

The `frontend` service is a multi-stage build: Node builds the static
bundle, nginx serves it on port 3000 and reverse-proxies `/api/*` to the
`api` service — same-origin, so no CORS is involved in production.

## Environment variables

| Variable            | Default                 | Purpose                        |
|---------------------|-------------------------|--------------------------------|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend API base URL (public)  |

No secrets belong in `VITE_*` variables — they are embedded in the bundle.

## Testing

```bash
npm run test             # Vitest (see tests/)
```

## Project structure

```text
src/
├── api/          # centralized client + typed endpoint functions
├── auth/         # AuthProvider (session, 401 handling), route guards
├── components/
│   ├── layout/   # role-aware app shell
│   └── ui/       # Button, inputs, badges, states, dialogs, pagination
├── pages/        # login, dashboard, requests, episodes, analytics, users
├── router/       # routes + RequireAuth/RequireRole
└── types/        # API contract types (mirror backend schemas)
```

## Seed credentials (local dev)

Same as the backend: `client-a@example.com` / `client123`,
`ops1@example.com` / `ops123`, `admin@example.com` / `admin123` (see
`../backend/README.md` for the full table).
