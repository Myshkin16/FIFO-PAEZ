# Deploy guide — Slices 3 → 4 (you-side)

The code is complete: Slices 1 (Next.js scaffold), 2 (Neon + real route
handlers), and 3 (Clerk auth) are merged into the `cloud-rewrite` branch
on GitHub. What's left is the **interactive provisioning** you have to
do once because it involves creating accounts and clicking dashboards.

Estimated total time the first run-through: **30–45 minutes**.

---

## Prerequisites — one-time accounts

1. **Vercel** — sign up at <https://vercel.com> with GitHub OAuth. Free
   Hobby plan is enough for everything below EXCEPT the 60s function
   timeout we need for imports; upgrade to **Pro ($20/mo)** before
   Slice 4 production. Preview deploys work on Hobby.
2. **Neon** — auto-provisioned through Vercel Marketplace, no separate
   sign-up needed.
3. **Clerk** — sign up at <https://dashboard.clerk.com>, free dev tier
   covers single-user usage.

---

## Step 1 — Vercel CLI + project link

```powershell
# Install once globally
npm i -g vercel

# Sign in to your Vercel account (opens browser)
vercel login

# From the repo root, link the project. When prompted:
#   Set up "FIFO-PAEZ"? → Y
#   Which scope? → your personal account
#   Link to existing project? → N
#   Project name? → fifo-paez (or whatever)
#   Code root directory? → ./web        ← IMPORTANT, choose web/
#   Framework? → Next.js (auto-detected)
#   Want to override build settings? → N
cd web
vercel link
```

After this, `web/.vercel/project.json` exists and the project shows up
in your Vercel dashboard.

---

## Step 2 — Provision Neon Postgres

In the Vercel dashboard:

1. Open your `fifo-paez` project → **Storage** tab.
2. Click **Create Database** → **Marketplace** → **Neon**.
3. Region: pick the closest one (Frankfurt for Spain).
4. Plan: **Free** (0.5 GB is plenty for ~10k transactions).
5. Click **Create**. Vercel auto-injects `DATABASE_URL` (and a few
   aliases like `POSTGRES_URL`) into Preview and Production env vars.

Pull them into your local `.env.local`:

```powershell
cd web
vercel env pull .env.local
```

You should now see `DATABASE_URL=postgres://...neon.tech/...` in
`web/.env.local`.

---

## Step 3 — Generate ENCRYPTION_SECRET

This 32+ char random key encrypts your Kraken API key at rest. **Keep
it identical between local dev and Vercel** or saved Kraken keys won't
decrypt.

```powershell
# Generate
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → outputs e.g. 7a3f9b...

# Set in Vercel (for Production AND Preview AND Development)
vercel env add ENCRYPTION_SECRET production
# paste the value when prompted
vercel env add ENCRYPTION_SECRET preview
vercel env add ENCRYPTION_SECRET development

# Re-pull so .env.local has it too
vercel env pull .env.local
```

---

## Step 4 — Clerk app + allowlist

1. Go to <https://dashboard.clerk.com> → **+ Create application**.
2. Name: `FIFO IRPF`. Sign-in methods: **Email + Google** (or only
   Email). Click **Create application**.
3. **Configure → API Keys** → copy both:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_test_…`)
   - `CLERK_SECRET_KEY` (starts with `sk_test_…`)
4. Add them to Vercel:
   ```powershell
   vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
   vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY preview
   vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY development
   vercel env add CLERK_SECRET_KEY production
   vercel env add CLERK_SECRET_KEY preview
   vercel env add CLERK_SECRET_KEY development
   vercel env pull .env.local
   ```
5. **Lock to your email only** — Clerk dashboard:
   **Configure → User & Authentication → Restrictions** →
   - Enable **Allowlist**.
   - Add `sezaru11@gmail.com` (or whichever address).
   - Toggle **Sign-up restriction: Allowlist only**.
   - Anyone trying to sign up with another email is rejected.

---

## Step 5 — Apply schema + seed data

From `web/`:

```powershell
# Creates transactions, price_cache, config, schema_migrations tables.
npm run db:migrate

