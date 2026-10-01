# API Meter

Full-stack API management platform: React + TypeScript (Vite) frontend, Node.js + Express + SQLite backend.

- **Auth**: register/login, bcrypt-hashed passwords, JWT sessions
- **Keys**: secrets shown once, only a SHA-256 hash + prefix stored; scopes (`read`, `write`, `admin`); per-minute rate limit; monthly quota; instant revoke
- **Real HTTP gateway** (`/gateway/v1/*`): bearer validation -> revoked check -> rate limit -> quota -> scope check -> handler, with `X-RateLimit-*` headers and request logging
- **Analytics**: SQL aggregation for traffic over time, endpoint latency/error rates, status-code breakdown, per-key usage, request log
- **Dashboard**: quota meter, charts, key management, request log, and a Request Lab to call the gateway live

## Run locally

```bash
npm install
npm run dev        # web on :5173, API on :8787
```

Demo login: `demo@apimeter.dev` / `demo1234`. Demo key for the Request Lab: `am_live_demo_key_for_the_request_lab`.
Set `SEED_DEMO=false` to skip demo data (do this for a real deployment).

## Deploy

Set environment variable `JWT_SECRET` (see `.env.example`) on either platform.

**Vercel**: import the repo (or run `npx vercel`). `vercel.json` builds the Vite app and routes `/api/*` and `/gateway/*` to the serverless function in `api/index.ts`.

**Netlify**: import the repo (or run `npx netlify deploy --prod`). `netlify.toml` builds the app and routes the same paths to `netlify/functions/api.ts`.

## Important: SQLite on serverless

Serverless functions can only write to `/tmp`, so the SQLite file is **ephemeral** there: data resets on cold starts and is not shared between instances. That's fine for demos (the demo account re-seeds automatically) but not for real data. For persistent production use, run `npm start` on a VPS/Railway/Fly with a volume (the DB lives in `./data`), or swap `server/db.ts` for a hosted SQLite such as Turso/libSQL.
