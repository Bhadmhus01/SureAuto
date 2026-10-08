# SureAuto — product and commercial review

Reviewed against the supplied October 2026 v2.1 plan. This is a product/design assessment, not a legal opinion or independent validation of market statistics.

## Recommendation

Launch a Lagos-only, buyer-paid verification service first. Keep VIN passports independent of marketplace listings. Publish dated, attributable findings, their limitations and their freshness; do not sell an unconditional “safe vehicle” guarantee. Build inspection operations and quality control before settlement, financing, nationwide inventory or automatic government integrations.

The compelling wedge is reusable due diligence, not another classified marketplace. The interface built here demonstrates that wedge, with sample discovery as a secondary entry point.

## Material corrections before commercial use

| Plan assumption | Issue | Recommended change |
| --- | --- | --- |
| 100,000 circulating vehicles; over 80% imported through salvage auctions; 10–15% certification premium | No evidence supplied. Auction origin does not by itself establish severe damage. | Source defensible research, define population and timeframe, and remove claims from customer copy until validated. Test premium and time-to-sale using matched cohorts. |
| “Definitive” Customs verification; 365-day validity | A product refresh policy cannot guarantee enforcement outcomes or document validity. Access and coverage are not established. | Contract access, disclose authority/source/time/coverage and distinguish document review from authoritative validation. Use “checked on” instead of guaranteed legal validity. |
| Vehicle facts are categorically outside personal data | VINs and identifiers can link to identifiable owners. Documents may disclose identity, addresses and signatures. | Obtain Nigerian privacy counsel; conduct a data protection impact assessment, redact evidence, restrict public fields and implement lawful basis, access, retention, correction and deletion processes. Do not publish raw customs numbers by default. |
| Append-only forever | Immutable records may conflict with correction, retention and deletion requirements. | Append-only finding/revision history with access-controlled evidence, redaction and lawful deletion. Show corrected/superseded results instead of retaining misleading public claims. |
| An “escrow license” is required | This is an unverified legal characterization; actual obligations depend on the arrangement and partner activities. | Validate structure with Nigerian counsel and a licensed partner. Keep funds outside SureAuto custody; reconcile signed partner callbacks and build dispute procedures before launch. |
| Camera capture, EXIF and GPS are tamper-proof | Browser capture preferences do not block gallery use or prove physical presence. EXIF, clocks and GPS can be manipulated. | Authenticated assignment tokens, server receipt times, challenge captures, evidence hashes, upload signing, device signals and human QA. Describe these as fraud mitigations, not guarantees. |
| Mileage drop proves rollback | Units, clerical mistakes or instrument replacement may explain a drop. | Preserve original unit and normalized km, document source, flag discrepancy and escalate for review. Never automatically allege fraud. |
| Touts and carjackers are completely locked out | A relay does not remove all safety risk. | Rate limits, verified contact, consent, abuse reporting, vetted hub operating procedures and clear safety advice. |

## Pricing and forecast reconciliation

1. **First full bundle:** ₦15,000 less ₦7,500 inspector payout less ₦1,500 registry fees equals ₦6,000 contribution (40%), before payment fees, travel, rework, refunds and customer support. This conflicts with the 50–100% buyer-check margin headline unless mix and cost definitions are provided.
2. **Physical refresh:** At ₦2,500, a condition/inspection refresh requiring a new field visit loses at least ₦5,000 before other costs. “Zero field labor” applies only to genuinely remote checks. Retain ₦2,500 for eligible remote refreshes; separate dispatch pricing or explicitly fund a subsidy. The demo quotes the supplied model but does not execute it.
3. **Free reuse:** Viewing a fresh check creates no direct revenue. A forecast must separate unique inspected vehicles, individual check events, full bundles, remote refreshes, free views and seller audits. The term “VIN checks” currently mixes incompatible units.
4. **Dealer pack:** ₦50,000 / 30 credits = approximately ₦1,667 per credit. Define whether a credit is one remote check or one six-point physical bundle. Bundles would be materially loss-making with stated costs. Include expiry, utilization, exclusions and dispatch surcharge assumptions.
5. **Year 1 top-down check:** If 18,000 checks meant paid ₦15,000 bundles, buyer revenue alone would be ₦270M, exceeding the stated ₦182.5M total. If individual ₦2,500 events, it would be ₦45M. Neither interpretation is reconciled in the plan.
6. **Illustrative Year 1 components:** 18,000 individual paid events × ₦2,500 = ₦45M; 2,400 audits × ₦18,000–₦25,000 = ₦43.2M–₦60M; 120 dealers × 12 months × ₦50,000 = ₦72M assuming all active for the full year. Total: ₦160.2M–₦177M before settlement. The missing revenue, onboarding ramp, overlaps and credit redemption treatment need explanation; this is not a substitute forecast.
7. **Escrow cap:** At 1%, the ₦50,000 cap is reached at ₦5M; at 1.5%, at approximately ₦3.33M. Many used vehicles could hit the cap, so revenue should be modeled per completed transaction, not GMV × headline rate. Track eligible, settled and failed GMV separately.
8. **Capacity:** 18,000 full field inspections a year / 15 inspectors / 250 working days = 4.8 inspections per inspector per working day. Validate travel, capture duration, cancellations, coverage and QA capacity before relying on this throughput.
9. EBITDA arithmetic in the supplied table reconciles, but cash flow, taxes, capex, financing, working capital and liability reserves are absent. Profitability is not established by the table alone.

