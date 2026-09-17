# 01 — Architecture

> The technical spine. The most important section for cross-block coherence is **§12 Seams** — the small set of
> interfaces Block 1 lays down and every later block plugs into. If you change a seam, you change a contract;
> update this doc and the affected blocks.

---

## 1. Stack (locked)

| Layer | Choice | Why here |
|---|---|---|
| Language | **TypeScript** everywhere | One type system across web/api/worker; shared domain + Zod. |
| Server runtime | **Bun** | Elysia-native; fast installs/tests; native WebSocket (helps Neon serverless driver). |
| API framework | **Elysia** | Type-safe; **Eden Treaty** gives tRPC-grade end-to-end types *and* the in-process test client. |
| API↔client types | **Eden Treaty** (`@elysiajs/eden`) | Export the Elysia `App` type → web imports it → every call typed incl. errors. |
| Validation | **Zod** (domain/env) + Elysia `t`/TypeBox (route I/O, feeds OpenAPI) | One canonical shape per entity; don't duplicate by hand. |
| ORM | **Drizzle ORM** | SQL-first, serverless-friendly, no engine/runtime cost; pairs cleanly with Neon + Bun. |
| Database | **Neon Postgres** | Serverless, autoscale, **DB branching** → one throwaway branch per CI run / per PR. |
| DB driver | **`drizzle-orm/neon-serverless`** (WebSocket `Pool`) at runtime | Supports interactive `db.transaction()` (tenant-scoped multi-row writes/approvals). `neon-http` only for any future edge one-shot. |
| Auth | **Better Auth** (+ Drizzle adapter, **organization** plugin, **admin** plugin) | Email/pw + social; org plugin = agency members/invites/roles; admin plugin = Super-Admin + impersonation. |
| Frontend | **Vite + React + TanStack Router** SPA | App is behind auth (no SEO) → static Docker image, clean api/web split. |
| Server state | **TanStack Query** wrapping Eden calls | Caching, mutations, optimistic updates. |
| Tables/forms/dnd | **TanStack Table** + **TanStack Form** + **dnd-kit** | List view, intake/settings forms, board drag. |
| UI | **Tailwind + shadcn/ui + lucide-react**, **cmdk** | Component system; command palette. |
| Realtime | **Liveblocks** (server **auth-endpoint** pattern) | Presence + live updates; server mints room-scoped tokens (tenancy enforced server-side). |
| Object storage | **Cloudflare R2** (S3 SDK v3) | Zero egress; presigned PUT/GET; resumable multi-GB via tus or S3 multipart. |
| Background jobs | **BullMQ + Redis** (Upstash in prod) | Media proxies/thumbnails (ffmpeg/sharp), recurring gen, notify/push fan-out, automation, analytics. |
| Push | **web-push (VAPID)** + service worker + PWA manifest | Browser/PWA notifications. |
| Transactional email | **Resend** | Auth verify / reset / client invites (notification email channel deferred). |
| Monorepo | **Bun workspaces + Turborepo** | One package manager/runtime; task graph + caching. |
| Env validation | **`@t3-oss/env-core` + Zod** | Fail fast at boot on a missing var. |
| Feature flags | **OpenFeature** + provider (PostHog or Unleash OSS) | Decouple deploy from release (Block-gated features). |
| Lint/format | **Biome** (+ ESLint only for boundary plugins) | One fast Rust tool. |
| Git hooks | **Lefthook** | Pre-commit `biome check` + typecheck on changed projects. |
| Observability | **pino** (structured logs) + **Sentry** (web/api/worker) | Request-id correlation; release-tagged errors. |

> The fast-moving pieces (Elysia testing, Better Auth + Drizzle + Elysia, Drizzle + Neon driver) were verified
> against Context7 (2026-06) in `../dashboard/creative-dock-tech-stack-v1.md`. Items still to confirm live in
> code are flagged **[verify]** here and there. Re-verify with Context7 at implementation time.

## 2. Monorepo layout

