# SureAuto

**Before money moves, make sure.**

A responsive, verification-first frontend MVP for the Nigerian used-vehicle market. Built from the October 2026 commercial plan with React 19, TypeScript, Vite and Lucide icons. Fonts and listing assets are served locally.

## Run

```bash
npm ci
npm run dev
```

Vite listens on `0.0.0.0:5173` and permits Arena's `.e2b.app` preview hosts.

```bash
npm test        # 14 domain and jsdom interaction tests
npm run lint
npm run build
npm run preview
```

An optional real-browser smoke test is included:

```bash
npx playwright install chromium
# with the dev server already running:
npm run test:browser
```

If Chromium is preinstalled, use `CHROMIUM_PATH=/path/to/chromium npm run test:browser`. Browser downloads require access to Playwright's CDN and runtime system libraries. Real-browser tests could not be executed in the provided restricted sandbox; build, lint and all 14 unit/UI interaction tests passed. Screenshot output is ignored in `test-results/`.

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

SPA hosting must serve `index.html` for application paths including `/v/*`, `/sell`, `/check`, `/dealer/intake` and `/inspect/*`.

## Important scope boundaries

This is an interactive frontend prototype, **not a production verification or financial service**. All VINs, findings and vehicles are illustrative; listing images are AI-generated. The demo date is fixed to 8 October 2026 for deterministic freshness examples.

Saved vehicles, VIN searches and draft forms use browser localStorage; they are not synchronized, encrypted, authenticated or stored server-side. Actual inspections, registry lookups, payment, escrow, WhatsApp relay, QR certificates, immutable evidence, offline PWA support and signed assignment tokens are not implemented. Refresh requests explain their unavailable status and never alter a finding or take payment.

See [the product and commercial review](docs/PRODUCT_REVIEW.md) for pricing contradictions, unsupported claims, privacy/legal assumptions, a production architecture outline and launch acceptance gates.

## Layout

- `src/App.tsx`: workspace screens and demo workflows.
- `src/domain.ts`: sample data, VIN syntax, freshness, quote and mileage rules.
- `src/App.css`: responsive desktop/mobile and printable passport styles.
- `tests/`: domain, interaction and optional browser tests.
- `public/images/`: local illustrative listing images.
