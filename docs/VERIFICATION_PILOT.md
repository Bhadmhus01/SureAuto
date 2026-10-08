# Verification workflow milestone

## Scope delivered

`/verification` is a full-stack pilot workflow separate from the original illustrative discovery collection. It supports:

1. Buyer account/session → VIN quote from the server.
2. Idempotent order creation; one active dispatch per VIN per workspace.
3. Explicit **sandbox-only** confirmation, with no funds moved.
4. Administrator dispatch to an inspector in the same workspace.
5. Assigned-inspector evidence upload and structured condition/OBD report.
6. QA return/revision or independent publication with explicit public redaction confirmation.
7. Dated public passport with source, limitations, outcome and freshness as separate dimensions.
8. Zero-price reuse of fresh conclusive findings, including fresh adverse findings.

The old `/v/*` collection remains illustrative and is not imported into the server as trusted evidence. Its stale-check CTA leads to `/verification?vin=…`. Real workflow passports use `/passport/[vin]`; sandbox passports have a separate `/passport/sandbox/[workspace]/[vin]` namespace. Removing the sandbox path never turns it into a live record.

## Try the complete flow

1. Open `/verification`, then **Start sandbox workflow**.
2. Enter `1HGCM82633A123456`, request the quote, request inspection and simulate confirmation.
3. Switch to **Dispatch & QA**, select the order and assign the provided inspector.
4. Switch to **Field inspector**, open the order, upload two non-sensitive test photos (dashboard and B-pillar), enter observations and submit.
5. Switch to **Dispatch & QA**, review the evidence, write redacted public summaries/limitations, confirm redaction and publish. Alternatively return it with a QA note, then resubmit as inspector.
6. Open the passport. Copy its link or print/save PDF. It stays prominently marked as sandbox.
7. Switch to buyer and quote the same VIN again: fresh conclusive field findings cost ₦0. An issue remains visible; an inconclusive observation is not treated as completed reusable verification.

## Storage and runtime

- Fastify API on port 3001, React/Vite on port 5173. Browser calls use relative `/api` URLs; Vite proxies them without rewriting the Host header, allowing same-origin checks.
- Development: embedded PostgreSQL via PGlite, persisted at `.data/postgres`. This is a real PostgreSQL engine in one process, not a JSON mock. Only one API process may own an embedded data directory.
- Server PostgreSQL: set `DATABASE_URL`. The `pg` adapter uses transactions and row locks with the same schema/queries. CI includes a PostgreSQL 17 service to exercise this adapter. Managed PostgreSQL was not available for local execution in the sandbox.
- Versioned SQL migrations run on startup. Quotation, order transition, review and finding publication are transactional. Unique indexes prevent duplicate active dispatch and duplicate reviews. Identity sequence numbers order revisions when timestamps collide.
- Local data and uploaded image bytes are intentionally ignored by Git. Back up durable storage externally. This environment's local data is not a production backup or durability promise.

## Authentication and environment boundaries

- Live buyer registration cannot specify its role; unexpected fields are rejected. Public registration is disabled by default in production; operator-provisioned accounts can still sign in. Do not enable public registration until identity and abuse controls are ready. Passwords use per-account salts and scrypt. Sessions are random 256-bit tokens, stored only as SHA-256 hashes server-side, with 8-hour expiry.
- Live users can change a password after re-entering the current password. The password hash update, revocation of all sessions and creation of a rotated current session happen in one transaction. Email verification and self-service recovery are not implemented.
- Staff are provisioned by an operator-only CLI, never a public role selector. Set `SUREAUTO_STAFF_PASSWORD` through a secret manager or secure shell environment, then run `npm run staff:create -- admin admin@your-domain.example 'QA Lead'` against the live PostgreSQL database. Do not place passwords in CLI arguments, source files or chat.
- Sandbox startup generates an isolated workspace and three separate users. Role switching stays inside that workspace, is available only in sandbox mode, and revokes the previous session. Access expires after 7 days; this is **access expiry, not automatic data deletion**.
- Deployment mode is recorded in the database. Starting a live API against a sandbox database, or the reverse, fails. Production startup rejects sandbox mode and embedded-preview cookies, requires PostgreSQL and secure cookies, and exposes separate process-liveness/database-readiness probes. The Docker Compose reference is a restricted single-node pilot only; see [DEPLOYMENT.md](DEPLOYMENT.md).
- All writes require a custom same-origin header and reject a mismatched Origin. CORS is not enabled. Cookies are HttpOnly with SameSite=Strict by default. API responses disable caching and indexing. Authentication and process-local rate limits are installed; only enable proxy trust behind a private, forwarding-header-sanitizing proxy. Rate limits do not coordinate across replicas.
- For an HTTPS embedded preview only, `COOKIE_SECURE=true COOKIE_EMBEDDED=true` enables Secure, SameSite=None, Partitioned cookies. Same-origin write checks remain enabled. Ordinary local HTTP development should leave both settings off; deployed non-embedded HTTPS should use secure Strict cookies.

