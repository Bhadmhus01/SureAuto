# SureAuto

**Before money moves, make sure.**

A verification-first React/TypeScript workspace with a persistent Fastify/PostgreSQL inspection workflow. Fonts and listing assets are served locally.

## New: full-stack verification pilot

Open **`/verification`** (or choose **Verification workflow** in the sidebar) to run the complete sandbox sequence:

**VIN quote → request → simulated confirmation → inspector assignment → private evidence upload → report → independent QA → published passport.**

The buyer, inspector and QA screens have role-controlled API access. Each sandbox gets its own isolated workspace. The PostgreSQL-backed workflow survives page reloads and API restarts; the original discovery collection remains separate illustrative content.

See [Verification pilot — runbook, security boundaries and scope](docs/VERIFICATION_PILOT.md).

## Run

```bash
npm ci
npm run dev
```

Requires Node 22.12+. `npm run dev` starts both API (3001) and Vite (5173) in sandbox mode. Vite permits Arena's `.e2b.app` preview hosts and proxies relative `/api` requests. The embedded PostgreSQL database lives in ignored `.data/postgres`; set `DATABASE_URL` to use a PostgreSQL server instead. Do not share a database between sandbox and live environments.

For HTTPS embedded previews: `COOKIE_SECURE=true COOKIE_EMBEDDED=true npm run dev`. Do not set these flags for ordinary local HTTP development. Production requires a separate database, `NODE_ENV=production`, `DATABASE_URL`, and `COOKIE_SECURE=true`; sandbox startup is refused in production.

```bash
npm test        # domain, UI, API, authentication and persistence tests
npm run lint
npm run build
npm run preview
```

An optional real-browser smoke test is included:

```bash
npx playwright install chromium
# with the dev server already running:
npm run test:browser
npm run test:workflow:browser
```

If Chromium is preinstalled, set `CHROMIUM_PATH=/path/to/chromium`. Real-browser tests for discovery and the new workflow passed using Chromium with a locally supplied runtime. Screenshot output is ignored in `test-results/`.

For PostgreSQL adapter tests, set `TEST_DATABASE_URL` to a disposable test database. CI provisions PostgreSQL 17; never use a production database for tests.

## Restricted pilot deployment

A Docker Compose reference stack provides PostgreSQL, a non-root API, a same-origin Nginx SPA/API proxy, readiness checks and production startup guards. It binds the web listener to loopback for an external TLS proxy, keeps public registration disabled by default in production, and has no payment/registry provider clients. It is a restricted single-node pilot baseline, not a general public-production approval. See [Deployment runbook](docs/DEPLOYMENT.md) for TLS, proxy trust, account limitations and backup/restore requirements.

Authenticated live accounts can change their password after re-entering the current password; the change revokes other sessions and rotates the current session. Email verification, password recovery and staff MFA are not implemented, so keep access restricted.

## Demo flows

- Overview and vehicle discovery: search, make/location/price filters, sort and saved vehicles.
- `/check`: VIN syntax validation and freshness-based quotes.
- `/v/2T2BZMCA0JC123456`: all six sample findings fresh, ₦0 view.
- `/v/WDDWF4JB0HR123456`: one stale theft finding, ₦2,500 quote.
- `/v/1HGCM82633A123456`: unknown VIN record, six missing findings, ₦15,000 quote.
- `/sell`: local seller application drafts.
- `/dealer/intake`: sample historical-mileage comparison. Try Lexus VIN above and 20,000 km for a 45,000 km discrepancy.
- `/inspect/demo`: local field-inspection drafts. Photo input does not upload or retain photos.
- Passport print layout (save PDF via browser), copyable links, help and local preferences.

The new `/verification` and `/passport/*` routes also require SPA fallback. Proxy `/api/*` to the backend **before** the SPA catch-all. SPA hosting must serve `index.html` for application paths including `/v/*`, `/sell`, `/check`, `/dealer/intake` and `/inspect/*`.

## Important scope boundaries

**No live registry checks, payment processing or commercial inspection service are activated.** Sandbox confirmations never move money, and all sandbox findings stay visibly labeled in their own URL namespace. Registry checks remain unavailable rather than being reported clear.

The **original discovery prototype** uses AI-generated images and illustrative VINs/findings, fixed to 8 October 2026. Its saved vehicles, seller forms and draft inspections remain browser-local. The **new verification workspace** uses real server persistence, authenticated roles, private compressed evidence and QA publication. It uses a proposed ₦18,000 field-visit quote instead of the prototype's ₦2,500 remote-check pricing.

The new workflow is a tested pilot implementation, **not a production launch approval**. See the runbook for remaining security, privacy, operational and payment-integration gates. [The commercial review](docs/PRODUCT_REVIEW.md) documents the original plan's pricing contradictions and unsupported claims.

## Layout

- `server/`: Fastify API, PostgreSQL adapters/migrations, authentication, pricing and state transitions.
- `src/workflow/`: buyer, inspector, QA and public passport interfaces.
- `src/App.tsx`: workspace screens and demo workflows.
- `src/domain.ts`: sample data, VIN syntax, freshness, quote and mileage rules.
- `src/App.css`: responsive desktop/mobile and printable passport styles.
- `tests/`: domain, interaction and optional browser tests.
- `public/images/`: local illustrative listing images.
