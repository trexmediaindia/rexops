# 06 — Block 1: Scaffold + Foundation + Vertical Slice

> The exact, buildable definition of the first block. When this is done, every architectural seam (01 §12) is
> proven by a working vertical slice and every later block is "run the generator + fill in the logic." Build it
> test-first (07). Nothing here invents new product scope — it's the foundation the whole roadmap (05) stands on.

---

## 1. What Block 1 delivers (one sentence)
A running, tenant-isolated `@rexops` monorepo — web + api + worker as three Docker images — with Better Auth,
the composable tenant guard + RBAC, Drizzle/Neon with the **full additive schema (02)** migrated, a generator
that scaffolds modules, CI with per-run Neon-branch isolation, observability, the outbox/job and Liveblocks
seams proven, and **one vertical slice (Agency → Client → Project → Deliverable) wired end-to-end** with login,
role-routed dashboard shells, and a complete tenancy test matrix.

## 2. Full file tree (everything that exists at DoD)

```
rexops/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── main.tsx, router.tsx, app.tsx
│   │   │   ├── lib/{api.ts (Eden), auth-client.ts (Better Auth), query.ts (TanStack), flags.ts}
│   │   │   ├── routes/
│   │   │   │   ├── _auth/login.tsx
│   │   │   │   ├── agency/{dashboard.tsx, clients/, projects/, deliverables/, team.tsx, settings.tsx}
│   │   │   │   ├── client/{home.tsx, projects/, review/}        # shells
│   │   │   │   └── admin/{agencies.tsx, audit.tsx}              # super-admin
│   │   │   ├── components/  (thin; real components live in @rexops/ui)
│   │   │   └── sw.ts, manifest.webmanifest                       # PWA stubs (B4 activates push)
│   │   ├── index.html, vite.config.ts, tailwind.config.ts, tsconfig.json, package.json
│   ├── api/
│   │   ├── src/
│   │   │   ├── app.ts            # builds + EXPORTS Elysia app (NO .listen); export type App
│   │   │   ├── index.ts          # imports app, .listen(env.API_PORT)
│   │   │   ├── plugins/{request-id.ts, error.ts, cors.ts, auth-guard.ts, openapi.ts, rate-limit.ts}
│   │   │   ├── modules/
│   │   │   │   ├── health/health.routes.ts                       # /healthz /readyz
│   │   │   │   ├── auth/auth.routes.ts                           # mounts Better Auth handler
│   │   │   │   ├── liveblocks/liveblocks.routes.ts               # POST /api/liveblocks-auth (scoped token)
│   │   │   │   ├── agencies/{*.routes.ts,*.service.ts,*.test.ts} # super-admin provisioning
│   │   │   │   ├── clients/{*.routes.ts,*.service.ts,*.test.ts}
│   │   │   │   ├── projects/{*.routes.ts,*.service.ts,*.test.ts}
│   │   │   │   └── deliverables/{*.routes.ts,*.service.ts,*.test.ts}
│   │   │   └── test/helpers.ts   # migrateTestDb, seed, truncate, signInAs
│   │   ├── tsconfig.json, package.json
│   └── worker/
│       ├── src/{index.ts, relay.ts (outbox→queue), processors/noop.ts}
│       ├── tsconfig.json, package.json
├── packages/
│   ├── db/
│   │   ├── src/
│   │   │   ├── client.ts                 # drizzle(neon-serverless Pool)
│   │   │   ├── schema/                    # FULL schema from 02, split per domain (one file per group)
│   │   │   │   ├── identity.ts (agency, client, audit_log, outbox)   ← Better Auth tables generated alongside
│   │   │   │   ├── work.ts (project, project_member, deliverable, task, placement, milestone, dependency, checklist)
│   │   │   │   ├── files.ts (file_version, upload_session)
│   │   │   │   ├── review.ts (pipeline, pipeline_stage, review_stage, approver, approval, comment, share)
│   │   │   │   ├── collab.ts (activity_event, channel, message, notification, push_subscription)
│   │   │   │   ├── fields.ts (custom_field_def, custom_field_value, saved_view)
│   │   │   │   ├── automation.ts (rule, intake_form, form_field, form_submission, template_pack, recurring_schedule)
│   │   │   │   └── enums.ts                # all canonical enums (02 §1)
│   │   │   ├── seed.ts                     # canonical demo dataset (00 §4) + default pipeline
│   │   │   └── index.ts
│   │   ├── drizzle/                        # generated migrations (committed)
│   │   ├── drizzle.config.ts               # uses DATABASE_URL_UNPOOLED
│   │   ├── tsconfig.json, package.json
│   ├── auth/src/index.ts                   # Better Auth config (organization + admin); export type Auth
│   ├── core/
│   │   └── src/
│   │       ├── tenancy/{guard.ts, rbac.ts, visibility.ts, guard.test.ts}   # S1 — unit-tested, no framework
│   │       ├── notify/outbox.ts            # write-to-outbox helper (S6 write path)
│   │       ├── review/state-machine.ts     # 03 §4 transitions (skeleton; B3 extends)
│   │       └── index.ts
│   ├── validators/src/{agency.ts, client.ts, project.ts, deliverable.ts, common.ts}  # Zod DTOs
│   ├── ui/                                  # design tokens (04 §2) + themed shadcn wrappers + EmptyState/StatusDot…
│   ├── jobs/src/{queues.ts, payloads.ts}    # BullMQ queue defs + typed payloads (S3)
│   └── config/
│       ├── src/{env.server.ts, env.client.ts, constants.ts}  # @t3-oss/env-core + Zod
│       ├── tsconfig.base.json, biome.json, dependency-cruiser.cjs
├── turbo/generators/{config.ts, templates/module/...}        # `turbo gen module` (S2)
├── docker/{Dockerfile.api, Dockerfile.worker, Dockerfile.web, Caddyfile}
├── .github/workflows/ci.yml
├── scripts/{setup, dev, test, check, db}                      # scripts-to-rule-them-all
├── docker-compose.yml, turbo.json, biome.json, lefthook.yml, commitlint.config.js
├── package.json (workspaces), tsconfig.json, .env.example, .gitignore
└── docs/  (these documents) + docs/adr/0001-stack.md, 0002-auth-tenancy-mapping.md
```