# Copies your existing 109 transactions + 90 price-cache entries from
# backend/crypto_fifo.db into Neon. Idempotent (ON CONFLICT DO NOTHING).
# Encrypted Kraken keys are intentionally NOT copied — re-enter in the
# cloud UI after Step 7.
npm run db:seed-from-sqlite
```

Expected output:
```
[migrate] transactions: 109 rows
[migrate]   imported: 109, duplicates: 0
[migrate] price_cache: 89 rows
[migrate]   upserted: 89
[migrate] Done.
```

---

## Step 6 — Local smoke test

```powershell
cd web
npm run dev
```

Visit <http://localhost:3030>. Expected:
- Redirected to `/sign-in`.
- Sign in with the allowlisted email → land on Resumen 2025.
- KPI cards show the real numbers (~-489.66 € G/P, 56 ops, 7 avisos).
- Click "Importar" → modal opens. Sign in to Kraken keys NOT yet
  configured.
- Click "Operaciones" → 56 rows visible, table sorted by date.
- Click "Exportar" → CSV downloads.

If anything is wrong, fix it before Step 7.

---

## Step 7 — Preview deploy

```powershell
cd web
vercel
```

This creates a preview URL like `fifo-paez-xxx.vercel.app`. Open it.
Same expectations as Step 6 (sign-in then real data).

Re-enter Kraken keys here (they don't survive the SQLite → Postgres
migration on purpose — different ENCRYPTION_SECRET could mean different
ciphertext anyway).

If everything checks out, move to production.

---

## Step 8 — Production deploy

> **Confirm Pro plan is active before this step** — Hobby's 10s function
> timeout will break the Binance import.

```powershell
cd web
vercel --prod
```

Production URL printed. Same smoke test as Step 6. Done.

---

## Future ops

| Action | Command |
|---|---|
| New deploy after code change | push to `cloud-rewrite` (preview auto) or `vercel --prod` from web/ |
| Rerun migrations | `cd web && npm run db:migrate` |
| Pull latest env into local | `cd web && vercel env pull .env.local` |
| View runtime logs | `vercel logs <deployment-url>` or `vercel logs --follow` |
| Roll back | Vercel dashboard → Deployments → previous READY → Promote |
| Local re-seed (clean reimport) | edit script or use `psql` directly via `DATABASE_URL` |

---

## Costs (free-tier ceilings as of 2026-05)

| Service | Plan | Limit | When you exceed |
|---|---|---|---|
| Vercel | Hobby (free) | 10s function timeout | Imports will time out — upgrade to Pro ($20/mo) |
| Vercel | Pro | 60s default, 300s with Workflow | Likely never |
| Neon | Free | 0.5 GB storage, 100 active hours/mo | Likely never for single-user FIFO data |
| Clerk | Free dev | 10k MAU | Likely never (you're 1 MAU) |

If you stay on Pro, **expected total: $20/month**. Both Neon and Clerk
are free at this usage profile.

---

## Things to know

- **Backups**: Neon's Free tier includes 7-day point-in-time recovery.
  Slice C.6 in the original plan adds an in-app backup endpoint;
  defer until needed.
- **The `backend/` and `frontend/` folders stay in the repo** as
  reference until the cloud version is production-stable. They're
  excluded from deploy via `.vercelignore`. After several weeks of
  green production we can delete them in a single commit.
- **Re-importing CSVs**: works the same in cloud as it did locally —
  `INSERT OR IGNORE` dedup is now `ON CONFLICT DO NOTHING`. Same
  semantics.
- **Slice 3 gating is opt-out for ANY route**. If you ever expose a
  truly public endpoint (e.g. a Stripe webhook), add it to the
  `isPublicRoute` matcher in `web/proxy.js`.
