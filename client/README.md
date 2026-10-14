# FreshChain client (React + Vite)

Frontend for the AI and data-integrity based food traceability and freshness prediction system.
API contract: `../docs/API_CONTRACT.md`. The client only talks to `/api/v1` endpoints from that contract.

## Commands

```bash
npm install          # install pinned dependencies
npm run dev          # dev server on http://localhost:5173
npm run build        # production build into dist/
npm run preview      # serve the production build
npm test             # Vitest + React Testing Library (jsdom, axios mocked), single run
npm run test:watch   # watch mode
```

## Configuration

`VITE_API_URL` (default `http://localhost:4000/api/v1`). Copy `.env.example` to `.env` to override.

## Structure

`src/app` routes and providers, `src/layouts`, `src/pages` (public, admin, batches, ops), `src/features` (auth, analytics, alerts, batches),
`src/components` (ui, charts, domain), `src/services` (axios client + one module per feature), `src/hooks`, `src/utils`, `src/test`.

## Notes

- JWT is kept in memory and mirrored to `localStorage` (`ft_token`); any 401 outside `/auth/login` logs the user out.
- Route role gating is a UI convenience only; the server enforces authorization.
- Charts read only from `/analytics/*` and show empty states when there is no data.
- "Data integrity" uses `POST /batches/:batchId/verify` (recompute SHA-256 vs stored hash). Freshness values are estimates, not proof of safety.
- Public pages: `/`, `/login`, `/register`, `/scan`, `/verify/:batchId`. Authenticated app lives under `/app`.