## What this repository implements

- Responsive React/TypeScript workspace with discovery, make/location/budget/search/sort filtering and saved vehicles.
- `/check` lookup with 17-character VIN syntax validation (not vehicle authenticity or manufacturer check-digit validation).
- `/v/[vin]` sample passports, separate check freshness, free reuse and missing/stale quotes. Unknown VINs render a history record rather than a 404. Demo dates are fixed to 8 October 2026.
- Printable proof summary and copyable VIN link. Browser print can save PDF; no signed PDF, QR verification or offline PWA is implemented.
- `/sell` seller application drafts saved locally; no personal contact fields exposed.
- `/dealer/intake` sample historical-mileage comparisons with cautious discrepancy warnings.
- `/inspect/demo` inspection drafts for VIN, odometer, OBD observations, chassis/flood and paint depths; photo input is capture practice only and files are not persisted.
- Help, local preferences, notifications explanation and data reset.
- Fourteen automated domain and jsdom interaction tests.

**This is a frontend MVP prototype, not an operating verification platform.** There is no shared durable database, real account identity, registry access, live inspection dispatch, encrypted private data store, WhatsApp relay, payment processing or bank integration. AI-generated car images, synthetic VINs and sample findings are not purchasable listings or genuine certificates.

## Production architecture and acceptance gates

### 1. Identity and record service

Use an authenticated API with PostgreSQL. Separate `vehicles`, `listings`, `check_events`, `evidence`, `orders`, `inspector_assignments`, `private_contacts`, `audit_reviews` and `provider_callbacks`. A finding includes VIN, check kind, source, source timestamp, server timestamp, outcome (`clear / issue / inconclusive / unavailable`), limitations, expiry, evidence hash and superseded event ID. Freshness and outcome are separate dimensions: a fresh adverse finding must never display as a verified-clear badge.

Public projections contain only approved redacted fields. Restrict owner data, inspection details that create a security risk, and document evidence by role. Database transactions, authorization and revision audit tests are launch gates. Browser storage is not a production datastore.

### 2. Orders and reusable-check pricing

Quote on the server with a short-lived quote ID and price version. Recheck freshness before charging; handle concurrent requests for the same VIN/check with deduplication and explicit payer agreement. Model remote and field costs separately. Never mark a result clear on payment. Orders progress through quote, payment confirmation, assignment, capture, QA approval and published finding; failures produce inconclusive status and documented refund/retry policy.

### 3. Inspection operations

Authenticate inspectors, bind one-time expiring tokens to assignments, and upload compressed evidence through signed URLs with retry/resume. Distinguish queued capture from submitted evidence. Hash originals server-side and retain provenance. Senior QA approves before publication/payout; apply a documented random secondary-audit policy and grievance process. Prefer local partner hubs and scheduled dispatch initially; proximity assignment requires actual inspector availability and safety constraints.

### 4. Provider integrations

Obtain commercial/legal authorization for Customs, police and foreign-history providers. Record data coverage and unavailable responses. Never map a provider outage or empty response to “clear”. Implement retries, timeouts, idempotent signed callbacks and reconciliation. Keep sandbox/live modes visibly separated.

### 5. Share and privacy controls

Produce server-issued, versioned proof artifacts with a QR pointing to a canonical live record. Offline artifacts must state their issue time and that status may have changed. A QR is a route to evidence, not cryptographic proof by itself. Secure seller relay with consent, contact verification, anti-spam limits and delivery logging. Do not expose NINs, home addresses or full raw documents in public URLs.

### 6. Settlement only after the trust wedge

Contract a licensed partner, legal-review agreements, define transaction acceptance/dispute conditions, and use server-verified callbacks with dual-control release and reconciliation. Never offer a real escrow call-to-action without those controls and operating support.

## Revised execution sequence

- **Pilot:** 50–100 supervised Lagos inspections; reconcile per-check costs, verify evidence quality, establish refunds, audit trail and customer terms.
- **Trust wedge:** Authenticated canonical records, orders, QA approval, source transparency and bank/provider sandbox integrations. Validate reuse rate, paid conversion, incident/dispute rate, evidence completeness and fully loaded contribution.
- **Supply workflow:** Seller consent/relay, contracted hubs, dealer packs with well-defined credits; inventory remains optional.
- **Expansion:** Abuja only after tested dispatch density and positive local contribution. Settlement and financing are separate gated projects, not prerequisites for verification utility.

Prefer defined customer outcomes over “WhatsApp forward rate”: distinguish share clicks from actual forwards (which may not be observable), and track share-link visits and assisted conversion without covert contact collection.