```
rexops/
├── apps/
│   ├── web/                  # Vite + React + TanStack SPA         → Docker image #1 (static, served by Caddy)
│   ├── api/                  # Elysia (Bun) HTTP API               → Docker image #2
│   │   └── src/
│   │       ├── app.ts        # builds & EXPORTS the Elysia app (NO .listen — importable by tests)
│   │       ├── index.ts      # imports app, .listen(PORT)          ← container entrypoint
│   │       ├── plugins/      # auth-guard, tenant-guard, cors, error, openapi, rate-limit, request-id
│   │       └── modules/      # one Elysia instance per resource (= "1 instance = 1 controller")
│   │           └── <resource>/{<resource>.routes.ts, <resource>.service.ts, <resource>.test.ts}
│   └── worker/               # Bun + BullMQ consumers              → Docker image #3 (ships ffmpeg + libvips/sharp)
│       └── src/processors/   # media, recurring, notify, automation, analytics
├── packages/
│   ├── db/                   # Drizzle schema (split per domain), client, drizzle.config.ts, migrations, seed
│   ├── auth/                 # Better Auth config (one source of truth for session/types)
│   ├── core/                 # framework-agnostic domain logic: tenant guard, RBAC, pipeline engine,
│   │                         #   review state machine, version compare, automation compiler. NO Elysia/React.
│   ├── validators/           # Zod schemas: domain entities + shared request/response DTOs
│   ├── ui/                   # shadcn/ui components + theme tokens (the design system from doc 04)
│   ├── jobs/                 # BullMQ queue defs + typed job payloads (shared by api producers + worker consumers)
│   └── config/               # tsconfig base, biome, eslint-boundaries, env schemas, constants, ENUMS
├── docker/                   # Dockerfile.{api,worker,web} + Caddyfile
├── docs/                     # these documents + adr/ + runbooks/
├── turbo/generators/         # `turbo gen module` templates (the paved road)
├── docker-compose.yml        # local dev: postgres + redis (+ api/worker/web)
├── turbo.json
├── biome.json
├── lefthook.yml
├── package.json              # { "workspaces": ["apps/*","packages/*"] }
├── .env.example              # full contract (§11)
└── tsconfig.json
```

**Why this split.** `apps/api/src/app.ts` exports the built Elysia instance *without* `.listen()` so **tests
import it directly** (Eden in-process, no network). `packages/core` holds domain logic with **no framework
imports** → unit-testable, reused by both `api` and `worker`. `apps/api` exports `export type App = typeof app`
→ `apps/web` does `import type { App } from '@rexops/api'` for Eden Treaty (type-only, zero runtime coupling).

**Dependency direction (enforced — §10):**
`apps/* → packages/{core,validators,db,auth,ui,jobs,config}` · `core → validators,config` ·
`db → config` · nothing imports `apps/*` · no cycles.

## 3. End-to-end type spine

```
Drizzle schema ──infer──▶ row types ──▶ packages/db exports
        │
Zod (packages/validators) ──▶ request/response DTOs ──▶ Elysia route t/zod schemas
        │                                                       │
        └─────────────────────────────────────────────▶ Elysia `App` type ──Eden Treaty──▶ web (typed calls + errors)
```

Rule: **one canonical shape per entity.** Drizzle infers row types; Zod DTOs in `validators` describe what
crosses the wire; Elysia validates with `t`/zod at the edge. Never hand-write a type that duplicates one of
these across the boundary. Generate OpenAPI from Elysia (`@elysiajs/openapi`) only for *external* consumers;
internal stays Eden.

```ts
// apps/api/src/app.ts  (shape)
export const app = new Elysia()
  .use(requestId).use(errorPlugin).use(cors({ origin: env.WEB_URL, credentials: true }))
  .mount(auth.handler)                 // Better Auth owns /api/auth/*
  .use(health)                         // /healthz /readyz
  .use(projects).use(clients).use(deliverables) /* …generated modules… */
export type App = typeof app           // ← Eden Treaty consumes this
```

```ts
// apps/web/src/lib/api.ts
import { treaty } from '@elysiajs/eden'
import type { App } from '@rexops/api'
export const api = treaty<App>(import.meta.env.VITE_API_URL)   // wrapped in TanStack Query at call sites
```

## 4. Tenancy & RBAC — the heart of the system

We implement **Odoo's two-layer security model** ourselves, in `packages/core`, *not* delegated to the
framework. This keeps the agency↔client trust boundary explicit, composable, and unit-testable.

