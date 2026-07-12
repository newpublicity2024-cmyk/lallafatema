# Observability activation runbook (Phase 8.4)

Everything below is INERT in code until these steps run at cutover (Phase 8.5).

## 1. Sentry
1. Create a Sentry project (platform: Next.js). Copy the DSN.
2. In Vercel env (Production + Preview), set:
   - `SENTRY_DSN` = the DSN
   - `NEXT_PUBLIC_SENTRY_DSN` = the same DSN
   - `SENTRY_TRACES_SAMPLE_RATE` = `0.1` (tune later)
3. For readable stack traces, also set (build-time): `SENTRY_AUTH_TOKEN`,
   `SENTRY_ORG`, `SENTRY_PROJECT`.
4. **Rebuild** (the public DSN is inlined at build time — a redeploy without a
   rebuild will not activate the browser SDK).
5. Trigger a test error and confirm it appears in Sentry.

## 2. Uptime monitor
Endpoint: `https://lallafatema.ma/healthz` → `200 {"status":"ok"}`.
- Provider options: **Cloudflare Health Checks** (recommended once Cloudflare
  fronts the site), **UptimeRobot** (free), or **Better Stack**.
- Poll every 1–5 min; alert to email/Slack.
- Optional DB readiness monitor: set `HEALTHCHECK_SECRET` in Vercel, then point a
  second monitor at `https://lallafatema.ma/healthz?deep=<secret>` (or send the
  `x-health-secret` header). A 503 means Neon is unreachable.

## 3. R2 object versioning
1. In Cloudflare → R2 → the media bucket → enable **Object Versioning**.
2. Add a lifecycle rule expiring **noncurrent** versions after ~30 days (caps cost
   while protecting against accidental overwrite/delete of uploaded media).
3. No app code change — the S3 storage adapter is unaffected.