## 3. The vertical slice (proves every seam)

Four modules, each generated to the **identical shape** (`<r>.routes.ts` + `<r>.service.ts` + `<r>.test.ts`):

| Module | Routes (all `requireUser`, all tenant-scoped) | Notes |
|---|---|---|
| **agencies** | `POST /` (super-admin provision), `GET /:id`, `PATCH /:id` | Super-admin only; creates Better Auth org + owner; writes `audit_log` + `outbox(AGENCY_PROVISIONED)` |
| **clients** | `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `POST /:id/archive` | Agency-scoped; invite client user; writes `activity_event`(via outbox) |
| **projects** | `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, sub-project create | Scoped by agency + membership; `project_member` assign |
| **deliverables** | `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `POST /:id/transition` | Status transitions PENDING→IN_PROGRESS (T1) via the `core` state machine; upload/review are B2/B3 |

Every route goes through `authGuard.requireUser` → `Principal` → `core` guard (`scopeAgency` + record rules).
No service queries the DB without the guard. Mutations that imply a side effect write to `outbox` in the same tx
(proves S3); the worker's `noop` processor consumes one to prove the round-trip.

```ts
// shape of every service method (the generated template enforces this)
export async function listProjects(p: Principal) {
  return db.query.project.findMany({
    where: and(scopeAgency(p, project), recordRule_canSeeProject(p)),   // tenant + visibility
  });
}
```

## 4. Auth + tenancy build steps
1. `packages/auth`: `betterAuth({ database: drizzleAdapter(db,{provider:'pg'}), plugins:[organization(), admin()],
   user:{ additionalFields:{ role, specialty, agencyId, clientId } } })`. **[verify]** plugin APIs via Context7.
2. `bunx @better-auth/cli generate` → auth tables into `packages/db/schema`; commit + migrate.
3. `apps/api/plugins/auth-guard.ts`: session → `Principal` (01 §4).
4. `packages/core/tenancy`: `scopeAgency`, `canSeeInternal`, `visibleVersions`, record rules, `rbac` access-rights
   table per `(role, resource)`. **Unit-tested with no DB** (pure functions over fixtures).
5. Wire role-routed redirects in `apps/web/router.tsx`.

## 5. The generator (`turbo gen module <name>`) — S2
Emits, wired-up and consistent:
- `apps/api/src/modules/<name>/{<name>.routes.ts (Elysia + requireUser + tenant guard), <name>.service.ts (pure,
  guard-using), <name>.test.ts (happy + validation + authN + tenancy(404) skeleton)}`
- `packages/validators/<name>.ts` (Zod DTOs)
- a Drizzle table stub note pointing at the already-defined table in `02`/`schema`
- `apps/web/src/routes/<surface>/<name>/` (TanStack route + query hooks via Eden)
- registers the module in `apps/api/src/app.ts`
Result: a new resource is **one command + fill the blanks**, tenancy and tests already present.

## 6. Scripts-to-rule-them-all (GitHub convention → Bun/Turbo)
| Verb | `bun run …` | Does |
|---|---|---|
| bootstrap | `bun install` | deps only |
| **setup** | `setup` | install + copy `.env.example`→`.env` + compose up pg/redis + `db:migrate` + `db:seed` (clone→running <10 min) |
| dev | `dev` | `turbo dev` (web+api+worker+compose) |
| test | `test` | `turbo test` (affected) |
| check | `check` | typecheck + biome + boundaries (pre-PR gate) |
| db:* | `db:generate / db:migrate / db:seed / db:studio` | Drizzle Kit |
| gen | `turbo gen module <name>` | §5 |

## 7. Environment — committed `.env.example`
Validated at boot via `@t3-oss/env-core` + Zod (server vs `VITE_` client schema); a missing/blank var **fails the
process on start.** Right column = consuming image. (Groups per 01 §11; full annotated file:)
```bash
NODE_ENV=development                                  # api, worker, web(build)
API_PORT=3000                                         # api
API_URL=http://localhost:3000                         # api
WEB_URL=http://localhost:5173                         # api (CORS + Better Auth trustedOrigins)
DATABASE_URL=postgres://…-pooler…/db?sslmode=require  # api, worker (pooled)
DATABASE_URL_UNPOOLED=postgres://…/db?sslmode=require # migrations (direct)
BETTER_AUTH_SECRET=                                   # api (openssl rand -base64 32)
BETTER_AUTH_URL=http://localhost:3000                 # api
GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET=             # api (optional social)
RESEND_API_KEY= / EMAIL_FROM="RexOps <noreply@…>"     # api, worker (auth verify / invites)
R2_ACCOUNT_ID= / R2_ACCESS_KEY_ID= / R2_SECRET_ACCESS_KEY= / R2_BUCKET=rexops-media
R2_ENDPOINT=https://<acct>.r2.cloudflarestorage.com / R2_PUBLIC_BASE_URL=https://media.…   # api, worker (+web)
LIVEBLOCKS_SECRET_KEY=sk_dev_…                        # api (NEVER shipped to client)
REDIS_URL=redis://localhost:6379                      # api, worker (prod: Upstash rediss://)
VAPID_PUBLIC_KEY= / VAPID_PRIVATE_KEY= / VAPID_SUBJECT=mailto:admin@…   # api, worker
OPENFEATURE_PROVIDER=posthog / POSTHOG_KEY=           # api, web (flags)
SENTRY_DSN=                                           # api, worker, web
VITE_API_URL=http://localhost:3000                    # web (Eden base)
VITE_LIVEBLOCKS_AUTH_URL=http://localhost:3000/api/liveblocks-auth   # web
VITE_VAPID_PUBLIC_KEY=                                # web (public by design)
VITE_SENTRY_DSN=                                      # web
```
`.env.test` mirrors shape; `DATABASE_URL`→Neon test branch (or compose pg), `REDIS_URL`→throwaway, creds stubbed.

## 8. Test matrix (the meaning of "robust" — v4 verification mandate)
Per module, generated and required green before "done":
1. **Happy path** — every route (create/read/update/archive), typed Eden assertions on the response.
2. **Validation** — malformed body/query → 422/400 (Elysia `t`/Zod).
3. **AuthN** — unauthenticated → 401 on every protected route.
4. **AuthZ / tenancy** — agency A ≠ agency B; client A ≠ client B; **id-guess any endpoint → 404 (not 403)**;
   client cannot read INTERNAL fields; only super-admin crosses tenants (and it audit-logs).
5. **Domain state machine** — deliverable transition T1 (and the seeded default pipeline exists).
6. **Idempotency/edge** — duplicate submit, version-number race backstop (constraint), concurrent transition.
Plus: `packages/core` **pure unit tests** (guard/rbac/visibility/state-machine, no DB); one worker round-trip test
with a fake queue. Runner `bun test`; client Eden in-process (`treaty(app)`); `--coverage` gates `core` + every
`*.routes.ts`.

## 9. CI (`.github/workflows/ci.yml`)
On PR: create a **Neon branch** → `db:migrate` → `turbo run check test build --filter='...[origin/main]'` (affected
only) with **Turborepo remote cache** → delete the branch. Required checks on `main`: `check`, `test`, `build`,
**boundaries**, **migration-dry-run**. Build the 3 Docker images once; **promote the same artifact** (01 §14). Red
= no merge.

## 10. Dockerfiles
- `Dockerfile.api`: `FROM oven/bun:1` → `bun install --frozen-lockfile` → `turbo prune --scope=@rexops/api
  --docker` → build → `CMD ["bun","apps/api/src/index.ts"]`.
- `Dockerfile.worker`: bun debian → `apt-get install -y ffmpeg` → install → CMD worker.
- `Dockerfile.web`: stage1 bun `vite build` → stage2 Caddy serving `/dist` with SPA fallback + hashed-asset cache.
- `docker-compose.yml`: `postgres:16`, `redis:7`, `api`, `worker`, `web`, one-shot `migrate`. Prod swaps pg→Neon,
  redis→Upstash by env only.

## 11. Definition of Done (Block 1 is finished only when ALL are true)
- [ ] `bun run setup` on a clean clone → app running locally in **< 10 minutes**, no manual steps.
- [ ] Login works; each role lands on the correct shell (agency / client / super-admin).
- [ ] Super-admin can provision an agency + owner; agency can create client → project → sub-project → deliverable;
      deliverable transition T1 works. (The §03.11 happy path up to upload/review is reproducible.)
- [ ] **Every endpoint** has happy + validation + authN + **tenancy(id-guess→404)** tests, all green.
- [ ] `packages/core` guard/rbac/visibility/state-machine unit tests green; coverage gate met.
- [ ] Outbox → worker no-op round-trip proven; `/api/liveblocks-auth` returns a correctly room-scoped token.
- [ ] Boundaries lint passes (core imports no framework); one-version policy clean.
- [ ] CI green on a Neon branch; 3 Docker images build; `/healthz` `/readyz` respond.
- [ ] `.env.example` complete and boot-validated; pino logs carry request-id; Sentry wired in all three apps.
- [ ] Full additive schema (02) migrated; canonical demo seed loads; default pipeline seeded.
- [ ] `turbo gen module foo` produces a working, tested, tenant-guarded module.
- [ ] ADRs 0001 (stack) + 0002 (auth/tenancy mapping) written.

## 12. First-week build order (so nothing blocks later)
1. `bun init` workspaces + Turbo + `packages/config` (tsconfig/biome/env schema) → commit `.env.example`.
2. `packages/db`: Drizzle + neon-serverless client + `drizzle.config.ts`; author the **full schema (02)**; first
   migration; seed skeleton. Create the Neon project (note pooled + direct URLs).
3. `packages/auth`: Better Auth + Drizzle adapter + plugins; `cli generate`; migrate.
4. `packages/core`: tenancy guard + rbac + visibility + state-machine + **unit tests** (no DB).
5. `apps/api`: `app.ts` (request-id + error + cors + mount auth + auth-guard) + health + liveblocks-auth + the four
   slice modules + their Eden tests.
6. `apps/web`: Vite + TanStack Router/Query + Eden client + Better Auth client; login + role routing + dashboard
   shells using `@rexops/ui` tokens.
7. `packages/jobs` + `apps/worker`: outbox relay + no-op processor round-trip.
8. `turbo/generators`: the module generator. Dockerfiles + compose + `turbo prune`. CI: Neon branch → migrate →
   affected test + remote cache. Lefthook + commitlint. ADRs.