**Layer 1 — Access rights (coarse, model-level CRUD).** Per `(role, resource)`: can this role read/write/
create/delete this kind of thing at all? Additive across a user's roles/permission-flags.

**Layer 2 — Record rules (row-level filters), combined exactly like Odoo:**
- **Global rule (always ANDed, non-bypassable):** `row.agencyId === ctx.agencyId`. Hard tenant isolation.
- **Group/visibility rules (ORed within, then ANDed with global):** `isOwnerOrAdmin OR isAssignedMember OR
  isClientOfRecord`. Project/sub-project membership and client-scoping live here.
- **Field-level visibility:** INTERNAL-only fields/comments/versions are stripped for `CLIENT_*` roles
  (the equivalent of Odoo's field `groups`).
- **Super-Admin** is the *sole* principal exempt from the global rule; every cross-tenant access is **audit-logged**.

```ts
// packages/core/src/tenancy/guard.ts  (shape — the single composable guard)
export type Principal = { userId: string; role: Role; agencyId: string | null;
                          clientId: string | null; permissions: PermissionFlags };

export function scopeAgency<T extends { agencyId: string }>(p: Principal, qb: QueryBuilder<T>) {
  if (p.role === 'SUPER_ADMIN') return qb;                 // exempt — caller must audit-log
  return qb.where(eq(table.agencyId, p.agencyId!));        // global rule, always ANDed
}
export function canSeeInternal(p: Principal) { return p.role.startsWith('AGENCY_') || p.role === 'SUPER_ADMIN'; }
export function visibleVersions(p: Principal, versions: FileVersion[]) {
  return canSeeInternal(p) ? versions : versions.filter(v => v.visibility === 'CLIENT');
}
// services NEVER query without going through scopeAgency + the relevant record rule.
```

**Auth-guard macro (Elysia side)** reads the Better Auth session and builds the `Principal`:

```ts
// apps/api/src/plugins/auth-guard.ts (shape)
export const authGuard = new Elysia({ name: 'auth-guard' }).macro({
  requireUser: () => ({
    async resolve({ request, status }) {
      const s = await auth.api.getSession({ headers: request.headers });
      if (!s) return status(401);
      return { principal: toPrincipal(s.user) };   // role, agencyId, clientId, permissions
    },
  }),
});
// route: .get('/projects', handler, { requireUser: true })
```

> **Test mandate (every endpoint):** id-guessing across tenants returns **404, not 403** (don't reveal
> existence). Client cannot read INTERNAL versions/comments. Only Super-Admin crosses tenants, and it audit-logs.
> See 06 §Test matrix.

## 5. Auth model mapping (resolved decision)

The tech-stack doc left "Agency = org, Client = team?" open. **Resolution:**

- **Agency = a Better Auth `organization`.** Agency staff = org **members** with roles (owner/admin/member) +
  invitations. We reuse the org plugin for staff membership/roles/invites — that's its sweet spot.
- **Client = a first-class domain table** (`clients`), *not* a Better Auth team. Client users are Better Auth
  users carrying `clientId` + a `CLIENT_*` role. They are **not** members of the agency org.
- **Authz/tenancy is enforced by our `core` guard (§4)**, not by org/team membership semantics. Reasoning: the
  client trust boundary is the product's whole point; encoding it in our own record rules (which we test
  exhaustively) is safer than relying on framework team-scoping. It also matches "single-agency dogfood first" —
  Super-Admin/agency provisions clients; no self-serve org creation in v1.
- Carry tenancy on the session via Better Auth `user.additionalFields`: `role`, `specialty`, `agencyId`, `clientId`.
- Generate auth tables into our Drizzle schema with `bunx @better-auth/cli generate`; commit + migrate like any schema.

**[verify]** the exact org-plugin member/role API and `additionalFields` typing against Context7 at implementation.

## 6. Async / jobs — the outbox pattern

Anything not needed to answer the request goes to a job: media proxies/thumbnails, push/notification fan-out,
recurring template generation, automation execution, analytics rollups, email.