## Evidence and QA boundaries

- The API accepts JPEG/PNG/WebP, verifies that an image can actually be decoded, and limits uploads to 5 MB / 20 megapixels. It re-encodes at a maximum 1400×1400, strips metadata, and stores a SHA-256 of the received original and a SHA-256 of the retained derivative.
- **Original bytes are not retained.** The original hash records what was received; it does not make the retained derivative an archival original. Do not claim tamper-proof evidence, live-capture proof or a forensic chain of custody.
- Evidence is stored in PostgreSQL bytea for this small pilot, not served from a public directory. Only the assigned inspector or same-workspace admin can retrieve it. Buyers and anonymous visitors cannot access images or raw reports.
- Evidence IDs in a report must belong to the same order, including both dashboard and pillar slots. Reports must match the order VIN. Assignment write access expires after seven days; QA can renew it with a reason. Inspector report timestamps must fall within the assignment and no later than server time. The form timestamps observations at form opening; this is inspector-supplied provenance, not trusted sensor proof.
- Reports, QA reviews and published findings have no update/delete API. QA return creates a new report revision rather than overwriting the old one. This is application-level append-only behavior, **not a database administrator-proof ledger**.
- Publication cannot silently replace an inspector's adverse outcome. QA either preserves it or returns the report for revision. Public output includes only reviewed summary/limitations/source/time/outcome; private notes, evidence IDs, identities and contacts are excluded by explicit projection.
- Human redaction is a gate, not a guarantee. Automated privacy screening, lawful correction/redaction/removal tools, and proper retention controls remain required before real owner data is collected.

## Pricing decision

The proposed pilot price is **₦18,000 per on-site visit** for whichever condition/OBD checks require fresh observations. These two checks need field labor, so the original ₦2,500 remote-refresh model is not applied. This price is a configurable-business-policy starting point, not a validated margin promise.

Customs, theft, ownership and foreign history are explicitly unavailable and not included in the quote. The quote expires in 15 minutes; it is revalidated against findings when converted into an order. Fresh adverse findings remain free and visible. Inconclusive or expired findings require another field visit. Payment is not collected by this application.

## Tests

- Domain and UI regression tests for the original discovery prototype.
- New workflow UI tests for sandbox creation, quotes, live-role boundaries and service errors.
- API tests covering authentication, CSRF/origin checks, duplicate dispatch, idempotency, workspace isolation, evidence hashes/access, report guards, QA returns/revisions, publication projection, fresh adverse reuse and quote expiry.
- Persistence test closes and reopens a disk-backed database and verifies orders **and sessions** survive; it also rejects environment-mode mixing.
- Live-mode auth tests verify hashed passwords, buyer-only registration, no sandbox escalation, revoked logout sessions and disabled confirmation.
- Real Chromium smoke tests passed for both the old discovery UI and the complete new workflow, including upload, publication, anonymous sharing, mobile overflow, print and reload. Screenshots stay ignored under `test-results/`.

## Not ready for unsupervised commercial use

Still required: verified email/password recovery; MFA for staff; external security review; deployment rate limiting across replicas; backup/restore and disaster recovery; encryption at rest with managed keys; external object storage/upload resilience; offline capture; original-evidence retention policy; privacy deletion/correction workflow; monitoring; scheduling/customer support; inspection quality and payout operations; licensed verification data; payment callbacks, reconciliation/refunds; commercial terms and liability coverage.

The non-sandbox API deliberately refuses payment confirmation rather than offering a backdoor to mark money received. No real order can pass that boundary until an authorized payment/operational confirmation integration is implemented. A sandbox role switcher demonstrates the stages; it is not a claim that a commercial service is already operating.
