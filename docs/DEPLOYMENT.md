# Single-node pilot deployment

This repository includes a Docker Compose reference stack for a **restricted, single-node pilot**. It is not a turnkey public-service approval or high-availability design.

## Included controls

- PostgreSQL 17 persists live data in a named Docker volume. Live and sandbox modes must use separate databases.
- The API and static web image run as non-root users with read-only root filesystems, dropped Linux capabilities and no-new-privileges.
- The browser and API share one origin. Nginx proxies `/api/` before the SPA fallback, sets security headers and only exposes its HTTP listener on host loopback.
- API readiness probes execute a database query; liveness probes only verify that the process responds.
- `NODE_ENV=production` refuses sandbox mode, missing `DATABASE_URL`, insecure cookies and embedded-preview cookies. `COOKIE_SECURE=true` is required.
- Public registration is **off by default** in production. The server can expose it only when `PUBLIC_REGISTRATION_ENABLED=true` is deliberately set. Do not enable it until verified identity/recovery and abuse controls are ready.
- The Compose networks are internal and the API is not host-published. The stack has no payment or registry clients, credentials, callbacks or egress path to providers.

The application still does not provide email verification, self-service password recovery or staff MFA. Live users can change a password after re-entering the current one; the change revokes all other sessions and rotates the current session. The current eight-hour session lifetime remains. Keep this pilot access-restricted until the remaining account and privacy controls have received review.

## Requirements and first start

Install Docker Engine and the Docker Compose v2 plugin on a Linux host. Put a maintained TLS reverse proxy in front of the loopback listener. Generate a URL-safe random database password (hex is recommended because it needs no URL encoding):

```sh
umask 077
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 32)
SUREAUTO_PORT=8080
PUBLIC_REGISTRATION_ENABLED=false
EOF

docker compose config --quiet
docker compose up --build -d
docker compose ps
curl -fsS http://127.0.0.1:8080/api/health/ready
```

`.env` is ignored by Git. Store the production copy in an approved secret-management system; do not add it to source control or support tickets. The sample stack creates an operator-provisioned live environment and keeps all provider integrations disabled.

## TLS reverse proxy and client IPs

The web service binds to `127.0.0.1:${SUREAUTO_PORT:-8080}`. It is not intended to be exposed directly to the Internet. Configure the host's TLS proxy to:

1. Redirect HTTP to HTTPS and manage/renew certificates. Add HSTS at this public TLS edge after verifying the domain configuration.
2. Forward the original `Host` header so same-origin write protection continues to match browser requests.
3. Replace (not append to) any client-supplied `X-Forwarded-For` with the actual connecting client IP.
4. Be the only public route to the loopback port. Do not publish the API port or expose the Docker web port on a public interface.

The API sets `TRUST_PROXY=true` in Compose so its in-process rate limits can use the forwarded client address. This is safe only while the web/API services remain private and the edge proxy sanitizes that header. If changing the network topology, reassess this trust boundary before deployment. Keep a single API replica: the current rate-limit counters are process-local and migration startup is not coordinated for rolling multi-replica deployments.

The Nginx image serves `/verification`, `/passport/*`, `/v/*`, `/sell`, `/check`, `/dealer/intake` and `/inspect/*` through the SPA fallback. It serves content-security and other browser security headers. TLS/HSTS policy belongs at the external TLS terminator because the inner Nginx listener is HTTP.

## Staff provisioning

After the API has started once and initialized `deployment_mode`, provision a staff user from a secure operator shell. This does not create a public account or enable a provider integration:

```sh
read -r -s -p 'Staff password: ' SUREAUTO_STAFF_PASSWORD; echo
export SUREAUTO_STAFF_PASSWORD
docker compose exec -e SUREAUTO_STAFF_PASSWORD api \
  node server/create-staff.mjs admin qa@example.invalid 'QA Lead'
unset SUREAUTO_STAFF_PASSWORD
```

Use role `inspector` or `admin` as needed. Choose a unique, long password and transmit it through an approved secure channel. Do not put it in command arguments, shell history, source files or chat. Staff MFA is not implemented yet, so use only supervised pilot accounts and restrict access at the edge.

For a manually provisioned buyer account, use the operator-only provisioner with `SUREAUTO_ACCOUNT_PASSWORD`:

```sh
read -r -s -p 'Buyer password: ' SUREAUTO_ACCOUNT_PASSWORD; echo
export SUREAUTO_ACCOUNT_PASSWORD
docker compose exec -e SUREAUTO_ACCOUNT_PASSWORD api \
  node server/create-account.mjs buyer buyer@example.invalid 'Pilot Buyer'
unset SUREAUTO_ACCOUNT_PASSWORD
```

`account:create` supports `buyer`, `inspector` and `admin`, and refuses sandbox databases. It is an operator tool, not an email-verification or password-recovery flow.

Production public sign-up remains closed unless the operator explicitly sets `PUBLIC_REGISTRATION_ENABLED=true`. That switch is not email verification; do not use it to invite the general public.

## Health, updates and data recovery

- Liveness: `GET /api/health/live` — process only; use for restart policy.
- Readiness: `GET /api/health/ready` — process plus PostgreSQL query; use before routing traffic.
- Status: `GET /api/health` — environment flags and explicit payment/registry integration status.

Back up the PostgreSQL volume to encrypted off-host storage, and test restoration into a separate disposable environment before relying on the backup:

```sh
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T db pg_dump -U sureauto -d sureauto -Fc > "sureauto-$stamp.dump"
```

Restore only to a stopped, disposable/staging database first:

```sh
docker compose stop api
docker compose exec -T db pg_restore -U sureauto -d sureauto --clean --if-exists < sureauto-backup.dump
docker compose start api
```

The named volume is not a backup. `docker compose down -v` **deletes** the persisted database volume. Back up before schema changes; migrations run at API startup. Review release notes and test the new image against a restored copy before a live upgrade.

The repository CI checks Node tests, lint, production build, dependency audit, Compose configuration and container image builds. It does not deploy to a cloud account or certify the host, TLS proxy, secret store, backups or operational procedures.

## Remaining release gates

Before broader or unsupervised production use: email verification and safe password recovery, staff MFA, independent security/privacy review, managed encryption and key rotation, externalized rate limits for horizontal scaling, automated encrypted backups and restore drills, retention/correction/deletion operations, monitoring/alerting, incident response and supervised support. Payments remain unimplemented and disabled; registry and theft/ownership sources remain unavailable. Do not represent absent provider results as clear or accept customer money through this app.