- **Transactional outbox.** Domain writes that must trigger side effects write an `outbox` row **in the same DB
  transaction** as the state change. A relay enqueues those into BullMQ. This guarantees "approval recorded ⇒
  notification will fire" without 2-phase commit and survives a crash between DB write and enqueue.
- **Producers** live in `apps/api`; **consumers** in `apps/worker`; **queue + payload types** in `packages/jobs`
  (shared, typed, single source). The worker image ships `ffmpeg` + `libvips/sharp`.
- Jobs are **idempotent** (keyed by event id) and retried with backoff.

```
domain write ──(same tx)──▶ outbox row ──relay──▶ BullMQ queue ──▶ worker processor ──▶ effect (push/email/proxy/…)
```

## 7. Realtime — Liveblocks auth-endpoint pattern

- The SPA calls `POST /api/liveblocks-auth` on our API.
- The API (`@liveblocks/node` + `LIVEBLOCKS_SECRET_KEY`) mints a token **scoped to the rooms the principal may
  access**: `board:<projectId>`, `review:<deliverableId>`, `chat:<channelId>` — tenancy enforced server-side.
- No public Liveblocks key ships to the client. Room names always embed a tenant-checkable id.
- Block 1 ships the endpoint returning a correctly-scoped token (seam proven); Block 4 wires real rooms.

## 8. Storage — R2

- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Presigned **PUT** for uploads, presigned **GET** for
  private media (never serve private media from a public path).
- Multi-GB uploads via **tus** (`@tus/server` + S3 store) or S3 multipart — pick one in Block 2.
- Derived assets (proxies, thumbnails) served from `R2_PUBLIC_BASE_URL` (custom domain).
- Source files (`.prproj/.aep/.blend/.psd`) are `isSource = true` → download-only + a **companion preview render**
  (exported mp4/png) attached to the same version so the client has something to review.

## 9. Notifications

Single pipeline: domain event → outbox → worker writes a `notification` row (in-app) **and** fans out **Web Push**
to the recipient's `push_subscription`s. Routing is by **role + contentType** (a MOTION submission notifies motion
editors + motion lead + head of agency; a STATIC submission notifies designers). Channel-agnostic by design so
email/WhatsApp slot in later. Reminders/escalations (review due in 24h, stage stalled past SLA) are scheduled jobs.

## 10. Module boundaries (enforced mechanically)

- `packages/core` imports **no framework** (no Elysia, no React). CI fails on violation via
  **`eslint-plugin-boundaries`** or **`dependency-cruiser`** (`no-circular` + direction rules from §2).
- **One-version policy** across the workspace via `syncpack`/`manypkg`; Bun strictness blocks phantom deps.
- Result: upgrades stay sane, `core` is portable, the web bundle can't accidentally import a server secret.

## 11. Environment contract

Committed as **`.env.example`**, validated at boot with `@t3-oss/env-core` + Zod (server schema vs `VITE_`
client schema) so a missing/blank var **fails the process on start**. Right column = which image consumes it.
(Full annotated file lives in 06 §Env and in the repo; summary of groups:)

`App/runtime` (NODE_ENV, API_PORT, API_URL, WEB_URL) · `Neon` (DATABASE_URL pooled, DATABASE_URL_UNPOOLED direct)
· `Better Auth` (BETTER_AUTH_SECRET, BETTER_AUTH_URL, optional Google/GitHub) · `Resend` (RESEND_API_KEY,
EMAIL_FROM) · `R2` (ACCOUNT_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET, ENDPOINT, PUBLIC_BASE_URL) ·
`Liveblocks` (LIVEBLOCKS_SECRET_KEY) · `Redis` (REDIS_URL) · `Web Push` (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
VAPID_SUBJECT) · `Flags` (OPENFEATURE/POSTHOG keys) · `Observability` (SENTRY_DSN) · `Vite public`
(VITE_API_URL, VITE_LIVEBLOCKS_AUTH_URL, VITE_VAPID_PUBLIC_KEY, VITE_SENTRY_DSN).

`.env.test` mirrors the shape but points DATABASE_URL → a **Neon test branch** (or compose Postgres) and
REDIS_URL → throwaway Redis; social/Resend creds stubbed. CI creates a Neon branch per run, migrates, tests,
deletes it.

## 12. Seams — the contracts every block plugs into (READ THIS)

Block 1 builds each seam as a working-but-minimal interface. Later blocks fill them **without touching each
other.** This table is the backbone of "all blocks connect perfectly."

| # | Seam | Lives in | Block 1 ships | Filled by |
|---|---|---|---|---|
| S1 | **Tenant guard + RBAC** | `core/tenancy` | Full guard + record rules + field visibility, unit-tested | Used by all |
| S2 | **Module shape + generator** | `turbo/generators`, `api/modules` | `turbo gen module` emits routes+service+tests+schema-stub+web-route | Every feature block |
| S3 | **Job outbox + queue** | `packages/jobs`, `worker` | Outbox table + relay + 1 no-op queue round-trip | B2 media, B4 notify/push, B6 automation, B7 analytics |
| S4 | **Realtime auth endpoint** | `api/modules/liveblocks` | `/api/liveblocks-auth` returns room-scoped token | B4 chat/presence |
| S5 | **Viewer registry** | `web` + `FileVersion.previewUrl` | Interface + "download/unsupported" fallback viewer | B3 per-medium viewers (video/image/pdf/audio) |
| S6 | **Notification + activity pipeline** | `core/notify`, `db` | `notification`, `activity_event`, `push_subscription` tables + write path | B4 fan-out + Web Push + reminders |
| S7 | **Custom-field engine** | `db`, `core/fields` | `custom_field_def` + `custom_field_value` tables (built-ins seeded) | B5 exposes UI; B8 user-defined |
| S8 | **Review-stage engine** | `core/review`, `db` | `review_stage`, `approval` tables + state-machine skeleton (internal→client default) | B3 sequential/parallel + per-medium |
| S9 | **Saved views** | `db`, `web` | `saved_view` table + List/Board scaffolding | B5 four views + persistence |
| S10 | **Automation engine** | `core/automation`, `db` | `rule` table + compiler interface (no executors yet) | B6 triggers/actions + HTTP action |
| S11 | **Intake** | `db` | `intake_form`, `form_field`, `form_submission` tables (request-queue lane) | B6 branching forms + auto-provision |
| S12 | **Share/guest access** | `db`, `core/share` | `share` table + token verification interface | B3 passphrase/expiry/watermark/guest review |
| S13 | **Feature flags** | `config`, `web`+`api` | OpenFeature provider wired; `flag()` helper | Every block gates new surfaces |
| S14 | **Observability** | all apps | pino + request-id + Sentry + `/healthz` `/readyz` | Used by all; B7 dashboards/runbooks |

> **The rule:** a later block may *activate* a table and *fill* a seam, but must not change a seam's signature
> without updating this table + the dependent block docs. Schema is additive (02), so activation is "write the
> module," never "migrate everything."

## 13. Security model (summary; full rules in 03)

- **AuthN:** Better Auth sessions (httpOnly cookies); social optional. Passwords hashed by Better Auth.
- **AuthZ:** the `core` guard on every read/write; no object access by guessing an id (→ 404). Field-level
  stripping of INTERNAL data for client roles.
- **File security:** validate type/size; reject executables; private media only via short-lived presigned GET;
  guest access only through a `share` token (passphrase/expiry honored server-side).
- **Data safety:** **soft-delete / archive everywhere** (never hard-delete clients/projects/versions/reviews);
  full version + review + comment history preserved.
- **Audit:** `audit_log` for sensitive + all cross-tenant actions; structured logs with request-id correlation.
- **Tenancy at the DB:** every domain table carries `agencyId`; consider Postgres RLS as defense-in-depth later
  (app-layer guard is primary in v1).

## 14. Deploy topology

- **web** (static) → Cloudflare Pages (or its own Caddy container). **api** + **worker** → Fly.io as two services
  scaling independently (worker scales on media load without touching api). **db** → Neon. **redis** → Upstash.
- **Build once, promote the same image** dev → staging → prod (config differs only by env). Rollback = re-point to
  the previous image tag. Migrations run as a one-shot `drizzle-kit migrate` step before api boot, never in the
  request path. (Full pipeline in 06 §CI and `../dashboard/creative-dock-repo-conventions.md`.)
